# Ders Kaydı · Haftalık Program

Yaşar Üniversitesi Makine Mühendisliği için modern bir öğrenci bilgi sistemi (OBS) prototipi: ders kaydı, ekle-bırak, transkript, müfredat ve mezuniyet takibi.

Bugünkü OBS'de dersler düz bir liste hâlinde geliyor ve çakışmayı ancak kayıt sırasında hata alınca öğreniyorsun. Bu prototipte dersleri **haftalık programın üzerinden** seçiyorsun. Çakışan dersler seçmeden önce kilitleniyor ve nedeni yazıyor.

**Canlı site:** https://yarensuudegur.github.io/obs-ders-kaydi/

> Ders projesi prototipidir, resmi Yaşar Üniversitesi sistemi değildir. Giriş bilgileri demo amaçlı otomatik doldurulur; gerçek bir hesapla giriş yapılmaz ve hiçbir bilgi bir yere gönderilmez.

![Ders Kayıt ekranı](docs/ders-kayit.png)

## Özellikler

- **Veri Merkezi (yeni):** OBS öğrencilere API açmadığı için veriler üniversitenin zaten yayınladığı dosyalardan okunur. Bölümün Excel ders programı **olduğu gibi** okunur; müfredat, akademik takvim ve sınav takvimi Excel/CSV, transkript PDF/Excel ya da OBS sayfasından kopyala-yapıştır, yönetmelik PDF/Word. Yönetmelikten mezuniyet koşulları (AKTS, AGNO, staj, azami süre, not ölçeği, AKTS sınırı) metinden çıkarılır ve bulunduğu cümleyle gösterilir. Dosyalar sunucuya gitmez; tarayıcıda okunur ve yalnızca o cihazda saklanır. "Örnek dosyalarla başla" ile her şey tek tıkla dolar.
- **Giriş ekranı ve ana sayfa:** Demo öğrenci bilgileri hazır gelir, toplama işlemini çözüp giriş yapılır.
- **Ders Kayıt:** Haftalık program üzerinden seçim, çakışma kilitleri (siyah/gri, nedeniyle), alttan/üstten ders, ön koşul, AGNO'ya göre AKTS sınırı, yapay zeka program önerileri, danışman onayı. Akademik takvimdeki ders kaydı tarihleri dışında onaya gönderilemez.
- **Ders Ekle/Bırak:** Ekle-bırak haftasında açılır. Onaylı programdan ders bırakma, programa uyan şubeye ekleme, seçmeliyi başka bir seçmeli hakkına ya da ek derse saydırma, danışmana gönderme.
- **Genel İşlemler:** Akademik Takvim (takvime aktarma), Alınan Dersler, Açılan Bölüm Dersleri (şube, saat, derslik), Sınav Takvimi (kendi sınavların, çakışma uyarısı, tek tıkla Google Takvim'e ekleme, .ics), Ders Programı, Bölüm Ders Programı, Mezuniyet İlerleme Durumu (yönetmelik koşullarına göre).
- **Dönem işlemleri:** Dönem Ortalamaları (tablo + grafikler), Not Listesi ("finalden kaç almalıyım" hesaplayıcı), Transkript (yazdır / CSV), Transkript Senaryosu (notları değiştir, ders ekle, ortalamayı gör), Diğer Belgeler, Müfredat Durum (alınan dersin karşılığı, not yükseltme önerisi).
- **Yapay zeka önerileri:** Ders kaydında çakışmasız program kombinasyonları; senaryoda "hangi dersi ne zaman almalısın" dönem planı (kalan dersler, Güz/Bahar açılışı, ön koşul sırası, AKTS sınırı, not yükseltme).
- **Demo tarihi:** Takvime bağlı sekmeleri sunumda gösterebilmek için üst çubuktan değiştirilebilir.
- **Türkçe / İngilizce**, **telefon görünümü**, **PNG indirme**.

| Giriş | Ana sayfa | Program önerisi | Telefon |
|---|---|---|---|
| ![Giriş](docs/giris.png) | ![Ana sayfa](docs/ana-sayfa.png) | ![Program önerisi](docs/program-onerisi.png) | ![Telefon](docs/telefon.png) |

## Çalıştırma

Canlı siteyi aç ya da `index.html` dosyasını tarayıcıda aç. Örnek dosyalar sayfanın içine gömülüdür.
PDF okuma (transkript, yönetmelik) `vendor/pdfjs/` ile çalışır ve sitenin bir web sunucusundan açılmasını ister (GitHub Pages ya da `python -m http.server`). Dosyadan açınca örnekler Excel ve metin sürümleriyle yüklenir.

## Geliştirme

- Kod `src/` klasöründe: `logic.js` (çakışma, kilit, kontenjan, öneri), `files.js` (bağımlılıksız Excel/CSV/Word okuyucu, PDF için pdf.js), `parsers.js` (dosyaları veriye çeviren fonksiyonlar), `academic.js` (ortalama, müfredat durumu, mezuniyet, dönem planı), `data.js` (Veri Merkezi, saklama, takvim), `pages-general.js` ve `pages-term.js` (sayfalar), `app.js` (çekirdek arayüz), `i18n.js` + `i18n2.js` (TR/EN), `style.css` + `pages.css`, `template.html`.
- Değişiklikten sonra `node build.mjs` ile `index.html` yeniden üretilir.
- Testler: `node --test tests/*.test.js` (34 test; bölümün Excel'inin okunması dahil).
- Örnek dosyalar: `python3 tools/make_samples.py` → `samples/`. Hepsi kurgusal Demo Öğrenci ile hazırlanır; ders programı Excel'leri bölümün yayınladığı dosyalardır.
- Projenin ayrıntılı açıklaması ve kuralları `CLAUDE.md` dosyasında.

## Nasıl yapıldı

Yapay zeka kodlama ajanlarıyla geliştirildi: ilk sürüm Claude'un ajan modunda yazıldı ve test edildi, repo kurulumu ve sonraki adımlar Claude Code ile yapıldı. Proje klasöründeki `CLAUDE.md`, Claude Code'un projeyi tanıması için hazırlandı.

## Bilinen sınırlar

- OBS'ye bağlanmaz; kayıt ve danışman onayı demo amaçlıdır (onay ~2 saniye sonra otomatik gelir). Veri Merkezi'nde üniversite API'si açıldığında kullanılacak örnek uç noktalar listelenir.
- Veriler yalnızca o tarayıcıda saklanır; danışman ve öğrenci aynı veriyi paylaşmaz.
- Anlık kontenjan her kayıtta değiştiği için dosyayla güncel tutulamaz; uygulamada yok. Üniversite API'si bağlanınca gelecek (dolu şube kilidi mantığı hazır).
- Transkript PDF okuyucusu örnek transkript ve OBS sayfasından kopyalanan metinle denendi; farklı bir PDF düzeninde Excel ya da yapıştırma kullanılmalı.
- Yönetmelikten koşul çıkarma metin kalıplarına dayanır; bulunamayan koşullar varsayılan değerle gösterilir ve elle düzeltilebilir.
- Not Listesi'ndeki notları öğrenci kendisi girer (OBS'deki hoca notlarına erişim yok).
- Üniversite seçmelileri ve örnek takvim/sınav dosyaları demo için uydurulmuştur.
- "Yapay zeka önerileri" bir dil modeli değil, tarayıcıda çalışan kısıt tabanlı arama ve planlama algoritmalarıdır.
- Müfredat Bilgi Paketi ve Devamsızlık Durumu henüz aktif değil.
