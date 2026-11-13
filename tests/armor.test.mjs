// Автотесты системы брони и пробития: node tests/armor.test.mjs
import * as THREE from '../vendor/three.module.js';
import {
  impactAngle, effectiveArmor, sideFromNormal, zoneKey, resolveHit,
} from '../js/armor.js';

let fails = 0;
const ok = (c, m) => { console.log((c ? '✅' : '❌') + ' ' + m); if (!c) fails++; };
const near = (a, b, eps = 0.01) => Math.abs(a - b) < eps;
const fixed = (v) => () => v;

// ---------- приведённая броня ----------
ok(near(effectiveArmor(100, 0), 100), 'лоб в лоб: 100 мм = 100 мм');
ok(near(effectiveArmor(100, 60), 200, 0.5), '100 мм под 60° → ~200 мм');
ok(effectiveArmor(100, 70) > 250, `100 мм под 70° → ${effectiveArmor(100, 70).toFixed(0)} мм`);
ok(effectiveArmor(45, 0) === 45, 'нулевой угол не меняет толщину');

// ---------- угол встречи ----------
ok(near(impactAngle(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 1)), 0), 'снаряд в лоб нормали → 0°');
ok(near(impactAngle(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)), 90), 'перпендикулярно нормали → 90°');
ok(near(impactAngle(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, -1)), 0), 'противоположная нормаль тоже 0°');

// ---------- зоны ----------
ok(sideFromNormal(new THREE.Vector3(0, 0, -1)) === 'front', 'нормаль -Z → лоб');
ok(sideFromNormal(new THREE.Vector3(0, 0, 1)) === 'rear', 'нормаль +Z → корма');
ok(sideFromNormal(new THREE.Vector3(1, 0, 0)) === 'side', 'нормаль +X → борт');
ok(sideFromNormal(new THREE.Vector3(0, 1, 0)) === 'top', 'нормаль вверх → крыша');
ok(zoneKey('hull', 'front') === 'hullFront', 'зона: hull + front → hullFront');
ok(zoneKey('turret', 'rear') === 'turretRear', 'зона: turret + rear → turretRear');

const ap = { type: 'AP', pen: 150, damage: 200 };
const apcr = { type: 'APCR', pen: 200, damage: 200 };
const he = { type: 'HE', pen: 50, damage: 300 };

// ---------- пробитие ----------
let r = resolveHit({ thickness: 100, angle: 0, shell: ap, caliber: 88, random: fixed(0.5) });
ok(r.result === 'penetrate' && r.damage === 200, `150 мм пробивают 100 мм: ${r.result}, ${r.damage}`);
ok(r.effective === 100, `приведённая броня в отчёте: ${r.effective}`);

r = resolveHit({ thickness: 300, angle: 0, shell: ap, caliber: 88, random: fixed(0.5) });
ok(r.result === 'noPen' && r.damage === 0, '150 мм не пробивают 300 мм');

// ---------- рикошет ----------
r = resolveHit({ thickness: 80, angle: 75, shell: ap, caliber: 50, random: fixed(0.5) });
ok(r.result === 'ricochet', `угол 75° → рикошет (${r.result})`);
r = resolveHit({ thickness: 80, angle: 75, shell: ap, caliber: 50, random: fixed(0.9) });
ok(r.result === 'ricochet', 'рикошет не зависит от разброса пробития');
r = resolveHit({ thickness: 80, angle: 65, shell: ap, caliber: 50, random: fixed(0.9) });
ok(r.result !== 'ricochet', 'угол 65° — не рикошет');

// правило трёх калибров
r = resolveHit({ thickness: 25, angle: 80, shell: ap, caliber: 88, random: fixed(0.9) });
ok(r.result !== 'ricochet', 'калибр 88 против 25 мм — нормализация, рикошета нет');
r = resolveHit({ thickness: 40, angle: 80, shell: ap, caliber: 88, random: fixed(0.9) });
ok(r.result === 'ricochet', 'калибр 88 против 40 мм (меньше 3 калибров) — рикошет');

// ---------- ОФ ----------
r = resolveHit({ thickness: 40, angle: 0, shell: he, caliber: 122, random: fixed(0.5) });
ok(r.result === 'penetrate' && r.damage === 300, `ОФ пробил: ${r.damage} урона`);
r = resolveHit({ thickness: 120, angle: 0, shell: he, caliber: 122, random: fixed(0.5) });
ok(r.result === 'splash' && r.damage > 0 && r.damage < 300, `ОФ не пробил, но осколки: ${r.damage} урона`);
r = resolveHit({ thickness: 120, angle: 80, shell: he, caliber: 122, random: fixed(0.5) });
ok(r.result !== 'ricochet', 'ОФ не рикошетит');

// ---------- разброс пробития ±25% ----------
const low = resolveHit({ thickness: 100, angle: 0, shell: { type: 'AP', pen: 120, damage: 100 }, random: fixed(0) });
ok(low.pen === 90, `минимум: 120 × 0.75 = ${low.pen}`);
const high = resolveHit({ thickness: 100, angle: 0, shell: { type: 'AP', pen: 120, damage: 100 }, random: fixed(1) });
ok(high.pen === 150, `максимум: 120 × 1.25 = ${high.pen}`);
ok(low.result === 'noPen' && high.result === 'penetrate', 'на границе 100 мм разброс решает исход');

// ---------- криты ----------
r = resolveHit({ thickness: 10, angle: 0, shell: ap, caliber: 88, random: fixed(0.05) });
ok(r.result === 'penetrate' && r.crit === true, 'крит гусеницы при низком ролле');

console.log(fails === 0 ? '\n🎉 ВСЕ ТЕСТЫ БРОНИ ПРОЙДЕНЫ' : `\n💥 ПРОВАЛОВ: ${fails}`);
process.exit(fails ? 1 : 0);
