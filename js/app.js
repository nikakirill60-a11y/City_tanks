import { Garage } from './garage.js';
import { Battle } from './battle.js';
import { SoundFX } from './audio.js';
import { loadProfile } from './profile.js';
import { getTank, loadCustomProfiles, registerCustomTank } from './data/tanks.js';
import { Leaderboard } from './firebase.js';
import { $, show, toast, fmt, escapeHtml } from './ui.js';

// ============================================================
//  Точка входа: экраны ангар → бой → результаты
// ============================================================
const sound = new SoundFX();

// Танки, собранные в редакторе моделей, поднимаем ДО профиля,
// чтобы прогресс по ним сохранялся как у обычных машин
for (const p of loadCustomProfiles()) {
  try { registerCustomTank(p); } catch (e) { console.warn('custom tank', e); }
}

const profile = loadProfile();
sound.setEnabled(profile.settings.sound);

const leaderboard = new Leaderboard();
let battle = null;
let mode = 'garage';

const garage = new Garage({ profile, sound, onBattle: startBattle });

// ---------------- Бой ----------------
function startBattle(tankId) {
  const tank = getTank(tankId);
  if (!tank || !profile.tanks[tankId]?.owned) {
    toast('Сначала купите танк');
    return;
  }
  show($('screen-garage'), false);
  show($('screen-results'), false);
  show($('screen-battle'), true);
  mode = 'battle';
  if (battle) { battle.dispose(); battle = null; }

  // свежий canvas: WebGL-контекст нельзя переиспользовать между боями
  const oldCanvas = document.getElementById('game-canvas');
  if (oldCanvas) {
    const fresh = document.createElement('canvas');
    fresh.id = 'game-canvas';
    oldCanvas.replaceWith(fresh);
  }

  battle = new Battle({
    canvas: $('game-canvas'),
    profile,
    tankId,
    sound,
    onFinish: finishBattle,
  });
  sound.ensure();
}

function finishBattle(result) {
  mode = 'results';
  const title = result.win === null ? 'Ничья' : result.win ? 'Победа!' : 'Поражение';
  const titleEl = $('res-title');
  titleEl.textContent = title;
  titleEl.className = result.win ? 'win' : 'lose';

  $('res-stats').innerHTML = `
    <div class="res-row"><span>Танк</span><b>${escapeHtml(result.tankName)}</b></div>
    <div class="res-row"><span>Нанесённый урон</span><b>${fmt(result.damage)}</b></div>
    <div class="res-row"><span>Уничтожено машин</span><b>${result.kills}</b></div>
    <div class="res-row"><span>Засвечено противников</span><b>${result.spots}</b></div>
    <div class="res-row"><span>Танк уцелел</span><b>${result.survived ? 'да' : 'нет'}</b></div>
    <div class="res-row"><span>Причина</span><b>${reasonText(result.reason)}</b></div>`;

  $('res-rewards').innerHTML = `
    <div class="reward xp"><b>+${fmt(result.xp)}</b>опыт</div>
    <div class="reward silver"><b>+${fmt(result.credits)}</b>серебро</div>`;

  show($('screen-battle'), false);
  show($('screen-results'), true);

  if (result.win) sound.victory(); else sound.defeat();

  // Рекорд в таблицу (Firestore или localStorage)
  const score = Math.round(result.damage + result.kills * 150 + result.spots * 30 + (result.win ? 500 : 0));
  leaderboard.save(profile.name, score, Math.round(result.xp), result.kills, Math.round(result.damage))
    .catch(() => {});
}

function reasonText(reason) {
  return ({
    all: 'уничтожена вся команда',
    cap: 'захват базы',
    time: 'истекло время',
    draw: 'равные силы',
    leave: 'выход из боя',
  })[reason] || '—';
}

function leaveBattle() {
  if (!battle) return;
  battle.finish(false, 'leave');
  show($('screen-pause'), false);
}

// ---------------- Экраны ----------------
function backToGarage() {
  if (battle) { battle.dispose(); battle = null; }
  mode = 'garage';
  show($('screen-battle'), false);
  show($('screen-results'), false);
  show($('screen-pause'), false);
  show($('screen-garage'), true);
  garage.refreshProfile(profile);
  garage.resize();
}

function againBattle() {
  const id = profile.selected;
  show($('screen-results'), false);
  startBattle(id);
}

$('btn-to-garage').onclick = backToGarage;
$('btn-again').onclick = againBattle;
$('btn-resume').onclick = () => { battle?.resume(); };
$('btn-leave').onclick = leaveBattle;

// ---------------- Главный цикл ----------------
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (mode === 'garage') garage.update(dt);
  else if (mode === 'battle' && battle) battle.update(dt);
}
requestAnimationFrame(loop);

// Убираем экран загрузки
const boot = $('boot');
if (boot) boot.remove();

// Приветствие
setTimeout(() => toast('Добро пожаловать в ангар! Выберите танк и жмите «В бой»', 3200), 400);
