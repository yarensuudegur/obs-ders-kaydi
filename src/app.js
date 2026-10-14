// Arayüz. logic.js, i18n.js ve window.MUFREDAT / window.PROGRAM verisi bu dosyadan önce yüklenir.
(function () {
  const MUF = window.MUFREDAT;
  const PROG = window.PROGRAM;

  const PALETTE = ['#3f7be0', '#14a383', '#e0a21b', '#14a0c4', '#6a5ae0', '#c2703a', '#5f9e1c'];
  const COLORS = { A: '#9b59d0', B: '#3aa655', retake: '#e0533d', unv: '#d63384', staj: '#7b8496', none: '#9aa2b4' };
  const STATE_ORDER = { fixed: 0, selected: 1, free: 2, 'locked-choice': 3, 'locked-fixed': 4, sibling: 5, 'slot-full': 6, prereq: 7, passed: 8 };
  const CHECK = '<svg><use href="#i-check"/></svg>';
  const EN_NAMES = new Map([...MUF.courses, ...MUF.universityElectives.courses].map((c) => [c.code, c.nameEn]));

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* yok say */ } },
  };

  const app = {
    lang: store.get('obs-lang') === 'en' ? 'en' : 'tr',
    profile: { first: 'Demo', last: 'Öğrenci', number: '23070001234', year: 4, ectsLimit: 40, status: { 'ME 3220': 'failed' } },
    advisor: 'waiting',
    view: 'reg',
    approved: null,
    notes: [],
    unread: 0,
    term: 'guz',
    layers: new Set(['4|guz']),
    state: emptyState(),
    model: null,
    evalr: null,
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function t(key, params) {
    const str = I18N[app.lang][key] ?? I18N.tr[key] ?? key;
    return params ? str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m)) : str;
  }
  const days = () => I18N[app.lang].days;
  const daysShort = () => I18N[app.lang].daysShort;
  const when = (slot) => `${days()[slot.day]} ${slot.start}`;
  const upper = (s) => s.toLocaleUpperCase(app.lang === 'tr' ? 'tr' : 'en');

  const SMALL = new Set(['ve', 'için', 'ile']);
  function titleCase(str) {
    return str.split(' ').map((w, i) => {
      if (/^[IVX]+$/.test(w)) return w;
      const roman = w.match(/^(.*)-([IVX]+)$/);
      if (roman) return titleCase(roman[1]) + '-' + roman[2];
      const lw = w.toLocaleLowerCase('tr');
      return i > 0 && SMALL.has(lw) ? lw : lw.charAt(0).toLocaleUpperCase('tr') + lw.slice(1);
    }).join(' ');
  }
  function name(code) {
    if (app.lang === 'en' && EN_NAMES.get(code)) return EN_NAMES.get(code);
    const n = courseName(app.model, code);
    return n === code ? code : titleCase(n);
  }
  function slotName(slot) {
    const req = app.model.electiveSlots.find((s) => s.slot === slot);
    if (!req) return slot;
    return app.lang === 'en' ? req.nameEn : req.name;
  }
  const studentName = () => {
    const p = app.profile;
    if (app.lang === 'en' && p.first === 'Demo' && p.last === 'Öğrenci') return 'Demo Student';
    return `${p.first} ${p.last}`.trim();
  };

  // Şube durumunun açıklaması (seçili dilde)
  function reasonText(id, st) {
    const s = app.model.sections.get(id);
    switch (st.state) {
      case 'fixed': return t('r.fixed', { code: s.code });
      case 'selected': return st.slot ? t('r.selectedSlot', { slot: slotName(st.slot) }) : t('r.selected');
      case 'locked-fixed': return t('r.lockedFixed', { code: st.other, when: when(st.at) });
      case 'sibling': return t('r.sibling', { n: st.section });
      case 'prereq': return t('r.prereq', { list: st.missing.join(', ') });
      case 'passed': return t('r.passed', { code: s.code });
      case 'slot-full': return t('r.slotFull', { list: st.full.map((x) => t('r.slotFullItem', { slot: slotName(x.slot), code: x.code })).join(', ') });
      case 'locked-choice': return t('r.lockedChoice', { code: st.other, when: when(st.at) });
      default: return st.extra ? t('r.extra', { code: s.code }) : st.next ? t('r.freeSlot', { slot: slotName(st.next) }) : t('r.free');
    }
  }

  // İşaretli programların yarıyılları (üstten ya da alttan) isteğe bağlı gereksinim olarak eklenir
  function upperSemesters() {
    const reg = semesterFor(app.profile.year, app.term);
    return [...app.layers].map((l) => { const [y, tm] = l.split('|'); return semesterFor(parseInt(y, 10), tm); }).filter((x) => x !== reg && x >= 5);
  }
  function rebuild(resetState = true) {
    app.model = buildModel(MUF, PROG, { year: app.profile.year, term: app.term, status: app.profile.status, extraSemesters: upperSemesters() });
    if (resetState) { app.state = emptyState(); app.advisor = 'waiting'; }
    else app.state = replayState(app.model, app.state);
    render();
  }

  // ---------- Renkler ----------
  function colorOf(code) {
    const m = app.model;
    if (m.unvCourses.has(code)) return COLORS.unv;
    const role = m.roles.get(code);
    if (!role) return COLORS.none;
    if (role.kind === 'mandatory') return PALETTE[m.requirements.filter((r) => r.kind === 'mandatory').findIndex((r) => r.code === code) % PALETTE.length];
    if (role.kind === 'retake') return COLORS.retake;
    const first = m.electiveSlots.find((s) => s.slot === role.slots[0]);
    return COLORS[first.slotType] || COLORS.none;
  }
  function reqColor(req) {
    if (req.kind === 'slot') return req.slotType === 'UNV' ? COLORS.unv : req.slotType === 'STAJ' ? COLORS.staj : COLORS[req.slotType];
    return colorOf(req.code);
  }

  // ---------- Sabit metinler ----------
  function applyStatic() {
    document.documentElement.lang = app.lang;
    document.title = t('doc.title');
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    document.querySelectorAll('.side-nav .item.off').forEach((el) => { el.title = t('side.inactive'); });
    document.querySelectorAll('#langSeg [data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === app.lang)));
    $('termSel').innerHTML = ['guz', 'bahar'].map((v) => `<option value="${v}">${t('term.' + v)}</option>`).join('');
    $('pfYear').options[0].textContent = t('pf.yearOpt', { y: 3 });
    $('pfYear').options[1].textContent = t('pf.yearOpt', { y: 4 });
  }

  // ---------- Üst kısım ----------
  function renderTop() {
    const m = app.model;
    const p = app.profile;
    $('termPill').textContent = t('term.' + app.term);
    $('termSel').value = app.term;
    $('avatar').textContent = studentName().split(' ').map((w) => w[0]).join('').slice(0, 2).toLocaleUpperCase('tr');
    $('meName').textContent = `${p.number} · ${upper(studentName())}`;
    $('semState').textContent = t('stat.semValue', { year: p.year, sem: m.semester });
    const adv = $('advisorState');
    adv.textContent = t(app.advisor === 'approved' ? 'stat.approved' : app.advisor === 'sent' ? 'stat.sent' : 'stat.waiting');
    adv.className = 'v ' + (app.advisor === 'approved' ? 'approved' : 'wait');
    $('bellDot').textContent = String(app.unread);
    $('bellDot').classList.toggle('zero', !app.unread);

    $('yearChecks').innerHTML = [1, 2, 3, 4]
      .map((y) => {
        const avail = y >= 3;
        const boxes = ['guz', 'bahar'].map((tm) => {
          const key = y + '|' + tm;
          const on = avail && app.layers.has(key);
          return `<label class="yc ${on ? 'on' : ''} ${avail ? '' : 'dis'}" title="${esc(avail ? t('f.layerTip', { y, term: t('tshort.' + tm) }) : t('f.yearOff'))}">
            <input type="checkbox" data-layer="${key}" ${on ? 'checked' : ''} ${avail ? '' : 'disabled'}>${esc(t('tshort.' + tm))}</label>`;
        }).join('');
        return `<div class="ygroup ${avail ? '' : 'dis'}"><span class="yl">${esc(t('f.year', { y }))}</span><div class="ybox">${boxes}</div></div>`;
      })
      .join('');


    const ects = app.evalr.ects;
    const lim = p.ectsLimit;
    const el = $('ects');
    el.classList.toggle('over', ects > lim);
    el.innerHTML = `<div class="top-line"><span class="k">${esc(t('stat.ects'))}</span><span class="big">${ects} / ${lim}</span></div>
      <div class="bar"><i style="width:${Math.min(100, (ects / lim) * 100)}%"></i></div>
      <span class="k" style="margin-top:4px">${esc(ects > lim ? t('stat.over', { n: ects - lim }) : t('stat.left', { n: lim - ects }))}</span>`;
  }

  function renderWarnings() {
    const icon = '<svg viewBox="0 0 24 24"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.5"/></svg>';
    $('warnings').innerHTML = app.evalr.warnings
      .map((w) => {
        const txt = w.kind === 'missing' ? t('w.missing', { code: w.code, name: name(w.code) }) : w.kind === 'clash' ? t('w.clash', { a: w.a, b: w.b, when: when(w.at) }) : w.text;
        return `<div class="warn-box ${w.level}">${icon}<span>${esc(txt)}</span></div>`;
      })
      .join('');
  }

  // ---------- Alman gerekenler ----------
  function reqInfo(req) {
    const m = app.model;
    const ev = app.evalr;
    if (req.kind === 'mandatory' || req.kind === 'retake') {
      const info = courseReqInfo(req);
      if (req.kind === 'retake') {
        const lead = t(req.status === 'failed' ? 'req.failed' : 'req.notTaken');
        info.s = `${lead}, ${info.s.charAt(0).toLocaleLowerCase(app.lang === 'tr' ? 'tr' : 'en')}${info.s.slice(1)}`;
      }
      return info;
    }
    return slotReqInfo(req);
  }

  function courseReqInfo(req) {
    const m = app.model;
    {
      const secs = m.sectionsByCode.get(req.code) || [];
      const termSecs = m.termSections(req.code);
      const fixed = secs.find((s) => m.fixedIds.has(s.id));
      const picked = secs.find((s) => app.state.picks.some((p) => p.id === s.id));
      const tt = `${esc(req.code)} ${esc(name(req.code))}`;
      const pre = m.blockedBy(req.code);
      if (pre.length) return { cls: 'missing prereq', t: tt, s: t('req.prereq', { list: pre.join(', ') }) };
      if (fixed) return { cls: 'done', t: tt, s: t('req.fixed', { n: fixed.section }) };
      if (picked) return { cls: 'done', t: tt, s: t('req.picked', { n: picked.section }) + (picked.term !== app.term ? ` (${t('tshort.' + picked.term)})` : '') };
      if (!secs.length) return { cls: 'missing', t: tt, s: t('req.closed') };
      // Üstten/alttan (isteğe bağlı) dersler kendi döneminin programından alınır
      if (req.upper) return { cls: 'todo', t: tt, s: t('req.pick', { n: secs.length }) };
      if (!termSecs.length) return { cls: 'missing', t: tt, s: t('req.otherTerm', { term: t('tshort.' + secs[0].term) }) };
      return { cls: 'todo', t: tt, s: t('req.pick', { n: termSecs.length }) };
    }
  }

  function slotReqInfo(req) {
    const m = app.model;
    const ev = app.evalr;
    const filled = ev.fill[req.slot];
    const tt = `${esc(slotName(req.slot))}${req.slotType === 'UNV' ? `<span class="pill online">${esc(t('req.online'))}</span>` : ''}`;
    if (req.slotType === 'A' || req.slotType === 'B') {
      const open = [...m.sections.values()].filter((s) => (m.roles.get(s.code)?.slots || []).includes(req.slot) && ev.status.get(s.id).state === 'free').length;
      return { cls: filled ? 'done' : 'todo', t: tt, s: filled ? `${filled} ${name(filled)}` : open ? t('req.pickElective', { n: open }) : t('req.noneOpen') };
    }
    if (req.slotType === 'STAJ') {
      const btn = `<button type="button" class="staj-btn ${filled ? 'on' : ''}" data-staj="${esc(req.slot)}">${esc(filled ? t('req.stajRemove') : t('req.stajAdd'))}</button>`;
      return { cls: filled ? 'done' : 'todo', t: tt, s: filled ? t('req.stajAdded') : t('req.staj'), extra: btn };
    }
    const sel = `<select data-slot="${esc(req.slot)}" aria-label="${esc(slotName(req.slot))}"><option value="">${esc(t('req.choose'))}</option>${req.options
      .map((c) => {
        const u = m.unvCourses.get(c);
        const w = u ? ` (${when(u.slots[0])})` : '';
        return `<option value="${esc(c)}" ${filled === c ? 'selected' : ''}>${esc(c)} ${esc(name(c))}${w}</option>`;
      })
      .join('')}</select>`;
    return { cls: filled ? 'done' : 'todo', t: tt, s: filled ? `${filled} ${name(filled)}` : t('req.unv', { n: req.options.length }), extra: sel };
  }

  function renderReqs() {
    const m = app.model;
    const reqs = m.requirements;
    let done = 0, all = 0;
    const card = (req) => {
      const i = reqInfo(req);
      if (!req.upper) { all++; if (i.cls === 'done') done++; }
      return `<div class="req ${i.cls}" data-req="${esc(req.id)}" style="--c:${reqColor(req)}" tabindex="0">
          <span class="mark">${i.cls === 'done' ? CHECK : ''}</span>
          <div style="min-width:0"><div class="t" title="${esc(i.t.replace(/<[^>]+>/g, ' '))}">${i.t}</div>${i.s ? `<div class="s">${esc(i.s)}</div>` : ''}${i.extra || ''}</div>
          <span class="cr">${req.ects} ${esc(t('sel.ects'))}</span></div>`;
    };
    const sems = [m.semester, ...m.extraSemesters];
    const semLabel = (no) => {
      const y = Math.ceil(no / 2);
      const tm = no % 2 ? 'guz' : 'bahar';
      return t(no === m.semester ? 'req.semNow' : no > m.semester ? 'req.semUpper' : 'req.semLower', { sem: no, y, term: t('tshort.' + tm) });
    };
    $('reqList').innerHTML = sems
      .map((no) => {
        const list = reqs.filter((r) => r.semester === no);
        if (!list.length) return '';
        return `${sems.length > 1 ? `<div class="req-sem ${no === m.semester ? '' : no > m.semester ? 'up' : 'down'}">${esc(semLabel(no))}</div>` : ''}${list.map(card).join('')}`;
      })
      .join('');
    $('reqCount').textContent = t('req.count', { done, all });
  }

  function idsForReq(reqId) {
    const m = app.model;
    const req = m.requirements.find((r) => r.id === reqId);
    if (!req) return [];
    if (req.kind !== 'slot') return (m.sectionsByCode.get(req.code) || []).map((s) => s.id);
    if (req.slotType === 'UNV') return [...m.unvCourses.keys()].map((c) => 'UNV:' + c);
    if (req.slotType === 'STAJ') return [];
    return [...m.sections.values()].filter((s) => (m.roles.get(s.code)?.slots || []).includes(req.slot)).map((s) => s.id);
  }
  function reqIdForItem(id) {
    const m = app.model;
    if (id.startsWith('UNV:')) return unvSlotName(m);
    const s = m.sections.get(id);
    const role = m.roles.get(s.code);
    if (!role) return null;
    if (role.kind !== 'elective') return s.code;
    const pick = app.state.picks.find((p) => p.id === id);
    return pick ? pick.slot : role.slots[0];
  }

  // ---------- Haftalık tablo ----------
  function visibleItems() {
    const m = app.model;
    const items = [];
    for (const s of m.sections.values()) {
      const st = app.evalr.status.get(s.id);
      const isSel = st.state === 'fixed' || st.state === 'selected';
      if (isSel || [...s.layers].some((l) => app.layers.has(l))) items.push({ kind: 'sec', id: s.id, sec: s, st, slots: s.slots });
    }
    if (m.hasUnvSlot) {
      const slot = unvSlotName(m);
      for (const u of m.unvCourses.values()) {
        items.push({ kind: 'unv', id: 'UNV:' + u.code, unv: u, st: { state: app.evalr.fill[slot] === u.code ? 'selected' : 'free' }, slots: u.slots });
      }
    }
    return items;
  }

  function chipHtml(it, slot) {
    if (it.kind === 'unv') {
      const u = it.unv;
      const sel = it.st.state === 'selected';
      return `<button type="button" class="chip unv ${it.st.state}" data-id="${esc(it.id)}" style="--c:${COLORS.unv}">
        <div class="l1">${esc(u.code)}</div><div class="l2">${esc(t('grid.online'))}</div>${sel ? `<span class="ok">${CHECK}</span>` : ''}</button>`;
    }
    const s = it.sec;
    const st = it.st.state;
    const tick = st === 'selected' || st === 'fixed' ? `<span class="ok">${CHECK}</span>` : '';
    return `<button type="button" class="chip ${st}" data-id="${esc(s.id)}" style="--c:${colorOf(s.code)}" aria-disabled="${!['free', 'selected'].includes(st)}">
      <div class="l1">${esc(s.code)}</div>
      <div class="l2">${esc(t('grid.section', { n: s.section }))}${slot.type === 'U' ? ` <span class="lab">${esc(t('grid.lab'))}</span>` : ''}${s.term !== app.term ? ` <span class="tm ${s.term}">${esc(t('tshort.' + s.term))}</span>` : ''}</div>${tick}</button>`;
  }

  function renderGrid() {
    const items = visibleItems();
    const hours = gridHours(items);
    const cells = new Map();
    for (const it of items) {
      for (const sl of it.slots) {
        const k = sl.day + '|' + sl.start;
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push({ it, sl });
      }
    }
    for (const list of cells.values()) {
      list.sort((a, b) => (STATE_ORDER[a.it.st.state] ?? 9) - (STATE_ORDER[b.it.st.state] ?? 9) || (a.it.kind === 'unv') - (b.it.kind === 'unv') || a.it.id.localeCompare(b.it.id, 'tr'));
    }
    let html = '<thead><tr><th class="time"></th>' + days().map((d) => `<th>${d}</th>`).join('') + '</tr></thead><tbody>';
    hours.forEach((h, i) => {
      const evening = i >= BASE_HOURS.length;
      const first = i === BASE_HOURS.length;
      const end = `${String(parseInt(h, 10) + 1).padStart(2, '0')}:30`;
      html += `<tr class="${evening ? 'evening' : ''} ${first ? 'evening-first' : ''}"><th class="time"><b>${h}</b>${end}${first ? `<span class="eve-label">${esc(t('grid.evening'))}</span>` : ''}</th>`;
      for (let d = 0; d < 7; d++) html += `<td>${(cells.get(d + '|' + h) || []).map((x) => chipHtml(x.it, x.sl)).join('')}</td>`;
      html += '</tr>';
    });
    $('grid').innerHTML = html + '</tbody>';
  }

  // ---------- Seçilen dersler (OBS tablosu) ----------
  function selectedRows() {
    const m = app.model;
    const ev = app.evalr;
    const rows = [];
    const missing = [];
    for (const req of m.requirements) {
      if (req.kind === 'slot') {
        const code = ev.fill[req.slot];
        if (!code) { if (!req.upper) missing.push(slotName(req.slot)); continue; }
        const pick = app.state.picks.find((p) => p.slot === req.slot);
        const c = m.courses.get(code);
        rows.push({ sec: pick ? m.sections.get(pick.id).section : '-', code, name: name(code), zs: 's', tu: c ? c.tul.split('+').slice(0, 2).join('+') : '-', ects: req.ects, type: slotName(req.slot), color: reqColor(req), removeId: pick ? pick.id : null, removeSlot: pick ? null : req.slot });
      } else {
        const secs = m.sectionsByCode.get(req.code) || [];
        const s = secs.find((x) => m.fixedIds.has(x.id) || app.state.picks.some((p) => p.id === x.id));
        if (!s) { if (!req.upper) missing.push(`${req.code} ${name(req.code)} ${t(secs.length ? 'fin.noSection' : 'fin.closed')}`); continue; }
        const c = m.courses.get(req.code);
        rows.push({ sec: s.section, code: req.code, name: name(req.code), zs: 'z', tu: c.tul.split('+').slice(0, 2).join('+'), ects: req.ects, type: t(req.kind === 'retake' || req.dir === 'lower' ? 'type.retake' : req.dir === 'upper' ? 'type.upper' : 'type.mandatory'), color: reqColor(req), removeId: m.fixedIds.has(s.id) ? null : s.id, fixed: m.fixedIds.has(s.id) });
      }
    }
    for (const code of extraCodes(m, app.state)) {
      const pick = app.state.picks.find((p) => m.sections.get(p.id).code === code);
      const s = m.sections.get(pick.id);
      const c = m.courses.get(code);
      rows.push({ sec: s.section, code, name: name(code), zs: 's', tu: c ? c.tul.split('+').slice(0, 2).join('+') : '-', ects: c ? c.ects : 0, type: t('type.extra'), color: COLORS.none, removeId: s.id });
    }
    return { rows, missing };
  }

  function renderSelected() {
    const { rows } = selectedRows();
    const head = `<thead><tr><th>${t('sel.sec')}</th><th>${t('sel.code')}</th><th>${t('sel.name')}</th><th>${t('sel.zs')}</th><th>${t('sel.tu')}</th><th>${t('sel.type')}</th><th class="num">${t('sel.ects')}</th><th></th></tr></thead>`;
    if (!rows.length) {
      $('selTable').innerHTML = `${head}<tbody><tr><td class="empty" colspan="8">${esc(t('sel.empty'))}</td></tr></tbody>`;
      return;
    }
    $('selTable').innerHTML = head + '<tbody>' + rows.map((r) => `<tr>
      <td>${r.sec}</td><td><span class="sw" style="--c:${r.color}"></span><b>${esc(r.code)}</b></td><td>${esc(r.name)}</td>
      <td class="zs ${r.zs}">${t('zs.' + r.zs)}</td><td>${esc(r.tu)}</td><td>${esc(r.type)}</td><td class="num">${r.ects}</td>
      <td class="num">${r.fixed ? `<span class="muted small">${esc(t('sel.auto'))}</span>` : `<button class="rm" type="button" ${r.removeId ? `data-remove="${esc(r.removeId)}"` : `data-remove-slot="${esc(r.removeSlot)}"`}>${esc(t('sel.remove'))}</button>`}</td></tr>`).join('') +
      `</tbody><tfoot><tr><td colspan="6">${esc(t('sel.total'))}</td><td class="num">${app.evalr.ects}</td><td></td></tr></tfoot>`;
  }

  function render() {
    $('tip').classList.remove('on');
    app.evalr = evaluate(app.model, app.state);
    renderTop();
    renderWarnings();
    renderReqs();
    renderGrid();
    renderSelected();
  }

  // ---------- Etkileşim ----------
  let toastTimer;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), 2800);
  }

  function clickItem(id) {
    const m = app.model;
    if (id.startsWith('UNV:')) {
      const slot = unvSlotName(m);
      const code = id.slice(4);
      const had = app.state.listChoices[slot] === code;
      app.state = setListChoice(m, app.state, slot, code).state;
      render();
      toast(had ? t('t.unvRemoved', { code }) : t('t.unvAdded', { code, slot: slotName(slot) }));
      return;
    }
    if (m.fixedIds.has(id)) { toast(reasonText(id, app.evalr.status.get(id))); return; }
    const r = toggleSection(m, app.state, id);
    if (!r.ok) { const st = app.evalr.status.get(id); toast(st ? reasonText(id, st) : t('t.cannot')); return; }
    app.state = r.state;
    render();
    const s = m.sections.get(id);
    if (r.action === 'added') toast(r.slot ? t('t.addedSlot', { code: s.code, n: s.section, slot: slotName(r.slot) }) : t('t.added', { code: s.code, n: s.section }));
    else toast(t('t.removed', { code: s.code, n: s.section }));
  }

  function highlight(id) {
    document.querySelectorAll('.chip.hl, .req.hl').forEach((e) => e.classList.remove('hl'));
    if (!id) return;
    document.querySelectorAll(`.chip[data-id="${CSS.escape(id)}"]`).forEach((e) => e.classList.add('hl'));
    const rid = reqIdForItem(id);
    if (rid) document.querySelector(`.req[data-req="${CSS.escape(rid)}"]`)?.classList.add('hl');
  }

  function showTip(chip, ev) {
    const m = app.model;
    const id = chip.dataset.id;
    let html;
    if (id.startsWith('UNV:')) {
      const u = m.unvCourses.get(id.slice(4));
      html = `<b>${esc(u.code)} ${esc(name(u.code))}</b><div class="hrs">${esc(t('tip.online', { when: u.slots.map(when).join(t('tip.and')) }))}</div><div class="r ok">${esc(t('r.unv'))}</div>`;
    } else {
      const s = m.sections.get(id);
      const st = app.evalr.status.get(id);
      const c = m.courses.get(s.code);
      const bad = ['locked-fixed', 'locked-choice', 'sibling', 'slot-full', 'prereq', 'passed'].includes(st.state);
      const hrs = s.slots.map((x) => `${daysShort()[x.day]} ${x.start}${x.type === 'U' ? ` (${t('grid.lab')})` : ''}`).join(', ');
      const rooms = [...new Set(s.slots.map((x) => x.room).filter(Boolean))].join(', ');
      const src = [...s.layers].map((l) => { const [y, tm] = l.split('|'); return t('tip.layer', { y, term: t('tshort.' + tm) }); }).join(', ');
      html = `<b>${esc(s.code)} · ${esc(t('grid.section', { n: s.section }))}</b><div>${esc(name(s.code))}${c ? `, ${c.ects} ${esc(t('sel.ects'))}` : ''}</div><div class="hrs">${esc(src)}</div><div class="hrs">${esc(hrs)}</div><div class="hrs">${esc(t('tip.room', { rooms }))}</div><div class="r ${bad ? 'bad' : 'ok'}">${esc(reasonText(id, st))}</div>`;
    }
    const tip = $('tip');
    tip.innerHTML = html;
    tip.classList.add('on');
    moveTip(ev);
  }
  function moveTip(ev) {
    const tip = $('tip');
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = ev.clientX + 14, y = ev.clientY + 16;
    if (x + w > innerWidth - 8) x = ev.clientX - w - 14;
    if (y + h > innerHeight - 8) y = ev.clientY - h - 12;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  function flashReq(reqId) {
    const m = app.model;
    const ids = idsForReq(reqId);
    let opened = false;
    for (const id of ids) {
      const s = m.sections.get(id);
      if (s && s.term === app.term && ![...s.layers].some((l) => app.layers.has(l))) {
        for (const l of s.layers) { app.layers.add(l); opened = true; }
      }
    }
    if (opened) { render(); toast(t('t.layer')); }
    const els = ids.flatMap((id) => [...document.querySelectorAll(`.chip[data-id="${CSS.escape(id)}"]`)]);
    if (!els.length) { if (!opened) toast(t('t.noHours')); return; }
    els.forEach((e) => { e.classList.remove('flash'); void e.offsetWidth; e.classList.add('flash'); });
    els[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function setLang(lang) {
    if (lang === app.lang) return;
    app.lang = lang;
    store.set('obs-lang', lang);
    applyStatic();
    render();
    if (app.view === 'tt') renderTT();
    if (!$('bellPop').hidden) renderBell();
    toast(t('t.lang'));
  }

  function bind() {
    document.addEventListener('click', (e) => {
      const lb = e.target.closest('[data-lang]');
      if (lb) { setLang(lb.dataset.lang); return; }
      const chip = e.target.closest('.chip');
      if (chip) { clickItem(chip.dataset.id); return; }
      const sj = e.target.closest('[data-staj]');
      if (sj) {
        const slot = sj.dataset.staj;
        const req = app.model.electiveSlots.find((x) => x.slot === slot);
        const had = !!app.state.listChoices[slot];
        app.state = setListChoice(app.model, app.state, slot, had ? null : req.options[0]).state;
        render();
        toast(t(had ? 't.stajRemoved' : 't.stajAdded'));
        return;
      }
      const rm = e.target.closest('[data-remove]');
      if (rm) { clickItem(rm.dataset.remove); return; }
      const rms = e.target.closest('[data-remove-slot]');
      if (rms) { app.state = setListChoice(app.model, app.state, rms.dataset.removeSlot, null).state; render(); return; }
      const req = e.target.closest('.req');
      if (req && !e.target.closest('select')) flashReq(req.dataset.req);
    });
    document.addEventListener('change', (e) => {
      const yc = e.target.closest('input[data-layer]');
      if (yc) {
        if (yc.checked) app.layers.add(yc.dataset.layer); else app.layers.delete(yc.dataset.layer);
        rebuild(false);
        return;
      }
      const sel = e.target.closest('select[data-slot]');
      if (sel) { app.state = setListChoice(app.model, app.state, sel.dataset.slot, sel.value || null).state; render(); }
    });
    $('termSel').addEventListener('change', (e) => { app.term = e.target.value; app.layers.add(app.profile.year + '|' + app.term); rebuild(); toast(t('t.term', { term: t('term.' + app.term) })); });
    document.addEventListener('keydown', (e) => {
      const req = e.target.closest && e.target.closest('.req');
      if (req && e.target === req && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); flashReq(req.dataset.req); }
    });

    const grid = $('grid');
    grid.addEventListener('mouseover', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      highlight(chip.dataset.id);
      showTip(chip, e);
    });
    grid.addEventListener('mousemove', (e) => { if ($('tip').classList.contains('on')) moveTip(e); });
    grid.addEventListener('mouseout', (e) => {
      const chip = e.target.closest('.chip');
      if (chip && !chip.contains(e.relatedTarget)) { highlight(null); $('tip').classList.remove('on'); }
    });
    $('reqList').addEventListener('mouseover', (e) => {
      const req = e.target.closest('.req');
      document.querySelectorAll('.chip.hl').forEach((x) => x.classList.remove('hl'));
      if (req) for (const id of idsForReq(req.dataset.req)) document.querySelectorAll(`.chip[data-id="${CSS.escape(id)}"]`).forEach((x) => x.classList.add('hl'));
    });
    $('reqList').addEventListener('mouseleave', () => document.querySelectorAll('.chip.hl').forEach((x) => x.classList.remove('hl')));

    $('menuBtn').addEventListener('click', () => $('shell').classList.toggle('collapsed'));

    $('meBtn').addEventListener('click', openProfile);
    $('pfYear').addEventListener('change', renderProfileCourses);
    $('pfCourses').addEventListener('change', (e) => {
      const r = e.target.closest('input[data-pfkey]');
      if (!r) return;
      pfDraft[r.dataset.pfkey] = r.value;
      r.closest('.pf-seg').querySelectorAll('label').forEach((l) => l.classList.toggle('on', l.contains(r)));
    });
    $('profileDlg').addEventListener('close', () => {
      if ($('profileDlg').returnValue !== 'ok') return;
      const year = parseInt($('pfYear').value, 10);
      app.profile.year = year;
      app.profile.ectsLimit = Math.max(10, parseInt($('pfLimit').value, 10) || 40);
      app.profile.first = $('pfFirst').value.trim() || 'Demo';
      app.profile.last = $('pfLast').value.trim();
      app.profile.number = $('pfNumber').value.trim() || app.profile.number;
      app.profile.status = { ...pfDraft };
      app.layers = new Set([year + '|' + app.term]);
      rebuild();
      toast(t('t.profile'));
    });

    $('finishBtn').addEventListener('click', openFinish);
    $('cancelFinish').addEventListener('click', () => $('finishDlg').close());
    $('confirmFinish').addEventListener('click', () => {
      if ($('confirmFinish').disabled) return;
      $('finishDlg').close();
      submitForApproval();
      toast(t('fin.sent'));
    });

    let left = 3599;
    setInterval(() => {
      left = left > 0 ? left - 1 : 3599;
      $('timer').textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
    }, 1000);
  }

  // Öğrenci profili: ders durumları (geçti / kaldı / almadı)
  let pfDraft = {};
  function renderProfileCourses() {
    const year = parseInt($('pfYear').value, 10);
    const reg = semesterFor(year, app.term);
    const opts = ['passed', 'failed', 'none'];
    $('pfCourses').innerHTML = MUF.semesters.map((sm) => {
      const y = Math.ceil(sm.semester / 2);
      const tm = sm.semester % 2 ? 'guz' : 'bahar';
      const rows = [...sm.mandatory.map((c) => ({ key: c, label: c, sub: name(c) })),
        ...sm.electiveSlots.map((x) => ({ key: x.slot, label: app.lang === 'en' ? x.nameEn : x.name, sub: '' }))];
      return `<div class="pf-sem"><div class="pf-sem-h">${esc(t('pf.semHead', { sem: sm.semester, y, term: t('tshort.' + tm) }))}${sm.semester === reg ? ` <span class="pill now">${esc(t('pf.now'))}</span>` : ''}</div>
        ${rows.map((r) => {
          const val = pfDraft[r.key] || (sm.semester < reg ? 'passed' : 'none');
          return `<div class="pf-row"><div class="pf-name"><b>${esc(r.label)}</b>${r.sub ? `<span>${esc(r.sub)}</span>` : ''}</div>
            <div class="pf-seg" role="radiogroup" aria-label="${esc(r.label)}">${opts.map((o) => `<label class="${o} ${val === o ? 'on' : ''}"><input type="radio" name="pf-${esc(r.key)}" value="${o}" data-pfkey="${esc(r.key)}" ${val === o ? 'checked' : ''}>${esc(t('st.' + o))}</label>`).join('')}</div></div>`;
        }).join('')}</div>`;
    }).join('');
  }
  function openProfile() {
    const p = app.profile;
    pfDraft = { ...p.status };
    $('pfFirst').value = p.first;
    $('pfLast').value = p.last;
    $('pfNumber').value = p.number;
    $('pfYear').value = String(p.year);
    $('pfLimit').value = String(p.ectsLimit);
    renderProfileCourses();
    $('profileDlg').showModal();
  }

  function openFinish() {
    const { rows, missing } = selectedRows();
    const ev = app.evalr;
    const lim = app.profile.ectsLimit;
    const over = ev.ects > lim;
    const ok = !missing.length && !over;
    $('finishBody').innerHTML = `
      <p class="muted">${esc(t('fin.lead', { name: studentName(), sem: app.model.semester, term: t('term.' + app.term) }))}</p>
      <div class="table-wrap" style="padding:0"><table class="sel-table"><thead><tr><th>${t('sel.sec')}</th><th>${t('sel.code')}</th><th>${t('sel.name')}</th><th>${t('sel.type')}</th><th class="num">${t('sel.ects')}</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${r.sec}</td><td><b>${esc(r.code)}</b></td><td>${esc(r.name)}</td><td>${esc(r.type)}</td><td class="num">${r.ects}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4">${esc(t('sel.total'))}</td><td class="num">${ev.ects} / ${lim}</td></tr></tfoot></table></div>
      ${ok ? `<div class="sum-ok">${esc(t('fin.ok'))}</div>`
        : `<div class="sum-miss"><b>${esc(t('fin.before'))}</b><ul>${missing.map((x) => `<li>${esc(x)}</li>`).join('')}${over ? `<li>${esc(t('fin.over', { n: ev.ects - lim }))}</li>` : ''}</ul></div>`}`;
    $('confirmFinish').disabled = !ok;
    $('confirmFinish').title = ok ? '' : t('fin.fixFirst');
    $('finishDlg').showModal();
  }

  // ---------- Yapay zeka önerileri ----------
  const ai = { wanted: new Set(), staj: false, unv: '', results: null, shown: 12 };

  function aiCandidates() {
    const m = app.model;
    const mandatory = [], retake = [], electives = [];
    for (const r of m.requirements) {
      if (r.kind === 'mandatory') mandatory.push(r.code);
      if (r.kind === 'retake') retake.push(r.code);
    }
    // ön koşulu sağlanmayanlar en sona
    mandatory.sort((a, b) => (m.blockedBy(a).length ? 1 : 0) - (m.blockedBy(b).length ? 1 : 0));
    const seen = new Set();
    for (const slot of m.electiveSlots) {
      if (slot.slotType !== 'A' && slot.slotType !== 'B') continue;
      for (const c of slot.options) if (!seen.has(c) && (m.sectionsByCode.get(c) || []).length) { seen.add(c); electives.push(c); }
    }
    electives.sort((a, b) => a.localeCompare(b, 'tr'));
    return { mandatory, retake, electives };
  }
  const isLocked = (code) => {
    const m = app.model;
    const role = m.roles.get(code);
    if (role && role.kind === 'retake') return true;
    return (m.sectionsByCode.get(code) || []).some((s) => m.fixedIds.has(s.id));
  };
  const abSlots = () => app.model.electiveSlots.filter((s) => s.slotType === 'A' || s.slotType === 'B');

  function openAI() {
    const m = app.model;
    const { mandatory, retake } = aiCandidates();
    const upperReq = (c) => m.requirements.find((r) => r.code === c)?.upper;
    ai.wanted = new Set([...mandatory, ...retake].filter((c) => (m.sectionsByCode.get(c) || []).length && !upperReq(c) && !m.blockedBy(c).length));
    for (const p of app.state.picks) { const c = m.sections.get(p.id).code; if (upperReq(c)) ai.wanted.add(c); }
    // Şu an seçili seçmeliler de başlangıçta işaretli gelsin
    for (const p of app.state.picks) { const c = m.sections.get(p.id).code; if (p.slot) ai.wanted.add(c); }
    ai.staj = !!app.state.listChoices.STAJ;
    const unvSlot = unvSlotName(m);
    ai.unv = unvSlot ? app.state.listChoices[unvSlot] || '' : '';
    ai.results = null;
    renderAIStep1();
    $('aiDlg').showModal();
  }

  function aiOpt(code, opts) {
    let { locked, disabled, on } = opts;
    const m = app.model;
    const n = m.termSections(code).length || (m.sectionsByCode.get(code) || []).length;
    const pre = m.blockedBy(code);
    if (pre.length) { disabled = true; locked = false; on = false; }
    const sub = pre.length ? t('req.prereq', { list: pre.join(', ') }) : !n ? t('ai.notOffered') : locked ? t('ai.locked') : t('ai.sections', { n });
    return `<label class="ai-opt ${on ? 'on' : ''} ${locked ? 'lock' : ''} ${disabled ? 'dis' : ''}" style="--c:${colorOf(code)}">
      <input type="checkbox" data-ai="${esc(code)}" ${on ? 'checked' : ''} ${locked || disabled ? 'disabled' : ''}>
      <span class="nm"><b>${esc(code)}</b><span>${esc(name(code))}</span></span><span class="tag">${esc(sub)}</span></label>`;
  }

  function renderAIStep1() {
    const m = app.model;
    const { mandatory, retake, electives } = aiCandidates();
    const slots = abSlots();
    const chosenEl = electives.filter((c) => ai.wanted.has(c));
    const full = chosenEl.length >= slots.length || (chosenEl.length && !assignElectives(m, chosenEl));
    $('aiTitle').textContent = t('ai.step1');
    $('aiSub').textContent = t('ai.step1Sub');
    let html = '';
    if (mandatory.length) {
      html += `<div class="ai-group"><h3>${esc(t('ai.gMandatory'))}</h3><div class="ai-opts">${mandatory.map((c) => {
        const n = (m.sectionsByCode.get(c) || []).length;
        return aiOpt(c, { locked: isLocked(c), disabled: !n, on: ai.wanted.has(c) });
      }).join('')}</div></div>`;
    }
    if (retake.length) {
      html += `<div class="ai-group"><h3>${esc(t('ai.gRetake'))}</h3><div class="ai-opts">${retake.map((c) => aiOpt(c, { locked: true, disabled: !(m.sectionsByCode.get(c) || []).length, on: ai.wanted.has(c) })).join('')}</div></div>`;
    }
    if (slots.length) {
      const slotNames = slots.map((s) => slotName(s.slot)).join(', ');
      html += `<div class="ai-group"><h3>${esc(t('ai.gElective'))} <span>${esc(t('ai.slotsLeft', { used: chosenEl.length, all: slots.length }))}</span></h3>
        <p class="muted small" style="margin:-4px 0 8px">${esc(slotNames)}</p>
        <div class="ai-opts">${electives.map((c) => {
          const on = ai.wanted.has(c);
          const canAdd = !on && assignElectives(m, [...chosenEl, c]);
          return aiOpt(c, { locked: false, disabled: !on && !canAdd, on });
        }).join('')}</div>${full ? `<p class="ai-note">${esc(t('ai.slotsFull'))}</p>` : ''}</div>`;
    }
    const staj = m.electiveSlots.find((s) => s.slotType === 'STAJ');
    const unvSlot = m.electiveSlots.find((s) => s.slotType === 'UNV');
    if (staj || unvSlot) {
      html += `<div class="ai-group"><h3>${esc(t('ai.gOther'))}</h3><div class="ai-other">`;
      if (staj) html += `<label class="ai-opt ${ai.staj ? 'on' : ''}"><input type="checkbox" id="aiStaj" ${ai.staj ? 'checked' : ''}><span class="nm"><b>${esc(t('ai.staj'))}</b><span>${esc(staj.options[0])} ${esc(name(staj.options[0]))}</span></span><span class="tag">${staj.ects} ${esc(t('sel.ects'))}</span></label>`;
      if (unvSlot) html += `<label class="ai-opt" style="cursor:default"><span class="nm"><b>${esc(t('ai.unv'))}</b><select id="aiUnv"><option value="">${esc(t('ai.unvNone'))}</option>${unvSlot.options.map((c) => `<option value="${esc(c)}" ${ai.unv === c ? 'selected' : ''}>${esc(c)} ${esc(name(c))}</option>`).join('')}</select></span></label>`;
      html += '</div></div>';
    }
    $('aiBody').innerHTML = html;
    $('aiActions').innerHTML = `<button class="btn claude" type="button" id="aiGo"><svg><use href="#i-spark"/></svg>${esc(t('ai.generate'))}</button>`;
  }

  function miniGrid(sectionIds) {
    const m = app.model;
    const cells = new Map();
    let maxH = 16;
    for (const id of sectionIds) {
      const s = m.sections.get(id);
      for (const sl of s.slots) { const h = parseInt(sl.start, 10); maxH = Math.max(maxH, h); cells.set(sl.day + '|' + h, colorOf(s.code)); }
    }
    let html = '<div class="mini"><span></span>' + daysShort().map((d) => `<span class="d">${d}</span>`).join('');
    for (let h = 8; h <= maxH; h++) {
      html += `<span class="h">${h === 8 || h % 2 === 0 ? String(h).padStart(2, '0') : ''}</span>`;
      for (let d = 0; d < 7; d++) { const c = cells.get(d + '|' + h); html += `<span class="c"${c ? ` style="background:${c}"` : ''}></span>`; }
    }
    return html + '</div>';
  }

  function renderAIStep2() {
    const r = ai.results;
    const m = app.model;
    $('aiActions').innerHTML = `<button class="btn soft" type="button" id="aiBack">${esc(t('ai.back'))}</button>`;
    if (!r.programs.length) {
      $('aiTitle').textContent = t('ai.none');
      $('aiSub').textContent = '';
      $('aiBody').innerHTML = `<div class="ai-empty"><b>${esc(t('ai.none'))}</b>${r.blockers && r.blockers.length ? esc(t('ai.blockers', { list: r.blockers.map((c) => `${c} ${name(c)}`).join(', ') })) : ''}</div>`;
      return;
    }
    $('aiTitle').textContent = t('ai.step2', { n: r.programs.length });
    $('aiSub').textContent = t('ai.step2Sub', { combos: r.programs.length });
    const minDays = Math.min(...r.programs.map((p) => p.days));
    const daysVary = r.programs.some((p) => p.days !== minDays);
    const gapsVary = r.programs.some((p) => p.gaps) && r.programs.some((p) => !p.gaps);
    const list = r.programs.slice(0, ai.shown);
    let html = '<div class="ai-progs">' + list.map((p, i) => {
      const badges = [];
      if (i === 0) badges.push(`<span class="bd">${esc(t('ai.best'))}</span>`);
      if (daysVary && p.days === minDays && i !== 0) badges.push(`<span class="bd v">${esc(t('ai.fewestDays'))}</span>`);
      if (gapsVary && !p.gaps && i !== 0) badges.push(`<span class="bd v">${esc(t('ai.noGap'))}</span>`);
      const secs = p.sections.map((id) => m.sections.get(id));
      return `<div class="prog" role="button" tabindex="0" data-prog="${i}">
        <div class="ph"><b>${esc(t('ai.program', { n: i + 1 }))}</b><div class="badges">${badges.join('')}</div></div>
        <div class="stats"><span>${esc(t('ai.days', { n: p.days }))}</span><span>${esc(p.gaps ? t('ai.gaps', { n: p.gaps }) : t('ai.noGaps'))}</span><span>${esc(p.weekend ? t('ai.weekend') : t('ai.noWeekend'))}</span>${p.early ? `<span>${esc(t('ai.early', { n: p.early }))}</span>` : ''}</div>
        ${miniGrid(p.sections)}
        <div class="list">${secs.map((s) => `<span style="--c:${colorOf(s.code)}">${esc(s.code)} · ${esc(t('grid.section', { n: s.section }))}</span>`).join('')}</div>
        <button class="btn claude go" type="button" data-prog="${i}">${esc(t('ai.apply'))}</button></div>`;
    }).join('') + '</div>';
    if (r.programs.length > ai.shown) html += `<div style="text-align:center;margin:12px 0"><button class="btn soft" type="button" id="aiMore">${esc(t('ai.more', { n: Math.min(12, r.programs.length - ai.shown) }))}</button></div>`;
    $('aiBody').innerHTML = html;
  }

  function runAI() {
    const wanted = [...ai.wanted];
    if (!wanted.length && !ai.staj && !ai.unv) { toast(t('ai.pickOne')); return; }
    $('aiBody').innerHTML = `<div class="ai-empty">${esc(t('ai.thinking'))}</div>`;
    setTimeout(() => {
      ai.results = suggestPrograms(app.model, wanted);
      ai.shown = 12;
      renderAIStep2();
      $('aiBody').scrollTop = 0;
    }, 350);
  }

  function applyProgram(i) {
    const m = app.model;
    const p = ai.results.programs[i];
    const listChoices = {};
    const staj = m.electiveSlots.find((s) => s.slotType === 'STAJ');
    if (staj && ai.staj) listChoices[staj.slot] = staj.options[0];
    const unv = unvSlotName(m);
    if (unv && ai.unv) listChoices[unv] = ai.unv;
    app.state = { picks: p.picks.map((x) => ({ ...x })), listChoices };
    $('aiDlg').close();
    render();
    toast(t('ai.applied', { p: t('ai.program', { n: i + 1 }) }));
    document.querySelector('.grid-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function bindAI() {
    $('aiBtn').addEventListener('click', openAI);
    $('aiClose').addEventListener('click', () => $('aiDlg').close());
    $('aiDlg').addEventListener('change', (e) => {
      const cb = e.target.closest('input[data-ai]');
      if (cb) { if (cb.checked) ai.wanted.add(cb.dataset.ai); else ai.wanted.delete(cb.dataset.ai); renderAIStep1(); return; }
      if (e.target.id === 'aiStaj') { ai.staj = e.target.checked; renderAIStep1(); return; }
      if (e.target.id === 'aiUnv') { ai.unv = e.target.value; }
    });
    $('aiDlg').addEventListener('click', (e) => {
      if (e.target.closest('#aiGo')) { runAI(); return; }
      if (e.target.closest('#aiBack')) { renderAIStep1(); return; }
      if (e.target.closest('#aiMore')) { ai.shown += 12; renderAIStep2(); return; }
      const pr = e.target.closest('[data-prog]');
      if (pr) applyProgram(parseInt(pr.dataset.prog, 10));
    });
    $('aiDlg').addEventListener('keydown', (e) => {
      const pr = e.target.closest && e.target.closest('.prog');
      if (pr && e.target === pr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); applyProgram(parseInt(pr.dataset.prog, 10)); }
    });
  }

  // ---------- Danışman onayı ve bildirimler ----------
  function snapshot() {
    const m = app.model;
    const ev = app.evalr;
    const items = [];
    const slotNames = (slot) => { const r = m.electiveSlots.find((x) => x.slot === slot); return r ? { tr: r.name, en: r.nameEn } : null; };
    for (const req of m.requirements) {
      if (req.kind === 'slot') {
        const code = ev.fill[req.slot];
        if (!code) continue;
        const pick = app.state.picks.find((p) => p.slot === req.slot);
        const sec = pick ? m.sections.get(pick.id) : null;
        const unv = m.unvCourses.get(code);
        items.push({ code, section: sec ? sec.section : null, kind: 'slot', slot: slotNames(req.slot), ects: req.ects, color: reqColor(req), slots: sec ? sec.slots : unv ? unv.slots : [], online: !!unv });
      } else {
        const s = (m.sectionsByCode.get(req.code) || []).find((x) => m.fixedIds.has(x.id) || app.state.picks.some((p) => p.id === x.id));
        if (!s) continue;
        items.push({ code: req.code, section: s.section, kind: req.dir === 'lower' ? 'retake' : req.dir === 'upper' ? 'upper' : req.kind, ects: req.ects, color: reqColor(req), slots: s.slots, online: false });
      }
    }
    for (const code of extraCodes(m, app.state)) {
      const s = m.sections.get(app.state.picks.find((p) => m.sections.get(p.id).code === code).id);
      items.push({ code, section: s.section, kind: 'extra', ects: m.courses.get(code)?.ects ?? 0, color: COLORS.none, slots: s.slots, online: false });
    }
    return { term: app.term, semester: m.semester, items, ects: ev.ects, date: new Date() };
  }

  function submitForApproval() {
    app.advisor = 'sent';
    app.approved = null;
    renderTop();
    const snap = snapshot();
    setTimeout(() => {
      app.advisor = 'approved';
      app.approved = snap;
      app.notes.unshift({ term: snap.term, date: new Date() });
      app.unread++;
      renderTop();
      showNotice();
      if (app.view === 'tt') renderTT();
    }, 2200);
  }

  function showNotice() {
    const n = $('notice');
    n.innerHTML = `<span class="ic">${CHECK}</span><div><b>${esc(t('n.title'))}</b><p>${esc(t('n.approved', { term: t('term.' + app.approved.term) }))}</p><button class="link" type="button" data-goto="tt">${esc(t('n.view'))}</button></div>`;
    n.classList.add('on');
    clearTimeout(showNotice.tm);
    showNotice.tm = setTimeout(() => n.classList.remove('on'), 7000);
  }

  function renderBell() {
    const pop = $('bellPop');
    pop.innerHTML = `<div class="np-h">${esc(t('top.news'))}</div>` + (app.notes.length
      ? app.notes.map((x) => `<div class="np-item" data-goto="tt"><span class="ic">${CHECK}</span><div><b>${esc(t('n.title'))}</b><p>${esc(t('n.approved', { term: t('term.' + x.term) }))}</p><small>${esc(t('n.now'))}</small></div></div>`).join('')
      : `<div class="np-e">${esc(t('n.empty'))}</div>`);
  }

  // ---------- Sayfalar ----------
  function setView(v) {
    app.view = v;
    $('viewReg').classList.toggle('view-hidden', v !== 'reg');
    $('viewTT').classList.toggle('view-hidden', v !== 'tt');
    document.querySelectorAll('.side-nav [data-view]').forEach((a) => a.classList.toggle('active', a.dataset.view === v));
    document.querySelector('.ai-card')?.classList.toggle('view-hidden', v !== 'reg');
    if (v === 'tt') renderTT();
    window.scrollTo({ top: 0 });
  }

  function renderTT() {
    const a = app.approved;
    $('ttTermLabel').textContent = t('term.' + (a ? a.term : app.term));
    if (!a) {
      $('ttBody').innerHTML = `<div class="tt-empty"><b>${esc(t('tt.emptyT'))}</b><p>${esc(t(app.advisor === 'sent' ? 'stat.sent' : 'tt.empty'))}</p><button class="btn primary" type="button" data-goto="reg">${esc(t('tt.goReg'))}</button></div>`;
      return;
    }
    const loc = app.lang === 'tr' ? 'tr-TR' : 'en-GB';
    const date = a.date.toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' }) + ' ' + a.date.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
    // Haftalık tablo
    const cells = new Map();
    let maxH = 16;
    for (const it of a.items) for (const sl of it.slots) {
      const h = parseInt(sl.start, 10); maxH = Math.max(maxH, h);
      const k = sl.day + '|' + sl.start;
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push({ it, sl });
    }
    let grid = '<table class="grid tt-grid"><thead><tr><th class="time"></th>' + days().map((d) => `<th>${d}</th>`).join('') + '</tr></thead><tbody>';
    for (let h = 8; h <= maxH; h++) {
      const st = `${String(h).padStart(2, '0')}:40`;
      grid += `<tr class="${h >= 17 ? 'evening' : ''} ${h === 17 ? 'evening-first' : ''}"><th class="time"><b>${st}</b>${String(h + 1).padStart(2, '0')}:30</th>`;
      for (let d = 0; d < 7; d++) {
        grid += '<td>' + (cells.get(d + '|' + st) || []).map(({ it, sl }) => `<div class="tt-chip" style="--c:${it.color}"><b>${esc(it.code)}</b><div class="nm">${esc(name(it.code))}</div><div class="rm">${[it.section ? t('grid.section', { n: it.section }) : '', it.online ? t('grid.online') : sl.room || '', sl.type === 'U' ? t('grid.lab') : ''].filter(Boolean).map(esc).join(' · ')}</div></div>`).join('') + '</td>';
      }
      grid += '</tr>';
    }
    grid += '</tbody></table>';
    // Ders listesi
    const typeOf = (it) => (it.kind === 'slot' ? it.slot[app.lang] : t(it.kind === 'retake' ? 'type.retake' : it.kind === 'extra' ? 'type.extra' : it.kind === 'upper' ? 'type.upper' : 'type.mandatory'));
    const hrs = (it) => (it.slots.length ? it.slots.map((x) => `${daysShort()[x.day]} ${x.start}`).join(', ') : t('tt.noHours'));
    const rows = a.items.map((it) => `<tr><td>${it.section || '-'}</td><td><span class="sw" style="--c:${it.color}"></span><b>${esc(it.code)}</b></td><td>${esc(name(it.code))}</td><td>${esc(typeOf(it))}</td><td class="muted small">${esc(hrs(it))}</td><td class="num">${it.ects}</td></tr>`).join('');
    $('ttBody').innerHTML = `
      <div class="tt-meta"><span class="ok-pill">${CHECK}${esc(t('stat.approved'))}</span><span class="k">${esc(t('tt.approvedOn', { date }))}</span><span class="k">${esc(t('stat.semValue', { year: app.profile.year, sem: a.semester }))}</span></div>
      <section class="card flush"><div class="card-head pad"><h2>${esc(t('tt.week'))}</h2></div><div class="grid-wrap">${grid}</div></section>
      <section class="card flush"><div class="card-head pad"><h2>${esc(t('tt.courses'))}</h2><span class="count">${a.ects} ${esc(t('sel.ects'))}</span></div>
        <div class="table-wrap"><table class="sel-table"><thead><tr><th>${t('sel.sec')}</th><th>${t('sel.code')}</th><th>${t('sel.name')}</th><th>${t('sel.type')}</th><th>${t('tt.hours')}</th><th class="num">${t('sel.ects')}</th></tr></thead><tbody>${rows}</tbody>
        <tfoot><tr><td colspan="5">${esc(t('sel.total'))}</td><td class="num">${a.ects}</td></tr></tfoot></table></div></section>`;
  }

  function bindExtra() {
    document.addEventListener('click', (e) => {
      const nav = e.target.closest('.side-nav [data-view]');
      if (nav) { e.preventDefault(); setView(nav.dataset.view); return; }
      const go = e.target.closest('[data-goto]');
      if (go) {
        $('bellPop').hidden = true;
        $('notice').classList.remove('on');
        if ($('finishDlg').open) $('finishDlg').close();
        setView(go.dataset.goto);
        return;
      }
      if (e.target.closest('#bellBtn')) {
        const pop = $('bellPop');
        pop.hidden = !pop.hidden;
        if (!pop.hidden) { renderBell(); app.unread = 0; renderTop(); }
        return;
      }
      if (!e.target.closest('#bellPop')) $('bellPop').hidden = true;
    });
  }

  bind();
  bindAI();
  bindExtra();
  applyStatic();
  rebuild();
})();
