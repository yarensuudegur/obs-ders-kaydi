// Dosya okuyucular: bağımlılıksız XLSX / DOCX (zip + xml), CSV ve PDF (pdf.js, tembel yükleme).
// Tarayıcıda ve Node testlerinde çalışır. Hiçbir dosya bir sunucuya gönderilmez.

const XML_ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function xmlText(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return XML_ENT[e] ?? m;
  });
}

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ZIP: merkezi dizinden dosyaları çıkarır
export async function unzip(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('zip');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map();
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    const lnlen = dv.getUint16(local + 26, true), lxlen = dv.getUint16(local + 28, true);
    const start = local + 30 + lnlen + lxlen;
    const data = u8.subarray(start, start + csize);
    out.set(name, method === 0 ? data : await inflateRaw(data));
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

const colIndex = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const BUILTIN_DATE = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

export function excelDate(serial) {
  const ms = Math.round((serial - 25569) * 86400000);
  return new Date(ms);
}

// XLSX → { sheets: [{ name, rows: [[değer]] }] }. Tarih biçimli hücreler Date olur.
export async function readXlsx(buf) {
  const files = await unzip(buf);
  const dec = new TextDecoder();
  const get = (n) => (files.has(n) ? dec.decode(files.get(n)) : '');
  const shared = [...get('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => xmlText([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')));
  const styles = get('xl/styles.xml');
  const customFmts = new Map([...styles.matchAll(/<numFmt numFmtId="(\d+)" formatCode="([^"]*)"/g)].map((m) => [+m[1], xmlText(m[2])]));
  const xfs = (styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/) || [, ''])[1];
  const dateStyle = [...xfs.matchAll(/<xf [^>]*?numFmtId="(\d+)"/g)].map((m) => {
    const id = +m[1];
    if (BUILTIN_DATE.has(id)) return true;
    const code = customFmts.get(id);
    return !!code && /[dy]/i.test(code.replace(/\[[^\]]*\]|"[^"]*"/g, '')) && !/^[#0.,%]+$/.test(code);
  });
  const wb = get('xl/workbook.xml');
  const rels = get('xl/_rels/workbook.xml.rels');
  const relMap = new Map([...rels.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const relMap2 = new Map([...rels.matchAll(/<Relationship [^>]*Target="([^"]+)"[^>]*Id="([^"]+)"/g)].map((m) => [m[2], m[1]]));
  const sheets = [];
  for (const m of wb.matchAll(/<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)) {
    let target = relMap.get(m[2]) || relMap2.get(m[2]) || '';
    target = target.replace(/^\/?xl\//, '');
    const xml = get('xl/' + target);
    const rows = [];
    for (const r of xml.matchAll(/<row [^>]*?r="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const ri = +r[1] - 1;
      const row = [];
      for (const c of (r[2] || '').matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const ref = (attrs.match(/r="([A-Z]+)\d+"/) || [])[1];
        if (!ref) continue;
        const type = (attrs.match(/t="(\w+)"/) || [])[1];
        const s = +((attrs.match(/s="(\d+)"/) || [])[1] || 0);
        const body = c[2] || '';
        let v = null;
        const vm = body.match(/<v>([\s\S]*?)<\/v>/);
        if (type === 's') v = vm ? shared[+vm[1]] ?? '' : '';
        else if (type === 'inlineStr') v = xmlText([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));
        else if (type === 'str' || type === 'e') v = vm ? xmlText(vm[1]) : '';
        else if (type === 'b') v = vm ? vm[1] === '1' : null;
        else if (vm) { const n = parseFloat(vm[1]); v = dateStyle[s] && n > 20000 && n < 80000 ? excelDate(n) : n; }
        row[colIndex(ref)] = v;
      }
      rows[ri] = Array.from(row, (x) => (x === undefined ? null : x));
    }
    sheets.push({ name: xmlText(m[1]), rows: Array.from(rows, (x) => x || []) });
  }
  return { sheets };
}

// CSV (; , veya sekme ile ayrılmış), tırnaklı alanlar desteklenir
export function readCsv(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const delim = ['\t', ';', ','].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return { sheets: [{ name: 'CSV', rows: rows.map((r) => r.map((v) => { const t = v.trim(); return t === '' ? null : /^-?\d+([.,]\d+)?$/.test(t) && !/^0\d/.test(t) ? parseFloat(t.replace(',', '.')) : t; })) }] };
}

// DOCX → düz metin (paragraf başına satır)
export async function readDocxText(buf) {
  const files = await unzip(buf);
  const xml = new TextDecoder().decode(files.get('word/document.xml') || new Uint8Array());
  return xml.split(/<\/w:p>/).map((p) => xmlText([...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join(''))).filter((x) => x.trim()).join('\n');
}

// PDF → sayfa sayfa metin parçaları {str, x, y}. pdf.js ilk kullanımda yüklenir (internet üzerinden açılan sitede çalışır).
let pdfjsPromise = null;
export async function readPdf(buf) {
  if (!pdfjsPromise) {
    const base = new URL('vendor/pdfjs/', document.baseURI).href;
    pdfjsPromise = import(base + 'pdf.mjs').then((m) => { m.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.mjs'; return m; });
  }
  const pdfjs = await pdfjsPromise;
  // kopya ver: pdf.js tamponu işçiye aktarıp boşaltıyor (orijinal dosya saklanacak)
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    pages.push({ width: vp.width, items: tc.items.filter((it) => it.str && it.str.trim()).map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] })) });
  }
  return pages;
}

// PDF parçalarını satırlara çevir. columns=true ise sayfa ortasından ikiye bölünür (iki sütunlu transkript).
export function pdfLines(pages, columns = false) {
  const out = [];
  for (const pg of pages) {
    const groups = columns ? [pg.items.filter((i) => i.x < pg.width / 2), pg.items.filter((i) => i.x >= pg.width / 2)] : [pg.items];
    for (const items of groups) {
      const rows = [];
      for (const it of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
        const r = rows.find((x) => Math.abs(x.y - it.y) < 3);
        if (r) r.items.push(it); else rows.push({ y: it.y, items: [it] });
      }
      for (const r of rows) out.push(r.items.sort((a, b) => a.x - b.x).map((i) => i.str.trim()).join('  '));
    }
  }
  return out;
}

// Dosyayı türüne göre oku: { kind: 'sheet'|'text'|'pdf', book?, text?, pages? }
export async function readAny(name, buf) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'xlsx' || ext === 'xlsm') return { kind: 'sheet', book: await readXlsx(buf) };
  if (ext === 'csv' || ext === 'tsv') return { kind: 'sheet', book: readCsv(new TextDecoder().decode(buf)) };
  if (ext === 'docx') return { kind: 'text', text: await readDocxText(buf) };
  if (ext === 'pdf') { const pages = await readPdf(buf); return { kind: 'pdf', pages, text: pdfLines(pages).join('\n') }; }
  if (ext === 'json') return { kind: 'json', json: JSON.parse(new TextDecoder().decode(buf)) };
  if (ext === 'txt') return { kind: 'text', text: new TextDecoder().decode(buf) };
  if (ext === 'xls') throw new Error('xls');
  throw new Error('ext');
}
