import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CoachingRequest {
  chatId: string;
  chatAnalysisId: string;
  customerName?: string;
  messages: Array<{
    author: { name: string };
    text: string;
  }>;
  analysis?: {
    sentiment: string;
    score: number;
    issues?: string[];
    summary?: string;
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    console.log('Request body received:', {
      chatId: body.chatId,
      chatAnalysisId: body.chatAnalysisId,
      messageCount: body.messages?.length,
      hasAnalysis: !!body.analysis
    });

    const { chatId, chatAnalysisId, customerName, messages, analysis, brand_id }: CoachingRequest & { brand_id?: string } = body;
    const firstName = customerName ? customerName.trim().split(/\s+/)[0] : '';
    const formalName = firstName ? `${firstName} Bey/Hanım` : '';

    if (!chatAnalysisId) {
      console.error('No chatAnalysisId provided');
      return new Response(
        JSON.stringify({ error: "chatAnalysisId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!messages || messages.length === 0) {
      console.error('No messages provided');
      return new Response(
        JSON.stringify({ error: "Messages are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let settingsQuery = supabase.from("settings").select("claude_api_key");
    if (brand_id) settingsQuery = settingsQuery.eq("brand_id", brand_id);
    const { data: settings } = await settingsQuery.limit(1).maybeSingle();

    let ANTHROPIC_API_KEY = settings?.claude_api_key;

    if (!ANTHROPIC_API_KEY && brand_id) {
      const { data: brand } = await supabase
        .from("brands")
        .select("claude_api_key")
        .eq("id", brand_id)
        .maybeSingle();
      ANTHROPIC_API_KEY = brand?.claude_api_key;
    }

    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Claude API key not configured in settings" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const chatTranscript = messages
      .map((msg) => `${msg.author.name}: ${msg.text}`)
      .join("\n");

    const agentName = messages.find(m =>
      m.author?.type === 'agent' ||
      m.author?.type === 'supervisor'
    )?.author?.name || '';

    const customerMessages = messages.filter(m =>
      m.author?.type === 'customer' ||
      (
        m.author?.name !== agentName &&
        m.author?.type !== 'system' &&
        m.author?.name?.toLowerCase() !== 'system' &&
        !m.author?.name?.toLowerCase().includes('bot') &&
        m.text?.trim().length > 3 &&
        !m.text?.includes('hoş geldiniz') &&
        !m.text?.includes('nasıl yardımcı olabilirim') &&
        !m.text?.includes('Merhaba')
      )
    );
    const firstCustomerMessage = customerMessages[0]?.text?.trim() || '';
    const secondCustomerMessage = customerMessages[1]?.text?.trim() || '';

    const issuesText = analysis?.issues?.join(", ") || "bilinmiyor";
    const sentimentText = analysis?.sentiment || "olumsuz";
    const scoreText = analysis?.score || "düşük";

    const chatLower = chatTranscript.toLowerCase();
    const isRetentionCase = [
      'hesab', 'üyelik', 'iptal', 'kapat', 'ayrıl', 'çıkmak', 'bırakmak', 'vazgeç', 'devam etmek istemiyorum', 'artık istemiyorum'
    ].some(kw => chatLower.includes(kw));

    const retentionInstructions = isRetentionCase ? `
ÖNEMLİ – ÜYE KAZANMA (RETENTION) SENARYOSU:
Bu görüşmede üye hesabını kapatmak veya üyelikten ayrılmak istiyor. Bu tür durumlarda temsilcinin temel görevi üyeyi sonuna kadar ELDE TUTMAYA ÇALIŞMAKTIR. Örnek diyalog bu stratejiyi yansıtmalıdır:
- Temsilci, hesap kapatma işlemine hemen geçmez; önce neden ayrılmak istediğini nazikçe sorar.
- Üyenin şikayetini veya yaşadığı sorunu anlamaya çalışır ve çözüm önerir.
- Mümkünse alternatifler sunar (erteleme, indirim, sorunun çözülmesi vb.).
- Sadece tüm çabalar sonuçsuz kalırsa ve üye kesinlikle ayrılmak isterse işlemi başlatır.
- Diyalogda temsilci en az 2 farklı stratejiyle (empati + çözüm önerisi) üyeyi kazanmaya çalışmalıdır.
` : '';

    const prompt = `🎰 SEKTÖR BAĞLAMI: Bu bir CASINO/BAHİS SİTESİ canlı destek sohbetidir.

MÜŞTERİ PROFİLİ:
• Para kaybetmiş → Çok sinirli, küfür edebilir
• Para yatırımı gecikmede → Panik + öfke
• Bahis kaçırıyor → Sabırsız
• Kumar bağımlılığı riski → Hassas durum

OPERASYONEL GERÇEKLER:
• Para işlemleri: Finans ekibi onayı gerekir → 20-40 dk NORMAL
• Oyun hataları: Sağlayıcıdan replay gerekir → 15-30 dk NORMAL
• Bonus işlemleri: Agent yetkisi var → Hızlı olmalı

KRİTİK KONULAR:
1. Bonus şartları (çevrim, max bahis, geçerlilik) - YANLIŞ BİLGİ = MÜŞTERİ MAĞDUR!
2. Ödeme süreleri (Papara anında, Havale 1-3 saat, Kripto 15-60 dk)
3. Oyun hataları (Session ID, replay) - "hata olmaz" YASAK!
4. Kumar bağımlılığı (Sorumlu oyun, self-exclusion) - BONUS TEKLİF YASAK!
5. 18 yaş altı şüphesi (KYC zorunlu)
6. Dolandırıcılık iddiası (Sakin kal, log inceleme)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Aşağıdaki müşteri hizmetleri chat görüşmesini incele ve destek personeline yönelik koçluk önerileri hazırla.

GERÇEK KONUŞMA:
${chatTranscript}

Mevcut Analiz:
- Duygu: ${sentimentText}
- Puan: ${scoreText}
- Sorunlar: ${issuesText}

MÜŞTERİNİN GERÇEK MESAJLARI (bunları diyalogda AYNEN kullan, kesinlikle değiştirme):
- İlk mesaj: "${firstCustomerMessage}"
${secondCustomerMessage ? `- İkinci mesaj: "${secondCustomerMessage}"` : ''}
${retentionInstructions}
Lütfen aşağıdaki formatta yaz:

1. **Ana Sorun**: Görüşmedeki temel sorunu tek cümleyle, net ve somut biçimde ifade et.

   YANLIŞ ÖRNEKLER (muğlak):
   - "Genel iletişim eksikliği"
   - "Müşteri memnuniyetsizliği"
   - "Yanıt kalitesi düşük"
   
   DOĞRU ÖRNEKLER (casino-specific, spesifik):
   - "Temsilci, müşterinin para yatırma gecikmesi sorusunu 15 dakika yanıtsız bıraktı"
   - "Temsilci, bonus çevrim şartını 20x yerine 30x olarak yanlış bildirdi (KRİTİK HATA!)"
   - "Temsilci, oyun hatası şikayetini 'oyunlarda hata olmaz' diyerek reddetti"
   - "Temsilci, kumar bağımlısı müşteriye bonus teklif etti (ETİK İHLAL!)"
   - "Temsilci, Havale işlem süresini 'anında' dedi (DOĞRUSU: 1-3 saat)"
2. **Yapılması Gerekenler**: Personelin geliştirebileceği 3-4 somut öneriyi madde madde sırala.

   YANLIŞ ÖRNEKLER (genel tavsiyeler):
   - "Daha iyi iletişim kur"
   - "Müşteriye daha nazik ol"
   - "Hızlı yanıt ver"
   
   DOĞRU ÖRNEKLER (casino-specific, uygulanabilir):
   
   Para yatırma gecikmesi:
   1. Müşterinin para yatırma sorusuna ilk 60 saniye içinde yanıt ver
   2. "Hemen kontrol ediyorum" de ve finans ekibine ilet (20-40 dk sürebilir, bunu bildir)
   3. 10 dakikada bir ara güncelleme mesajı gönder ("örn: Finans ekibi inceliyor")
   4. Sorun çözüldüğünde "✅ 20.000 TL hesabınıza yüklendi" diye onay ver
   
   Bonus şartları yanlış:
   1. Bonus şartlarını vermeden önce sistem/dokümandan KONTROL ET
   2. Müşteriye EKSİKSİZ bildir: Çevrim + Oyunlar + Max bahis + Süre
   3. Emin olmadığın bonus şartlarını TAHMiN ETME, yöneticiden/sistemden sor
   4. Yanlış bilgi verirsen müşteri mağdur olur, şirket sorumlu tutulur (KRİTİK!)
   
   Oyun hatası şikayeti:
   1. "Oyunda hata olmaz" DEĞİL, "Hemen kontrol edelim" de
   2. Müşteriden Oyun ID/Session ID, replay linki, ekran görüntüsü iste
   3. "Sağlayıcıdan detaylı replay kontrol istiyorum, 20-25 dakika sürebilir" bilgilendir
   4. Replay geldiğinde sonuç bildir (hata varsa düzelt, yoksa açıkla)
   
   Kumar bağımlılığı:
   1. Müşteri "Hesabımı kapatın", "Çok kaybettim" derse ASLA BONUS TEKLİF ETME!
   2. Hemen sorumlu oyun seçenekleri sun: Self-exclusion (30/90/kalıcı gün), Limit koyma
   3. "Kararınıza saygı duyuyorum" diyerek empati göster
   4. Müşteriyi oyundan çıkarmaya çalışma, sorumlu oyun SEÇENEKLERİ sun
   
   Müşteri küfür etti:
   1. Müşteri küfür etse bile SEN SAKİN KAL, karşılık verme
   2. "Anlayışınızı rica ederim, sorunuzu hemen çözüyorum" de
   3. Müşteriyi azarlama, "sakin olun" deme, "bu dil uygun değil" deme
   4. Sadece sorunu çözmeye odaklan, küfürü görmezden gel
   
   Her madde bu konuşmaya özel, uygulanabilir ve ölçülebilir olmalı.
3. **Örnek Cevap**: Temsilcinin o an söylemesi gereken ideal yanıtı yaz (2-3 cümle).

   YANLIŞ ÖRNEKLER (belirsiz, boş vaat):
   - "Anlıyorum, en kısa sürede bakacağız"
   - "Size yardımcı olmak isteriz"
   - "Lütfen sabirli olun"
   
   DOĞRU ÖRNEKLER (casino-specific, somut aksiyon):
   
   Para yatırma gecikmesi:
   "Hemen kontrol ediyorum. Finans ekibimiz yatırımınızı inceliyor, 15-20 dakika içinde hesabınıza yüklenecek. Size 10 dakika içinde durum güncellemesi vereceğim."
   
   Bonus şartları:
   "Bonus çevrim şartı 30x, sadece slot oyunlarda geçerli (live casino hariç), max bahis 50 TL ve 7 gün içinde çevirmelisiniz. Daha fazla detay ister misiniz?"
   
   Oyun hatası:
   "Hemen kontrol ediyorum. Oyun ID'sini veya replay linkini paylaşabilir misiniz? Sağlayıcıdan detaylı inceleme isteyeceğim, 20-25 dakika sürebilir."
   
   Kumar bağımlılığı:
   "Kararınıza saygı duyuyorum. Hesap kapatmadan önce şu seçeneklerimizi öneriyorum: Self-exclusion (30/90/kalıcı gün) veya günlük/haftalık limit. Hangisi size uygun?"
   
   Bu yanıt müşterinin asıl sorununu doğrudan ele almalı ve somut bir adım içermeli.
4. **Örnek Diyalog**: Aşağıdaki ZORUNLU KURALLARA uyarak yaz:

ZORUNLU KURALLAR — bunları ihlal etme:
✓ Müşterinin ilk mesajı AYNEN şu olmalı: "${firstCustomerMessage}" — tek kelime bile değiştirme.
✓ Müşteri konuşmayı bitirdiyse (vedalaştıysa) diyalogu zorla uzatma, orada bitir.
✓ Temsilci her yanıtta somut bir aksiyon yapmalı: "inceliyorum", "yönlendiriyorum", "kayıt altına alıyorum" gibi.
✓ "Anlıyorum, en kısa sürede bakacağız" gibi belirsiz vaatler yasak.
✓ Temsilci asla "sabırlı olun", "sakin olun" dememeli.

CASINO-SPECIFIC KURALLAR:
✓ Para işlemi süreleri DOĞRU verilmeli (Havale 1-3 saat, Papara anında, Kripto 15-60 dk)
✓ Bonus şartları EKSİKSİZ verilmeli (çevrim + oyunlar + max bahis + süre)
✓ Oyun hatası ciddi alınmalı ("hata olmaz" yasak, replay kontrol teklif et)
✓ Kumar bağımlılığı hassasiyeti (bonus teklif etme, sorumlu oyun sun)
✓ Müşteri küfür etse bile agent sakin kalmalı, karşılık vermemeli

DIYALOG_BASLANGIC
Üye: ${firstCustomerMessage}
Temsilci: [müşterinin spesifik sorununu doğrudan ele alan, somut aksiyon içeren yanıt]
${secondCustomerMessage ? `Üye: ${secondCustomerMessage}\nTemsilci: [sorunu çözen veya net sonraki adımı bildiren yanıt]` : ''}
DIYALOG_BITIS

Yazım kuralları:
- Cümleleri özne-yüklem sırasına göre kur; devrik cümle kullanma.
- Doğal, akıcı ve anlaşılır Türkçe kullan.
- Yargı bildiren cümleleri "-dır/-dir" yerine "-yor", "-meli" veya "-acak" ile bitir.
- Resmi ama samimi bir ton benimse.
- Temsilci müşteriye HER ZAMAN "Ad Bey" veya "Ad Hanım" şeklinde hitap etmeli. Sadece isim kullanmak (örn. "Kerim") kabul edilemez, mutlaka saygı eki eklenmeli.${firstName ? ` Bu konuşmada müşterinin adı "${firstName}" — cinsiyet bağlamdan anlaşılıyorsa "Bey" veya "Hanım" seç, anlaşılamıyorsa "Bey" kullan (örn. "${firstName} Bey").` : ' Örneğin "Ahmet Bey" veya "Ayşe Hanım" gibi.'} "Sayın Üye", "Değerli Müşteri" gibi genel ifadeler kullanma.
- Temsilci hiçbir zaman müşteriyi azarlamaz, uyarmaz veya davranışı hakkında yorum yapmaz. Bunun yerine sorunun çözümüne odaklanır ve sakin, nazik bir dil kullanır.
- Temsilci hiçbir zaman "sakin olun" veya "bu tür ifadeler kullanmanız gerekli değil" gibi ifadeler kullanmaz. Bu tür durumları görmezden gelip sadece yardımcı olmaya odaklanır.`;

    const response = await fetch("https://jarvis.systemtest.store/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 3000,
        system: `Sen deneyimli bir CASINO SEKTÖRÜ müşteri hizmetleri koçusun. Casino/bahis sektörünün özelliklerini bilirsin: Müşteriler para kaybetmiş (çok sinirli, küfür edebilir), para işlemleri finans onayı gerektirir (20-40 dk normal), bonus şartları yanlış verilirse müşteri mağdur olur (kritik!), oyun hataları ciddi alınmalı ('hata olmaz' yasak), kumar bağımlılığı hassasiyeti (bonus teklif etme, sorumlu oyun sun). Türkçeyi akıcı ve doğal kullanırsın. Örnek diyalog yazarken müşterinin gerçek mesajlarını AYNEN kullanırsın — tek kelime bile değiştirmezsin. Genel tavsiyeler vermezsin, her öneri o konuşmaya özel ve casino-specific olur. Müşteri konuşmayı bitirdiyse diyalogu zorla uzatmazsın. YASAK İFADELER: 'benimle birlikte çalışalım', 'beni dinlemeye devam edin', 'değerli müşterimiz', 'sayın üyemiz', 'sabır gösterin', 'sabırlı olun', 'en kısa sürede', 'elimden geleni yapacağım', 'size en uygun çözümü sunacağım'. Bu ifadeler yerine doğrudan somut aksiyon cümleleri kur ("Hemen kontrol ediyorum", "Finans ekibi inceliyor, 15-20 dakika sürer", "10 dakika içinde güncelleme vereceğim").`,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Claude API error:", errorText);
      let errorMessage = `Claude API hatası (${response.status})`;
      try {
        const errJson = JSON.parse(errorText);
        errorMessage = errJson.error?.message || errorMessage;
      } catch {}
      return new Response(
        JSON.stringify({ error: errorMessage }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await response.json();
    if (!data.content || data.content.length === 0) {
      console.error("Claude API returned empty content:", data);
      return new Response(
        JSON.stringify({ error: "Claude API boş yanıt döndürdü" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    const suggestion = data.content[0].text;

    // Save coaching suggestion to database (using service_role for UPDATE permission)
    console.log('Saving coaching suggestion to database:', {
      chatAnalysisId,
      suggestionLength: suggestion.length
    });

    const { data: updateData, error: updateError } = await supabase
      .from('chat_analysis')
      .update({ coaching_suggestion: suggestion })
      .eq('id', chatAnalysisId)
      .select();

    if (updateError) {
      console.error('Error saving coaching suggestion:', updateError);
      return new Response(
        JSON.stringify({
          error: "Failed to save coaching suggestion to database",
          details: updateError.message
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log('Coaching suggestion saved successfully:', {
      chatAnalysisId,
      rowsUpdated: updateData?.length
    });

    return new Response(
      JSON.stringify({
        chatId,
        chatAnalysisId,
        suggestion,
        saved: true,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in get-coaching function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
