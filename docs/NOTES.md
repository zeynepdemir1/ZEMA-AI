# ZEMA — Yapılacaklar / Bilinen Eksikler

## 🔴 Teslime kalan sıra (23 Ağustos → 26 Ağustos 10:00)

Sıralama gerekçesi: §9'daki demo zinciri şu an **iki yerde kopuk**. Auth bir
güvenlik açığı ama demoyu bozmuyor; kopuk halkalar bozuyor.

**Auth aynı gün yapılacak, yarına bırakılmayacak.** Gerekçe: RLS ilk kez
gerçekten devreye girdiğinde (şu an `service_role` ile baypas ediliyor)
beklenmedik erişim hataları çıkması muhtemel. Bunları çözmek için tampon
süre gerekiyor; son güne bırakılamaz.

1. **`/evaluation/feedback/[id]` — yayımlama akışı.** `feedback` satırı
   `is_published=false` olarak yazılıyor ve onu yayımlayacak hiçbir şey yok.
   Yani yarışmacı ekranı KALICI olarak boş. §9 adım 5 imkânsız. *Küçük iş.*
2. **`/submissions` + `/submissions/new` — yükleme arayüzü.** Rapor yükleme
   yalnızca `curl` ile çalışıyor. §9 adım 2 imkânsız. *Küçük iş.*
3. **Auth — TAM KAPSAM.** PLAN'da Gün 1 işi, gecikti. Detay aşağıda.
   *Büyük iş, ama bölünmez.*

Bunlardan sonra sırada: `/evaluation/assignments` (atama), `/admin/criteria`
ve `/admin/categories` (§8 kesme listesi 6: seed SQL ile yönetilebilir),
`/evaluation/calibration` (§8 kesme listesi 5: basit tablo yeter).

## ✅ Auth — TAMAMLANDI (23 Ağustos)

Tam kapsam yapıldı, yedek plana düşülmedi:

- `lib/supabase/server.ts` — cookie tabanlı oturumlu istemci + `currentUser()`
- `middleware.ts` — oturum yenileme + korumalı rota yönlendirmesi.
  `/api/jobs/tick` dahil, yani anonim kota tüketimi artık mümkün değil.
- Kayıt kodu ile rol atama (§3.2): kodlar yalnızca sunucuda okunuyor,
  istemciye sadece rolün ADI dönüyor. Kod yoksa `competitor`.
- KVKK onayı olmadan kayıt tamamlanmıyor (`kvkk_consent_at`).
- Role göre yönlendirme (`ROLE_HOME`) + sayfa seviyesinde `requireRole()`.
- **`lib/reports/queries.ts` artık oturumlu istemci kullanıyor → RLS gerçekten
  devrede.** Admin istemcisi yalnızca sistem işlerinde (job runner, rol atama,
  seed, storage yazımı).
- Dört rol de seed'lendi; şifre `zema-test-2026`.

Gerçek girişlerle doğrulandı:

| | /review | /evaluation | /admin | /submissions |
|---|---|---|---|---|
| Yarışmacı | → /submissions | → /submissions | → /submissions | **200** |
| Hakem | **200** | → /review | → /review | → /review |
| Değ. Yön. | **200** | **200** | → /evaluation | → /evaluation |
| Yarışma Yön. | **200** | **200** | **200** | → /admin |

Veri düzeyinde: anonim her tabloda 0 satır · yarışmacı `ai_criterion_scores`
0 satır (ham AI analizi gizli) · yarışmacının UPDATE denemesi 0 satır etkiledi
ve hiçbir veriyi değiştirmedi · hakem yalnızca ATANDIĞI raporu görüyor.

### Auth sonrası kalan açıklar

- [ ] **Server action'lar rol kontrolü yapmıyor.** `saveCriterionText`,
      `approveAllCriteria`, `publishFeedback`, `saveSimilarityThreshold`
      oturum ister (middleware) ama ROL kontrolü içermiyor. RLS yazmayı
      engelliyor (yarışmacı için 0 satır) ama `publishFeedback` ve
      `saveSimilarityThreshold` admin istemcisi kullandığı için RLS'i
      baypas ediyor → **giriş yapmış bir yarışmacı geri bildirim
      yayımlayabilir.** Action'lara `requireRole` eklenmeli.
- [ ] **`/evaluation/assignments` yok.** Atama şu an seed ile yapılıyor;
      hakem atanmamış raporu RLS gereği göremiyor.

---

## 🎨 Kozmetik cila (son gün)

- [ ] **Ana sayfa üst menüsündeki üç öğe tıklanamıyor.**
      `app/page.tsx:39-41` — "Nasıl Çalışır", "Roller", "İletişim" düz `<span>`,
      link değil; sadece "Giriş Yap" çalışıyor. Tasarım dosyasında da `<span>`
      olarak geliyorlardı, yani sadakat hatası değil — ama ürün boşluğu.
      *Çözüm:* Ya sayfa içi bölümlere `#` çapa linki yap (`Nasıl Çalışır` için
      §"NASIL ÇALIŞIR" bloğu hazır), ya da menüden tamamen çıkar. Yarı yolda
      bırakılmış link jüriye kötü görünür.

- [ ] **"Ad Soyad" placeholder'ı dolu değer gibi okunuyor.**
      `app/auth/auth-panel.tsx:126` — `placeholder="Zeynep Demir"`.
      Teknik olarak `value` değil, placeholder; ama Tailwind v4 preflight
      placeholder rengini `currentcolor %50` yapıyor → beyaz üstünde okunaklı
      koyu lacivert. Akla yatkın gerçek bir isimle birleşince ipucu değil
      içerik gibi görünüyor.
      *Çözüm:* Metni jenerik yap (`"Adınız ve soyadınız"`) **ve** placeholder'ı
      soluklaştır (`placeholder:text-ink/40`). Aynı gözden geçirmeyi diğer
      alanlara da uygula: `ad.soyad@ornek.com` ve `En az 8 karakter` talimat
      gibi okunuyor, sorun değil.

---

## 🔧 Gün 3 — AI hattı

- [ ] **Fixture'ların içi hâlâ boş.** `lib/ai/fixtures/` — 6 dosyanın 5'i
      `_TODO` yer tutucusu. PLAN.md §9'daki planlı kusurlara (R2 eksik bölüm,
      R3 başlık uyumsuzluğu, R4 kategori hatası, R7 kriterler arası ayrışma,
      R8 imla) göre doldurulmalı; yoksa mock modda ekranlar boş görünür.
      `feedback_synthesis.json` şema min kısıtları yüzünden zaten dolduruldu.

- [ ] **Örtük önbellek gerçekten çalışıyor mu?** İlk çağrıda
      `cached_input_tokens: 0` çıktı (girdi 415 token, eşiğin çok altında).
      Gerçek 20 sayfalık raporlarda (12–15k token) bu alanı izle. Tutmuyorsa
      §5.1'deki istek sırası bozuluyor demektir.

- [ ] **`thinkingLevel: MINIMAL` model-bağımlı.** `gemini-3.5-flash`'ta
      çalışıyor, `gemini-3.7-flash` 400 veriyor. Model değişirse
      `lib/ai/config.ts`'teki `THINKING_LEVEL` tablosu yeniden doğrulanmalı.

---

## 🗄️ Gün 2–6 — veri katmanı

- [ ] **`lib/design/mock-data.ts` Supabase sorgularıyla değiştirilmeli.**
      Sekiz ekranın hepsi şu an bu sabitlerden besleniyor. Şekiller PLAN.md
      §3'teki kolonlara yakın tutuldu, geçiş mekanik olmalı.

- [ ] **Rota kimlikleri rapor kodu (`R-0184`), UUID değil.** Gerçek `reports.id`
      UUID'lerine geçilince `/review/[id]` ve `/submissions/[id]` güncellenmeli.

- [ ] **Auth bağlanmadı.** `/auth` giriş butonu şu an doğrudan
      `/review/R-0184`'e yönlendiriyor. Gerçek akışta role göre yönlendirme
      olacak (PLAN.md §6).

---

## 🚀 Deploy / demo günü

- [ ] **`NEXT_PUBLIC_DEMO_MODE=false` yap** — auth bağlandıktan sonra.
      PLAN.md §6 üretimde kapalı olmasını istiyor; şu an açık çünkü `/demo`
      rol ekranlarına ulaşmanın tek yolu.
      ⚠️ `/demo` **statik** üretiliyor, yani kapı build anında kararlaşıyor —
      env'i değiştirmek yetmez, **redeploy** gerekir. (Ölçülerek doğrulandı.)

- [ ] **`MOCK_AI=false` yap** — yalnızca demo öncesi son doğrulamada, sonra
      hemen `true`'ya dön. Ücretsiz katman kotası sınırlı.

- [ ] **Supabase Auth redirect URL'ine Vercel domain'ini ekle.**
      Authentication → URL Configuration → `https://<proje>.vercel.app/**`.

- [ ] **Canlıda Türkçe glifleri gözle kontrol et** (ş ğ ı İ ç ö ü).
      `latin-ext` alt kümesi eklendi ama üretimde doğrulanmadı.

---

## ⚖️ Hukuki / uyum

- [ ] **KVKK aydınlatma metni gözden geçirilmeli.** `app/gizlilik/page.tsx`
      taslak; hukuki son hali onaylanmalı. Özellikle şu madde: ücretsiz
      Gemini katmanında gönderilen verilerin hizmet iyileştirme amacıyla
      kullanılabilmesi. Yarışmacıların rapor içeriği işlendiği için bu
      önemsiz bir detay değil — şartname KVKK uyumunu açıkça istiyor.

---

## 🧹 Temizlik (isteğe bağlı)

- [ ] **`lib/ai/call-claude-for-check.ts` adı yanıltıcı** — içinde
      `callModelForCheck()` var ve Gemini çağırıyor. `git mv` tek satır.

- [ ] **Tasarımdan kasıtlı alınmayanlar** — geri isteniyorsa:
      "TASARIM ÖNİZLEME" üst navigasyonu ve kayıt ekranındaki
      "KAYIT KODU ALANI · DURUM KARŞILAŞTIRMASI" paneli. İkisi de canvas
      scaffolding'i / tasarımcı notu olduğu için alınmadı.

- [ ] **`@anthropic-ai/sdk` paketi kurulu ama kullanılmıyor.** Sağlayıcı geri
      alınabilsin diye bırakıldı; hiçbir yerden import edilmediği için
      bundle'a girmiyor. Kalıcı karar verilince kaldırılabilir.
