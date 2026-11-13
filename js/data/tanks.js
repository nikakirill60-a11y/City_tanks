// ============================================================
//  City Tanks — данные танков (нации, классы, ТТХ, модель в JSON)
//  Один и тот же формат используют: ангар, бой и редактор моделей.
// ============================================================

export const NATIONS = {
  ussr: { name: 'СССР', flag: '☭', color: '#c0392b' },
  germany: { name: 'Германия', flag: '✠', color: '#7f8c8d' },
  usa: { name: 'США', flag: '★', color: '#2980b9' },
};

export const CLASSES = {
  LT: { name: 'Лёгкий', icon: '◔', desc: 'Разведка и обходы' },
  MT: { name: 'Средний', icon: '◑', desc: 'Универсал' },
  HT: { name: 'Тяжёлый', icon: '●', desc: 'Броня и продавливание' },
  TD: { name: 'ПТ-САУ', icon: '▼', desc: 'Засады и пробитие' },
};

// ---------- Помощники сборки модели ----------
const C = {
  hull: '#4d5c3f', hullDark: '#3c4a32', track: '#20221f', wheel: '#383b34',
  turret: '#556645', gun: '#2b2e28', detail: '#616b55',
};

function part(type, kind, size, pos, rot = [0, 0, 0], color = C.hull, extra = {}) {
  return { type, kind, size, pos, rot, color, ...extra };
}

// Собирает низкополигональную модель танка из примитивов.
// forward = -Z, up = +Y. Возвращает { parts, pivots, dims }.
export function buildTankModel(cfg) {
  const {
    hullLong = 5.6, hullWide = 2.6, hullTall = 1.0, hullColor = C.hull,
    turretLong = 2.2, turretWide = 1.9, turretTall = 0.75,
    gunLong = 3.4, gunCaliber = 0.16, mantlet = 0.42,
    wheels = 5, wheelR = 0.42, trackWide = 0.5,
    casemate = false, // ПТ-САУ: орудие в рубке
    skirt = false,
  } = cfg;

  const parts = [];
  const y0 = wheelR * 2 + 0.06;          // высота днища над землёй
  const hullCenterY = y0 + hullTall / 2;

  // Корпус: скошенная лобовая деталь
  parts.push(part('box', 'hull', [hullWide, hullTall, hullLong * 0.86], [0, hullCenterY, 0], [0, 0, 0], hullColor));
  parts.push(part('wedge', 'hull', [hullWide * 0.98, hullTall * 0.92, hullLong * 0.3], [0, hullCenterY, -hullLong * 0.5], [18, 0, 0], hullColor, { zone: 'hullFront' }));
  parts.push(part('box', 'hull', [hullWide * 0.9, hullTall * 0.8, hullLong * 0.2], [0, hullCenterY - 0.02, hullLong * 0.5], [-12, 0, 0], hullColor, { zone: 'hullRear' }));
  // Надстройка / подбашенная коробка
  parts.push(part('box', 'hull', [turretWide * 0.92, 0.18, turretLong * 0.9], [0, hullCenterY + hullTall / 2 + 0.09, 0], [0, 0, 0], C.hullDark));

  const turretY = hullCenterY + hullTall / 2 + 0.18;

  if (casemate) {
    // Рубка ПТ-САУ
    parts.push(part('wedge', 'turret', [turretWide, turretTall * 1.5, turretLong * 1.15], [0, turretTall * 0.75, 0], [0, 0, 0], C.turret, { zone: 'turretFront' }));
    parts.push(part('box', 'turret', [turretWide * 0.96, turretTall * 0.55, turretLong * 0.5], [0, turretTall * 0.3, turretLong * 0.35], [0, 0, 0], C.turret));
  } else {
    parts.push(part('box', 'turret', [turretWide, turretTall, turretLong], [0, turretTall / 2, 0], [0, 0, 0], C.turret, { zone: 'turretSide' }));
    parts.push(part('cylinder', 'turret', [turretWide * 0.34, turretWide * 0.34, turretTall * 0.4, 12], [0, turretTall * 0.98, -turretLong * 0.12], [0, 0, 0], C.turret, { zone: 'turretFront' }));
    // Командирская башенка
    parts.push(part('cylinder', 'turret', [0.26, 0.26, 0.28, 8], [turretWide * 0.22, turretTall * 1.12, turretLong * 0.18], [0, 0, 0], C.detail));
  }

  // Маска орудия + ствол (в системе координат качания орудия)
  parts.push(part('cylinder', 'gun', [mantlet, mantlet, 0.34, 10], [0, 0, -mantlet * 0.3], [90, 0, 0], C.detail, { zone: 'turretFront' }));
  parts.push(part('cylinder', 'gun', [gunCaliber, gunCaliber * 0.92, gunLong, 8], [0, 0, -gunLong / 2 - mantlet * 0.4], [90, 0, 0], C.gun));
  parts.push(part('cylinder', 'gun', [gunCaliber * 1.25, gunCaliber * 1.25, gunCaliber * 2, 8], [0, 0, -gunLong - mantlet * 0.4], [90, 0, 0], C.gun));

  // Ходовая
  const trackZ0 = -hullLong * 0.42, trackZ1 = hullLong * 0.42;
  for (const side of [-1, 1]) {
    const x = side * (hullWide / 2 + trackWide / 2 - 0.02);
    parts.push(part('box', 'track', [trackWide, wheelR * 1.7, (trackZ1 - trackZ0)], [x, wheelR, (trackZ0 + trackZ1) / 2], [0, 0, 0], C.track));
    for (let i = 0; i < wheels; i++) {
      const z = trackZ0 + (trackZ1 - trackZ0) * (i / (wheels - 1));
      parts.push(part('cylinder', 'wheel', [wheelR, wheelR, trackWide * 0.92, 10], [x, wheelR, z], [0, 0, 90], C.wheel));
    }
    if (skirt) {
      parts.push(part('box', 'detail', [0.06, hullTall * 0.75, hullLong * 0.8], [side * (hullWide / 2 + 0.06), hullCenterY, 0], [0, 0, 0], C.hullDark));
    }
    // Крылья
    parts.push(part('box', 'detail', [trackWide * 0.9, 0.06, hullLong * 0.8], [x, wheelR * 2 + 0.04, 0], [0, 0, 0], C.hullDark));
  }

  const pivots = {
    turret: [0, turretY, 0],
    gun: [0, turretTall * 0.55, -turretLong * 0.55],
    muzzle: [0, 0, -gunLong - mantlet * 0.4 - gunCaliber],
  };

  return { parts, pivots, dims: { length: hullLong, width: hullWide + trackWide * 2, height: turretY + turretTall } };
}

// ---------- Ростер танков ----------
// stats: скорость км/ч, повороты град/с, обзор м, маскировка 0..1
// armor: мм по зонам

const T = [];
const def = (t) => { T.push(t); return t; };

// ===== СССР =====
def({
  id: 't-26', name: 'Т-26', nation: 'ussr', class: 'LT', tier: 1,
  hp: 250, speed: 28, reverse: 12, hullTraverse: 40, turretTraverse: 44, viewRange: 280, camo: 0.22,
  armor: { hullFront: 15, hullSide: 15, hullRear: 15, turretFront: 15, turretSide: 15, turretRear: 15 },
  gun: { name: '45 мм 20-К', caliber: 45, reload: 2.6, aimTime: 1.8, dispersion: 0.44, depression: 6, elevation: 22 },
  shells: [
    { type: 'AP', name: 'ББ', pen: 51, damage: 47, speed: 760 },
    { type: 'APCR', name: 'БП', pen: 88, damage: 40, speed: 980 },
    { type: 'HE', name: 'ОФ', pen: 23, damage: 62, speed: 590 },
  ],
  cost: { xp: 0, credits: 0 },
  model: { hullLong: 4.6, hullWide: 2.3, hullTall: 0.8, turretLong: 1.9, turretWide: 1.5, turretTall: 0.62, gunLong: 2.6, gunCaliber: 0.13, wheels: 4, wheelR: 0.36 },
});

def({
  id: 'bt-7', name: 'БТ-7', nation: 'ussr', class: 'LT', tier: 2,
  hp: 340, speed: 52, reverse: 20, hullTraverse: 42, turretTraverse: 42, viewRange: 300, camo: 0.2,
  armor: { hullFront: 20, hullSide: 15, hullRear: 13, turretFront: 20, turretSide: 15, turretRear: 15 },
  gun: { name: '45 мм 20-К обр. 1938', caliber: 45, reload: 2.3, aimTime: 1.7, dispersion: 0.42, depression: 6, elevation: 22 },
  shells: [
    { type: 'AP', name: 'ББ', pen: 62, damage: 47, speed: 820 },
    { type: 'APCR', name: 'БП', pen: 105, damage: 40, speed: 1050 },
    { type: 'HE', name: 'ОФ', pen: 23, damage: 62, speed: 600 },
  ],
  cost: { xp: 800, credits: 4200 },
  model: { hullLong: 5.1, hullWide: 2.3, hullTall: 0.82, turretLong: 2.0, turretWide: 1.6, turretTall: 0.6, gunLong: 2.8, gunCaliber: 0.13, wheels: 4, wheelR: 0.4 },
});

def({
  id: 't-34', name: 'Т-34', nation: 'ussr', class: 'MT', tier: 3,
  hp: 560, speed: 54, reverse: 20, hullTraverse: 36, turretTraverse: 36, viewRange: 340, camo: 0.18,
  armor: { hullFront: 45, hullSide: 40, hullRear: 40, turretFront: 45, turretSide: 45, turretRear: 45 },
  gun: { name: '76 мм Ф-34', caliber: 76, reload: 4.2, aimTime: 2.3, dispersion: 0.42, depression: 5, elevation: 25 },
  shells: [
    { type: 'AP', name: 'ББ', pen: 112, damage: 110, speed: 950 },
    { type: 'APCR', name: 'БП', pen: 155, damage: 95, speed: 1150 },
    { type: 'HE', name: 'ОФ', pen: 38, damage: 164, speed: 640 },
  ],
  cost: { xp: 3200, credits: 16800 },
  model: { hullLong: 6.0, hullWide: 2.9, hullTall: 0.95, turretLong: 2.2, turretWide: 1.9, turretTall: 0.72, gunLong: 3.4, gunCaliber: 0.17, wheels: 5, wheelR: 0.44, skirt: true },
});

def({
  id: 'kv-1', name: 'КВ-1', nation: 'ussr', class: 'HT', tier: 4,
  hp: 810, speed: 34, reverse: 12, hullTraverse: 28, turretTraverse: 26, viewRange: 330, camo: 0.12,
  armor: { hullFront: 75, hullSide: 60, hullRear: 60, turretFront: 95, turretSide: 75, turretRear: 75 },
  gun: { name: '76 мм ЗиС-5', caliber: 76, reload: 5.6, aimTime: 2.9, dispersion: 0.46, depression: 7, elevation: 25 },
  shells: [
    { type: 'AP', name: 'ББ', pen: 120, damage: 110, speed: 900 },
    { type: 'APCR', name: 'БП', pen: 165, damage: 95, speed: 1100 },
    { type: 'HE', name: 'ОФ', pen: 38, damage: 164, speed: 620 },
  ],
  cost: { xp: 9200, credits: 42000 },
  model: { hullLong: 6.4, hullWide: 3.2, hullTall: 1.15, turretLong: 2.5, turretWide: 2.2, turretTall: 0.9, gunLong: 3.2, gunCaliber: 0.17, wheels: 6, wheelR: 0.48, skirt: true },
});

def({
  id: 'is-2', name: 'ИС-2', nation: 'ussr', class: 'HT', tier: 5,
  hp: 1230, speed: 37, reverse: 14, hullTraverse: 27, turretTraverse: 22, viewRange: 340, camo: 0.1,
  armor: { hullFront: 120, hullSide: 90, hullRear: 60, turretFront: 100, turretSide: 90, turretRear: 90 },
  gun: { name: '122 мм Д-25Т', caliber: 122, reload: 12.5, aimTime: 3.4, dispersion: 0.46, depression: 5, elevation: 20 },
  shells: [
    { type: 'AP', name: 'ББ', pen: 175, damage: 390, speed: 780 },
    { type: 'APCR', name: 'БП', pen: 217, damage: 390, speed: 900 },
    { type: 'HE', name: 'ОФ', pen: 61, damage: 530, speed: 570 },
  ],
  cost: { xp: 21000, credits: 92000 },
  model: { hullLong: 6.8, hullWide: 3.2, hullTall: 1.2, turretLong: 2.8, turretWide: 2.3, turretTall: 0.95, gunLong: 3.8, gunCaliber: 0.24, mantlet: 0.5, wheels: 6, wheelR: 0.48, skirt: true },
});

// ===== Германия =====
def({
  id: 'pz2', name: 'Pz.Kpfw. II', nation: 'germany', class: 'LT', tier: 1,
  hp: 260, speed: 40, reverse: 15, hullTraverse: 40, turretTraverse: 40, viewRange: 290, camo: 0.22,
  armor: { hullFront: 14, hullSide: 14, hullRear: 14, turretFront: 14, turretSide: 14, turretRear: 14 },
  gun: { name: '2 cm KwK 30', caliber: 20, reload: 1.8, aimTime: 1.5, dispersion: 0.5, depression: 10, elevation: 20 },
  shells: [
    { type: 'AP', name: 'ББ', pen: 39, damage: 26, speed: 780 },
    { type: 'APCR', name: 'БП', pen: 60, damage: 22, speed: 900 },
    { type: 'HE', name: 'ОФ', pen: 15, damage: 34, speed: 600 },
  ],
  cost: { xp: 0, credits: 0 },
  model: { hullLong: 4.8, hullWide: 2.3, hullTall: 0.82, turretLong: 1.9, turretWide: 1.5, turretTall: 0.62, gunLong: 2.4, gunCaliber: 0.1, wheels: 4, wheelR: 0.38 },
});

def({
  id: 'pz3', name: 'Pz.Kpfw. III', nation: 'germany', class: 'MT', tier: 2,
  hp: 400, speed: 50, reverse: 18, hullTraverse: 38, turretTraverse: 36, viewRange: 310, camo: 0.19,
  armor: { hullFront: 30, hullSide: 30, hullRear: 30, turretFront: 30, turretSide: 30, turretRear: 30 },
  gun: { name: '5 cm KwK 38 L/42', caliber: 50, reload: 2.4, aimTime: 1.9, dispersion: 0.4, depression: 8, elevation: 20 },
  shells: [
    { type: 'AP', name: 'ББ', pen: 71, damage: 55, speed: 820 },
    { type: 'APCR', name: 'БП', pen: 110, damage: 48, speed: 1000 },
    { type: 'HE', name: 'ОФ', pen: 27, damage: 76, speed: 620 },
  ],
  cost: { xp: 900, credits: 4800 },
  model: { hullLong: 5.4, hullWide: 2.5, hullTall: 0.9, turretLong: 2.0, turretWide: 1.7, turretTall: 0.65, gunLong: 3.0, gunCaliber: 0.14, wheels: 5, wheelR: 0.4 },
});

def({
  id: 'pz4', name: 'Pz.Kpfw. IV', nation: 'germany', class: 'MT', tier: 3,
  hp: 540, speed: 48, reverse: 18, hullTraverse: 36, turretTraverse: 32, viewRange: 340, camo: 0.17,
  armor: { hullFront: 80, hullSide: 40, hullRear: 40, turretFront: 50, turretSide: 30, turretRear: 30 },
  gun: { name: '7,5 cm KwK 40 L/48', caliber: 75, reload: 4.6, aimTime: 2.5, dispersion: 0.42, depression: 8, elevation: 22 },
  shells: [
    { type: 'AP', name: 'ББ', pen: 128, damage: 118, speed: 790 },
    { type: 'APCR', name: 'БП', pen: 172, damage: 118, speed: 990 },
    { type: 'HE', name: 'ОФ', pen: 43, damage: 175, speed: 640 },
  ],
  cost: { xp: 3400, credits: 18200 },
  model: { hullLong: 6.2, hullWide: 2.9, hullTall: 0.95, turretLong: 2.3, turretWide: 1.95, turretTall: 0.72, gunLong: 3.6, gunCaliber: 0.17, wheels: 6, wheelR: 0.42, skirt: true },
});

def({
  id: 'tiger', name: 'Tiger I', nation: 'germany', class: 'HT', tier: 4,
  hp: 890, speed: 40, reverse: 14, hullTraverse: 26, turretTraverse: 20, viewRange: 370, camo: 0.11,
  armor: { hullFront: 100, hullSide: 80, hullRear: 80, turretFront: 120, turretSide: 80, turretRear: 80 },
  gun: { name: '8,8 cm KwK 36 L/56', caliber: 88, reload: 6.5, aimTime: 2.7, dispersion: 0.38, depression: 8, elevation: 17 },
  shells: [
    { type: 'AP', name: 'ББ', pen: 145, damage: 220, speed: 780 },
    { type: 'APCR', name: 'БП', pen: 188, damage: 220, speed: 930 },
    { type: 'HE', name: 'ОФ', pen: 47, damage: 295, speed: 650 },
  ],
  cost: { xp: 11000, credits: 52000 },
  model: { hullLong: 6.9, hullWide: 3.4, hullTall: 1.1, turretLong: 2.6, turretWide: 2.3, turretTall: 0.85, gunLong: 4.0, gunCaliber: 0.19, mantlet: 0.36, wheels: 6, wheelR: 0.46, skirt: true },
});

def({
  id: 'tiger2', name: 'Tiger II', nation: 'germany', class: 'HT', tier: 5,
  hp: 1320, speed: 38, reverse: 14, hullTraverse: 25, turretTraverse: 19, viewRange: 380, camo: 0.1,
  armor: { hullFront: 150, hullSide: 80, hullRear: 80, turretFront: 180, turretSide: 80, turretRear: 80 },
  gun: { name: '8,8 cm KwK 43 L/71', caliber: 88, reload: 8.2, aimTime: 2.8, dispersion: 0.34, depression: 8, elevation: 17 },
  shells: [
    { type: 'AP', name: 'ББ', pen: 203, damage: 240, speed: 1000 },
    { type: 'APCR', name: 'БП', pen: 237, damage: 240, speed: 1150 },
    { type: 'HE', name: 'ОФ', pen: 59, damage: 320, speed: 700 },
  ],
  cost: { xp: 24000, credits: 105000 },
  model: { hullLong: 7.2, hullWide: 3.6, hullTall: 1.2, turretLong: 2.9, turretWide: 2.5, turretTall: 0.95, gunLong: 4.4, gunCaliber: 0.19, mantlet: 0.38, wheels: 6, wheelR: 0.48, skirt: true },
});

// ===== США =====
def({
  id: 'm2light', name: 'M2 Light', nation: 'usa', class: 'LT', tier: 1,
  hp: 240, speed: 36, reverse: 14, hullTraverse: 40, turretTraverse: 42, viewRange: 290, camo: 0.22,
  armor: { hullFront: 16, hullSide: 16, hullRear: 13, turretFront: 16, turretSide: 16, turretRear: 16 },
  gun: { name: '37 мм M5', caliber: 37, reload: 2.2, aimTime: 1.7, dispersion: 0.46, depression: 10, elevation: 20 },
  shells: [
    { type: 'AP', name: 'ББ', pen: 48, damage: 40, speed: 800 },
    { type: 'APCR', name: 'БП', pen: 76, damage: 40, speed: 950 },
    { type: 'HE', name: 'ОФ', pen: 20, damage: 52, speed: 600 },
  ],
  cost: { xp: 0, credits: 0 },
  model: { hullLong: 4.4, hullWide: 2.4, hullTall: 0.85, turretLong: 1.8, turretWide: 1.5, turretTall: 0.6, gunLong: 2.5, gunCaliber: 0.11, wheels: 4, wheelR: 0.37 },
});

def({
  id: 'm3stuart', name: 'M3 Stuart', nation: 'usa', class: 'LT', tier: 2,
  hp: 350, speed: 58, reverse: 20, hullTraverse: 44, turretTraverse: 44, viewRange: 320, camo: 0.21,
  armor: { hullFront: 38, hullSide: 25, hullRear: 25, turretFront: 38, turretSide: 25, turretRear: 25 },
  gun: { name: '37 мм M6', caliber: 37, reload: 2.0, aimTime: 1.6, dispersion: 0.42, depression: 10, elevation: 20 },
  shells: [
    { type: 'AP', name: 'ББ', pen: 70, damage: 40, speed: 880 },
    { type: 'APCR', name: 'БП', pen: 110, damage: 40, speed: 1050 },
    { type: 'HE', name: 'ОФ', pen: 20, damage: 52, speed: 620 },
  ],
  cost: { xp: 850, credits: 4500 },
  model: { hullLong: 5.0, hullWide: 2.4, hullTall: 0.88, turretLong: 2.0, turretWide: 1.6, turretTall: 0.62, gunLong: 2.7, gunCaliber: 0.11, wheels: 4, wheelR: 0.4 },
});

def({
  id: 'm4sherman', name: 'M4 Sherman', nation: 'usa', class: 'MT', tier: 3,
  hp: 570, speed: 48, reverse: 18, hullTraverse: 38, turretTraverse: 34, viewRange: 350, camo: 0.17,
  armor: { hullFront: 63, hullSide: 38, hullRear: 38, turretFront: 76, turretSide: 50, turretRear: 50 },
  gun: { name: '75 мм M3', caliber: 75, reload: 4.0, aimTime: 2.2, dispersion: 0.42, depression: 10, elevation: 25 },
  shells: [
    { type: 'AP', name: 'ББ', pen: 110, damage: 110, speed: 780 },
    { type: 'APCR', name: 'БП', pen: 150, damage: 110, speed: 950 },
    { type: 'HE', name: 'ОФ', pen: 38, damage: 175, speed: 620 },
  ],
  cost: { xp: 3300, credits: 17400 },
  model: { hullLong: 6.0, hullWide: 2.8, hullTall: 1.05, turretLong: 2.3, turretWide: 2.0, turretTall: 0.75, gunLong: 3.2, gunCaliber: 0.17, wheels: 5, wheelR: 0.44 },
});

def({
  id: 'pershing', name: 'M26 Pershing', nation: 'usa', class: 'MT', tier: 4,
  hp: 780, speed: 40, reverse: 15, hullTraverse: 32, turretTraverse: 30, viewRange: 380, camo: 0.14,
  armor: { hullFront: 100, hullSide: 50, hullRear: 50, turretFront: 130, turretSide: 76, turretRear: 76 },
  gun: { name: '90 мм M3', caliber: 90, reload: 7.4, aimTime: 2.7, dispersion: 0.36, depression: 10, elevation: 20 },
  shells: [
    { type: 'AP', name: 'ББ', pen: 160, damage: 240, speed: 820 },
    { type: 'APCR', name: 'БП', pen: 205, damage: 240, speed: 1000 },
    { type: 'HE', name: 'ОФ', pen: 45, damage: 320, speed: 650 },
  ],
  cost: { xp: 12500, credits: 58000 },
  model: { hullLong: 6.6, hullWide: 3.2, hullTall: 1.12, turretLong: 2.5, turretWide: 2.2, turretTall: 0.85, gunLong: 4.0, gunCaliber: 0.19, mantlet: 0.4, wheels: 6, wheelR: 0.46, skirt: true },
});

// ПТ-САУ (без вращающейся башни — орудие в рубке)
def({
  id: 'su-76', name: 'СУ-76', nation: 'ussr', class: 'TD', tier: 2,
  hp: 310, speed: 45, reverse: 18, hullTraverse: 36, turretTraverse: 22, viewRange: 310, camo: 0.28,
  armor: { hullFront: 25, hullSide: 15, hullRear: 15, turretFront: 25, turretSide: 15, turretRear: 15 },
  gun: { name: '76 мм ЗиС-3', caliber: 76, reload: 4.4, aimTime: 2.2, dispersion: 0.4, depression: 5, elevation: 15 },
  shells: [
    { type: 'AP', name: 'ББ', pen: 108, damage: 110, speed: 900 },
    { type: 'APCR', name: 'БП', pen: 150, damage: 95, speed: 1080 },
    { type: 'HE', name: 'ОФ', pen: 38, damage: 164, speed: 620 },
  ],
  cost: { xp: 1500, credits: 9600 },
  model: { hullLong: 5.6, hullWide: 2.8, hullTall: 0.9, turretLong: 2.2, turretWide: 2.2, turretTall: 0.8, gunLong: 3.4, gunCaliber: 0.17, wheels: 5, wheelR: 0.4, casemate: true },
});

// Дополнительные требования: ветка ПТ начинается от Т-26, а не с нуля
export const REQUIREMENTS = { 'su-76': 't-26' };

// Дерево прокачки: линии по нациям/веткам
export const TECH_TREE = {
  ussr: ['t-26', 'bt-7', 't-34', 'kv-1', 'is-2'],
  germany: ['pz2', 'pz3', 'pz4', 'tiger', 'tiger2'],
  usa: ['m2light', 'm3stuart', 'm4sherman', 'pershing'],
  td: ['su-76'],
};

export const TANKS = T;

// Танки, собранные в редакторе моделей (models.html) и импортированные в игру
export const CUSTOM_STORAGE_KEY = 'city_tanks_custom_v1';
const CUSTOM = [];

export function getTank(id) {
  return T.find(t => t.id === id) || null;
}

export function customTanks() { return CUSTOM.slice(); }

/** Регистрирует профиль из редактора как играбельный танк. */
export function registerCustomTank(profile) {
  if (!profile || !profile.id || !Array.isArray(profile.parts) || !profile.parts.length) {
    throw new Error('Некорректный профиль модели');
  }
  const st = profile.stats || {};
  const gun = profile.gun || {};
  const def = {
    id: String(profile.id),
    name: profile.name || profile.id,
    nation: NATIONS[profile.nation] ? profile.nation : 'ussr',
    class: CLASSES[profile.class] ? profile.class : 'MT',
    tier: Math.max(1, Math.min(10, Number(profile.tier) || 3)),
    hp: Number(st.hp) || 500,
    speed: Number(st.speed) || 45,
    reverse: Number(st.reverse) || 18,
    hullTraverse: Number(st.hullTraverse) || 35,
    turretTraverse: Number(st.turretTraverse) || 34,
    viewRange: Number(st.viewRange) || 330,
    camo: Number(st.camo) || 0.18,
    armor: { ...(profile.armor || {}) },
    gun: {
      name: gun.name || 'Орудие',
      caliber: Number(gun.caliber) || 75,
      reload: Number(gun.reload) || 4.5,
      aimTime: Number(gun.aimTime) || 2.4,
      dispersion: Number(gun.dispersion) || 0.42,
      depression: Number(gun.depression) || 6,
      elevation: Number(gun.elevation) || 20,
    },
    shells: Array.isArray(profile.shells) && profile.shells.length === 3
      ? profile.shells
      : [{ type: 'AP', pen: 110, damage: 110, speed: 800 },
         { type: 'APCR', pen: 150, damage: 110, speed: 1000 },
         { type: 'HE', pen: 38, damage: 175, speed: 620 }],
    cost: { xp: 0, credits: 0 },
    custom: true,
    customProfile: profile,
  };
  const tIdx = T.findIndex(t => t.id === def.id);
  if (tIdx >= 0) T[tIdx] = def; else T.push(def);
  const cIdx = CUSTOM.findIndex(c => c.id === def.id);
  if (cIdx >= 0) CUSTOM[cIdx] = def; else CUSTOM.push(def);
  return def;
}

/** Сохраняет профили пользовательских танков в localStorage. */
export function saveCustomTanks(profiles) {
  try { localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(profiles)); } catch (e) { console.warn(e); }
}

export function loadCustomProfiles() {
  try {
    const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

// Превращает определение танка в полный JSON-профиль модели (как экспортирует редактор)
export function tankToProfile(tank) {
  // Пользовательский танк уже пришёл из редактора готовым профилем
  if (tank.custom && tank.customProfile) {
    const p = tank.customProfile;
    return {
      ...p,
      version: 1,
      id: tank.id,
      name: tank.name,
      nation: tank.nation,
      class: tank.class,
      tier: tank.tier,
      armor: tank.armor,
      stats: {
        hp: tank.hp, speed: tank.speed, reverse: tank.reverse,
        hullTraverse: tank.hullTraverse, turretTraverse: tank.turretTraverse,
        viewRange: tank.viewRange, camo: tank.camo,
      },
      gun: tank.gun,
      shells: tank.shells,
    };
  }
  const built = buildTankModel({ ...tank.model });
  return {
    version: 1,
    id: tank.id,
    name: tank.name,
    nation: tank.nation,
    class: tank.class,
    tier: tank.tier,
    armor: tank.armor,
    stats: {
      hp: tank.hp, speed: tank.speed, reverse: tank.reverse,
      hullTraverse: tank.hullTraverse, turretTraverse: tank.turretTraverse,
      viewRange: tank.viewRange, camo: tank.camo,
    },
    gun: tank.gun,
    shells: tank.shells,
    parts: built.parts,
    pivots: built.pivots,
  };
}

// Находит следующий танк в ветке (для прокачки)
export function nextTank(id) {
  for (const line of Object.values(TECH_TREE)) {
    const i = line.indexOf(id);
    if (i >= 0 && i < line.length - 1) return getTank(line[i + 1]);
  }
  return null;
}
