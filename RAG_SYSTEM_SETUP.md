# 🧠 RAG Sistemi Kurulum ve Kullanım Rehberi

## Ne Değişti?

✅ **Artık AI öğreniyor!** Her itiraz gelecek analizlere etki ediyor.

---

## 📋 Kurulum Adımları

### 1️⃣ Database Migration Uygula

```bash
# SQL dosyasını Supabase SQL Editor'da çalıştır
C:/Users/User/LiveTakipCom/supabase/migrations/20260422000002_add_rag_system.sql
```

**Veya:**

Supabase Dashboard → SQL Editor → Yeni Query → Dosyayı yapıştır → Run

**Bu oluşturur:**
- ✅ `pgvector` extension
- ✅ `objection_embeddings` tablosu
- ✅ `match_similar_objections()` fonksiyonu
- ✅ Vector similarity index

---

### 2️⃣ Edge Functions Deploy Et

```bash
# Embedding service
npx supabase functions deploy embed-text --project-ref tlpguwiymccjxfypcpkd

# Objection embedding creator
npx supabase functions deploy create-objection-embedding --project-ref tlpguwiymccjxfypcpkd

# RAG context retriever
npx supabase functions deploy get-objection-context --project-ref tlpguwiymccjxfypcpkd
```

**Access token kullan:**
```bash
export SUPABASE_ACCESS_TOKEN=sbp_YOUR_ACCESS_TOKEN_HERE
```

---

### 3️⃣ Analyze-Chat'e RAG Entegrasyonu

`supabase/functions/analyze-chat/index.ts` dosyasına şu kodları ekle:

**Analiz öncesi context al:**
```typescript
// BEFORE sending to Claude
let ragContext = '';

// Get similar objections for learning (RAG)
try {
  const contextResponse = await fetch(
    `${Deno.env.get('SUPABASE_URL')}/functions/v1/get-objection-context`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatSummary: conversationText.substring(0, 500), // First 500 chars
        brandId: chat.brand_id,
      }),
    }
  );

  if (contextResponse.ok) {
    const { context } = await contextResponse.json();
    
    if (context && context.length > 0) {
      ragContext = '\n\n📚 GEÇMİŞ İTİRAZ DERSLERİ:\n';
      ragContext += 'Daha önce yapılan hatalar ve düzeltmeler:\n\n';
      
      context.forEach((obj: any) => {
        ragContext += `${obj.index}. HATA: "${obj.reason}"\n`;
        ragContext += `   • Yanlış puan: ${obj.scoreBefore} → Doğru puan: ${obj.scoreAfter}\n`;
        if (obj.correction) {
          ragContext += `   • Düzeltme: ${obj.correction}\n`;
        }
        ragContext += `   • Önem: ${obj.severity}\n`;
        ragContext += `   • Benzerlik: %${obj.similarity}\n\n`;
      });
      
      ragContext += '⚠️ Bu örnekleri dikkate alarak aynı hataları yapma!\n';
      
      console.log(`RAG: Found ${context.length} relevant past objections`);
    }
  }
} catch (ragErr) {
  console.error('RAG context failed (non-fatal):', ragErr);
}

// ADD to prompt
finalPrompt += ragContext;
```

**İtiraz sonrası embedding oluştur:**
```typescript
// AFTER successful objection resolution
if (singleChatId && flagReason && calculatedScore !== oldScore) {
  // Create embedding for future learning
  try {
    await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/create-objection-embedding`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          objectionId: '[objection_logs_id]', // Get from DB
          objectionReason: flagReason,
          chatSummary: analysisResult.ai_summary,
          originalScore: oldScore,
          correctedScore: calculatedScore,
          correctionApplied: analysisResult.recommendations,
          tags: [analysisResult.sentiment, analysisResult.chat_topic],
        }),
      }
    );
    console.log('RAG: Objection embedded for future learning');
  } catch (embErr) {
    console.error('RAG embedding failed (non-fatal):', embErr);
  }
}
```

---

## 🎯 Nasıl Çalışır?

### **Akış:**

```
1. Yönetici İtiraz Eder
   ↓
2. create-objection-embedding çalışır
   ↓
3. Embedding oluşturulur (gte-small)
   ↓
4. objection_embeddings tablosuna kaydedilir
   ↓
5. Yeni Chat Gelir
   ↓
6. get-objection-context çalışır
   ↓
7. Benzer itirazlar bulunur (vector similarity)
   ↓
8. Claude'a context olarak gönderilir
   ↓
9. Claude öğrenmiş olarak analiz yapar
   ↓
10. AYNI HATA TEKRAR OLMAZ! ✅
```

---

## 📊 Veri Yapısı

### objection_embeddings Tablosu:
```sql
id                uuid
brand_id          uuid
objection_reason  text        -- "Müşteri küfür etti, temsilci sakin kaldı"
chat_summary      text        -- AI özeti
original_score    numeric     -- 45
corrected_score   numeric     -- 75
embedding         vector(384) -- [0.123, -0.456, ...]
severity          text        -- 'critical'
usage_count       integer     -- Kaç kez kullanıldı
last_used_at      timestamptz
tags              text[]      -- ['negative', 'para_cekme']
```

---

## 🧪 Test

### 1. Manuel Embedding Testi:
```bash
curl -X POST \
  https://tlpguwiymccjxfypcpkd.supabase.co/functions/v1/embed-text \
  -H "Authorization: Bearer [ANON_KEY]" \
  -H "Content-Type: application/json" \
  -d '{"text": "Müşteri küfür etti ama temsilci sakin kaldı"}'
```

### 2. Similarity Search Testi:
```sql
-- Supabase SQL Editor'da
SELECT * FROM match_similar_objections(
  '[0.123, -0.456, ...]'::vector(384),
  NULL, -- brand_id
  0.70, -- threshold
  5     -- limit
);
```

### 3. Frontend Test:
1. Bir chat'i analiz et
2. İtiraz et: "Müşteri agresif davrandı, temsilci iyi yönetti"
3. Başka benzer bir chat analiz et
4. Console'da "RAG: Found X relevant past objections" görmelisin
5. Claude bu sefer daha doğru puan vermeli

---

## 📈 İzleme

### Kaç İtiraz Öğrenildi:
```sql
SELECT 
  brand_id,
  COUNT(*) as total_objections,
  AVG(usage_count) as avg_usage,
  AVG(score_difference) as avg_correction
FROM objection_embeddings
GROUP BY brand_id;
```

### En Çok Kullanılan Dersler:
```sql
SELECT 
  objection_reason,
  usage_count,
  severity,
  score_difference
FROM objection_embeddings
ORDER BY usage_count DESC
LIMIT 10;
```

---

## 🎓 Beklenen Sonuçlar

### Önce (RAG Yok):
```
Chat 1: "Müşteri küfür etti" → Puan: 45 ❌
Yönetici itiraz eder → Düzeltilir: 75 ✅

Chat 2: "Müşteri saldırdı" → Puan: 40 ❌
Yönetici TEKRAR itiraz etmek zorunda ❌
```

### Sonra (RAG Var):
```
Chat 1: "Müşteri küfür etti" → Puan: 45 ❌
Yönetici itiraz eder → Düzeltilir: 75 ✅
→ Embedding oluşturulur

Chat 2: "Müşteri saldırdı" → RAG context bulunur
→ Claude benzer itirazı görür
→ Puan: 78 ✅ (İLK SEFERDE DOĞRU!)
```

---

## ⚠️ Önemli Notlar

1. **Hugging Face API** ücretsiz ama rate limit var
2. Fallback mekanizması var - API çökse bile çalışır
3. Embedding 384 boyutlu (gte-small)
4. Cosine similarity kullanılıyor
5. Threshold 0.70 (ayarlanabilir)
6. Her embedding kullanımında `usage_count` artıyor

---

## 🔧 Troubleshooting

### "Embedding failed" hatası:
- Hugging Face API yavaş olabilir, retry et
- Fallback pseudo-embedding kullanılır (performans düşer ama çalışır)

### "No similar objections found":
- Normal! İlk günlerde veri az
- 10-20 itiraz sonrası sistem öğrenmeye başlar

### "RPC error":
- Migration doğru uygulandı mı kontrol et
- `pgvector` extension kurulu mu?

---

**Kurulumu tamamladın mı? Test et ve sonucu söyle!** 🚀
