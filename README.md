# 🛡️ City Tanks — 3D танки в городе

3D танковая аркада в браузере: **HTML + JS + CSS + Three.js**. Ночной город, волны врагов с ИИ, взрывы, миникарта, синтезированные звуки и таблица рекордов на Firebase.

## 🎮 Как играть

| Клавиша | Действие |
|---|---|
| `W A S D` | Движение танка |
| Мышь | Поворот башни |
| ЛКМ | Огонь |
| `Shift` | Форсаж |
| `Esc` / `P` | Пауза |

На телефоне — виртуальный джойстик + кнопка огня.

## 🚀 Деплой (3 варианта)

### 1. GitHub Pages
1. Запушь в `main` — workflow `.github/workflows/deploy.yml` сам опубликует сайт.
2. В настройках репозитория: **Settings → Pages → Source: GitHub Actions**.

### 2. Vercel
1. Зайди на [vercel.com/new](https://vercel.com/new) → импортируй репозиторий.
2. Framework Preset: **Other**, Build Command: пусто, Output: корень репозитория.
3. Deploy — готово. Конфиг уже лежит в `vercel.json`.

### 3. Firebase Hosting
```bash
npm i -g firebase-tools
firebase login
firebase init hosting,firestore   # public dir = . (корень)
firebase deploy
```
Правила Firestore уже в `firestore.rules`.

## 🔥 Подключение Firebase (таблица рекордов)

Без конфига игра работает на `localStorage`. Чтобы рекорды были общими:

1. Создай проект на [console.firebase.google.com](https://console.firebase.google.com).
2. Включи **Firestore Database** (Production mode) и задеплой правила из `firestore.rules`.
3. **Project settings → Your apps → Web app (</>)** → скопируй `firebaseConfig`.
4. Вставь его в `js/firebase.js` (замени `window.FIREBASE_CONFIG`) или создай `js/firebase-config.js` с `window.FIREBASE_CONFIG = {...}` и подключи его в `index.html` **до** `main.js`.

## 📁 Структура

```
index.html            — разметка, HUD, меню
css/style.css         — весь стиль
js/main.js            — игровой цикл, ИИ, камера, волны
js/tank.js            — модель танка (Three.js примитивы)
js/city.js            — ночной город: здания, дороги, фонари
js/effects.js         — снаряды, взрывы, частицы
js/audio.js           — звуки на WebAudio (без файлов)
js/firebase.js        — рекорды: Firestore или localStorage
vercel.json / firebase.json / .github/workflows/deploy.yml — деплой
```

## 🛠 Локальный запуск

```bash
npx serve .        # или: python3 -m http.server 8000
```
Открыть `http://localhost:3000` (или :8000). Нужен интернет для CDN Three.js.
