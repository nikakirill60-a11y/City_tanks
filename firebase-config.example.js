// Шаблон конфига Firebase.
// 1. Скопируй этот файл в js/firebase-config.js
// 2. Вставь свои значения из Firebase Console → Project settings → Your apps → Web app
// 3. Подключи в index.html ПЕРЕД js/main.js:
//    <script src="js/firebase-config.js"></script>
// Без конфига игра работает: рекорды сохраняются локально в localStorage.
window.FIREBASE_CONFIG = {
  apiKey: 'ВСТАВЬ_API_KEY',
  authDomain: 'ТВОЙ_ПРОЕКТ.firebaseapp.com',
  projectId: 'ТВОЙ_ПРОЕКТ',
  storageBucket: 'ТВОЙ_ПРОЕКТ.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:0000000000000000000000',
};
