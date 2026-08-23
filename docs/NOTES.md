# ZEMA — Yapılacaklar / Bilinen Eksikler

## 🔴 KRİTİK YOL — 24 Ağustos, teslime ~2 gün

Kod tarafı teslim edilebilir durumda. **Kalan iki zorunlu çıktı kod değil:**

- [ ] **İş Modeli Canvası** — 9 kutu. §7'de "paralel yürüyen, kod dışı
      teslimat" olarak işaretli, henüz hiç başlanmadı.
- [ ] **Girişim Sunumu (pptx)** — Problem → Çözüm → Nasıl Çalışır →
      Farklılaşma → Etki → Ekip → Sonraki Adımlar. Henüz başlanmadı.

26 Ağustos 10:00'da **üç çıktı birlikte** isteniyor (§7): canlıda çalışan
uygulama ✅, İş Modeli Canvası ❌, Girişim Sunumu ❌. Uygulama tamam;
kritik yol artık bu ikisi. Ölçülmüş sayılar sunuma malzeme:
57/57 kanıt doğrulama, 54 kontrol, 9 rapor, 0 uydurma.

## 📋 Eski sıra (tamamlandı)

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

### Action yetkilendirmesi — KAPATILDI (23 Ağustos)

Sekiz mutasyon action'ının hepsinde `authorize()` var. Hakem action'larında
ayrıca `assertReportAccess()`: hakem A, hakem B'nin raporunu mühürleyemez.
Aktör artık oturumdan alınıyor (önce "herhangi bir hakem" sorgulanıyordu).

Gerçek exploit denemesiyle doğrulandı: yarışmacı oturumuyla Next.js action
protokolü üzerinden `publishFeedback` çağrıldı → üç action da
"yetkiniz yok (rolünüz: YARIŞMACI)" döndü, DB değişmedi.

### Auth sonrası kalan açıklar

- [x] ~~`/evaluation/assignments`~~ — yapıldı. Manuel atama + "dengeli dağıt".
      Seed hâlâ ilk atamayı yapıyor (boş DB'de hakem ekranı boş kalmasın).


## ✅ Kozmetik cila — TAMAMLANDI (24 Ağustos)

- [x] Ana sayfa üst menüsü: "Nasıl Çalışır" ve "Roller" artık çalışan sayfa
      içi çapa linkleri. "İletişim" kaldırıldı — verilecek bir iletişim
      bilgisi yoktu ve ölü link jüriye kötü görünür. Ayrıca yeni bir
      "Roller" bölümü eklendi: şartnamenin dört rol gereksinimini ve her
      rolün kayıt koduyla mı açıldığını doğrudan gösteriyor.
- [x] Placeholder kontrastı: `placeholder:text-ink/40` eklendi ve "Ad Soyad"
      ipucu jenerikleştirildi ("Adınız ve soyadınız"). Tailwind v4 preflight
      placeholder'ı currentColor'ın %50'si yapıyor; Ink Navy üzerinde bu
      fazla koyu kalıyor ve ipucu dolu bir DEĞER gibi okunuyordu.

## ✂️ Eklenmeyecek — karar verildi

- **Demo sırasında canlı rapor yükleme.** Production'da `MOCK_AI=true`
  kalıyor; canlı yükleme fixture çıktısı üretir. Dokuz rapor gerçek Gemini
  analizinden geçmiş, DB'de hazır. PLAN.md §9 buna göre güncellendi.

- **§9 adım 4, AI vs Hakem kalibrasyon tablosu.** §8 kesme listesinde 5.
  sıradaydı. İki gün kaldığı ve demo senaryosu bu adım olmadan da güçlü
  olduğu için ATLANDI. Demo anlatısından da çıkarılmalı.

---

## 🔧 Gün 3 — AI hattı

- [ ] **Örtük önbellek gerçekten çalışıyor mu?** İlk çağrıda
      `cached_input_tokens: 0` çıktı (girdi 415 token, eşiğin çok altında).
      Gerçek 20 sayfalık raporlarda (12–15k token) bu alanı izle. Tutmuyorsa
      §5.1'deki istek sırası bozuluyor demektir.

- [ ] **`thinkingLevel: MINIMAL` model-bağımlı.** `gemini-3.5-flash`'ta
      çalışıyor, `gemini-3.7-flash` 400 veriyor. Model değişirse
      `lib/ai/config.ts`'teki `THINKING_LEVEL` tablosu yeniden doğrulanmalı.

---

## 🗄️ Gün 2–6 — veri katmanı


## 🚀 Demo günü kuralları

- **Canlı yükleme yok** (PLAN §9). `MOCK_AI=true` kalıyor.
- **Kota: model başına günde 20 istek.** Demo günü deneme analizi çalıştırma.
- `NEXT_PUBLIC_DEMO_MODE=true` kalıyor — `/demo` rol geçişinin tek yolu.
  Auth bağlandı ama rol başına ayrı giriş yapmak demoyu yavaşlatır.

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
