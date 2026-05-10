# 🧠 RAG Backfill Script

## Geçmiş İtirazları Toplu Öğrenme

Bu script mevcut tüm `objection_logs` kayıtlarını RAG sistemine aktarır.

---

## 🎯 Ne Yapar?

1. `objection_logs` tablosundan **tamamlanmış** itirazları alır
2. Her birini **embedding'e çevirir** (384-dim vector)
3. `objection_embeddings` tablosuna kaydeder
4. AI bir anda **tüm geçmiş hatalardan öğrenir**!

---

## 🚀 Nasıl Kullanılır?

### **1. Önce Dry Run (Test)**

Hiçbir değişiklik yapmadan ne olacağını gör:

```bash
npm run rag:backfill:dry
```

**Çıktı:**
```
🔍 DRY RUN - Preview (first 5):

1. Müşteri küfür etti ama temsilci sakin kaldı
   Score: 45 → 78 (+33)
   ID: abc-123

2. Temsilci çok yavaş yanıt verdi
   Score: 85 → 62 (-23)
   ID: def-456

... and 95 more

✅ Dry run complete.
```

---

### **2. Gerçek Backfill (Canlı)**

```bash
# Service role key gerekli
export SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Tüm itirazları işle (max 1000)
npm run rag:backfill
```

**Çıktı:**
```
🚀 RAG Backfill Script Started

📊 Found 127 objections to process:
   Average score change: 18.3 points
   Maximum score change: 45 points

🔄 Creating embeddings...

[1/127] Processing: Müşteri küfür etti ama temsilci...
   ✅ Embedded (severity: severe, diff: +33)

[2/127] Processing: Temsilci çok yavaş yanıt verdi...
   ✅ Embedded (severity: moderate, diff: -23)

...

📊 BACKFILL SUMMARY
Total processed: 127
✅ Success: 126
❌ Failed: 1
Success rate: 99.2%

🎉 AI has learned from these past objections!
```

---

### **3. Sınırlı Backfill (İlk 50)**

Test için sadece ilk 50 kaydı işle:

```bash
npm run rag:backfill:limit
```

Veya custom limit:

```bash
npx tsx scripts/backfill-rag-embeddings.ts --limit=20
```

---

## 🔑 Service Role Key Nereden Alınır?

1. Supabase Dashboard → https://supabase.com/dashboard/project/tlpguwiymccjxfypcpkd/settings/api
2. **Project API keys** bölümü
3. **service_role** key'i kopyala (secret!)
4. `.env` dosyasına ekle:

```bash
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ey...
```

Veya direkt export et:

```bash
export SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ey...
```

---

## 📊 İşlem Sonrası Kontrol

### **Kaç embedding oluştu?**

```sql
SELECT COUNT(*) as total_embeddings
FROM objection_embeddings;
```

### **En önemli dersler:**

```sql
SELECT 
  objection_reason,
  score_difference,
  severity,
  usage_count
FROM objection_embeddings
ORDER BY ABS(score_difference) DESC
LIMIT 10;
```

### **Hangi itirazlar henüz embed edilmedi?**

```sql
SELECT COUNT(*) as remaining
FROM objection_logs
WHERE new_score IS NOT NULL
  AND embedding_id IS NULL;
```

---

## ⚠️ Önemli Notlar

1. **Service role key gizli!** `.env` veya environment variable kullan
2. **Rate limiting:** Script otomatik 100ms bekler (API yükünü azaltır)
3. **Idempotent:** Aynı script'i birden fazla çalıştırabilirsin (duplicate yapmaz)
4. **Hugging Face API:** Ücretsiz tier kullanıyor, yavaş olabilir
5. **Fallback:** HF API çökerse pseudo-embedding kullanır

---

## 🧪 Örnek Senaryo

### **Öncesi:**
```sql
SELECT COUNT(*) FROM objection_embeddings;
-- Result: 0
```

### **Backfill:**
```bash
npm run rag:backfill
```

### **Sonrası:**
```sql
SELECT COUNT(*) FROM objection_embeddings;
-- Result: 127

-- AI şimdi 127 geçmiş hatadan öğrendi!
```

---

## 🎯 Beklenen Sonuç

- ✅ Eski tüm itirazlar RAG sisteminde
- ✅ AI bir anda deneyimli hale gelir
- ✅ İlk günden itibaren doğru analizler
- ✅ Manager itiraz oranı düşer

---

## 🔧 Troubleshooting

### "SUPABASE_SERVICE_ROLE_KEY required"
→ Service role key'i set et (yukarıdaki adımlar)

### "HTTP 503: Model is loading"
→ Hugging Face API modeli yüklüyor, birkaç dakika bekle ve tekrar çalıştır

### "Embedding failed"
→ Normal, fallback pseudo-embedding kullanılır

### "Too many requests"
→ `--limit=10` ile küçük batch'ler halinde çalıştır

---

**Sorular?** Kodu oku: `scripts/backfill-rag-embeddings.ts`
