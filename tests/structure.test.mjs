// Проверка целостности сайта: node tests/structure.test.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (c, m) => { console.log((c ? '✅' : '❌') + ' ' + m); if (!c) fails++; };

const read = (p) => readFileSync(resolve(root, p), 'utf8');

// ---------- 1. Локальные ссылки из HTML ----------
for (const page of ['index.html', 'models.html']) {
  const html = read(page);
  const refs = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(m => m[1])
    .filter(u => !u.startsWith('data:') && !u.startsWith('http'));
  for (const r of new Set(refs)) ok(existsSync(resolve(root, r)), `${page}: файл ${r}`);
}

// ---------- 2. Без внешних CDN ----------
for (const page of ['index.html', 'models.html']) {
  const html = read(page);
  ok(!/unpkg\.com|cdn\.jsdelivr|cdnjs\.cloudflare|ajax\.googleapis/.test(html), `${page}: нет CDN-зависимостей`);
}
ok(existsSync(resolve(root, 'vendor/three.module.js')), 'Three.js лежит локально в vendor/');

// ---------- 3. Модули существуют ----------
const modules = ['app', 'garage', 'battle', 'model', 'armor', 'profile', 'audio', 'ui', 'city', 'firebase', 'models', 'data/tanks'];
for (const m of modules) {
  const p = resolve(root, `js/${m}.js`);
  ok(existsSync(p) && statSync(p).size > 500, `js/${m}.js`);
}

// ---------- 4. Импорты разрешаются ----------
for (const m of modules) {
  const src = read(`js/${m}.js`);
  for (const match of src.matchAll(/from '(\.[^']+)'/g)) {
    const target = resolve(root, 'js', match[1]);
    ok(existsSync(target), `js/${m}.js → ${match[1]}`);
  }
}

// ---------- 5. Все id из JS есть в HTML ----------
function checkIds(page, scripts) {
  const ids = new Set([...read(page).matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  const used = new Set();
  for (const s of scripts) {
    const src = read(s);
    for (const m of src.matchAll(/\$\('([^']+)'\)/g)) used.add(m[1]);
  }
  const missing = [...used].filter(id => !ids.has(id));
  ok(missing.length === 0, `${page}: все id на месте${missing.length ? ' — нет: ' + missing.join(', ') : ''}`);
}
checkIds('index.html', ['js/app.js', 'js/garage.js', 'js/battle.js']);
checkIds('models.html', ['js/models.js']);

// ---------- 6. Конфиги деплоя ----------
for (const f of ['vercel.json', 'firebase.json', 'firestore.rules', '.github/workflows/deploy.yml', '.github/workflows/tests.yml']) {
  ok(existsSync(resolve(root, f)), `конфиг деплоя: ${f}`);
}
for (const f of ['vercel.json', 'firebase.json']) {
  let valid = true;
  try { JSON.parse(read(f)); } catch { valid = false; }
  ok(valid, `${f} — валидный JSON`);
}

// ---------- 7. Workflow запускает существующие тесты ----------
const wf = read('.github/workflows/tests.yml');
for (const t of ['tests/armor.test.mjs', 'tests/data.test.mjs', 'tests/battle.test.mjs', 'tests/sim.test.mjs', 'tests/structure.test.mjs']) {
  ok(existsSync(resolve(root, t)), `тест на месте: ${t}`);
  ok(wf.includes(t), `CI запускает ${t}`);
}

// ---------- 8. HTML подключает нужный скрипт ----------
ok(/js\/app\.js/.test(read('index.html')), 'index.html подключает js/app.js');
ok(/js\/models\.js/.test(read('models.html')), 'models.html подключает js/models.js');

console.log(fails === 0 ? '\n🎉 СТРУКТУРА САЙТА В ПОРЯДКЕ' : `\n💥 ПРОВАЛОВ: ${fails}`);
process.exit(fails ? 1 : 0);
