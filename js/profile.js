// ============================================================
//  Профиль игрока: серебро, опыт, исследованные и купленные танки
//  Хранение: localStorage (ключ v2)
// ============================================================

import { TANKS, TECH_TREE, REQUIREMENTS, getTank } from './data/tanks.js';

const KEY = 'city_tanks_profile_v2';

function starterTanks() {
  const tanks = {};
  for (const t of TANKS) {
    if (t.tier === 1 || t.custom) tanks[t.id] = { owned: true, researched: true, xp: 0, battles: 0, kills: 0 };
    else tanks[t.id] = { owned: false, researched: false, xp: 0, battles: 0, kills: 0 };
  }
  return tanks;
}

export function defaultProfile() {
  return {
    name: 'Командир',
    credits: 30000,
    freeXp: 0,
    tanks: starterTanks(),
    selected: 't-26',
    stats: { battles: 0, wins: 0, kills: 0, damage: 0 },
    settings: { sound: true, quality: 'high' },
  };
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProfile();
    const p = JSON.parse(raw);
    const base = defaultProfile();
    // мягкое слияние: новые танки из обновлений не ломают старый профиль
    const tanks = { ...base.tanks };
    for (const id of Object.keys(p.tanks || {})) {
      if (tanks[id]) tanks[id] = { ...tanks[id], ...p.tanks[id] };
    }
    const merged = { ...base, ...p, tanks, stats: { ...base.stats, ...(p.stats || {}) }, settings: { ...base.settings, ...(p.settings || {}) } };
    if (!getTank(merged.selected)) merged.selected = 't-26';
    return merged;
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(profile) {
  try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch (e) { console.warn('profile save failed', e); }
  return profile;
}

export function resetProfile() {
  const p = defaultProfile();
  saveProfile(p);
  return p;
}

// ---------- Прокачка ----------
export function predecessorOf(id) {
  if (REQUIREMENTS[id]) return REQUIREMENTS[id];
  for (const line of Object.values(TECH_TREE)) {
    const i = line.indexOf(id);
    if (i > 0) return line[i - 1];
  }
  return null;
}

export function researchInfo(profile, id) {
  const tank = getTank(id);
  const state = profile.tanks[id];
  const pred = predecessorOf(id);
  if (!tank || !state) return { can: false, reason: 'Нет такого танка' };
  if (state.researched) return { can: false, reason: 'Уже исследован', tank };
  if (pred && !profile.tanks[pred]?.researched) {
    return { can: false, reason: `Сначала исследуйте ${getTank(pred)?.name}`, tank, pred };
  }
  const xpPool = pred ? profile.tanks[pred].xp : profile.freeXp;
  if (xpPool < tank.cost.xp) {
    return { can: false, reason: `Не хватает ${tank.cost.xp - xpPool} опыта`, tank, pred, xpPool };
  }
  return { can: true, tank, pred, xpPool };
}

export function research(profile, id) {
  const info = researchInfo(profile, id);
  if (!info.can) return { ok: false, reason: info.reason };
  const { tank, pred } = info;
  if (pred) profile.tanks[pred].xp -= tank.cost.xp;
  else profile.freeXp -= tank.cost.xp;
  profile.tanks[id].researched = true;
  profile.selected = id;
  saveProfile(profile);
  return { ok: true, tank };
}

export function buyInfo(profile, id) {
  const tank = getTank(id);
  const state = profile.tanks[id];
  if (!tank || !state) return { can: false, reason: 'Нет такого танка' };
  if (state.owned) return { can: false, reason: 'Уже в ангаре' };
  if (!state.researched) return { can: false, reason: 'Сначала исследуйте' };
  if (profile.credits < tank.cost.credits) {
    return { can: false, reason: `Не хватает ${fmtNum(tank.cost.credits - profile.credits)} серебра` };
  }
  return { can: true, tank };
}

export function buy(profile, id) {
  const info = buyInfo(profile, id);
  if (!info.can) return { ok: false, reason: info.reason };
  profile.credits -= info.tank.cost.credits;
  profile.tanks[id].owned = true;
  profile.selected = id;
  saveProfile(profile);
  return { ok: true, tank: info.tank };
}

export function ownTanks(profile) {
  return TANKS.filter(t => profile.tanks[t.id]?.owned);
}

// Выдаёт танк игроку (используется при импорте модели из редактора)
export function grantTank(profile, id) {
  profile.tanks[id] = { owned: true, researched: true, xp: 0, battles: 0, kills: 0 };
  profile.selected = id;
  saveProfile(profile);
  return profile.tanks[id];
}

export function selectTank(profile, id) {
  if (profile.tanks[id]?.owned) {
    profile.selected = id;
    saveProfile(profile);
    return true;
  }
  return false;
}

// ---------- Награды за бой ----------
export function applyBattleResult(profile, result) {
  const { tankId, win, damage, kills, spots, survived } = result;
  const tank = getTank(tankId);
  const tier = tank ? tank.tier : 1;
  const baseXp = Math.round(damage * 0.12 + kills * 18 + spots * 6 + (win ? 45 : 12) + (survived ? 20 : 0));
  const xp = Math.max(5, Math.round(baseXp * (1 + tier * 0.08)));
  const credits = Math.max(100, Math.round((damage * 0.55 + kills * 220 + (win ? 900 : 300)) * (1 + tier * 0.1)));

  const st = profile.tanks[tankId];
  if (st) { st.xp += xp; st.battles = (st.battles || 0) + 1; st.kills = (st.kills || 0) + kills; }
  profile.credits += credits;
  profile.stats.battles++;
  if (win) profile.stats.wins++;
  profile.stats.kills += kills;
  profile.stats.damage += damage;
  saveProfile(profile);
  return { xp, credits, baseXp };
}

export function fmtNum(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function xpToNext(profile, id) {
  const next = Object.values(TECH_TREE).flat();
  const idx = next.indexOf(id);
  const tank = TANKS.find(t => TECH_TREE[t.nation]?.includes(id));
  if (!tank) return 0;
  const line = TECH_TREE[tank.nation] || [];
  const i = line.indexOf(id);
  if (i < 0 || i >= line.length - 1) return 0;
  const nx = getTank(line[i + 1]);
  return nx ? nx.cost.xp : 0;
}
