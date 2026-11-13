// ============================================================
//  Броня, пробитие, рикошет, урон — математика в духе World of Tanks
// ============================================================

export const SHELL_META = {
  AP:   { label: 'ББ', full: 'Бронебойный',            ricochet: true,  color: '#ffd166', speedK: 1 },
  APCR: { label: 'БП', full: 'Подкалиберный',          ricochet: true,  color: '#7fd4ff', speedK: 1.15 },
  HE:   { label: 'ОФ', full: 'Осколочно-фугасный',     ricochet: false, color: '#ff8b4a', speedK: 0.75 },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Угол между направлением снаряда и нормалью брони, градусы (0 = в лоб, 90 = скользящий). */
export function impactAngle(dir, normal) {
  const d = Math.max(-1, Math.min(1, Math.abs(dir.dot(normal))));
  return Math.acos(d) * 180 / Math.PI;
}

/** Приведённая толщина брони: t / cos(угол). */
export function effectiveArmor(thickness, angleDeg) {
  const a = clamp(angleDeg, 0, 89.5) * Math.PI / 180;
  return thickness / Math.cos(a);
}

/** Сторона попадания по нормали в локальных координатах танка. */
export function sideFromNormal(n) {
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
  if (ay >= ax && ay >= az) return 'top';
  if (az >= ax) return n.z < 0 ? 'front' : 'rear';
  return 'side';
}

/** Полное имя зоны: ('hull'|'turret') + сторона → ключ в armor. */
export function zoneKey(base, side) {
  const cap = side.charAt(0).toUpperCase() + side.slice(1);
  return base + cap;
}

/**
 * Разрешение попадания.
 * @param {object} o
 * @param {number} o.thickness   толщина плиты, мм
 * @param {number} o.angle       угол встречи, градусы
 * @param {object} o.shell       {type, pen, damage}
 * @param {number} o.caliber     калибр, мм (для правила трёх калибров)
 * @param {() => number} [o.random]
 */
export function resolveHit({ thickness, angle, shell, caliber = 50, random = Math.random }) {
  const type = shell.type || 'AP';
  const meta = SHELL_META[type] || SHELL_META.AP;
  const eff = effectiveArmor(thickness, angle);
  const pen = shell.pen * (0.75 + 0.5 * random());          // ±25% разброс пробития
  const overmatch = caliber >= thickness * 3;               // три калибра — нормализация

  // Рикошет: угол > 70°, но не для ОФ и не при трёх калибрах
  if (meta.ricochet && angle > 70 && !overmatch) {
    return { result: 'ricochet', effective: Math.round(eff), pen: Math.round(pen), damage: 0, angle };
  }

  if (type === 'HE') {
    // ОФ: пробил — полный урон, не пробил — частичный
    if (pen >= eff) {
      const dmg = Math.round(shell.damage * (0.75 + 0.5 * random()));
      return { result: 'penetrate', effective: Math.round(eff), pen: Math.round(pen), damage: dmg, angle };
    }
    const ratio = clamp(pen / eff, 0, 1);
    const dmg = Math.round(shell.damage * 0.5 * ratio);
    return { result: dmg > 0 ? 'splash' : 'noPen', effective: Math.round(eff), pen: Math.round(pen), damage: dmg, angle };
  }

  if (pen >= eff) {
    const dmg = Math.round(shell.damage * (0.75 + 0.5 * random()));
    // Крит гусеницы/модуля
    const crit = random() < 0.12;
    return { result: 'penetrate', effective: Math.round(eff), pen: Math.round(pen), damage: dmg, angle, crit };
  }

  return { result: 'noPen', effective: Math.round(eff), pen: Math.round(pen), damage: 0, angle };
}

export const RESULT_LABEL = {
  penetrate: 'ПРОБИЛ',
  noPen: 'НЕ ПРОБИЛ',
  ricochet: 'РИКОШЕТ',
  splash: 'ОСКОЛКИ',
};

/** Время сведения (упрощённо): чем больше разброс, тем дольше. */
export function aimTimeFor(gun, moving = 0) {
  return gun.aimTime * (1 + moving * 0.5);
}

/** Текущий радиус разброса в метрах: база + штрафы за движение/поворот орудия. */
export function dispersionRadius(gun, { moving = 0, turning = 0, bloom = 0 } = {}) {
  return gun.dispersion + 0.09 * moving + 0.06 * turning + bloom;
}
