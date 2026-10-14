# Ders Kaydı · Haftalık Program

OBS ders kaydında dersler düz liste hâlinde gelir ve çakışmayı ancak kayıt sırasında hata alınca öğrenirsin.
Bu prototipte seçim **haftalık program tablosundan** yapılır. Çakışmalar seçmeden önce görünür.

## Açmak
`index.html` dosyasına çift tıkla. Kurulum ve internet gerekmez.

## Nasıl çalışır
- **Dönem**: 2026-2027 Güz ya da Bahar (kayıt dönemi). **Gösterilecek programlar**: her sınıfın Güz ve Bahar programı ayrı kutucuk; işaretlediğin programın dersleri tabloya gelir (prototipte 3. ve 4. sınıf var). Müfredatında olmayan dersleri ek ders (üstten) olarak alabilirsin.
- Sol menü ve üst çubuktaki diğer düğmeler gerçek OBS'yi andırmak için var, sadece Ders Kayıt çalışır.
- Bir şubeye tıklamak o şubenin bütün saatlerini (teorik + lab) seçer. Tekrar tıklamak seçimi kaldırır.
- **Siyah**: tek şubeli zorunlu ya da alttan dersle çakışıyor, seçilemez.
- **Koyu gri**: senin seçtiğin bir dersle çakışıyor. O seçimi kaldırınca açılır.
- **Taralı**: aynı dersin başka şubesini seçtin ya da seçmeli boşluk doldu.
- **Gri şeritli**: müfredatında bu dönem yok, ek ders olarak alınabilir.
- Üzerine gelince sebebi yazar. Üstteki listeye tıklamak dersin tablodaki yerlerini gösterir.
- Bölüm seçmeli derslerine (Bölüm Seçmeli Ders A2, B1 …) aday derslerden biri tablodan seçilir. Hem A hem B listesindeki ders önce A boşluğunu doldurur.
- Üniversite seçmelileri online ve akşamdır, çakışma kontrolüne girmez. Staj tek tıkla eklenir.
- **Yapay zeka önerileri**: almak istediğin dersleri işaretle, çakışmayan bütün programlar sıralanıp gelsin. Birine tıklayınca dersler şubeleriyle seçilir.
- **Kaydı tamamla** eksiksizse danışman (demo) birkaç saniye içinde onaylar, bildirim gelir. Onaylı program sol menüdeki **Ders Programı** sayfasında görünür.
- Sağ üstteki **TR / EN** ile bütün site Türkçe ya da İngilizce olur.
- AKTS sayacı (sınır 40), OBS'deki gibi **Seçilen dersler** tablosu, **Kaydı tamamla** ile özet ve eksikler.
- **Öğrenci profili** (sağ üstteki isim ya da Düzenle): sınıf, alttan dersler, AKTS sınırı.
- Bahar dönemi ders saatleri 2025-2026 Bahar programından alındı.

## Geliştirmek
- Kod `src/` içinde. Değiştirdikten sonra `node build.mjs` ile `index.html`'i yeniden üret.
- Test: `node --test tests/*.test.js`
- Veri: `data/mufredat.json`, `data/program.json` (Excel ve PDF'ten çevrildi).
