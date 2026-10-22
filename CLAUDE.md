# Proje: Haftalık Program Üzerinden Ders Kaydı (OBS alternatifi)

Yaşar Üniversitesi Makine Mühendisliği için ders kayıt ekranı prototipi.
Dersler düz liste yerine **haftalık program tablosunda** gösterilir, **seçim tabloya tıklanarak** yapılır ve çakışmalar görsel olarak kilitlenir.
İkinci ödev: sistemi gerçek kısıtlara (OBS'de öğrenciye açık API yok, veriler dosyalarla dolaşıyor) göre çalışır hale getirmek. Ders programları 3. ve 4. sınıf için var; müfredat 1–8. yarıyıl. Tek ön koşul kuralı: ME 4920 ← ME 4910.
Canlı site: https://yarensuudegur.github.io/obs-ders-kaydi/ (GitHub Pages, `main` dalının kökündeki `index.html`).

---

## 1. Veri: Veri Merkezi'nden yüklenir

OBS öğrencilere API açmıyor; uygulama verileri **yüklenen dosyalardan** okur (`src/data.js`). Hiçbir dosya sunucuya gitmez: okunan veri `localStorage` (`obs-data-v2`), dosyanın kendisi IndexedDB (`obs-files`) içinde, sadece o cihazda durur. Uygulama durumu (onaylı kayıt, demo tarihi, senaryo, not listesi) `obs-state-v2`.

| Tür | Biçim | Ayrıştırıcı (`src/parsers.js`) |
|---|---|---|
| Müfredat | Excel şablonu (Dersler, Seçmeli Haklar, Üniversite Seçmelileri, Ön Koşullar, Eşdeğerlikler) ya da JSON | `parseCurriculum` |
| Bölüm ders programı | **Bölümün Excel'i olduğu gibi** (gün blokları, ŞB./DERS KODU/DERSLİK/BAŞ/BİT, bitişte "u" = lab). Sınıf dosya adından, dönem başlıktan | `parseTimetable` |
| Kontenjan | Excel/CSV: Dönem, Ders Kodu, Şube, Kontenjan, Kayıtlı | `parseQuota` |
| Akademik takvim | Excel/CSV: Başlangıç, Bitiş, Etkinlik (tür başlıktan: ders kaydı, ekle-bırak, sınav, tatil…) | `parseCalendar`, `periodOf`, `inPeriod` |
| Sınav takvimi | Excel/CSV: Ders Kodu, Sınav Türü, Tarih, Başlangıç, Bitiş, Derslik | `parseExams` |
| Yönetmelik | PDF/DOCX/TXT; mezuniyet koşulları, not ölçeği, AKTS sınırı metinden, kanıt cümlesiyle | `parseRegulation` |
| Transkript | PDF (iki sütunlu düzen), Excel/CSV ya da OBS sayfasından yapıştırılan metin | `parseTranscriptText`, `parseTranscriptBook` |

- Dosya okuyucular `src/files.js`: bağımlılıksız XLSX/DOCX (zip + xml, `DecompressionStream`), CSV; PDF için `vendor/pdfjs/` (tembel yüklenir, http üzerinden açılmış site gerekir).
- `data/mufredat.json` ve `data/program.json` artık uygulamaya gömülmez; testler ve örnek dosya üretimi için kaynak. Müfredat 1–8. yarıyılın hepsini içerir (1–4 OBS Müfredat Bilgi Paketi'nden). `data/müfredat.pdf`'i okuyup veri çıkarmaya çalışma (beyazla kapatılmış eski satırlar var).
- `samples/`: `python3 tools/make_samples.py` ile üretilen örnek dosyalar (kurgusal Demo Öğrenci; ders programları bölümün dosyaları). `build.mjs` bunları index.html'e gömer ("Örnek dosyalarla başla").
- Transkript yüklenince öğrenci profili (sınıf, kayıt dönemi, AGNO, ders durumları) transkriptten hesaplanır (`academic.js > studentFromTranscript`). Profil penceresinden elle değiştirilirse o geçerli olur. Transkript yoksa varsayılan demo profil: 4. sınıf Güz, AGNO 2,75, ME 3220 kaldı.
- Ortalamalar: AKTS ağırlıklı, iki haneye **kesilir**, tekrar edilen derste son not geçerli, S/U ortalamaya girmez (`termStats`, `gpaOf`).

---

## 2. Arayüz kuralları

1. **Tablo:** 7 gün (Pzt–Paz) × 9 saat (08:40–09:30 … 16:40–17:30). Bir hücrede birden fazla ders varsa hücre büyür ve her ders ayrı bir satırda görünür. Hücredeki her satırda ders kodu, şube no, derslik ve gerekiyorsa "Lab" etiketi yazar.
2. **Dönem ve sınıf:** Dönem açılır listeden seçilir (2026-2027 Güz / Bahar). Sınıflar onay kutusuyla işaretlenir: 1–4. sınıf görünür, 1. ve 2. sınıf pasif (veri yok). İşaretlenen sınıfın dersleri tabloya eklenir. Çakışma hesabı sadece seçili dönemin dersleri arasında yapılır.
3. **Renkler:** Aynı dersin bütün şubeleri aynı renkte. Bir seçmeli boşluğun (örn. A2) tablodaki bütün adayları da aynı renkte, çünkü boşluk bir dersin şubeleri gibi davranır. Zorunlu dersler ayrı renklerde.
4. **Zorunlu dersler:** Öğrencinin yarıyılının `mandatory` dersleri + `mustRetake` dersleri.
   - **Tek şubeli** olan otomatik seçili ve sabit.
   - **Çok şubeli** olan (ENGR 4400, ME 4910 vb.) "zorunlu – şube seç" rozetiyle gösterilir, öğrenci şubeyi seçer.
5. **Kilit (iki ton):**
   - Sabit zorunlu dersle çakışan ders **siyah** olur, seçilemez.
   - Öğrencinin kendi seçimiyle çakışan ders **koyu gri** olur, seçilemez. Seçim kaldırılınca açılır.
   - Üzerine gelince sebep yazar: *"ME 3220 (Zorunlu) ile Salı 09:40'ta çakışıyor"*.
6. **Şube = blok:** Bir şubenin herhangi bir saatine tıklamak o şubenin **bütün saatlerini** (T + U) seçer. Üzerine gelince şubenin diğer saatleri parlar. Çakışma şubenin tüm saatleri üzerinden hesaplanır. Teorik ve lab aynı şubededir, ayrı lab seçimi yok.
7. **Kardeş kilidi:** Bir dersin bir şubesi seçilince diğer şubeleri pasifleşir. Seçmeli boşlukta da aynısı geçerli: A2 için bir ders seçilince A2'nin diğer adayları pasifleşir. Aynı türde birden fazla boşluk varsa (8. yarıyılda B2 ve B3), boşluklar dolana kadar diğer adaylar açık kalır. Hem A hem B listesinde olan bir ders önce boştaki A boşluğunu doldurur. Bir ders aynı anda iki boşluğu dolduramaz.
8. **Seçim görünümü:** Seçilen dersin çerçevesi belirgin bir renkle çizilir. Tablonun üstündeki **ders listesinde** (zorunlular + seçmeli boşluklar, her biri durumuyla) aynı ders aynı renkte vurgulanır. Listede bir derse tıklamak tablodaki saatlerini parlatır. Seçim tablodan yapılır.
9. **Saat dışı dersler:** Görünen bir ders 17:30 sonrasına taşıyorsa (UMFD 1720 akşam, bazı 17:40 saatleri) tablonun altına ek akşam satırları eklenir, farklı başlık tonuyla. Böyle ders yoksa tablo 9 satır kalır.
10. **Listeden seçilenler:** Staj (ME 4830) saatsizdir, listede tek bir "Ekle" düğmesiyle eklenir, başka seçenek yoktur. `UNV` boşluğu hem listeden hem tablodan seçilebilir. Üniversite seçmelileri **online ve akşam saatinde** (18:40 sonrası), listede "Online" rozetiyle görünür. **Online oldukları için çakışma kontrolüne hiç girmezler:** hiçbir dersle çakışıyor sayılmazlar, başka bir dersi kilitlemezler ve kendileri de kilitlenmezler. Yine de **tabloda gösterilirler**: seçilmemişken akşam satırlarında soluk ve kesikli çerçeveli, seçilince normal görünür. Aynı hücrede başka bir dersle denk gelirlerse ikisi de alt alta görünür, hiçbiri kilitlenmez ve uyarı çıkmaz. Seçimleri tablodan da yapılabilir. Staj saatsizdir.
11. **AKTS sayacı:** Canlı olarak `36 / 40 AKTS` gösterilir (sınır AGNO'ya göre 32 ya da 40), limit aşılınca kırmızıya döner. Seçmeli boşluğu AKTS'sini boşluktan alır.
12. **Uyarı bandı:** İki sabit zorunlu ders birbiriyle çakışıyorsa üstte uyarı çıkar ("danışmanınla görüş"). Zorunlu bir dersin bu dönem açılmamış olması da uyarı olarak gösterilir (örn. MATH 2260).
13. **Kaydı tamamla:** Seçilenlerin özeti (ders, şube, AKTS) ve eksik boşluklar gösterilir.

**Ek:** Kayıt özeti İptal / Tamam ile onaya gönderilir.

---

## 2b. Görünüm (uygulandı)
- Gerçek OBS düzeni, modern ve yumuşak köşeli: solda menü (Genel İşlemler, Ders ve Dönem İşlemleri › Ders Kayıt, Form İşlemleri, Belge Talebi, İntibak Başvuru, Hazırlık İşlemleri, Başvuru İşlemleri, Kullanıcı İşlemleri), üstte üniversite adı, dönem, ana sayfa, duyurular ve öğrenci. **Sadece Ders Kayıt çalışır**, diğerleri görseldir. Menü düğmesi kenar çubuğunu daraltır.
- Sayfa sırası: başlık → durum kartları (mali uygunluk, danışman onayı, yarıyıl, AKTS) → dönem/sınıf/alttan dersler → uyarılar → alman gerekenler → haftalık program → OBS'deki gibi "Seçilen dersler" tablosu (Şb., kod, ad, Z/S, T+U, alış, AKTS, Kaldır) → renk açıklamaları en altta.
- Seçmeli boşluklar tam adıyla yazılır ("Bölüm Seçmeli Ders A2", "Üniversite Seçmeli Ders ME3"); adlar `mufredat.json` içindeki `electiveSlots[].name`'den gelir.
- Tablo kutucuğunda sadece kod, şube ve Lab etiketi var; ad, saatler, derslik ve kilit sebebi üzerine gelince çıkar.

## 2b+. Yapay zeka önerileri (uygulandı)
- "Bu dönem alman gerekenler"in üstündeki mor kart → "Program öner" penceresi.
- 1. adım: "Hangi dersleri almak istiyorsun?" Alttan dersler ve tek şubeli zorunlular işaretli ve kilitli; çok şubeli zorunlular işaretli ama çıkarılabilir; bölüm seçmeli adaylarından seçmeli hak sayısı kadar seçilir (A/B dağılımı `assignElectives`); staj ve üniversite seçmelisi de eklenebilir.
- 2. adım: `suggestPrograms` (logic.js) bütün çakışmasız şube kombinasyonlarını geri izlemeli arama ile bulur, gün sayısı + boş saat + hafta sonu + sabah 08:40 puanına göre sıralar. "Program 1, 2…" kartları mini haftalık tablo ile gösterilir. Karta tıklayınca o programın dersleri şubeleriyle seçilir.
- Program çıkmazsa hangi dersi çıkarınca çıkacağı söylenir (`blockers`).
- Not: Bu bir kısıt tabanlı arama (klasik yapay zeka yöntemi); internet ya da dil modeli kullanmaz, sunumda çevrimdışı çalışır.

## 2b++. Danışman onayı ve Ders Programı sayfası (uygulandı)
- "Kaydı tamamla"da eksik yoksa durum "Onaya gönderildi" olur, ~2 saniye sonra (demo) danışman otomatik onaylar: sağ üstte bildirim kartı çıkar, zil simgesinde 1 okunmamış bildirim olur, durum kartı "Onaylandı" olur.
- Sol menüde **Ders Programı** aktif: onaylanan programın haftalık tablosu ve kayıtlı dersler listesi (saatleriyle). Onay yoksa boş durum ve "Ders Kayıt'a git".
- Bu sayfadaki dönem seçici ve Yazdır düğmesi görseldir (çalışmaz).

## 2b+++. Sınıf + dönem katmanları ve ek ders (uygulandı)
- "Gösterilecek programlar": her sınıf için ayrı Güz ve Bahar kutucuğu (1-2. sınıf pasif). Her kutucuk ilgili Excel'in (ör. 3. sınıf bahar) derslerini tabloya getirir. Varsayılan: öğrencinin sınıfı + kayıt dönemi.
- Model dört programın hepsini yükler. Kayıt döneminin şubeleri `KOD#şube`, diğer dönemin şubeleri `KOD#şube@dönem` kimliğini alır; `section.layers` = {"3|bahar", ...}. Diğer dönemin dersleri tabloda sarı "Güz/Bahar" etiketiyle görünür.
- Müfredatta o dönem olmayan dersler artık soluk/kilitli değil: **ek ders (üstten)** olarak seçilebilir, AKTS'ye eklenir, "Seçilen dersler"de "Ek ders" olarak listelenir. Çakışma ve kardeş kilidi aynen geçerli.
- Sabit (tek şubeli) zorunlu hesabı kayıt döneminin şubelerini esas alır; ders kayıt döneminde açılmıyorsa diğer dönemin şubelerine bakılır.
- Yapay zeka önerileri **sadece kayıt döneminde açılan şubeleri** kullanır. Bu dönem açılmayan ders pencerede soluk ve "Bu dönem açılmadı" yazılı görünür, seçilemez ve programa konmaz.

## 2b++++. Üst/alt yarıyıl ve ön koşul (uygulandı)
- Alt yarıyıl dersleri profildeki duruma göre gelir (bkz. Demo öğrenci); alt yarıyıl kutucuğu sadece tablodaki görünürlüğü değiştirir.
- Kayıt yarıyılının üstündeki bir program işaretlenirse (ör. 7. yarıyıl kaydında 4. sınıf Bahar) o yarıyılın zorunluları ve seçmeli hakları "Alman gereken dersler" listesine **ayrı başlık altında, "üstten"** olarak eklenir (`extraSemesters`). Bunlar isteğe bağlıdır: eksik sayılmaz, otomatik seçilmez.
- Seçmeliler önce kayıt yarıyılının boş hakkına, o dolunca üst yarıyılın hakkına sayılır.
- Ön koşullar `mufredat.json > prerequisites` içinde: **ME 4920 ← ME 4910**. Geçilmiş dersler = kayıt yarıyılından önceki zorunlular (alttan alınanlar hariç). Ön koşulu sağlanmayan ders tabloda kilitli (🔒, "prereq" durumu), listede "Ön koşullu: ME 4910" yazar, yapay zeka önerilerinde seçilemez.
- Program kutucukları değişince model yeniden kurulur, seçimler `replayState` ile korunur.

## 2a. Giriş ve ana sayfa (uygulandı)
- Site **giriş ekranıyla** açılır (gerçek OBS girişine benzer): öğrenci numarası ve şifre demo olarak otomatik dolu ve **salt okunur** (gerçek bilgi girilemez, hiçbir şey gönderilmez), toplama işlemi (ör. 34 + 4 = ?) çözülüp Giriş'e basılır. Yanlışsa yeni işlem gelir. "Şifremi unuttum", "E-Devlet ile giriş", "Duyurular" görseldir. Alt bilgi: "Ders projesi prototipidir. Resmi Yaşar Üniversitesi sistemi değildir."
- Girişten sonra **ana sayfa**: bilgilendirme bandı (ders kaydı durumu) + 8 bilgi kartı (öğrenci kimliği, program, öğrenim durumu + AGNO, süre, ders kayıt özeti, danışman (uydurma "Demo Danışman"), akademik özet, ek bilgiler + AKTS sınırı). Hızlı erişim bölümü yok; ders kaydına soldaki menüden gidilir. Üstteki ev simgesi ana sayfaya döner, çıkış simgesi giriş ekranına.

## 2d. Telefon ve PNG (uygulandı)
- 900 px altında sol menü açılır/kapanır çekmece olur; haftalık program **gün sekmeleriyle** tek gün gösterilir (`.grid[data-day]`); kartlar tek sütun, pencereler tam genişlik.
- "Seçilen dersler" başlığında ve Ders Programı sayfasında **PNG indir**: program canvas'a çizilip `ders-programi-<dönem>-<numara>.png` olarak iner (taslak / danışman onaylı rozeti ile).

## 2c. Dil (uygulandı)
- Üst çubukta TR / EN düğmesi. Seçim tarayıcıda hatırlanır.
- Bütün arayüz metinleri `src/i18n.js` içinde (`I18N.tr`, `I18N.en`). Yeni metin eklerken iki dile de ekle.
- Ders adlarının İngilizcesi `mufredat.json` içinde `nameEn`, seçmeli hakların İngilizcesi `electiveSlots[].nameEn`.
- `logic.js` kilit sebeplerini yapılandırılmış alanlarla da döndürür (`other`, `at`, `section`, `full`, `next`); arayüz metni bunlardan seçili dilde kurar.

## 2e. OBS sayfaları (uygulandı)
- Sol menü gerçek OBS düzeninde. En üstte **Veri Merkezi** (yüklenen tür sayısı rozeti). Dosyası eksik sayfada turuncu nokta; açılınca "Bu sayfa için dosya gerekiyor" uyarısı (`OBS.gate`).
- **Demo tarihi** (üst çubuk): ders kaydı ve ekle-bırak akademik takvime göre açılır; tarih buradan ya da uyarıdaki "Demo tarihini bu döneme al" ile değişir. Örnekler yüklenince 08.09.2026 (ders kaydı haftası).
- Genel İşlemler: Akademik Takvim (.ics, Google Takvim bağlantısı), Alınan Dersler (onaylı program), Açılan Bölüm Dersleri, Sınav Takvimi (kendi sınavları, çakışma, Google Takvim'e ekle, .ics, "Google'a bağlan" için `data.js > GOOGLE_CLIENT_ID`), Ders Programı, Bölüm Ders Programı, Mezuniyet İlerleme Durumu.
- Ders ve Dönem İşlemleri: Ders Kayıt, Ders Ekle/Bırak (bırak, kontenjanlı şube ekle, seçmeliyi başka hakka ya da ek derse saydır `reassignSlot`, hakları dolu seçmeliyi ek ders olarak ekle, danışmana gönder), Dönem Ortalamaları, Not Listesi (öğrencinin girdiği notlarla hesap), Transkript (yazdır, CSV), Transkript Senaryosu (+ yapay zeka dönem planı `planTerms`), Diğer Belgeler, Müfredat Durum (+ not yükseltme önerisi `retakeSuggestions`). Müfredat Bilgi Paketi ve Devamsızlık pasif.
- Kontenjanı dolu şube `full` durumunda kilitlenir; öneriler dolu şubeyi atlar.

## 3. Teknik (uygulandı)
- **Bağımlılık yok** (npm paketi kurulmaz). Tek dış kod `vendor/pdfjs/` (Mozilla pdf.js, Apache 2.0), sadece PDF okurken yüklenir.
- `src/logic.js` (ders kaydı mantığı), `files.js`, `parsers.js`, `academic.js` (saf fonksiyonlar, Node testleriyle sınanır), `data.js` (Veri Merkezi), `pages-general.js`, `pages-term.js`, `app.js` (çekirdek; `window.OBS` bağlamı), `i18n.js` + `i18n2.js`, `style.css` + `pages.css`, `template.html`.
- `node build.mjs` → kökteki **`index.html`** (files/parsers/academic kendi ad alanlarında: `FILES`, `PARSE`, `ACAD`). **`index.html`'i elle düzenleme.**
- Testler: `node --test tests/*.test.js`. Mantığa ya da ayrıştırıcıya dokunan her değişiklikten sonra çalıştır.
- Bütün metinler iki dilde; yeni metin eklerken `i18n2.js`'te TR ve EN'e ekle.

## 4. Durum
Bütün bölümler uygulandı, 34 test geçiyor (bölümün Excel'inin `program.json` ile birebir okunması dahil). `node build.mjs` sözdizimi hatası varsa index.html'i yazmadan durur.
