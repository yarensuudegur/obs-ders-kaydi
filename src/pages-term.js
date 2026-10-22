// Ders ve Dönem İşlemleri sayfaları: Ders Ekle/Bırak, Dönem Ortalamaları, Not Listesi, Transkript, Transkript Senaryosu, Diğer Belgeler, Müfredat Durum
(function () {
  const { app, t, esc, $, toast } = OBS;
  const D = () => OBS.data();
  const MUF = () => OBS.getData().MUF;
  const head = (...a) => OBS.pageHead(...a);
  const empty = (...a) => OBS.pageEmpty(...a);
  const icon = (n) => `<svg><use href="#i-${n}"/></svg>`;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const course = (code) => { const m = MUF(); return m ? m.courses.find((c) => c.code === code) : null; };
  const scaleNow = () => OBS.scale();
  const letters = () => {
    const tr = D().transcript && D().transcript.data;
    const sample = tr && tr.terms[0] && tr.terms[0].courses[0] ? tr.terms[0].courses[0].letter : 'B';
    return ACAD.lettersFor(scaleNow(), sample);
  };
  const shortTerm = (name) => { const m = String(name).match(/(\d{2})(\d{2})-\d{2}(\d{2})\s*(\S)/); return m ? `[${m[2]}-${m[3]}${m[4].toUpperCase() === 'G' ? 'G' : m[4].toUpperCase() === 'B' ? 'B' : 'Y'}]` : name; };
  const ui = { adQ: '', adLocked: false, target: 'B', onlyMissing: false, planShown: false, expect: 'B' };

  // Geçici olarak başka bir seçim durumuyla çalış (ekle-bırak)
  function withState(state, fn) {
    const s0 = app.state, e0 = app.evalr;
    app.state = state;
    app.evalr = evaluate(app.model, state);
    try { return fn(); } finally { app.state = s0; app.evalr = e0; }
  }

  // ---------- Ders Ekle/Bırak ----------
  const AD = { base: null, state: null, key: null };
  function ensureAD() {
    const a = app.approved;
    if (AD.key !== a.date) { AD.base = clone(a.state || emptyState()); AD.state = clone(a.state || emptyState()); AD.key = a.date; }
  }
  // Seçmeli hakları dolu olsa da ders "ek ders" olarak eklenebilir mi (çakışma yok, kontenjan var)
  function extraOk(s) {
    const m = app.model;
    if (isFull(s)) return false;
    const taken = [...m.fixedIds, ...AD.state.picks.map((p) => p.id)].map((id) => m.sections.get(id)).filter(Boolean);
    return !taken.some((o) => o.code === s.code || overlaps(o, s).length);
  }
  OBS.views.adddrop = {
    title: 'side.adddrop',
    needs: ['curriculum', 'timetable', 'calendar'],
    render() {
      if (!app.approved) return head('side.adddrop') + empty(t('ad.noRegT'), t('ad.noReg'), `<button class="btn primary" type="button" data-goto="reg">${esc(t('tt.goReg'))}</button>`);
      if (!app.model) return head('side.adddrop');
      ensureAD();
      const open = OBS.periodOpen('adddrop');
      const pending = app.advisor === 'sent';
      const m = app.model;
      const out = withState(AD.state, () => ({ rows: OBS.selectedRows().rows, ev: app.evalr }));
      const baseEcts = withState(AD.base, () => app.evalr.ects);
      const baseIds = new Set(AD.base.picks.map((p) => p.id));
      const curIds = new Set(AD.state.picks.map((p) => p.id));
      const added = AD.state.picks.filter((p) => !baseIds.has(p.id));
      const dropped = AD.base.picks.filter((p) => !curIds.has(p.id));
      const listAdded = Object.entries(AD.state.listChoices).filter(([k, v]) => AD.base.listChoices[k] !== v);
      const listDropped = Object.entries(AD.base.listChoices).filter(([k, v]) => AD.state.listChoices[k] !== v);
      const changes = added.length + dropped.length + listAdded.length + listDropped.length + AD.state.picks.filter((p) => baseIds.has(p.id) && (AD.base.picks.find((b) => b.id === p.id) || {}).slot !== p.slot).length;
      const lim = OBS.ectsLimit();
      const ects = out.ev.ects;
      const dis = !open || pending ? 'disabled' : '';
      const slotOpts = (pick) => {
        const role = m.roles.get(m.sections.get(pick.id).code);
        if (!role || role.kind !== 'elective') return '';
        const fill = withState(AD.state, () => app.evalr.fill);
        const opts = role.slots.map((s) => `<option value="${s}" ${pick.slot === s ? 'selected' : ''} ${fill[s] && fill[s] !== m.sections.get(pick.id).code ? 'disabled' : ''}>${esc(t('ad.countAs', { slot: (m.electiveSlots.find((x) => x.slot === s) || {})[app.lang === 'en' ? 'nameEn' : 'name'] || s }))}</option>`).join('');
        return `<select data-adslot="${esc(pick.id)}" ${dis} aria-label="${esc(t('ad.recount'))}">${opts}<option value="" ${!pick.slot ? 'selected' : ''}>${esc(t('ad.asExtra'))}</option></select>`;
      };
      const rows = out.rows.map((r) => {
        const pick = r.removeId ? AD.state.picks.find((p) => p.id === r.removeId) : null;
        const isNew = pick && !baseIds.has(pick.id);
        const action = r.fixed ? `<span class="muted small" title="${esc(t('ad.fixedTip'))}">${icon('x')} ${esc(t('ad.fixed'))}</span>`
          : r.removeId ? `<button class="rm" type="button" data-addrop="${esc(r.removeId)}" ${dis}>${esc(t('ad.drop'))}</button>`
          : `<button class="rm" type="button" data-adslotrm="${esc(r.removeSlot)}" ${dis}>${esc(t('ad.drop'))}</button>`;
        return `<tr class="${isNew ? 'new' : ''}"><td>${r.sec}</td><td><span class="sw" style="--c:${r.color}"></span><b>${esc(r.code)}</b>${isNew ? ` <span class="kpill k-new">${esc(t('ad.new'))}</span>` : ''}</td><td>${esc(r.name)}</td><td>${pick ? slotOpts(pick) || esc(r.type) : esc(r.type)}</td><td class="num">${r.ects}</td><td class="num">${action}</td></tr>`;
      }).join('');
      const droppedRows = [...dropped.map((p) => { const s = m.sections.get(p.id); return { key: p.id, code: s.code, sec: s.section, undo: `data-adundo="${esc(p.id)}"` }; }), ...listDropped.map(([k, v]) => ({ key: k, code: v, sec: '-', undo: `data-adundolist="${esc(k)}"` }))]
        .map((x) => `<tr class="dropped"><td>${x.sec}</td><td><b>${esc(x.code)}</b> <span class="kpill k-drop">${esc(t('ad.dropped'))}</span></td><td>${esc(OBS.name(x.code))}</td><td></td><td></td><td class="num"><button class="rm" type="button" ${x.undo} ${dis}>${esc(t('ad.undo'))}</button></td></tr>`).join('');
      // Eklenebilecek şubeler
      const q = ui.adQ.toLocaleLowerCase('tr');
      const selectedCodes = new Set(out.rows.map((r) => r.code));
      const groups = new Map();
      for (const s of m.sections.values()) {
        if (s.term !== app.term || selectedCodes.has(s.code)) continue;
        const st = out.ev.status.get(s.id);
        if (!st || st.state === 'passed') continue;
        if (!ui.adLocked && st.state !== 'free' && !(st.state === 'slot-full' && extraOk(s))) continue;
        if (q && !s.code.toLocaleLowerCase('tr').includes(q) && !OBS.name(s.code).toLocaleLowerCase('tr').includes(q)) continue;
        if (!groups.has(s.code)) groups.set(s.code, []);
        groups.get(s.code).push({ s, st });
      }
      const addBtn = (s, st) => {
        if (st.state === 'free') return `<button class="btn small primary" type="button" data-adadd="${esc(s.id)}" ${dis}>${icon('plus')}${esc(t('ad.add'))}</button>`;
        if (st.state === 'slot-full' && extraOk(s)) return `<button class="btn small soft" type="button" data-adextra="${esc(s.id)}" ${dis} title="${esc(reasonOf(s.id, st))}">${icon('plus')}${esc(t('ad.addExtra'))}</button>`;
        return `<span class="lock-why">${esc(reasonOf(s.id, st))}</span>`;
      };
      const reasonOf = (id, st) => withState(AD.state, () => (OBS.reasonText ? OBS.reasonText(id, st) : st.reason));
      const addList = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([code, list]) => {
        const role = m.roles.get(code);
        const kind = !role ? t('type.extra') : role.kind === 'elective' ? t('ad.elective') : role.kind === 'retake' ? t('type.retake') : t('type.mandatory');
        return `<div class="add-course"><div class="ac-h"><span class="sw" style="--c:${OBS.colorOf(code)}"></span><b>${esc(code)}</b><span>${esc(OBS.name(code))}</span><span class="pill">${esc(kind)}</span><span class="muted small">${(course(code) || {}).ects ?? '-'} ${esc(t('sel.ects'))}</span></div>
          ${list.sort((a, b) => a.s.section - b.s.section).map(({ s, st }) => `<div class="ac-sec ${st.state}"><b>${esc(t('grid.section', { n: s.section }))}</b><span>${esc(OBS.fmtSlots(s.slots))}</span>
            <span class="q-txt ${st.state === 'full' ? 'full' : ''}">${s.quota != null ? esc(t('ad.quota', { e: s.enrolled, q: s.quota })) : ''}</span>
            ${addBtn(s, st)}</div>`).join('')}</div>`;
      }).join('');
      return head('side.adddrop', t('ad.lead', { term: t('term.' + app.term) })) + OBS.periodNote('adddrop') +
        (pending ? `<div class="cal-note warn">${icon('hourglass')}<span>${esc(t('ad.pending'))}</span></div>` : '') +
        `<section class="status-row">
          <div class="stat"><span class="k">${esc(t('ad.before'))}</span><span class="v">${baseEcts} ${esc(t('sel.ects'))}</span></div>
          <div class="stat ects ${ects > lim ? 'over' : ''}"><div class="top-line"><span class="k">${esc(t('ad.after'))}</span><span class="big">${ects} / ${lim}</span></div><div class="bar"><i style="width:${Math.min(100, (ects / lim) * 100)}%"></i></div></div>
          <div class="stat"><span class="k">${esc(t('ad.changes'))}</span><span class="v">${changes}</span></div>
          <div class="stat ad-btns"><button class="btn soft" type="button" data-adreset ${changes ? '' : 'disabled'}>${icon('reset')}${esc(t('ad.reset'))}</button><button class="btn primary" type="button" data-adsend ${changes && open && !pending && ects <= lim ? '' : 'disabled'}>${esc(t('ad.send'))}</button></div>
        </section>
        <section class="card flush"><div class="card-head pad"><h2>${esc(t('ad.current'))}</h2><span class="muted small">${esc(t('ad.currentHint'))}</span></div>
          <div class="table-wrap"><table class="sel-table"><thead><tr><th>${t('sel.sec')}</th><th>${t('sel.code')}</th><th>${t('sel.name')}</th><th>${t('sel.type')}</th><th class="num">${t('sel.ects')}</th><th></th></tr></thead><tbody>${rows}${droppedRows}</tbody></table></div></section>
        <section class="card"><div class="card-head"><h2>${esc(t('ad.addT'))}</h2><label class="chk small"><input type="checkbox" data-adlocked ${ui.adLocked ? 'checked' : ''}> ${esc(t('ad.showLocked'))}</label></div>
          <input id="adQ" type="search" class="search-in" value="${esc(ui.adQ)}" placeholder="${esc(t('off.searchPh'))}">
          <div class="add-list">${addList || `<p class="muted">${esc(t('ad.noneFree'))}</p>`}</div></section>`;
    },
  };

  // ---------- Dönem Ortalamaları ----------
  function bars(values, labels, color) {
    const W = 560, H = 290, l = 40, b = 70, top = 14;
    const cw = (W - l - 10) / Math.max(1, values.length);
    const y = (v) => top + (H - top - b) * (1 - v / 4);
    let g = '';
    for (let v = 0; v <= 4.0001; v += 0.4) g += `<line x1="${l}" x2="${W - 6}" y1="${y(v)}" y2="${y(v)}" class="gl"/><text x="${l - 6}" y="${y(v) + 4}" class="ax" text-anchor="end">${v.toFixed(2)}</text>`;
    values.forEach((v, i) => {
      const x = l + i * cw + cw * 0.2, w = cw * 0.6;
      if (v != null) g += `<rect x="${x}" y="${y(v)}" width="${w}" height="${y(0) - y(v)}" rx="4" fill="${color(i)}"/><text x="${x + w / 2}" y="${Math.max(y(v) + 16, top + 12)}" class="bv" text-anchor="middle">${OBS.fmtGpa(v)}</text>`;
      g += `<text transform="translate(${x + w / 2},${H - b + 14}) rotate(-35)" class="ax" text-anchor="end">${esc(labels[i])}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" class="barchart" role="img">${g}</svg>`;
  }
  OBS.views.averages = {
    title: 'side.averages',
    needs: ['transcript'],
    render() {
      const tr = D().transcript.data;
      const st = ACAD.termStats(tr, { scale: scaleNow(), eq: OBS.eq() });
      const rows = st.rows.map((r) => ({ ...r, label: ACAD.termLabel(r, app.lang) }));
      const a = app.approved;
      if (a) {
        const credit = a.items.reduce((s, it) => s + ((course(it.code) || {}).credit || 0), 0);
        rows.push({ label: t('term.' + a.term), count: a.items.length, credit, ects: a.ects, passedCredit: 0, passedEcts: 0, ano: null, agno: st.totals.agno, current: true });
      }
      const col = (i) => OBS.PALETTE[i % OBS.PALETTE.length] + 'bb';
      const totCredit = st.totals.credit + (a ? rows[rows.length - 1].credit : 0);
      const totEcts = st.totals.ects + (a ? a.ects : 0);
      return head('side.averages', t('avg.lead', { gpa: OBS.fmtGpa(st.totals.agno) })) +
        `<section class="card flush"><div class="table-wrap"><table class="sel-table avg-table"><thead><tr><th>${esc(t('avg.term'))}</th><th class="num">${esc(t('avg.count'))}</th><th class="num">${esc(t('avg.credit'))}</th><th class="num">${esc(t('avg.ects'))}</th><th class="num">${esc(t('avg.pCredit'))}</th><th class="num">${esc(t('avg.pEcts'))}</th><th class="num">${esc(t('avg.ano'))}</th><th class="num">${esc(t('avg.agno'))}</th></tr></thead><tbody>
          ${rows.map((r) => `<tr class="${r.current ? 'cur' : ''}"><td>${esc(r.label)}${r.current ? ` <span class="kpill k-new">${esc(t('avg.ongoing'))}</span>` : ''}</td><td class="num">${r.count}</td><td class="num">${r.credit}</td><td class="num">${r.ects}</td><td class="num">${r.passedCredit}</td><td class="num">${r.passedEcts}</td><td class="num">${r.ano == null ? '0,00' : OBS.fmtGpa(r.ano)}</td><td class="num"><b>${OBS.fmtGpa(r.agno)}</b></td></tr>`).join('')}
          </tbody></table></div>
          <div class="info-box">${icon('info')}<div><div>${esc(t('avg.i1', { n: totCredit }))}</div><div>${esc(t('avg.i2', { n: totEcts }))}</div><div>${esc(t('avg.i3', { n: st.totals.passedCredit }))}</div><div>${esc(t('avg.i4', { n: st.totals.passedEcts }))}</div></div></div></section>
        <div class="two-col">
          <section class="card"><h2>${esc(t('avg.chartAno'))}</h2>${bars(st.rows.map((r) => r.ano), st.rows.map((r) => ACAD.termLabel(r, app.lang)), col)}</section>
          <section class="card"><h2>${esc(t('avg.chartAgno'))}</h2>${bars(st.rows.map((r) => r.agno), st.rows.map((r) => ACAD.termLabel(r, app.lang)), col)}</section>
        </div>`;
    },
  };

  // ---------- Not Listesi (öğrencinin kendi girdiği notlarla hesaplayıcı) ----------
  const defComps = () => [{ n: t('gb.mid'), w: 40, s: '' }, { n: t('gb.final'), w: 60, s: '' }];
  function gbCalc(comps, target) {
    const num = (v) => (v === '' || v == null || isNaN(+v) ? null : +v);
    let fw = 0, fs = 0, rw = 0, tw = 0;
    for (const c of comps) { const w = num(c.w) || 0; tw += w; const s = num(c.s); if (s == null) rw += w; else { fw += w; fs += (w * s) / 100; } }
    const cur = fw ? (fs / fw) * 100 : null;
    const need = rw ? ((target - fs) / rw) * 100 : null;
    return { cur, need, tw, rw, total: fs };
  }
  OBS.views.gradebook = {
    title: 'side.grades',
    render() {
      const a = app.approved;
      if (!a) return head('side.grades') + empty(t('tt.emptyT'), t('gb.noReg'), `<button class="btn primary" type="button" data-goto="reg">${esc(t('tt.goReg'))}</button>`);
      const gb = (app.gradebook = app.gradebook || {});
      const target = gb._target ?? 50;
      const items = a.items.filter((it) => it.slots.length || it.online);
      return head('side.grades', t('gb.lead')) +
        `<section class="card filters"><div class="f-group"><label class="f-label" for="gbTarget">${esc(t('gb.target'))}</label><input id="gbTarget" type="number" min="0" max="100" value="${target}" data-gbtarget></div><p class="muted small grow">${esc(t('gb.note'))}</p></section>
        <div class="gb-grid">${items.map((it) => {
          const comps = (gb[it.code] && gb[it.code].comps) || defComps();
          return `<section class="card gb-card" style="--c:${it.color}"><div class="gb-h"><b>${esc(it.code)}</b><span>${esc(OBS.name(it.code))}</span></div>
            <table class="gb-t"><thead><tr><th>${esc(t('gb.comp'))}</th><th class="num">${esc(t('gb.w'))}</th><th class="num">${esc(t('gb.score'))}</th><th></th></tr></thead><tbody>
            ${comps.map((c, i) => `<tr><td><input id="gb-${esc(it.code)}-${i}-n" data-gb="${esc(it.code)}" data-i="${i}" data-f="n" value="${esc(c.n)}"></td><td class="num"><input id="gb-${esc(it.code)}-${i}-w" type="number" min="0" max="100" data-gb="${esc(it.code)}" data-i="${i}" data-f="w" value="${esc(c.w)}"></td><td class="num"><input id="gb-${esc(it.code)}-${i}-s" type="number" min="0" max="100" data-gb="${esc(it.code)}" data-i="${i}" data-f="s" value="${esc(c.s)}" placeholder="-"></td><td><button class="icon-btn small" type="button" data-gbrm="${esc(it.code)}" data-i="${i}" title="${esc(t('dc.remove'))}">${icon('x')}</button></td></tr>`).join('')}
            </tbody></table>
            <div class="gb-foot"><button class="btn small ghost" type="button" data-gbadd="${esc(it.code)}">${icon('plus')}${esc(t('gb.addComp'))}</button><div class="gb-res" data-gbres="${esc(it.code)}">${gbResHtml(it.code)}</div></div></section>`;
        }).join('')}</div>`;
    },
  };
  function gbSave() { OBS.saveState(); }
  // Sonuç satırı (yazarken sayfa yeniden çizilmeden güncellenir)
  function gbResHtml(code) {
    const gb = app.gradebook || {};
    const comps = (gb[code] && gb[code].comps) || defComps();
    const r = gbCalc(comps, gb._target ?? 50);
    let res;
    if (r.tw !== 100) res = `<span class="bad">${esc(t('gb.weights', { n: r.tw }))}</span>`;
    else if (r.need == null) res = `<span>${esc(t('gb.done', { n: r.total.toFixed(1) }))}</span>`;
    else if (r.need <= 0) res = `<span class="good">${esc(t('gb.reached'))}</span>`;
    else if (r.need > 100) res = `<span class="bad">${esc(t('gb.impossible', { n: Math.ceil(r.need) }))}</span>`;
    else res = `<span>${esc(t('gb.need', { n: Math.ceil(r.need) }))}</span>`;
    return `<span class="muted small">${esc(t('gb.cur'))}</span> <b>${r.cur == null ? '-' : r.cur.toFixed(1)}</b><br>${res}`;
  }
  const gbRefresh = () => document.querySelectorAll('[data-gbres]').forEach((el) => { el.innerHTML = gbResHtml(el.dataset.gbres); });

  // ---------- Transkript ----------
  function termTables(terms, editable) {
    const st = ACAD.termStats({ terms }, { scale: scaleNow(), eq: OBS.eq() });
    const L = letters();
    let cum = 0;
    return terms.map((term, ti) => {
      const s = st.rows[ti];
      cum += s.ects;
      const rows = term.courses.map((c, ci) => {
        const bad = !ACAD.isPass(c.letter);
        if (!editable) return `<tr class="${bad ? 'bad' : ''}"><td>${esc(c.code)}</td><td>${esc(OBS.name(c.code) !== c.code ? OBS.name(c.code) : OBS.titleCase(c.name || ''))}</td><td class="num">${c.credit ?? ''}</td><td class="num">${c.ects}</td><td class="num">${c.score ?? ''}</td><td class="num"><b>${esc(c.letter)}</b></td><td class="num">${esc(c.zs || '')}</td></tr>`;
        const opts = [...new Set([...L, c.letter, 'S'])].map((l) => `<option ${l === c.letter ? 'selected' : ''}>${l}</option>`).join('');
        const codeCell = c.isNew ? `<input class="sc-code" list="currCodes" data-sc="${ti}" data-ci="${ci}" data-f="code" value="${esc(c.code)}" placeholder="${esc(t('sc.codePh'))}">` : esc(c.code);
        const nameCell = c.isNew ? `<input data-sc="${ti}" data-ci="${ci}" data-f="name" value="${esc(c.name)}" placeholder="${esc(t('sel.name'))}">` : esc(OBS.name(c.code) !== c.code ? OBS.name(c.code) : OBS.titleCase(c.name || ''));
        const ectsCell = c.isNew ? `<input type="number" min="0" max="30" data-sc="${ti}" data-ci="${ci}" data-f="ects" value="${c.ects}">` : c.ects;
        return `<tr class="${bad ? 'bad' : ''} ${c.changed ? 'chg' : ''}"><td>${codeCell}</td><td>${nameCell}</td><td class="num">${ectsCell}</td><td class="num"><select data-sc="${ti}" data-ci="${ci}" data-f="letter">${opts}</select></td><td class="num"><button class="icon-btn small" type="button" data-scrm="${ti}" data-ci="${ci}" title="${esc(t('dc.remove'))}">${icon('x')}</button></td></tr>`;
      }).join('');
      const headRow = editable ? `<tr><th>${esc(t('sel.code'))}</th><th>${esc(t('sel.name'))}</th><th class="num">${esc(t('sel.ects'))}</th><th class="num">${esc(t('tr.letter'))}</th><th></th></tr>` : `<tr><th>${esc(t('sel.code'))}</th><th>${esc(t('sel.name'))}</th><th class="num">${esc(t('tr.credit'))}</th><th class="num">${esc(t('sel.ects'))}</th><th class="num">${esc(t('tr.score'))}</th><th class="num">${esc(t('tr.letter'))}</th><th class="num">Z/S</th></tr>`;
      return `<section class="card flush tr-term ${term.planned ? 'planned' : ''}"><div class="tr-h"><b>${esc(ACAD.termLabel(term, app.lang))}</b>${term.planned ? `<span class="kpill k-ai">${esc(t('sc.planned'))}</span>` : ''}${editable ? `<button class="btn small ghost" type="button" data-scadd="${ti}">${icon('plus')}${esc(t('sc.addCourse'))}</button>` : ''}</div>
        <div class="table-wrap"><table class="tr-t">${'<thead>' + headRow + '</thead>'}<tbody>${rows}</tbody></table></div>
        <div class="tr-f"><span>${esc(t('avg.agno'))}: <b>${OBS.fmtGpa(s.agno)}</b></span><span>${esc(t('tr.totalEcts'))}: <b>${cum}</b></span><span>${esc(t('avg.ano'))}: <b>${OBS.fmtGpa(s.ano)}</b></span><span>${esc(t('tr.termEcts'))}: <b>${s.ects}</b></span></div></section>`;
    }).join('');
  }
  OBS.views.transcript = {
    title: 'side.transcript',
    needs: ['transcript'],
    render() {
      const d = D().transcript;
      const tr = d.data;
      const st = ACAD.termStats(tr, { scale: scaleNow(), eq: OBS.eq() });
      const p = app.profile;
      const info = (k, v) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
      return head('side.transcript', t('tr.lead'), `<button class="btn soft" type="button" data-print>${icon('print')}${esc(t('tr.print'))}</button><button class="btn soft" type="button" data-trcsv>${icon('download')}${esc(t('tr.csv'))}</button>${d.file.id ? `<button class="btn soft" type="button" data-dl="${d.file.id}">${icon('file')}${esc(t('tr.orig'))}</button>` : ''}`) +
        `<section class="card tr-info">${info(t('home.name'), tr.student.name ? OBS.titleCase(tr.student.name) : OBS.studentName())}${info(t('home.no'), tr.student.number || p.number)}${info(t('tr.faculty'), t('home.faculty'))}${info(t('tr.program'), t('home.dept'))}${info(t('avg.agno'), OBS.fmtGpa(st.totals.agno))}${info(t('tr.passedEcts'), `${st.totals.passedEcts} / ${st.totals.ects}`)}</section>
        <div class="tr-grid">${termTables(tr.terms, false)}</div>
        <p class="muted small print-foot">${esc(t('tr.foot', { d: OBS.fmtDate(new Date().toISOString()) }))}</p>`;
    },
  };

  // ---------- Transkript Senaryosu ----------
  function scenario() {
    if (!app.scenario) app.scenario = clone(D().transcript.data.terms);
    return app.scenario;
  }
  OBS.views.scenario = {
    title: 'side.scenario',
    needs: ['transcript'],
    render() {
      const terms = scenario();
      const base = ACAD.termStats(D().transcript.data, { scale: scaleNow(), eq: OBS.eq() }).totals;
      const now = ACAD.termStats({ terms }, { scale: scaleNow(), eq: OBS.eq() }).totals;
      const diff = Math.round((now.agno - base.agno) * 100) / 100;
      const m = MUF();
      const L = letters();
      let ai = '';
      if (m) {
        let body = `<p class="muted">${esc(t('sc.aiLead'))}</p><button class="btn claude" type="button" data-plan>${icon('spark')}${esc(t('sc.aiBtn'))}</button>`;
        if (ui.planShown) {
          const rs = ACAD.retakeSuggestions(D().transcript.data, { scale: scaleNow(), eq: OBS.eq(), below: app.rules.retakeBelow, target: ui.expect });
          const plan = OBS.planNow(rs.items.slice(0, 3));
          const why = (r) => {
            if (r === 'registered') return t('sc.r.registered');
            if (r === 'retake') return t('sc.r.retake');
            if (r === 'onlyFall' || r === 'onlySpring') return t('sc.r.' + r);
            if (r === 'improve') return t('sc.r.improve');
            if (r.startsWith('unlocks:')) return t('sc.r.unlocks', { c: r.slice(8) });
            if (r.startsWith('after:')) return t('sc.r.after', { c: r.slice(6) });
            return '';
          };
          body = `<div class="plan-head"><p class="muted">${esc(plan.graduation ? t('sc.planGrad', { term: ACAD.termLabel(plan.graduation, app.lang), lim: OBS.ectsLimit() }) : t('sc.planNo'))}</p>
            <label class="chk small">${esc(t('sc.expect'))} <select data-expect>${L.filter((l) => (scaleNow()[l] ?? 0) >= 1).map((l) => `<option ${l === ui.expect ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <button class="btn claude" type="button" data-planadd>${icon('plus')}${esc(t('sc.planAdd'))}</button></div>
            <div class="plan-terms">${plan.terms.map((pt) => `<div class="plan-term"><div class="pt-h"><b>${esc(ACAD.termLabel(pt, app.lang))}</b><span>${pt.ects} ${esc(t('sel.ects'))}</span></div>
              ${pt.items.map((x) => `<div class="pt-i ${x.kind}"><b>${esc(x.kind === 'slot' ? (app.lang === 'en' ? x.nameEn : x.name) : x.code)}</b><span>${esc(x.kind === 'slot' ? '' : OBS.name(x.code))}</span><span class="muted small">${x.ects} ${esc(t('sel.ects'))}</span>${x.reasons.map(why).filter(Boolean).map((r) => `<span class="why">${esc(r)}</span>`).join('')}${x.kind === 'improve' ? `<span class="why up">+${OBS.fmtGpa(x.gain)} ${esc(t('avg.agno'))}</span>` : ''}</div>`).join('')}</div>`).join('')}</div>`;
        }
        ai = `<section class="ai-card col"><div class="ai-row"><div class="ai-icon" aria-hidden="true">${icon('spark')}</div><div class="ai-text"><h2>${esc(t('sc.aiTitle'))}</h2></div></div><div class="ai-body">${body}</div></section>`;
      }
      return head('side.scenario', '', `<button class="btn soft" type="button" data-screset>${icon('reset')}${esc(t('sc.reset'))}</button><button class="btn soft" type="button" data-scterm>${icon('plus')}${esc(t('sc.addTerm'))}</button>`) +
        `<div class="info-strip">${icon('info')}<span>${esc(t('sc.note'))}</span></div>
        <section class="status-row">
          <div class="stat"><span class="k">${esc(t('sc.baseGpa'))}</span><span class="v">${OBS.fmtGpa(base.agno)}</span></div>
          <div class="stat"><span class="k">${esc(t('sc.newGpa'))}</span><span class="v big-v ${diff > 0 ? 'good' : diff < 0 ? 'bad' : ''}">${OBS.fmtGpa(now.agno)} <small>${diff > 0 ? '+' : ''}${diff ? OBS.fmtGpa(diff) : ''}</small></span></div>
          <div class="stat"><span class="k">${esc(t('sc.ects'))}</span><span class="v">${now.passedEcts} / ${app.rules.minEcts}</span></div>
          <div class="stat"><span class="k">${esc(t('sc.limit'))}</span><span class="v">${OBS.limitFor(now.agno)} ${esc(t('sel.ects'))}</span></div>
        </section>
        ${ai}
        <datalist id="currCodes">${m ? m.courses.map((c) => `<option value="${esc(c.code)}">${esc(OBS.name(c.code))}</option>`).join('') : ''}</datalist>
        <div class="tr-grid">${termTables(terms, true)}</div>`;
    },
  };
  function addPlanToScenario() {
    const rs = ACAD.retakeSuggestions(D().transcript.data, { scale: scaleNow(), eq: OBS.eq(), below: app.rules.retakeBelow, target: ui.expect });
    const plan = OBS.planNow(rs.items.slice(0, 3));
    const terms = scenario().filter((x) => !x.planned);
    for (const pt of plan.terms) {
      terms.push({ name: ACAD.termLabel(pt, 'tr'), year: pt.year, term: pt.term, planned: true, courses: pt.items.map((x) => ({ code: x.kind === 'slot' ? x.code : x.code, name: x.kind === 'slot' ? x.name : (course(x.code) || {}).name || x.name, credit: (course(x.code) || {}).credit || 0, ects: x.ects, score: null, letter: ui.expect, zs: x.kind === 'slot' ? 'S' : 'Z' })) });
    }
    app.scenario = terms;
    OBS.saveState();
    OBS.renderView();
    toast(t('sc.planAdded'));
  }

  // ---------- Diğer Belgeler ----------
  OBS.views.docs = {
    title: 'side.otherDocs',
    render() {
      const docs = [...(D().docs || [])].sort((a, b) => b.date.localeCompare(a.date));
      const size = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
      return head('side.otherDocs', t('docs.lead'), `<button class="btn primary" type="button" data-upload="docs">${icon('upload')}${esc(t('docs.add'))}</button>`) +
        `<section class="card flush"><div class="table-wrap"><table class="sel-table"><thead><tr><th>${esc(t('docs.name'))}</th><th>${esc(t('docs.kind'))}</th><th class="num">${esc(t('docs.size'))}</th><th>${esc(t('docs.date'))}</th><th></th></tr></thead><tbody>
        ${docs.map((d) => `<tr><td>${icon('file')} <b>${esc(d.name)}</b></td><td><span class="pill">${esc(d.kind === 'docs' ? t('docs.other') : t('dc.k.' + d.kind))}</span></td><td class="num">${size(d.size)}</td><td>${esc(OBS.fmtDate(d.date, true))}</td><td class="num nowrap"><button class="icon-btn small" type="button" data-dl="${d.id}" title="${esc(t('dc.download'))}">${icon('download')}</button><button class="icon-btn small" type="button" data-rmdoc="${d.id}" title="${esc(t('dc.remove'))}">${icon('trash')}</button></td></tr>`).join('') || `<tr><td colspan="5" class="empty">${esc(t('docs.none'))}</td></tr>`}
        </tbody></table></div></section>`;
    },
  };

  // ---------- Müfredat Durum ----------
  OBS.views.curr = {
    title: 'side.curr',
    needs: ['curriculum', 'transcript'],
    render() {
      const tr = D().transcript.data;
      const cs = ACAD.curriculumStatus(MUF(), tr, { scale: scaleNow(), eq: OBS.eq() });
      const below = app.rules.retakeBelow;
      const sc = scaleNow();
      const lim = sc[below] ?? 1.7;
      const rs = ACAD.retakeSuggestions(tr, { scale: sc, eq: OBS.eq(), below, target: ui.target });
      const L = letters().filter((l) => (sc[l] ?? 0) > lim);
      const st = OBS.student();
      const maxGain = Math.max(0.01, ...rs.items.map((x) => x.gain));
      const sum = cs.summary;
      const retakeCard = `<section class="card retake-card"><div class="card-head"><h2>${icon('spark')}${esc(t('cu.rtTitle'))}</h2>
          <label class="chk small">${esc(t('cu.rtTarget'))} <select data-target>${L.map((l) => `<option ${l === ui.target ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
          <p class="muted small">${esc(t('cu.rtLead', { below }))}${D().regulation && D().regulation.data.evidence.retakeBelow ? ` <span class="found" title="${esc(D().regulation.data.evidence.retakeBelow)}">${esc(t('rules.found'))}</span>` : ''}</p>
          ${rs.items.length ? `<div class="rt-list">${rs.items.map((x) => `<div class="rt-row"><b>${esc(x.code)}</b><span>${esc(OBS.name(x.code))}</span><span class="muted small">${x.ects} ${esc(t('sel.ects'))} · ${esc(x.term)}</span><span class="rt-l">${esc(x.letter)} → ${esc(x.target)}</span><div class="rt-bar"><i style="width:${Math.max(4, (x.gain / maxGain) * 100)}%"></i></div><span class="rt-g">+${OBS.fmtGpa(x.gain)}</span></div>`).join('')}</div>
            <div class="rt-all">${esc(t('cu.rtAll', { from: OBS.fmtGpa(rs.base), to: OBS.fmtGpa(rs.allAgno), n: rs.items.length, target: ui.target }))}<button class="btn small soft" type="button" data-rttry>${esc(t('cu.rtTry'))}</button></div>` : `<p>${esc(t('cu.rtNone', { below }))}</p>`}
        </section>`;
      const retakeSet = new Set(rs.items.map((x) => x.code));
      const sems = cs.rows.map((r) => {
        const items = ui.onlyMissing ? r.items.filter((x) => !x.taken || !x.taken.passed) : r.items;
        if (!items.length) return '';
        const y = Math.ceil(r.semester / 2), tm = r.semester % 2 ? 'guz' : 'bahar';
        return `<section class="card flush cu-sem"><div class="cu-h">${icon('cal')}<b>${esc(t('cu.sem', { y, term: t('tshort.' + tm) }))}</b></div>
          <div class="table-wrap"><table class="cu-t"><thead><tr><th>${esc(t('sel.code'))}</th><th>${esc(t('cu.cname'))}</th><th>Z/S</th><th class="num">${esc(t('tr.credit'))}</th><th class="num">${esc(t('sel.ects'))}</th><th class="sep">${esc(t('avg.term'))}</th><th>${esc(t('sel.code'))}</th><th>${esc(t('sel.name'))}</th><th class="num">${esc(t('tr.letter'))}</th></tr></thead><tbody>
          ${items.map((x) => {
            const tk = x.taken;
            const nm = x.kind === 'slot' ? (app.lang === 'en' ? x.nameEn : x.name) : OBS.name(x.code);
            return `<tr class="${tk ? (tk.passed ? 'ok' : 'bad') : 'none'}"><td><b>${esc(x.kind === 'slot' ? 'ELECT ' + x.code : x.code)}</b></td><td>${esc(nm)}</td><td>${x.zs}</td><td class="num">${x.credit || 0}</td><td class="num">${x.ects}</td>
              <td class="sep">${tk ? esc(shortTerm(tk.term)) : ''}</td><td>${tk ? esc(tk.code) : ''}</td><td>${tk ? esc(OBS.name(tk.code) !== tk.code ? OBS.name(tk.code) : OBS.titleCase(tk.name || '')) : ''}</td>
              <td class="num">${tk ? `<b>${esc(tk.letter)}</b> ${tk.passed ? `<span class="gi ok">${OBS.CHECK}</span>` : `<span class="gi no">${icon('x')}</span>`}${retakeSet.has(tk.code) ? ` <span class="up-tag" title="${esc(t('cu.canRetake'))}">↑</span>` : ''}` : ''}</td></tr>`;
          }).join('')}</tbody></table></div>
          <div class="cu-f">${esc(t('cu.foot', { c: r.credit, e: r.ects, n: r.items.length, z: r.z, s: r.s }))}</div></section>`;
      }).join('');
      const tile = (ic, title, lines, cls) => `<section class="cu-tile ${cls}">${icon(ic)}<div><b>${esc(title)}</b>${lines.map((l) => `<span>${esc(l)}</span>`).join('')}</div></section>`;
      return head('side.curr', t('cu.lead', { name: (D().curriculum.file.name || '').replace(/\.\w+$/, '') })) +
        `<div class="cu-tiles">
          ${tile('info', t('cu.taken'), [t('cu.cr', { n: sum.takenCredit }), t('cu.ec', { n: sum.takenEcts }), `${t('avg.agno')}: ${OBS.fmtGpa(sum.gpa)}`, t('cu.cls', { n: st ? st.year : app.profile.year })], 'blue')}
          ${tile('chart', t('cu.passed'), [t('cu.cr', { n: sum.passedCredit }), t('cu.ec', { n: sum.passedEcts })], 'green')}
          ${tile('folder', t('cu.excluded'), [t('cu.cr', { n: 0 }), t('cu.ec', { n: 0 })], 'red')}
          <section class="cu-tile btns"><button class="btn small soft ${ui.onlyMissing ? 'on' : ''}" type="button" data-onlymissing>${esc(t('cu.onlyMissing'))}</button><button class="btn small soft" type="button" data-print>${icon('print')}${esc(t('cu.print'))}</button></section>
        </div>
        ${retakeCard}${sems}`;
    },
  };

  // ---------- Olaylar ----------
  function rerenderKeep(id) {
    const el = $(id);
    const pos = el && el.selectionStart;
    OBS.renderView();
    const n = $(id);
    if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* sayı alanı */ } }
  }
  document.addEventListener('click', (e) => {
    const q = (s) => e.target.closest(s);
    let b;
    const m = app.model;
    if ((b = q('[data-addrop]'))) { AD.state = { ...AD.state, picks: AD.state.picks.filter((p) => p.id !== b.dataset.addrop) }; OBS.renderView(); return; }
    if ((b = q('[data-adslotrm]'))) { AD.state = setListChoice(m, AD.state, b.dataset.adslotrm, null).state; OBS.renderView(); return; }
    if ((b = q('[data-adundolist]'))) { const k = b.dataset.adundolist; AD.state = { ...AD.state, listChoices: { ...AD.state.listChoices, [k]: AD.base.listChoices[k] } }; OBS.renderView(); return; }
    if ((b = q('[data-adadd]')) || (b = q('[data-adundo]'))) {
      const id = b.dataset.adadd || b.dataset.adundo;
      const r = toggleSection(m, AD.state, id);
      if (r.ok) { AD.state = r.state; const s = m.sections.get(id); toast(t('t.added', { code: s.code, n: s.section })); }
      else toast(t('ad.cannot'));
      OBS.renderView();
      return;
    }
    if ((b = q('[data-adextra]'))) {
      const s = m.sections.get(b.dataset.adextra);
      if (extraOk(s)) { AD.state = { ...AD.state, picks: [...AD.state.picks, { id: s.id, slot: null }] }; toast(t('ad.addedExtra', { code: s.code })); }
      OBS.renderView();
      return;
    }
    if (q('[data-adreset]')) { AD.state = clone(AD.base); OBS.renderView(); return; }
    if (q('[data-adsend]')) {
      const baseIds = new Set(AD.base.picks.map((p) => p.id));
      const curIds = new Set(AD.state.picks.map((p) => p.id));
      const added = AD.state.picks.filter((p) => !baseIds.has(p.id)).map((p) => m.sections.get(p.id).code);
      const dropped = AD.base.picks.filter((p) => !curIds.has(p.id)).map((p) => m.sections.get(p.id).code);
      const snap = withState(AD.state, () => OBS.snapshot());
      app.state = clone(AD.state);
      OBS.submitForApproval('adddrop', snap, { added, dropped });
      toast(t('ad.sent'));
      OBS.renderView();
      return;
    }
    if (q('[data-adlocked]')) { ui.adLocked = !ui.adLocked; OBS.renderView(); return; }
    if ((b = q('[data-gbadd]'))) { const gb = app.gradebook; const c = b.dataset.gbadd; gb[c] = gb[c] || { comps: defComps() }; gb[c].comps.push({ n: t('gb.hw'), w: 0, s: '' }); gbSave(); OBS.renderView(); return; }
    if ((b = q('[data-gbrm]'))) { const gb = app.gradebook; const c = b.dataset.gbrm; gb[c] = gb[c] || { comps: defComps() }; gb[c].comps.splice(+b.dataset.i, 1); gbSave(); OBS.renderView(); return; }
    if (q('[data-print]')) { document.body.classList.add('print-page'); window.print(); setTimeout(() => document.body.classList.remove('print-page'), 800); return; }
    if (q('[data-trcsv]')) {
      const tr = D().transcript.data;
      const rows = [['Dönem', 'Ders Kodu', 'Ders Adı', 'Kredi', 'AKTS', 'Başarı Notu', 'Harf Notu', 'Z/S']];
      for (const term of tr.terms) for (const c of term.courses) rows.push([term.name, c.code, c.name, c.credit, c.ects, c.score ?? '', c.letter, c.zs || '']);
      OBS.download('transkript.csv', '﻿' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n'), 'text/csv');
      return;
    }
    if ((b = q('[data-scrm]'))) { scenario()[+b.dataset.scrm].courses.splice(+b.dataset.ci, 1); app.scenario = app.scenario.filter((x) => x.courses.length || !x.planned); OBS.saveState(); OBS.renderView(); return; }
    if ((b = q('[data-scadd]'))) { scenario()[+b.dataset.scadd].courses.push({ code: '', name: '', credit: 0, ects: 6, score: null, letter: ui.expect, zs: 'Z', isNew: true }); OBS.saveState(); OBS.renderView(); return; }
    if (q('[data-scterm]')) { const s = scenario(); const last = s[s.length - 1]; const n = ACAD.nextTerm(last.year, last.term); s.push({ name: ACAD.termLabel(n, 'tr'), year: n.year, term: n.term, courses: [{ code: '', name: '', credit: 0, ects: 6, score: null, letter: ui.expect, zs: 'Z', isNew: true }] }); OBS.saveState(); OBS.renderView(); return; }
    if (q('[data-screset]')) { app.scenario = null; ui.planShown = false; OBS.saveState(); OBS.renderView(); toast(t('sc.resetDone')); return; }
    if (q('[data-plan]')) { ui.planShown = true; OBS.renderView(); return; }
    if (q('[data-planadd]')) { addPlanToScenario(); return; }
    if (q('[data-onlymissing]')) { ui.onlyMissing = !ui.onlyMissing; OBS.renderView(); return; }
    if (q('[data-rttry]')) {
      const tr = D().transcript.data;
      const rs = ACAD.retakeSuggestions(tr, { scale: scaleNow(), eq: OBS.eq(), below: app.rules.retakeBelow, target: ui.target });
      const s = clone(tr.terms);
      const n = ACAD.nextTerm(s[s.length - 1].year, s[s.length - 1].term);
      s.push({ name: ACAD.termLabel(n, 'tr'), year: n.year, term: n.term, planned: true, courses: rs.items.map((x) => ({ code: x.code, name: x.name, credit: (course(x.code) || {}).credit || 0, ects: x.ects, score: null, letter: ui.target, zs: 'Z' })) });
      app.scenario = s;
      OBS.saveState();
      OBS.setView('scenario');
    }
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    const m = app.model;
    if (el.dataset.adslot != null) {
      const r = reassignSlot(m, AD.state, el.dataset.adslot, el.value || null);
      if (r.ok) AD.state = r.state; else toast(t('ad.slotTaken'));
      OBS.renderView();
      return;
    }
    if (el.dataset.sc != null) {
      const c = scenario()[+el.dataset.sc].courses[+el.dataset.ci];
      const f = el.dataset.f;
      if (f === 'letter') { c.letter = el.value; c.changed = true; }
      if (f === 'ects') c.ects = +el.value || 0;
      if (f === 'name') c.name = el.value;
      if (f === 'code') {
        const code = PARSE.normCode(el.value) || el.value.trim().toUpperCase();
        c.code = code;
        const k = course(code);
        if (k) { c.name = k.name; c.ects = k.ects; c.credit = k.credit || 0; }
      }
      OBS.saveState();
      OBS.renderView();
      return;
    }
    if (el.dataset.expect != null) { ui.expect = el.value; OBS.renderView(); return; }
    if (el.dataset.target != null) { ui.target = el.value; OBS.renderView(); }
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'adQ') { ui.adQ = el.value; rerenderKeep('adQ'); return; }
    if (el.dataset.gbtarget != null) { app.gradebook._target = Math.max(0, Math.min(100, +el.value || 0)); gbSave(); gbRefresh(); return; }
    if (el.dataset.gb != null) {
      const gb = app.gradebook;
      const c = el.dataset.gb;
      gb[c] = gb[c] || { comps: defComps() };
      const comp = gb[c].comps[+el.dataset.i];
      comp[el.dataset.f] = el.dataset.f === 'n' ? el.value : el.value === '' ? '' : Math.max(0, Math.min(100, +el.value));
      gbSave();
      gbRefresh();
    }
  });
})();
