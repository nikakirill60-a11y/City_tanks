// Проверка целостности статического сайта: node tests/structure.test.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (c, m) => { console.log((c ? '✅' : '❌') + ' ' + m); if (!c) fails++; };

const html = readFileSync(resolve(root, 'index.html'), 'utf8');

// 1. Все локальные ссылки из HTML существуют
const refs = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(m => m[1])
  .filter(u => !u.startsWith('data:') && !u.startsWith('http'));
for (const r of new Set(refs)) ok(existsSync(resolve(root, r)), `файл на месте: ${r}`);

// 2. Никаких внешних зависимостей (кроме шрифтов системы)
ok(!/unpkg\.com|cdn\.jsdelivr|cdnjs|googleapis/.test(html), 'нет CDN-зависимостей в index.html');
ok(existsSync(resolve(root, 'vendor/three.module.js')), 'Three.js лежит локально в vendor/');

// 3. Все ES-модули js/ существуют и их размер разумный
for (const f of ['main', 'tank', 'city', 'effects', 'audio', 'firebase']) {
  const p = resolve(root, `js/${f}.js`);
  ok(existsSync(p) && statSync(p).size > 500, `js/${f}.js`);
}

// 4. Импорты внутри модулей разрешаются в реальные файлы
for (const f of ['main', 'tank', 'city', 'effects', 'audio']) {
  const src = readFileSync(resolve(root, `js/${f}.js`), 'utf8');
  for (const m of src.matchAll(/from '(\.[^']+)'/g)) {
    const target = resolve(root, 'js', m[1]);
    ok(existsSync(target), `js/${f}.js → ${m[1]}`);
  }
}

// 5. Все id, которые ищет main.js, есть в разметке
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const mainSrc = readFileSync(resolve(root, 'js/main.js'), 'utf8');
const used = new Set([...mainSrc.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]));
const missing = [...used].filter(id => !ids.has(id));
ok(missing.length === 0, `все id на месте${missing.length ? ': нет ' + missing.join(', ') : ''}`);

// 6. Конфиги деплоя
for (const f of ['vercel.json', 'firebase.json', 'firestore.rules', '.github/workflows/deploy.yml']) {
  ok(existsSync(resolve(root, f)), `конфиг деплоя: ${f}`);
}
// 7. JSON-конфиги валидны
for (const f of ['vercel.json', 'firebase.json']) {
  let valid = true;
  try { JSON.parse(readFileSync(resolve(root, f), 'utf8')); } catch { valid = false; }
  ok(valid, `${f} — валидный JSON`);
}

console.log(fails === 0 ? '\n🎉 СТРУКТУРА САЙТА В ПОРЯДКЕ' : `\n💥 ПРОВАЛОВ: ${fails}`);
process.exit(fails ? 1 : 0);
