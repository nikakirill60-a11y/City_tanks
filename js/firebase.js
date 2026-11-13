// Firebase (Firestore) — таблица рекордов.
// Если конфиг не задан, автоматически работает локальный режим (localStorage).
// Как подключить: создай проект на https://console.firebase.google.com,
// включи Firestore, вставь свой конфиг в window.FIREBASE_CONFIG ниже
// (или в отдельном firebase-config.js, подключённом ДО app.js).

const FIREBASE_CONFIG = window.FIREBASE_CONFIG || null;
const LS_KEY = 'city_tanks_scores';

let db = null;
let app = null;

async function initFirebase() {
  if (!FIREBASE_CONFIG) return false;
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    app = initializeApp(FIREBASE_CONFIG);
    db = getFirestore(app);
    return true;
  } catch (e) {
    console.warn('[City Tanks] Firebase недоступен, локальный режим:', e.message);
    return false;
  }
}

function lsGet() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function lsSet(list) { try { localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, 10))); } catch {} }

export class Leaderboard {
  constructor() { this.ready = initFirebase(); this.mode = 'local'; }

  async getTop() {
    const ok = await this.ready;
    if (ok && db) {
      try {
        const { collection, query, orderBy, limit, getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
        const snap = await getDocs(query(collection(db, 'scores'), orderBy('score', 'desc'), limit(10)));
        const list = snap.docs.map(d => d.data());
        if (list.length) { this.mode = 'firebase'; return list; }
      } catch (e) { console.warn('[City Tanks] Firestore read failed:', e.message); }
    }
    return lsGet();
  }

  async save(name, score, wave, kills, time) {
    const entry = { name: (name || 'Командир').slice(0, 16), score, wave, kills, time, date: new Date().toISOString() };
    const ok = await this.ready;
    if (ok && db) {
      try {
        const { collection, addDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
        await addDoc(collection(db, 'scores'), entry);
        this.mode = 'firebase';
        return entry;
      } catch (e) { console.warn('[City Tanks] Firestore write failed:', e.message); }
    }
    const list = lsGet();
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    lsSet(list);
    return entry;
  }
}
