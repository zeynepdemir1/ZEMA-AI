import { extractText, getDocumentProxy } from 'unpdf';

/**
 * pdf.js hataları İngilizce ve teknik ("No password given", "Invalid PDF
 * structure."). Bunlar doğrudan kullanıcıya gösterildiğinde ne yapması
 * gerektiğini anlatmıyor. Bilinen durumları Türkçe ve eyleme dönük mesajla
 * karşılıyoruz; tanınmayanı olduğu gibi bırakıp bilgi kaybetmiyoruz.
 */
export function pdfErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : '';
  if (/password/i.test(raw)) {
    return (
      'PDF şifre korumalı olduğu için açılamadı. Şifreyi kaldırıp yeniden ' +
      'yükleyin (Yazdır → PDF olarak kaydet ile şifresiz bir kopya üretebilirsiniz).'
    );
  }
  if (/size is zero|empty/i.test(raw)) {
    return 'Dosya boş (0 bayt). Yükleme sırasında bir sorun olmuş olabilir, tekrar deneyin.';
  }
  if (/invalid pdf|structure|corrupt|xref/i.test(raw)) {
    return (
      'Dosya geçerli bir PDF gibi görünmüyor veya bozuk. Uzantısı .pdf olan ' +
      'ama aslında PDF olmayan dosyalar da bu hatayı verir.'
    );
  }
  return `PDF okunamadı: ${raw || 'bilinmeyen hata'}`;
}

export type PdfText = { text: string; pageCount: number };

/**
 * ⚠️ pdf.js verilen ArrayBuffer'ı DETACH ediyor. Baytları başka bir yerde
 * (Storage'a yükleme gibi) kullanacaksan kopyasını BU ÇAĞRIDAN ÖNCE al,
 * yoksa "Cannot perform ArrayBuffer.prototype.slice on a detached
 * ArrayBuffer" alırsın.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<PdfText> {
  const pdf = await getDocumentProxy(bytes);
  const pageCount = pdf.numPages;
  const { text } = await extractText(pdf, { mergePages: true });
  return { text: (Array.isArray(text) ? text.join('\n') : text).trim(), pageCount };
}
