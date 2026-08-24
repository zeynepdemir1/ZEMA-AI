@AGENTS.md

# ZEMA — kalıcı çalışma kuralları

## Sürümleme: her görev bir tag

Tamamlanan HER görevden sonra commit + push'a ek olarak artan bir git tag
oluştur ve etiketi de push et:

```bash
git tag -a v0.4 -m "kısa başlık: ne değişti"
git push origin v0.4          # veya: git push --tags
```

- Numaralandırma `v0.1`'den başlar ve görev başına 0.1 artar (`v0.1`, `v0.2`,
  … `v0.9`, `v1.0`). Sonraki numarayı `git tag --sort=-v:refname | head -1`
  ile bul; tahmin etme.
- "Görev" = kullanıcının numaralı maddelerinden biri veya bağımsız bir iş
  paketi. Aynı maddeyi düzelten ara commit'ler etiketlenmez.
- Etiketler **annotated** olsun (`-a`), lightweight değil: mesaj teslim
  günü hangi sürümde ne olduğunu gösteren tek kayıt.
- Bir tag oluşturulduktan sonra ASLA taşınmaz veya silinmez. Yanlışsa
  sonraki numaradan yeni tag açılır.

Sebep: Creathon teslimi tek bir commit'e bakarak değerlendirilebiliyor;
etiketler "hangi özellik ne zaman girdi" sorusunun cevabını git geçmişinden
okunabilir kılıyor.
