import * as THREE from '../vendor/three.module.js';
import { Tank } from './tank.js';
import { buildCity, WORLD } from './city.js';
import { Effects } from './effects.js';
import { SoundFX } from './audio.js';
import { Leaderboard } from './firebase.js';

// ================= Сцена =================
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e1a);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);

const { colliders } = buildCity(scene);
const fx = new Effects(scene);
const sfx = new SoundFX();
const board = new Leaderboard();

// ================= Состояние игры =================
const G = {
  state: 'menu', // menu | playing | paused | over
  player: null,
  enemies: [],
  wave: 0,
  score: 0,
  kills: 0,
  time: 0,
  spawnQueue: 0,
  spawnTimer: 0,
  smokeTimer: 0,
  camShake: 0,
};
const keys = {};
const mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false };
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aimPoint = new THREE.Vector3();

// ================= UI =================
const $ = id => document.getElementById(id);
const hud = $('hud'), menu = $('menu'), pauseMenu = $('pause-menu'), gameover = $('gameover');
const isTouch = 'ontouchstart' in window;

async function refreshBoard() {
  const list = await board.getTop();
  const ol = $('leaderboard-list');
  ol.innerHTML = list.length
    ? list.map(s => `<li><b>${escapeHtml(s.name)}</b> — ${s.score} очков · волна ${s.wave} · ${s.kills} убийств</li>`).join('')
    : '<li>Пока пусто — стань первым!</li>';
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function show(el, on) { el.classList.toggle('hidden', !on); }
function setState(s) {
  G.state = s;
  show(menu, s === 'menu');
  show(pauseMenu, s === 'paused');
  show(gameover, s === 'over');
  show(hud, s === 'playing' || s === 'paused');
  show($('touch-controls'), s === 'playing' && isTouch);
}

// ================= Старт / волны =================
function startGame() {
  if (G.player) G.player.dispose();
  for (const e of G.enemies) e.dispose();
  G.enemies = [];
  fx.clear();
  mouse.down = false;
  G.camShake = 0;
  G.smokeTimer = 0;
  $('btn-save-score').textContent = '💾 Сохранить рекорд';
  $('btn-save-score').disabled = false;
  G.player = new Tank(scene, { isPlayer: true, hp: 100, speed: 15, position: new THREE.Vector3(0, 0, 0), heading: Math.PI });
  G.wave = 0; G.score = 0; G.kills = 0; G.time = 0;
  setState('playing');
  nextWave();
}

function nextWave() {
  G.wave++;
  G.spawnQueue = 2 + G.wave * 2;
  G.spawnTimer = 0.5;
  $('wave-num').textContent = G.wave;
  show($('wave-banner'), true);
  setTimeout(() => show($('wave-banner'), false), 2300);
  sfx.wave();
}

function spawnEnemy() {
  // Спавн на краю карты, подальше от игрока
  let x, z, tries = 0;
  const lanes = [-80, -40, 0, 40, 80];
  do {
    const side = Math.floor(Math.random() * 4);
    const off = lanes[Math.floor(Math.random() * lanes.length)] + (Math.random() - 0.5) * 3;
    if (side === 0) { x = off; z = -104; } else if (side === 1) { x = off; z = 104; }
    else if (side === 2) { x = -104; z = off; } else { x = 104; z = off; }
    tries++;
  } while (G.player && Math.hypot(x - G.player.position.x, z - G.player.position.z) < 45 && tries < 20);
  const hp = 60 + G.wave * 15;
  const speed = 9 + Math.min(6, G.wave * 0.5) + Math.random() * 2;
  const e = new Tank(scene, { hp, speed, damage: 12 + G.wave * 2, reload: Math.max(0.7, 1.6 - G.wave * 0.08), position: new THREE.Vector3(x, 0, z) });
  G.enemies.push(e);
}

function gameOver() {
  sfx.gameOver();
  mouse.down = false;
  fx.clearBullets();
  G.camShake = 0.8;
  $('final-stats').innerHTML = `Счёт: <b>${G.score}</b> · Волна: <b>${G.wave}</b><br>Убийств: <b>${G.kills}</b> · Время: <b>${fmtTime(G.time)}</b>`;
  setState('over');
}

// ================= Ввод =================
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (G.state === 'playing') setState('paused');
    else if (G.state === 'paused') setState('playing');
  }
});
addEventListener('keyup', e => keys[e.code] = false);
const crosshairEl = $('crosshair');
addEventListener('mousemove', e => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  // Прицел следует за мышью — туда же смотрит и ствол
  crosshairEl.style.left = e.clientX + 'px';
  crosshairEl.style.top = e.clientY + 'px';
});
addEventListener('mousedown', e => { if (e.button === 0) mouse.down = true; });
addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Сенсорный джойстик
const joy = { active: false, dx: 0, dy: 0 };
if (isTouch) {
  const joyEl = $('joystick'), knob = $('joystick-knob');
  const setKnob = (dx, dy) => knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  joyEl.addEventListener('touchstart', e => { joy.active = true; e.preventDefault(); }, { passive: false });
  addEventListener('touchmove', e => {
    if (!joy.active) return;
    const t = e.touches[0], r = joyEl.getBoundingClientRect();
    let dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy), max = 44;
    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
    joy.dx = dx / max; joy.dy = dy / max;
    setKnob(dx, dy);
  }, { passive: false });
  addEventListener('touchend', () => { joy.active = false; joy.dx = joy.dy = 0; setKnob(0, 0); });
  const fireBtn = $('btn-fire');
  fireBtn.addEventListener('touchstart', e => { mouse.down = true; e.preventDefault(); }, { passive: false });
  fireBtn.addEventListener('touchend', () => mouse.down = false);
  // Башня на телефоне — в сторону движения
  addEventListener('touchmove', e => {
    if (joy.active && e.touches[0]) { mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; }
  }, { passive: true });
}

$('btn-start').onclick = () => { sfx.ensure(); startGame(); };
$('btn-pause').onclick = () => setState('paused');
$('btn-resume').onclick = () => setState('playing');
$('btn-restart').onclick = startGame;
$('btn-again').onclick = startGame;
$('btn-quit').onclick = () => setState('menu');
$('btn-menu').onclick = () => setState('menu');
$('btn-sound').onclick = e => { e.target.textContent = sfx.toggle() ? '🔊' : '🔇'; };
$('btn-save-score').onclick = async () => {
  await board.save($('player-name').value, G.score, G.wave, G.kills, Math.round(G.time));
  $('btn-save-score').textContent = '✅ Сохранено';
  $('btn-save-score').disabled = true;
  refreshBoard();
};

// ================= ИИ врагов =================
function updateEnemy(e, dt) {
  if (!e.alive) return;
  const p = G.player;
  const toPlayer = p.position.clone().sub(e.position);
  const dist = toPlayer.length();
  toPlayer.normalize();

  // Наведение башни на игрока
  e.aimAt(p.position.clone().add(new THREE.Vector3(0, 1, 0)));

  let throttle = 0, steer = 0;
  const desired = Math.atan2(-toPlayer.x, -toPlayer.z);
  let diff = desired - e.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  if (dist > 26) { throttle = 1; steer = Math.max(-1, Math.min(1, diff * 1.6)); }
  else if (dist < 14) { throttle = -0.6; steer = Math.max(-1, Math.min(1, -diff * 1.6)); }
  else { throttle = 0.25; steer = Math.max(-1, Math.min(1, diff * 1.2)); }

  // Обход зданий: если впереди препятствие — рулим в сторону
  const ahead = e.position.clone().addScaledVector(e.forwardVec(), 7);
  for (const c of colliders) {
    if (ahead.x > c.minX - 2 && ahead.x < c.maxX + 2 && ahead.z > c.minZ - 2 && ahead.z < c.maxZ + 2) {
      steer = (e.position.x < (c.minX + c.maxX) / 2 ? -1 : 1);
      throttle = 1;
      break;
    }
  }
  e.move(throttle, steer, dt, colliders);

  // Огонь
  if (dist < 55 && e.canShoot()) {
    const spread = (Math.random() - 0.5) * 0.08;
    const dir = e.getBarrelDir();
    dir.x += spread; dir.z += spread; dir.normalize();
    fx.fireBullet(e.getMuzzleWorld(), dir, e, 62);
    e.shoot();
    sfx.enemyShoot();
  }
}

// Прицельная марка на земле
const reticle = new THREE.Mesh(
  new THREE.RingGeometry(1.6, 2.1, 24),
  new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
);
reticle.rotation.x = -Math.PI / 2;
reticle.visible = false;
scene.add(reticle);

// ================= Камера =================
function updateCamera(dt) {
  const p = G.player;
  if (!p) return;
  const back = p.forwardVec().multiplyScalar(-16);
  const target = p.position.clone().add(back).add(new THREE.Vector3(0, 10, 0));
  camera.position.lerp(target, 1 - Math.pow(0.001, dt));
  const look = p.position.clone().add(p.forwardVec().multiplyScalar(8)).add(new THREE.Vector3(0, 1.5, 0));
  camera.lookAt(look);
  if (G.camShake > 0) {
    G.camShake -= dt;
    camera.position.x += (Math.random() - 0.5) * G.camShake * 1.4;
    camera.position.y += (Math.random() - 0.5) * G.camShake * 1.4;
  }
}

// ================= HUD / миникарта =================
function fmtTime(t) { return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`; }
const mm = $('minimap').getContext('2d');
function drawMinimap() {
  const S = 160, k = S / WORLD.size;
  mm.fillStyle = '#141a2a'; mm.fillRect(0, 0, S, S);
  mm.fillStyle = '#3a4a6e';
  for (const c of colliders) mm.fillRect((c.minX + WORLD.half) * k, (c.minZ + WORLD.half) * k, (c.maxX - c.minX) * k, (c.maxZ - c.minZ) * k);
  for (const e of G.enemies) {
    if (!e.alive) continue;
    mm.fillStyle = '#ff4757';
    mm.beginPath(); mm.arc((e.position.x + WORLD.half) * k, (e.position.z + WORLD.half) * k, 3, 0, 7); mm.fill();
  }
  if (G.player?.alive) {
    mm.fillStyle = '#37d67a';
    mm.beginPath(); mm.arc((G.player.position.x + WORLD.half) * k, (G.player.position.z + WORLD.half) * k, 4, 0, 7); mm.fill();
  }
}

function updateHUD() {
  const p = G.player;
  if (!p) return;
  const hpPct = Math.max(0, p.hp / p.maxHp * 100);
  const hpEl = $('hud-health');
  hpEl.style.width = hpPct + '%';
  hpEl.classList.toggle('low', hpPct < 30);
  $('hud-reload').style.width = (p.reloadProgress() * 100) + '%';
  $('hud-score').textContent = 'СЧЁТ ' + G.score;
  $('hud-wave').textContent = 'ВОЛНА ' + G.wave;
  $('hud-enemies').textContent = 'Врагов: ' + (G.enemies.filter(e => e.alive).length + G.spawnQueue);
  $('hud-kills').textContent = '💀 Убийств: ' + G.kills;
  $('hud-time').textContent = '⏱ ' + fmtTime(G.time);
}

// ================= Главный цикл =================
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (G.state === 'playing' && G.player) {
    G.time += dt;
    const p = G.player;

    // Движение игрока
    let throttle = 0, steer = 0;
    if (keys.KeyW || keys.ArrowUp) throttle += 1;
    if (keys.KeyS || keys.ArrowDown) throttle -= 1;
    if (keys.KeyA || keys.ArrowLeft) steer -= 1;
    if (keys.KeyD || keys.ArrowRight) steer += 1;
    if (joy.active) { throttle = -joy.dy; steer = joy.dx; }
    const boost = (keys.ShiftLeft || keys.ShiftRight) ? 1.5 : 1;
    const baseSpeed = p.speed;
    p.speed = baseSpeed * boost;
    p.move(throttle, steer, dt, colliders);
    p.speed = baseSpeed;

    // Башня по мыши
    raycaster.setFromCamera(new THREE.Vector2((mouse.x / innerWidth) * 2 - 1, -(mouse.y / innerHeight) * 2 + 1), camera);
    raycaster.ray.intersectPlane(groundPlane, aimPoint);
    if (aimPoint) {
      p.aimAt(aimPoint);
      reticle.position.set(aimPoint.x, 0.08, aimPoint.z);
      reticle.visible = true;
    }

    // Огонь
    if (mouse.down && p.canShoot()) {
      fx.fireBullet(p.getMuzzleWorld(), p.getBarrelDir(), p, 78);
      p.shoot();
      sfx.shoot();
      G.camShake = Math.max(G.camShake, 0.25);
    }
    p.update(dt);

    // Спавн волн
    if (G.spawnQueue > 0) {
      G.spawnTimer -= dt;
      if (G.spawnTimer <= 0) { spawnEnemy(); G.spawnQueue--; G.spawnTimer = 1.2; }
    } else if (G.enemies.every(e => !e.alive)) {
      nextWave();
    }

    // Враги
    for (const e of G.enemies) {
      e.update(dt);
      if (e.alive) updateEnemy(e, dt);
    }
    // Уборка мёртвых
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      if (!G.enemies[i].alive) { G.enemies[i].dispose(); G.enemies.splice(i, 1); }
    }

    // Дым из повреждённых танков
    G.smokeTimer -= dt;
    if (G.smokeTimer <= 0) {
      G.smokeTimer = 0.12;
      for (const t of [p, ...G.enemies]) {
        if (t.alive && t.hp < t.maxHp * 0.5) fx.smoke(t.position.clone().add(new THREE.Vector3(0, 2, 0)));
      }
    }

    fx.update(dt, colliders, [p, ...G.enemies], (owner, target) => {
      const died = target.takeDamage(owner === p ? 25 : (owner?.damage ?? 15));
      sfx.hit();
      if (target === p) {
        $('damage-flash').style.opacity = 1;
        setTimeout(() => $('damage-flash').style.opacity = 0, 120);
        G.camShake = Math.max(G.camShake, 0.5);
      }
      if (died) {
        fx.explosion(target.position.clone().add(new THREE.Vector3(0, 1.5, 0)));
        sfx.explosion();
        if (target === p) { gameOver(); }
        else if (owner === p) {
          G.kills++;
          const pts = 100 + G.wave * 25;
          G.score += pts;
        }
      }
    });

    updateHUD();
    drawMinimap();
  } else if (G.state === 'menu') {
    // Медленный облёт города в меню
    const t = performance.now() * 0.0001;
    camera.position.set(Math.cos(t) * 70, 34, Math.sin(t) * 70);
    camera.lookAt(0, 4, 0);
    fx.update(dt, colliders, [], () => {});
  }

  if (G.state !== 'playing') reticle.visible = false;
  if (G.state === 'playing' || G.state === 'paused') updateCamera(dt);
  renderer.render(scene, camera);
}

setState('menu');
refreshBoard();
loop();
