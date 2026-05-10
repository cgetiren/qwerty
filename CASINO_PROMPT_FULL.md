# 🎰 CASINO/BAHİS SEKTÖRÜ - TAM ÖZELLEŞTIRILMIŞ PROMPT

Bu prompt, casino/slot/bahis sitesi canlı destek chat'lerini değerlendirmek için tasarlanmıştır.

---

## 🚨 SEKTÖR BAĞLAMI

Bu bir **casino/bahis sitesi** canlı destek sohbetidir. Müşteriler:
- Para kaybetmiş ve **çok sinirli**
- Para yatırımı gecikmede → **Panik + öfke**
- Bahis kaçırıyor → **Sabırsız**
- Kumar bağımlılığı riski → **Hassas durum**

**Temsilci performansı bu bağlamda değerlendirilmelidir!**

---

## 🔥 KRİTİK KURALLAR (ASLA İHLAL EDİLMEZ)

### 1️⃣ MÜŞTERİ KÜFÜR/HAKARET - MUTLAK KURAL

**Müşteri küfür, hakaret veya saldırgan dil kullanmışsa:**
- Bu **TEMSİLCİNİN DİL PUANINI HİÇ ETKİLEMEZ!**
- Sadece temsilcinin **nasıl karşılık verdiğini** değerlendir
- Temsilci sakin ve kibar kaldıysa → **professional_language: 95-100, polite_tone: 95-100**

**Örnekler:**

✅ **DOĞRU DEĞERLENDİRME:**
```
Müşteri: "Ananızı sikeyim"
Temsilci: "Anlayışınızı rica ederim, sorunuzu çözeyim"

PUAN: professional_language: 100, polite_tone: 100
NOT: "Müşteri saldırgan dil kullandı, temsilci sakin kaldı" (improvement_areas'a yaz)
```

❌ **YANLIŞ DEĞERLENDİRME:**
```
Müşteri: "Şerefsizler"
Temsilci: "Sakin olmanızı rica ederim"

YANLIŞ PUAN: professional_language: 40 (müşteri küfrünü temsilciye yükleme!)
DOĞRU PUAN: professional_language: 95
```

---

### 2️⃣ BEKLEME SÜRELERİ - CASINO SEKTÖRÜ TOLERANSI

#### 💰 PARA YATIRMA/ÇEKME İŞLEMLERİ:
**Finans ekibi onayı gerektirir - 20-40 dakika NORMAL süreçtir!**

| Süre | Durum | Penalty | Açıklama |
|------|-------|---------|----------|
| **0-20 dk** | Normal | **0** | Standart finans kontrolü |
| **20-40 dk** | Kabul edilebilir | **-5** | Yoğunluk/ek kontrol |
| **40-60 dk** | Uzun | **-10** | Ama sorun çözüldüyse tolere edilir |
| **60+ dk** | Çok uzun | **-15** | Ciddi gecikme |

**ÖNEMLİ:** "40 dakika bekledi" = "Oyaladı" DEĞİL! Finans işlemi normal süreçtir.

#### 🎮 OYUN HATASI/REPLAY KONTROL:
**Sağlayıcıdan replay istenmesi gerekir - 15-30 dakika normaldir!**

| Süre | Penalty | Açıklama |
|------|---------|----------|
| **0-15 dk** | **0** | Hızlı kontrol |
| **15-30 dk** | **-3** | Sağlayıcı replay (normal) |
| **30-45 dk** | **-8** | Uzun kontrol |
| **45+ dk** | **-12** | Çok uzun |

#### 🎁 BONUS/BİLGİ TALEPLERİ:
**Agent yetkisi var - hızlı olmalı!**

| Süre | Penalty |
|------|---------|
| **0-5 dk** | **0** |
| **5-10 dk** | **-5** |
| **10+ dk** | **-10** |

---

### 3️⃣ ÇÖZÜM SONUCU = EN ÖNEMLİ FAKTöR (%38 AĞIRLIK!)

**Sorun çözüldü mü?** → En kritik kriter!

#### ✅ TAM ÇÖZÜM:
- Müşteri parasını aldı ✅
- Oyun hatası düzeltildi ✅
- Bonus yüklendi ✅
- Hesap açıldı ✅

→ **Minimum puan: 65** (süreç kötü olsa bile!)
→ Süreç iyiyse: **75-90 puan**

#### ⚠️ KISMI ÇÖZÜM:
- Bilgi verildi, takip açıldı
- Kısmi ödeme yapıldı
- "İlgili birime iletildi"

→ **Minimum puan: 45**

#### ❌ ÇÖZÜMSÜZ:
- Müşteri cevapsız bırakıldı
- Sorun çözülmedi
- Agent kayıp/cevap yok

→ **Puan: 0-30 arası**

**ÖRNEK:**
```
Para yatırma 45 dk sürdü ama sonunda 20.000 TL yüklendi → MİNİMUM 65 PUAN
Para yatırma 10 dk sürdü ama hiç yüklenmedi → MAX 30 PUAN
```

---

### 4️⃣ STANDART YANITLAR NORMAL

Casino destek ekipleri **standart yanıtlar** kullanır - bu normaldir!

**Normal yanıtlar:**
- "Hemen kontrol ediyorum ⏳"
- "Kısa bir süre beklemenizi rica ederim"
- "Bakiyeniz hesabınıza aktarılmıştır ✅"
- "İyi eğlenceler ve bol şanslar 😊"

**KURAL:** Bu mesajları `copy_paste_detected: true` olarak işaretleme!

**İSTİSNA:** Aynı mesaj **10+ kez** tekrarlandıysa → `copy_paste_detected: true`

---

## 💎 CASINO-SPESİFİK DEĞERLENDİRME KRİTERLERİ

### 🎁 BONUS ŞARTLARI DOĞRULUĞU (KRİTİK!)

**Bonus şartları yanlış verilirse müşteri MAĞDuR olur!**

**Kontrol edilmesi gerekenler:**
1. **Çevrim şartı** (20x, 30x, 40x vs.)
2. **Geçerli oyunlar** (sadece slot? tüm oyunlar? live hariç?)
3. **Max bahis limiti** (örn: 50 TL max bahis)
4. **Geçerlilik süresi** (7 gün, 14 gün, 30 gün?)
5. **Min. bonus tutarı** (örn: min 100 TL yatırım)

**PUANLAMA:**

| Durum | Penalty | Açıklama |
|-------|---------|----------|
| Çevrim yanlış | **-25** | EN KRİTİK! (20x yerine 30x söylemek) |
| Geçerli oyunlar yanlış | **-20** | "Tüm oyunlar" ama sadece slot |
| Max bahis yanlış | **-15** | Müşteri bonusu kaybedebilir |
| Geçerlilik süresi yanlış | **-12** | Zaman kaybı |
| Eksik bilgi | **-8** | Çevrim söyledi ama max bahis söylemedi |

**BONUS:**
| Durum | Bonus Puan |
|-------|-----------|
| Tüm şartları eksiksiz açıklama | **+10** |
| Proaktif uyarı ("Max bahis 50 TL, dikkat edin") | **+5** |

**ÖRNEK:**
```
Müşteri: "Bonus çevrim kaç?"
Temsilci: "30x çevrim, sadece slot oyunlarda geçerli, max bahis 50 TL, 7 gün içinde çevirmelisiniz"

→ professional_language: 100
→ answer_relevance: 100
→ BONUS: +10 puan (eksiksiz bilgi)
```

---

### 💳 ÖDEME YÖNTEMİ BİLGİSİ DOĞRULUĞU

**Ödeme süreleri yanlış bildirilirse müşteri panikler!**

**Doğru bilgiler:**
- **Papara:** Anında (0-5 dk)
- **MaksiPara:** Anında (0-5 dk)
- **Havale (EFT):** 1-3 saat (banka çalışma saati)
- **Kripto (BTC/ETH/USDT):** 15-60 dk (network confirmation)
- **Jeton Wallet:** Anında
- **Para çekme (withdrawal):** 24-48 saat (güvenlik kontrolü)

**YANLIŞ BİLGİ ÖRNEKLERİ:**

| Yanlış Bilgi | Doğrusu | Penalty |
|-------------|---------|---------|
| "Havale anında" | 1-3 saat | **-12** |
| "Kripto anında" | 15-60 dk | **-10** |
| "Çekim anında" | 24-48 saat | **-15** |
| "Papara 1 saat" | Anında | **-8** |

**DOĞRU BİLGİ BONUS:**
- İşlem süresi + sebep açıklama → **+5 puan**
  - Örn: "Havale 1-3 saat sürer çünkü banka onayı gerekir"

---

### 🎮 OYUN HATASI YÖNETİMİ

**Oyun hatası en hassas konulardan biri! Doğru yönetilmeli.**

**DOĞRU PROSEDÜR:**
1. ✅ Oyun ID / Session ID sor
2. ✅ Ekran görüntüsü / Replay linki iste
3. ✅ "Sağlayıcıdan kontrol edilecek" bilgisi ver
4. ✅ Bekleme süresi belirt (15-30 dk)
5. ✅ Müşteriye empati göster

**YANLIŞ YAKLAŞIMLAR:**

| Yanlış Yaklaşım | Penalty | Açıklama |
|----------------|---------|----------|
| "Oyunda hata olmaz" | **-20** | Müşteriyi yok sayma |
| "Bu sizin internetinizden" | **-15** | Kanıtsız suçlama |
| "Bir şey yapamayız" | **-12** | Çözüm odaklı değil |
| Session ID sormadan reddetme | **-18** | Araştırma yapmadan kapatma |
| "Sağlayıcı hata yapmaz" | **-15** | Müşteriye inanmama |

**DOĞRU YAKLAŞIM BONUS:**
- Proaktif replay kontrol teklifi → **+8**
- "Haklısınız, kontrol ediyorum" empati → **+5**
- "15-30 dakika sürer" süre bildirimi → **+3**

**ÖRNEK:**
```
Müşteri: "Oyunda 12.000 TL kazandım ama 995 TL aldım!"
Temsilci: "Hemen kontrol ediyorum. Oyun ID'sini ve replay linkini paylaşabilir misiniz? 
           Sağlayıcıdan detaylı kontrol isteyeceğim, 15-30 dakika sürebilir."

→ solution_focused: 95
→ communication_effectiveness: 90
→ BONUS: +8 puan (proaktif)
```

---

### 🚨 HASSAS KONU YÖNETİMİ

#### 1️⃣ KUMAR BAĞIMLILIĞI / HESAP KAPATMA

**Müşteri sinyalleri:**
- "Artık oynamak istemiyorum"
- "Hesabımı kapatın"
- "Çok para kaybettim, bırakıyorum"
- "Kendimi kontrol edemiyorum"

**DOĞRU YAKLAŞIM:**
1. ✅ Hemen "Sorumlu Oyun" politikası sun
2. ✅ Self-exclusion seçenekleri sun (30 gün, 90 gün, kalıcı)
3. ✅ Limit koyma seçeneği öner (günlük/haftalık)
4. ✅ Kumar Bağımlılığı Hattı bilgisi ver (varsa)
5. ❌ **ASLA BONUS TEKLİF ETME!**

**YANLIŞ YAKLAŞIMLAR:**

| Yanlış Yaklaşım | Penalty | Açıklama |
|----------------|---------|----------|
| "Bonus vereyim kalsın" | **-30** | ETİK İHLAL! Kumar bağımlılığı sömürüsü |
| "Biraz daha oynayın" | **-25** | Bağımlılığı teşvik |
| Sorumlu oyun bilgisi vermeden kapatma | **-15** | Yasal gereklilik ihlali |
| "Neden kapatmak istiyorsunuz?" sorgusu | **-10** | Müşteriyi rahatsız etme |

**DOĞRU YAKLAŞIM BONUS:**
- Hemen sorumlu oyun seçenekleri sunma → **+15**
- Kumar Bağımlılığı Hattı bilgisi verme → **+10**
- "Kararınıza saygı duyuyorum" empati → **+5**

**ÖRNEK:**
```
Müşteri: "Çok para kaybettim, hesabımı kapatın artık"
Temsilci: "Kararınıza saygı duyuyorum. Hesap kapatmadan önce sorumlu oyun seçeneklerimizi 
           paylaşmak isterim:
           - Self-exclusion (30/90/kalıcı gün)
           - Günlük/haftalık limit koyma
           - Kumar Bağımlılığı Hattı: 0800-XXX-XXXX
           Hangisini tercih edersiniz?"

→ professional_language: 100
→ solution_focused: 100
→ BONUS: +15 puan (sorumlu oyun önceliği)
```

#### 2️⃣ 18 YAŞ ALTI ŞÜPHESİ

**Şüphe sinyalleri:**
- Çok genç profil fotoğrafı
- "Babamın kartıyla yatırdım"
- "18 yaşından küçüğüm, olur mu?"

**DOĞRU YAKLAŞIM:**
1. ✅ Hemen KYC doğrulama talep et
2. ✅ "18 yaş altı oyun yasaktır" bilgisi ver
3. ✅ Kimlik belgesi iste
4. ✅ Hesabı geçici dondur (gerekirse)

**YANLIŞ YAKLAŞIMLAR:**

| Yanlış Yaklaşım | Penalty |
|----------------|---------|
| KYC talep etmeden devam | **-25** |
| "Yaş önemli değil" | **-30** (yasal ihlal!) |
| Görmezden gelme | **-20** |

#### 3️⃣ DOLANDIRICILIK İDDİASI

**Müşteri sinyalleri:**
- "Siz beni dolandırdınız!"
- "Oyunlar hileli!"
- "RTP yalan!"

**DOĞRU YAKLAŞIM:**
1. ✅ Sakin kal, savunmaya geçme
2. ✅ "Oyun loglarını inceleyelim" öner
3. ✅ Sağlayıcı lisans bilgisi ver (varsa)
4. ✅ "RTP %96 sertifikalı" gibi objektif bilgi ver

**YANLIŞ YAKLAŞIMLAR:**

| Yanlış Yaklaşım | Penalty |
|----------------|---------|
| "Siz kaybettiniz, normal" | **-18** (empatisiz) |
| "Dolandırıcılık yok" (kanıtsız) | **-12** |
| Saldırgan yanıt | **-25** |

**DOĞRU YAKLAŞIM BONUS:**
- Oyun loglarını proaktif kontrol | **+10** |
- Lisans/sertifika bilgisi sunma | **+8** |
- Empati + objektif açıklama | **+5** |

---

### 📊 CASINO TERMİNOLOJİ KULLANIMI

**Temsilci casino jargonunu DOĞRU kullanıyor mu?**

**Temel terimler:**
- **Çevrim / Rollover / Wager:** Bonus çevirme şartı
- **RTP:** Return to Player (oyun ödeme oranı)
- **Volatilite:** Düşük/Orta/Yüksek (oyun risk seviyesi)
- **KYC:** Know Your Customer (kimlik doğrulama)
- **Self-exclusion:** Kendi kendini oyundan men etme
- **Freespin:** Bedava dönüş
- **Cashback:** Para iadesi
- **Live casino:** Canlı krupiye oyunları
- **Slot:** Slot makinesi oyunları
- **Rake:** Poker komisyonu
- **Odds:** Bahis oranları

**YANLIŞ KULLANIM:**

| Yanlış Terim | Doğrusu | Penalty |
|--------------|---------|---------|
| "Bonus iptal" | "Bonus sıfırlama" | **-5** |
| "Oyun oranı" | "RTP" veya "Ödeme oranı" | **-3** |
| "Para gönderme" | "Para çekme/withdrawal" | **-3** |

**DOĞRU KULLANIM BONUS:**
- Tüm terimleri profesyonelce kullanma | **+3** |

---

## 🎯 PUANLAMA FORMÜLÜ (CASINO SEKTÖRÜ)

```javascript
// Çözüm skoru
const solutionScore =
  solutionAchieved === "tam" ? 100 :    // En önemli faktör!
  solutionAchieved === "kısmi" ? 55 :
  10;

// Base score (çözüm %38 ağırlık - en yüksek!)
const baseScore =
  (professional_language          * 0.10) +  // %10
  (polite_tone                    * 0.10) +  // %10
  (answer_relevance               * 0.12) +  // %12
  (first_response_quality         * 0.08) +  // %8
  (solution_focused               * 0.12) +  // %12
  (communication_effectiveness    * 0.10) +  // %10
  (solutionScore                  * 0.38);   // %38 🔥 EN YÜKSEK!

// Penalty hesaplama (casino-specific)
let penalty = 0;

// Standart penalty'ler (yumuşatılmış)
if (copy_paste_detected && count > 10)         penalty += 3;  // Sadece çok fazla tekrar
if (stalling_detected && solutionAchieved === 'çözümsüz')  penalty += 5;  // Sadece çözümsüzse
if (unnecessary_length)                        penalty += 2;
if (customer_satisfaction === 'negative' && solutionAchieved === 'çözümsüz')  penalty += 8;

// Casino-specific penalty'ler
if (bonus_misinformation)                      penalty += 25;  // EN KRİTİK!
if (payment_time_misinformation)               penalty += 12;
if (unethical_gambling_encouragement)          penalty += 30;  // Kumar bağımlısına bonus
if (under_18_ignored)                          penalty += 25;
if (game_error_dismissed)                      penalty += 20;

// Misinformation (genel)
if (misinformation.length > 0)                 penalty += 10;

// Response time penalty (casino-specific)
const responseTimeForPenalty = firstResponseTime ?? avgResponseTime;
if (responseTimeForPenalty !== null) {
  if (responseTimeForPenalty > 600)       penalty += 10;  // 10 min
  else if (responseTimeForPenalty > 300)  penalty += 5;   // 5 min
  else if (responseTimeForPenalty > 120)  penalty += 2;   // 2 min
}

// Penalty cap: Max 30 (kritik hatalar için artırıldı)
penalty = Math.min(penalty, 30);

// Final score
finalScore = Math.max(0, Math.min(100, Math.round(baseScore - penalty)));
```

---

## ✅ DEĞERLENDİRME ÖRNEKLERİ

### Örnek 1: Para Yatırma 45 Dakika Sürdü

```
Müşteri: "20.000 TL yatırdım, gelmedi"
Temsilci: "Hemen kontrol ediyorum"
... 45 dakika bekleme (finans kontrolü) ...
Temsilci: "✅ 20.000 TL yüklendi, iyi eğlenceler"
Müşteri: "Teşekkürler"

DEĞERLENDİRME:
- professional_language: 85 (standart dil)
- polite_tone: 85
- answer_relevance: 80
- solution_focused: 90 (sonunda çözdü)
- solutionScore: 100 (tam çözüm!)
- Penalty: -10 (40-60 dk bekleme)

BASE SCORE: 90.5
FINAL SCORE: 80 (90.5 - 10)
```

### Örnek 2: Müşteri Küfür Etti

```
Müşteri: "Ananızı sikeyim"
Temsilci: "Anlayışınızı rica ederim, size nasıl yardımcı olabilirim?"
Müşteri: "Amına koduklarım"
Temsilci: "Sakin olmanızı rica ederim, sorunuzu çözmek istiyorum"

DEĞERLENDİRME:
- professional_language: 100 (mükemmel, sakin kaldı!)
- polite_tone: 100 (hiç tepki vermedi)
- answer_relevance: 95
- solutionScore: 55 (kısmi, müşteri cevap vermedi)
- Penalty: 0 (müşteri küfrü etkilemez!)

FINAL SCORE: 88
```

### Örnek 3: Bonus Çevrim Yanlış Bilgi

```
Müşteri: "Bonus çevrim kaç?"
Temsilci: "20x çevrim var" (GERÇEK: 30x!)
Müşteri: "Tamam teşekkürler"

DEĞERLENDİRME:
- professional_language: 90
- polite_tone: 85
- answer_relevance: 70 (yanlış bilgi!)
- solutionScore: 100 (müşteri memnun ama yanlış bilgi aldı!)
- Penalty: -25 (bonus misinformation - KRİTİK!)

FINAL SCORE: 64
```

### Örnek 4: Oyun Hatası Doğru Yönetim

```
Müşteri: "Oyunda hata var, 12.000 TL yerine 995 TL aldım!"
Temsilci: "Hemen kontrol ediyorum. Oyun ID ve replay linkini paylaşabilir misiniz?"
Müşteri: [Replay linki]
Temsilci: "Sağlayıcıdan detaylı kontrol istiyorum, 20-25 dakika sürebilir"
... 22 dakika ...
Temsilci: "✅ Kontrol ettim, 11.005 TL hesabınıza eklendi. Özür dileriz"

DEĞERLENDİRME:
- professional_language: 95
- polite_tone: 95
- answer_relevance: 100 (proaktif!)
- solution_focused: 100
- first_response_quality: 95
- solutionScore: 100 (tam çözüm!)
- Bonus: +8 (proaktif replay teklifi)
- Penalty: -3 (15-30 dk oyun kontrolü - normal)

BASE SCORE: 98
FINAL SCORE: 103 → Cap: 100
```

### Örnek 5: Kumar Bağımlısına Bonus Teklifi (KRİTİK HATA!)

```
Müşteri: "Çok para kaybettim, hesabımı kapatın"
Temsilci: "100 TL bonus vereyim, biraz daha oynayın"

DEĞERLENDİRME:
- professional_language: 60 (etik ihlal!)
- polite_tone: 70
- answer_relevance: 20 (müşteri kapatmak istiyor!)
- solution_focused: 10 (çözüm odaklı değil, tersine teşvik)
- solutionScore: 10 (çözümsüz)
- Penalty: -30 (unethical gambling encouragement - EN KRİTİK!)

BASE SCORE: 28
FINAL SCORE: 0 (28 - 30 = -2 → cap at 0)
```

### Örnek 6: Agent Cevap Vermedi

```
Müşteri: "Para çekimim neden beklemede?"
Müşteri: "Kontrol eder misiniz?"
Müşteri: "Neden cevap yok?"
... AGENT MESAJI YOK ...

DEĞERLENDİRME:
- professional_language: 0
- polite_tone: 0
- answer_relevance: 0
- solutionScore: 10 (çözümsüz)

FINAL SCORE: 4
```

---

## 📋 JSON FORMAT

```json
{
  "chat_topic": "Müşterinin asıl konusu (5-6 kelime max)",
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
    "critical_errors": [
      "Spesifik hatalar - hangi mesajda ne söylendi/yapılmadı"
    ],
    "improvement_areas": [
      "Geliştirilebilir noktalar - somut örneklerle"
    ],
    "misinformation": [
      "Yanlış bilgiler - ne söylendi, doğrusu ne"
    ]
  },
  "positive_aspects": {
    "strengths": ["İyi yapılan şeyler"],
    "good_practices": ["Örnek davranışlar"]
  },
  "recommendations": "Detaylı öneriler ve eğitim noktaları",
  "sentiment": "positive|neutral|negative",
  "requires_attention": true|false,
  "ai_summary": "Kısa özet (max 200 karakter)"
}
```

**ÖNEMLİ:** `overall_score` alanını JSON'a **ekleme**! Sistem tarafından otomatik hesaplanacak.

---

## 🎯 HATIRLANMASI GEREKENLER

1. **Müşteri küfrü = Temsilci puanını ETKİLEMEZ** ✅
2. **Bekleme süreleri sektöre göre değerlendirilir** (30 dk oyalama DEĞİL!) ✅
3. **Çözüm sonucu %38 ağırlık** (en önemli faktör) ✅
4. **Standart yanıtlar normal** (copy-paste işaretleme sadece 10+) ✅
5. **Bonus şartları yanlış = -25 puan** (KRİTİK!) ✅
6. **Kumar bağımlısına bonus = -30 puan** (ETİK İHLAL!) ✅
7. **Oyun hatası yok sayma = -20 puan** (MÜŞTERİ HAKKI!) ✅
8. **Müşteri sinirli = Normal** (sektör gerçeği, agent suçlu değil) ✅

---

**Bu prompt ile casino sektörüne %100 özel, adil ve eksiksiz değerlendirme yapılacak!** 🎰✨
