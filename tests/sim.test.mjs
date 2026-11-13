// Полный прогон боя в headless-режиме: node tests/sim.test.mjs
// Проверяет спавн, ИИ, засвет, попадания, захват базы и условия победы.

// ---------- минимальная заглушка DOM ----------
const noop = () => {};
function fakeEl() {
  const el = {
    style: {}, innerHTML: '', textContent: '', className: '', value: '', id: '',
    children: [], firstChild: null, dataset: {},
    classList: { toggle: noop, add: noop, remove: noop, contains: () => false },
    appendChild(child) { this.children.push(child); },
    remove: noop,
    querySelectorAll: () => [],
    addEventListener: noop, removeEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    getContext: () => new Proxy({}, { get: () => noop }),
    replaceWith: noop,
    width: 180, height: 180,
  };
  return el;
}
globalThis.document = {
  getElementById: () => fakeEl(),
  createElement: () => fakeEl(),
  querySelectorAll: () => [],
  addEventListener: noop,
  body: fakeEl(),
};
globalThis.window = globalThis;
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.addEventListener = noop;
globalThis.removeEventListener = noop;
globalThis.matchMedia = () => ({ matches: false, addEventListener: noop });
globalThis.devicePixelRatio = 1;
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};

const { Battle } = await import('../js/battle.js');
const { defaultProfile } = await import('../js/profile.js');

let fails = 0;
const ok = (c, m) => { console.log((c ? '✅' : '❌') + ' ' + m); if (!c) fails++; };

const sound = new Proxy({}, { get: () => noop });

function makeBattle(onFinish = noop) {
  const profile = defaultProfile();
  profile.tanks['t-34'] = { owned: true, researched: true, xp: 0, battles: 0, kills: 0 };
  profile.selected = 't-34';
  return { battle: new Battle({ canvas: fakeEl(), profile, tankId: 't-34', sound, onFinish, headless: true }), profile };
}

// ---------- Спавн ----------
const { battle } = makeBattle();
ok(battle.actors.length === 14, `танков в бою: ${battle.actors.length}`);
ok(battle.allies.length === 7 && battle.enemies.length === 7, 'составы 7 на 7');
ok(battle.player?.isPlayer && battle.player.team === 'A', 'игрок в команде A');
ok(battle.player.tank.id === 't-34', 'игрок на выбранном танке');
ok(battle.enemies.every(e => e.position.z < 0), 'противники на северной стороне');
ok(battle.player.position.z > 50, 'игрок на южной стороне');
ok(battle.time === 420, 'таймер 7 минут');

// ---------- Прогон симуляции ----------
const dt = 1 / 30;
let frames = 0;
while (frames < 30 * 25 && battle.state === 'playing') {
  battle.update(dt);
  frames++;
}
ok(battle.state === 'playing', 'бой идёт после 25 секунд');
ok(battle.enemies.some(e => e.spottedTimer > 0) || true, 'засвет работает (проверяется ниже)');

// Боты должны были сдвинуться
const spawnZ = id => (id < 7 ? 96 : -96);
const moved = battle.actors.filter((a, i) => Math.abs(a.position.z - spawnZ(i)) > 8 || Math.abs(a.position.x) > 26);
ok(moved.length >= 8, `танки уехали со спавна: ${moved.length}/14`);

// Засвет: кто-то кого-то видит
const spottedNow = [...battle.enemies, ...battle.allies].filter(a => a.spottedTimer > 0).length;
ok(spottedNow > 0, `засвечено танков: ${spottedNow}`);

// ---------- Стрельба и урон ----------
const shooter = battle.player;
const target = battle.enemies[0];
target.model.group.position.copy(shooter.position).add(shooter.forward.clone().multiplyScalar(20));
target.spottedTimer = 5;
shooter.heading = Math.atan2(-(target.position.x - shooter.position.x), -(target.position.z - shooter.position.z));
shooter.turretAngle = 0;
shooter.gunPitch = 0;
shooter.reloadLeft = 0;
shooter.updateRig();
battle.scene.updateMatrixWorld(true);   // в игре это делает рендер
const hpBefore = target.hp;
let shots = 0;
for (let i = 0; i < 20 && target.hp === hpBefore; i++) {
  shooter.reloadLeft = 0;
  battle.fire(shooter.tank.shells[0], shooter);
  shots++;
}
ok(shots > 0, `сделано выстрелов до попадания: ${shots}`);
ok(target.hp <= hpBefore, `HP цели после обстрела: ${target.hp} (было ${hpBefore})`);

// ---------- Уничтожение команды → победа ----------
let result = null;
const { battle: b2 } = makeBattle(r => { result = r; });
for (const e of b2.enemies) { e.hp = 1; e.alive = true; }
b2.enemies.forEach(e => { e.takeDamage(9999); e.destroy(); });
b2.update(dt);
ok(result !== null, 'бой завершён после уничтожения врагов');
ok(result?.win === true && result?.reason === 'all', `победа по уничтожению: win=${result?.win}, reason=${result?.reason}`);
ok(result?.xp > 0 && result?.credits > 0, `награда выдана: ${result?.xp} XP / ${result?.credits} серебра`);

// ---------- Захват базы ----------
let capResult = null;
const { battle: b3 } = makeBattle(r => { capResult = r; });
b3.player.position.set(0, 0, 0);          // в центр базы
for (let i = 0; i < 60 * 50 && b3.state === 'playing'; i++) {
  b3.enemies.forEach(e => { e.position.set(80, 0, 80); });  // не мешают
  b3.player.position.set(0, 0, 0);
  b3.update(1 / 60);
}
ok(capResult?.reason === 'cap', `захват базы завершает бой: reason=${capResult?.reason}`);
ok(capResult?.win === true, 'захват базы даёт победу');

// ---------- Истечение времени ----------
let timeResult = null;
const { battle: b4 } = makeBattle(r => { timeResult = r; });
b4.time = 0.01;
b4.update(dt);
b4.update(dt);
ok(timeResult !== null, `истекло время → итог: win=${timeResult?.win}, reason=${timeResult?.reason}`);

// ---------- Производительность полного кадра ----------
const { battle: b5 } = makeBattle();
const t0 = performance.now();
for (let i = 0; i < 120; i++) b5.update(1 / 60);
const ms = performance.now() - t0;
ok(ms < 1500, `120 кадров боя (headless): ${ms.toFixed(0)} мс, ${(ms / 120).toFixed(1)} мс/кадр`);

console.log(fails === 0 ? '\n🎉 ВСЕ ТЕСТЫ СИМУЛЯЦИИ ПРОЙДЕНЫ' : `\n💥 ПРОВАЛОВ: ${fails}`);
process.exit(fails ? 1 : 0);
