// Genel İşlemler sayfaları: Akademik Takvim, Alınan Dersler, Açılan Bölüm Dersleri, Sınav Takvimi, Bölüm Ders Programı, Mezuniyet İlerleme Durumu
(function () {
  const { app, t, esc, $ } = OBS;
  const D = () => OBS.data();
  const MUF = () => OBS.getData().MUF;
  const PROG = () => OBS.getData().PROG;
  const course = (code) => { const m = MUF(); return m ? m.courses.find((c) => c.code === code) : null; };
  const head = (titleKey, lead, actions = '') => `<div class="page-head"><div><h1>${esc(t(titleKey))}</h1>${lead ? `<p class="lead">${esc(lead)}</p>` : ''}</div>${actions ? `<div class="head-btns">${actions}</div>` : ''}</div>`;
  const empty = (title, text, btn) => `<section class="card"><div class="tt-empty"><b>${esc(title)}</b><p>${esc(text)}</p>${btn || ''}</div></section>`;
  OBS.pageHead = head;
  OBS.pageEmpty = empty;

  // Saatleri gün gün birleştir: "Sal 12:40–15:30 · Cum 08:40–10:30 (Lab)"
  function fmtSlots(slots) {
    const out = [];
    const sorted = [...slots].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
    for (const s of sorted) {
      const last = out[out.length - 1];
      if (last && last.day === s.day && last.type === s.type && parseInt(s.start, 10) === parseInt(last.end, 10)) last.end = s.end;
      else out.push({ day: s.day, start: s.start, end: s.end, type: s.type, room: s.room });
    }
    return out.map((x) => `${OBS.daysShort()[x.day]} ${x.start}–${x.end}${x.type === 'U' ? ' (' + t('grid.lab') + ')' : ''}`).join(' · ');
  }
  OBS.fmtSlots = fmtSlots;
  const icon = (n) => `<svg><use href="#i-${n}"/></svg>`;

  // ---------- Akademik Takvim ----------
  const KIND_CLASS = { registration: 'reg', adddrop: 'ad', midterm: 'exam', final: 'exam', makeup: 'exam', holiday: 'hol', start: 'start', end: 'start', fee: 'fee', grades: 'start', withdraw: 'ad', other: 'other' };
  OBS.views.calendar = {
    title: 'side.calendar',
    needs: ['calendar'],
    render() {
      const ev = D().calendar.data.events;
      const today = OBS.today();
      const toIcs = (e) => ({ title: e.title, date: e.start, end: e.end, details: t('cal.icsNote') });
      const months = new Map();
      for (const e of ev) {
        const d = OBS.parseIso(e.start);
        const k = e.start.slice(0, 7);
        if (!months.has(k)) months.set(k, { label: d.toLocaleDateString(app.lang === 'tr' ? 'tr-TR' : 'en-GB', { month: 'long', year: 'numeric' }), list: [] });
        months.get(k).list.push(e);
      }
      const rowOf = (e, i) => {
        const end = e.end || e.start;
        const st = today > end ? 'past' : today >= e.start ? 'now' : 'next';
        const d = OBS.parseIso(e.start);
        const left = OBS.daysBetween(today, e.start);
        const when = st === 'now' ? t('cal.now') : st === 'past' ? t('cal.past') : left === 1 ? t('cal.tomorrow') : t('cal.inDays', { n: left });
        const jump = (e.kind === 'registration' || e.kind === 'adddrop') && st !== 'now' ? `<button class="btn small soft" type="button" data-setdate="${e.start}">${esc(t('cal.jump'))}</button>` : '';
        const go = e.kind === 'registration' && st === 'now' ? `<button class="btn small primary" type="button" data-goto="reg">${esc(t('side.reg'))}</button>` : e.kind === 'adddrop' && st === 'now' ? `<button class="btn small primary" type="button" data-goto="adddrop">${esc(t('side.adddrop'))}</button>` : '';
        return `<div class="ev-row ${st} k-${KIND_CLASS[e.kind]}">
          <div class="ev-date"><b>${d.getDate()}</b><span>${esc(d.toLocaleDateString(app.lang === 'tr' ? 'tr-TR' : 'en-GB', { weekday: 'short' }))}</span></div>
          <div class="ev-main"><b>${esc(e.title)}</b><span>${esc(OBS.fmtRange(e.start, e.end))}</span></div>
          <span class="kpill k-${KIND_CLASS[e.kind]}">${esc(t('cal.k.' + e.kind))}</span>
          <span class="ev-when">${esc(when)}</span>
          <div class="ev-act">${go}${jump}<a class="icon-btn small" href="${esc(OBS.gcalLink(toIcs(e)))}" target="_blank" rel="noopener" title="${esc(t('g.add'))}">${icon('gcal')}</a></div>
        </div>`;
      };
      const cur = ev.filter((e) => today >= e.start && today <= (e.end || e.start));
      const next = ev.find((e) => e.start > today);
      return head('side.calendar', D().calendar.data.academicYear ? t('cal.lead', { y: D().calendar.data.academicYear }) : '', `<button class="btn soft" type="button" data-calics>${icon('download')}${esc(t('cal.ics'))}</button>`) +
        `<section class="status-row cal-status">
          <div class="stat"><span class="k">${esc(t('cal.today'))}</span><span class="v">${esc(OBS.fmtDate(today))}</span></div>
          <div class="stat wide"><span class="k">${esc(t('cal.nowT'))}</span><span class="v">${cur.length ? cur.map((e) => esc(e.title)).join(', ') : esc(t('cal.nothing'))}</span></div>
          <div class="stat wide"><span class="k">${esc(t('cal.nextT'))}</span><span class="v">${next ? `${esc(next.title)} <small>(${esc(OBS.fmtShort(next.start))})</small>` : '-'}</span></div>
        </section>` +
        [...months.values()].map((m) => `<section class="card cal-month"><h2>${esc(m.label)}</h2>${m.list.map(rowOf).join('')}</section>`).join('');
    },
  };

  // ---------- Alınan Dersler ----------
  const typeOf = (it) => (it.kind === 'slot' ? it.slot[app.lang] : t(it.kind === 'retake' ? 'type.retake' : it.kind === 'extra' ? 'type.extra' : it.kind === 'upper' ? 'type.upper' : 'type.mandatory'));
  OBS.itemType = typeOf;
  OBS.views.courses = {
    title: 'side.taken',
    render() {
      const a = app.approved;
      if (!a) return head('side.taken') + empty(t('tt.emptyT'), t('taken.empty'), `<button class="btn primary" type="button" data-goto="reg">${esc(t('tt.goReg'))}</button>`);
      const credit = a.items.reduce((s, it) => s + ((course(it.code) || {}).credit || 0), 0);
      const tile = (ic, n, k, c) => `<div class="tile" style="--acc:${c}">${icon(ic)}<div><b>${n}</b><span>${esc(k)}</span></div></div>`;
      return head('side.taken', t('term.' + a.term), `<button class="btn soft" type="button" data-goto="tt">${icon('grid')}${esc(t('side.timetable'))}</button>`) +
        `<div class="tiles">${tile('book', a.items.length, t('taken.n'), '#3f7be0')}${tile('chart', credit, t('taken.credit'), '#14a383')}${tile('spark', a.ects, t('taken.ects'), '#e0a21b')}${tile('check', 0, t('taken.done'), '#e0533d')}</div>
        <div class="course-cards">${a.items.map((it) => {
          const c = course(it.code) || {};
          const tu = c.tul ? c.tul.split('+').slice(0, 2).join('+') : '-';
          return `<article class="ccard" style="--c:${it.color}"><div class="cc-main"><b>${esc(it.code)}</b><span class="nm">${esc(OBS.name(it.code))}</span>
            <div class="cc-meta"><span>${esc(t('taken.sec'))} <b>${it.section || '-'}</b></span><span>${esc(t('taken.cr'))} <b>${c.credit ?? '-'}</b></span><span>${esc(t('sel.ects'))} <b>${it.ects}</b></span><span>T+U: <b>${esc(tu)}</b></span></div></div>
            <div class="cc-side"><span class="pill">${esc(typeOf(it))}</span><span class="muted small">${esc(it.slots.length ? fmtSlots(it.slots) : it.online ? t('grid.online') : t('tt.noHours'))}</span><span class="muted small">${esc([...new Set(it.slots.map((x) => x.room).filter(Boolean))].join(', '))}</span></div></article>`;
        }).join('')}</div>`;
    },
  };

  // ---------- Açılan Bölüm Dersleri ----------
  const ui = { offTerm: null, offYear: 'all', offQ: '', ttKey: null, examAll: false };
  OBS.views.offered = {
    title: 'side.offered',
    needs: ['timetable'],
    render() {
      const prog = PROG();
      const terms = Object.keys(prog.terms);
      const term = ui.offTerm && terms.includes(ui.offTerm) ? ui.offTerm : terms.includes(app.term) ? app.term : terms[0];
      const years = Object.keys(prog.terms[term]).sort();
      const byCode = new Map();
      for (const y of years) {
        if (ui.offYear !== 'all' && ui.offYear !== y) continue;
        for (const s of prog.terms[term][y]) {
          if (!byCode.has(s.code)) byCode.set(s.code, { code: s.code, years: new Set(), secs: new Map() });
          const g = byCode.get(s.code);
          g.years.add(y);
          if (!g.secs.has(s.section)) g.secs.set(s.section, s);
        }
      }
      const m = MUF();
      const roleOf = (code) => {
        if (!m) return '';
        const sem = m.semesters.find((s) => s.mandatory.includes(code));
        if (sem) return t('off.mand', { n: sem.semester });
        const slot = m.semesters.flatMap((s) => s.electiveSlots).find((e) => Array.isArray(e.options) && e.options.includes(code));
        if (slot) return t('off.elec', { t: slot.type });
        return t('off.out');
      };
      const q = ui.offQ.toLocaleLowerCase('tr');
      const list = [...byCode.values()].filter((g) => !q || g.code.toLocaleLowerCase('tr').includes(q) || OBS.name(g.code).toLocaleLowerCase('tr').includes(q)).sort((a, b) => a.code.localeCompare(b.code));
      const ay = (D().timetable || []).find((x) => x.data.term === term);
      return head('side.offered', t('off.lead', { term: `${ay && ay.data.academicYear ? ay.data.academicYear : app.ay} ${t('tshort.' + term)}`, n: list.length })) +
        `<section class="card filters">
          <div class="f-group"><span class="f-label">${esc(t('off.term'))}</span><div class="seg">${terms.map((x) => `<button type="button" data-offterm="${x}" class="${x === term ? 'on' : ''}">${esc(t('tshort.' + x))}</button>`).join('')}</div></div>
          <div class="f-group"><span class="f-label">${esc(t('off.year'))}</span><div class="seg"><button type="button" data-offyear="all" class="${ui.offYear === 'all' ? 'on' : ''}">${esc(t('off.all'))}</button>${years.map((y) => `<button type="button" data-offyear="${y}" class="${ui.offYear === y ? 'on' : ''}">${esc(t('f.year', { y }))}</button>`).join('')}</div></div>
          <div class="f-group grow"><label class="f-label" for="offQ">${esc(t('off.search'))}</label><input id="offQ" type="search" value="${esc(ui.offQ)}" placeholder="${esc(t('off.searchPh'))}"></div>
        </section>
        <section class="card flush"><div class="table-wrap"><table class="sel-table off-table"><thead><tr><th>${esc(t('sel.code'))}</th><th>${esc(t('sel.name'))}</th><th>${esc(t('off.type'))}</th><th class="num">${esc(t('sel.ects'))}</th><th>${esc(t('off.secs'))}</th></tr></thead><tbody>
        ${list.map((g) => `<tr><td><span class="sw" style="--c:${OBS.hashColor(g.code)}"></span><b>${esc(g.code)}</b><div class="muted small">${[...g.years].map((y) => esc(t('f.year', { y }))).join(', ')}</div></td><td>${esc(OBS.name(g.code))}</td><td class="small">${esc(roleOf(g.code))}</td><td class="num">${(course(g.code) || {}).ects ?? '-'}</td>
          <td><div class="secs">${[...g.secs.values()].sort((a, b) => a.section - b.section).map((s) => `<div class="sec-line"><b>${esc(t('grid.section', { n: s.section }))}</b><span>${esc(fmtSlots(s.slots))}</span><span class="muted">${esc([...new Set(s.slots.map((x) => x.room).filter(Boolean))].join(', '))}</span></div>`).join('')}</div></td></tr>`).join('') || `<tr><td colspan="5" class="empty">${esc(t('off.none'))}</td></tr>`}
        </tbody></table></div></section>`;
    },
  };

  // ---------- Sınav Takvimi ----------
  function myExams() {
    const all = D().exams.data.exams;
    const a = app.approved;
    if (!a || ui.examAll) return { list: all, mine: false };
    const codes = new Set(a.items.map((x) => x.code));
    const secOf = new Map(a.items.map((x) => [x.code, x.section]));
    return { list: all.filter((e) => codes.has(e.code) && (!e.section || !secOf.get(e.code) || e.section === secOf.get(e.code))), mine: true };
  }
  const examEv = (e) => ({ title: `${e.code} ${e.kind}`, date: e.date, start: e.start, finish: e.end, location: e.room, details: `${e.code} ${OBS.name(e.code)} · ${e.kind}${e.room ? ' · ' + e.room : ''}` });
  OBS.views.exams = {
    title: 'side.exams',
    needs: ['exams'],
    render() {
      const { list, mine } = myExams();
      const today = OBS.today();
      const toMin = (hm) => parseInt(hm, 10) * 60 + parseInt(hm.slice(3), 10);
      const clash = new Set(), sameDay = new Set();
      list.forEach((a, i) => list.forEach((b, j) => {
        if (i >= j || a.date !== b.date) return;
        sameDay.add(i); sameDay.add(j);
        if (toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end)) { clash.add(i); clash.add(j); }
      }));
      const upcoming = list.filter((e) => e.date >= today);
      const loc = app.lang === 'tr' ? 'tr-TR' : 'en-GB';
      const rows = list.map((e, i) => {
        const d = OBS.parseIso(e.date);
        const left = OBS.daysBetween(today, e.date);
        const past = e.date < today;
        return `<div class="ex-row ${past ? 'past' : ''} ${clash.has(i) ? 'clash' : ''}" style="--c:${OBS.hashColor(e.code)}">
          <div class="ex-date"><b>${d.getDate()}</b><span>${esc(d.toLocaleDateString(loc, { month: 'short' }))}</span><small>${esc(d.toLocaleDateString(loc, { weekday: 'short' }))}</small></div>
          <div class="ex-main"><div><b>${esc(e.code)}</b> <span class="kpill k-exam">${esc(e.kind)}</span>${clash.has(i) ? `<span class="kpill k-clash">${esc(t('ex.clash'))}</span>` : sameDay.has(i) ? `<span class="kpill k-same">${esc(t('ex.sameDay'))}</span>` : ''}</div>
            <span class="nm">${esc(OBS.name(e.code))}</span>
            <span class="meta">${icon('clock')}${esc(e.start)}–${esc(e.end)}${e.room ? ` · ${esc(e.room)}` : ''}</span></div>
          <div class="ex-left">${past ? esc(t('cal.past')) : left === 0 ? esc(t('ex.today')) : esc(t('cal.inDays', { n: left }))}</div>
          <a class="btn small soft" href="${esc(OBS.gcalLink(examEv(e)))}" target="_blank" rel="noopener">${icon('gcal')}${esc(t('g.add'))}</a>
        </div>`;
      }).join('');
      return head('side.exams', mine ? t('ex.leadMine', { n: list.length }) : app.approved ? t('ex.leadAll', { n: list.length }) : t('ex.leadNoReg'),
        `<button class="btn soft" type="button" data-exics>${icon('download')}${esc(t('ex.ics'))}</button><button class="btn primary" type="button" data-exsync>${icon('gcal')}${esc(t('ex.sync'))}</button>`) +
        `<section class="card filters"><div class="f-group"><span class="f-label">${esc(t('ex.show'))}</span><div class="seg"><button type="button" data-exall="0" class="${!ui.examAll ? 'on' : ''}" ${app.approved ? '' : 'disabled'}>${esc(t('ex.mine'))}</button><button type="button" data-exall="1" class="${ui.examAll || !app.approved ? 'on' : ''}">${esc(t('ex.all'))}</button></div></div>
          <div class="f-group"><span class="f-label">${esc(t('ex.summary'))}</span><span class="v">${esc(t('ex.sumV', { n: upcoming.length, c: clash.size / 2 }))}</span></div></section>
        ${clash.size ? `<div class="warn-box error"><svg viewBox="0 0 24 24"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.5"/></svg><span>${esc(t('ex.clashWarn'))}</span></div>` : ''}
        <section class="card ex-list">${rows || `<div class="tt-empty"><p>${esc(t('ex.none'))}</p></div>`}</section>`;
    },
  };

  // ---------- Bölüm Ders Programı ----------
  OBS.views.depttt = {
    title: 'side.depttt',
    needs: ['timetable'],
    render() {
      const progs = (D().timetable || []).filter((x) => x.data.year);
      const key = (x) => `${x.data.year}|${x.data.term}`;
      const want = ui.ttKey || `${app.profile.year}|${app.term}`;
      const cur = progs.find((x) => key(x) === want) || progs[0];
      const prog = PROG();
      const secs = prog.terms[cur.data.term][cur.data.year];
      const items = secs.map((s) => ({ code: s.code, section: s.section, slots: s.slots, color: OBS.hashColor(s.code), title: `${s.code} ${OBS.name(s.code)} · ${t('grid.section', { n: s.section })}` }));
      return head('side.depttt', t('dtt.lead', { y: cur.data.year, term: `${cur.data.academicYear || ''} ${t('tshort.' + cur.data.term)}`.trim(), n: secs.length }), `<button class="btn soft" type="button" data-dl="${cur.file.id}">${icon('download')}${esc(t('dtt.excel'))}</button>`) +
        `<section class="card filters"><div class="f-group"><span class="f-label">${esc(t('dtt.pick'))}</span><div class="seg">${progs.map((x) => `<button type="button" data-ttkey="${key(x)}" class="${x === cur ? 'on' : ''}">${esc(t('f.year', { y: x.data.year }))} · ${esc(t('tshort.' + x.data.term))}</button>`).join('')}</div></div></section>
        <section class="card flush"><div class="grid-wrap">${OBS.weekGrid(items, { compact: true })}</div></section>`;
    },
  };

  // ---------- Mezuniyet İlerleme Durumu ----------
  function offeredFn() {
    const prog = PROG();
    return (code, term) => {
      if (!prog) return null;
      const inT = (tm) => Object.values(prog.terms[tm] || {}).some((l) => l.some((s) => s.code === code));
      if (inT(term)) return true;
      const other = term === 'guz' ? 'bahar' : 'guz';
      return prog.terms[other] && inT(other) ? false : null;
    };
  }
  OBS.offeredFn = offeredFn;
  OBS.planNow = (improve = []) => {
    const st = OBS.student();
    if (!st) return null;
    const cur = app.approved && app.approved.term === app.term ? app.approved.items.map((x) => (x.kind === 'slot' ? x.slotKey : x.code)).filter(Boolean) : [];
    return ACAD.planTerms(MUF(), { ...st, status: { ...st.status } }, { start: { year: app.ay, term: app.term }, limit: OBS.limitFor(st.gpa), offered: offeredFn(), current: cur, improve });
  };
  const gradDate = (g) => (g ? (g.term === 'guz' ? `${g.year.slice(5)}-01-31` : `${g.year.slice(5)}-06-30`) : null);
  OBS.views.grad = {
    title: 'side.grad',
    needs: ['curriculum', 'transcript'],
    render() {
      const st = OBS.student();
      const r = app.rules;
      const gp = ACAD.graduationProgress(MUF(), D().transcript.data, r, { scale: OBS.scale(), eq: OBS.eq(), semester: st.semester });
      const plan = OBS.planNow();
      const gd = plan && plan.graduation ? gradDate(plan.graduation) : null;
      const p = app.profile;
      const okI = (ok) => `<span class="gi ${ok ? 'ok' : 'no'}">${ok ? OBS.CHECK : icon('x')}</span>`;
      const bar = (pct, cls = '') => `<div class="gbar ${cls}"><i style="width:${pct}%"></i></div><span class="gpct">${pct}%</span>`;
      const box = (ic, title, body, accent) => `<section class="gcard" style="--acc:${accent}"><div class="gc-h">${icon(ic)}<span>${esc(title)}</span></div><div class="gc-b">${body}</div></section>`;
      const prog = (ic, title, ok, val, pct, note) => `<section class="gcard prog ${ok ? 'ok' : 'no'}"><div class="gc-h">${icon(ic)}<span>${esc(title)}</span>${okI(ok)}</div><div class="gc-b"><div class="gv">${val}</div><div class="gline">${bar(pct)}</div><small class="muted">${esc(note)}</small></div></section>`;
      const row = (k, v) => `<div class="hc-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
      const regSrc = D().regulation ? t('grad.srcReg', { name: D().regulation.file.name }) : t('grad.srcDefault');
      const total = Math.round((gp.ects.pct + gp.mandatory.pct + gp.elective.pct + gp.internship.pct + (gp.gpa.ok ? 100 : gp.gpa.pct)) / 5);
      const lists = (arr, empty) => arr.length ? arr.map((x) => `<tr><td><b>${esc(x.kind === 'slot' ? 'ELECT ' + x.code : x.code)}</b></td><td>${esc(x.kind === 'slot' ? (app.lang === 'en' ? x.nameEn : x.name) : OBS.name(x.code))}</td><td class="num">${x.ects}</td><td>${esc(t(x.zs === 'Z' ? 'grad.z' : 'grad.s'))}</td><td class="muted small">${x.kind === 'slot' ? esc(t('grad.group')) : ''}</td></tr>`).join('') : `<tr><td colspan="5" class="empty">${esc(empty)}</td></tr>`;
      const failed = gp.failed.map((x) => `<tr><td>${esc(x.taken.term)}</td><td><b>${esc(x.taken.code)}</b></td><td>${esc(OBS.name(x.code))}</td><td class="num">${x.ects}</td><td>${esc(t(x.zs === 'Z' ? 'grad.z' : 'grad.s'))}</td><td class="bad">${esc(x.taken.letter)}</td></tr>`).join('');
      return head('side.grad', regSrc, `<button class="btn soft" type="button" data-goto="data">${icon('doc')}${esc(t('grad.rules'))}</button>`) +
        `<div class="ggrid four">
          ${box('id', t('home.id'), row(t('home.no'), p.number) + row('', t('home.dept')) + row('', t('home.faculty')), '#3aa655')}
          ${box('info', t('home.status'), row(t('home.regDate'), `29.08.${OBS.entryYear()}`) + row(t('home.regReason'), t('home.regReasonV')) + row(t('home.stateK'), t('home.stateV')), '#3f7be0')}
          ${box('hourglass', t('grad.time'), row(t('grad.semNow'), String(st.semester)) + row(t('grad.normalMax'), `${r.normalYears} / ${r.maxYears}`) + `<div class="gline">${bar(gp.time.pct)}</div>`, '#14a383')}
          ${box('doc', t('grad.state'), row(t('home.gpa'), OBS.fmtGpa(gp.gpa.value)) + row(t('grad.complete'), t('grad.pct', { n: total })) + row(t('grad.expected'), gd ? OBS.fmtShort(gd) : '-'), '#6a5ae0')}
        </div>
        <div class="ggrid four">
          ${prog('chart', t('grad.gpa'), gp.gpa.ok, `${OBS.fmtGpa(gp.gpa.value)} <small>/ ${OBS.fmtGpa(r.minGpa)}</small>`, gp.gpa.ok ? 100 : gp.gpa.pct, t('grad.gpaNote', { n: OBS.fmtGpa(r.minGpa) }))}
          ${prog('book', t('grad.mand'), gp.mandatory.done === gp.mandatory.all, `${gp.mandatory.done} <small>/ ${gp.mandatory.all}</small>`, gp.mandatory.pct, t('grad.mandNote'))}
          ${prog('folder', t('grad.elec'), gp.elective.done === gp.elective.all, `${gp.elective.done} <small>/ ${gp.elective.all}</small>`, gp.elective.pct, t('grad.elecNote'))}
          ${prog('spark', t('grad.ects'), gp.ects.done >= gp.ects.need, `${gp.ects.done} <small>/ ${gp.ects.need}</small>`, gp.ects.pct, t('grad.ectsNote'))}
          ${prog('bank', t('grad.staj'), gp.internship.pct === 100, `${gp.internship.done} <small>/ ${gp.internship.need} ${esc(t('grad.days'))}</small>`, gp.internship.pct, t('grad.stajNote'))}
          ${prog('lang', t('grad.prep'), true, esc(t('grad.exempt')), 100, t('grad.prepNote'))}
          ${prog('form', t('grad.status'), !gp.failed.length && !gp.notTaken.length, `${gp.notTaken.length} <small>${esc(t('grad.notTakenS'))}</small> · ${gp.failed.length} <small>${esc(t('grad.failedS'))}</small>`, Math.round(100 * (1 - (gp.notTaken.length + gp.failed.length) / Math.max(1, gp.mandatory.all + gp.elective.all))), t('grad.statusNote'))}
          ${prog('check', t('grad.failedT'), !gp.failed.length, gp.failed.length ? gp.failed.map((x) => esc(x.code)).join(', ') : esc(t('grad.none')), gp.failed.length ? 0 : 100, t('grad.failedNote'))}
        </div>
        ${plan && plan.graduation ? `<div class="cal-note ok">${icon('spark')}<span>${esc(t('grad.planNote', { term: ACAD.termLabel(plan.graduation, app.lang), n: plan.terms.length }))}</span><button class="btn small soft" type="button" data-goto="scenario">${esc(t('grad.planBtn'))}</button></div>` : ''}
        <div class="two-col">
          <section class="card flush"><div class="card-head pad"><h2>${esc(t('grad.notTaken'))}</h2><span class="count">${gp.notTaken.length}</span></div><div class="table-wrap"><table class="sel-table"><thead><tr><th>${esc(t('sel.code'))}</th><th>${esc(t('sel.name'))}</th><th class="num">${esc(t('sel.ects'))}</th><th>${esc(t('grad.type'))}</th><th>${esc(t('grad.groupH'))}</th></tr></thead><tbody>${lists(gp.notTaken, t('grad.none'))}</tbody></table></div></section>
          <section class="card flush"><div class="card-head pad"><h2>${esc(t('grad.failedT'))}</h2><span class="count">${gp.failed.length}</span></div><div class="table-wrap"><table class="sel-table"><thead><tr><th>${esc(t('grad.term'))}</th><th>${esc(t('sel.code'))}</th><th>${esc(t('sel.name'))}</th><th class="num">${esc(t('sel.ects'))}</th><th>${esc(t('grad.type'))}</th><th>${esc(t('grad.grade'))}</th></tr></thead><tbody>${failed || `<tr><td colspan="6" class="empty">${esc(t('grad.noRecord'))}</td></tr>`}</tbody></table></div></section>
        </div>`;
    },
  };

  // ---------- Olaylar ----------
  document.addEventListener('click', (e) => {
    let b;
    if ((b = e.target.closest('[data-offterm]'))) { ui.offTerm = b.dataset.offterm; ui.offYear = 'all'; OBS.renderView(); return; }
    if ((b = e.target.closest('[data-offyear]'))) { ui.offYear = b.dataset.offyear; OBS.renderView(); return; }
    if ((b = e.target.closest('[data-ttkey]'))) { ui.ttKey = b.dataset.ttkey; OBS.renderView(); return; }
    if ((b = e.target.closest('[data-exall]'))) { ui.examAll = b.dataset.exall === '1'; OBS.renderView(); return; }
    if (e.target.closest('[data-calics]')) { OBS.ics(D().calendar.data.events.map((x) => ({ title: x.title, date: x.start, end: x.end })), 'akademik-takvim.ics'); return; }
    if (e.target.closest('[data-exics]')) { OBS.ics(myExams().list.map(examEv), 'sinav-takvimi.ics'); return; }
    if (e.target.closest('[data-exsync]')) { OBS.googleSync(myExams().list.filter((x) => x.date >= OBS.today()).map(examEv)); }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'offQ') return;
    ui.offQ = e.target.value;
    const pos = e.target.selectionStart;
    OBS.renderView();
    const el = $('offQ');
    if (el) { el.focus(); el.setSelectionRange(pos, pos); }
  });
})();
