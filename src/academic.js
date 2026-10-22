// Akademik hesaplar: not ortalamaları, müfredat durumu, mezuniyet ilerlemesi, not yükseltme ve dönem planı önerileri.
// Saf fonksiyonlar; transkript = { student, terms: [{ name, year, term, courses: [{code, name, credit, ects, score, letter, zs}] }] }

export const DEFAULT_SCALE = { A: 4, 'A-': 3.7, 'B+': 3.3, B: 3, 'B-': 2.7, 'C+': 2.3, C: 2, 'C-': 1.7, 'D+': 1.3, D: 1, F: 0, AA: 4, BA: 3.5, BB: 3, CB: 2.5, CC: 2, DC: 1.5, DD: 1, FD: 0.5, FF: 0 };
const FAIL = new Set(['F', 'FF', 'FD', 'U', 'NA', 'W', 'I']);
export const isPass = (letter) => !FAIL.has(letter);
// Ortalamalar iki haneye kesilir (2,1866 → 2,18), OBS'deki gibi
export const trunc2 = (x) => Math.floor(x * 100 + 1e-7) / 100;
export const scaleOf = (rules) => ({ ...DEFAULT_SCALE, ...((rules && rules.scale) || {}) });
// Ölçekteki harfler, yüksekten düşüğe (tek sistem: A/A- ya da AA/BA, transkriptte hangisi kullanılıyorsa)
export function lettersFor(scale, sample) {
  const two = /^(AA|BA|BB|CB|CC|DC|DD|FD|FF)$/.test(sample || '');
  return Object.entries(scale).filter(([l]) => (two ? /^[A-F]{2}$/.test(l) : !/^[A-F]{2}$/.test(l))).sort((a, b) => b[1] - a[1]).map(([l]) => l);
}

export const canon = (code, eq) => (eq && eq[code]) || code;

// Her dersin son denemesi (tekrar edilen derslerde son alınan not geçerli)
export function lastAttempts(transcript, eq) {
  const last = new Map();
  for (const t of transcript.terms) for (const c of t.courses) last.set(canon(c.code, eq), { ...c, term: t.name });
  return last;
}

export function gpaOf(courses, scale) {
  let w = 0, e = 0;
  for (const c of courses) if (c.letter in scale && c.ects > 0) { w += scale[c.letter] * c.ects; e += c.ects; }
  return e ? trunc2(w / e) : 0;
}

// Dönem ortalamaları (OBS "Dönem Ortalamaları" tablosu)
export function termStats(transcript, { scale = DEFAULT_SCALE, eq = {} } = {}) {
  const last = new Map();
  const rows = transcript.terms.map((t) => {
    let credit = 0, ects = 0, pc = 0, pe = 0;
    for (const c of t.courses) {
      credit += c.credit || 0; ects += c.ects || 0;
      if (isPass(c.letter)) { pc += c.credit || 0; pe += c.ects || 0; }
      last.set(canon(c.code, eq), c);
    }
    return { name: t.name, year: t.year, term: t.term, count: t.courses.length, credit, ects, passedCredit: pc, passedEcts: pe, ano: gpaOf(t.courses, scale), agno: gpaOf([...last.values()], scale) };
  });
  const lastList = [...last.values()];
  const totals = {
    credit: lastList.reduce((a, c) => a + (c.credit || 0), 0),
    ects: lastList.reduce((a, c) => a + (c.ects || 0), 0),
    passedCredit: lastList.filter((c) => isPass(c.letter)).reduce((a, c) => a + (c.credit || 0), 0),
    passedEcts: lastList.filter((c) => isPass(c.letter)).reduce((a, c) => a + (c.ects || 0), 0),
    agno: gpaOf(lastList, scale),
  };
  return { rows, totals };
}

// Kayıt dönemi: transkriptteki son dönemden sonraki dönem
export function nextTerm(year, term) {
  const [a, b] = year.split('-').map(Number);
  return term === 'guz' ? { year, term: 'bahar' } : { year: `${a + 1}-${b + 1}`, term: 'guz' };
}
export const termLabel = (x, lang = 'tr') => `${x.year} ${lang === 'en' ? (x.term === 'guz' ? 'Fall' : x.term === 'bahar' ? 'Spring' : 'Summer') : x.term === 'guz' ? 'Güz' : x.term === 'bahar' ? 'Bahar' : 'Yaz'}`;

// Seçmeli haklarına transkriptteki dersleri yerleştir
function assignSlots(muf, last) {
  const curriculumCodes = new Set(muf.courses.map((c) => c.code));
  const pool = new Set();
  for (const s of muf.semesters) for (const e of s.electiveSlots) if (Array.isArray(e.options)) e.options.forEach((o) => pool.add(o));
  const mandatory = new Set(muf.semesters.flatMap((s) => s.mandatory));
  const unvCodes = new Set((muf.universityElectives?.courses || []).map((c) => c.code));
  const used = new Set();
  const assigned = {};
  const passedList = [...last.values()].filter((c) => isPass(c.letter));
  for (const s of muf.semesters) {
    for (const e of s.electiveSlots) {
      let pick;
      if (e.options === 'universityElectives') pick = passedList.find((c) => !used.has(c.code) && (unvCodes.has(c.code) || (!curriculumCodes.has(c.code) && !pool.has(c.code) && !mandatory.has(c.code))));
      else pick = passedList.find((c) => !used.has(c.code) && e.options.includes(c.code));
      if (pick) { used.add(pick.code); assigned[e.slot] = pick.code; }
    }
  }
  return assigned;
}

// Transkriptten ders kaydı için öğrenci durumu
export function studentFromTranscript(muf, transcript, { scale = DEFAULT_SCALE, eq = {} } = {}) {
  const last = lastAttempts(transcript, eq);
  const status = {};
  for (const s of muf.semesters) {
    for (const code of s.mandatory) { const c = last.get(code); status[code] = c ? (isPass(c.letter) ? 'passed' : 'failed') : 'none'; }
    for (const e of s.electiveSlots) status[e.slot] = 'none';
  }
  const assigned = assignSlots(muf, last);
  for (const slot of Object.keys(assigned)) status[slot] = 'passed';
  const regular = transcript.terms.filter((t) => t.term !== 'yaz');
  const lastT = regular[regular.length - 1];
  const reg = lastT ? nextTerm(lastT.year, lastT.term) : null;
  const semester = regular.length + 1;
  return { status, assigned, gpa: gpaOf([...last.values()], scale), semester, year: Math.min(4, Math.ceil(semester / 2)), term: reg ? reg.term : 'guz', regYear: reg ? reg.year : null, entry: transcript.terms[0] || null };
}

// Müfredat durumu: her müfredat satırı ve karşılığında alınan ders
export function curriculumStatus(muf, transcript, { scale = DEFAULT_SCALE, eq = {} } = {}) {
  const last = lastAttempts(transcript, eq);
  const assigned = assignSlots(muf, last);
  const byCode = new Map(muf.courses.map((c) => [c.code, c]));
  const rows = [];
  for (const s of muf.semesters) {
    const items = [];
    for (const code of s.mandatory) {
      const c = byCode.get(code) || { code, name: code, ects: 0, credit: 0 };
      const t = last.get(code);
      items.push({ kind: 'course', code, name: c.name, nameEn: c.nameEn, zs: 'Z', credit: c.credit || 0, ects: c.ects, taken: t ? { term: t.term, code: t.code, name: t.name, letter: t.letter, passed: isPass(t.letter), credit: t.credit, ects: t.ects } : null });
    }
    for (const e of s.electiveSlots) {
      const code = assigned[e.slot];
      const t = code ? last.get(code) : null;
      items.push({ kind: 'slot', code: e.slot, slotType: e.type, name: e.name, nameEn: e.nameEn, zs: 'S', credit: 0, ects: e.ects, taken: t ? { term: t.term, code: t.code, name: t.name, letter: t.letter, passed: isPass(t.letter), credit: t.credit, ects: t.ects } : null });
    }
    rows.push({ semester: s.semester, items, ects: items.reduce((a, x) => a + x.ects, 0), credit: items.reduce((a, x) => a + x.credit, 0), z: items.filter((x) => x.zs === 'Z').length, s: items.filter((x) => x.zs === 'S').length });
  }
  const all = rows.flatMap((r) => r.items.map((x) => ({ ...x, semester: r.semester })));
  const lastList = [...last.values()];
  return {
    rows,
    notTaken: all.filter((x) => !x.taken),
    failed: all.filter((x) => x.taken && !x.taken.passed),
    summary: {
      takenCredit: lastList.reduce((a, c) => a + (c.credit || 0), 0), takenEcts: lastList.reduce((a, c) => a + (c.ects || 0), 0),
      passedCredit: lastList.filter((c) => isPass(c.letter)).reduce((a, c) => a + (c.credit || 0), 0), passedEcts: lastList.filter((c) => isPass(c.letter)).reduce((a, c) => a + (c.ects || 0), 0),
      gpa: gpaOf(lastList, scale),
    },
  };
}

// Not yükseltme: eşik ve altındaki geçilmiş dersler hedef harfe çıkarsa AGNO ne kadar artar
export function retakeSuggestions(transcript, { scale = DEFAULT_SCALE, eq = {}, below = 'C-', target = 'B' } = {}) {
  const last = lastAttempts(transcript, eq);
  const list = [...last.values()];
  const base = gpaOf(list, scale);
  const lim = scale[below] ?? 1.7;
  const out = [];
  for (const c of list) {
    if (!(c.letter in scale) || !isPass(c.letter) || scale[c.letter] > lim) continue;
    const next = list.map((x) => (x === c ? { ...x, letter: target } : x));
    const agno = gpaOf(next, scale);
    out.push({ code: c.code, name: c.name, ects: c.ects, letter: c.letter, term: c.term, target, agno, gain: Math.round((agno - base) * 100) / 100 });
  }
  out.sort((a, b) => b.gain - a.gain || b.ects - a.ects);
  const allAgno = out.length ? gpaOf(list.map((x) => (out.some((o) => o.code === x.code) ? { ...x, letter: target } : x)), scale) : base;
  return { base, items: out, allAgno };
}

// Mezuniyet ilerleme durumu (yönetmelik kurallarına göre)
export function graduationProgress(muf, transcript, rules, { scale = DEFAULT_SCALE, eq = {}, semester = 1 } = {}) {
  const cs = curriculumStatus(muf, transcript, { scale, eq });
  const all = cs.rows.flatMap((r) => r.items);
  const mand = all.filter((x) => x.kind === 'course');
  const elec = all.filter((x) => x.kind === 'slot' && x.slotType !== 'STAJ');
  const staj = all.filter((x) => x.kind === 'slot' && x.slotType === 'STAJ');
  const pct = (a, b) => (b ? Math.min(100, Math.round((a / b) * 100)) : 100);
  const gpa = cs.summary.gpa;
  const passedEcts = cs.summary.passedEcts;
  const stajDone = staj.length ? staj.every((x) => x.taken && x.taken.passed) : true;
  const mandDone = mand.filter((x) => x.taken && x.taken.passed).length;
  const elecDone = elec.filter((x) => x.taken && x.taken.passed).length;
  return {
    gpa: { value: gpa, need: rules.minGpa, ok: gpa >= rules.minGpa, pct: pct(gpa, rules.minGpa) },
    mandatory: { done: mandDone, all: mand.length, pct: pct(mandDone, mand.length) },
    elective: { done: elecDone, all: elec.length, pct: pct(elecDone, elec.length) },
    ects: { done: passedEcts, need: rules.minEcts, pct: pct(passedEcts, rules.minEcts) },
    internship: { done: stajDone ? rules.internshipDays : 0, need: rules.internshipDays, pct: stajDone ? 100 : 0 },
    time: { semester, normal: rules.normalYears * 2, max: rules.maxYears * 2, pct: pct(semester, rules.maxYears * 2) },
    notTaken: cs.notTaken,
    failed: cs.failed,
    complete: gpa >= rules.minGpa && passedEcts >= rules.minEcts && mandDone === mand.length && elecDone === elec.length && stajDone,
  };
}

// Yapay zeka önerisi: kalan dersleri gelecek dönemlere yerleştir (açıldığı dönem, ön koşul, AKTS sınırı, önce alttan)
// offered(code, term) → true/false/null (null: bilinmiyor → müfredattaki yarıyılın dönemine bakılır)
export function planTerms(muf, student, { start, limit = 40, offered = () => null, current = [], improve = [], maxTerms = 8, lang = 'tr' } = {}) {
  const byCode = new Map(muf.courses.map((c) => [c.code, c]));
  const prereqs = muf.prerequisites || {};
  const st = student.status;
  const items = [];
  for (const s of muf.semesters) {
    const parity = s.semester % 2 ? 'guz' : 'bahar';
    for (const code of s.mandatory) {
      if (st[code] === 'passed') continue;
      items.push({ key: code, code, kind: st[code] === 'failed' ? 'retake' : 'course', name: byCode.get(code)?.name || code, ects: byCode.get(code)?.ects || 0, semester: s.semester, parity });
    }
    for (const e of s.electiveSlots) {
      if (st[e.slot] === 'passed') continue;
      items.push({ key: e.slot, code: e.slot, kind: 'slot', slotType: e.type, name: e.name, nameEn: e.nameEn, ects: e.ects, semester: s.semester, parity: null });
    }
  }
  const prio = (x) => (x.kind === 'retake' ? 0 : 1) * 100 + x.semester;
  items.sort((a, b) => prio(a) - prio(b));
  const placed = new Map(); // key -> term index
  const terms = [];
  let t = { ...start };
  const isOffered = (x, term) => {
    if (x.kind === 'slot') return true;
    const o = offered(x.code, term);
    return o == null ? x.parity === term : o;
  };
  const prereqOk = (x, ti) => (prereqs[x.code] || []).every((p) => st[p] === 'passed' || (placed.has(p) && placed.get(p) < ti));
  for (let ti = 0; ti < maxTerms && placed.size < items.length; ti++) {
    const term = { year: t.year, term: t.term, items: [], ects: 0 };
    // bu dönem kayıtlı dersler önce
    for (const x of items) if (!placed.has(x.key) && current.includes(x.key) && ti === 0) { placed.set(x.key, ti); term.items.push({ ...x, reasons: ['registered'] }); term.ects += x.ects; }
    for (const x of items) {
      if (placed.has(x.key) || !isOffered(x, t.term) || !prereqOk(x, ti) || term.ects + x.ects > limit) continue;
      const reasons = [];
      if (x.kind === 'retake') reasons.push('retake');
      if (x.kind !== 'slot' && offered(x.code, t.term === 'guz' ? 'bahar' : 'guz') === false) reasons.push(t.term === 'guz' ? 'onlyFall' : 'onlySpring');
      else if (x.kind !== 'slot' && offered(x.code, t.term) == null) reasons.push(x.parity === 'guz' ? 'onlyFall' : 'onlySpring');
      const unlocks = Object.entries(prereqs).filter(([, ps]) => ps.includes(x.code)).map(([c]) => c);
      if (unlocks.length) reasons.push('unlocks:' + unlocks.join(', '));
      if ((prereqs[x.code] || []).length) reasons.push('after:' + prereqs[x.code].join(', '));
      if (x.semester < (student.semester || 0) && x.kind !== 'retake') reasons.push('lower');
      placed.set(x.key, ti);
      term.items.push({ ...x, reasons });
      term.ects += x.ects;
    }
    // boş kapasiteye isteğe bağlı not yükseltme
    for (const r of improve) {
      const c = byCode.get(r.code);
      const ects = r.ects || c?.ects || 0;
      if (terms.some((tt) => tt.items.some((i) => i.key === 'imp:' + r.code)) || term.items.some((i) => i.key === 'imp:' + r.code)) continue;
      const sem = muf.semesters.find((s) => s.mandatory.includes(r.code));
      const parity = sem ? (sem.semester % 2 ? 'guz' : 'bahar') : null;
      const o = offered(r.code, t.term);
      if ((o == null ? parity && parity !== t.term : !o) || term.ects + ects > limit || term.items.length === 0) continue;
      term.items.push({ key: 'imp:' + r.code, code: r.code, kind: 'improve', name: r.name, ects, gain: r.gain, from: r.letter, reasons: ['improve'] });
      term.ects += ects;
    }
    terms.push(term);
    t = nextTerm(t.year, t.term);
  }
  const left = items.filter((x) => !placed.has(x.key));
  const lastReal = [...terms].reverse().find((x) => x.items.some((i) => i.kind !== 'improve'));
  return { terms: terms.filter((x) => x.items.length), graduation: left.length ? null : lastReal ? { year: lastReal.year, term: lastReal.term } : null, left };
}
