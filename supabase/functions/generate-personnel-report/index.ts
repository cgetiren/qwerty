import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

// Prompt templates
const PROMPT_TEMPLATES = {
  general: `Bu personelin genel performansını kapsamlı şekilde analiz et.

Değerlendirme kriterleri:
- Müşteri memnuniyeti ve iletişim kalitesi
- Yanıt hızı ve problem çözme yeteneği
- Casino sektörüne özgü bilgi ve hassasiyet
- Bonus, ödeme süreçleri konusunda yetkinlik
- Kumar bağımlılığı konusunda etik yaklaşım
- Genel profesyonellik ve tutarlılık

Raporun yapısı:
1. Genel Özet (3-4 cümle)
2. Güçlü Yönler (5-6 madde)
3. Gelişim Alanları (3-4 madde)
4. Öneriler (4-5 madde)
5. Genel Değerlendirme Skoru (1-10)`,

  strengths: `Bu personelin güçlü ve zayıf yönlerini detaylı analiz et.

GÜÇLÜ YÖNLER:
- İletişim becerileri ve empati
- Teknik bilgi ve sistem hakimiyeti
- Problem çözme hızı
- Müşteri memnuniyeti yaratma
- Stres yönetimi
- Takım çalışması

ZAYIF YÖNLER / GELİŞİM ALANLARI:
- İyileştirilebilir alanlar
- Sık yapılan hatalar
- Eğitim ihtiyacı olan konular
- Dikkat edilmesi gereken noktalar

Her kategori için:
- Spesifik örnekler ver
- Veri destekli analiz yap
- Gelişim önerileri sun`,

  customer: `Bu personelin müşteri ilişkileri performansını detaylı analiz et.

MÜŞTERÎ İLETİŞİMİ:
- Empati ve anlayış düzeyi
- Dil kullanımı ve nezaket
- Açıklık ve şeffaflık
- Sabır ve sakinlik (özellikle sinirli müşterilerde)

MÜŞTERÎ MEMNUNİYETİ:
- Sorun çözme başarısı
- İlk yanıt kalitesi
- Takip ve devamlılık
- Müşteri güveni oluşturma

CASINO SEKTÖRÜ ÖZELLİKLERİ:
- Para kaybetmiş müşterilere yaklaşım
- Şikayet yönetimi
- Beklentileri karşılama
- Profesyonel sınırları koruma

Somut örneklerle destekle ve gelişim önerileri sun.`,

  bonus: `Bu personelin bonus ve ödeme süreçlerindeki performansını analiz et.

BONUS SÜREÇLERİ:
- Bonus şartlarını açıklama yeteneği
- ÇEVRİM şartları konusunda netlik
- Bonus uygunluk kontrolü
- Müşteri beklentilerini yönetme

ÖDEME SÜREÇLERİ:
- Para yatırma işlemlerinde rehberlik
- Para çekme taleplerine yaklaşım
- Bekleme sürelerini açıklama
- Teknik sorunları çözme

CRİTİCAL POİNTS:
- Yanlış bilgilendirme riski
- Müşteri güvenini koruma
- Politika uyumu
- Şeffaflık ve dürüstlük

Örneklerle destekle ve eğitim ihtiyaçlarını belirt.`,

  addiction: `Bu personelin kumar bağımlılığı konusundaki hassasiyetini ve yaklaşımını analiz et.

ETİK YAKLAŞIM:
- Risk belirtilerini fark etme
- Sorumlu kumar politikasına uyum
- Hassas durumları yönetme
- Koruyucu önlemler alma

MÜDAHALE BECERİSİ:
- Bağımlılık belirtilerinde farkındalık
- Sınır koyma ve yönlendirme
- Destek kaynaklarını önerme
- Etik sınırları koruma

CRİTİCAL BEHAVİORS:
- Aşırı oyun teşvikinden kaçınma
- Kayıp sonrası müşterilere yaklaşım
- Self-exclusion taleplerini ciddiye alma
- Zarar azaltma stratejileri

Bu alan KRİTİK! Eksiklikler ciddi etik sorunlara yol açabilir.
Somut örneklerle analiz yap ve acil eğitim ihtiyaçlarını belirt.`,
};

Deno.serve(async (req) => {
  console.log("📥 Request:", req.method, req.url);

  if (req.method === "OPTIONS") {
    console.log("✅ CORS preflight");
    return new Response(null, { 
      status: 204,
      headers: corsHeaders 
    });
  }

  console.log("🚀 POST request received");

  try {
    const body = await req.json();
    console.log("📦 Body:", JSON.stringify(body));

    const { personnel_id, brand_id, generated_by, start_date, end_date, prompt_type, custom_prompt } = body;

    // Validate input
    if (!personnel_id || !brand_id || !generated_by || !start_date || !end_date) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("📊 Creating report record...");

    // Create report record
    const { data: report, error: reportError } = await supabase
      .from("personnel_reports")
      .insert({
        personnel_id,
        brand_id,
        generated_by,
        start_date,
        end_date,
        status: "processing",
        progress: 0,
      })
      .select()
      .single();

    if (reportError) {
      console.error("❌ Report creation error:", reportError);
      return new Response(
        JSON.stringify({ error: "Failed to create report: " + reportError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("✅ Report created:", report.id);

    // Start async processing (non-blocking)
    processReport(supabase, report.id, personnel_id, brand_id, start_date, end_date, prompt_type, custom_prompt);

    return new Response(
      JSON.stringify({
        success: true,
        report_id: report.id,
        message: "Report generation started",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("❌ Error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function processReport(
  supabase: any,
  reportId: string,
  personnelId: string,
  brandId: string,
  startDate: string,
  endDate: string,
  promptType: string,
  customPrompt: string | null
) {
  try {
    console.log("🔄 Processing report:", reportId);

    // Update progress: 10%
    await supabase
      .from("personnel_reports")
      .update({ progress: 10 })
      .eq("id", reportId);

    // Get personnel data
    const { data: personnel, error: personnelError } = await supabase
      .from("personnel")
      .select("id, name, email")
      .eq("id", personnelId)
      .single();

    if (personnelError || !personnel) {
      throw new Error("Personnel not found");
    }

    console.log("👤 Personnel:", personnel.name);

    // Update progress: 20%
    await supabase
      .from("personnel_reports")
      .update({ progress: 20 })
      .eq("id", reportId);

    // Get chat history
    const { data: chats, error: chatsError } = await supabase
      .from("chats")
      .select(`
        id,
        chat_id,
        created_at,
        customer_name,
        status,
        analysis:chat_analysis(
          overall_score,
          language_compliance,
          quality_metrics,
          performance_metrics,
          issues_detected,
          positive_aspects,
          recommendations,
          ai_summary
        )
      `)
      .eq("brand_id", brandId)
      .ilike("agent_name", `%${personnel.name}%`)
      .gte("created_at", startDate)
      .lte("created_at", endDate)
      .order("created_at", { ascending: false });

    if (chatsError) {
      throw new Error("Failed to fetch chats: " + chatsError.message);
    }

    console.log("💬 Chats found:", chats?.length || 0);

    // Update progress: 40%
    await supabase
      .from("personnel_reports")
      .update({ progress: 40, total_chats: chats?.length || 0 })
      .eq("id", reportId);

    if (!chats || chats.length === 0) {
      // No chats found
      await supabase
        .from("personnel_reports")
        .update({
          status: "completed",
          progress: 100,
          report_data: {
            message: "Bu dönemde chat kaydı bulunamadı.",
            personnel: personnel.name,
            period: `${startDate} - ${endDate}`,
          },
        })
        .eq("id", reportId);

      return;
    }

    // Prepare data for Claude
    const chatSummaries = chats.map((chat: any) => ({
      chat_id: chat.chat_id,
      date: chat.created_at,
      customer: chat.customer_name,
      status: chat.status,
      analysis: chat.analysis?.[0] || null,
    }));

    // Calculate metrics
    const totalChats = chats.length;
    const analyzedChats = chats.filter((c: any) => c.analysis && c.analysis.length > 0);
    const avgScore = analyzedChats.length > 0
      ? analyzedChats.reduce((sum: number, c: any) => sum + (c.analysis[0]?.overall_score || 0), 0) / analyzedChats.length
      : 0;

    // Update progress: 50%
    await supabase
      .from("personnel_reports")
      .update({ progress: 50 })
      .eq("id", reportId);

    // Get prompt
    const finalPrompt = promptType === "custom" && customPrompt
      ? customPrompt
      : (PROMPT_TEMPLATES[promptType as keyof typeof PROMPT_TEMPLATES] || PROMPT_TEMPLATES.general);

    console.log("🤖 Calling Claude API...");

    // Get Claude API key from brand (same as chat analysis)
    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select("claude_api_key")
      .eq("id", brandId)
      .single();

    if (brandError || !brand?.claude_api_key) {
      throw new Error("Claude API key not configured for this brand");
    }

    const claudeApiKey = brand.claude_api_key;

    const claudeResponse = await fetch("https://jarvis.systemtest.store/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": claudeApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: `Sen bir casino müşteri hizmetleri performans analistisin.

PERSONEL: ${personnel.name}
DÖNEM: ${startDate} - ${endDate}
TOPLAM CHAT: ${totalChats}
ORTALAMA SKOR: ${avgScore.toFixed(1)}/100

CHAT ÖZETLERİ:
${JSON.stringify(chatSummaries, null, 2)}

${finalPrompt}

Lütfen Türkçe olarak detaylı ve yapıcı bir rapor hazırla.`,
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      throw new Error(`Claude API error: ${claudeResponse.status} - ${errorText}`);
    }

    const claudeData = await claudeResponse.json();
    const aiReport = claudeData.content[0].text;

    console.log("✅ AI Report generated");

    // Update progress: 90%
    await supabase
      .from("personnel_reports")
      .update({ progress: 90 })
      .eq("id", reportId);

    // Save final report
    await supabase
      .from("personnel_reports")
      .update({
        status: "completed",
        progress: 100,
        report_data: {
          ai_report: aiReport,
          personnel: personnel.name,
          period: `${startDate} - ${endDate}`,
          prompt_type: promptType,
        },
        metrics: {
          total_chats: totalChats,
          analyzed_chats: analyzedChats.length,
          avg_score: Math.round(avgScore * 10) / 10,
          average_score: Math.round(avgScore * 10) / 10,
          team_avg: 0,
          rank: 0,
          total_agents: 0,
        },
        processing_completed_at: new Date().toISOString(),
      })
      .eq("id", reportId);

    console.log("✅ Report completed:", reportId);

  } catch (error) {
    console.error("❌ Processing error:", error);

    // Update report as failed
    await supabase
      .from("personnel_reports")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Unknown error",
      })
      .eq("id", reportId);
  }
}
