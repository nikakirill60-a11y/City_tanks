# 🚀 Деплой City Tanks

Три площадки, один и тот же статический сайт. Никакой сборки не нужно: `index.html`, `css/`, `js/`, `vendor/`.

---

## 1. GitHub Pages

Workflow `.github/workflows/deploy.yml` уже в репозитории и пытается сам включить Pages
(`configure-pages` с `enablement: true`). Если у токена нет прав администратора репозитория,
включи Pages один раз руками:

1. Открой **Settings → Pages**.
2. **Source: GitHub Actions** (не «Deploy from a branch»).
3. Перезапусти workflow: **Actions → Deploy City Tanks to GitHub Pages → Re-run all jobs**
   (или просто сделай любой коммит в `main`).

Сайт будет на `https://nikakirill60-a11y.github.io/City_tanks/`.

---

## 2. Vercel

Проект `city-tanks` создан и привязан к репозиторию — **деплой идёт автоматически**
при пуше в `main` (production) и в PR (preview):

- production: https://city-tanks-git-main-super-abobus-projects.vercel.app
- редактор моделей: тот же домен + `/models.html`

Если нужно пересоздать проект с нуля:

- **Вариант А (панель):** [vercel.com/new](https://vercel.com/new) → импорт `City_tanks` →
  Framework Preset **Other**, Build Command пусто, Output Directory пусто → **Deploy**.
- **Вариант Б (кнопка):** [vercel.com/new/clone?repository-url=https://github.com/nikakirill60-a11y/City_tanks](https://vercel.com/new/clone?repository-url=https://github.com/nikakirill60-a11y/City_tanks)
- **Вариант В (CLI):**
  ```bash
  npm i -g vercel
  vercel --prod          # из корня репозитория
  ```

`vercel.json` уже настроен: статика без сборки + security-заголовки.

---

## 3. Firebase Hosting + Firestore

```bash
npm i -g firebase-tools
firebase login
firebase use --add            # выбери свой проект
firebase deploy --only hosting,firestore:rules
```

`firebase.json`: `public: "."`, rewrites на `index.html`, заголовки.
`firestore.rules`: чтение всем, запись — только новые рекорды с валидными полями
(нельзя перезаписать/удалить чужой рекорд, счёт 0..10 000 000, имя ≤ 16 символов).

### Таблица рекордов

Без Firebase игра уже работает — рекорды лежат в `localStorage`.
Чтобы они были общими:

1. Firebase Console → **Firestore Database** → Create (production mode).
2. Project settings → **Your apps → Web app** → скопируй `firebaseConfig`.
3. Скопируй `firebase-config.example.js` → `js/firebase-config.js` и вставь конфиг.
4. В `index.html` перед `<script type="module" src="js/app.js">` добавь:
   ```html
   <script src="js/firebase-config.js"></script>
   ```

---

## Проверка перед публикацией

```bash
node tests/armor.test.mjs
node tests/data.test.mjs
node tests/battle.test.mjs
node tests/sim.test.mjs
node tests/structure.test.mjs
npx serve .        # или python3 -m http.server
```
