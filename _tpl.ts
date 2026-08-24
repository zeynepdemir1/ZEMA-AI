import { readFileSync } from 'node:fs';
import { extractPdfText } from '@/lib/reports/pdf';
import { extractTemplateSpec } from '@/lib/ai/extract-template';

async function main() {
  const bytes = new Uint8Array(readFileSync(process.env.ZEMA_TPL!));
  const { text, pageCount } = await extractPdfText(bytes);
  console.log(`şablon PDF: ${pageCount} sayfa, ${text.length} karakter metin\n`);

  const r = await extractTemplateSpec(text);
  const s = r.spec;
  console.log('mock:', r.mocked, '· model:', r.model);
  console.log('token:', r.usage ? `${r.usage.input_tokens} girdi / ${r.usage.output_tokens} çıktı` : '—');
  console.log('\nrapor türü :', s.report_type);
  console.log('dil        :', s.language);
  console.log(`zorunlu bölümler (${s.required_sections.length}):`);
  s.required_sections.forEach((x, i) => console.log(`  ${String(i + 1).padStart(2)}. ${x}`));
  console.log('\nbiçim:');
  console.log('  yazı tipi :', s.format.font || '(boş)');
  console.log('  sayfa     :', s.format.page || '(boş)');
  console.log('  hizalama  :', s.format.alignment || '(boş)');
  console.log('  maks sayfa:', s.format.max_pages || '(0)');
  console.log('  altbilgi  :', s.format.footer || '(boş)');
  console.log('  atıf      :', s.citation_format || '(boş)');
  console.log(`\niçerik kuralları (${s.content_rules.length}):`);
  s.content_rules.forEach(x => console.log('  ·', x));
  console.log('\nşablonda BELİRTİLMEMİŞ:', s.not_specified.length ? s.not_specified.join(', ') : '(yok)');

  console.log(`\nALINTI DOĞRULAMA (${r.quotes.filter(q => q.verified).length}/${r.quotes.length} birebir bulundu):`);
  for (const q of r.quotes) {
    console.log(`  ${q.verified ? '✓' : '✗ ' + q.match} [${q.section_ref}] "${q.quote.slice(0, 62)}"`);
  }

  // Gerçek şablonda yazan değerlerle karşılaştır
  console.log('\nDOĞRULUK KONTROLÜ (şablonda gerçekten yazanlar):');
  const checks: Array<[string, boolean]> = [
    ['maks 15 sayfa', s.format.max_pages === 15],
    ['Arial 11', /arial/i.test(s.format.font) && /11/.test(s.format.font)],
    ['A4 dikey', /a4/i.test(s.format.page)],
    ['iki tarafa yaslı', /yaslı|justif/i.test(s.format.alignment)],
    ['IEEE atıf', /ieee/i.test(s.citation_format)],
    ['altbilgi: takım adı + sayfa no', /takım/i.test(s.format.footer) && /sayfa/i.test(s.format.footer)],
    ['dil tr', s.language === 'tr'],
    ['Risk Değerlendirmesi bölümü', s.required_sections.some(x => /risk/i.test(x))],
    ['Güvenlik Önlemleri bölümü', s.required_sections.some(x => /güvenlik/i.test(x))],
    ['Takım Şeması bölümü', s.required_sections.some(x => /takım/i.test(x))],
    ['bölüm sayısı 10', s.required_sections.length === 10],
    ['numaralandırma başlıkta YOK', !s.required_sections.some(x => /^\d+\.\d/.test(x))],
  ];
  for (const [n, ok] of checks) console.log(`  ${ok ? '✓' : '✗'} ${n}`);
  console.log(`\n  ${checks.filter(c => c[1]).length}/${checks.length} doğru`);
}
main().catch(e => { console.error('HATA:', e.message); process.exit(1); });
