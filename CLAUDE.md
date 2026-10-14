# Proje: Haftalık Program Üzerinden Ders Kaydı (OBS alternatifi)

Yaşar Üniversitesi Makine Mühendisliği için ders kayıt ekranı prototipi.
Dersler düz liste yerine **haftalık program tablosunda** gösterilir, **seçim tabloya tıklanarak** yapılır ve çakışmalar görsel olarak kilitlenir.
Cuma günü sunulacak. Kapsam bilerek dar tutuldu: sadece **3. ve 4. sınıf** (5–8. yarıyıl). **Ön koşul kontrolü yok.**

---

## 1. Veri (hazır, yeniden üretme)

Veriler JSON'a çevrilmiş ve kontrol edilmiş durumda. **Uygulama sadece bu iki dosyayı kullanır:**

### `data/mufredat.json`
- `semesters[]`: her yarıyıl (5–8) için
  - `mandatory`: zorunlu ders kodları
  - `electiveSlots[]`: `{ slot: "A1", type: "A" | "B" | "STAJ" | "UNV", ects, options }`. `options` ya ders kodu listesi ya da `"universityElectives"`.
- `courses[]`: `{ code, name, tul, ects }`
- `universityElectives.courses[]`: demo için uydurulmuş üniversite seçmelileri, hepsi online ve akşam (`online: true`, `slots` ile)
- `notes`: veriye dair notlar, oku.

### `data/program.json`
- `terms.guz["3"]`, `terms.guz["4"]`, `terms.bahar["3"]`, `terms.bahar["4"]`: o dönem o sınıf programında açılan şubeler
- Her şube: `{ code, section, slots: [{ day: 0-6 (0=Pzt), start: "08:40", end: "09:30", type: "T" | "U", room }] }`
- Her slot 50 dakikalık bir ders saatidir. `type: "U"` uygulama/lab saati demektir.

### Diğer dosyalar (sadece referans)
`data/*.xlsx` (orijinal programlar) ve `data/müfredat.pdf`. **PDF'i okuyup veri çıkarmaya çalışma.** Metin katmanında beyazla kapatılmış eski satırlar duruyor ve yanlış sonuç verir.

### Demo öğrenci
Varsayılan profil `src/app.js` başında: Demo Öğrenci, 4. sınıf, Güz (= 7. yarıyıl), AKTS limiti 40, ME 3220 "kaldı". Sağ üstteki isme tıklayınca açılan **Öğrenci profili** penceresinden ad, soyad, numara, sınıf, AKTS limiti ve 5–8. yarıyılın her dersi/seçmeli hakkı için **Geçti / Kaldı / Almadı** ayarlanır (`profile.status`). Belirtilmeyenler: kayıt yarıyılından öncekiler geçti, sonrakiler almadı.
- Geçilen dersler listeye gelmez, tabloda soluk ✓ ile kilitli durur ("passed" durumu).
- Kaldığın ya da almadığın alt yarıyıl dersleri kendi yarıyıl başlığıyla **"alttan"** zorunlu olarak her zaman listelenir ("Kaldı, ..." / "Alınmadı, ...").
- Ön koşul kontrolü geçilen derslere bakar (ME 4910 geçti işaretlenirse ME 4920 açılır).

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
11. **AKTS sayacı:** Canlı olarak `36 / 40 AKTS` gösterilir, limit aşılınca kırmızıya döner. Seçmeli boşluğu AKTS'sini boşluktan alır.
12. **Uyarı bandı:** İki sabit zorunlu ders birbiriyle çakışıyorsa üstte uyarı çıkar ("danışmanınla görüş"). Zorunlu bir dersin bu dönem açılmamış olması da uyarı olarak gösterilir (örn. MATH 2260).
13. **Kaydı tamamla:** Seçilenlerin özeti (ders, şube, AKTS) ve eksik boşluklar gösterilir.

**Ek:** Kayıt özeti Yazdır/PDF ile kaydedilebilir.

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
- Sabit (tek şubeli) zorunlu hesabı ve yapay zeka önerileri kayıt döneminin şubelerini esas alır; ders kayıt döneminde açılmıyorsa diğer dönemin şubelerine bakılır.

## 2b++++. Üst/alt yarıyıl ve ön koşul (uygulandı)
- Alt yarıyıl dersleri profildeki duruma göre gelir (bkz. Demo öğrenci); alt yarıyıl kutucuğu sadece tablodaki görünürlüğü değiştirir.
- Kayıt yarıyılının üstündeki bir program işaretlenirse (ör. 7. yarıyıl kaydında 4. sınıf Bahar) o yarıyılın zorunluları ve seçmeli hakları "Alman gereken dersler" listesine **ayrı başlık altında, "üstten"** olarak eklenir (`extraSemesters`). Bunlar isteğe bağlıdır: eksik sayılmaz, otomatik seçilmez.
- Seçmeliler önce kayıt yarıyılının boş hakkına, o dolunca üst yarıyılın hakkına sayılır.
- Ön koşullar `mufredat.json > prerequisites` içinde: **ME 4920 ← ME 4910**. Geçilmiş dersler = kayıt yarıyılından önceki zorunlular (alttan alınanlar hariç). Ön koşulu sağlanmayan ders tabloda kilitli (🔒, "prereq" durumu), listede "Ön koşullu: ME 4910" yazar, yapay zeka önerilerinde seçilemez.
- Program kutucukları değişince model yeniden kurulur, seçimler `replayState` ile korunur.

## 2c. Dil (uygulandı)
- Üst çubukta TR / EN düğmesi. Seçim tarayıcıda hatırlanır.
- Bütün arayüz metinleri `src/i18n.js` içinde (`I18N.tr`, `I18N.en`). Yeni metin eklerken iki dile de ekle.
- Ders adlarının İngilizcesi `mufredat.json` içinde `nameEn`, seçmeli hakların İngilizcesi `electiveSlots[].nameEn`.
- `logic.js` kilit sebeplerini yapılandırılmış alanlarla da döndürür (`other`, `at`, `section`, `full`, `next`); arayüz metni bunlardan seçili dilde kurar.

## 3. Teknik (uygulandı)
- **Bağımlılık yok.** Saf HTML + CSS + JavaScript. npm paketi kurulmaz.
- `src/logic.js`: çakışma, kilit, şube ve boşluk mantığı (saf fonksiyonlar).
- `src/app.js`: arayüz. `src/i18n.js`: TR/EN metinler. `src/style.css`: stil. `src/template.html`: sayfa iskeleti.
- `node build.mjs` → kökteki **`index.html`**'i üretir (veri + kod + stil tek dosyada gömülü, internetsiz açılır). **`index.html`'i elle düzenleme**, `src/` içini değiştirip yeniden derle.
- Testler: `node --test tests/*.test.js` (Node'un yerleşik test aracı). Mantığa dokunan her değişiklikten sonra çalıştır.
- Türkçe arayüz, projektörde okunaklı olacak şekilde büyük yazı ve net kontrast.

## 4. Durum
Kurallar 1–13 uygulandı ve testlerle doğrulandı. "Kaydı tamamla" özetinde Yazdır/PDF düğmesi var.
