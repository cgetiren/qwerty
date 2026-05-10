export interface Brand {
  id: string;
  name: string;
  slug: string;
  logo_url: string;
  color: string;
  is_active: boolean;
  is_system: boolean;
  is_default: boolean;
  livechat_api_key?: string;
  claude_api_key?: string;
  livechat_url?: string;
  telegram_alert_bot_token?: string;
  telegram_alert_chat_id?: string;
  telegram_callback_bot_token?: string;
  telegram_callback_chat_id?: string;
  telegram_finance_bot_token?: string | null;
  telegram_finance_chat_id?: string | null;
  polling_interval?: number;
  claude_api_key_error?: string | null;
  last_sync_at?: string | null;
  created_at: string;
}

export interface BrandMember {
  id: string;
  brand_id: string;
  user_id: string;
  joined_at: string;
  is_active: boolean;
}

export interface Settings {
  id: string;
  brand_id?: string;
  claude_api_key?: string;
  livechat_api_key?: string;
  telegram_bot_token?: string;
  telegram_chat_id?: string;
  polling_interval?: number;
  created_at: string;
  updated_at: string;
}

export interface Personnel {
  id: string;
  name: string;
  email?: string;
  total_chats: number;
  average_score: number | string;
  warning_count: number;
  recurring_issues_count: number;
  strong_topics: any[];
  weak_topics: any[];
  reliability_tier?: string;
  confidence_level?: number | string;
  adjusted_score?: number | string;
  created_at: string;
  updated_at: string;
}

export interface Chat {
  id: string;
  agent_name: string;
  customer_name: string;
  created_at: string;
  ended_at?: string;
  duration_seconds?: number;
  first_response_time?: number;
  message_count: number;
  chat_data: any;
  status: string;
  analyzed: boolean;
  synced_at: string;
  rating_score?: number | null;
  rating_status?: string | null;
  rating_comment?: string | null;
  has_rating_comment?: boolean | null;
  complaint_flag?: boolean | null;
}

export interface ChatMessage {
  id: string;
  chat_id: string;
  message_id: string;
  author_id: string;
  author_type: string;
  text: string;
  created_at: string;
  is_system: boolean;
}

export interface ChatAnalysis {
  id: string;
  chat_id: string;
  analysis_date: string;
  overall_score: number | string;
  language_compliance: {
    professional_language: number;
    polite_tone: number;
    forbidden_words: string[];
    copy_paste_detected: boolean;
  };
  quality_metrics: {
    answer_relevance: number;
    stalling_detected: boolean;
    unnecessary_length: boolean;
    customer_satisfaction: string;
  };
  performance_metrics: {
    first_response_quality: number;
    solution_focused: number;
    communication_effectiveness: number;
  };
  issues_detected: {
    critical_errors: string[];
    improvement_areas: string[];
    misinformation: string[];
  };
  positive_aspects: {
    strengths: string[];
    good_practices: string[];
  };
  recommendations: string;
  sentiment: string;
  requires_attention: boolean;
  ai_summary: string;
  coaching_suggestion?: string | null;
  is_flagged?: boolean;
  flag_reason?: string | null;
  flag_date?: string | null;
  flag_resolved?: boolean;
  flag_resolution_note?: string | null;
}

export interface Alert {
  id: string;
  chat_id: string;
  analysis_id: string;
  alert_type: string;
  severity: string;
  message: string;
  sent_to_telegram: boolean;
  telegram_message_id?: string;
  created_at: string;
}

export interface PersonnelDailyStats {
  id: string;
  personnel_name: string;
  date: string;
  total_chats: number;
  average_score: number | string;
  total_issues: number;
  average_response_time: number;
  average_resolution_time: number;
}
