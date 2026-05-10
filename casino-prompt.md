# 🎰 CASINO/BAHİS SEKTÖRÜ - ÖZEL ANALİZ PROMPT'U

Aşağıdaki canlı destek sohbetini analiz et. Bu bir **casino/slot/bahis sitesi** destek hattıdır.

## 🚨 SEKTÖRE ÖZEL KRİTİK KURALLAR

### 1️⃣ MÜŞTERİ KÜFÜR/HAKARET YÖNETİMİ
**MUTLAK KURAL:** Müşteri küfür, hakaret veya saldırgan dil kullanmışsa:
- Bu durum **TEMSİLCİNİN DİL PUANINI HİÇ ETKİLEMEZ**
- Sadece temsilcinin bu duruma **NASIL KARŞILIK VERDİĞİNİ** değerlendir
- Temsilci sakin ve profesyonel kaldıysa → **Dil puanı: 90-100**
- Temsilci de küfürle karşılık verdiyse → **Dil puanı: 0**

**Örnek 1:**
- Müşteri: "Ananızı sikeyim"
- Temsilci: "Anlayışınızı rica ederim"
- **Değerlendirme:** professional_language: 100, polite_tone: 100
- **Not:** "Müşteri saldırgan dil kullandı, temsilci sakin kaldı" (improvement_areas'a yaz)

**Örnek 2:**
- Müşteri: "Şerefsizler"
- Temsilci: "Sakin olmanızı rica ederim, sorunuzu çözelim"
- **Değerlendirme:** professional_language: 95, polite_tone: 95

### 2️⃣ BEKLEME SÜRELERİ - SEKTÖRE ÖZEL TOLERANS

#### Para Yatırma/Çekme İşlemleri:
- **0-20 dakika:** Normal süreç → Penalty YOK
- **20-40 dakika:** Finans kontrolü → Penalty: **-5 puan**
- **40-60 dakika:** Uzun ama kabul edilebilir → Penalty: **-10 puan**
- **60+ dakika:** Çok uzun → Penalty: **-15 puan**

**NOT:** Para işlemleri finans ekibi onayı gerektirir. 30 dakika "oyalama" DEĞİLDİR!

#### Oyun Hatası/Replay Kontrolleri:
- **0-15 dakika:** Normal → Penalty YOK
- **15-30 dakika:** Sağlayıcı replay kontrolü → Penalty: **-3 puan**
- **30-45 dakika:** Uzun kontrol → Penalty: **-8 puan**
- **45+ dakika:** Çok uzun → Penalty: **-12 puan**

**NOT:** Oyun hatası sağlayıcıdan replay istenmesini gerektirir. 25 dakika normal bir süredir!

#### Bonus/Genel Bilgi:
- **0-5 dakika:** Normal → Penalty YOK
- **5-10 dakika:** Yavaş → Penalty: **-5 puan**
- **10+ dakika:** Çok yavaş → Penalty: **-10 puan**

### 3️⃣ ÇÖZÜM SONUCU = EN ÖNEMLİ FAKTöR

**Sorun çözüldü mü?** → Bu en önemli kriter!

#### TAM ÇÖZÜM:
- Müşteri parasını aldı
- Oyun hatası düzeltildi  
- Bonus yüklendi
- Hesap açıldı
→ **Minimum puan: 65** (süreç kötü olsa bile!)

#### KISMI ÇÖZÜM:
- Bilgi verildi, takip açıldı
- Kısmi ödeme yapıldı
→ **Minimum puan: 45**

#### ÇÖZÜMSÜZ:
- Müşteri cevapsız bırakıldı
- Sorun çözülmedi
- Agent kayıp
→ **Puan: 0-30 arası**

### 4️⃣ TEKRAR EDEN MESAJLAR

Casino destek ekipleri **standart yanıtlar** kullanır:
- "Hemen kontrol ediyorum ⏳"
- "Kısa bir süre beklemenizi rica ederim"
- "Bakiyeniz hesabınıza aktarılmıştır ✅"

**Bu mesajlar copy-paste olarak işaretlenMEMELİ!** → `copy_paste_detected: false`

Sadece **ÇOK FAZLA** tekrar (10+ kez aynı mesaj) varsa işaretle.

### 5️⃣ MÜŞTERİ SİNİR/STRES

Casino müşterileri genelde:
- Para kaybetmiş → **Çok sinirli**
- Para yatırımı gecikmede → **Panik + öfke**
- Bahis kaçırıyor → **Sabırsız**

**Temsilci bunu yönetemiyorsa bile:**
- Sorun çözüldüyse → **Puan düşürme!**
- Müşteri sonunda memnunsa → **customer_satisfaction: positive**

---

## 📊 PUANLAMA FORMÜLÜ (SEKTÖRE ÖZEL)

```javascript
const solutionScore =
  solutionAchieved === "tam" ? 100 :    // En önemli faktör!
  solutionAchieved === "kısmi" ? 55 :
  10;

const baseScore =
  (professional_language          * 0.10) +  // %10
  (polite_tone                    * 0.10) +  // %10
  (answer_relevance               * 0.12) +  // %12
  (first_response_quality         * 0.08) +  // %8
  (solution_focused               * 0.12) +  // %12
  (communication_effectiveness    * 0.10) +  // %10
  (solutionScore                  * 0.38);   // %38 🔥 EN YÜKSEK AĞIRLIK!

// Penalty hesaplama (sektöre özel)
let penalty = 0;

if (copy_paste_detected && count > 10)         penalty += 3;  // Çok fazla tekrar
if (stalling_detected && no_solution)          penalty += 5;  // Oyalama + çözümsüz
if (unnecessary_length)                        penalty += 2;
if (customer_satisfaction === "negative" 
    && solutionAchieved === "çözümsüz")        penalty += 8;  // Sadece çözümsüzse
if (misinformation.length > 0)                 penalty += 10;

// Bekleme penalty'si (yukarıdaki tabloya göre)
// Para işlemi: 30 dk → -5
// Oyun hatası: 25 dk → -3
// Bonus: 10 dk → -10

// Penalty cap: Max 20 (eski: 25)
penalty = Math.min(penalty, 20);

finalScore = Math.max(0, Math.min(100, Math.round(baseScore - penalty)));
```

---

## ✅ DOĞRU DEĞERLENDİRME ÖRNEKLERİ

### Örnek 1: Müşteri Küfür + Sorun Çözüldü
```
Müşteri: "Ananızı sikeyim, param nerde?"
Temsilci: "Anlayışınızı rica ederim, hemen kontrol ediyorum"
...
Temsilci: "✅ 20.000 TL hesabınıza yüklendi"
Müşteri: "Tamam"

PUANLAMA:
- professional_language: 100 (temsilci kibar kaldı)
- polite_tone: 95
- answer_relevance: 90
- solution_focused: 95
- solutionScore: 100 (tam çözüm!)
- Penalty: 0

FINAL SCORE: 92
```

### Örnek 2: Para Yatırma 35 Dakika Sürdü
```
Müşteri: "20.000 TL yatırdım, gelmedi"
Temsilci: "Hemen kontrol ediyorum"
... 35 dakika bekleme ...
Temsilci: "✅ Yüklendi"
Müşteri: "Teşekkürler"

PUANLAMA:
- professional_language: 85
- polite_tone: 85
- answer_relevance: 80
- solutionScore: 100 (tam çözüm!)
- Penalty: -5 (20-40 dk arası bekleme)

FINAL SCORE: 73
```

### Örnek 3: Oyun Hatası 25 Dakika Kontrol
```
Müşteri: "Oyunda hata var, 12.000 TL yerine 995 TL aldım"
Temsilci: "Replay kontrol ediyorum"
... 25 dakika ...
Temsilci: "✅ 11.005 TL eklendi"

PUANLAMA:
- solutionScore: 100 (tam çözüm!)
- Penalty: -3 (oyun replay 15-30 dk normal)

FINAL SCORE: 88
```

### Örnek 4: Cevap Yok (Gerçek 0 Puan)
```
Müşteri: "Oyunda hata var"
Müşteri: "Kontrol eder misiniz?"
Müşteri: "Neden cevap yok?"
... AGENT MESAJI YOK ...

PUANLAMA:
- professional_language: 0
- polite_tone: 0
- answer_relevance: 0
- solutionScore: 10 (çözümsüz)

FINAL SCORE: 4
```

---

## 🎯 HATIRLA:

1. **Müşteri küfrü = Temsilci puanını ETKİLEMEZ**
2. **Bekleme süreleri sektöre göre değerlendirilir** (30 dk oyalama DEĞİL!)
3. **Çözüm sonucu %38 ağırlık** (en önemli faktör)
4. **Standart yanıtlar normal** (copy-paste işaretleme)
5. **Müşteri sinirliyse bile sorun çözüldüyse yüksek puan ver**

---

## JSON FORMATI

```json
{
  "chat_topic": "Müşterinin asıl konusu (5-6 kelime)",
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
}
```

**ÖNEMLİ:** `overall_score` alanını ekleme! Sistem tarafından otomatik hesaplanacak.
