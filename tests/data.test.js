import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readXlsx, readCsv } from '../src/files.js';
import * as P from '../src/parsers.js';
import * as A from '../src/academic.js';
import { buildModel, emptyState, evaluate, toggleSection, reassignSlot, extraCodes, totalEcts } from '../src/logic.js';

const file = (p) => readFileSync(new URL('../' + p, import.meta.url));
const mufredat = JSON.parse(file('data/mufredat.json'));
const program = JSON.parse(file('data/program.json'));
const key = (s) => s.code + '#' + s.section + ':' + s.slots.map((x) => [x.day, x.start, x.end, x.type, x.room].join('/')).join(',');

test('bölümün Excel ders programı aynen okunur (program.json ile aynı şubeler)', async () => {
  for (const [y, tm] of [['3', 'guz'], ['4', 'guz'], ['3', 'bahar'], ['4', 'bahar']]) {
    const name = `ders-programi-${y}-sinif-${tm}.xlsx`;
    const r = P.parseTimetable(await readXlsx(file('samples/' + name)), name);
    assert.equal(r.term, tm);
    assert.equal(r.year, y);
    const got = r.sections.filter((s) => s.code !== 'ME 4851').map(key).sort();
    assert.deepEqual(got, program.terms[tm][y].map(key).sort(), name);
  }
});

test('müfredat Excel şablonu müfredat verisini aynen verir', async () => {
  const cur = P.parseCurriculum(await readXlsx(file('samples/mufredat.xlsx')));
  assert.deepEqual(cur.semesters.map((s) => s.mandatory), mufredat.semesters.map((s) => s.mandatory));
  assert.deepEqual(cur.semesters.map((s) => s.electiveSlots.map((e) => [e.slot, e.type, e.ects, e.options])), mufredat.semesters.map((s) => s.electiveSlots.map((e) => [e.slot, e.type, e.ects, e.options])));
  assert.equal(cur.courses.length, mufredat.courses.length);
  assert.deepEqual(cur.prerequisites, { 'ME 4920': ['ME 4910'] });
  assert.equal(cur.equivalences['SE 1115'], 'ENGR 1115');
  assert.equal(cur.universityElectives.courses.length, 6);
});

test('akademik takvim: dönemler türlerine ayrılır, ekle-bırak tarihi kontrol edilir', async () => {
  const cal = P.parseCalendar(await readXlsx(file('samples/akademik-takvim.xlsx')));
  const ad = P.periodOf(cal.events, 'adddrop', 'guz');
  assert.deepEqual([ad.start, ad.end], ['2026-09-21', '2026-09-25']);
  assert.equal(P.periodOf(cal.events, 'registration', 'bahar').start, '2027-02-08');
  assert.ok(P.inPeriod(ad, '2026-09-23'));
  assert.ok(!P.inPeriod(ad, '2026-09-26'));
  // CSV ve tek sütunda tarih aralığı
  const csv = readCsv('Tarih;Etkinlik\n07.09.2026 - 11.09.2026;Güz Ders Kayıtları\n14 Eylül 2026;Derslerin Başlaması');
  const c2 = P.parseCalendar(csv);
  assert.deepEqual(c2.events.map((e) => [e.start, e.end, e.kind]), [['2026-09-07', '2026-09-11', 'registration'], ['2026-09-14', null, 'start']]);
});

test('sınav takvimi dosyası', async () => {
  const ex = P.parseExams(await readXlsx(file('samples/sinav-takvimi.xlsx')));
  assert.equal(ex.exams.length, 18);
  assert.deepEqual([ex.exams[0].code, ex.exams[0].date, ex.exams[0].start], ['ENGR 4400', '2026-11-10', '10:00']);
});

// Kontenjan dosyası kaldırıldı; anlık kontenjan ileride üniversite API'sinden gelecek. Mantık hazır kalsın.
test('dolu şube (ileride API ile gelen kontenjan) kilitlenir, öneriler dolu şubeyi atlar', () => {
  const prog = JSON.parse(JSON.stringify(program));
  for (const s of prog.terms.guz['4']) if (s.code === 'ENGR 4400' && s.section === 1) { s.quota = 30; s.enrolled = 30; }
  const m = buildModel(mufredat, prog, { year: 4, term: 'guz', mustRetake: [] });
  assert.equal(evaluate(m, emptyState()).status.get('ENGR 4400#1').state, 'full');
  assert.ok(!toggleSection(m, emptyState(), 'ENGR 4400#1').ok);
});

test('seçmeli saydırma: başka bir hakka ya da ek derse sayılır', () => {
  const m = buildModel(mufredat, program, { year: 4, term: 'guz', mustRetake: [] });
  let r = toggleSection(m, emptyState(), 'ME 4240#1');
  assert.equal(r.slot, 'A2');
  const id = 'ME 4240#1';
  const b = reassignSlot(m, r.state, id, 'B1');
  assert.ok(b.ok);
  assert.equal(b.state.picks[0].slot, 'B1');
  assert.ok(!reassignSlot(m, r.state, id, 'STAJ').ok);
  const ext = reassignSlot(m, r.state, id, null);
  assert.deepEqual(extraCodes(m, ext.state), ['ME 4240']);
  assert.equal(totalEcts(m, ext.state), totalEcts(m, r.state) - 6 + 6);
});

const TR_ROWS = 'Dönem;Ders Kodu;Ders Adı;Kredi;AKTS;Başarı Notu;Harf Notu;Z/S\n' +
  '2023-2024 Güz;XYZ 1001;Ders A;3;6;52;C-;Z\n2023-2024 Güz;XYZ 1002;Ders B;4;7;60;C;Z\n2023-2024 Güz;XYZ 1003;Ders C;4;7;47;C-;Z\n2023-2024 Güz;XYZ 1004;Ders D;3;6;75;B-;Z\n2023-2024 Güz;XYZ 1005;Ders E;4;4;87;B+;Z\n' +
  '2023-2024 Bahar;XYZ 2001;Ders F;4;7;38;F;Z\n2023-2024 Bahar;XYZ 2002;Ders G;4;7;57;C;Z\n2023-2024 Bahar;XYZ 2003;Ders H;3;6;54;D;Z\n2023-2024 Bahar;XYZ 2004;Ders I;3;6;28;F;Z\n2023-2024 Bahar;XYZ 2005;Ders J;4;4;86;B+;Z\n' +
  '2024-2025 Bahar;XYZ 2001;Ders F;4;7;75;B+;Z\n2024-2025 Bahar;XYZ 3001;Ders K;1;1;100;S;Z';

test('ANO/AGNO: AKTS ağırlıklı, iki haneye kesilir, tekrar edilen derste son not geçerli, S katılmaz', () => {
  const tr = P.parseTranscriptBook(readCsv(TR_ROWS));
  const st = A.termStats(tr);
  assert.deepEqual(st.rows.map((r) => [r.ano, r.agno]), [[2.18, 2.18], [1.1, 1.64], [3.3, 2.03]]);
  assert.equal(st.rows[1].passedEcts, 17);
  assert.equal(st.totals.ects, 61);
});

test('transkript metni: iki sütunlu sayfadan kopyala-yapıştır', () => {
  const text = [
    'Adı Soyadı: DEMO ÖĞRENCİ  Öğrenci No: 23070001234',
    '2023-2024 Güz 2023-2024 Bahar',
    'Ders Kodu Ders Adı Kredi AKTS Ort Harf Z Ders Kodu Ders Adı Kredi AKTS Ort Harf Z',
    'MATH 1131 ANALİZ I 4 7 65 C+ Z CHEM 1130 MÜHENDİSLİK KİMYASI 0 6 31 F Z',
    'PHYS 1121 FİZİK I 4 7 59 C- Z MATH 1132 ANALİZ II 4 7 61 C Z',
    'UMFD 1020 ELEŞTİREL VE ANALİTİK DÜŞÜNMENİN TEMELLERİ 2 2 87 A- Z',
  ].join('\n');
  const tr = P.parseTranscriptText(text);
  assert.deepEqual(tr.student, { name: 'DEMO ÖĞRENCİ', number: '23070001234' });
  assert.deepEqual(tr.terms.map((t) => [t.name, t.courses.map((c) => c.code + ':' + c.letter).join(',')]), [
    ['2023-2024 Güz', 'MATH 1131:C+,PHYS 1121:C-,UMFD 1020:A-'],
    ['2023-2024 Bahar', 'CHEM 1130:F,MATH 1132:C'],
  ]);
});

test('yönetmelik metninden mezuniyet koşulları ve not ölçeği', () => {
  const r = P.parseRegulation('MADDE 8 – (1) Lisans programlarının normal öğretim süresi 4 yıl, azami öğretim süresi 7 yıldır. MADDE 20 – (1) Başarı notları ve katsayıları şunlardır: A 4,00; A- 3,70; B+ 3,30; B 3,00; B- 2,70; C+ 2,30; C 2,00; C- 1,70; D+ 1,30; D 1,00; F 0,00. MADDE 22 – (1) Not yükseltmek amacıyla C- ve daha düşük harf notu alınan dersler tekrar alınabilir. MADDE 30 – (1) Öğrencinin mezun olabilmesi için en az 240 AKTS kazanması ve genel not ortalamasının en az 2,00 olması gerekir. (2) Öğrenci 20 iş günü zorunlu stajını tamamlamadan mezun olamaz.');
  assert.equal(r.rules.minEcts, 240);
  assert.equal(r.rules.minGpa, 2);
  assert.equal(r.rules.internshipDays, 20);
  assert.equal(r.rules.maxYears, 7);
  assert.equal(r.rules.retakeBelow, 'C-');
  assert.equal(r.rules.scale['A-'], 3.7);
  assert.match(r.evidence.internshipDays, /^\(2\) Öğrenci 20 iş günü/);
});

test('örnek transkript: kayıt dönemi, ders durumları, öneriler ve dönem planı', async () => {
  const tr = P.parseTranscriptBook(await readXlsx(file('samples/transkript.xlsx')));
  const st = A.studentFromTranscript(mufredat, tr);
  assert.deepEqual([st.semester, st.year, st.term, st.regYear], [7, 4, 'guz', '2026-2027']);
  assert.equal(st.status['ME 3220'], 'failed');
  assert.equal(st.status['CHEM 1130'], 'passed'); // tekrar edilip geçildi
  assert.equal(st.assigned.A1, 'ME 4230');
  const rs = A.retakeSuggestions(tr, { below: 'C-', target: 'B' });
  assert.ok(rs.items.length >= 4);
  assert.ok(rs.items.every((x, i, a) => i === 0 || a[i - 1].gain >= x.gain));
  assert.ok(rs.allAgno > rs.base);
  const plan = A.planTerms(mufredat, st, { start: { year: '2026-2027', term: 'guz' }, limit: 40 });
  const termOf = (code) => plan.terms.findIndex((t) => t.items.some((i) => i.code === code));
  assert.equal(termOf('ME 3220'), 0);
  assert.ok(termOf('ME 4920') > termOf('ME 4910'));
  assert.ok(plan.terms.every((t) => t.ects <= 40));
  assert.deepEqual(plan.graduation, { year: '2026-2027', term: 'bahar' });
  const gp = A.graduationProgress(mufredat, tr, P.DEFAULT_RULES, { semester: 7 });
  assert.equal(gp.ects.done, 175);
  assert.equal(gp.failed.map((x) => x.code).join(), 'ME 3220');
  assert.equal(gp.complete, false);
});
