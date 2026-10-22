// Yüklenen dosyaları uygulamanın veri yapısına çeviren saf fonksiyonlar.
// Girdi: readXlsx/readCsv çıktısı ({sheets:[{name, rows}]}) ya da düz metin. Çıktı: JSON'a yazılabilir nesneler.

const TRU = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('tr');
const low = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr');
const CODE_RE = /^([A-ZÇĞİÖŞÜ]{2,5})\s?(\d{3,4}[A-Z]?)$/;
export function normCode(v) {
  const m = TRU(v).match(CODE_RE);
  return m ? `${m[1]} ${m[2]}` : null;
}
const pad = (n) => String(n).padStart(2, '0');
const TR_MONTHS = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Tarih → 'YYYY-MM-DD'
export function isoDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return isoDate(d); }
    return null;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = low(s).match(/^(\d{1,2})\s+([a-zçğıöşü]+)\.?\s+(\d{4})/);
  if (m) {
    let mi = TR_MONTHS.findIndex((x) => m[2].startsWith(x.slice(0, 3)));
    if (mi < 0) mi = EN_MONTHS.findIndex((x) => m[2].startsWith(x));
    if (mi >= 0) return `${m[3]}-${pad(mi + 1)}-${pad(m[1])}`;
  }
  return null;
}
function dateRange(v) {
  if (v instanceof Date || typeof v === 'number') return [isoDate(v), null];
  const parts = String(v ?? '').split(/\s+[-–—]\s+|\s*[–—]\s*/);
  if (parts.length === 2 && isoDate(parts[0]) && isoDate(parts[1])) return [isoDate(parts[0]), isoDate(parts[1])];
  return [isoDate(v), null];
}

// Saat → 'HH:MM'. lab: bitiş saatindeki 'u' (uygulama)
export function hhmm(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`;
  if (typeof v === 'number') { if (v >= 0 && v < 1) { const mins = Math.round(v * 1440); return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`; } return null; }
  const m = String(v).match(/(\d{1,2})[:.](\d{2})/);
  return m ? `${pad(m[1])}:${m[2]}` : null;
}

// Başlık satırından sütun eşlemesi: {anahtar: [olası başlıklar]}
function findHeader(rows, spec, required) {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const row = rows[r] || [];
    const map = {};
    row.forEach((cell, j) => {
      const c = low(cell);
      if (!c) return;
      for (const [k, al] of Object.entries(spec)) if (!(k in map) && al.some((a) => (a.startsWith('=') ? c === a.slice(1) : c.includes(a)))) { map[k] = j; break; }
    });
    if (required.every((k) => k in map)) return { row: r, map };
  }
  return null;
}
const sheetWith = (book, spec, required) => {
  for (const sh of book.sheets) { const h = findHeader(sh.rows, spec, required); if (h) return { sheet: sh, ...h }; }
  return null;
};
const cell = (row, map, k) => (k in map ? row[map[k]] : null);
const num = (v) => { if (typeof v === 'number') return v; const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

// Dönem adı: "2026-2027 Güz" → {year:'2026-2027', term:'guz'}
export function termOf(text) {
  const m = String(text ?? '').match(/(\d{4})\s*[-/]\s*(\d{4})\s*(?:akademik yılı\s*)?(güz|guz|bahar|yaz|fall|spring|summer)/i);
  if (!m) return null;
  const t = low(m[3]);
  return { year: `${m[1]}-${m[2]}`, term: t.startsWith('g') || t === 'fall' ? 'guz' : t === 'yaz' || t === 'summer' ? 'yaz' : 'bahar' };
}

// ---------- Bölümün haftalık ders programı (Excel) ----------
const DAY_NAMES = [['PAZARTESİ', 'MONDAY'], ['SALI', 'TUESDAY'], ['ÇARŞAMBA', 'WEDNESDAY'], ['PERŞEMBE', 'THURSDAY'], ['CUMA', 'FRIDAY'], ['CUMARTESİ', 'SATURDAY'], ['PAZAR', 'SUNDAY']];
const dayIndex = (v) => DAY_NAMES.findIndex((d) => d.includes(TRU(v)));

export function parseTimetable(book, fileName = '') {
  const found = new Map();
  let title = null;
  let rowsRead = 0;
  for (const sh of book.sheets) {
    const rows = sh.rows;
    const active = new Map();
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] || [];
      for (const c of row) if (!title && termOf(c)) title = termOf(c);
      let header = false;
      row.forEach((c, j) => {
        const u = TRU(c);
        if ((u === 'ŞB.' || u === 'ŞB' || u === 'ŞUBE' || u === 'SEC.' || u === 'SECTION') && TRU(row[j + 1]).includes('DERS')) {
          header = true;
          let day = -1;
          for (let k = 1; k <= 3 && day < 0 && r - k >= 0; k++) for (let jj = j; jj <= j + 4 && day < 0; jj++) day = dayIndex((rows[r - k] || [])[jj]);
          if (day >= 0) active.set(j, day);
        }
      });
      if (header) continue;
      for (const [j, day] of active) {
        const code = normCode(row[j + 1]);
        const start = hhmm(row[j + 3]);
        const endRaw = row[j + 4];
        const end = hhmm(endRaw);
        if (!code || !start) continue;
        const section = parseInt(row[j], 10) || 1;
        const lab = /u\s*$/i.test(String(endRaw ?? ''));
        const key = code + '#' + section;
        if (!found.has(key)) found.set(key, { code, section, slots: [] });
        const s = found.get(key);
        if (!s.slots.some((x) => x.day === day && x.start === start)) s.slots.push({ day, start, end: end || start, type: lab ? 'U' : 'T', room: row[j + 2] ? String(row[j + 2]).trim() : '' });
        rowsRead++;
      }
    }
  }
  const ym = String(fileName).match(/(\d)\s*[.\-_ ]*\s*(?:sınıf|sinif|sınıf|year|grade)/i);
  const sections = [...found.values()].map((s) => ({ ...s, slots: s.slots.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)) }))
    .sort((a, b) => a.code.localeCompare(b.code) || a.section - b.section);
  const tm = title || termOf(fileName);
  const fnTerm = /g[üu]z|fall/i.test(fileName) ? 'guz' : /bahar|spring/i.test(fileName) ? 'bahar' : null;
  return { academicYear: tm ? tm.year : null, term: tm ? tm.term : fnTerm, year: ym ? ym[1] : null, sections, slotCount: rowsRead };
}

// ---------- Müfredat (Excel şablonu ya da JSON) ----------
export function parseCurriculum(book) {
  const cH = sheetWith(book, { sem: ['yarıyıl', 'yariyil', 'semester'], code: ['ders kodu', 'kod', 'code'], name: ['=ders adı', '=ders adi', '=adı', '=course name', '=name'], nameEn: ['(en)', 'english'], tul: ['t+u', 't+p'], credit: ['=kredi', 'credit'], ects: ['akts', 'ects'], kind: ['=tür', '=tur', 'type', 'z/s'] }, ['code', 'ects']);
  if (!cH) throw new Error('curriculum');
  const courses = [];
  const semesters = new Map();
  for (const row of cH.sheet.rows.slice(cH.row + 1)) {
    const code = normCode(cell(row, cH.map, 'code'));
    if (!code) continue;
    const c = { code, name: String(cell(row, cH.map, 'name') ?? code).trim(), nameEn: String(cell(row, cH.map, 'nameEn') ?? '').trim(), tul: String(cell(row, cH.map, 'tul') ?? '').trim(), ects: num(cell(row, cH.map, 'ects')) ?? 0, credit: num(cell(row, cH.map, 'credit')) ?? 0 };
    courses.push(c);
    const sem = num(cell(row, cH.map, 'sem'));
    const kind = low(cell(row, cH.map, 'kind'));
    if (sem && !/seç|sec|elect/.test(kind)) {
      if (!semesters.has(sem)) semesters.set(sem, { semester: sem, mandatory: [], electiveSlots: [] });
      semesters.get(sem).mandatory.push(code);
    }
  }
  const sH = sheetWith(book, { sem: ['yarıyıl', 'semester'], slot: ['=hak', 'slot', 'hak kodu'], type: ['=tür', 'type'], name: ['=adı', '=ad', '=name'], nameEn: ['(en)', 'english'], ects: ['akts', 'ects'], options: ['seçenek', 'options'] }, ['slot', 'options']);
  if (sH) {
    for (const row of sH.sheet.rows.slice(sH.row + 1)) {
      const slot = String(cell(row, sH.map, 'slot') ?? '').trim();
      const sem = num(cell(row, sH.map, 'sem'));
      if (!slot || !sem) continue;
      const optRaw = String(cell(row, sH.map, 'options') ?? '');
      const type = TRU(cell(row, sH.map, 'type')) || 'A';
      const options = /üniversite|university/i.test(optRaw) ? 'universityElectives' : [...TRU(optRaw).matchAll(/([A-ZÇĞİÖŞÜ]{2,5})\s?(\d{3,4})/g)].map((m) => `${m[1]} ${m[2]}`);
      if (!semesters.has(sem)) semesters.set(sem, { semester: sem, mandatory: [], electiveSlots: [] });
      semesters.get(sem).electiveSlots.push({ slot, type, name: String(cell(row, sH.map, 'name') ?? slot), nameEn: String(cell(row, sH.map, 'nameEn') ?? cell(row, sH.map, 'name') ?? slot), ects: num(cell(row, sH.map, 'ects')) ?? 0, options });
    }
  }
  const uH = sheetWith(book, { code: ['ders kodu', 'code'], name: ['=ders adı', '=name'], nameEn: ['(en)'], day: ['=gün', '=gun', '=day'], start: ['başlangıç', 'start'], end: ['bitiş', 'end'] }, ['code', 'day', 'start']);
  const unv = new Map();
  if (uH) {
    for (const row of uH.sheet.rows.slice(uH.row + 1)) {
      const code = normCode(cell(row, uH.map, 'code'));
      const day = dayIndex(cell(row, uH.map, 'day'));
      if (!code || day < 0) continue;
      if (!unv.has(code)) unv.set(code, { code, name: String(cell(row, uH.map, 'name') ?? code), nameEn: String(cell(row, uH.map, 'nameEn') ?? ''), online: true, slots: [] });
      unv.get(code).slots.push({ day, start: hhmm(cell(row, uH.map, 'start')), end: hhmm(cell(row, uH.map, 'end')), type: 'T', room: 'Online' });
    }
  }
  const pH = sheetWith(book, { code: ['=ders kodu', '=ders', '=course'], pre: ['ön koşul', 'on kosul', 'prerequisite'] }, ['code', 'pre']);
  const prerequisites = {};
  if (pH) for (const row of pH.sheet.rows.slice(pH.row + 1)) {
    const c = normCode(cell(row, pH.map, 'code')), p = normCode(cell(row, pH.map, 'pre'));
    if (c && p) (prerequisites[c] = prerequisites[c] || []).push(p);
  }
  const eH = sheetWith(book, { old: ['eski'], cur: ['karşılığı', 'karsiligi', 'yeni', 'müfredat'] }, ['old', 'cur']);
  const equivalences = {};
  if (eH) for (const row of eH.sheet.rows.slice(eH.row + 1)) {
    const o = normCode(cell(row, eH.map, 'old')), n = normCode(cell(row, eH.map, 'cur'));
    if (o && n) equivalences[o] = n;
  }
  if (!semesters.size) throw new Error('curriculum');
  return { semesters: [...semesters.values()].sort((a, b) => a.semester - b.semester), courses, universityElectives: { courses: [...unv.values()] }, prerequisites, equivalences, notes: [] };
}

// ---------- Kontenjan ----------
export function parseQuota(book) {
  const h = sheetWith(book, { term: ['dönem', 'term'], code: ['ders kodu', 'code'], sec: ['=şube', '=şb.', '=şb', 'section'], quota: ['kontenjan', 'quota', 'capacity'], enrolled: ['kayıtlı', 'kayitli', 'mevcut', 'dolu', 'enrolled'] }, ['code', 'quota']);
  if (!h) throw new Error('quota');
  const items = {};
  let term = null;
  for (const row of h.sheet.rows.slice(h.row + 1)) {
    const code = normCode(cell(row, h.map, 'code'));
    const quota = num(cell(row, h.map, 'quota'));
    if (!code || quota == null) continue;
    term = term || termOf(cell(row, h.map, 'term'));
    items[`${code}#${parseInt(cell(row, h.map, 'sec'), 10) || 1}`] = { quota, enrolled: num(cell(row, h.map, 'enrolled')) ?? 0 };
  }
  return { term: term ? term.term : null, academicYear: term ? term.year : null, items };
}

// ---------- Akademik takvim ----------
export function eventKind(title) {
  const s = low(title);
  if (/ekle.?bırak|ekle.?birak|add.?drop/.test(s)) return 'adddrop';
  if (/ders kay[ıi]t|course registration/.test(s)) return 'registration';
  if (/bütünleme|butunleme|make.?up|resit/.test(s)) return 'makeup';
  if (/ara sınav|ara sinav|vize|midterm/.test(s)) return 'midterm';
  if (/not.*ilan|grades/.test(s)) return 'grades';
  if (/final/.test(s)) return 'final';
  if (/tatil|bayram|holiday|yılbaşı/.test(s)) return 'holiday';
  if (/çekilme|withdraw/.test(s)) return 'withdraw';
  if (/başla|start|begin/.test(s)) return 'start';
  if (/sona er|son gün|end of/.test(s)) return 'end';
  if (/ödeme|ücret|harç|katkı|fee|payment/.test(s)) return 'fee';
  return 'other';
}
export function parseCalendar(book) {
  const h = sheetWith(book, { start: ['başlangıç', 'baslangic', '=tarih', 'start', '=date'], end: ['bitiş', 'bitis', '=end'], title: ['etkinlik', 'açıklama', 'aciklama', 'faaliyet', 'event', 'description'] }, ['start', 'title']);
  const events = [];
  const push = (a, b, title) => {
    if (!a || !title) return;
    const tm = /güz|fall/i.test(title) ? 'guz' : /bahar|spring/i.test(title) ? 'bahar' : /yaz|summer/i.test(title) ? 'yaz' : null;
    events.push({ start: a, end: b && b !== a ? b : null, title: String(title).trim(), kind: eventKind(title), term: tm });
  };
  if (h) {
    for (const row of h.sheet.rows.slice(h.row + 1)) {
      const [a, b0] = dateRange(cell(row, h.map, 'start'));
      const b = 'end' in h.map ? isoDate(cell(row, h.map, 'end')) : b0;
      push(a, b, cell(row, h.map, 'title'));
    }
  } else {
    for (const sh of book.sheets) for (const row of sh.rows) {
      const dates = row.flatMap((c) => dateRange(c)).filter(Boolean);
      const text = row.find((c) => typeof c === 'string' && !isoDate(c) && c.trim().length > 4);
      if (dates.length && text) push(dates[0], dates[1] || null, text);
    }
  }
  if (!events.length) throw new Error('calendar');
  events.sort((x, y) => x.start.localeCompare(y.start));
  const title = book.sheets.flatMap((s) => s.rows.slice(0, 3).flat()).map(String).find((x) => /\d{4}\s*-\s*\d{4}/.test(x));
  const ay = title ? (title.match(/(\d{4})\s*-\s*(\d{4})/) || []) : [];
  return { academicYear: ay[1] ? `${ay[1]}-${ay[2]}` : null, events };
}
// Takvimde bir türün o tarihte açık olup olmadığı
export function periodOf(events, kind, term) {
  return events.find((e) => e.kind === kind && (!term || !e.term || e.term === term)) || null;
}
export function inPeriod(ev, today) {
  if (!ev) return false;
  return today >= ev.start && today <= (ev.end || ev.start);
}

// ---------- Sınav takvimi ----------
export function parseExams(book) {
  const h = sheetWith(book, { code: ['ders kodu', 'code'], name: ['=ders adı', '=name'], kind: ['sınav türü', 'sinav turu', '=sınav', '=tür', 'exam type', '=type'], date: ['tarih', 'date'], start: ['başlangıç', 'baslangic', '=saat', 'start', 'time'], end: ['bitiş', 'bitis', 'end'], room: ['derslik', 'salon', 'room', 'yer'], sec: ['=şube', '=şb', 'section'] }, ['code', 'date']);
  if (!h) throw new Error('exams');
  const exams = [];
  for (const row of h.sheet.rows.slice(h.row + 1)) {
    const code = normCode(cell(row, h.map, 'code'));
    const date = isoDate(cell(row, h.map, 'date'));
    if (!code || !date) continue;
    const st = cell(row, h.map, 'start');
    let start = hhmm(st), end = hhmm(cell(row, h.map, 'end'));
    const rng = String(st ?? '').match(/(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/);
    if (rng) { start = hhmm(rng[1]); end = hhmm(rng[2]); }
    exams.push({ code, name: String(cell(row, h.map, 'name') ?? ''), kind: String(cell(row, h.map, 'kind') ?? 'Sınav').trim(), date, start: start || '09:00', end: end || start || '10:00', room: String(cell(row, h.map, 'room') ?? '').trim(), section: parseInt(cell(row, h.map, 'sec'), 10) || null });
  }
  if (!exams.length) throw new Error('exams');
  return { exams: exams.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)) };
}

// ---------- Transkript ----------
const LETTERS = ['A-', 'A', 'B+', 'B-', 'B', 'C+', 'C-', 'C', 'D+', 'D', 'F', 'AA', 'BA', 'BB', 'CB', 'CC', 'DC', 'DD', 'FD', 'FF', 'S', 'U', 'NA', 'EX', 'W', 'P', 'I'];
const TERM_ORDER = { guz: 0, bahar: 1, yaz: 2 };
export function sortTerms(terms) {
  return terms.sort((a, b) => a.year.localeCompare(b.year) || TERM_ORDER[a.term] - TERM_ORDER[b.term]);
}
function addCourse(map, termName, c) {
  const t = termOf(termName);
  if (!t) return;
  const key = `${t.year} ${t.term}`;
  if (!map.has(key)) map.set(key, { name: `${t.year} ${t.term === 'guz' ? 'Güz' : t.term === 'bahar' ? 'Bahar' : 'Yaz'}`, year: t.year, term: t.term, courses: [] });
  map.get(key).courses.push(c);
}
export function parseTranscriptBook(book) {
  const h = sheetWith(book, { term: ['dönem', 'donem', 'term', 'yarıyıl'], code: ['ders kodu', 'code'], name: ['=ders adı', '=ders adi', '=course name', '=name'], credit: ['=kredi', 'credit'], ects: ['akts', 'ects'], score: ['başarı notu', 'basari notu', '=ort', '=not', 'score'], letter: ['harf', 'letter', 'grade'], zs: ['z/s', '=z'] }, ['code', 'letter']);
  if (!h) throw new Error('transcript');
  const map = new Map();
  let lastTerm = null;
  for (const row of h.sheet.rows.slice(h.row + 1)) {
    const tv = cell(row, h.map, 'term');
    if (tv && termOf(tv)) lastTerm = tv;
    const code = normCode(cell(row, h.map, 'code'));
    const letter = TRU(cell(row, h.map, 'letter'));
    if (!code || !LETTERS.includes(letter) || !lastTerm) continue;
    addCourse(map, lastTerm, { code, name: String(cell(row, h.map, 'name') ?? '').trim(), credit: num(cell(row, h.map, 'credit')) ?? 0, ects: num(cell(row, h.map, 'ects')) ?? 0, score: num(cell(row, h.map, 'score')), letter, zs: TRU(cell(row, h.map, 'zs')) === 'S' ? 'S' : 'Z' });
  }
  const student = {};
  for (const sh of book.sheets) for (const row of sh.rows) {
    const k = low(row[0]);
    if (/ad[ıi] soyad|name/.test(k) && row[1]) student.name = String(row[1]).trim();
    if (/öğrenci no|ogrenci no|student no/.test(k) && row[1]) student.number = String(row[1]).trim();
  }
  if (!map.size) throw new Error('transcript');
  return { student, terms: sortTerms([...map.values()]) };
}

const ROW_RE = /([A-ZÇĞİÖŞÜ]{2,5})\s?(\d{4})\s+(.+?)\s+(\d{1,2})\s+(\d{1,2})\s+(?:(\d{1,3})\s+)?(A-|A|B\+|B-|B|C\+|C-|C|D\+|D|F|AA|BA|BB|CB|CC|DC|DD|FD|FF|S|U|NA|EX|W|P|I)(?=\s|$)(?:\s+(Z|S)(?=\s|$))?/g;
// Metin satırlarından transkript (PDF ya da OBS sayfasından kopyala-yapıştır)
export function parseTranscriptText(text) {
  const lines = (Array.isArray(text) ? text : String(text).split(/\r?\n/)).map((l) => l.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
  const map = new Map();
  let cols = [];
  const student = {};
  for (const line of lines) {
    const nm = line.match(/Ad[ıi]\s*Soyad[ıi]\s*:\s*(.+?)(?:\s{2,}|\s+Öğrenci|\s+Fakülte|$)/i);
    if (nm && !student.name) student.name = nm[1].trim();
    const no = line.match(/Öğrenci\s*No\s*:\s*(\d{6,})/i);
    if (no && !student.number) student.number = no[1];
    const heads = [...line.matchAll(/(\d{4})\s*-\s*(\d{4})\s*(Güz|Guz|Bahar|Yaz|Fall|Spring|Summer)/gi)].map((m) => m[0]);
    if (heads.length) cols = heads;
    if (!cols.length) continue;
    let k = 0;
    for (const m of line.matchAll(ROW_RE)) {
      const termName = cols[Math.min(k, cols.length - 1)];
      addCourse(map, termName, { code: `${m[1]} ${m[2]}`, name: m[3].replace(/\s+/g, ' ').trim(), credit: +m[4], ects: +m[5], score: m[6] != null ? +m[6] : null, letter: m[7], zs: m[8] === 'S' ? 'S' : 'Z' });
      k++;
    }
  }
  if (!map.size) throw new Error('transcript');
  return { student, terms: sortTerms([...map.values()]) };
}

// ---------- Yönetmelik: mezuniyet koşulları ----------
export const DEFAULT_RULES = { minEcts: 240, minGpa: 2.0, internshipDays: 20, normalYears: 4, maxYears: 7, retakeBelow: 'C-', limitGpa: 2.0, limitHigh: 40, limitLow: 32, scale: null };
export function parseRegulation(text) {
  const flat = String(text).replace(/\s+/g, ' ');
  const sentences = flat.split(/(?<=[.;:])\s+(?=[(A-ZÇĞİÖŞÜ0-9])/);
  const rules = {};
  const evidence = {};
  const clip = (s, idx) => {
    // Kanıt cümlesi: eşleşmeden önceki son "(1)" ya da "MADDE" başlangıcından itibaren
    let st = 0;
    for (const m of s.matchAll(/\(\d+\)|MADDE\s*\d+/g)) if (m.index <= idx) st = m.index;
    const out = s.slice(st).trim();
    return out.length > 260 ? out.slice(0, 257) + '…' : out;
  };
  const grab = (key, re, conv, filter) => {
    for (const s of sentences) {
      if (filter && !filter.test(s)) continue;
      const m = s.match(re);
      if (m) { rules[key] = conv(m); evidence[key] = clip(s, m.index); return; }
    }
  };
  const dec = (x) => parseFloat(x.replace(',', '.'));
  grab('minEcts', /en az\s*(\d{3})\s*AKTS/i, (m) => +m[1], /mezun|graduat/i);
  if (!('minEcts' in rules)) grab('minEcts', /(\d{3})\s*AKTS/i, (m) => +m[1], /mezun|graduat/i);
  grab('minGpa', /ortalama[^.]*?en az\s*(\d[.,]\d{1,2})|en az\s*(\d[.,]\d{1,2})[^.]*?ortalama/i, (m) => dec(m[1] || m[2]), /mezun|graduat/i);
  grab('internshipDays', /(\d{1,3})\s*(?:iş\s*)?gün(?:ü|lük)?\s*(?:süreli\s*)?(?:zorunlu\s*)?staj/i, (m) => +m[1]);
  if (!('internshipDays' in rules)) grab('internshipDays', /staj[^.]*?(\d{1,3})\s*(?:iş\s*)?gün/i, (m) => +m[1]);
  grab('normalYears', /normal\s*(?:öğretim|eğitim|öğrenim)?\s*süresi\s*(\d)\s*yıl/i, (m) => +m[1]);
  grab('maxYears', /azami\s*(?:öğretim|eğitim|öğrenim)?\s*süresi?\s*(\d{1,2})\s*yıl/i, (m) => +m[1]);
  grab('retakeBelow', /\b(A-|B\+|B-|B|C\+|C-|C|D\+|D|BA|BB|CB|CC|DC|DD)\s*(?:ve|veya)\s*(?:daha\s*)?(?:düşük|altı|altındaki)/i, (m) => m[1].toUpperCase(), /tekrar|yükselt/i);
  grab('limits', /(\d[.,]\d{2})\s*ve\s*(?:üzeri|üstü)[^.]*?(\d{2})\s*AKTS[^.]*?(\d[.,]\d{2})\s*altında[^.]*?(\d{2})\s*AKTS/i, (m) => ({ gpa: dec(m[1]), high: +m[2], low: +m[4] }));
  if (rules.limits) { rules.limitGpa = rules.limits.gpa; rules.limitHigh = rules.limits.high; rules.limitLow = rules.limits.low; evidence.limitHigh = evidence.limits; delete rules.limits; delete evidence.limits; }
  // Not katsayıları: "A 4,00; A- 3,70; ..." gibi birbirine yakın en az 5 eşleşme
  const scale = {};
  const ms = [...flat.matchAll(/(?:^|[\s;,(])(A-|A|B\+|B-|B|C\+|C-|C|D\+|D|F|AA|BA|BB|CB|CC|DC|DD|FD|FF)\s*(?:[:=]\s*|\(\s*)?(\d[.,]\d{2})/g)];
  let run = [];
  for (const m of ms) {
    if (run.length && m.index - run[run.length - 1].index > 40) { if (run.length >= 5) break; run = []; }
    run.push(m);
  }
  if (run.length >= 5) {
    for (const m of run) scale[m[1]] = dec(m[2]);
    rules.scale = scale;
    evidence.scale = clip(flat.slice(Math.max(0, run[0].index - 160), run[run.length - 1].index + 40), 160);
  }
  return { rules, evidence, found: Object.keys(rules) };
}

// ---------- İçerikten dosya türü tahmini (toplu yükleme için) ----------
export function guessKind(name, read) {
  const n = low(name);
  if (read.kind === 'json') return read.json && read.json.semesters ? 'curriculum' : null;
  if (read.kind === 'sheet') {
    const flat = read.book.sheets.flatMap((s) => s.rows.slice(0, 25).flat()).map(low).join(' | ');
    if (flat.includes('baş.saat') || flat.includes('ders kodu | derslik')) return 'timetable';
    if (read.book.sheets.some((s) => /seçmeli hak/i.test(s.name)) || (flat.includes('yarıyıl') && flat.includes('akts') && flat.includes('t+u'))) return 'curriculum';
    if (flat.includes('kontenjan')) return 'quota';
    if (flat.includes('harf')) return 'transcript';
    if (flat.includes('sınav') && flat.includes('tarih')) return 'exams';
    if (flat.includes('etkinlik') || /takvim/.test(n)) return 'calendar';
    if (/program/.test(n)) return 'timetable';
    return null;
  }
  const txt = low(read.text || '');
  if (/transkript|transcript/.test(txt) || /transkript|transcript/.test(n)) return 'transcript';
  if (/yönetmeli|yonetmeli|regulation/.test(txt) || /yonetmelik|yönetmelik/.test(n)) return 'regulation';
  return 'docs';
}
