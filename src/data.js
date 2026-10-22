// Veri Merkezi: dosya yükleme, tarayıcıda saklama, eksik dosya uyarısı, demo tarihi ve takvim yardımcıları.
// Dosyalar sunucuya gönderilmez: okunan veri localStorage'da, dosyanın kendisi IndexedDB'de (bu cihazda) durur.
(function () {
  const { app, t, esc, $, toast } = OBS;
  // Google Takvim'e doğrudan yazmak için Google Cloud OAuth istemci kimliği (boşsa .ics ve tek tek ekleme kullanılır)
  const GOOGLE_CLIENT_ID = '';
  const LS_DATA = 'obs-data-v2';
  const LS_STATE = 'obs-state-v2';

  // Yüklenebilen dosya türleri. who: kim yayınlar/yükler
  const KINDS = [
    { id: 'curriculum', who: 'dept', icon: 'book', accept: '.xlsx,.csv,.json', samples: ['mufredat.xlsx'], used: ['reg', 'curr', 'grad', 'scenario'] },
    { id: 'timetable', who: 'dept', icon: 'grid', accept: '.xlsx,.csv', multi: true, samples: ['ders-programi-3-sinif-guz.xlsx', 'ders-programi-4-sinif-guz.xlsx', 'ders-programi-3-sinif-bahar.xlsx', 'ders-programi-4-sinif-bahar.xlsx'], used: ['reg', 'adddrop', 'offered', 'depttt'] },
    { id: 'calendar', who: 'uni', icon: 'cal', accept: '.xlsx,.csv', samples: ['akademik-takvim.xlsx'], used: ['calendar', 'reg', 'adddrop'] },
    { id: 'exams', who: 'uni', icon: 'clock', accept: '.xlsx,.csv', samples: ['sinav-takvimi.xlsx'], used: ['exams'] },
    { id: 'regulation', who: 'uni', icon: 'doc', accept: '.pdf,.docx,.txt', samples: ['yonetmelik-ornek.pdf'], fallback: 'yonetmelik-ornek.txt', used: ['grad', 'curr', 'reg'] },
    { id: 'transcript', who: 'student', icon: 'file', accept: '.pdf,.xlsx,.csv,.txt', samples: ['transkript.pdf'], fallback: 'transkript.xlsx', paste: true, used: ['averages', 'transcript', 'scenario', 'curr', 'grad'] },
  ];
  const MIME = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', json: 'application/json', txt: 'text/plain', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  const extOf = (n) => (n.split('.').pop() || '').toLowerCase();

  let DATA = {};
  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* yok */ } },
  };

  // ---------- IndexedDB: yüklenen dosyaların kendisi ----------
  const idb = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => {
        try {
          const r = indexedDB.open('obs-files', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('files');
          r.onsuccess = () => { this.db = r.result; res(r.result); };
          r.onerror = () => rej(r.error);
        } catch (e) { rej(e); }
      });
    },
    async run(mode, fn) {
      try {
        const db = await this.open();
        return await new Promise((res, rej) => { const tx = db.transaction('files', mode); const q = fn(tx.objectStore('files')); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); });
      } catch (e) { return null; }
    },
    put(id, blob) { return this.run('readwrite', (s) => s.put(blob, id)); },
    get(id) { return this.run('readonly', (s) => s.get(id)); },
    del(id) { return this.run('readwrite', (s) => s.delete(id)); },
    clear() { return this.run('readwrite', (s) => s.clear()); },
  };

  const has = (k) => (k === 'timetable' ? !!(DATA.timetable && DATA.timetable.some((x) => x.data.year)) : !!DATA[k]);
  OBS.has = has;
  OBS.data = () => DATA;
  OBS.kinds = KINDS;

  // ---------- Tarih biçimleri ----------
  const pad = (n) => String(n).padStart(2, '0');
  const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  OBS.today = () => app.today || isoToday();
  const parseIso = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) : new Date(s));
  OBS.parseIso = parseIso;
  OBS.fmtDate = (s, time = false, opts) => {
    if (!s) return '-';
    const d = parseIso(s);
    const loc = app.lang === 'tr' ? 'tr-TR' : 'en-GB';
    const base = d.toLocaleDateString(loc, opts || { day: 'numeric', month: 'long', year: 'numeric' });
    return time ? `${base} ${d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })}` : base;
  };
  OBS.fmtShort = (s) => { if (!s) return '-'; const d = parseIso(s); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; };
  OBS.fmtRange = (a, b) => (b && b !== a ? `${OBS.fmtShort(a)} – ${OBS.fmtShort(b)}` : OBS.fmtShort(a));
  OBS.daysBetween = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 86400000);

  // ---------- Akademik takvim dönemleri ----------
  OBS.period = (kind) => (DATA.calendar ? PARSE.periodOf(DATA.calendar.data.events, kind, app.term) : null);
  OBS.periodOpen = (kind) => !DATA.calendar || PARSE.inPeriod(OBS.period(kind), OBS.today());
  OBS.periodNote = (kind) => {
    const icon = '<svg><use href="#i-cal"/></svg>';
    if (!DATA.calendar) return kind === 'registration' ? '' : `<div class="cal-note info">${icon}<span>${esc(t('cal.noCal'))}</span><button class="btn small soft" type="button" data-goto="data">${esc(t('dc.go'))}</button></div>`;
    const p = OBS.period(kind);
    if (!p) return `<div class="cal-note info">${icon}<span>${esc(t('cal.noPeriod', { what: t('cal.k.' + kind) }))}</span></div>`;
    const today = OBS.today();
    const open = PARSE.inPeriod(p, today);
    const range = OBS.fmtRange(p.start, p.end);
    if (open) return `<div class="cal-note ok">${icon}<span>${esc(t('cal.open', { what: t('cal.k.' + kind), range }))}</span></div>`;
    const before = today < p.start;
    return `<div class="cal-note warn">${icon}<span>${esc(t(before ? 'cal.notYet' : 'cal.over', { what: t('cal.k.' + kind), range, today: OBS.fmtShort(today) }))}</span><button class="btn small soft" type="button" data-setdate="${p.start}">${esc(t('cal.jump'))}</button></div>`;
  };

  // ---------- Saklama ----------
  function saveData() { if (!ls.set(LS_DATA, DATA)) toast(t('dc.storeFull')); }
  OBS.saveState = () => {
    ls.set(LS_STATE, {
      approved: app.approved, history: app.history, notes: app.notes, today: app.today, advisor: app.approved ? 'approved' : app.advisor === 'sent' ? 'waiting' : app.advisor,
      profile: app.profileEdited ? app.profile : null, scenario: app.scenario || null, gradebook: app.gradebook || {}, state: app.state, layers: [...app.layers], term: app.term,
    });
  };
  function loadState() {
    const s = ls.get(LS_STATE);
    if (!s) return;
    app.approved = s.approved || null;
    app.history = s.history || [];
    app.notes = s.notes || [];
    app.today = s.today || null;
    app.advisor = s.approved ? 'approved' : 'waiting';
    if (s.profile) { app.profile = s.profile; app.profileEdited = true; }
    app.scenario = s.scenario || null;
    app.gradebook = s.gradebook || {};
    if (s.state && s.state.picks) app.state = s.state;
    if (s.layers) app.layers = new Set(s.layers);
    if (s.term) app.term = s.term;
  }

  // ---------- Veriden program ve öğrenci ----------
  function buildProg() {
    const list = (DATA.timetable || []).filter((x) => x.data.year && x.data.term);
    if (!list.length) return null;
    const terms = {};
    for (const tt of list) {
      const d = tt.data;
      terms[d.term] = terms[d.term] || {};
      terms[d.term][d.year] = d.sections;
    }
    return { terms };
  }
  OBS.scale = () => ACAD.scaleOf(app.rules);
  OBS.eq = () => { const { MUF } = OBS.getData(); return (MUF && MUF.equivalences) || {}; };
  OBS.student = () => {
    const { MUF } = OBS.getData();
    if (!DATA.transcript || !MUF) return null;
    return ACAD.studentFromTranscript(MUF, DATA.transcript.data, { scale: OBS.scale(), eq: OBS.eq() });
  };
  OBS.entryYear = () => (DATA.transcript && DATA.transcript.data.terms[0] ? +DATA.transcript.data.terms[0].year.slice(0, 4) : 2027 - app.profile.year);
  function applyStudent() {
    const st = OBS.student();
    if (!st || app.profileEdited) return;
    const tr = DATA.transcript.data;
    const words = OBS.titleCase(String(tr.student.name || 'Demo Öğrenci')).split(' ').filter(Boolean);
    app.profile = { first: words.length > 1 ? words.slice(0, -1).join(' ') : words[0] || 'Demo', last: words.length > 1 ? words[words.length - 1] : '', number: tr.student.number || app.profile.number, year: st.year, gpa: st.gpa, status: st.status };
    app.term = st.term;
    if (st.regYear) app.ay = st.regYear;
  }
  function dataChanged(resetReg = false) {
    const muf = DATA.curriculum ? DATA.curriculum.data : null;
    OBS.setData(muf, buildProg());
    app.rules = { ...PARSE.DEFAULT_RULES, ...((DATA.regulation && DATA.regulation.rules) || {}) };
    const before = `${app.profile.year}|${app.term}`;
    applyStudent();
    if (!DATA.transcript) {
      const tt = (DATA.timetable || []).find((x) => x.data.term === app.term && x.data.academicYear);
      app.ay = (DATA.calendar && DATA.calendar.data.academicYear) || (tt && tt.data.academicYear) || '2026-2027';
    }
    const key = `${app.profile.year}|${app.term}`;
    if (before !== key || !app.layers.size) app.layers = new Set([key]);
    OBS.rebuild(resetReg);
    OBS.renderTop();
    OBS.renderView();
    OBS.saveState();
  }
  OBS.dataChanged = dataChanged;

  // ---------- Dosya okuma ----------
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  function fail(code) { const e = new Error(code); e.user = true; return e; }

  async function ingest(kind, name, buf, opts = {}) {
    if (kind === 'docs') {
      const meta = { id: uid(), name, size: buf.byteLength, date: new Date().toISOString(), kind: 'docs' };
      DATA.docs = DATA.docs || [];
      DATA.docs.push(meta);
      await idb.put(meta.id, new Blob([buf], { type: MIME[extOf(name)] || 'application/octet-stream' }));
      return 'docs';
    }
    let read;
    try {
      read = await FILES.readAny(name, buf);
    } catch (e) {
      if (/\.pdf$/i.test(name)) throw fail('pdf');
      throw fail(e.message === 'xls' ? 'xls' : e.message === 'ext' ? 'ext' : 'read');
    }
    if (!kind || kind === 'auto') kind = PARSE.guessKind(name, read) || 'docs';
    const meta = { id: uid(), name, size: buf.byteLength, date: new Date().toISOString(), kind };
    const sheetOnly = () => { if (read.kind !== 'sheet' && read.kind !== 'json') throw fail('needSheet'); };
    try {
      switch (kind) {
        case 'curriculum': {
          const data = read.kind === 'json' ? read.json : (sheetOnly(), PARSE.parseCurriculum(read.book));
          if (!data.semesters || !data.semesters.length) throw fail('parse');
          data.equivalences = data.equivalences || {};
          data.universityElectives = data.universityElectives || { courses: [] };
          DATA.curriculum = { file: meta, data };
          break;
        }
        case 'timetable': {
          sheetOnly();
          const data = PARSE.parseTimetable(read.book, name);
          if (!data.sections.length) throw fail('parse');
          if (opts.year) data.year = opts.year;
          if (!data.term) data.term = app.term;
          DATA.timetable = (DATA.timetable || []).filter((x) => !(x.data.year && x.data.year === data.year && x.data.term === data.term));
          DATA.timetable.push({ file: meta, data });
          DATA.timetable.sort((a, b) => (a.data.term + a.data.year).localeCompare(b.data.term + b.data.year));
          break;
        }
        case 'calendar': sheetOnly(); DATA.calendar = { file: meta, data: PARSE.parseCalendar(read.book) }; break;
        case 'exams': sheetOnly(); DATA.exams = { file: meta, data: PARSE.parseExams(read.book) }; break;
        case 'regulation': {
          if (read.kind === 'sheet') throw fail('needText');
          const data = PARSE.parseRegulation(read.text || '');
          DATA.regulation = { file: meta, data, rules: { ...data.rules } };
          break;
        }
        case 'transcript': {
          const data = read.kind === 'sheet' ? PARSE.parseTranscriptBook(read.book) : PARSE.parseTranscriptText(read.kind === 'pdf' ? FILES.pdfLines(read.pages, true) : read.text);
          DATA.transcript = { file: meta, data };
          app.profileEdited = false;
          app.scenario = null;
          break;
        }
        default: meta.kind = 'docs';
      }
    } catch (e) {
      throw e.user ? e : fail(kind);
    }
    DATA.docs = (DATA.docs || []).filter((d) => !(d.kind === kind && kind !== 'docs' && kind !== 'timetable'));
    DATA.docs.push(meta);
    await idb.put(meta.id, new Blob([buf], { type: MIME[extOf(name)] || 'application/octet-stream' }));
    return kind;
  }

  async function ingestFiles(kind, files, opts) {
    let ok = 0;
    for (const f of files) {
      try {
        const k = await ingest(kind, f.name, await f.arrayBuffer(), opts);
        ok++;
        toast(t('dc.loaded', { name: f.name, kind: t('dc.k.' + k) }));
      } catch (e) {
        showError(f.name, e);
      }
    }
    if (ok) { saveData(); dataChanged(kind === 'transcript' || kind === 'curriculum'); }
  }
  function showError(name, e) {
    const code = e && e.user ? e.message : 'read';
    OBS.dialog(t('dc.errT'), `<p><b>${esc(name)}</b></p><p>${esc(t('dc.err.' + code) || t('dc.err.read'))}</p>`, [{ label: t('fin.cancel') }]);
  }

  const b64 = (s) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const sampleBytes = (n) => (window.SAMPLES && window.SAMPLES[n] ? b64(window.SAMPLES[n]) : null);

  async function loadSample(k, quiet) {
    let done = 0;
    for (const n of k.samples) {
      try {
        await ingest(k.id, n, sampleBytes(n).buffer);
        done++;
      } catch (e) {
        if (k.fallback) { try { await ingest(k.id, k.fallback, sampleBytes(k.fallback).buffer); done++; } catch (e2) { if (!quiet) showError(n, e2); } } else if (!quiet) showError(n, e);
      }
    }
    return done;
  }
  async function loadAllSamples() {
    toast(t('dc.loadingSamples'));
    for (const k of KINDS) await loadSample(k, true);
    if (!app.today) app.today = '2026-09-08';
    saveData();
    dataChanged(true);
    toast(t('dc.samplesDone'));
  }
  OBS.loadAllSamples = loadAllSamples;

  function removeKind(kind, id) {
    if (kind === 'timetable' && id) DATA.timetable = (DATA.timetable || []).filter((x) => x.file.id !== id);
    else delete DATA[kind];
    if (kind === 'timetable' && DATA.timetable && !DATA.timetable.length) delete DATA.timetable;
    const ids = (DATA.docs || []).filter((d) => d.kind === kind && (!id || d.id === id)).map((d) => d.id);
    DATA.docs = (DATA.docs || []).filter((d) => !ids.includes(d.id));
    ids.forEach((x) => idb.del(x));
    if (kind === 'transcript') { app.profileEdited = false; app.scenario = null; }
    saveData();
    dataChanged(kind === 'curriculum' || kind === 'timetable');
  }
  OBS.removeDoc = (id) => {
    const d = (DATA.docs || []).find((x) => x.id === id);
    if (!d) return;
    if (d.kind === 'docs') { DATA.docs = DATA.docs.filter((x) => x.id !== id); idb.del(id); saveData(); OBS.renderView(); }
    else removeKind(d.kind, d.kind === 'timetable' ? id : null);
  };
  OBS.downloadDoc = async (id) => {
    const d = (DATA.docs || []).find((x) => x.id === id);
    const blob = d && (await idb.get(id));
    if (!blob) { toast(t('dc.noBlob')); return; }
    OBS.download(d.name, blob);
  };
  OBS.ingestFiles = ingestFiles;

  function clearAll() {
    OBS.dialog(t('dc.clearT'), `<p>${esc(t('dc.clearL'))}</p>`, [
      { label: t('fin.cancel') },
      { label: t('dc.clearOk'), cls: 'danger', run: () => {
        DATA = {}; ls.del(LS_DATA); ls.del(LS_STATE); idb.clear();
        Object.assign(app, { approved: null, history: [], notes: [], unread: 0, today: null, advisor: 'waiting', profileEdited: false, scenario: null, gradebook: {}, state: emptyState() });
        app.profile = { first: 'Demo', last: 'Öğrenci', number: '23070001234', year: 4, gpa: 2.75, status: { 'ME 3220': 'failed' } };
        app.term = 'guz';
        dataChanged(true);
        toast(t('dc.cleared'));
      } },
    ]);
  }

  // ---------- Genel pencere ----------
  OBS.dialog = (title, html, actions = [], wide = false) => {
    $('genTitle').textContent = title;
    $('genBody').innerHTML = html;
    const dlg = $('genDlg');
    dlg.querySelector('.dlg').classList.toggle('xwide', !!wide);
    $('genActions').innerHTML = actions.map((a, i) => `<button class="btn ${a.cls || (i === actions.length - 1 && actions.length > 1 ? 'primary' : 'soft')}" type="button" data-gen="${i}">${esc(a.label)}</button>`).join('');
    $('genActions').onclick = (e) => {
      const b = e.target.closest('[data-gen]');
      if (!b) return;
      const a = actions[+b.dataset.gen];
      if (a.run && a.run() === false) return;
      dlg.close();
    };
    if (!dlg.open) dlg.showModal();
  };

  // ---------- İndirme, takvim (.ics) ve Google Takvim ----------
  OBS.download = (name, data, type = 'text/plain') => {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };
  const dstr = (iso) => iso.replace(/-/g, '');
  const nextDay = (iso) => { const d = parseIso(iso); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const tstr = (iso, hm) => `${dstr(iso)}T${hm.replace(':', '')}00`;
  const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/[,;]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
  // ev: {title, date, end?, start?(HH:MM), finish?(HH:MM), location?, details?}
  OBS.ics = (events, fileName) => {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OBS Ders Kaydi Prototipi//TR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-TIMEZONE:Europe/Istanbul'];
    events.forEach((ev, i) => {
      lines.push('BEGIN:VEVENT', `UID:${dstr(ev.date)}-${i}-${Math.random().toString(36).slice(2, 8)}@obs-ders-kaydi`, `DTSTAMP:${stamp}`);
      if (ev.start) lines.push(`DTSTART;TZID=Europe/Istanbul:${tstr(ev.date, ev.start)}`, `DTEND;TZID=Europe/Istanbul:${tstr(ev.date, ev.finish || ev.start)}`);
      else lines.push(`DTSTART;VALUE=DATE:${dstr(ev.date)}`, `DTEND;VALUE=DATE:${dstr(nextDay(ev.end || ev.date))}`);
      lines.push(`SUMMARY:${icsEsc(ev.title)}`);
      if (ev.location) lines.push(`LOCATION:${icsEsc(ev.location)}`);
      if (ev.details) lines.push(`DESCRIPTION:${icsEsc(ev.details)}`);
      if (ev.start) lines.push('BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(ev.title)}`, 'END:VALARM');
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    OBS.download(fileName, lines.join('\r\n'), 'text/calendar');
  };
  OBS.gcalLink = (ev) => {
    const dates = ev.start ? `${tstr(ev.date, ev.start)}/${tstr(ev.date, ev.finish || ev.start)}` : `${dstr(ev.date)}/${dstr(nextDay(ev.end || ev.date))}`;
    const q = new URLSearchParams({ action: 'TEMPLATE', text: ev.title, dates, ctz: 'Europe/Istanbul' });
    if (ev.location) q.set('location', ev.location);
    if (ev.details) q.set('details', ev.details);
    return 'https://calendar.google.com/calendar/render?' + q.toString();
  };
  // Google hesabına bağlanıp etkinlikleri doğrudan yaz (OAuth istemci kimliği gerekir)
  OBS.googleSync = (events) => {
    if (!GOOGLE_CLIENT_ID) {
      OBS.dialog(t('g.setupT'), `<p>${esc(t('g.setupL'))}</p><ol class="steps-list">${[1, 2, 3, 4].map((i) => `<li>${esc(t('g.step' + i))}</li>`).join('')}</ol><p class="muted small">${esc(t('g.meanwhile'))}</p>`, [{ label: t('fin.cancel') }, { label: t('g.ics'), run: () => { OBS.ics(events, 'sinavlar.ics'); } }]);
      return;
    }
    const go = () => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/calendar.events',
        callback: async (resp) => {
          if (!resp.access_token) { toast(t('g.denied')); return; }
          let n = 0;
          for (const ev of events) {
            const body = ev.start
              ? { summary: ev.title, location: ev.location, description: ev.details, start: { dateTime: `${ev.date}T${ev.start}:00`, timeZone: 'Europe/Istanbul' }, end: { dateTime: `${ev.date}T${ev.finish || ev.start}:00`, timeZone: 'Europe/Istanbul' }, reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 1440 }] } }
              : { summary: ev.title, description: ev.details, start: { date: ev.date }, end: { date: nextDay(ev.end || ev.date) } };
            const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', { method: 'POST', headers: { Authorization: 'Bearer ' + resp.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (r.ok) n++;
          }
          toast(t('g.done', { n }));
        },
      });
      client.requestAccessToken();
    };
    if (window.google && google.accounts) return go();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = go;
    s.onerror = () => toast(t('g.loadErr'));
    document.head.appendChild(s);
  };

  // ---------- Eksik dosya uyarısı ----------
  OBS.gate = (keys, titleKey) => {
    const miss = keys.filter((k) => !has(k));
    if (!miss.length) return '';
    return `<div class="page-head"><div><h1>${esc(t(titleKey))}</h1></div></div>
      <section class="gate card"><div class="gate-ic"><svg><use href="#i-upload"/></svg></div>
        <h2>${esc(t('gate.title'))}</h2><p class="muted">${esc(t('gate.lead'))}</p>
        <ul class="gate-list">${miss.map((k) => `<li><svg><use href="#i-${KINDS.find((x) => x.id === k).icon}"/></svg><div><b>${esc(t('dc.k.' + k))}</b><span>${esc(t('dc.who.' + KINDS.find((x) => x.id === k).who))} · ${esc(t('dc.d.' + k))}</span></div></li>`).join('')}</ul>
        <div class="gate-btns"><button class="btn primary" type="button" data-goto="data"><svg><use href="#i-upload"/></svg>${esc(t('dc.go'))}</button><button class="btn soft" type="button" data-samples>${esc(t('dc.samplesAll'))}</button></div>
      </section>`;
  };

  // ---------- Kenar menüsü ----------
  OBS.renderNav = () => {
    const n = KINDS.filter((k) => has(k.id)).length;
    const c = $('navDataCount');
    if (c) { c.textContent = `${n}/${KINDS.length}`; c.classList.toggle('full', n === KINDS.length); }
    document.querySelectorAll('.side-nav [data-view]').forEach((a) => {
      const v = a.dataset.view;
      const needs = v === 'reg' ? ['curriculum', 'timetable'] : (OBS.views[v] && OBS.views[v].needs) || [];
      a.classList.toggle('need', needs.some((k) => !has(k)));
    });
  };

  // ---------- Demo tarihi ----------
  OBS.renderDateChip = () => {
    const el = $('dateChip');
    if (!el) return;
    el.innerHTML = `<svg><use href="#i-cal"/></svg><span>${esc(OBS.fmtShort(OBS.today()))}</span>${app.today ? `<i>${esc(t('date.demo'))}</i>` : ''}`;
    el.title = t('date.tip');
  };
  function openDate() {
    const quick = [];
    if (DATA.calendar) {
      for (const k of ['registration', 'adddrop', 'midterm', 'final']) {
        const p = OBS.period(k);
        if (p) quick.push(`<button class="btn small soft" type="button" data-qdate="${p.start}">${esc(t('cal.k.' + k))} · ${esc(OBS.fmtShort(p.start))}</button>`);
      }
    }
    OBS.dialog(t('date.title'), `<p class="muted">${esc(t('date.lead'))}</p><label class="pf-f"><span>${esc(t('date.label'))}</span><input type="date" id="demoDate" value="${OBS.today()}"></label>
      ${quick.length ? `<p class="small" style="margin:14px 0 6px"><b>${esc(t('date.quick'))}</b></p><div class="chips-row">${quick.join('')}</div>` : `<p class="muted small" style="margin-top:12px">${esc(t('date.noCal'))}</p>`}`,
    [{ label: t('date.real'), run: () => setDate(null) }, { label: t('date.apply'), run: () => setDate($('demoDate').value || null) }]);
    $('genBody').onclick = (e) => { const q = e.target.closest('[data-qdate]'); if (q) $('demoDate').value = q.dataset.qdate; };
  }
  function setDate(iso) {
    app.today = iso;
    OBS.saveState();
    OBS.renderTop();
    OBS.renderView();
    if (app.model) OBS.render();
    toast(t('date.set', { d: OBS.fmtShort(OBS.today()) }));
  }
  OBS.setDate = setDate;

  // ---------- Transkripti yapıştır ----------
  function openPaste() {
    OBS.dialog(t('dc.pasteT'), `<ol class="steps-list"><li>${esc(t('dc.paste1'))}</li><li>${esc(t('dc.paste2'))}</li><li>${esc(t('dc.paste3'))}</li></ol>
      <textarea id="pasteBox" class="paste-box" rows="10" placeholder="${esc(t('dc.pastePh'))}"></textarea>`, [
      { label: t('fin.cancel') },
      { label: t('dc.pasteRead'), run: () => {
        const text = $('pasteBox').value;
        if (!text.trim()) return false;
        const buf = new TextEncoder().encode(text).buffer;
        ingest('transcript', t('dc.pasteName') + '.txt', buf).then(() => { saveData(); dataChanged(true); toast(t('dc.pasteOk')); }).catch((e) => showError(t('dc.pasteName'), e));
      } },
    ], true);
  }

  // ---------- Yönetmelik kurallarını düzenle ----------
  const RULE_KEYS = ['minEcts', 'minGpa', 'internshipDays', 'normalYears', 'maxYears', 'retakeBelow', 'limitGpa', 'limitHigh', 'limitLow'];
  function openRules() {
    const r = app.rules;
    OBS.dialog(t('rules.editT'), `<p class="muted small">${esc(t('rules.editL'))}</p><div class="rules-form">${RULE_KEYS.map((k) => `<label class="pf-f"><span>${esc(t('rules.' + k))}</span><input data-rule="${k}" value="${esc(r[k])}"></label>`).join('')}</div>`, [
      { label: t('fin.cancel') },
      { label: t('rules.save'), run: () => {
        const out = { ...(DATA.regulation ? DATA.regulation.rules : {}) };
        document.querySelectorAll('[data-rule]').forEach((i) => { const k = i.dataset.rule; const v = i.value.trim(); out[k] = k === 'retakeBelow' ? v.toUpperCase() : parseFloat(v.replace(',', '.')); });
        if (!DATA.regulation) DATA.regulation = { file: { id: 'manual', name: t('rules.manual'), size: 0, date: new Date().toISOString(), kind: 'regulation' }, data: { rules: {}, evidence: {}, found: [] }, rules: out };
        else DATA.regulation.rules = out;
        saveData(); dataChanged(false); toast(t('rules.saved'));
      } },
    ], true);
  }

  // ---------- Veri Merkezi sayfası ----------
  function summary(k) {
    const d = DATA[k];
    const n = (x) => x.toLocaleString(app.lang === 'tr' ? 'tr-TR' : 'en-GB');
    switch (k) {
      case 'curriculum': { const c = d.data; return t('dc.s.curriculum', { sem: c.semesters.length, n: n(c.courses.length), slots: c.semesters.reduce((a, s) => a + s.electiveSlots.length, 0) }); }
      case 'timetable': return t('dc.s.timetable', { n: d.length, s: d.reduce((a, x) => a + x.data.sections.length, 0) });
      case 'calendar': { const p = PARSE.periodOf(d.data.events, 'registration', app.term); return t('dc.s.calendar', { n: d.data.events.length }) + (p ? ' · ' + t('cal.k.registration') + ' ' + OBS.fmtRange(p.start, p.end) : ''); }
      case 'exams': { const e = d.data.exams; return t('dc.s.exams', { n: e.length, range: OBS.fmtRange(e[0].date, e[e.length - 1].date) }); }
      case 'regulation': return t('dc.s.regulation', { n: d.data.found.length });
      case 'transcript': { const tr = d.data; const st = ACAD.termStats(tr, { scale: OBS.scale(), eq: OBS.eq() }); return t('dc.s.transcript', { n: tr.terms.length, c: tr.terms.reduce((a, x) => a + x.courses.length, 0), gpa: OBS.fmtGpa(st.totals.agno) }); }
      default: return '';
    }
  }
  function fileLine(meta, extra = '') {
    return `<div class="dc-file"><svg><use href="#i-file"/></svg><div><b>${esc(meta.name)}</b><span>${esc(OBS.fmtDate(meta.date, true))}${extra}</span></div>${meta.id !== 'manual' ? `<button class="icon-btn small" type="button" data-dl="${meta.id}" title="${esc(t('dc.download'))}"><svg><use href="#i-download"/></svg></button>` : ''}</div>`;
  }
  function card(k) {
    const loaded = has(k.id) || (k.id === 'timetable' && DATA.timetable && DATA.timetable.length);
    let body = '';
    if (k.id === 'timetable' && DATA.timetable) {
      body = DATA.timetable.map((x) => `<div class="dc-file tt"><svg><use href="#i-grid"/></svg><div><b>${esc(x.file.name)}</b><span>${x.data.academicYear ? esc(x.data.academicYear) + ' · ' : ''}${esc(t('tshort.' + x.data.term))} · ${esc(t('dc.sections', { n: x.data.sections.length }))}</span></div>
        <select data-ttyear="${x.file.id}" aria-label="${esc(t('dc.whichYear'))}" class="${x.data.year ? '' : 'need'}"><option value="">${esc(t('dc.whichYear'))}</option>${[1, 2, 3, 4].map((y) => `<option value="${y}" ${String(y) === String(x.data.year) ? 'selected' : ''}>${esc(t('f.year', { y }))}</option>`).join('')}</select>
        <button class="icon-btn small" type="button" data-rmdoc="${x.file.id}" title="${esc(t('dc.remove'))}"><svg><use href="#i-x"/></svg></button></div>`).join('');
    } else if (loaded) {
      body = fileLine(DATA[k.id].file);
    }
    if (k.id === 'regulation' && DATA.regulation) {
      const r = app.rules;
      const ev = DATA.regulation.data.evidence || {};
      const row = (key, val) => `<tr><td>${esc(t('rules.' + key))}</td><td><b>${esc(val)}</b></td><td>${ev[key] ? `<span class="found" title="${esc(ev[key])}">${esc(t('rules.found'))}</span><div class="ev">“${esc(ev[key])}”</div>` : `<span class="dflt">${esc(t('rules.default'))}</span>`}</td></tr>`;
      body += `<table class="rules-t"><tbody>${row('minEcts', r.minEcts + ' ' + t('sel.ects'))}${row('minGpa', OBS.fmtGpa(r.minGpa))}${row('internshipDays', t('rules.days', { n: r.internshipDays }))}${row('maxYears', t('home.years', { n: r.maxYears }))}${row('retakeBelow', r.retakeBelow)}${row('limitHigh', `${r.limitHigh} / ${r.limitLow} ${t('sel.ects')} (${OBS.fmtGpa(r.limitGpa)})`)}${r.scale ? row('scale', Object.entries(r.scale).map(([l, v]) => `${l} ${v}`).join(' · ')) : ''}</tbody></table>
        <button class="btn small soft" type="button" data-rules><svg><use href="#i-edit"/></svg>${esc(t('rules.edit'))}</button>`;
    }
    return `<article class="dc-card ${loaded ? 'ok' : ''}" data-kind="${k.id}">
      <div class="dc-top"><span class="dc-ic"><svg><use href="#i-${k.icon}"/></svg></span><div class="dc-tt"><h3>${esc(t('dc.k.' + k.id))}</h3><span class="who ${k.who}">${esc(t('dc.who.' + k.who))}</span></div>
        <span class="dc-state ${loaded ? 'ok' : ''}">${loaded ? OBS.CHECK + esc(t('dc.ok')) : esc(t('dc.waiting'))}</span></div>
      <p class="dc-desc">${esc(t('dc.d.' + k.id))}</p>
      ${loaded ? `<p class="dc-sum">${esc(summary(k.id))}</p>` : ''}
      ${body}
      <div class="dc-used"><span>${esc(t('dc.usedBy'))}</span>${k.used.map((v) => `<button type="button" class="mini-chip" data-goto="${v}">${esc(t(v === 'reg' ? 'side.reg' : 'side.' + ({ curr: 'curr', grad: 'grad', scenario: 'scenario', adddrop: 'adddrop', offered: 'offered', depttt: 'depttt', calendar: 'calendar', exams: 'exams', averages: 'averages', transcript: 'transcript' }[v])))}</button>`).join('')}</div>
      <div class="dc-btns">
        <button class="btn small primary" type="button" data-upload="${k.id}"><svg><use href="#i-upload"/></svg>${esc(t(loaded && !k.multi ? 'dc.replace' : 'dc.upload'))}</button>
        ${k.paste ? `<button class="btn small soft" type="button" data-paste><svg><use href="#i-paste"/></svg>${esc(t('dc.paste'))}</button>` : ''}
        <button class="btn small ghost" type="button" data-sample="${k.id}"><svg><use href="#i-download"/></svg>${esc(t('dc.sample'))}</button>
        ${loaded && !k.multi ? `<button class="btn small ghost" type="button" data-rmkind="${k.id}">${esc(t('dc.remove'))}</button>` : ''}
      </div>
      <div class="dc-fmt">${esc(t('dc.formats'))} ${esc(k.accept.replace(/\./g, '').toUpperCase().replace(/,/g, ', '))} · ${esc(t('dc.src.' + k.id))}</div>
    </article>`;
  }

  OBS.views.data = {
    title: 'side.data',
    render() {
      const n = KINDS.filter((k) => has(k.id)).length;
      const uni = KINDS.filter((k) => k.who !== 'student');
      const stu = KINDS.filter((k) => k.who === 'student');
      return `<div class="page-head"><div><h1>${esc(t('dc.title'))}</h1><p class="lead">${esc(t('dc.lead'))}</p></div></div>
        <section class="card dc-hero">
          <div class="dc-prog"><div class="top-line"><span class="k">${esc(t('dc.progress'))}</span><span class="big">${n} / ${KINDS.length}</span></div><div class="bar"><i style="width:${(n / KINDS.length) * 100}%"></i></div></div>
          <div class="dc-actions"><button class="btn primary" type="button" data-samples><svg><use href="#i-spark"/></svg>${esc(t('dc.samplesAll'))}</button>${n ? `<button class="btn soft" type="button" data-clear><svg><use href="#i-trash"/></svg>${esc(t('dc.clear'))}</button>` : ''}</div>
          <label class="dropzone" data-drop="auto"><input type="file" multiple data-upload-input="auto" hidden><svg><use href="#i-upload"/></svg><span><b>${esc(t('dc.dropT'))}</b>${esc(t('dc.dropL'))}</span></label>
          <p class="dc-privacy"><svg><use href="#i-info"/></svg>${esc(t('dc.privacy'))}</p>
        </section>
        <h2 class="dc-group">${esc(t('dc.gUni'))}</h2>
        <div class="dc-grid">${uni.map(card).join('')}</div>
        <h2 class="dc-group">${esc(t('dc.gStudent'))}</h2>
        <div class="dc-grid">${stu.map(card).join('')}
          <article class="dc-card docs-card"><div class="dc-top"><span class="dc-ic"><svg><use href="#i-folder"/></svg></span><div class="dc-tt"><h3>${esc(t('side.otherDocs'))}</h3><span class="who student">${esc(t('dc.who.student'))}</span></div><span class="dc-state">${(DATA.docs || []).length}</span></div>
            <p class="dc-desc">${esc(t('dc.d.docs'))}</p><div class="dc-btns"><button class="btn small soft" type="button" data-goto="docs">${esc(t('dc.openDocs'))}</button></div></article>
        </div>
        <section class="card dc-api"><div class="card-head"><h2>${esc(t('api.title'))}</h2></div>
          <p class="muted">${esc(t('api.lead'))}</p>
          <div class="api-flow"><div><b>${esc(t('api.today'))}</b><span>${esc(t('api.todayL'))}</span></div><svg><use href="#i-chev"/></svg><div><b>${esc(t('api.conn'))}</b><span>${esc(t('api.connL'))}</span></div><svg><use href="#i-chev"/></svg><div><b>${esc(t('api.tomorrow'))}</b><span>${esc(t('api.tomorrowL'))}</span></div></div>
          <table class="api-t"><thead><tr><th>${esc(t('api.endpoint'))}</th><th>${esc(t('api.replaces'))}</th></tr></thead><tbody>
            ${[['GET /api/curriculum', 'curriculum'], ['GET /api/terms/{term}/sections', 'timetable'], ['GET /api/terms/{term}/quota', 'liveQuota'], ['GET /api/calendar', 'calendar'], ['GET /api/students/{no}/exams', 'exams'], ['GET /api/students/{no}/transcript', 'transcript'], ['POST /api/students/{no}/registration', 'reg']].map(([e, k]) => `<tr><td><code>${e}</code></td><td>${esc(k === 'reg' ? t('api.submit') : k === 'liveQuota' ? t('api.liveQuota') : t('dc.k.' + k))}</td></tr>`).join('')}
          </tbody></table></section>`;
    },
  };

  // ---------- Olaylar ----------
  let pendingUpload = null;
  function pick(kind, opts) {
    const k = KINDS.find((x) => x.id === kind);
    const inp = $('fileIn');
    inp.accept = k ? k.accept : '';
    inp.multiple = !k || !!k.multi;
    inp.value = '';
    pendingUpload = { kind, opts };
    inp.click();
  }
  function bindData() {
    $('fileIn').addEventListener('change', (e) => {
      const files = [...e.target.files];
      if (files.length && pendingUpload) ingestFiles(pendingUpload.kind, files, pendingUpload.opts);
      pendingUpload = null;
    });
    document.addEventListener('click', (e) => {
      const q = (s) => e.target.closest(s);
      let b;
      if ((b = q('[data-upload]'))) { e.preventDefault(); pick(b.dataset.upload); return; }
      if ((b = q('[data-samples]'))) { e.preventDefault(); loadAllSamples(); return; }
      if ((b = q('[data-sample]'))) {
        const k = KINDS.find((x) => x.id === b.dataset.sample);
        k.samples.forEach((n, i) => setTimeout(() => OBS.download(n, new Blob([sampleBytes(n)], { type: MIME[extOf(n)] })), i * 300));
        return;
      }
      if ((b = q('[data-rmkind]'))) { removeKind(b.dataset.rmkind); return; }
      if ((b = q('[data-rmdoc]'))) { OBS.removeDoc(b.dataset.rmdoc); return; }
      if ((b = q('[data-dl]'))) { OBS.downloadDoc(b.dataset.dl); return; }
      if (q('[data-clear]')) { clearAll(); return; }
      if (q('[data-paste]')) { openPaste(); return; }
      if (q('[data-rules]')) { openRules(); return; }
      if (q('#dateChip')) { openDate(); return; }
      if ((b = q('[data-setdate]'))) { setDate(b.dataset.setdate); return; }
      if ((b = q('[data-toggle]'))) {
        e.preventDefault();
        b.classList.toggle('open');
        $('sub-' + b.dataset.toggle).classList.toggle('closed', !b.classList.contains('open'));
        b.querySelector('.chev').classList.toggle('down', b.classList.contains('open'));
        return;
      }
      if ((b = q('.dropzone'))) { e.preventDefault(); pick('auto'); }
    });
    document.addEventListener('change', (e) => {
      const s = e.target.closest('[data-ttyear]');
      if (!s) return;
      const x = DATA.timetable.find((tt) => tt.file.id === s.dataset.ttyear);
      if (!x) return;
      x.data.year = s.value || null;
      DATA.timetable = DATA.timetable.filter((tt) => tt === x || !(tt.data.year && tt.data.year === x.data.year && tt.data.term === x.data.term));
      saveData();
      dataChanged(false);
    });
    // Sürükle-bırak: karta bırakılan dosya o türde, genel alana bırakılan otomatik tanınır
    document.addEventListener('dragover', (e) => {
      const z = e.target.closest('.dc-card[data-kind], .dropzone');
      if (!z) return;
      e.preventDefault();
      document.querySelectorAll('.drag-on').forEach((x) => x.classList.remove('drag-on'));
      z.classList.add('drag-on');
    });
    document.addEventListener('dragleave', (e) => { const z = e.target.closest('.drag-on'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('drag-on'); });
    document.addEventListener('drop', (e) => {
      const z = e.target.closest('.dc-card[data-kind], .dropzone');
      if (!z) return;
      e.preventDefault();
      z.classList.remove('drag-on');
      const files = [...(e.dataTransfer.files || [])];
      if (files.length) ingestFiles(z.dataset.kind || 'auto', files);
    });
  }

  OBS.initData = () => {
    DATA = ls.get(LS_DATA) || {};
    if (DATA.quota) { DATA.docs = (DATA.docs || []).filter((d) => d.kind !== 'quota'); delete DATA.quota; }
    loadState();
    const muf = DATA.curriculum ? DATA.curriculum.data : null;
    OBS.setData(muf, buildProg());
    app.rules = { ...PARSE.DEFAULT_RULES, ...((DATA.regulation && DATA.regulation.rules) || {}) };
    applyStudent();
    if (!DATA.transcript) {
      const tt = (DATA.timetable || []).find((x) => x.data.term === app.term && x.data.academicYear);
      app.ay = (DATA.calendar && DATA.calendar.data.academicYear) || (tt && tt.data.academicYear) || '2026-2027';
    }
    if (!app.layers.size) app.layers = new Set([`${app.profile.year}|${app.term}`]);
    bindData();
  };
})();
