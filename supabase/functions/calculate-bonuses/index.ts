import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface BonusRule {
  id: string;
  rule_name: string;
  metric_type: string;
  condition_type: 'greater_than' | 'less_than' | 'between' | 'equals';
  threshold_min: number;
  threshold_max: number | null;
  bonus_amount: number;
  period_type: string;
  is_active: boolean;
}

interface PersonnelMetrics {
  personnel_id: string;
  personnel_name: string;
  total_chats: number;
  avg_score: number;
  avg_satisfaction: number;
  avg_response_time: number;
  positive_chats_count: number;
  negative_chats_count: number;
  neutral_chats_count: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { period_type, period_start, period_end, save_to_db = false, brand_id } = await req.json();

    if (!period_type || !['daily', 'weekly', 'monthly'].includes(period_type)) {
      throw new Error("Invalid period_type. Must be 'daily', 'weekly', or 'monthly'");
    }

    let startStr: string;
    let endStr: string;
    let start: Date;
    let end: Date;

    if (period_start && period_end) {
      startStr = period_start;
      endStr = period_end;
      start = new Date(period_start);
      end = new Date(period_end);
    } else {
      end = new Date();
      start = new Date();

      if (period_type === 'daily') {
        start.setDate(start.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end.setDate(end.getDate() - 1);
        end.setHours(23, 59, 59, 999);
      } else if (period_type === 'weekly') {
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
      } else if (period_type === 'monthly') {
        start.setMonth(start.getMonth() - 1);
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setDate(0);
        end.setHours(23, 59, 59, 999);
      }
      startStr = start.toISOString();
      endStr = end.toISOString();
    }

    let rulesQuery = supabase
      .from('bonus_rules')
      .select('*')
      .eq('is_active', true)
      .eq('period_type', period_type);

    if (brand_id) rulesQuery = rulesQuery.eq('brand_id', brand_id);

    const { data: activeRules, error: rulesError } = await rulesQuery;

    if (rulesError) throw rulesError;

    if (!activeRules || activeRules.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No active bonus rules found for this period type",
          calculations: [],
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    let allPersonnel: any[] = [];
    let from = 0;
    const personnelBatchSize = 1000;

    while (true) {
      let personnelQuery = supabase
        .from('personnel')
        .select('id, name')
        .range(from, from + personnelBatchSize - 1);

      if (brand_id) personnelQuery = personnelQuery.eq('brand_id', brand_id);

      const { data: batch, error: batchError } = await personnelQuery;

      if (batchError) throw batchError;
      if (!batch || batch.length === 0) break;
      allPersonnel = [...allPersonnel, ...batch];
      if (batch.length < personnelBatchSize) break;
      from += personnelBatchSize;
    }

    const calculations = [];

    for (const person of allPersonnel) {
      const metrics = await calculatePersonnelMetrics(
        supabase,
        person.id,
        person.name,
        start,
        end,
        brand_id
      );

      const bonusDetails: any[] = [];
      let totalBonus = 0;

      for (const rule of activeRules as BonusRule[]) {
        const metricValue = getMetricValue(metrics, rule.metric_type);
        const qualifies = checkRuleCondition(
          metricValue,
          rule.condition_type,
          rule.threshold_min,
          rule.threshold_max,
          rule.metric_type,
          metrics.total_chats
        );

        if (qualifies) {
          bonusDetails.push({
            rule_id: rule.id,
            rule_name: rule.rule_name,
            metric_type: rule.metric_type,
            metric_value: metricValue,
            bonus_amount: rule.bonus_amount,
          });
          totalBonus += rule.bonus_amount;
        }
      }

      const upsertData: any = {
        personnel_id: person.id,
        period_type,
        period_start: startStr,
        period_end: endStr,
        total_bonus_amount: totalBonus,
        calculation_details: bonusDetails,
        metrics_snapshot: metrics,
        calculated_at: new Date().toISOString(),
      };

      if (brand_id) upsertData.brand_id = brand_id;

      const { data: calculation, error: calcError } = await supabase
        .from('bonus_calculations')
        .upsert(upsertData, {
          onConflict: 'personnel_id,period_type,period_start,period_end',
        })
        .select()
        .single();

      if (!calcError && calculation) {
        calculations.push({
          personnel_id: person.id,
          personnel_name: person.name,
          total_bonus: totalBonus,
          rules_applied: bonusDetails.length,
          metrics: metrics,
          details: bonusDetails,
        });

        if (save_to_db) {
          const recordData: any = {
            personnel_id: person.id,
            personnel_name: person.name,
            period_type,
            period_start: startStr,
            period_end: endStr,
            total_bonus_amount: totalBonus,
            calculation_details: bonusDetails,
            metrics_snapshot: metrics,
            saved_at: new Date().toISOString(),
          };

          if (brand_id) recordData.brand_id = brand_id;

          await supabase
            .from('bonus_records')
            .upsert(recordData, {
              onConflict: 'personnel_id,period_type,period_start,period_end',
            });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        period_type,
        period_start: startStr,
        period_end: endStr,
        calculations,
        total_bonuses: calculations.reduce((sum, c) => sum + c.total_bonus, 0),
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Bonus calculation error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});

async function calculatePersonnelMetrics(
  supabase: any,
  personnelId: string,
  personnelName: string,
  start: Date,
  end: Date,
  brandId?: string
): Promise<PersonnelMetrics> {
  // Step 1: Get ALL chats (not just analyzed ones) for accurate total_chats
  let allChats: any[] = [];
  let from = 0;
  const chatBatchSize = 1000;

  while (true) {
    let chatQuery = supabase
      .from('chats')
      .select('id, agent_name, created_at, first_response_time, rating_score')
      .eq('agent_name', personnelName)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .range(from, from + chatBatchSize - 1);

    if (brandId) chatQuery = chatQuery.eq('brand_id', brandId);

    const { data: batch } = await chatQuery;

    if (!batch || batch.length === 0) break;
    allChats = [...allChats, ...batch];
    if (batch.length < chatBatchSize) break;
    from += chatBatchSize;
  }

  const totalChats = allChats.length;

  // Step 2: Get analysis data separately via LEFT-style approach
  const chatIds = allChats.map((c: any) => c.id);
  let allAnalysis: any[] = [];

  for (let i = 0; i < chatIds.length; i += chatBatchSize) {
    const batchIds = chatIds.slice(i, i + chatBatchSize);
    const { data: analysisBatch } = await supabase
      .from('chat_analysis')
      .select('chat_id, overall_score, sentiment')
      .in('chat_id', batchIds);
    if (analysisBatch) allAnalysis = [...allAnalysis, ...analysisBatch];
  }

  const analysisMap = new Map(allAnalysis.map((a: any) => [a.chat_id, a]));

  let totalScore = 0;
  let totalResponseTime = 0;
  let totalRatingScore = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;
  let validScores = 0;
  let validResponseTime = 0;
  let validRatings = 0;

  for (const chat of allChats) {
    if (chat.first_response_time != null && chat.first_response_time > 0) {
      totalResponseTime += Number(chat.first_response_time);
      validResponseTime++;
    }

    // Real customer satisfaction from rating_score (1-5 scale)
    if (chat.rating_score != null && chat.rating_score > 0) {
      totalRatingScore += Number(chat.rating_score);
      validRatings++;
    }

    const analysis = analysisMap.get(chat.id);
    if (!analysis) continue;

    if (analysis.overall_score != null && analysis.overall_score > 0) {
      totalScore += Number(analysis.overall_score);
      validScores++;
    }

    const sentiment = analysis.sentiment;
    if (sentiment === 'positive') positiveCount++;
    else if (sentiment === 'negative') negativeCount++;
    else if (sentiment === 'neutral') neutralCount++;
  }

  // avg_satisfaction: real customer rating (1-5 scale), not sentiment percentage
  const avgSatisfaction = validRatings > 0
    ? totalRatingScore / validRatings
    : 0;

  return {
    personnel_id: personnelId,
    personnel_name: personnelName,
    total_chats: totalChats,
    avg_score: validScores > 0 ? totalScore / validScores : 0,
    avg_satisfaction: avgSatisfaction,
    avg_response_time: validResponseTime > 0 ? totalResponseTime / validResponseTime : 0,
    positive_chats_count: positiveCount,
    negative_chats_count: negativeCount,
    neutral_chats_count: neutralCount,
  };
}

function getMetricValue(metrics: PersonnelMetrics, metricType: string): number {
  switch (metricType) {
    case 'total_chats':
      return metrics.total_chats;
    case 'avg_score':
      return metrics.avg_score;
    case 'avg_satisfaction':
      return metrics.avg_satisfaction;
    case 'avg_response_time':
      return metrics.avg_response_time;
    case 'positive_chats_count':
      return metrics.positive_chats_count;
    case 'negative_chats_count':
      return metrics.negative_chats_count;
    case 'neutral_chats_count':
      return metrics.neutral_chats_count;
    default:
      return 0;
  }
}

const BONUS_MIN_CHATS = 20;

function checkRuleCondition(
  value: number,
  condition: string,
  thresholdMin: number,
  thresholdMax: number | null,
  metricType: string,
  totalChats: number
): boolean {
  // Minimum chat threshold - personnel with too few chats don't qualify
  if (totalChats < BONUS_MIN_CHATS) {
    return false;
  }

  const averageMetrics = ['avg_response_time', 'avg_score', 'avg_satisfaction'];
  if (averageMetrics.includes(metricType) && value === 0) {
    return false;
  }

  switch (condition) {
    case 'greater_than':
      return value > thresholdMin;
    case 'less_than':
      return value < thresholdMin;
    case 'equals':
      return Math.abs(value - thresholdMin) < 0.01;
    case 'between':
      return thresholdMax !== null && value >= thresholdMin && value <= thresholdMax;
    default:
      return false;
  }
}
