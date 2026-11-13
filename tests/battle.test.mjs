// Тесты боевой логики (движение, башня, коллизии) без браузера
// Запуск: node tests/battle.test.mjs
import * as THREE from '../vendor/three.module.js';
import { Actor } from '../js/battle.js';
import { getTank } from '../js/data/tanks.js';

let fails = 0;
const ok = (c, m) => { console.log((c ? '✅' : '❌') + ' ' + m); if (!c) fails++; };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// Заглушка боя: только то, что нужно Actor
function fakeBattle(colliders = []) {
  return { scene: new THREE.Scene(), mapColliders: colliders, actors: [] };
}

// ---------- Создание ----------
const battle = fakeBattle();
const t34 = getTank('t-34');
const actor = new Actor(battle, { tankDef: t34, team: 'A', isPlayer: true, name: 'Тест', spawn: [0, 0, 0] });
ok(actor.hp === t34.hp && actor.alive, `HP инициал: ${actor.hp}`);
ok(near(actor.position.x, 0) && near(actor.position.z, 0), 'спавн в точке [0,0]');
ok(actor.radius > 1.5, `радиус коллизии: ${actor.radius.toFixed(2)}`);
ok(actor.model.meshes.length > 10, `мешей в модели: ${actor.model.meshes.length}`);

// ---------- Движение ----------
const z0 = actor.position.z;
actor.heading = Math.PI;              // вперёд = +Z
for (let i = 0; i < 60; i++) actor.move(1, 0, 1 / 60);
const accelDist = actor.position.z - z0;
ok(accelDist > 2.5 && accelDist < 8, `разгон за секунду: Δz=${accelDist.toFixed(2)} м`);
for (let i = 0; i < 240; i++) actor.move(1, 0, 1 / 60);
ok(Math.abs(actor.speed - t34.speed / 3.6) < 0.01, `вышел на максималку: ${(actor.speed * 3.6).toFixed(0)} км/ч`);
const maxSpeed = t34.speed / 3.6;
ok(actor.speed <= maxSpeed + 0.01, `скорость не превышает максимум: ${actor.speed.toFixed(2)} ≤ ${maxSpeed.toFixed(2)} м/с`);

// Задний ход медленнее
const actor2 = new Actor(fakeBattle(), { tankDef: t34, team: 'A', spawn: [0, 0, 0] });
actor2.heading = Math.PI;
for (let i = 0; i < 120; i++) actor2.move(-1, 0, 1 / 60);
ok(Math.abs(actor2.speed) <= t34.reverse / 3.6 + 0.01, `задний ход ограничен: ${Math.abs(actor2.speed).toFixed(2)} м/с`);

// Поворот корпуса
const actor3 = new Actor(fakeBattle(), { tankDef: t34, team: 'A', spawn: [0, 0, 0] });
const h0 = actor3.heading;
for (let i = 0; i < 60; i++) actor3.move(0, 1, 1 / 60);
const turned = Math.abs(actor3.heading - h0) * 180 / Math.PI;
ok(turned > 20 && turned < t34.hullTraverse * 1.1, `поворот корпуса за секунду: ${turned.toFixed(0)}°`);

// ---------- Коллизии ----------
const wallBattle = fakeBattle([{ minX: -20, maxX: 20, minZ: 8, maxZ: 14 }]);
const actor4 = new Actor(wallBattle, { tankDef: t34, team: 'A', spawn: [0, 0, 0] });
actor4.heading = Math.PI;
for (let i = 0; i < 180; i++) actor4.move(1, 0, 1 / 60);
ok(actor4.position.z < 8, `здание не пускает: z=${actor4.position.z.toFixed(2)} (стена на 8)`);

// Граница карты
const actor5 = new Actor(fakeBattle(), { tankDef: t34, team: 'A', spawn: [0, 0, 110] });
actor5.heading = Math.PI;
for (let i = 0; i < 300; i++) actor5.move(1, 0, 1 / 60);
ok(actor5.position.z <= 117.001, `граница карты: z=${actor5.position.z.toFixed(2)}`);

// ---------- Башня ----------
const t = new Actor(fakeBattle(), { tankDef: getTank('tiger'), team: 'A', spawn: [0, 0, 0] });
t.heading = 0;                          // вперёд = -Z
t.aimAtPoint(new THREE.Vector3(30, 1, 0), 1 / 60);
const dir1 = t.gunDirection;
ok(Math.abs(t.turretAngle) > 0, 'башня начала поворот к цели справа');
for (let i = 0; i < 420; i++) t.aimAtPoint(new THREE.Vector3(30, 1, 0), 1 / 60);
const dir2 = t.gunDirection;
ok(dir2.x > 0.9, `башня довернулась на +X: (${dir2.x.toFixed(2)}, ${dir2.z.toFixed(2)})`);

// Скорость поворота башни ограничена
const slow = new Actor(fakeBattle(), { tankDef: getTank('kv-1'), team: 'A', spawn: [0, 0, 0] });
slow.heading = 0;
slow.aimAtPoint(new THREE.Vector3(0, 1, 50), 1 / 60);  // цель сзади
const perFrame = Math.abs(slow.turretAngle) * 180 / Math.PI;
ok(perFrame <= getTank('kv-1').turretTraverse / 60 + 0.2, `поворот башни за кадр: ${perFrame.toFixed(2)}°`);

// Углы вертикальной наводки
const g = new Actor(fakeBattle(), { tankDef: getTank('t-34'), team: 'A', spawn: [0, 0, 0] });
for (let i = 0; i < 300; i++) g.aimAtPoint(new THREE.Vector3(0, 200, -50), 1 / 60);
ok(g.gunPitch <= getTank('t-34').gun.elevation * Math.PI / 180 + 1e-6, `подъём ствола ограничен: ${(g.gunPitch * 180 / Math.PI).toFixed(1)}°`);
for (let i = 0; i < 300; i++) g.aimAtPoint(new THREE.Vector3(0, -50, -50), 1 / 60);
ok(g.gunPitch >= -getTank('t-34').gun.depression * Math.PI / 180 - 1e-6, `склон ствола ограничен: ${(g.gunPitch * 180 / Math.PI).toFixed(1)}°`);

// Направление ствола единичное и смотрит вперёд при нулевых углах
const z = new Actor(fakeBattle(), { tankDef: getTank('t-34'), team: 'A', spawn: [0, 0, 0] });
z.heading = 0; z.turretAngle = 0; z.gunPitch = 0;
const d = z.gunDirection;
ok(near(d.length(), 1, 1e-6) && near(d.z, -1, 1e-6), `ствол смотрит вперёд: (${d.x.toFixed(2)}, ${d.y.toFixed(2)}, ${d.z.toFixed(2)})`);

// ---------- Урон ----------
const hp0 = z.hp;
z.takeDamage(100);
ok(z.hp === hp0 - 100, `урон применён: ${z.hp}`);
ok(z.takeDamage(99999) === true && !z.alive, 'смертельный урон убивает танк');
ok(z.takeDamage(10) === false, 'мёртвый танк урон не получает');

// ---------- Перезарядка ----------
const rl = new Actor(fakeBattle(), { tankDef: getTank('is-2'), team: 'A', spawn: [0, 0, 0] });
ok(rl.canShoot(), 'танк готов к выстрелу при спавне');
rl.reloadLeft = getTank('is-2').gun.reload;
ok(!rl.canShoot(), 'после выстрела идёт перезарядка');
rl.reloadLeft -= getTank('is-2').gun.reload + 0.1;
ok(rl.canShoot(), 'перезарядка завершена');

// ---------- Производительность ----------
const many = [];
const perfBattle = fakeBattle(Array.from({ length: 94 }, (_, i) => ({
  minX: -110 + (i % 10) * 22, maxX: -100 + (i % 10) * 22,
  minZ: -110 + Math.floor(i / 10) * 22, maxZ: -100 + Math.floor(i / 10) * 22,
})));
for (let i = 0; i < 14; i++) many.push(new Actor(perfBattle, { tankDef: t34, team: i < 7 ? 'A' : 'B', spawn: [i * 4 - 28, 0, i < 7 ? 100 : -100] }));
const t0 = performance.now();
for (let f = 0; f < 120; f++) {
  for (const a of many) {
    a.move(1, Math.sin(f / 30), 1 / 60);
    a.aimAtPoint(new THREE.Vector3(0, 1, 0), 1 / 60);
    a.updateRig();
  }
}
const ms = performance.now() - t0;
ok(ms < 1200, `120 кадров × 14 танков: ${ms.toFixed(0)} мс`);

console.log(fails === 0 ? '\n🎉 ВСЕ ТЕСТЫ БОЯ ПРОЙДЕНЫ' : `\n💥 ПРОВАЛОВ: ${fails}`);
process.exit(fails ? 1 : 0);
