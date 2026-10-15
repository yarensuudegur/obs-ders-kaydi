import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildModel, emptyState, evaluate, toggleSection, setListChoice, gridHours, slotFill, totalEcts, unvSlotName } from '../src/logic.js';

const mufredat = JSON.parse(readFileSync(new URL('../data/mufredat.json', import.meta.url)));
const program = JSON.parse(readFileSync(new URL('../data/program.json', import.meta.url)));

const guz7 = () => buildModel(mufredat, program, { year: 4, term: 'guz', mustRetake: ['ME 3220'] });
const bahar8 = () => buildModel(mufredat, program, { year: 4, term: 'bahar', mustRetake: [] });
const st = (m, s, id) => evaluate(m, s).status.get(id).state;

test('Güz 4. sınıf = 7. yarıyıl; tek şubeli zorunlu ve alttan ders sabit seçilir', () => {
  const m = guz7();
  assert.equal(m.semester, 7);
  assert.ok(m.fixedIds.has('ENGR 4411#1'));
  assert.ok(m.fixedIds.has('ME 3220#1'));
  assert.ok(!m.fixedIds.has('ME 4910#1'), 'çok şubeli zorunlu sabit olmamalı');
  assert.equal(st(m, emptyState(), 'ME 3220#1'), 'fixed');
});

test('Sabit zorunluyla çakışan ders siyah kilit (locked-fixed) ve sebep yazar', () => {
  const m = guz7();
  const s = evaluate(m, emptyState()).status.get('ME 4610#1'); // Salı 08:40 ME 3220 ile
  assert.equal(s.state, 'locked-fixed');
  assert.match(s.reason, /ME 3220 \(Zorunlu\) ile Salı 08:40/);
});

test('Şube = blok: bir şube seçilince tüm saatleri seçimde sayılır ve kardeşleri pasifleşir', () => {
  const m = guz7();
  const r = toggleSection(m, emptyState(), 'ME 4910#2');
  assert.ok(r.ok);
  assert.equal(st(m, r.state, 'ME 4910#2'), 'selected');
  for (const n of [1, 3, 4, 5, 6, 7, 8]) assert.equal(st(m, r.state, `ME 4910#${n}`), 'sibling');
  // ME 4910#2 Cumartesi 12:40-15:40 -> Cumartesi 12:40'ta başka şube olan ders yok ama aynı saatteki şubeler kardeş
});

test('Kendi seçimiyle çakışan ders gri kilit (locked-choice); seçim kalkınca açılır', () => {
  const m = guz7();
  // ME 4240 Salı 12:40-15:30, EEE 4122 Salı 14:40'tan itibaren -> çakışır
  let r = toggleSection(m, emptyState(), 'ME 4240#1');
  assert.ok(r.ok);
  let s = r.state;
  assert.equal(st(m, s, 'EEE 4122#1'), 'locked-choice');
  assert.match(evaluate(m, s).status.get('EEE 4122#1').reason, /Seçtiğin ME 4240 ile Salı 14:40/);
  s = toggleSection(m, s, 'ME 4240#1').state;
  assert.equal(st(m, s, 'EEE 4122#1'), 'free');
});

test('Kilitli şube seçilemez', () => {
  const m = guz7();
  const r = toggleSection(m, emptyState(), 'ME 4610#1');
  assert.equal(r.ok, false);
});

test('A/B önceliği: ME dersi önce A2, sonra B1; ikisi dolunca adaylar pasif', () => {
  const m = guz7();
  let r = toggleSection(m, emptyState(), 'ME 4340#1');
  assert.equal(r.slot, 'A2');
  r = toggleSection(m, r.state, 'ME 4240#1');
  assert.equal(r.slot, 'B1');
  assert.deepEqual(slotFill(m, r.state), { A2: 'ME 4340', B1: 'ME 4240', STAJ: null });
  assert.equal(st(m, r.state, 'ESE 4240#1'), 'slot-full');
  assert.equal(st(m, r.state, 'ME 4330#1'), 'slot-full');
});

test('Sadece B havuzundaki ders A boşluğunu dolduramaz', () => {
  const m = guz7();
  const r = toggleSection(m, emptyState(), 'ESE 4240#1');
  assert.equal(r.slot, 'B1');
  assert.equal(st(m, r.state, 'ME 4340#1'), 'free'); // A2 hâlâ açık
});

test('8. yarıyıl B2 + B3: iki B boşluğu dolana kadar B adayları açık kalır', () => {
  const m = bahar8();
  assert.equal(m.semester, 8);
  let r = toggleSection(m, emptyState(), 'ME 4620#1'); // A3
  assert.equal(r.slot, 'A3');
  r = toggleSection(m, r.state, 'COMP 4480#1');
  assert.equal(r.slot, 'B2');
  assert.equal(st(m, r.state, 'ESE 4132#1'), 'free');
  r = toggleSection(m, r.state, 'ESE 4132#1');
  assert.equal(r.slot, 'B3');
  assert.equal(st(m, r.state, 'ESE 4312#1'), 'slot-full');
});

test('Geçilen ders kilitli; müfredat dışı (geçilmemiş) ders ek ders olarak seçilebilir', () => {
  const m = guz7();
  assert.equal(evaluate(m, emptyState()).status.get('ME 3320#2').state, 'passed');
  assert.equal(toggleSection(m, emptyState(), 'ME 3320#2').ok, false);
  // ME 4910 geçilmiş işaretlenirse listeden düşer, ME 4920 (8. yarıyıl, katman yok) ek ders olur
  const m2 = buildModel(mufredat, program, { year: 4, term: 'guz', mustRetake: ['ME 3220'], status: { 'ME 4910': 'passed' } });
  assert.ok(!m2.requirements.some((r) => r.code === 'ME 4910'));
  const e = evaluate(m2, emptyState()).status.get('ME 4920#1@bahar');
  assert.equal(e.state, 'free');
  assert.equal(e.extra, true);
  const r = toggleSection(m2, emptyState(), 'ME 4920#1@bahar');
  assert.ok(r.ok);
  assert.equal(totalEcts(m2, r.state), totalEcts(m2, emptyState()) + 8);
});

test('Diğer dönemin programı da yüklenir: kimlik @dönem ekiyle, aynı ders kardeş sayılır', () => {
  const m = guz7();
  assert.ok(m.sections.has('ME 4620#1@bahar'), '4. sınıf bahar dersi güz kaydında görünür');
  assert.ok(m.sections.get('ME 3410#1@bahar').layers.has('3|bahar'));
  // ENGR 4411 güzde tek şube -> sabit; baharda ki şubesi kardeş olarak kilitli
  assert.ok(m.fixedIds.has('ENGR 4411#1'));
  assert.equal(st(m, emptyState(), 'ENGR 4411#1@bahar'), 'sibling');
  // Üstten/başka dönemden seçmeli: ME 4620 (bahar) A2 hakkını doldurabilir
  const r = toggleSection(m, emptyState(), 'ME 4620#1@bahar');
  assert.ok(r.ok);
  assert.equal(r.slot, 'A2');
});

test('AKTS: sabitler + seçimler + boşluk AKTS', () => {
  const m = guz7();
  // sabit: ENGR 4411 (3) + ME 3220 (5)
  assert.equal(totalEcts(m, emptyState()), 8);
  const r0 = toggleSection(m, emptyState(), 'ME 4910#1');
  assert.ok(r0.ok);
  let s = r0.state; // +8
  s = toggleSection(m, s, 'ME 4340#1').state; // +6 (A2)
  s = setListChoice(m, s, 'STAJ', 'ME 4830').state; // +4
  assert.equal(totalEcts(m, s), 26);
});

test('Akşam satırları sadece gerektiğinde eklenir', () => {
  assert.equal(gridHours([{ slots: [{ start: '08:40' }] }]).length, 9);
  const h = gridHours([{ slots: [{ start: '21:40' }] }]);
  assert.equal(h.at(-1), '21:40');
  assert.equal(h.length, 14);
});

test('Üniversite seçmelisi çakışma kontrolüne girmez', () => {
  const m = bahar8();
  const slot = unvSlotName(m);
  assert.equal(slot, 'UNV ME3');
  // UMFD 1720 değil ama: Çarşamba akşamı UNV 1003 seçilince hiçbir şube kilitlenmez
  const before = evaluate(m, emptyState()).status;
  const s = setListChoice(m, emptyState(), slot, 'UNV 1003').state;
  const after = evaluate(m, s).status;
  for (const [id, v] of before) assert.equal(after.get(id).state, v.state, id);
  assert.equal(totalEcts(m, s), totalEcts(m, emptyState()) + 3);
  // aynı derse tekrar tıklamak seçimi kaldırır, başka derse tıklamak değiştirir
  assert.equal(setListChoice(m, s, slot, 'UNV 1003').state.listChoices[slot], undefined);
  assert.equal(setListChoice(m, s, slot, 'UNV 1001').state.listChoices[slot], 'UNV 1001');
});

test('Açılmamış zorunlu ders ve sabitler arası çakışma uyarısı', () => {
  const m = buildModel(mufredat, program, { year: 3, term: 'bahar', mustRetake: [] });
  const w = evaluate(m, emptyState()).warnings.map((x) => x.text).join('\n');
  assert.match(w, /MATH 2260/);
  // Güz 7 + alttan ME 3420 (Çar 08:40) ile çakışma yok, ENGR 4411 ile kendi çakışması yok
  const m2 = buildModel(mufredat, program, { year: 4, term: 'bahar', mustRetake: ['ME 3410', 'ME 3510'] });
  const w2 = evaluate(m2, emptyState()).warnings;
  assert.ok(Array.isArray(w2));
});

test('Staj tek seçenekli: sadece eklenir (ME 4830)', () => {
  const m = guz7();
  const staj = m.electiveSlots.find((s) => s.slotType === 'STAJ');
  assert.deepEqual(staj.options, ['ME 4830']);
  const s = setListChoice(m, emptyState(), 'STAJ', staj.options[0]).state;
  assert.equal(slotFill(m, s).STAJ, 'ME 4830');
  assert.equal(totalEcts(m, s), totalEcts(m, emptyState()) + 4);
});

test('Her dersin ve seçmeli hakkının İngilizce adı var', () => {
  for (const c of mufredat.courses) assert.ok(c.nameEn, c.code);
  for (const c of mufredat.universityElectives.courses) assert.ok(c.nameEn, c.code);
  for (const s of mufredat.semesters) for (const e of s.electiveSlots) assert.ok(e.nameEn, e.slot);
});

import { suggestPrograms, assignElectives, replayState } from '../src/logic.js';

test('Öneri: bütün kombinasyonlar çakışmasız ve sıralı', () => {
  const m = guz7();
  const r = suggestPrograms(m, ['ENGR 4400', 'ENGR 4411', 'ME 4910', 'UMFD 1720', 'ME 3220', 'ME 4340']);
  assert.ok(r.programs.length > 0);
  assert.equal(r.programs.length, r.total);
  for (const p of r.programs) {
    const seen = new Set();
    for (const id of p.sections) for (const sl of m.sections.get(id).slots) {
      const k = sl.day + '|' + sl.start;
      assert.ok(!seen.has(k), 'çakışma ' + id);
      seen.add(k);
    }
    assert.ok(p.sections.includes('ME 3220#1'), 'alttan ders her programda');
  }
  for (let i = 1; i < r.programs.length; i++) assert.ok(r.programs[i - 1].score <= r.programs[i].score);
  // Uygulanan program geçerli bir seçim olmalı
  const st = { picks: r.programs[0].picks, listChoices: {} };
  const ev = evaluate(m, st);
  for (const p of st.picks) assert.equal(ev.status.get(p.id).state, 'selected');
  assert.equal(slotFill(m, st).A2, 'ME 4340');
});

test('Öneri: sabit zorunluyla her şubesi çakışan ders engel olarak bulunur', () => {
  const m = guz7();
  const r = suggestPrograms(m, ['ME 3220', 'ME 4610']); // ME 4610 tek şube, ME 3220 ile çakışıyor
  assert.equal(r.programs.length, 0);
  assert.ok(r.blockers.includes('ME 4610') || r.blockers.includes('ME 3220'));
});

test('Öneri: seçmeli dağıtımı B-yalnız dersi B hakkına koyar', () => {
  const m = guz7();
  assert.deepEqual(assignElectives(m, ['ME 4340', 'ESE 4240']), { 'ESE 4240': 'B1', 'ME 4340': 'A2' });
  assert.equal(assignElectives(m, ['ESE 4240', 'EEE 4122']), null); // iki B, tek B hakkı
});

test('Üst yarıyıl açılınca gereksinimleri eklenir; ME 4920 ön koşullu', () => {
  const m = buildModel(mufredat, program, { year: 4, term: 'guz', mustRetake: ['ME 3220'], extraSemesters: [8] });
  const ids = m.requirements.map((r) => r.id);
  for (const x of ['ME 4920', 'A3', 'B2', 'B3', 'UNV ME3', 'A2', 'B1']) assert.ok(ids.includes(x), x);
  assert.ok(m.requirements.find((r) => r.id === 'ME 4920').upper);
  const ev = evaluate(m, emptyState());
  for (const id of ['ME 4920#1@bahar', 'ME 4920#3@bahar']) assert.equal(ev.status.get(id).state, 'prereq');
  assert.equal(toggleSection(m, emptyState(), 'ME 4920#1@bahar').ok, false);
  // üst yarıyılın zorunlusu eksik sayılmaz, açılmadı uyarısı çıkmaz
  assert.ok(!ev.warnings.some((w) => w.code === 'ME 4920'));
  // seçmeliler önce kendi yarıyılının hakkına gider, sonra üst yarıyıla
  let s = toggleSection(m, emptyState(), 'ME 4340#1').state;
  let r = toggleSection(m, s, 'ME 4620#1@bahar');
  assert.equal(r.slot, 'B1'); // önce kendi yarıyılının boş hakkı
  r = toggleSection(m, r.state, 'ME 4240#1@bahar');
  assert.equal(r.slot, 'A3'); // kendi yarıyılı dolunca üst yarıyıla
  assert.equal(suggestPrograms(m, ['ME 4920']).programs.length, 1); // ön koşullu ders öneriden düşer (boş program)
});

test('8. yarıyıl kaydında ME 4910 geçilmiş sayılır, ME 4920 seçilebilir', () => {
  const m = bahar8();
  assert.equal(m.blockedBy('ME 4920').length, 0);
  assert.equal(evaluate(m, emptyState()).status.get('ME 4920#1').state, 'free');
});

test('Üst yarıyıl kapanınca seçimler yeniden uygulanır', () => {
  const up = buildModel(mufredat, program, { year: 4, term: 'guz', mustRetake: ['ME 3220'], extraSemesters: [8] });
  let s = toggleSection(up, emptyState(), 'ME 4340#1').state;
  s = toggleSection(up, s, 'ME 4620#1@bahar').state;
  const down = guz7();
  const r = replayState(down, s);
  assert.deepEqual(slotFill(down, r), { A2: 'ME 4340', B1: 'ME 4620', STAJ: null });
});

test('Kaldığı ve almadığı alt yarıyıl dersleri "alttan" zorunlu gelir, geçtikleri gelmez', () => {
  const m = buildModel(mufredat, program, { year: 4, term: 'guz', status: { 'ME 3220': 'failed', 'ME 3410': 'none', A1: 'failed' }, extraSemesters: [8] });
  assert.deepEqual(m.extraSemesters, [5, 6, 8]);
  const r = (id) => m.requirements.find((x) => x.id === id);
  assert.equal(r('ME 3220').kind, 'retake');
  assert.equal(r('ME 3220').status, 'failed');
  assert.equal(r('ME 3410').dir, 'lower');
  assert.equal(r('ME 3410').status, 'none');
  assert.equal(r('ME 3410').upper, false); // zorunlu
  assert.ok(r('A1') && !r('A1').upper);
  assert.equal(r('ME 3320'), undefined); // geçti
  assert.equal(r('ME 4920').dir, 'upper');
  assert.ok(m.fixedIds.has('ME 3220#1'));
  // A1 (alttan) hakkı, kendi yarıyılının hakları dolmadan önce kullanılmaz
  let st = toggleSection(m, emptyState(), 'ME 4340#1');
  assert.equal(st.slot, 'A2');
});

test('yapay zeka önerileri: bu dönem açılmayan ders diğer dönemin şubesiyle programa konmaz', () => {
  const m = guz7();
  assert.equal(m.termSections('ME 4230').length, 0); // sadece Bahar'da açılıyor
  assert.ok((m.sectionsByCode.get('ME 4230') || []).length > 0);
  const r = suggestPrograms(m, ['ENGR 4400', 'ENGR 4411', 'ME 4910', 'UMFD 1720', 'ME 3220', 'ME 4230', 'ME 4240']);
  assert.ok(r.programs.length > 0);
  for (const p of r.programs) {
    assert.ok(p.sections.every((id) => !id.includes('@')), 'diğer dönem şubesi seçilmemeli');
    assert.ok(p.sections.every((id) => !id.startsWith('ME 4230')));
  }
});
