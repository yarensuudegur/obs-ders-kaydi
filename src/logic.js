// Ders kaydı çekirdek mantığı: arayüzden bağımsız, saf fonksiyonlar.
// Tarayıcıda index.html'e gömülür, testlerde Node ile import edilir.

export const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
export const DAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
export const BASE_HOURS = ['08:40', '09:40', '10:40', '11:40', '12:40', '13:40', '14:40', '15:40', '16:40'];

export function semesterFor(year, term) {
  return (year - 1) * 2 + (term === 'guz' ? 1 : 2);
}

export function sectionId(code, section) {
  return `${code}#${section}`;
}

// Modeli kur: dönemin şubeleri + öğrencinin gereksinimleri
export function buildModel(mufredat, program, profile) {
  const { year, term } = profile;
  const semester = semesterFor(year, term);
  const courses = new Map(mufredat.courses.map((c) => [c.code, c]));
  const unvCourses = new Map(mufredat.universityElectives.courses.map((c) => [c.code, { ...c, ects: null }]));

  // Bütün programlardaki şubeler (3-4. sınıf, güz-bahar). Kayıt döneminin şubeleri "KOD#şube",
  // diğer dönemin şubeleri "KOD#şube@dönem" kimliğini alır.
  const sections = new Map();
  for (const tm of Object.keys(program.terms)) {
    const termData = program.terms[tm] || {};
    for (const y of Object.keys(termData)) {
      for (const s of termData[y]) {
        const id = sectionId(s.code, s.section) + (tm === term ? '' : '@' + tm);
        if (!sections.has(id)) {
          sections.set(id, { id, code: s.code, section: s.section, term: tm, slots: s.slots.map((x) => ({ ...x })), years: new Set([y]), layers: new Set([y + '|' + tm]) });
        } else {
          sections.get(id).years.add(y);
          sections.get(id).layers.add(y + '|' + tm);
        }
      }
    }
  }
  const sectionsByCode = new Map();
  for (const s of sections.values()) {
    if (!sectionsByCode.has(s.code)) sectionsByCode.set(s.code, []);
    sectionsByCode.get(s.code).push(s);
  }
  for (const list of sectionsByCode.values()) list.sort((a, b) => (a.term === term ? 0 : 1) - (b.term === term ? 0 : 1) || a.section - b.section);
  const termSections = (code) => (sectionsByCode.get(code) || []).filter((s) => s.term === term);

  // Öğrencinin ders durumları: 'passed' (geçti), 'failed' (kaldı), 'none' (almadı).
  // Belirtilmeyenler: kayıt yarıyılından önceki yarıyıllar geçilmiş, sonrakiler alınmamış sayılır.
  const status = { ...(profile.status || {}) };
  for (const c of profile.mustRetake || []) status[c] = 'failed';
  const statusOf = (key, semNo) => status[key] || (semNo < semester ? 'passed' : 'none');
  const passed = new Set();
  for (const sm of mufredat.semesters) {
    for (const c of sm.mandatory) if (statusOf(c, sm.semester) === 'passed') passed.add(c);
  }

  // Gereksinimler: kayıt yarıyılı (zorunlu) + geçilmemiş alt yarıyıl dersleri (zorunlu, "alttan")
  // + işaretlenen üst yarıyıllar (isteğe bağlı, "üstten"). Geçilen dersler listeye girmez.
  const upperSems = [...new Set(profile.extraSemesters || [])].filter((x) => x > semester).sort((a, b) => a - b);
  const lowerSems = mufredat.semesters.map((x) => x.semester).filter((x) => x < semester).sort((a, b) => a - b);
  const extraSemesters = [];
  const requirements = [];
  const roles = new Map(); // code -> {kind, slots:[]}
  const electiveSlots = [];
  for (const semNo of [semester, ...lowerSems, ...upperSems]) {
    const sem = mufredat.semesters.find((x) => x.semester === semNo);
    if (!sem) continue;
    const upper = semNo > semester; // isteğe bağlı (üstten)
    const dir = semNo > semester ? 'upper' : semNo < semester ? 'lower' : null;
    const before = requirements.length;
    for (const code of sem.mandatory) {
      const st = statusOf(code, semNo);
      if (roles.has(code) || st === 'passed') continue;
      const kind = dir === 'lower' ? 'retake' : 'mandatory';
      requirements.push({ id: code, kind, code, ects: courses.get(code)?.ects ?? 0, semester: semNo, upper, dir, status: st });
      roles.set(code, { kind, slots: [], upper });
    }
    for (const slot of sem.electiveSlots) {
      if (electiveSlots.some((x) => x.slot === slot.slot) || statusOf(slot.slot, semNo) === 'passed') continue;
      const options = slot.options === 'universityElectives' ? [...unvCourses.keys()] : slot.options;
      const req = { id: slot.slot, kind: 'slot', slotType: slot.type, slot: slot.slot, name: slot.name || slot.slot, nameEn: slot.nameEn || slot.name || slot.slot, ects: slot.ects, options, semester: semNo, upper, dir, status: statusOf(slot.slot, semNo) };
      requirements.push(req);
      electiveSlots.push(req);
      if (slot.type === 'A' || slot.type === 'B') {
        for (const code of options) {
          if (roles.has(code) && roles.get(code).kind !== 'elective') continue;
          if (passed.has(code)) continue;
          if (!roles.has(code)) roles.set(code, { kind: 'elective', slots: [] });
          roles.get(code).slots.push(slot.slot);
        }
      }
    }
    if (semNo !== semester && requirements.length > before) extraSemesters.push(semNo);
  }

  const prereqs = mufredat.prerequisites || {};
  const blockedBy = (code) => (prereqs[code] || []).filter((c) => !passed.has(c));

  // Önce kayıt yarıyılının hakları, sonra üst yarıyıl; her birinde A önce, sonra B
  const typeRank = { A: 0, B: 1 };
  for (const r of roles.values()) {
    r.slots.sort((a, b) => {
      const sa = electiveSlots.find((s) => s.slot === a);
      const sb = electiveSlots.find((s) => s.slot === b);
      const tier = (x) => (x.dir === 'upper' ? 2 : x.dir === 'lower' ? 1 : 0);
      return tier(sa) - tier(sb) || typeRank[sa.slotType] - typeRank[sb.slotType] || electiveSlots.indexOf(sa) - electiveSlots.indexOf(sb);
    });
  }

  // Sabit zorunlular: tek şubeli zorunlu/alttan
  const fixedIds = new Set();
  for (const req of requirements) {
    if ((req.kind !== 'mandatory' && req.kind !== 'retake') || req.upper || blockedBy(req.code).length) continue;
    const secs = termSections(req.code);
    if (secs.length === 1) fixedIds.add(secs[0].id);
  }

  const hasUnvSlot = electiveSlots.some((s) => s.slotType === 'UNV');
  return { profile, year, term, semester, extraSemesters, status, statusOf, courses, unvCourses, sections, sectionsByCode, termSections, requirements, electiveSlots, roles, fixedIds, hasUnvSlot, passed, blockedBy };
}

export function emptyState() {
  return { picks: [], listChoices: {} }; // picks: [{id, slot|null}], listChoices: {slotName: code}
}

export function overlaps(a, b) {
  const hits = [];
  for (const x of a.slots) for (const y of b.slots) if (x.day === y.day && x.start === y.start) hits.push(x);
  return hits;
}

export function slotLabel(model, slot) {
  return model.electiveSlots.find((s) => s.slot === slot)?.name || slot;
}

export function courseName(model, code) {
  return model.courses.get(code)?.name || model.unvCourses.get(code)?.name || code;
}

function when(slot) {
  return `${DAYS[slot.day]} ${slot.start}`;
}

// Bir dersin seçilmiş şubesi (sabit dahil)
function selectedSectionOf(model, state, code) {
  for (const id of model.fixedIds) if (model.sections.get(id).code === code) return model.sections.get(id);
  const p = state.picks.find((x) => model.sections.get(x.id)?.code === code);
  return p ? model.sections.get(p.id) : null;
}

export function slotFill(model, state) {
  const fill = {};
  for (const s of model.electiveSlots) fill[s.slot] = null;
  for (const p of state.picks) if (p.slot) fill[p.slot] = model.sections.get(p.id).code;
  for (const [slot, code] of Object.entries(state.listChoices)) if (slot in fill && code) fill[slot] = code;
  return fill;
}

function openSlotFor(model, state, code) {
  const role = model.roles.get(code);
  if (!role || role.kind !== 'elective') return null;
  const fill = slotFill(model, state);
  return role.slots.find((s) => !fill[s]) || null;
}

// Her şubenin durumunu hesapla
export function evaluate(model, state) {
  const fixed = [...model.fixedIds].map((id) => model.sections.get(id));
  const picked = state.picks.map((p) => model.sections.get(p.id));
  const fill = slotFill(model, state);
  const status = new Map();

  for (const s of model.sections.values()) {
    const role = model.roles.get(s.code);
    if (model.fixedIds.has(s.id)) {
      status.set(s.id, { state: 'fixed', reason: `${s.code} zorunlu ve tek şubeli, otomatik seçildi.` });
      continue;
    }
    const pick = state.picks.find((p) => p.id === s.id);
    if (pick) {
      status.set(s.id, { state: 'selected', slot: pick.slot, reason: pick.slot ? `${slotLabel(model, pick.slot)} olarak seçildi. Kaldırmak için tıkla.` : 'Seçildi. Kaldırmak için tıkla.' });
      continue;
    }
    if (!role && model.passed.has(s.code)) {
      status.set(s.id, { state: 'passed', reason: `${s.code} dersini geçtin.` });
      continue;
    }
    const pre = model.blockedBy(s.code);
    if (pre.length) {
      status.set(s.id, { state: 'prereq', missing: pre, reason: `Ön koşul: önce ${pre.join(', ')} dersini geçmelisin.` });
      continue;
    }
    const fixedHit = firstConflict(s, fixed);
    if (fixedHit) {
      status.set(s.id, { state: 'locked-fixed', other: fixedHit.other.code, at: fixedHit.slot, reason: `${fixedHit.other.code} (Zorunlu) ile ${when(fixedHit.slot)}'da çakışıyor.` });
      continue;
    }
    const sib = selectedSectionOf(model, state, s.code);
    if (sib) {
      status.set(s.id, { state: 'sibling', section: sib.section, reason: `Bu dersin ${sib.section}. şubesini seçtin.` });
      continue;
    }
    if (role && role.kind === 'elective' && !openSlotFor(model, state, s.code)) {
      const names = role.slots.map((x) => `${slotLabel(model, x)} için ${fill[x]}`).join(', ');
      status.set(s.id, { state: 'slot-full', full: role.slots.map((x) => ({ slot: x, code: fill[x] })), reason: `Bu seçmeli hakkın dolu: ${names} seçildi.` });
      continue;
    }
    const pickHit = firstConflict(s, picked);
    if (pickHit) {
      status.set(s.id, { state: 'locked-choice', other: pickHit.other.code, at: pickHit.slot, reason: `Seçtiğin ${pickHit.other.code} ile ${when(pickHit.slot)}'da çakışıyor.` });
      continue;
    }
    status.set(s.id, { state: 'free', extra: !role, next: role && role.kind === 'elective' ? openSlotFor(model, state, s.code) : null, reason: !role ? `${s.code} müfredatında bu dönem yok; ek ders (üstten) olarak alabilirsin.` : role.kind === 'elective' ? `Seçersen ${slotLabel(model, openSlotFor(model, state, s.code))} olarak sayılır.` : 'Seçmek için tıkla.' });
  }

  return { status, fill, ects: totalEcts(model, state), warnings: warnings(model, state) };
}

function firstConflict(s, others) {
  for (const o of others) {
    if (!o || o.id === s.id || o.code === s.code) continue;
    const hits = overlaps(s, o);
    if (hits.length) return { other: o, slot: hits[0] };
  }
  return null;
}

export function totalEcts(model, state) {
  let sum = 0;
  const fill = slotFill(model, state);
  for (const req of model.requirements) {
    if (req.kind === 'slot') {
      if (fill[req.slot]) sum += req.ects;
    } else if (selectedSectionOf(model, state, req.code)) {
      sum += req.ects;
    }
  }
  for (const code of extraCodes(model, state)) sum += model.courses.get(code)?.ects ?? 0;
  return sum;
}

// Müfredat dışı (ek / üstten) seçilen dersler
export function extraCodes(model, state) {
  const out = [];
  for (const p of state.picks) {
    const code = model.sections.get(p.id)?.code;
    if (code && !model.roles.has(code) && !out.includes(code)) out.push(code);
  }
  return out;
}

export function warnings(model, state) {
  const out = [];
  const fixed = [...model.fixedIds].map((id) => model.sections.get(id));
  for (let i = 0; i < fixed.length; i++) {
    for (let j = i + 1; j < fixed.length; j++) {
      const hits = overlaps(fixed[i], fixed[j]);
      if (hits.length) out.push({ level: 'error', kind: 'clash', a: fixed[i].code, b: fixed[j].code, at: hits[0], text: `${fixed[i].code} ile ${fixed[j].code} (ikisi de zorunlu, tek şubeli) ${when(hits[0])}'da çakışıyor. Danışmanınla görüş.` });
    }
  }
  for (const req of model.requirements) {
    if ((req.kind === 'mandatory' || req.kind === 'retake') && !req.upper && !model.termSections(req.code).length && !selectedSectionOf(model, state, req.code)) {
      out.push({ level: 'warn', kind: 'missing', code: req.code, text: `${req.code} ${courseName(model, req.code)} bu dönem programda açılmamış.` });
    }
  }
  return out;
}

// Seçim işlemleri: yeni state döndürür (girdiyi değiştirmez)
export function toggleSection(model, state, id) {
  const s = model.sections.get(id);
  if (!s) return { state, ok: false, reason: 'Şube bulunamadı.' };
  if (state.picks.some((p) => p.id === id)) {
    return { state: { ...state, picks: state.picks.filter((p) => p.id !== id) }, ok: true, action: 'removed' };
  }
  const st = evaluate(model, state).status.get(id);
  if (!st || st.state !== 'free') return { state, ok: false, reason: st ? st.reason : '' };
  const slot = openSlotFor(model, state, s.code);
  return { state: { ...state, picks: [...state.picks, { id, slot }] }, ok: true, action: 'added', slot };
}

// Üniversite seçmelisi / staj: listeden (veya tablodan) seçim. Çakışma kontrolü yok.
export function setListChoice(model, state, slot, code) {
  const req = model.electiveSlots.find((s) => s.slot === slot);
  if (!req || (req.slotType !== 'UNV' && req.slotType !== 'STAJ')) return { state, ok: false };
  const listChoices = { ...state.listChoices };
  if (!code || listChoices[slot] === code) delete listChoices[slot];
  else listChoices[slot] = code;
  return { state: { ...state, listChoices }, ok: true };
}

export function unvSlotName(model) {
  return model.electiveSlots.find((s) => s.slotType === 'UNV')?.slot || null;
}

// Tablo satırları: 9 temel saat + görünen derslerde varsa akşam saatleri
export function gridHours(items) {
  let maxH = 16;
  for (const it of items) for (const sl of it.slots) maxH = Math.max(maxH, parseInt(sl.start.slice(0, 2), 10));
  const hours = [...BASE_HOURS];
  for (let h = 17; h <= maxH; h++) hours.push(`${h}:40`);
  return hours;
}

// ---------- Program önerileri (kısıt tabanlı arama) ----------

// Seçilen seçmelileri boşluklara dağıt: sadece B'de olanlar önce B'ye, geri kalanlar önce A'ya.
export function assignElectives(model, codes) {
  const free = model.electiveSlots.filter((s) => s.slotType === 'A' || s.slotType === 'B').map((s) => s.slot);
  const out = {};
  const order = [...codes].sort((a, b) => {
    const ra = model.roles.get(a)?.slots || [];
    const rb = model.roles.get(b)?.slots || [];
    return ra.length - rb.length;
  });
  for (const code of order) {
    const slots = (model.roles.get(code)?.slots || []).filter((s) => free.includes(s));
    const pick = slots[0]; // role.slots zaten öncelik sırasında (kendi yarıyılı, A, B)
    if (!pick) return null;
    out[code] = pick;
    free.splice(free.indexOf(pick), 1);
  }
  return out;
}

function programMetrics(sections) {
  const byDay = new Map();
  let weekend = 0, early = 0, late = 0;
  for (const s of sections) {
    for (const sl of s.slots) {
      const h = parseInt(sl.start, 10);
      if (!byDay.has(sl.day)) byDay.set(sl.day, new Set());
      byDay.get(sl.day).add(h);
      if (sl.day >= 5) weekend++;
      if (h === 8) early++;
      if (h >= 17) late++;
    }
  }
  let gaps = 0;
  for (const hs of byDay.values()) {
    const arr = [...hs].sort((a, b) => a - b);
    gaps += arr[arr.length - 1] - arr[0] + 1 - arr.length;
  }
  const days = byDay.size;
  return { days, gaps, weekend, early, late, score: days * 10 + gaps * 3 + weekend * 4 + early + late * 2 };
}

// wanted: istenen ders kodları (zorunlu, alttan ve bölüm seçmelileri). Saatsiz/online seçimler burada yok.
export function suggestPrograms(model, wanted, limit = 500) {
  const codes = [...new Set(wanted)].filter((c) => !model.blockedBy(c).length);
  const electives = codes.filter((c) => model.roles.get(c)?.kind === 'elective');
  const slotOf = assignElectives(model, electives);
  if (!slotOf) return { programs: [], total: 0, reason: 'too-many-electives' };
  const missing = codes.filter((c) => !(model.sectionsByCode.get(c) || []).length);
  const domains = codes
    .filter((c) => !missing.includes(c))
    .map((c) => {
      // Kayıt döneminde açılıyorsa o dönemin şubeleri, açılmıyorsa diğer dönemin şubeleri
      const secs = model.termSections(c).length ? model.termSections(c) : model.sectionsByCode.get(c);
      const fixed = secs.find((s) => model.fixedIds.has(s.id));
      return { code: c, secs: fixed ? [fixed] : secs };
    })
    .sort((a, b) => a.secs.length - b.secs.length);

  const results = [];
  let total = 0;
  const used = new Map(); // gün|saat -> kod
  const chosen = [];
  const fits = (s) => s.slots.every((sl) => !used.has(sl.day + '|' + sl.start));
  const put = (s, on) => s.slots.forEach((sl) => (on ? used.set(sl.day + '|' + sl.start, s.code) : used.delete(sl.day + '|' + sl.start)));
  (function walk(i) {
    if (i === domains.length) {
      total++;
      if (results.length < limit) results.push([...chosen]);
      return;
    }
    for (const s of domains[i].secs) {
      if (!fits(s)) continue;
      put(s, true); chosen.push(s);
      walk(i + 1);
      chosen.pop(); put(s, false);
    }
  })(0);

  const programs = results
    .map((secs) => ({
      sections: secs.map((s) => s.id),
      picks: secs.filter((s) => !model.fixedIds.has(s.id)).map((s) => ({ id: s.id, slot: slotOf[s.code] || null })),
      ...programMetrics(secs),
    }))
    .sort((a, b) => a.score - b.score || a.sections.join().localeCompare(b.sections.join()));

  let blockers = [];
  if (!programs.length && domains.length > 1) {
    // Hangi dersi çıkarınca çakışmasız program çıkıyor?
    for (const d of domains) {
      const rest = codes.filter((c) => c !== d.code);
      if (suggestPrograms(model, rest, 1).total > 0) blockers.push(d.code);
    }
  }
  return { programs, total, missing, slotOf, blockers, reason: programs.length ? null : 'no-fit' };
}

// Model yeniden kurulunca (ör. üst yarıyıl açılıp kapanınca) seçimleri sırayla yeniden uygula; artık geçersiz olanlar düşer.
export function replayState(model, state) {
  let next = emptyState();
  for (const p of state.picks) {
    if (!model.sections.has(p.id)) continue;
    const r = toggleSection(model, next, p.id);
    if (r.ok) next = r.state;
  }
  for (const [slot, code] of Object.entries(state.listChoices)) {
    if (model.electiveSlots.some((s) => s.slot === slot)) next = setListChoice(model, next, slot, code).state;
  }
  return next;
}
