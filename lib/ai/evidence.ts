import { verdictFromScore, type CheckType } from './config';
import type { PayloadFor } from './schemas';
import type { Verdict } from './schemas';

/**
 * ZEMA — kanıt doğrulama (PLAN.md §4.5, "halüsinasyon kalkanı")
 *
 * İlke: modelin verdiği her alıntı rapor metninde GERÇEKTEN geçmeli.
 * Geçmiyorsa UI'da kırmızı "doğrulanamadı" rozeti çıkar ve o kriterin
 * confidence değeri düşürülür. Jüriye "halüsinasyona karşı ne yaptın?"
 * sorusunun cevabı bu.
 */

/**
 * Beyaz boşluk ve harf büyüklüğü farkını eler. Diyakritiği DEĞİŞTİRMEZ.
 *
 * ⚠️ Türkçe yerelli küçültme (`toLocaleLowerCase('tr')`) BİLİNÇLİ OLARAK
 * kullanılmıyor: Türkçe'de 'I' → 'ı' olduğu için modelin büyük harfle
 * verdiği doğru bir alıntı ("TEPKI SÜRESI") rapordaki "tepki süresi" ile
 * eşleşmez ve gerçek kanıta haksız yere "doğrulanamadı" rozeti basılır.
 * Yerelsiz küçültme I↔i'yi denk sayar; bu yöndeki hata (fazladan eşleşme)
 * ters yöndekinden (gerçek kanıtı reddetmek) çok daha az zararlı.
 *
 * U+0307 temizliği: JS'de 'İ'.toLowerCase() iki kod noktası üretir
 * (i + birleşen üst nokta). Temizlenmezse 'i' ile eşleşmez.
 *
 * Bilinen sınır: TAMAMI BÜYÜK HARF Türkçe alıntı 'exact' yerine 'diacritics'
 * döner, çünkü büyük harfte I/ı ayrımı bilgi olarak kaybolmuştur
 * ("YAPILMIŞTIR" → 'ı' mı 'i' mi belirsiz). Model rapordan birebir alıntı
 * yaptığı için pratikte karşılaşılmıyor; karşılaşılsa da sonuç "uydurma"
 * değil "yazım farklı" olduğundan güvenli tarafta kalıyor.
 */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/\u0307/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Diyakritikleri katlar: "tanımı" ve "tanimi" aynı dizeye iner.
 *
 * Bu ASIL doğrulama değil — teşhis amaçlı ikinci geçiş. Modelin
 * diyakritiksiz Türkçe yazma eğilimi (bkz. docs/NOTES.md) yüzünden
 * "uydurma alıntı" ile "doğru alıntı ama bozuk yazım" birbirine karışıyor.
 * İkisi hakem için TAMAMEN farklı şeyler, o yüzden ayrı raporlanıyor.
 */
const TR_FOLD: Record<string, string> = {
  ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g',
  ç: 'c', Ç: 'c', ö: 'o', Ö: 'o', ü: 'u', Ü: 'u',
  â: 'a', î: 'i', û: 'u',
};

export function foldDiacritics(s: string): string {
  const mapped = s.replace(/[ıİşŞğĞçÇöÖüÜâîû]/g, (ch) => TR_FOLD[ch] ?? ch);
  // Kalan bileşik karakterler (é, ï gibi) için NFD + birleşen işaretleri at.
  return mapped.normalize('NFD').replace(/\p{Mn}+/gu, '');
}

export type MatchKind =
  /** Rapor metninde birebir bulundu — kanıt geçerli. */
  | 'exact'
  /** Yalnızca diyakritikler katlanınca bulundu — muhtemelen model yazımı bozdu. */
  | 'diacritics'
  /** Hiç bulunamadı — alıntı uydurulmuş olabilir. */
  | 'none';

export type VerifiedQuote = {
  quote: string;
  section_ref: string;
  /** Yalnızca 'exact' güvenilir sayılır. */
  verified: boolean;
  match: MatchKind;
};

/** Rapor metnini bir kez hazırla, çok alıntıyı ona karşı sına. */
export function makeVerifier(reportText: string) {
  const exactHay = normalizeForMatch(reportText);
  const foldedHay = foldDiacritics(exactHay);

  return function check(quote: string): MatchKind {
    const needle = normalizeForMatch(quote);
    if (!needle) return 'none';
    if (exactHay.includes(needle)) return 'exact';
    if (foldedHay.includes(foldDiacritics(needle))) return 'diacritics';
    return 'none';
  };
}

export function verifyQuotes(
  reportText: string,
  quotes: ReadonlyArray<{ quote: string; section_ref: string }>,
): VerifiedQuote[] {
  const check = makeVerifier(reportText);
  return quotes.map((q) => {
    const match = check(q.quote);
    return { quote: q.quote, section_ref: q.section_ref, verified: match === 'exact', match };
  });
}

/**
 * PLAN.md §4.5: "Doğrulanmayan alıntı ... o kriterin confidence değeri
 * düşürülür." Doğrulanan alıntı oranıyla ölçeklenir.
 *
 * Alıntı hiç verilmemişse ceza YOK — model kanıt gösteremediğini dürüstçe
 * bildirmiş olabilir (§1). Ceza, kanıt İDDİA edip doğrulanamayana verilir.
 */
export function adjustConfidence(confidence: number, quotes: readonly VerifiedQuote[]): number {
  if (quotes.length === 0) return confidence;
  const exact = quotes.filter((q) => q.match === 'exact').length;
  const ratio = exact / quotes.length;
  return Math.round(confidence * ratio * 100) / 100;
}

// ─────────────────────────────────────────────────────────────
// analysis_results.verdict türetme
// ─────────────────────────────────────────────────────────────

/**
 * `analysis_results.verdict` her kontrol için doldurulmalı, ama §4.3/§4.4/§4.5/
 * §4.6 şemalarında verdict alanı yok. Bu fonksiyon her kontrolün kendi
 * çıktısından tek bir verdict türetir.
 *
 * Ortak kural (§1): model bir yargı İDDİA ediyor ama onu dayandıracak kanıt
 * göstermiyorsa sonuç `insufficient_evidence` olur — 'pass' veya 'fail' değil.
 */
export function deriveVerdict(
  checkType: CheckType,
  // Generic İSTEMİYORUZ: çağrı yerleri dinamik (job runner check_type'ı
  // çalışma anında biliyor) ve generic bir imza orada `Parameters<>` ile
  // yanlış örneklemeye yol açıyor. Tip güvenliği switch içinde sağlanıyor.
  payload: unknown,
  /** criteria_scoring için: doğrulanmış alıntı sayıları */
  evidence?: { totalQuotes: number; exactQuotes: number },
  /**
   * category_fit için rapor metni — `conflicting_quote` BUNA KARŞI doğrulanır.
   * Verilmezse doğrulama atlanır (eski davranış, geriye dönük uyumluluk).
   */
  reportText?: string,
): Verdict {
  switch (checkType) {
    case 'language_template':
    case 'title_content': {
      // Modelin kendi verdict'i BİLGİ olarak kullanılıyor ama kararı o
      // vermiyor: 'insufficient_evidence' ise saygı gösterilir, aksi hâlde
      // karar sayısal skordan ve eşikten türetilir (tek kaynak).
      const p = payload as { verdict?: Verdict; compliance_score?: number; alignment_score?: number };
      if (p.verdict === 'insufficient_evidence') return 'insufficient_evidence';
      const score = p.compliance_score ?? p.alignment_score;
      return typeof score === 'number' ? verdictFromScore(score) : 'insufficient_evidence';
    }

    case 'category_fit': {
      const p = payload as PayloadFor<'category_fit'>;
      if (p.is_consistent) return 'pass';
      const quote = p.conflicting_quote.trim();
      // Çelişki İDDİA edip alıntı göstermiyorsa kanıt yok (§1).
      if (!quote) return 'insufficient_evidence';

      /**
       * ALINTI GERÇEKTEN RAPORDA VAR MI?
       *
       * Şema yorumu "kanıt doğrulaması bu alana da uygulanır" diyordu ama
       * UYGULANMIYORDU — yalnızca alıntının BOŞ OLMADIĞINA bakılıyordu.
       * Yani model uydurma (veya bozuk) bir alıntıyla 'fail' verdirebiliyordu.
       *
       * Sahada yakalandı: R-798F26'nın category_fit çıktısında Türkçe
       * karakterler bozuktu ("10.T\u0092RKSAT ... Yarıœması") — modelin
       * kendi çıktı hatası; rapor metni tamamen sağlamdı. Doğrulama olsaydı
       * bu alıntı bulunamaz ve sonuç `insufficient_evidence` olurdu.
       *
       * makeVerifier diyakritik toleransı da sağlıyor (§4.5): birebir
       * bulunmasa da yalnızca şapka/nokta farkıysa kabul edilir.
       */
      if (reportText) {
        const match = makeVerifier(reportText)(quote);
        if (match === 'none') return 'insufficient_evidence';
      }
      return 'fail';
    }

    case 'similarity': {
      const p = payload as PayloadFor<'similarity'>;
      if (p.overlap_type === 'none') return 'pass';
      // Benzerlik İDDİA edip eşleşen pasaj göstermiyorsa kanıt yok.
      if (p.matched_passages.length === 0) return 'insufficient_evidence';
      return p.overlap_type === 'yakin_metin' || p.overlap_type === 'muhtemel_kopya'
        ? 'fail'
        : 'warn';
    }

    case 'criteria_scoring': {
      const p = payload as PayloadFor<'criteria_scoring'>;
      if (p.criteria.length === 0) return 'insufficient_evidence';
      // Alıntı verilmiş ama HİÇBİRİ doğrulanamamışsa çıktı güvenilmez.
      if (evidence && evidence.totalQuotes > 0 && evidence.exactQuotes === 0) {
        return 'insufficient_evidence';
      }
      // Kriter puanlaması da sayısal: kriterlerin max_score'a oranı eşiğe
      // vurulur. Böylece "bir kriter partial" gibi ikili kurallar yerine
      // diğer sayısal kontrollerle aynı mantık uygulanır.
      const avg =
        p.criteria.reduce((a, c) => a + (Number(c.score) || 0), 0) / p.criteria.length;
      return verdictFromScore(Math.round(avg * 10));
    }

    case 'feedback_synthesis':
      // Bu bir kapı değil, sentez. Kendi başına pass/fail üretmez.
      return 'pass';

    default: {
      const _exhaustive: never = checkType;
      throw new Error(`deriveVerdict: bilinmeyen check_type ${String(_exhaustive)}`);
    }
  }
}

/**
 * criteria_scoring çıktısını uçtan uca işler: her kriterin alıntılarını
 * doğrular, confidence'ı düşürür, kontrol seviyesi verdict'ini türetir.
 * Job runner'ın (Gün 3) doğrudan kullanacağı fonksiyon.
 */
export function processCriteriaScoring(
  reportText: string,
  payload: PayloadFor<'criteria_scoring'>,
) {
  const criteria = payload.criteria.map((c) => {
    const quotes = verifyQuotes(reportText, c.evidence_quotes);
    return {
      ...c,
      evidence_quotes: quotes,
      confidence_raw: c.confidence,
      confidence: adjustConfidence(c.confidence, quotes),
    };
  });

  const totalQuotes = criteria.reduce((a, c) => a + c.evidence_quotes.length, 0);
  const exactQuotes = criteria.reduce(
    (a, c) => a + c.evidence_quotes.filter((q) => q.match === 'exact').length,
    0,
  );
  const diacriticsQuotes = criteria.reduce(
    (a, c) => a + c.evidence_quotes.filter((q) => q.match === 'diacritics').length,
    0,
  );

  return {
    criteria,
    verdict: deriveVerdict('criteria_scoring', payload, { totalQuotes, exactQuotes }),
    evidenceStats: { totalQuotes, exactQuotes, diacriticsQuotes },
  };
}
