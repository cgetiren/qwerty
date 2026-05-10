import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Message {
  author_type: string;
  text: string;
  created_at: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    console.log("=== Starting analyze-chat function ===");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check if this is a single chat reanalysis with objection context
    let requestBody: { chatId?: string; flagReason?: string } = {};
    try {
      const bodyText = await req.text();
      if (bodyText) requestBody = JSON.parse(bodyText);
    } catch { /* no body or invalid JSON - batch mode */ }

    const singleChatId = requestBody.chatId || null;
    const flagReason = requestBody.flagReason || null;

    if (singleChatId) {
      console.log("Single chat reanalysis mode: " + singleChatId);
      if (flagReason) console.log("Objection context: " + flagReason);
    }

    await supabase.from("system_config").update({ last_analyze_run: new Date().toISOString() }).eq("id", 1);

    const runStartTime = Date.now();
    const runDetails: Array<{ chat_id: string; agent: string; brand_id: string; score: number; sentiment: string; topic: string; model: string; sonnet_upgrade: boolean }> = [];

    console.log("Fetching brands with claude_api_key...");
    const { data: brandsWithKeys, error: brandsError } = await supabase
      .from("brands")
      .select("id, claude_api_key")
      .not("claude_api_key", "is", null)
      .eq("is_active", true);

    if (brandsError) {
      console.error("Brands error:", brandsError);
      throw new Error(`Brands error: ${brandsError.message}`);
    }

    const claudeKeyByBrand = new Map<string, string>();
    for (const brand of brandsWithKeys ?? []) {
      if (brand.claude_api_key) {
        claudeKeyByBrand.set(brand.id, brand.claude_api_key);
      }
    }

    if (claudeKeyByBrand.size === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Hicbir markada Claude API key yapilandirilmamis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Found " + claudeKeyByBrand.size + " brands with Claude API keys");

    let unanalyzedChats: any[] = [];

    if (singleChatId) {
      // Single chat mode: fetch the specific chat directly
      const { data: singleChat, error: singleError } = await supabase
        .from("chats")
        .select("id, agent_name, customer_name, created_at, brand_id, first_response_time")
        .eq("id", singleChatId)
        .maybeSingle();

      if (singleError || !singleChat) {
        return new Response(
          JSON.stringify({ success: false, error: "Chat not found: " + singleChatId }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      unanalyzedChats = [singleChat];
      console.log("Loaded single chat for reanalysis: " + singleChatId);
    } else {
      // Batch mode: claim unanalyzed chats
      console.log("Claiming unanalyzed chats (atomic)...");
      const { data, error: chatsError } = await supabase
        .rpc("claim_unanalyzed_chats", { p_limit: 5 });

      console.log("Claimed chats: " + (data?.length || 0));
      if (chatsError) {
        console.error("Error fetching chats:", chatsError);
        throw new Error("Database error: " + chatsError.message);
      }

      if (!data || data.length === 0) {
        return new Response(
          JSON.stringify({ success: true, message: "No chats to analyze", analyzed: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      unanalyzedChats = data;
    }

    let analyzedCount = 0;
    let alertsCreated = 0;
    const errors: string[] = [];
    const depletedBrandIds = new Set<string>();
    const clearedErrorBrandIds = new Set<string>();

    console.log("Starting to process " + unanalyzedChats.length + " chats");

    for (const chat of unanalyzedChats) {
      console.log(`\n=== Analyzing chat ${chat.id} ===`);
      console.log(`Agent: ${chat.agent_name}, Customer: ${chat.customer_name}, Brand: ${chat.brand_id}`);

      const claudeApiKey = chat.brand_id ? claudeKeyByBrand.get(chat.brand_id) : null;

      if (!claudeApiKey) {
        console.log(`Skipping chat ${chat.id}: no Claude API key for brand ${chat.brand_id}`);
        errors.push(`${chat.id}: No Claude API key for brand ${chat.brand_id}`);
        continue;
      }

      if (chat.brand_id && depletedBrandIds.has(chat.brand_id)) {
        console.log(`Skipping chat ${chat.id}: brand ${chat.brand_id} has depleted Claude credits this run`);
        continue;
      }

      try {
        const { data: existingAnalysis } = await supabase
          .from("chat_analysis")
          .select("id")
          .eq("chat_id", chat.id)
          .maybeSingle();

        if (existingAnalysis) {
          await supabase.from("chat_analysis").delete().eq("chat_id", chat.id);
          console.log(`Chat ${chat.id} had existing analysis, deleted to reanalyze`);
        }

        const { data: messages, error: msgError } = await supabase
          .from("chat_messages")
          .select("*")
          .eq("chat_id", chat.id)
          .eq("is_system", false)
          .order("created_at", { ascending: true });

        console.log(`Messages found: ${messages?.length || 0}`);
        if (msgError) {
          console.error("Error fetching messages:", msgError);
          throw msgError;
        }

        if (!messages || messages.length === 0) {
          console.log("No messages, marking as analyzed");
          await supabase.from("chats").update({ analyzed: true }).eq("id", chat.id);
          continue;
        }

        let firstResponseTime = null;
        let avgResponseTime = null;
        const responseTimes: number[] = [];

        for (let i = 0; i < messages.length - 1; i++) {
          const currentMsg = messages[i];
          const nextMsg = messages[i + 1];

          if (currentMsg.author_type === "customer" && nextMsg.author_type === "agent") {
            const responseTime = new Date(nextMsg.created_at).getTime() - new Date(currentMsg.created_at).getTime();
            const responseSeconds = Math.round(responseTime / 1000);
            responseTimes.push(responseSeconds);

            if (firstResponseTime === null) {
              firstResponseTime = responseSeconds;
            }
          }
        }

        if (responseTimes.length > 0) {
          avgResponseTime = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
        }

        const MAX_MESSAGES = 50;
        const trimmedMessages = messages.length > MAX_MESSAGES
          ? messages.slice(-MAX_MESSAGES)
          : messages;

        const conversationText = trimmedMessages
          .map((m: Message) => `${m.author_type === "agent" ? "Temsilci" : "Müşteri"}: ${m.text}`)
          .join("\n")
          .substring(0, 12000);

        console.log(`Conversation text length: ${conversationText.length}`);
        console.log("Calling Claude API...");

        const analysisPrompt = `Aşağıdaki müşteri hizmetleri sohbetini titizlikle analiz et ve JSON formatında yanıt ver.

🎰 SEKTÖR BAĞLAMI: Bu bir CASINO/BAHİS SİTESİ canlı destek sohbetidir.
Müşteriler: Para kaybetmiş (çok sinirli), para yatırımı gecikmede (panik+öfke), bahis kaçırıyor (sabirsız), kumar bağımlılığı riski (hassas durum).

SOHBET:
${conversationText}

Temsilci: ${chat.agent_name}
Müşteri: ${chat.customer_name}
İlk Yanıt Süresi: ${firstResponseTime !== null ? firstResponseTime + ' saniye' : 'Hesaplanamadı'}
Ortalama Yanıt Süresi: ${avgResponseTime !== null ? avgResponseTime + ' saniye' : 'Hesaplanamadı'}

━━━ 🚨 KRİTİK KURALLAR (ASLA İHLAL EDİLMEZ) ━━━

■1️⃣ MÜŞTERİ KÜFÜR/HAKARET - MUTLAK KURAL:
Müşteri küfür/hakaret kullanmışsa → TEMSİLCİNİN DİL PUANINI HİÇ ETKİLEMEZ!
• Sadece temsilcinin nasıl karşılık verdiğini değerlendir
• Temsilci sakin/kibar kaldıysa → professional_language: 95-100, polite_tone: 95-100
• Örnek: Müşteri "ananızı sikeyim" + Temsilci "anlayışınızı rica ederim" → DİL PUANLARI: 100
• improvement_areas'a yaz: "Müşteri saldırgan dil kullandı, temsilci sakin kaldı"

■2️⃣ BEKLEME SÜRELERİ - CASINO SEKTÖRÜ TOLERANSI:
💰 PARA YATIRMA/ÇEKME (Finans onayı gerekir - 20-40 dk NORMAL!):
• 0-20 dk: Normal (oyalama DEĞİL!) | Penalty: 0
• 20-40 dk: Kabul edilebilir (finans kontrol) | Penalty: -5
• 40-60 dk: Uzun (ama çözüldüyse tolere edilir) | Penalty: -10
• 60+ dk: Çok uzun | Penalty: -15

🎮 OYUN HATASI/REPLAY (Sağlayıcı replay gerekir - 15-30 dk normal!):
• 0-15 dk: Hızlı | Penalty: 0
• 15-30 dk: Normal (sağlayıcı replay) | Penalty: -3
• 30-45 dk: Uzun | Penalty: -8
• 45+ dk: Çok uzun | Penalty: -12

🎁 BONUS/BİLGİ (Agent yetkisi var - hızlı olmalı!):
• 0-5 dk: Normal | Penalty: 0
• 5-10 dk: Yavaş | Penalty: -5
• 10+ dk: Çok yavaş | Penalty: -10

■3️⃣ ÇÖZÜM SONUCU = EN ÖNEMLİ FAKTÖR (%38 AĞIRLIK!):
✅ TAM ÇÖZÜM (para yüklendi/oyun hatası düzeltildi/bonus yüklendi):
   → MİNİMUM PUAN: 65 (süreç kötü olsa bile!)
   → Süreç iyiyse: 75-90 puan
⚠️ KISMI ÇÖZÜM (bilgi verildi/takip açıldı):
   → MİNİMUM PUAN: 45
❌ ÇÖZÜMSÜZ (müşteri cevapsız/sorun çözülmedi/agent kayıp):
   → PUAN: 0-30 arası

■4️⃣ STANDART YANITLAR NORMAL:
Casino destek standart yanıtlar kullanır - bu NORMAL!
• "Hemen kontrol ediyorum ⏳", "Kısa süre beklemenizi rica ederim", "Bakiyeniz hesabınıza aktarıldı ✅"
• Bu mesajları copy_paste olarak işaretleme!
• İSTİSNA: Aynı mesaj 10+ kez tekrar → copy_paste_detected: true

━━━ 💎 CASINO-SPESİFİK DEĞERLENDİRME ━━━

🎁 BONUS ŞARTLARI DOĞRULUĞU (EN KRİTİK!):
Bonus şartları YANLIŞ verilirse müşteri MAĞDUR olur!
• Kontrol edilmesi gerekenler: Çevrim şartı (20x/30x), Geçerli oyunlar (slot/tümü/live hariç), Max bahis limiti, Geçerlilik süresi
• Çevrim yanlış (20x yerine 30x) → misinformation + Penalty: -25 (EN KRİTİK!)
• Geçerli oyunlar yanlış ("tüm oyunlar" ama sadece slot) → Penalty: -20
• Max bahis yanlış → Penalty: -15
• Geçerlilik süresi yanlış → Penalty: -12
• Eksik bilgi (çevrim söyledi ama max bahis söylemedi) → Penalty: -8
• BONUS: Tüm şartları eksiksiz açıklama → +10 puan
• BONUS: Proaktif uyarı ("Max bahis 50 TL, dikkat edin") → +5 puan

💳 ÖDEME YÖNTEMİ BİLGİSİ DOĞRULUĞU:
Doğru bilgiler (süre yanlış bildirilirse müşteri panikler!):
• Papara/MaksiPara: Anında (0-5 dk)
• Havale (EFT): 1-3 saat (banka çalışma saati)
• Kripto (BTC/ETH/USDT): 15-60 dk (network confirmation)
• Para çekme (withdrawal): 24-48 saat (güvenlik kontrolü)

Yanlış bilgi penaltyleri:
• "Havale anında" (DOĞRUSU: 1-3 saat) → Penalty: -12
• "Kripto anında" (DOĞRUSU: 15-60 dk) → Penalty: -10
• "Çekim anında" (DOĞRUSU: 24-48 saat) → Penalty: -15
• BONUS: İşlem süresi + sebep açıklama ("örn: Havale 1-3 saat sürer çünkü banka onayı gerekir") → +5 puan

🎮 OYUN HATASI YÖNETİMİ (En hassas konu!):
DOĞRU PROSEDÜR:
✅ Oyun ID / Session ID sor
✅ Ekran görüntüsü / Replay linki iste
✅ "Sağlayıcıdan kontrol edilecek" bilgisi ver
✅ Bekleme süresi belirt (15-30 dk)
✅ Müşteriye empati göster

YANLIŞ YAKLAŞIMLAR:
❌ "Oyunda hata olmaz" → Penalty: -20 (müşteriyi yok sayma)
❌ "Bu sizin internetinizden" → Penalty: -15 (kanıtsız suçlama)
❌ "Bir şey yapamayız" → Penalty: -12 (çözüm odaklı değil)
❌ Session ID sormadan reddetme → Penalty: -18 (araştırma yapmadan kapatma)
❌ "Sağlayıcı hata yapmaz" → Penalty: -15 (müşteriye inanmama)

BONUS:
• Proaktif replay kontrol teklifi → +8 puan
• "Haklısınız, kontrol ediyorum" empati → +5 puan
• "15-30 dakika sürer" süre bildirimi → +3 puan

🚨 HASSAS KONU YÖNETİMİ:

1️⃣ KUMAR BAĞIMLILIĞI / HESAP KAPATMA (ETİK KRİTİK!):
Müşteri sinyalleri: "Artık oynamak istemiyorum", "Hesabımı kapatın", "Çok para kaybettim, bırakıyorum", "Kendimi kontrol edemiyorum"

DOĞRU YAKLAŞIM:
✅ Hemen "Sorumlu Oyun" politikası sun
✅ Self-exclusion seçenekleri sun (30 gün, 90 gün, kalıcı)
✅ Limit koyma seçeneği öner (günlük/haftalık)
✅ Kumar Bağımlılığı Hattı bilgisi ver (varsa)
❌ ASLA BONUS TEKLİF ETME!

YANLIŞ YAKLAŞIMLAR:
❌ "Bonus vereyim kalsın" → Penalty: -30 (ETİK İHLAL! Kumar bağımlılığı sömürüsü)
❌ "Biraz daha oynayın" → Penalty: -25 (Bağımlılığı teşvik)
❌ Sorumlu oyun bilgisi vermeden kapatma → Penalty: -15 (Yasal gereklilik ihlali)
❌ "Neden kapatmak istiyorsunuz?" sorgusu → Penalty: -10 (Müşteriyi rahatsız etme)

BONUS:
• Hemen sorumlu oyun seçenekleri sunma → +15 puan
• Kumar Bağımlılığı Hattı bilgisi verme → +10 puan
• "Kararınıza saygı duyuyorum" empati → +5 puan

2️⃣ 18 YAŞ ALTI ŞÜPHESİ:
Şüphe sinyalleri: Çok genç profil fotoğrafı, "Babamın kartıyla yatırdım", "18 yaşından küçüğüm, olur mu?"

DOĞRU YAKLAŞIM:
✅ Hemen KYC doğrulama talep et
✅ "18 yaş altı oyun yasaktır" bilgisi ver
✅ Kimlik belgesi iste
✅ Hesabı geçici dondur (gerekirse)

YANLIŞ:
❌ KYC talep etmeden devam → Penalty: -25
❌ "Yaş önemli değil" → Penalty: -30 (yasal ihlal!)
❌ Görmezden gelme → Penalty: -20

3️⃣ DOLANDIRICILIK İDDİASI:
Müşteri sinyalleri: "Siz beni dolandırdınız!", "Oyunlar hileli!", "RTP yalan!"

DOĞRU YAKLAŞIM:
✅ Sakin kal, savunmaya geçme
✅ "Oyun loglarını inceleyelim" öner
✅ Sağlayıcı lisans bilgisi ver (varsa)
✅ "RTP %96 sertifikalı" gibi objektif bilgi ver

YANLIŞ:
❌ "Siz kaybettiniz, normal" → Penalty: -18 (empatisiz)
❌ "Dolandırıcılık yok" (kanıtsız) → Penalty: -12
❌ Saldırgan yanıt → Penalty: -25

BONUS:
• Oyun loglarını proaktif kontrol → +10 puan
• Lisans/sertifika bilgisi sunma → +8 puan
• Empati + objektif açıklama → +5 puan

━━━ 📊 PUAN STANDARTLARI ━━━


🎯 PUAN STANDARTLARI:
• 90-100: Gerçek mükemmellik (sorun tamamen çözüldü + proaktif + hatasız + üstün iletişim)
• 75-89: İyi performans (küçük eksikler var)
• 55-74: Ortalama (belirgin eksikler, gelişim gerekir)
• 30-54: Zayıf (ciddi sorunlar)
• 0-29: Yetersiz (temel standartların altında)


━━━ 📋 DEĞERLENDİRME KRİTERLERİ ━━━

1️⃣ DİL VE ÜSLUP (YALNIZCA TEMSİLCİ MESAJLARI):
• Profesyonel dil kullanımı (0-100): Resmi ve uygun dil. 90+ için son derece düzün standart dil şart.
• Saygılı ve kibar üslup (0-100): Müşteriye saygılı davranma. 90+ için sıcak, empatik, tam kibar olmalı.
• Yasaklı/uygunsuz kelime: YALNIZCA TEMSİLCİNİN kullandığı yasaklı kelimeler
• Kopyala-yapıştır tespit (var/yok): YALNIZCA TEMSİLCİ mesajları için (10+ tekrar varsa true)

2️⃣ CHAT KALİTESİ:
• Soruya gerçek cevap verildi mi? (0-100): Müşteri sorusunun doğrudan/eksiksiz cevaplanması. 90+ için soru tam/net yanıtlanmış olmalı.
• Oyalama/geçiştirme tespit (var/yok): Sadece çözümsüz chat'lerde işaretlenmeli
• Gereksiz uzatma veya kısa kesme (var/yok)
• Müşteri memnuniyeti (positive/neutral/negative): Sohbet sonunda müşterinin durumu

3️⃣ PERFORMANS METRİKLERİ:
• İlk yanıt kalitesi (0-100): Karşılama ve yönlendirme. 90+ için karşılama sıcak, yönlendirme net/hızlı.
• Çözüm odaklılık (0-100): Sorun çözümüne odaklanma. 90+ için aktif çözüm üretmiş olmalı.
• İletişim etkinliği (0-100): Genel iletişim kalitesi. 90+ için akıcı, anlaşılır, tutarlı iletişim.

4️⃣ ÇÖZÜM BAŞARISI:
• Sorun gerçekten çözüldü mü? (tam/kısmi/çözümsüz):
  - "tam": Sorun tamamen çözüldü, müşteri tatmin
  - "kısmi": Kısmi ilerleme ama tam çözüm yok
  - "çözümsüz": Sorun çözülmeden kapandı

5️⃣ TESPİT EDİLEN SORUNLAR (Somut kanıt zorunlu!):
• Kritik hatalar: Her hata için hangi mesajda ne söylendi/yapılmadı açıkça belirt. Kanıtsız madde ekleme.
• Geliştirilmesi gereken alanlar: Spesifik örnek ver. Genel ifadeler ("daha iyi iletişim") değil, somut gözlem.
• Eksik bilgi/yanlış yönlendirme (misinformation): Sohbet metninde gerçek bir çelişki/hatalı bilgi kanıtlanabiliyorsa ekle. Tahmin/yorum ekleme.
  - BONUS/ÖDEME SÜRELERİ/OYUN HATASI için yukarıdaki penalty kurallarını uygula!

6️⃣ POZİTİF YÖNLER:
• İyi yapılan şeyler
• Güçlü yönler

7️⃣ SOHBET KONUSU TESPİTİ:
Müşterinin asıl konusunu kısa/öz Türkçe ile belirt (max 5-6 kelime).
Örnekler: "Para yatırma gecikmesi", "Para çekim talebi", "Bonus talebi", "Oyun hatası şikayeti", "Hesap doğrulama", "Genel bilgi".
Müşterinin şikayeti/isteğini yaz, temsilci performansını değil.

⚠️ ÖNEMLİ: "overall_score" alanını JSON'a EKLEME! Sistem tarafından otomatik hesaplanacak.

JSON formatı (sadece bu alanları döndür):
{
  "chat_topic": "Müşterinin asıl konusu",
  "language_compliance": {
    "professional_language": 0-100,
    "polite_tone": 0-100,
    "forbidden_words": [],
    "copy_paste_detected": false
  },
  "quality_metrics": {
    "answer_relevance": 0-100,
    "stalling_detected": false,
    "unnecessary_length": false,
    "customer_satisfaction": "positive|neutral|negative"
  },
  "performance_metrics": {
    "first_response_quality": 0-100,
    "solution_focused": 0-100,
    "communication_effectiveness": 0-100
  },
  "solution_achieved": "tam|kısmi|çözümsüz",
  "issues_detected": {
    "critical_errors": [],
    "improvement_areas": [],
    "misinformation": []
  },
  "positive_aspects": {
    "strengths": [],
    "good_practices": []
  },
  "recommendations": "Detaylı öneriler",
  "sentiment": "positive|neutral|negative",
  "requires_attention": true|false,
  "ai_summary": "Kısa özet"
}`;

        // If there's an objection context from a previous analysis, add it to the prompt
        let finalPrompt = analysisPrompt;
        const isObjection = !!(singleChatId && flagReason);
        if (isObjection) {
          finalPrompt += "\n\n⚠️ ÖNCEKİ ANALİZ İTİRAZI:\nBu sohbet daha önce analiz edildi ancak sonuç itiraz edildi. Yöneticinin itiraz gerekçesi:\n\"" + flagReason + "\"\n\nBu geri bildirimi dikkate alarak sohbeti TEKRAR ve DAHA DİKKATLİ analiz et. İtiraz gerekçesindeki noktaları özellikle değerlendir. Eğer itiraz haklıysa puanlamayı buna göre düzelt. Eğer orijinal analiz doğruysa, nedenini açıkla.";
        }

        // RAG: Get relevant past objections for learning context
        let ragContext = '';
        try {
          console.log('RAG: Fetching context for chat ' + chat.id + ' (brand: ' + chat.brand_id + ')');
          const supabaseUrl = Deno.env.get('SUPABASE_URL');
          const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRscGd1d2l5bWNjanhmeXBjcGtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODEyNjAsImV4cCI6MjA4Njg1NzI2MH0.tmP1cbQ3_SQFXpFqE5XWYlEfPdEBaBKaR-_SfD7B-J4';
          const contextResponse = await fetch(
            supabaseUrl + '/functions/v1/get-objection-context',
            {
              method: 'POST',
              headers: {
                'Authorization': 'Bearer ' + anonKey,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                chatSummary: conversationText.substring(0, 500), // First 500 chars for context
                brandId: chat.brand_id,
              }),
            }
          );

          console.log('RAG: Response status: ' + contextResponse.status);
          
          if (contextResponse.ok) {
            const contextData = await contextResponse.json();
            console.log('RAG: Response data: ' + JSON.stringify(contextData).substring(0, 200));
            const { context } = contextData;
            
            if (context && context.length > 0) {
              ragContext = '\n\n📚 GEÇMİŞ İTİRAZ DERSLERİ (RAG Sistemi):\n';
              ragContext += 'Daha önce benzer durumlarda yapılan hatalar ve düzeltmeler:\n\n';
              
              context.forEach((obj: any) => {
                ragContext += obj.index + '. HATA: "' + obj.reason + '"\n';
                ragContext += '   • Yanlış puan: ' + obj.scoreBefore + ' → Doğru puan: ' + obj.scoreAfter + '\n';
                if (obj.correction) {
                  ragContext += '   • Düzeltme: ' + obj.correction + '\n';
                }
                ragContext += '   • Önem: ' + obj.severity + '\n';
                ragContext += '   • Benzerlik: %' + obj.similarity + '\n\n';
              });
              
              ragContext += '⚠️ Bu örnekleri dikkate alarak AYNI HATALARI YAPMA! Benzer durumlarda doğru puanlama yap.\n';
              
              console.log('RAG: Found ' + context.length + ' relevant past objections for context');
            } else {
              console.log('RAG: No similar objections found (context empty or null)');
            }
          } else {
            const errorText = await contextResponse.text();
            console.error('RAG: HTTP error ' + contextResponse.status + ': ' + errorText.substring(0, 200));
          }
        } catch (ragErr) {
          console.error('RAG context failed (non-fatal):', ragErr);
          // RAG failure shouldn't block analysis
        }

        // Add RAG context to prompt
        finalPrompt += ragContext;

        // Model stratejisi:
        // - Normal batch analiz → Haiku (hızlı, ucuz, yeterli)
        // - Objection (itiraz) → Sonnet (yönetici itiraz etti, doğruluk kritik)
        // - Score < 30 → Sonnet ile tekrar analiz (gerçekten kritik chatler, ~%1)
        const useModel = isObjection
          ? "claude-sonnet-4-20250514"
          : "claude-haiku-4-5-20251001";

        console.log("Using model: " + useModel + (isObjection ? " (objection mode)" : " (batch mode)"));

        const claudeRequestBody = JSON.stringify({
          model: useModel,
          max_tokens: 4096,
          temperature: 0.2,
          system: "Sen deneyimli bir müşteri hizmetleri kalite kontrol uzmanısın. Türkçe sohbetleri titizlikle analiz eder ve JSON formatında detaylı rapor verirsin. Puanlama yaparken adil ve tutarlı standartlar uygularsın. Müşterinin davranışını temsilciye yükleme — sadece temsilcinin performansını değerlendir. Sadece geçerli JSON döndür, başka bir şey yazma.",
          messages: [{ role: "user", content: finalPrompt }],
        });

        let claudeResponse: Response | null = null;
        let claudeError = "";
        const maxRetries = 3;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          if (attempt > 0) {
            const delay = attempt * 5000;
            console.log(`Claude overloaded, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          claudeResponse = await fetch("https://jarvis.systemtest.store/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": claudeApiKey,
              "anthropic-version": "2023-06-01",
            },
            body: claudeRequestBody,
          });
          if (claudeResponse.ok || claudeResponse.status !== 529) break;
          claudeError = await claudeResponse.text();
          console.error(`Claude attempt ${attempt + 1} failed with 529:`, claudeError.substring(0, 200));
        }

        if (!claudeResponse || !claudeResponse.ok) {
          if (!claudeError) claudeError = await claudeResponse!.text();
          console.error("Claude API error after retries:", claudeError);
          const shortError = claudeError.substring(0, 500);
          await supabase.from("system_config").update({
            last_analyze_error: `Chat ${chat.id} | HTTP ${claudeResponse?.status} | ${shortError}`
          }).eq("id", 1);
          if (claudeResponse?.status === 400 && claudeError.includes("credit balance is too low") && chat.brand_id) {
            console.error(`Brand ${chat.brand_id} Claude credits depleted — skipping all remaining chats for this brand`);
            depletedBrandIds.add(chat.brand_id);
            await supabase.from("brands").update({
              claude_api_key_error: "Claude API kredisi yetersiz. Lutfen Anthropic hesabinizdan kredi yukleyin: https://console.anthropic.com/settings/billing"
            }).eq("id", chat.brand_id);
          }
          errors.push(`${chat.id}: Claude HTTP ${claudeResponse?.status}`);
          continue;
        }

        const claudeData = await claudeResponse.json();
        const rawText = claudeData.content[0].text;
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.error(`No JSON found in Claude response for chat ${chat.id}:`, rawText.substring(0, 200));
          errors.push(`${chat.id}: No JSON in Claude response`);
          continue;
        }
        const analysisResult = JSON.parse(jsonMatch[0]);

        const lc = analysisResult.language_compliance;
        const qm = analysisResult.quality_metrics;
        const pm = analysisResult.performance_metrics;
        let solutionAchieved = analysisResult.solution_achieved ?? "kısmi";

        const solutionScore =
          solutionAchieved === "tam" ? 100 :
          solutionAchieved === "kısmi" ? 55 : 10;

        // CASINO SECTOR: Solution-focused scoring (solution weight 15% → 38%)
        const baseScore =
          (lc.professional_language          * 0.10) +
          (lc.polite_tone                    * 0.10) +
          (qm.answer_relevance               * 0.12) +
          (pm.first_response_quality         * 0.08) +
          (pm.solution_focused               * 0.12) +
          (pm.communication_effectiveness    * 0.10) +
          (solutionScore                     * 0.38);  // Highest weight - solution is key!

        // CASINO SECTOR: Softer penalties + casino-specific critical penalties
        let penalty = 0;

        if (lc.copy_paste_detected)                        penalty += 3;  // Reduced: 5→3 (standard replies are normal)
        if (qm.stalling_detected && solutionAchieved === 'çözümsüz')  penalty += 5;  // Only penalize if no solution
        if (qm.unnecessary_length)                         penalty += 2;  // Reduced: 3→2
        if (qm.customer_satisfaction === 'negative' && solutionAchieved === 'çözümsüz')  penalty += 8;  // Only if unresolved
        
        // Casino-specific critical penalties (check misinformation content)
        const misinfoList = analysisResult.issues_detected?.misinformation || [];
        let bonusMisinfo = false;
        let paymentMisinfo = false;
        let gamblingEthics = false;
        
        for (const misinfo of misinfoList) {
          const lowerMisinfo = (misinfo || '').toLowerCase();
          if (lowerMisinfo.includes('çevrim') || lowerMisinfo.includes('bonus') || lowerMisinfo.includes('rollover')) {
            bonusMisinfo = true;
          }
          if (lowerMisinfo.includes('havale') || lowerMisinfo.includes('papara') || lowerMisinfo.includes('çekim') || lowerMisinfo.includes('yatır')) {
            paymentMisinfo = true;
          }
        }
        
        // Check improvement areas for ethics violations
        const improvementAreas = analysisResult.issues_detected?.improvement_areas || [];
        for (const area of improvementAreas) {
          const lowerArea = (area || '').toLowerCase();
          if ((lowerArea.includes('bonus') && (lowerArea.includes('kapat') || lowerArea.includes('bağımlı'))) ||
              (lowerArea.includes('oyna') && lowerArea.includes('teşvik'))) {
            gamblingEthics = true;
          }
        }
        
        if (bonusMisinfo)     penalty += 25;  // Bonus misinformation - CRITICAL!
        if (paymentMisinfo)   penalty += 12;  // Payment time misinformation
        if (gamblingEthics)   penalty += 30;  // Unethical gambling encouragement - MOST CRITICAL!
        if (misinfoList.length > 0 && !bonusMisinfo && !paymentMisinfo) penalty += 10;  // General misinformation

        // CASINO SECTOR: Response time penalties (money operations take 20-40 min)
        const responseTimeForPenalty = firstResponseTime ?? avgResponseTime;
        if (responseTimeForPenalty !== null) {
          // Softer thresholds for casino sector (financial checks are normal)
          if (responseTimeForPenalty > 600)       penalty += 10;  // 10 min → 600s (was 300s/12 penalty)
          else if (responseTimeForPenalty > 300)  penalty += 5;   // 5 min → 300s (was 120s/6 penalty)
          else if (responseTimeForPenalty > 120)  penalty += 2;   // 2 min → 120s (was 60s/3 penalty)
        }

        // Cap total penalty at 20 (was 25) - softer for casino sector
        penalty = Math.min(penalty, 20);

        let calculatedScore = Math.max(0, Math.min(100, Math.round(baseScore - penalty)));

        console.log(`Calculated score: ${calculatedScore} (base: ${baseScore.toFixed(1)}, penalty: ${penalty}, solution: ${solutionAchieved})`);

        const { data: analysisRecord, error: analysisError } = await supabase
          .from("chat_analysis")
          .insert({
            chat_id: chat.id,
            brand_id: chat.brand_id,
            overall_score: calculatedScore,
            chat_topic: analysisResult.chat_topic ?? null,
            language_compliance: analysisResult.language_compliance,
            quality_metrics: analysisResult.quality_metrics,
            performance_metrics: analysisResult.performance_metrics,
            issues_detected: analysisResult.issues_detected,
            positive_aspects: analysisResult.positive_aspects,
            recommendations: analysisResult.recommendations,
            sentiment: analysisResult.sentiment,
            requires_attention: analysisResult.requires_attention,
            ai_summary: analysisResult.ai_summary,
          })
          .select()
          .single();

        if (analysisError) {
          console.error("Analysis insert error:", analysisError);
          continue;
        }

        await supabase
          .from("chats")
          .update({ analyzed: true, analyzing_at: null, first_response_time: firstResponseTime })
          .eq("id", chat.id);

        // Hibrit model: sadece score < 30 (kritik) olan chatler Sonnet ile tekrar analiz edilir
        // Bu chatler toplamin ~%1'i — maliyet artışı minimal, doğruluk maksimum
        if (calculatedScore < 30 && !isObjection) { // Objection zaten Sonnet ile analiz edildi, tekrar gerek yok
          console.log("Score " + calculatedScore + " < 30 (KRİTİK), Sonnet ile yeniden analiz: " + chat.id);
          try {
            const sonnetRes = await fetch("https://jarvis.systemtest.store/v1/messages", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": claudeApiKey,
                "anthropic-version": "2023-06-01",
              },
              body: JSON.stringify({
                model: "claude-sonnet-4-20250514",
                max_tokens: 4096,
                temperature: 0.2,
                system: "Sen deneyimli bir müşteri hizmetleri kalite kontrol uzmanısın. Türkçe sohbetleri titizlikle analiz eder ve JSON formatında detaylı rapor verirsin. Puanlama yaparken adil ve tutarlı standartlar uygularsın. Müşterinin davranışını temsilciye yükleme — sadece temsilcinin performansını değerlendir. Sadece geçerli JSON döndür, başka bir şey yazma.",
                messages: [{ role: "user", content: analysisPrompt }],
              }),
            });

            if (sonnetRes.ok) {
              const sonnetData = await sonnetRes.json();
              const sonnetText = sonnetData.content[0].text;
              const sonnetJson = sonnetText.match(/\{[\s\S]*\}/);
              if (sonnetJson) {
                const sonnetResult = JSON.parse(sonnetJson[0]);
                const sLc = sonnetResult.language_compliance;
                const sQm = sonnetResult.quality_metrics;
                const sPm = sonnetResult.performance_metrics;
                const sSolution = sonnetResult.solution_achieved ?? "kısmi";
                const sSolutionScore = sSolution === "tam" ? 100 : sSolution === "kısmi" ? 55 : 10;
                const sBase = (sLc.professional_language * 0.12) + (sLc.polite_tone * 0.13) + (sQm.answer_relevance * 0.18) + (sPm.first_response_quality * 0.12) + (sPm.solution_focused * 0.15) + (sPm.communication_effectiveness * 0.15) + (sSolutionScore * 0.15);
                let sPenalty = 0;
                if (sLc.copy_paste_detected) sPenalty += 5;
                if (sQm.stalling_detected) sPenalty += 5;
                if (sQm.unnecessary_length) sPenalty += 3;
                if (sQm.customer_satisfaction === "negative") sPenalty += 7;
                if (sonnetResult.issues_detected?.misinformation?.length > 0) sPenalty += 10;
                if (responseTimeForPenalty !== null) {
                  if (responseTimeForPenalty > 300) sPenalty += 12;
                  else if (responseTimeForPenalty > 120) sPenalty += 6;
                  else if (responseTimeForPenalty > 60) sPenalty += 3;
                }
                sPenalty = Math.min(sPenalty, 25);
                const sonnetScore = Math.max(0, Math.min(100, Math.round(sBase - sPenalty)));
                console.log("Sonnet kritik re-score: " + sonnetScore + " (Haiku: " + calculatedScore + ")");

                await supabase.from("chat_analysis").update({
                  overall_score: sonnetScore,
                  chat_topic: sonnetResult.chat_topic ?? null,
                  language_compliance: sonnetResult.language_compliance,
                  quality_metrics: sonnetResult.quality_metrics,
                  performance_metrics: sonnetResult.performance_metrics,
                  issues_detected: sonnetResult.issues_detected,
                  positive_aspects: sonnetResult.positive_aspects,
                  recommendations: sonnetResult.recommendations,
                  sentiment: sonnetResult.sentiment,
                  requires_attention: sonnetResult.requires_attention,
                  ai_summary: sonnetResult.ai_summary,
                }).eq("chat_id", chat.id);

                calculatedScore = sonnetScore;
                analysisResult.sentiment = sonnetResult.sentiment;
                analysisResult.issues_detected = sonnetResult.issues_detected;
                analysisResult.ai_summary = sonnetResult.ai_summary;
                analysisResult.recommendations = sonnetResult.recommendations;
                analysisResult.chat_topic = sonnetResult.chat_topic;
                solutionAchieved = sSolution;
              }
            }
          } catch (sonnetErr) {
            console.error("Sonnet kritik re-analiz başarısız, Haiku sonucu korunuyor:", sonnetErr);
          }
        }

        if (calculatedScore < 60 || analysisResult.sentiment === "negative") {
          const severity = calculatedScore < 30 ? "critical" : calculatedScore < 40 ? "high" : "medium";

          const chatDate = new Date(chat.created_at).toLocaleString('tr-TR', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
          });

          const solutionLabel =
            solutionAchieved === "tam" ? "Tam çözüm sağlandı" :
            solutionAchieved === "kısmi" ? "Kısmi çözüm" : "Çözüm sağlanamadı";

          const topicLine = analysisResult.chat_topic ? `📌 Konu: ${analysisResult.chat_topic}\n\n` : "";

          const criticalErrors = analysisResult.issues_detected.critical_errors?.filter((e: string) => e?.trim()) ?? [];
          const improvementAreas = analysisResult.issues_detected.improvement_areas?.filter((e: string) => e?.trim()) ?? [];
          const allIssues = [...criticalErrors, ...improvementAreas];
          const issuesText = allIssues.length > 0
            ? allIssues.map((issue: string, idx: number) => `${idx + 1}. ${issue}`).join("\n")
            : "Yok";

          const alertMessage = `${topicLine}🚨 DİKKAT GEREKTİREN SOHBET

Chat ID: ${chat.id}
Tarih: ${chatDate}
Temsilci: ${chat.agent_name}
Müşteri: ${chat.customer_name}
Genel Puan: ${calculatedScore}/100
Çözüm Durumu: ${solutionLabel}
Müşteri Durumu: ${analysisResult.sentiment === "negative" ? "Olumsuz" : analysisResult.sentiment === "positive" ? "Olumlu" : "Nötr"}

💬 Müşteri Sorunu ve Sohbet Özeti:
${analysisResult.ai_summary}

⚠️ Tespit Edilen Sorunlar (Kanıta Dayalı):
${issuesText}

💡 Öneriler:
${analysisResult.recommendations}

📚 Eğitici örnek için: /egitim ${chat.id}`;

          await supabase.from("alerts").insert({
            chat_id: chat.id,
            analysis_id: analysisRecord.id,
            brand_id: chat.brand_id,
            alert_type: "quality_issue",
            severity: severity,
            message: alertMessage,
            sent_to_telegram: false,
          });

          alertsCreated++;
        }

        const today = new Date().toISOString().split("T")[0];
        await supabase.rpc("upsert_daily_stats", {
          p_personnel_name: chat.agent_name,
          p_date: today,
          p_score: calculatedScore,
          p_response_time: chat.first_response_time || 0,
        });

        analyzedCount++;
        runDetails.push({
          chat_id: chat.id,
          agent: chat.agent_name,
          brand_id: chat.brand_id,
          score: calculatedScore,
          sentiment: analysisResult.sentiment,
          topic: analysisResult.chat_topic ?? "",
          model: useModel,
          sonnet_upgrade: useModel === "claude-haiku-4-5-20251001" && calculatedScore < 70,
        });
        console.log(`Successfully analyzed chat ${chat.id}`);

        if (chat.brand_id && !clearedErrorBrandIds.has(chat.brand_id)) {
          clearedErrorBrandIds.add(chat.brand_id);
          await supabase.from("brands").update({ claude_api_key_error: null }).eq("id", chat.brand_id);
        }
      } catch (chatError) {
        console.error(`Error analyzing chat ${chat.id}:`, chatError);
        errors.push(`${chat.id}: ${chatError.message}`);
        continue;
      }
    }

    console.log(`\n=== Analysis Complete ===`);
    console.log(`Total analyzed: ${analyzedCount}, Alerts: ${alertsCreated}, Errors: ${errors.length}`);

    // Log this run to analyze_runs table
    const runDuration = Date.now() - runStartTime;
    const brandIdsInRun = [...new Set(runDetails.map(d => d.brand_id).filter(Boolean))];
    const sonnetUpgradeCount = runDetails.filter(d => d.sonnet_upgrade).length;

    await supabase.from("analyze_runs").insert({
      started_at: new Date(runStartTime).toISOString(),
      completed_at: new Date().toISOString(),
      brand_ids: brandIdsInRun,
      mode: singleChatId ? "single" : "batch",
      model_used: singleChatId ? "claude-sonnet-4-20250514" : "claude-haiku-4-5-20251001",
      chats_claimed: unanalyzedChats.length,
      chats_analyzed: analyzedCount,
      chats_skipped: unanalyzedChats.length - analyzedCount - errors.length,
      alerts_created: alertsCreated,
      sonnet_upgrades: sonnetUpgradeCount,
      errors: errors.length > 0 ? errors : [],
      depleted_brands: [...depletedBrandIds],
      duration_ms: runDuration,
      details: runDetails,
    }).then(({ error: logErr }) => {
      if (logErr) console.error("Failed to log analyze run:", logErr);
    });

    return new Response(
      JSON.stringify({
        success: true,
        analyzed: analyzedCount,
        alerts_created: alertsCreated,
        errors: errors.length > 0 ? errors : undefined,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Analysis error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
