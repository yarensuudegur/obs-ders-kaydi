// Tek dosyalık uygulama üretir: index.html (veri + stil + kod gömülü, internetsiz çalışır)
// Kullanım: node build.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const r = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const mufredat = r('./data/mufredat.json');
const program = r('./data/program.json');
const logic = r('./src/logic.js').replace(/^export /gm, '');
const i18n = r('./src/i18n.js');
const app = r('./src/app.js');
const css = r('./src/style.css');
const logo = 'data:image/png;base64,' + readFileSync(new URL('./src/logo.png', import.meta.url)).toString('base64');

// Sözdizimi hatası varsa index.html'i bozmadan dur
try { new Function(`${logic}\n${i18n}\n${app}`); } catch (e) { console.error('Kodda sözdizimi hatası:', e.message); process.exit(1); }

const html = r('./src/template.html')
  .replaceAll('LOGO_SRC', logo)
  .replace('/*STYLE*/', () => css)
  .replace('/*DATA*/', () => `window.MUFREDAT = ${mufredat};\nwindow.PROGRAM = ${program};`)
  .replace('/*SCRIPT*/', () => `${logic}\n${i18n}\n${app}`);

writeFileSync(new URL('./index.html', import.meta.url), html);
console.log(`index.html yazıldı (${(html.length / 1024).toFixed(0)} KB)`);
