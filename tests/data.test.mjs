// Тесты данных танков, модели и прогрессии: node tests/data.test.mjs
import * as THREE from '../vendor/three.module.js';
import { TANKS, TECH_TREE, REQUIREMENTS, NATIONS, CLASSES, getTank, tankToProfile, nextTank } from '../js/data/tanks.js';
import { createTankModel, disposeModel, profileBounds } from '../js/model.js';

let fails = 0;
const ok = (c, m) => { console.log((c ? '✅' : '❌') + ' ' + m); if (!c) fails++; };
const near = (a, b, eps = 0.01) => Math.abs(a - b) < eps;

// ---------- Структура данных ----------
ok(TANKS.length >= 13, `танков в игре: ${TANKS.length}`);
ok(new Set(TANKS.map(t => t.id)).size === TANKS.length, 'ID танков уникальны');

let bad = [];
for (const t of TANKS) {
  if (!t.name || !NATIONS[t.nation] || !CLASSES[t.class]) bad.push(`${t.id}: нация/класс`);
  if (!(t.tier >= 1 && t.tier <= 10)) bad.push(`${t.id}: уровень`);
  if (!(t.hp > 0 && t.speed > 0 && t.hullTraverse > 0 && t.turretTraverse > 0)) bad.push(`${t.id}: подвижность`);
  if (!(t.viewRange > 0 && t.camo >= 0 && t.camo < 1)) bad.push(`${t.id}: обзор/маскировка`);
  for (const z of ['hullFront', 'hullSide', 'hullRear', 'turretFront', 'turretSide', 'turretRear']) {
    if (!(t.armor?.[z] > 0)) bad.push(`${t.id}: броня ${z}`);
  }
  if (!(t.gun?.reload > 0 && t.gun?.aimTime > 0 && t.gun?.dispersion > 0)) bad.push(`${t.id}: орудие`);
  if (!(t.gun?.depression > 0 && t.gun?.elevation > 0)) bad.push(`${t.id}: углы наводки`);
  if (!Array.isArray(t.shells) || t.shells.length !== 3) bad.push(`${t.id}: снаряды`);
  const types = (t.shells || []).map(s => s.type).join(',');
  if (types !== 'AP,APCR,HE') bad.push(`${t.id}: типы снарядов (${types})`);
  for (const s of t.shells || []) {
    if (!(s.pen > 0 && s.damage > 0 && s.speed > 0)) bad.push(`${t.id}: снаряд ${s.type}`);
  }
  if (!(t.cost && t.cost.xp >= 0 && t.cost.credits >= 0)) bad.push(`${t.id}: стоимость`);
}
ok(bad.length === 0, `все ТТХ корректны${bad.length ? ': ' + bad.slice(0, 5).join('; ') : ''}`);

// Баланс: тяжёлые крепче и медленнее лёгких
const byClass = (c) => TANKS.filter(t => t.class === c);
const avg = (arr, f) => arr.reduce((s, t) => s + f(t), 0) / arr.length;
ok(avg(byClass('HT'), t => t.armor.hullFront) > avg(byClass('LT'), t => t.armor.hullFront), 'ТТ бронированнее ЛТ');
ok(avg(byClass('LT'), t => t.speed) > avg(byClass('HT'), t => t.speed), 'ЛТ быстрее ТТ');
ok(avg(byClass('LT'), t => t.hp) < avg(byClass('HT'), t => t.hp), 'у ЛТ меньше прочности');

// ---------- Дерево ----------
const lines = Object.values(TECH_TREE);
let treeBad = [];
for (const line of lines) {
  for (let i = 0; i < line.length; i++) {
    const t = getTank(line[i]);
    if (!t) treeBad.push(`неизвестный ${line[i]}`);
    if (i === 0 && !REQUIREMENTS[line[i]] && t && t.cost.xp !== 0) treeBad.push(`${line[i]}: стартовый должен быть бесплатным`);
    if (REQUIREMENTS[line[i]] && !getTank(REQUIREMENTS[line[i]])) treeBad.push(`${line[i]}: неизвестное требование`);
    if (i > 0) {
      const prev = getTank(line[i - 1]);
      if (t && t.tier <= prev.tier) treeBad.push(`${line[i]}: уровень не растёт`);
      if (t && t.cost.xp <= 0) treeBad.push(`${line[i]}: платный танк без цены опыта`);
    }
  }
}
ok(treeBad.length === 0, `дерево прокачки целостно${treeBad.length ? ': ' + treeBad[0] : ''}`);
ok(nextTank('t-34')?.id === 'kv-1', 'Т-34 → КВ-1');
ok(nextTank('is-2') === null, 'у последнего танка ветки нет следующего');

// ---------- Модель ----------
const scene = new THREE.Scene();
let modelBad = [];
for (const t of TANKS) {
  const profile = tankToProfile(t);
  if (profile.version !== 1) modelBad.push(`${t.id}: версия профиля`);
  if (!profile.parts?.length) modelBad.push(`${t.id}: нет частей`);
  if (!profile.pivots?.turret || !profile.pivots?.muzzle) modelBad.push(`${t.id}: нет пивотов`);
  for (const p of profile.parts) {
    if (!p.type || !p.kind || !Array.isArray(p.size) || p.size.length < 2) modelBad.push(`${t.id}: часть без размера`);
    if (!Array.isArray(p.pos) || p.pos.length !== 3) modelBad.push(`${t.id}: часть без позиции`);
  }
  const model = createTankModel(profile);
  if (model.meshes.length < 8) modelBad.push(`${t.id}: мало мешей`);
  const b = profileBounds(profile);
  if (!(b.width > 1.5 && b.width < 7)) modelBad.push(`${t.id}: ширина ${b.width.toFixed(1)}`);
  if (!(b.length > 3.5 && b.length < 12)) modelBad.push(`${t.id}: длина ${b.length.toFixed(1)}`);

  // башня и орудие вращаются
  const m0 = model.muzzle.getWorldPosition(new THREE.Vector3());
  model.setTurretAngle(Math.PI / 2);
  model.group.updateWorldMatrix(true, true);
  const m1 = model.muzzle.getWorldPosition(new THREE.Vector3());
  if (m0.distanceTo(m1) < 0.5) modelBad.push(`${t.id}: башня не вращается`);
  model.setGunPitch(0.2);
  model.group.updateWorldMatrix(true, true);
  const m2 = model.muzzle.getWorldPosition(new THREE.Vector3());
  if (m2.y <= m1.y) modelBad.push(`${t.id}: орудие не поднимается`);
  disposeModel(model);
}
ok(modelBad.length === 0, `модели строятся и двигаются${modelBad.length ? ': ' + modelBad.slice(0, 4).join('; ') : ''}`);

// Количество полигонов на танк — модель должна быть лёгкой
const sample = createTankModel(tankToProfile(getTank('t-34')));
let tris = 0;
sample.meshes.forEach(m => {
  const g = m.geometry;
  tris += g.index ? g.index.count / 3 : (g.attributes.position?.count || 0) / 3;
});
ok(tris < 3000, `полигонов в Т-34: ${Math.round(tris)} (лёгкая модель)`);
disposeModel(sample);

// ---------- Прогресс ----------
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};

const P = await import('../js/profile.js');
const profile = P.defaultProfile();
ok(profile.tanks['t-26'].owned && profile.tanks['t-26'].researched, 'стартовый Т-26 в ангаре');
ok(!profile.tanks['t-34'].owned, 'Т-34 не куплен');
ok(P.ownTanks(profile).length === 3, `стартовых танков: ${P.ownTanks(profile).length}`);
ok(P.researchInfo(profile, 't-34').can === false, 'Т-34 нельзя исследовать без опыта');
ok(P.predecessorOf('t-34') === 'bt-7', 'предшественник Т-34 — БТ-7');

// опыт на БТ-7 → исследование Т-34
profile.tanks['bt-7'].researched = true;
profile.tanks['bt-7'].xp = 5000;
ok(P.researchInfo(profile, 't-34').can === true, 'с 5000 XP на БТ-7 Т-34 исследуется');
const res = P.research(profile, 't-34');
ok(res.ok && profile.tanks['t-34'].researched, 'Т-34 исследован');
ok(profile.tanks['bt-7'].xp === 5000 - 3200, `опыт списан: ${profile.tanks['bt-7'].xp}`);

// покупка
profile.credits = 100;
ok(P.buyInfo(profile, 't-34').can === false, 'без серебра не купить');
profile.credits = 50000;
ok(P.buy(profile, 't-34').ok, 'Т-34 куплен');
ok(profile.credits === 50000 - 16800, `серебро списано: ${profile.credits}`);
ok(profile.selected === 't-34', 'купленный танк выбран');
ok(P.ownTanks(profile).length === 4, 'в ангаре 4 танка');

// награды
const before = { credits: profile.credits, xp: profile.tanks['t-34'].xp };
const rewards = P.applyBattleResult(profile, { tankId: 't-34', win: true, damage: 1200, kills: 2, spots: 1, survived: true });
ok(rewards.xp > 0 && rewards.credits > 0, `награда: ${rewards.xp} XP, ${rewards.credits} серебра`);
ok(profile.credits > before.credits, 'серебро начислено');
ok(profile.tanks['t-34'].xp > before.xp, 'опыт начислен на танк');
ok(profile.stats.battles === 1 && profile.stats.wins === 1, 'статистика обновилась');

// сохранение/загрузка
P.saveProfile(profile);
ok(P.loadProfile().tanks['t-34'].owned, 'профиль сохраняется и читается');

// ---------- Танк из редактора моделей ----------
const T2 = await import('../js/data/tanks.js');
const customProfile = {
  version: 1, id: 'my-tank', name: 'Мой танк', nation: 'germany', class: 'HT', tier: 4,
  armor: { hullFront: 90, hullSide: 60, hullRear: 60, turretFront: 100, turretSide: 70, turretRear: 70 },
  stats: { hp: 700, speed: 40, reverse: 15, hullTraverse: 30, turretTraverse: 28, viewRange: 350, camo: 0.12 },
  gun: { name: '88 мм', caliber: 88, reload: 6, aimTime: 2.6, dispersion: 0.38, depression: 7, elevation: 18 },
  shells: [
    { type: 'AP', name: 'ББ', pen: 150, damage: 220, speed: 800 },
    { type: 'APCR', name: 'БП', pen: 190, damage: 220, speed: 950 },
    { type: 'HE', name: 'ОФ', pen: 45, damage: 300, speed: 650 },
  ],
  parts: [
    { type: 'box', kind: 'hull', size: [2.8, 1.0, 5.2], pos: [0, 1.05, 0], rot: [0, 0, 0], color: '#4d5c3f' },
    { type: 'box', kind: 'turret', size: [2, 0.8, 2.2], pos: [0, 0.4, 0], rot: [0, 0, 0], color: '#556645' },
    { type: 'cylinder', kind: 'gun', size: [0.18, 0.17, 3.4, 8], pos: [0, 0, -1.9], rot: [90, 0, 0], color: '#2b2e28' },
  ],
  pivots: { turret: [0, 1.7, 0], gun: [0, 0.44, -1.2], muzzle: [0, 0, -4.1] },
};

let regError = null;
let customDef = null;
try { customDef = T2.registerCustomTank(customProfile); } catch (e) { regError = e; }
ok(!regError && customDef, 'модель из редактора регистрируется как танк');
ok(T2.getTank('my-tank')?.name === 'Мой танк', 'танк доступен по id');
ok(customDef?.custom === true && customDef?.tier === 4, 'класс и уровень перенесены');
ok(customDef?.shells.length === 3 && customDef.shells[0].pen === 150, 'снаряды перенесены');

const roundTrip = T2.tankToProfile(T2.getTank('my-tank'));
ok(roundTrip.parts.length === 3, 'профиль модели читается обратно без потерь');
ok(roundTrip.armor.hullFront === 90, 'броня из редактора доехала до игры');

const customModel = createTankModel(roundTrip);
ok(customModel.meshes.length === 3, `мешей в пользовательской модели: ${customModel.meshes.length}`);
disposeModel(customModel);

// сохранение списка моделей
T2.saveCustomTanks([customProfile]);
ok(T2.loadCustomProfiles().length === 1, 'модель сохраняется в localStorage');

// профиль автоматически владеет пользовательским танком
const profile2 = P.defaultProfile();
ok(profile2.tanks['my-tank']?.owned === true, 'импортированный танк сразу в ангаре');
ok(P.ownTanks(profile2).some(t => t.id === 'my-tank'), 'танк попадает в карусель');

// ошибки импорта
let threw = false;
try { T2.registerCustomTank({ id: 'broken' }); } catch { threw = true; }
ok(threw, 'битый профиль отклоняется с ошибкой');

console.log(fails === 0 ? '\n🎉 ВСЕ ТЕСТЫ ДАННЫХ ПРОЙДЕНЫ' : `\n💥 ПРОВАЛОВ: ${fails}`);
process.exit(fails ? 1 : 0);
