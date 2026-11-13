// Автотесты игровой логики (без браузера): node tests/game.test.mjs
import * as THREE from '../vendor/three.module.js';
import { Tank } from '../js/tank.js';
import { buildCity, WORLD } from '../js/city.js';
import { Effects } from '../js/effects.js';

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '✅' : '❌') + ' ' + msg); if (!cond) fails++; };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// ---------- город ----------
const scene = new THREE.Scene();
const t0 = performance.now();
const { colliders, group } = buildCity(scene);
const buildMs = performance.now() - t0;
ok(colliders.length > 70, `здания: ${colliders.length} коллайдеров`);
ok(colliders.every(c => c.maxX > c.minX && c.maxZ > c.minZ), 'все AABB корректные');
ok(colliders.every(c => Math.abs(c.minX) <= WORLD.half && Math.abs(c.maxZ) <= WORLD.half), 'здания внутри карты');
ok(group.children.length < 400, `draw calls (объектов): ${group.children.length}`);
ok(buildMs < 500, `сборка города: ${buildMs.toFixed(0)} мс`);

// Игрок не появляется внутри здания
const inside = colliders.some(c => { const cx = Math.max(c.minX, Math.min(0, c.maxX)); const cz = Math.max(c.minZ, Math.min(0, c.maxZ)); return Math.hypot(cx, cz) < 3; });
ok(!inside, 'точка старта (0,0) свободна');

// ---------- танк ----------
const t = new Tank(scene, { isPlayer: true, position: new THREE.Vector3(0, 0, 0), heading: Math.PI });
ok(near(t.forwardVec().z, 1, 1e-9), 'heading=π → вперёд по +Z');
const z0 = t.position.z;
t.move(1, 0, 1, []);
ok(t.position.z > z0 + 10, `движение вперёд: z ${z0} → ${t.position.z.toFixed(2)}`);
t.move(0, 1, 1, []);
ok(t.heading > Math.PI, 'поворот меняет heading');
ok(t.wheels.length === 10, `колёс в модели: ${t.wheels.length}`);

// Коллизия со стеной
const t2 = new Tank(scene, { position: new THREE.Vector3(0, 0, 0), heading: Math.PI });
const wall = [{ minX: -50, maxX: 50, minZ: 10, maxZ: 20 }];
for (let i = 0; i < 120; i++) t2.move(1, 0, 1 / 60, wall);
ok(t2.position.z < 10 && t2.position.z > 10 - 3, `стена держит танк: z=${t2.position.z.toFixed(2)}`);

// Границы карты
const t3 = new Tank(scene, { position: new THREE.Vector3(0, 0, 110), heading: Math.PI });
for (let i = 0; i < 300; i++) t3.move(1, 0, 1 / 60, []);
ok(t3.position.z <= 118.0001, `граница карты: z=${t3.position.z.toFixed(2)}`);

// Башня и ствол
const tp = new Tank(scene, { position: new THREE.Vector3(0, 0, 0), heading: 0 });
tp.aimAt(new THREE.Vector3(10, 0, 0));
let dir = tp.getBarrelDir();
ok(dir.x > 0.9, `ствол на +X: (${dir.x.toFixed(2)}, ${dir.z.toFixed(2)})`);
tp.aimAt(new THREE.Vector3(0, 0, -40));
dir = tp.getBarrelDir();
ok(dir.z < -0.9, `ствол на -Z: (${dir.x.toFixed(2)}, ${dir.z.toFixed(2)})`);
const tp2 = new Tank(scene, { position: new THREE.Vector3(0, 0, 0), heading: Math.PI });
tp2.aimAt(new THREE.Vector3(0, 0, 40));
const d2 = tp2.getBarrelDir();
ok(d2.z > 0.9, `ствол на +Z при heading=π: (${d2.x.toFixed(2)}, ${d2.z.toFixed(2)})`);
ok(Math.abs(tp2.getMuzzleWorld().y - 1.9) < 0.5, 'дуло на высоте башни');

// Урон и перезарядка
const td = new Tank(scene, { hp: 50 });
ok(td.canShoot(), 'стрелять можно сразу');
td.shoot();
ok(!td.canShoot(), 'идёт перезарядка');
td.update(2);
ok(td.canShoot(), 'перезарядка завершилась');
ok(!td.takeDamage(20) && td.hp === 30, 'урон 20 → 30 hp');
ok(td.takeDamage(40) && !td.alive, 'смертельный урон убивает');
ok(!td.takeDamage(10) && td.hp === 0, 'мёртвый танк не получает урон');

// ---------- снаряды ----------
const fx = new Effects(scene);
const shooter = new Tank(scene, { isPlayer: true, position: new THREE.Vector3(0, 0, 0), heading: Math.PI });
const target = new Tank(scene, { position: new THREE.Vector3(0, 0, 30) });
let hits = 0;
fx.fireBullet(new THREE.Vector3(0, 1.9, 0), new THREE.Vector3(0, 0, 1), shooter, 78);
for (let i = 0; i < 120 && fx.bullets.length; i++) fx.update(1 / 60, [], [shooter, target], () => hits++);
ok(hits === 1, 'снаряд попадает в цель');

fx.fireBullet(new THREE.Vector3(0, 1.9, 0), new THREE.Vector3(0, 0, 1), shooter, 78);
for (let i = 0; i < 120 && fx.bullets.length; i++) fx.update(1 / 60, [{ minX: -5, maxX: 5, minZ: 10, maxZ: 12 }], [shooter, target], () => { throw new Error('снаряд прошёл сквозь здание'); });
ok(fx.bullets.length === 0, 'здание уничтожает снаряд');

let selfHit = false;
fx.fireBullet(new THREE.Vector3(0, 1.9, 0), new THREE.Vector3(0, 0, -1), shooter, 78);
for (let i = 0; i < 120 && fx.bullets.length; i++) fx.update(1 / 60, [], [shooter], () => { selfHit = true; });
ok(!selfHit, 'снаряд не бьёт владельца');

fx.explosion(new THREE.Vector3(0, 1, 0));
ok(fx.particles.length > 0, `взрыв: ${fx.particles.length} частиц`);
for (let i = 0; i < 400; i++) fx.update(1 / 60, [], [], () => {});
ok(fx.particles.length === 0, 'частицы удаляются по таймеру');

// ---------- производительность ----------
const t1 = performance.now();
for (let i = 0; i < 2000; i++) t.move(1, i % 2 ? 0.3 : -0.3, 1 / 60, colliders);
const physMs = performance.now() - t1;
ok(physMs < 400, `2000 шагов физики с ${colliders.length} коллайдерами: ${physMs.toFixed(0)} мс`);

console.log(fails === 0 ? '\n🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ' : `\n💥 ПРОВАЛОВ: ${fails}`);
process.exit(fails ? 1 : 0);
