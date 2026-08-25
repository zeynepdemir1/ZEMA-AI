"""ZEMA — tüm sayfalarda WCAG AA metin kontrastı taraması.

Çalıştırma:  python3 scripts/aa-scan.py
Çıkış kodu:  0 = ihlal yok, 1 = ihlal var (CI'da kullanılabilir).

T3 renk katmanı eklendikten sonra (25 Ağustos) ihlaller ölçülerek bulundu ve
düzeltildi; bu betik o taramanın tekrar edilebilir hali. Renk değiştiren her
turdan sonra çalıştır — göz kararı yeterli değil, ilk turda "koyu zeminli"
sanılan app/page.tsx'in çoğu açık zemin çıkmıştı.

Yöntem: kaynaktaki her `text-*` sınıfı toplanıp gerçek sRGB kontrast oranı
hesaplanır. Zemin, dosya/bölge bazında belirlenir — koyu yüzeyler elle
listelenmiştir (başka koyu yüzey yok, `bg-ink` taraması ile doğrulandı).
"""
import pathlib, re, sys

def lin(c):
    c /= 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
def L(c): return 0.2126*lin(c[0]) + 0.7152*lin(c[1]) + 0.0722*lin(c[2])
def ratio(a, b):
    la, lb = L(a), L(b); hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)
def hx(h):
    h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
def blend(fg, bg, a): return tuple(round(f*a + b*(1-a)) for f, b in zip(fg, bg))

TOKENS = {
    'ink': '#1B2A4A', 'ink-deep': '#12203A', 'teal': '#4C8577', 'teal-ink': '#3E6E62',
    'teal-pale': '#8FB8AC', 'gold': '#C98A3E', 'gold-ink': '#96652A', 'gold-pale': '#E0B375',
    'success': '#3F7D5C', 'danger': '#CB241A', 'canvas': '#F7F7F5',
    't3-red': '#CB241A', 't3-blue': '#037EB4', 't3-blue-ink': '#0370A0', 't3-amber': '#F4B106',
    'white': '#FFFFFF',
}
LIGHT = {'beyaz kart': hx('#FFFFFF'), 'canvas': hx('#F7F7F5')}
DARK  = {'Ink Navy': hx('#1B2A4A'), 'Ink Deep': hx('#12203A')}

# Koyu zeminli bölgeler: (dosya, başlangıç, bitiş) — None = tüm dosya
DARK_REGIONS = [
    ('components/zema/header.tsx', None, None),
    ('app/page.tsx', 55, 120),          # hero
    ('app/auth/page.tsx', 18, 200),     # sağ panel
    ('app/demo-video-dialog.tsx', 47, 60),  # koyu video kutusu
]
# Zemini bir DEĞİŞKENDEN gelen beyaz metinler — elle ölçülüp doğrulandı.
# demo/page.tsx: TONE haritası (bg-teal-ink 5.81 / bg-gold-ink 5.01 /
# bg-ink 14.22 / bg-success 4.88 — dördü de AA geçiyor).
VERIFIED_WHITE = {
    'app/demo/page.tsx:59',
    'app/demo/page.tsx:73',
}

def is_dark(f, line):
    for df, a, b in DARK_REGIONS:
        if f == df and (a is None or a <= line <= b):
            return True
    return False

CLS = re.compile(r"text-(?:\[[^\]]+\]|[a-z0-9-]+(?:/(?:\[\.\d+\]|\d+))?)")
def parse(cls):
    """text-xxx → (rgb, büyük_metin_mi) veya None (punto sınıfı vs.)"""
    m = re.fullmatch(r"text-([a-z0-9-]+?)(?:/(?:\[\.(\d+)\]|(\d+)))?", cls)
    if not m: return None
    name, a1, a2 = m.group(1), m.group(2), m.group(3)
    if name not in TOKENS: return None
    alpha = int(a1)/100 if a1 else (int(a2)/100 if a2 else 1.0)
    return hx(TOKENS[name]), alpha

SIZE = re.compile(r"text-\[(\d+(?:\.\d+)?)px\]")

QUOTED = re.compile(r"'[^']*'|\"[^\"]*\"|`[^`]*`")
BG = re.compile(r"bg-(t3-blue|t3-red|t3-amber|ink-deep|ink|teal-ink|teal|gold-ink|gold|success|danger|white)(?![-\w/])")

def bg_in(text):
    """Metin parçasındaki zemin renkleri."""
    return [m.group(1) for m in BG.finditer(text)]

files = sorted(set(str(p) for p in pathlib.Path('app').rglob('*.tsx')) |
               set(str(p) for p in pathlib.Path('components').rglob('*.tsx')))
fails, checked = [], 0
for f in files:
    all_lines = pathlib.Path(f).read_text().split('\n')
    for i, ln in enumerate(all_lines, 1):
        if ln.lstrip().startswith('*') or ln.lstrip().startswith('//'):
            continue
        sizes = [float(x) for x in SIZE.findall(ln)]
        big = bool(sizes) and max(sizes) >= 24
        limit = 3.0 if big else 4.5

        # Satırı tırnaklı parçalara böl: ternary dalları ve nesne alanları
        # ("text-success" ile "bg-success" farklı elemanlar) birbirine
        # karışmasın. Parçasız kalan kısım da bir grup sayılır.
        segs = QUOTED.findall(ln) or []
        rest = QUOTED.sub(' ', ln)
        groups = segs + [rest]

        for g in groups:
            for cls in set(CLS.findall(g)):
                got = parse(cls)
                if not got: continue
                rgb, alpha = got
                # bg-transparent = kendi zemini YOK, ebeveynin zemini geçerli.
                own = [] if 'bg-transparent' in g else bg_in(g)
                if not own and cls == 'text-white':
                    # Beyaz metin daima renkli bir zemin üstündedir; çok
                    # satırlı ternary'de zemin komşu satırlarda olabilir.
                    # bg-white hariç: o ebeveyn kartın zemini olur.
                    win = '\n'.join(all_lines[max(0, i-3):i+2])
                    own = [b for b in bg_in(win) if b != 'white']
                    if not own:
                        key = f"{f}:{i}"
                        if key in VERIFIED_WHITE:
                            continue  # zemin bir değişkenden geliyor, elle doğrulandı
                if own:
                    backgrounds = {f"bg-{b}": hx(TOKENS[b]) for b in set(own)}
                else:
                    backgrounds = DARK if is_dark(f, i) else LIGHT
                for bname, bg in backgrounds.items():
                    eff = blend(rgb, bg, alpha) if alpha < 1 else rgb
                    r = ratio(eff, bg)
                    checked += 1
                    if r < limit:
                        fails.append((f, i, cls, bname, r, limit, big))

# Aynı bulguyu tekrar etme
seen, uniq = set(), []
for x in fails:
    k = (x[0], x[1], x[2], x[3])
    if k not in seen: seen.add(k); uniq.append(x)
fails = uniq

print(f"taranan metin-renk ölçümü: {checked}")
if not fails:
    print("İHLAL YOK — tüm metin renkleri kullanıldıkları zeminde AA geçiyor ✓")
else:
    print(f"\nAA İHLALİ: {len(fails)}\n")
    for f, i, cls, bg, r, lim, big in fails:
        print(f"  {f}:{i}")
        print(f"      {cls:<22} {bg:<14} {r:5.2f}:1  (gereken {lim}{' · büyük metin' if big else ''})")
sys.exit(1 if fails else 0)
