// Tek dosyalık uygulama üretir: index.html (stil + kod + örnek dosyalar gömülü).
// PDF okuma için vendor/pdfjs/ klasörü index.html'in yanında durur (GitHub Pages'te birlikte yayınlanır).
// Kullanım: node build.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const r = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const logic = r('./src/logic.js').replace(/^export /gm, '');

// files/parsers/academic: her biri kendi ad alanında (FILES, PARSE, ACAD); dışa aktarılanlar otomatik toplanır
function namespaced(path, ns, deps = '') {
  const src = r(path);
  const names = [...src.matchAll(/^export (?:async )?(?:function|const|let) (\w+)/gm)].map((m) => m[1]);
  return `const ${ns} = (() => {\n${deps}${src.replace(/^export /gm, '').replace(/^import .*$/gm, '')}\nreturn { ${names.join(', ')} };\n})();`;
}
const files = namespaced('./src/files.js', 'FILES');
const parsers = namespaced('./src/parsers.js', 'PARSE');
const academic = namespaced('./src/academic.js', 'ACAD');

const i18n = r('./src/i18n.js') + '\n' + r('./src/i18n2.js');
const app = r('./src/app.js');
const pages = ['data.js', 'pages-general.js', 'pages-term.js'].map((f) => r('./src/' + f)).join('\n');
const css = r('./src/style.css') + '\n' + r('./src/pages.css');
const logo = 'data:image/png;base64,' + readFileSync(new URL('./src/logo.png', import.meta.url)).toString('base64');

// Örnek dosyalar (Veri Merkezi'ndeki "Örnek dosya" ve "Örnek dosyalarla başla" için)
const sampleDir = new URL('./samples/', import.meta.url);
const samples = Object.fromEntries(readdirSync(sampleDir).sort().map((f) => [f, readFileSync(new URL(f, sampleDir)).toString('base64')]));

const script = `${logic}\n${files}\n${parsers}\n${academic}\n${i18n}\n${app}\n${pages}\nOBS.boot();`;
// Sözdizimi hatası varsa index.html'i bozmadan dur
try { new Function(script); } catch (e) { console.error('Kodda sözdizimi hatası:', e.message); process.exit(1); }

const html = r('./src/template.html')
  .replaceAll('LOGO_SRC', logo)
  .replace('/*STYLE*/', () => css)
  .replace('/*DATA*/', () => `window.SAMPLES = ${JSON.stringify(samples)};`)
  .replace('/*SCRIPT*/', () => script);

writeFileSync(new URL('./index.html', import.meta.url), html);
console.log(`index.html yazıldı (${(html.length / 1024).toFixed(0)} KB)`);
