import * as THREE from '../vendor/three.module.js';
import { createTankModel, disposeModel } from './model.js';
import { TANKS, tankToProfile, NATIONS, CLASSES } from './data/tanks.js';
import { $ } from './ui.js';
import { toast } from './ui.js';

// ============================================================
//  Редактор моделей танков → JSON-профиль для игры
//  Формат: parts[] + pivots{} + armor{} + stats{} + gun{} + shells[]
// ============================================================
const STORE_KEY = 'city_tanks_models_v1';
const DEG = Math.PI / 180;

const KINDS = [
  ['hull', 'Корпус'], ['turret', 'Башня'], ['gun', 'Орудие'],
  ['wheel', 'Каток'], ['track', 'Гусеница'], ['detail', 'Деталь'],
];
const TYPES = ['box', 'wedge', 'cylinder', 'sphere', 'cone'];

let profile = null;
let selected = -1;
let model = null;
let autoSpin = false;

// ---------------- Профиль по умолчанию ----------------
function blankProfile() {
  return {
    version: 1,
    id: 'custom-tank',
    name: 'Новый танк',
    nation: 'ussr',
    class: 'MT',
    tier: 3,
    armor: { hullFront: 45, hullSide: 40, hullRear: 40, turretFront: 45, turretSide: 45, turretRear: 45 },
    stats: { hp: 500, speed: 45, reverse: 18, hullTraverse: 35, turretTraverse: 34, viewRange: 330, camo: 0.18 },
    gun: { name: '75 мм', caliber: 75, reload: 4.5, aimTime: 2.4, dispersion: 0.42, depression: 6, elevation: 20 },
    shells: [
      { type: 'AP', name: 'ББ', pen: 110, damage: 110, speed: 800 },
      { type: 'APCR', name: 'БП', pen: 150, damage: 110, speed: 1000 },
      { type: 'HE', name: 'ОФ', pen: 38, damage: 175, speed: 620 },
    ],
    parts: [
      { type: 'box', kind: 'hull', size: [2.6, 1.0, 5.0], pos: [0, 1.05, 0], rot: [0, 0, 0], color: '#4d5c3f' },
      { type: 'wedge', kind: 'hull', size: [2.55, 0.92, 1.5], pos: [0, 1.05, -2.5], rot: [18, 0, 0], color: '#4d5c3f', zone: 'hullFront' },
      { type: 'box', kind: 'hull', size: [1.8, 0.18, 2.0], pos: [0, 1.64, 0], rot: [0, 0, 0], color: '#3c4a32' },
      { type: 'box', kind: 'turret', size: [1.9, 0.75, 2.2], pos: [0, 0.37, 0], rot: [0, 0, 0], color: '#556645', zone: 'turretSide' },
      { type: 'cylinder', kind: 'gun', size: [0.42, 0.42, 0.34, 10], pos: [0, 0, -0.13], rot: [90, 0, 0], color: '#616b55', zone: 'turretFront' },
      { type: 'cylinder', kind: 'gun', size: [0.17, 0.16, 3.2, 8], pos: [0, 0, -1.8], rot: [90, 0, 0], color: '#2b2e28' },
      { type: 'box', kind: 'track', size: [0.5, 0.75, 4.4], pos: [-1.55, 0.42, 0], rot: [0, 0, 0], color: '#20221f' },
      { type: 'box', kind: 'track', size: [0.5, 0.75, 4.4], pos: [1.55, 0.42, 0], rot: [0, 0, 0], color: '#20221f' },
      { type: 'cylinder', kind: 'wheel', size: [0.4, 0.4, 0.46, 10], pos: [-1.55, 0.42, -1.6], rot: [0, 0, 90], color: '#383b34' },
      { type: 'cylinder', kind: 'wheel', size: [0.4, 0.4, 0.46, 10], pos: [-1.55, 0.42, 0], rot: [0, 0, 90], color: '#383b34' },
      { type: 'cylinder', kind: 'wheel', size: [0.4, 0.4, 0.46, 10], pos: [-1.55, 0.42, 1.6], rot: [0, 0, 90], color: '#383b34' },
      { type: 'cylinder', kind: 'wheel', size: [0.4, 0.4, 0.46, 10], pos: [1.55, 0.42, -1.6], rot: [0, 0, 90], color: '#383b34' },
      { type: 'cylinder', kind: 'wheel', size: [0.4, 0.4, 0.46, 10], pos: [1.55, 0.42, 0], rot: [0, 0, 90], color: '#383b34' },
      { type: 'cylinder', kind: 'wheel', size: [0.4, 0.4, 0.46, 10], pos: [1.55, 0.42, 1.6], rot: [0, 0, 90], color: '#383b34' },
    ],
    pivots: { turret: [0, 1.73, 0], gun: [0, 0.41, -1.2], muzzle: [0, 0, -3.5] },
  };
}

// ---------------- 3D ----------------
const canvas = $('editor-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
scene.add(new THREE.HemisphereLight(0xa8c8ff, 0x1a1f26, 1.0));
const key = new THREE.DirectionalLight(0xffffff, 2.3);
key.position.set(6, 12, 7);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -12; key.shadow.camera.right = 12;
key.shadow.camera.top = 12; key.shadow.camera.bottom = -12;
scene.add(key);
const rim = new THREE.DirectionalLight(0xffc46b, 1.2);
rim.position.set(-8, 6, -8);
scene.add(rim);

const platform = new THREE.Mesh(
  new THREE.CylinderGeometry(7, 7.4, 0.3, 48),
  new THREE.MeshStandardMaterial({ color: 0x232e3c, roughness: 0.8, metalness: 0.3 })
);
platform.position.y = -0.16;
platform.receiveShadow = true;
scene.add(platform);
const grid = new THREE.GridHelper(28, 28, 0x2f3d4f, 0x1b2431);
grid.position.y = -0.32;
scene.add(grid);

const holder = new THREE.Group();
scene.add(holder);

let camAngle = 0.9, camHeight = 5.2, camDist = 11;
let dragging = false, lastX = 0, lastY = 0;

canvas.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
addEventListener('pointerup', () => { dragging = false; });
addEventListener('pointermove', e => {
  if (!dragging) return;
  camAngle -= (e.clientX - lastX) * 0.01;
  camHeight = Math.max(1.5, Math.min(14, camHeight + (e.clientY - lastY) * 0.05));
  lastX = e.clientX; lastY = e.clientY;
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  camDist = Math.max(5, Math.min(24, camDist + Math.sign(e.deltaY) * 0.8));
}, { passive: false });

function resize() {
  const vp = $('viewport');
  const w = vp.clientWidth, h = vp.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---------------- Построение модели ----------------
function rebuild() {
  if (model) { holder.remove(model.group); disposeModel(model); }
  model = createTankModel(profile);
  const box = new THREE.Box3().setFromObject(model.group);
  model.group.position.y -= box.min.y;
  model.setTurretAngle(Number($('test-turret').value) * DEG);
  model.setGunPitch(Number($('test-gun').value) * DEG);
  holder.add(model.group);

  let tris = 0;
  model.meshes.forEach(m => {
    const g = m.geometry;
    tris += g.index ? g.index.count / 3 : (g.attributes.position?.count || 0) / 3;
  });
  $('tri-count').textContent = Math.round(tris);
  $('parts-count').textContent = profile.parts.length;
  $('model-name').textContent = `${profile.name} · ${profile.id}`;
  const jv = $('json-view');
  if (jv) jv.value = JSON.stringify(profile, null, 1);
  renderParts();
}

function animate() {
  requestAnimationFrame(animate);
  const t = performance.now() / 1000;
  camera.position.set(Math.sin(camAngle) * camDist, camHeight, Math.cos(camAngle) * camDist);
  camera.lookAt(0, 1.4, 0);
  if (model) {
    model.setTurretAngle(Number($('test-turret').value) * DEG);
    model.setGunPitch(Number($('test-gun').value) * DEG);
    if (autoSpin) for (const w of model.wheels) w.rotation.x += 0.06;
  }
  renderer.render(scene, camera);
}

// ---------------- Список частей ----------------
function renderParts() {
  const host = $('parts-list');
  host.innerHTML = profile.parts.map((p, i) => `
    <div class="part-item ${i === selected ? 'active' : ''}" data-index="${i}">
      <span class="dot" style="background:${p.color || '#666'}"></span>
      <span class="pname">${escapeHtml(p.kind || 'part')} #${i}</span>
      <span class="ptype">${p.type}</span>
    </div>`).join('');
  host.querySelectorAll('.part-item').forEach(el => {
    el.onclick = () => { selected = Number(el.dataset.index); renderParts(); renderProps(); };
    el.oncontextmenu = (e) => {
      e.preventDefault();
      const i = Number(el.dataset.index);
      profile.parts.splice(i, 1);
      selected = -1;
      rebuild(); renderProps();
      toast('Часть удалена');
    };
  });
}

// ---------------- Свойства ----------------
function numField(label, value, onChange, step = 0.01) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const l = document.createElement('label');
  l.textContent = label;
  const input = document.createElement('input');
  input.type = 'number'; input.step = step; input.value = value;
  input.oninput = () => onChange(Number(input.value));
  wrap.append(l, input);
  return wrap;
}

function vecField(label, getArr, onChange, step = 0.01) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const l = document.createElement('label');
  l.textContent = label;
  const row = document.createElement('div');
  row.className = 'vec-row';
  const labels = ['X', 'Y', 'Z'];
  const values = getArr();
  values.forEach((v, i) => {
    const input = document.createElement('input');
    input.type = 'number'; input.step = step; input.value = v;
    input.title = labels[i];
    input.oninput = () => {
      const next = [...getArr()];   // берём актуальные значения, а не устаревшую копию
      next[i] = Number(input.value) || 0;
      onChange(next);
    };
    row.appendChild(input);
  });
  wrap.append(l, row);
  return wrap;
}

function textField(label, value, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const l = document.createElement('label');
  l.textContent = label;
  const input = document.createElement('input');
  input.type = 'text'; input.value = value;
  input.oninput = () => onChange(input.value);
  wrap.append(l, input);
  return wrap;
}

function selectField(label, value, options, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const l = document.createElement('label');
  l.textContent = label;
  const sel = document.createElement('select');
  for (const [val, text] of options) {
    const o = document.createElement('option');
    o.value = val; o.textContent = text;
    if (val === value) o.selected = true;
    sel.appendChild(o);
  }
  sel.onchange = () => onChange(sel.value);
  wrap.append(l, sel);
  return wrap;
}

function section(title) {
  const div = document.createElement('div');
  div.className = 'section';
  if (title) { const h = document.createElement('h4'); h.textContent = title; div.appendChild(h); }
  return div;
}

function renderProps() {
  const body = $('props-body');
  body.innerHTML = '';

  if (selected < 0 || !profile.parts[selected]) {
    body.innerHTML = '<p class="muted small" style="padding:12px">Выберите часть слева или добавьте новую. ПКМ по части — удалить.</p>';
    body.appendChild(metaSection());
    return;
  }

  const p = profile.parts[selected];
  const sec = section(`Часть #${selected}`);

  sec.appendChild(textField('Имя', p.kind || 'part', v => { p.kind = v; commit(); }));
  sec.appendChild(selectField('Тип', p.type, TYPES.map(t => [t, t]), v => { p.type = v; commit(); }));
  sec.appendChild(selectField('Узел', p.kind, KINDS, v => { p.kind = v; commit(); }));
  sec.appendChild(vecField('Размер', () => p.size, v => { p.size = v; commit(); }, 0.05));
  sec.appendChild(vecField('Позиция', () => p.pos, v => { p.pos = v; commit(); }));
  sec.appendChild(vecField('Поворот°', () => p.rot || [0, 0, 0], v => { p.rot = v; commit(); }, 1));
  sec.appendChild(selectField('Зона брони', p.zone || '', [
    ['', '— авто —'], ['hullFront', 'лоб корпуса'], ['hullSide', 'борт корпуса'], ['hullRear', 'корма корпуса'],
    ['turretFront', 'лоб башни'], ['turretSide', 'борт башни'], ['turretRear', 'корма башни'],
  ], v => { if (v) p.zone = v; else delete p.zone; commit(); }));

  const colorRow = document.createElement('div');
  colorRow.className = 'field';
  const cl = document.createElement('label'); cl.textContent = 'Цвет';
  const ci = document.createElement('input'); ci.type = 'color'; ci.value = p.color || '#4d5c3f';
  ci.oninput = () => { p.color = ci.value; commit(); };
  colorRow.append(cl, ci);
  sec.appendChild(colorRow);

  const btns = document.createElement('div');
  btns.className = 'btn-row';
  const dup = document.createElement('button');
  dup.textContent = 'Дублировать';
  dup.onclick = () => {
    const copy = JSON.parse(JSON.stringify(p));
    copy.pos = [copy.pos[0] + (copy.pos[0] >= 0 ? 0.6 : -0.6), copy.pos[1], copy.pos[2]];
    profile.parts.push(copy);
    selected = profile.parts.length - 1;
    commit(); renderProps();
  };
  const del = document.createElement('button');
  del.textContent = 'Удалить';
  del.className = 'danger';
  del.onclick = () => { profile.parts.splice(selected, 1); selected = -1; commit(); renderProps(); };
  btns.append(dup, del);
  sec.appendChild(btns);
  body.appendChild(sec);

  // Пивоты
  const piv = section('Пивоты (точки вращения)');
  piv.appendChild(vecField('Башня', () => profile.pivots.turret, v => { profile.pivots.turret = v; commit(); }));
  piv.appendChild(vecField('Орудие', () => profile.pivots.gun, v => { profile.pivots.gun = v; commit(); }));
  piv.appendChild(vecField('Дуло', () => profile.pivots.muzzle, v => { profile.pivots.muzzle = v; commit(); }));
  body.appendChild(piv);

  body.appendChild(metaSection());
}

function metaSection() {
  const sec = section('Танк');
  sec.appendChild(textField('ID', profile.id, v => { profile.id = v.trim().replace(/\s+/g, '-').toLowerCase(); commit(); }));
  sec.appendChild(textField('Название', profile.name, v => { profile.name = v; commit(); }));
  sec.appendChild(selectField('Нация', profile.nation, Object.entries(NATIONS).map(([k, v]) => [k, v.name]), v => { profile.nation = v; commit(); }));
  sec.appendChild(selectField('Класс', profile.class, Object.entries(CLASSES).map(([k, v]) => [k, v.name]), v => { profile.class = v; commit(); }));
  sec.appendChild(numField('Уровень', profile.tier, v => { profile.tier = Math.max(1, Math.min(10, v)); commit(); }, 1));

  const armor = section('Броня, мм');
  for (const [key, label] of [['hullFront', 'Лоб корпуса'], ['hullSide', 'Борт корпуса'], ['hullRear', 'Корма корпуса'],
    ['turretFront', 'Лоб башни'], ['turretSide', 'Борт башни'], ['turretRear', 'Корма башни']]) {
    armor.appendChild(numField(label, profile.armor[key], v => { profile.armor[key] = v; commit(); }, 5));
  }
  sec.appendChild(armor);

  const stats = section('Подвижность');
  stats.appendChild(numField('Прочность', profile.stats.hp, v => { profile.stats.hp = v; commit(); }, 10));
  stats.appendChild(numField('Скорость', profile.stats.speed, v => { profile.stats.speed = v; commit(); }, 1));
  stats.appendChild(numField('Поворот корпуса', profile.stats.hullTraverse, v => { profile.stats.hullTraverse = v; commit(); }, 1));
  stats.appendChild(numField('Поворот башни', profile.stats.turretTraverse, v => { profile.stats.turretTraverse = v; commit(); }, 1));
  stats.appendChild(numField('Обзор', profile.stats.viewRange, v => { profile.stats.viewRange = v; commit(); }, 10));
  sec.appendChild(stats);

  const gun = section('Орудие');
  gun.appendChild(textField('Название', profile.gun.name, v => { profile.gun.name = v; commit(); }));
  gun.appendChild(numField('Калибр', profile.gun.caliber, v => { profile.gun.caliber = v; commit(); }, 1));
  gun.appendChild(numField('Перезарядка', profile.gun.reload, v => { profile.gun.reload = v; commit(); }, 0.1));
  gun.appendChild(numField('Сведение', profile.gun.aimTime, v => { profile.gun.aimTime = v; commit(); }, 0.1));
  gun.appendChild(numField('Разброс', profile.gun.dispersion, v => { profile.gun.dispersion = v; commit(); }, 0.01));
  gun.appendChild(numField('Углы вниз', profile.gun.depression, v => { profile.gun.depression = v; commit(); }, 1));
  gun.appendChild(numField('Углы вверх', profile.gun.elevation, v => { profile.gun.elevation = v; commit(); }, 1));
  sec.appendChild(gun);

  const shells = section('Снаряды');
  profile.shells.forEach((s, i) => {
    shells.appendChild(numField(`${s.type} пробитие`, s.pen, v => { s.pen = v; commit(); }, 5));
    shells.appendChild(numField(`${s.type} урон`, s.damage, v => { s.damage = v; commit(); }, 5));
  });
  sec.appendChild(shells);

  return sec;
}

function commit() {
  // Пересобираем модель и обновляем JSON
  const keepTurret = Number($('test-turret').value);
  const keepGun = Number($('test-gun').value);
  rebuild();
  $('test-turret').value = keepTurret;
  $('test-gun').value = keepGun;
  $('model-name').textContent = `${profile.name} · ${profile.id}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------- Действия ----------------
function addPart(type, kind = 'hull') {
  const defaults = {
    box: { size: [1.2, 1, 1.6], color: '#4d5c3f' },
    wedge: { size: [1.6, 0.7, 1.2], color: '#4d5c3f', zone: 'hullFront' },
    cylinder: { size: [0.4, 0.4, 1.2, 10], color: '#383b34' },
    sphere: { size: [0.5, 12], color: '#556645' },
    cone: { size: [0.4, 1, 10], color: '#556645' },
  }[type];
  const part = { type, kind, ...defaults, pos: [0, 1.2, 0], rot: [0, 0, 0] };
  profile.parts.push(part);
  selected = profile.parts.length - 1;
  commit();
  renderProps();
}

function download(name, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function saveLocal() {
  const list = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
  const i = list.findIndex(m => m.id === profile.id);
  if (i >= 0) list[i] = profile; else list.push(profile);
  localStorage.setItem(STORE_KEY, JSON.stringify(list));
  toast(`Сохранено локально: ${profile.name}`);
}

function loadLocal() {
  const list = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
  return list;
}

// ---------------- Инициализация UI ----------------
function initUI() {
  document.querySelectorAll('[data-add]').forEach(btn => {
    btn.onclick = () => addPart(btn.dataset.add, btn.dataset.add === 'cylinder' ? 'detail' : 'hull');
  });

  // Список танков игры
  const sel = $('load-game');
  for (const t of TANKS) {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = `${NATIONS[t.nation].name} · ${t.name} (${t.tier})`;
    sel.appendChild(o);
  }
  sel.onchange = () => {
    const t = TANKS.find(x => x.id === sel.value);
    if (!t) return;
    profile = tankToProfile(t);
    profile.id = t.id; profile.name = t.name;
    selected = -1;
    commit(); renderProps();
    toast(`Загружен ${t.name}`);
    sel.value = '';
  };

  $('btn-new').onclick = () => {
    if (!confirm('Создать новый танк? Несохранённые изменения потеряются.')) return;
    profile = blankProfile();
    selected = -1;
    commit(); renderProps();
  };

  $('btn-export').onclick = () => {
    download(`${profile.id || 'tank'}.json`, JSON.stringify(profile, null, 2));
    toast('JSON выгружен');
  };

  $('btn-copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(profile, null, 2));
      toast('JSON скопирован в буфер');
    } catch { toast('Браузер не дал доступ к буферу'); }
  };

  $('btn-import').onclick = () => $('file-input').click();
  $('file-input').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.parts || !Array.isArray(data.parts)) throw new Error('нет parts[]');
        profile = normalizeProfile(data);
        selected = -1;
        commit(); renderProps();
        toast(`Импортирован ${profile.name}`);
      } catch (err) {
        toast('Ошибка импорта: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  $('test-spin').onchange = () => { autoSpin = $('test-spin').checked; };
  $('btn-save-local').onclick = saveLocal;

  // Сохранение по Ctrl+S
  addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveLocal();
    }
  });
}

// Приводит импортированный профиль к полному виду
function normalizeProfile(data) {
  const base = blankProfile();
  return {
    ...base,
    ...data,
    armor: { ...base.armor, ...(data.armor || {}) },
    stats: { ...base.stats, ...(data.stats || {}) },
    gun: { ...base.gun, ...(data.gun || {}) },
    shells: Array.isArray(data.shells) && data.shells.length ? data.shells : base.shells,
    pivots: { ...base.pivots, ...(data.pivots || {}) },
    parts: data.parts,
  };
}

// ---------------- Старт ----------------
profile = blankProfile();
initUI();
resize();
rebuild();
renderProps();
animate();

// локальные сохранения показываем в консоли — на будущее
window.CityTanksModels = { list: loadLocal, save: saveLocal, current: () => profile };
