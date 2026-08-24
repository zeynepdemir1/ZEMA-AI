import { getDocumentProxy } from 'unpdf';

/**
 * BİÇİM KURALLARINI ÖLÇER — modele SORMAZ.
 *
 * Neden ölçüm: çok-modlu analiz denendiğinde model, gerçekten iki tarafa
 * yaslı bir belgeyi "sola hizalı" diye raporladı (24 Ağustos, ölçümle
 * doğrulandı: satır sonları 566,7 ve 565,8 pt'de hizalıydı). Yazı tipi ve
 * hizalama piksel düzeyinde ölçüm isteyen özellikler; görsel yargı burada
 * güvenilir değil ve yanlış bir "kurala uymuyor" bulgusu yarışmacıyı
 * haksız yere cezalandırır.
 *
 * Ölçülebileni ölçüyoruz, yargı gerektireni modele bırakıyoruz. Ölçüm
 * sonuçları prompt'a OLGU olarak giriyor; model bunları yeniden
 * değerlendirmiyor, yalnızca genel uyum skorunda hesaba katıyor.
 */

export type FormatStatus = 'uygun' | 'uygun_degil' | 'degerlendirilemedi';

export type FormatFinding = {
  /** İnsan tarafından okunur kural — şablondaki ifadeyle. */
  rule: string;
  status: FormatStatus;
  /** ÖLÇÜLEN değer. "degerlendirilemedi" ise neden ölçülemediği. */
  evidence: string;
  /** Bulgunun sayfası; sayfa bazlı değilse 0. */
  page: number;
};

export type TemplateFormat = {
  font?: string;
  page?: string;
  alignment?: string;
  max_pages?: number;
  footer?: string;
};

/**
 * Metrik uyumlu yazı tipi eşlenikleri.
 *
 * LibreOffice ile üretilmiş bir PDF, belgede "Arial" yazsa bile
 * LiberationSans gömer — bunlar karakter genişlikleri birebir aynı olacak
 * şekilde tasarlanmış eşleniklerdir. Bunu bilmezsek LibreOffice'te yazılmış
 * HER raporu "yazı tipi kurala uymuyor" diye işaretlerdik.
 */
const FONT_EQUIVALENTS: Array<[RegExp, string[]]> = [
  [/arial|helvetica|liberationsans|liberation sans|nimbussans/i, ['arial', 'helvetica', 'liberation sans']],
  [/times|liberationserif|liberation serif|nimbusroman/i, ['times new roman', 'times', 'liberation serif']],
  [/calibri|carlito/i, ['calibri', 'carlito']],
  [/cambria|caladea/i, ['cambria', 'caladea']],
  [/courier|liberationmono|nimbusmono/i, ['courier new', 'courier', 'liberation mono']],
];

/** "BAAAAA+LiberationSans-Bold" → "LiberationSans" */
function cleanFontName(raw: string): string {
  return raw
    .replace(/^[A-Z]{6}\+/, '')
    .replace(/[-,](Bold|Italic|Oblique|Regular|BoldItalic|Light|Medium)$/i, '')
    .trim();
}

function fontsMatch(measured: string, expected: string): boolean {
  const m = measured.toLowerCase().replace(/[\s-]/g, '');
  const e = expected.toLowerCase();
  for (const [pattern, family] of FONT_EQUIVALENTS) {
    if (pattern.test(m) && family.some((f) => e.includes(f))) return true;
  }
  // Doğrudan ad eşleşmesi (eşlenik tablosunda olmayan yazı tipleri için)
  return e.includes(m) || m.includes(e.replace(/[\s-]/g, ''));
}

/** Bilinen sayfa boyutları, pt cinsinden (kısa × uzun kenar). */
const PAGE_SIZES: Array<{ name: string; w: number; h: number }> = [
  { name: 'A4', w: 595, h: 842 },
  { name: 'A3', w: 842, h: 1191 },
  { name: 'A5', w: 420, h: 595 },
  { name: 'Letter', w: 612, h: 792 },
  { name: 'Legal', w: 612, h: 1008 },
];

type TextItem = { str: string; transform: number[]; width: number; height: number; fontName: string };

export async function measureFormat(
  bytes: Uint8Array,
  spec: TemplateFormat,
): Promise<FormatFinding[]> {
  const pdf = await getDocumentProxy(bytes);
  const numPages = pdf.numPages;
  const out: FormatFinding[] = [];

  // ── 1) SAYFA SINIRI — en kesin ölçüm ──
  if (spec.max_pages && spec.max_pages > 0) {
    out.push({
      rule: `En fazla ${spec.max_pages} sayfa`,
      status: numPages <= spec.max_pages ? 'uygun' : 'uygun_degil',
      evidence:
        numPages <= spec.max_pages
          ? `Rapor ${numPages} sayfa — sınırın ${spec.max_pages - numPages} sayfa altında.`
          : `Rapor ${numPages} sayfa — sınırı ${numPages - spec.max_pages} sayfa aşıyor.`,
      page: 0,
    });
  }

  // ── 2) SAYFA BOYUTU VE YÖNÜ — MediaBox'tan ──
  const first = await pdf.getPage(1);
  const view = first.view as number[];
  const wPt = Math.round(view[2] - view[0]);
  const hPt = Math.round(view[3] - view[1]);
  const portrait = hPt >= wPt;
  const short = Math.min(wPt, hPt);
  const long = Math.max(wPt, hPt);
  const known = PAGE_SIZES.find((s) => Math.abs(s.w - short) <= 3 && Math.abs(s.h - long) <= 3);
  const sizeName = known?.name ?? `${wPt}×${hPt} pt`;
  const orient = portrait ? 'dikey' : 'yatay';

  if (spec.page) {
    const wantsPortrait = /dikey|portrait/i.test(spec.page);
    const wantsLandscape = /yatay|landscape/i.test(spec.page);
    const sizeOk = known ? spec.page.toLowerCase().includes(known.name.toLowerCase()) : false;
    const orientOk = wantsPortrait ? portrait : wantsLandscape ? !portrait : true;
    out.push({
      rule: spec.page,
      status: known && sizeOk && orientOk ? 'uygun' : !known ? 'degerlendirilemedi' : 'uygun_degil',
      evidence: known
        ? `Ölçülen: ${sizeName} ${orient} (${wPt}×${hPt} pt).`
        : `Sayfa boyutu tanınan bir standarda uymuyor: ${wPt}×${hPt} pt.`,
      page: 1,
    });
  }

  // ── Metin öğelerini topla (yazı tipi, punto, hizalama, altbilgi için) ──
  const pagesText: Array<{ items: TextItem[]; height: number }> = [];
  const fontNames = new Map<string, string>();
  for (let n = 1; n <= numPages; n++) {
    const page = await pdf.getPage(n);
    // getOperatorList commonObjs'u doldurur — gerçek yazı tipi adı ancak
    // bundan sonra okunabiliyor.
    await page.getOperatorList();
    const tc = await page.getTextContent();
    const items = (tc.items as TextItem[]).filter((i) => i.str.trim().length > 0);
    for (const i of items) {
      if (!fontNames.has(i.fontName)) {
        const f = page.commonObjs.get(i.fontName) as { name?: string } | undefined;
        fontNames.set(i.fontName, cleanFontName(f?.name ?? i.fontName));
      }
    }
    const v = page.view as number[];
    pagesText.push({ items, height: v[3] - v[1] });
  }
  const allItems = pagesText.flatMap((p) => p.items);

  // ── 3) YAZI TİPİ VE PUNTO — karakter sayısına göre BASKIN olan ──
  if (spec.font) {
    if (allItems.length === 0) {
      out.push({
        rule: spec.font,
        status: 'degerlendirilemedi',
        evidence: 'PDF içinde metin katmanı yok (taranmış olabilir).',
        page: 0,
      });
    } else {
      const byFont = new Map<string, number>();
      const bySize = new Map<number, number>();
      for (const i of allItems) {
        const name = fontNames.get(i.fontName) ?? i.fontName;
        byFont.set(name, (byFont.get(name) ?? 0) + i.str.length);
        // height = punto. Başlıklar gövdeyi bastırmasın diye karakter
        // sayısıyla ağırlıklandırılıyor.
        const pt = Math.round(i.height);
        if (pt > 0) bySize.set(pt, (bySize.get(pt) ?? 0) + i.str.length);
      }
      const domFont = [...byFont.entries()].sort((a, b) => b[1] - a[1])[0];
      const domSize = [...bySize.entries()].sort((a, b) => b[1] - a[1])[0];
      const wantPt = Number(/(\d{1,2})\s*(?:pt|punto)/i.exec(spec.font)?.[1] ?? 0);
      const nameOk = fontsMatch(domFont[0], spec.font);
      const sizeOk = wantPt === 0 || domSize[0] === wantPt;
      const substitute = !spec.font.toLowerCase().includes(domFont[0].toLowerCase());

      out.push({
        rule: spec.font,
        status: nameOk && sizeOk ? 'uygun' : 'uygun_degil',
        evidence:
          `Gövde metninin baskın yazı tipi ${domFont[0]}, baskın punto ${domSize[0]}.` +
          (nameOk && substitute
            ? ' (Metrik uyumlu eşlenik — LibreOffice/Google Docs ile üretilen PDF\'ler Arial yerine' +
              ' Liberation Sans gömer; karakter genişlikleri birebir aynıdır.)'
            : '') +
          (wantPt > 0 && !sizeOk ? ` Şablon ${wantPt} punto istiyor.` : ''),
        page: 0,
      });
    }
  }

  // ── 4) HİZALAMA — satır sağ kenarlarının dağılımından ──
  if (spec.alignment) out.push(measureAlignment(pagesText, spec.alignment));

  // ── 5) ALTBİLGİ — sayfanın alt %8'indeki metin ──
  if (spec.footer) out.push(measureFooter(pagesText, spec.footer));

  return out;
}

/**
 * İki tarafa yaslı bir paragrafta SON SATIR HARİÇ tüm satırlar aynı sağ
 * kenarda biter. Sola hizalıda sağ kenar tırtıklıdır.
 *
 * Yöntem: yalnızca BASKIN SOL KENARDAN başlayan satırlar (gövde
 * paragrafları) alınır — tablo hücreleri ve girintili bloklar dışarıda
 * kalır. Sağ kenarın en büyük değeri sütun kenarı sayılır; ona 3 pt
 * yaklaşan satırlar "tam satır"dır. Tam satırların oranı yüksekse yaslı,
 * düşükse tırtıklı.
 */
function measureAlignment(
  pages: Array<{ items: TextItem[]; height: number }>,
  rule: string,
): FormatFinding {
  type Line = { left: number; right: number; chars: number };
  const lines: Line[] = [];
  for (const pg of pages) {
    const byY = new Map<number, TextItem[]>();
    for (const i of pg.items) {
      const y = Math.round(i.transform[5]);
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y)!.push(i);
    }
    for (const items of byY.values()) {
      const left = Math.min(...items.map((i) => i.transform[4]));
      const right = Math.max(...items.map((i) => i.transform[4] + i.width));
      const chars = items.reduce((a, i) => a + i.str.length, 0);
      if (chars >= 20) lines.push({ left, right, chars });
    }
  }
  if (lines.length < 6) {
    return {
      rule,
      status: 'degerlendirilemedi',
      evidence: `Hizalama ölçümü için yeterli gövde satırı yok (${lines.length} satır).`,
      page: 0,
    };
  }

  // Baskın sol kenar = gövde paragraflarının başlangıcı
  const leftCounts = new Map<number, number>();
  for (const l of lines) {
    const k = Math.round(l.left);
    leftCounts.set(k, (leftCounts.get(k) ?? 0) + 1);
  }
  const domLeft = [...leftCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const body = lines.filter((l) => Math.abs(l.left - domLeft) <= 1.5);
  if (body.length < 5) {
    return {
      rule,
      status: 'degerlendirilemedi',
      evidence: `Baskın sol kenardan başlayan yeterli satır yok (${body.length} satır).`,
      page: 0,
    };
  }

  const columnRight = Math.max(...body.map((l) => l.right));
  // Paragrafın SON satırı kısa olabilir; onları "tam satır" saymıyoruz.
  const nearFull = body.filter((l) => l.right > columnRight - 40);
  const flush = nearFull.filter((l) => columnRight - l.right <= 3);
  const ratio = nearFull.length ? flush.length / nearFull.length : 0;

  if (nearFull.length < 4) {
    return {
      rule,
      status: 'degerlendirilemedi',
      evidence: `Sütun kenarına ulaşan yeterli satır yok (${nearFull.length} satır).`,
      page: 0,
    };
  }

  const justified = ratio >= 0.8;
  return {
    rule,
    status: /yaslı|justif/i.test(rule)
      ? justified
        ? 'uygun'
        : 'uygun_degil'
      : justified
        ? 'uygun_degil'
        : 'uygun',
    evidence:
      `Sütun kenarına ulaşan ${nearFull.length} satırın ${flush.length}'i ` +
      `(%${Math.round(ratio * 100)}) tam olarak ${columnRight.toFixed(1)} pt'de bitiyor — ` +
      (justified ? 'iki tarafa yaslı.' : 'sağ kenar tırtıklı, yaslı değil.'),
    page: 0,
  };
}

/**
 * Altbilgi: sayfanın alt %8'indeki metin. Kuralın "takım adı + sayfa
 * numarası" istediği durumda sayfa numarası ARANIR (rakam), takım adı ise
 * bilinmediği için yalnızca altbilginin VARLIĞI ve içeriği raporlanır —
 * hakem okuyup karar verir.
 */
function measureFooter(
  pages: Array<{ items: TextItem[]; height: number }>,
  rule: string,
): FormatFinding {
  const band = 0.08;
  /**
   * Alt banttaki her metin altbilgi DEĞİL: sayfa sonuna kadar uzayan gövde
   * paragrafı da bu banda düşüyor ve "altbilgi var" gibi görünüyordu
   * (ölçümde yakalandı: 8 sayfalık raporun 5 sayfasında "altbilgi" olarak
   * gövde metni raporlanmıştı). Gerçek altbilgi gövdeden BOŞLUKLA ayrılır.
   *
   * Eşik sabit pt DEĞİL, belgenin kendi satır aralığına göre: ölçümde
   * gerçek altbilginin boşluk/satır-aralığı oranı 32,9; gövde metninin
   * son satırında 0,74–1,00 çıktı. 2,0 ikisini geniş payla ayırıyor ve
   * punto değiştiğinde de geçerli kalıyor (sabit pt kalmazdı).
   */
  const MIN_GAP_RATIO = 2.0;
  const found: Array<{ page: number; text: string }> = [];
  pages.forEach((pg, idx) => {
    const limit = pg.height * band;
    const ys = [...new Set(pg.items.map((i) => Math.round(i.transform[5])))].sort((a, b) => a - b);
    const inBand = ys.filter((y) => y <= limit);
    if (inBand.length === 0) return;
    const footerTop = Math.max(...inBand);
    const above = ys.filter((y) => y > footerTop);
    const gap = above.length ? Math.min(...above) - footerTop : Infinity;

    // Belgenin baskın satır aralığı (medyan) — eşiğin ölçeği.
    const gaps = ys.slice(1).map((y, i) => y - ys[i]).sort((a, b) => a - b);
    const spacing = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 12;
    if (gap < spacing * MIN_GAP_RATIO) return; // gövde metninin devamı, altbilgi değil

    const txt = pg.items
      .filter((i) => i.transform[5] <= limit)
      .sort((a, b) => a.transform[4] - b.transform[4])
      .map((i) => i.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (txt) found.push({ page: idx + 1, text: txt });
  });

  if (found.length === 0) {
    return {
      rule,
      status: 'uygun_degil',
      evidence: `Hiçbir sayfanın alt %${band * 100}'inde altbilgi metni bulunamadı.`,
      page: 1,
    };
  }
  const withNumber = found.filter((f) => /\d/.test(f.text));
  const allPages = found.length === pages.length;
  return {
    rule,
    status: allPages && withNumber.length === found.length ? 'uygun' : 'uygun_degil',
    evidence:
      `${found.length}/${pages.length} sayfada altbilgi var, ` +
      `${withNumber.length} tanesinde sayı geçiyor. ` +
      `Örnek (s.${found[0].page}): "${found[0].text.slice(0, 60)}"`,
    page: found[0].page,
  };
}
