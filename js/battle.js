import * as THREE from '../vendor/three.module.js';
import { buildCity, WORLD } from './city.js';
import { TANKS, getTank, tankToProfile } from './data/tanks.js';
import { createTankModel, disposeModel } from './model.js';
import { resolveHit, impactAngle, sideFromNormal, zoneKey, SHELL_META } from './armor.js';
import { applyBattleResult } from './profile.js';
import { $, fmt, show, fmtTime, toast, escapeHtml, roman } from './ui.js';

// ============================================================
//  БОЙ 7×7: броня, пробитие, засвет, захват базы, боты
// ============================================================
const TEAM_SIZE = 7;
const BATTLE_TIME = 420;        // секунд
const CAP_RADIUS = 15;          // метров
const CAP_TIME = 45;            // секунд на полный захват
const SPOT_SCALE = 0.45;        // масштаб дальности обзора под размер карты
const SPOT_MEMORY = 2.0;        // сколько помним засвеченного
const DEG = Math.PI / 180;

const BOT_NAMES = ['Гром', 'Вихрь', 'Сокол', 'Клинок', 'Тайфун', 'Барс', 'Шквал', 'Кремень', 'Заря', 'Топор', 'Рысь', 'Молот', 'Стрела', 'Кобра'];

function pickBots(tier, count) {
  const pool = TANKS.filter(t => Math.abs(t.tier - tier) <= 1);
  const out = [];
  for (let i = 0; i < count; i++) out.push(pool[Math.floor(Math.random() * pool.length)]);
  return out;
}

/** Один танк в бою: модель, ТТХ, движение, башня, орудие. */
export class Actor {
  constructor(battle, { tankDef, team, isPlayer = false, name = 'Танк', spawn }) {
    this.battle = battle;
    this.tank = tankDef;
    this.team = team;
    this.isPlayer = isPlayer;
    this.name = name;
    this.hp = tankDef.hp;
    this.maxHp = tankDef.hp;
    this.alive = true;
    this.heading = team === 'A' ? Math.PI : 0;
    this.speed = 0;
    this.turretAngle = 0;
    this.gunPitch = 0;
    this.reloadLeft = 0;   // танк выезжает с заряженным орудием
    this.shellIndex = 0;
    this.bloom = 0;
    this.spottedTimer = 0;
    this.immobilized = 0;
    this.lastFire = -99;
    this.ai = { target: null, retarget: 0, objective: null };

    const profile = tankToProfile(tankDef);
    this.model = createTankModel(profile);
    this.model.group.position.fromArray(spawn);
    this.model.group.rotation.y = this.heading;
    battle.scene.add(this.model.group);
    for (const m of this.model.meshes) m.userData.actor = this;

    this.radius = Math.max(1.6, (this.model.size.x || 3) / 2);
    this.shell = tankDef.shells[0];
  }

  get position() { return this.model.group.position; }
  get forward() { return new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading)); }
  get turretWorldAngle() { return this.heading + this.turretAngle; }
  get gunDirection() {
    const a = this.turretWorldAngle;
    const p = this.gunPitch;
    return new THREE.Vector3(-Math.sin(a) * Math.cos(p), Math.sin(p), -Math.cos(a) * Math.cos(p)).normalize();
  }

  updateRig() {
    this.model.group.rotation.y = this.heading;
    this.model.setTurretAngle(this.turretAngle);
    this.model.setGunPitch(this.gunPitch);
  }

  aimAtPoint(point, dt) {
    const dx = point.x - this.position.x;
    const dz = point.z - this.position.z;
    const desired = Math.atan2(-dx, -dz);
    let diff = desired - this.turretWorldAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxStep = this.tank.turretTraverse * DEG * dt;
    const step = Math.max(-maxStep, Math.min(maxStep, diff));
    this.turretAngle += step;
    this.turretMoving = Math.abs(step) > 0.0005;

    const muzzle = this.getMuzzleWorld();
    const dist = Math.hypot(point.x - muzzle.x, point.z - muzzle.z);
    const dy = (point.y || 0) - muzzle.y;
    const want = Math.atan2(dy, Math.max(1, dist));
    const minP = -this.tank.gun.depression * DEG;
    const maxP = this.tank.gun.elevation * DEG;
    const rate = 25 * DEG * dt;   // скорость вертикальной наводки
    this.gunPitch += Math.max(-rate, Math.min(rate, want - this.gunPitch));
    this.gunPitch = Math.max(minP, Math.min(maxP, this.gunPitch));
    return Math.abs(diff);
  }

  move(throttle, steer, dt) {
    if (this.immobilized > 0) { this.immobilized -= dt; throttle = 0; }
    const maxFwd = this.tank.speed / 3.6;
    const maxRev = this.tank.reverse / 3.6;
    const accel = 6.5;
    const want = throttle >= 0 ? maxFwd * throttle : -maxRev * Math.abs(throttle);
    if (this.speed < want) this.speed = Math.min(want, this.speed + accel * dt);
    else this.speed = Math.max(want, this.speed - accel * 1.6 * dt);
    if (Math.abs(throttle) < 0.01) this.speed *= Math.max(0, 1 - 2.2 * dt);

    const turnRate = this.tank.hullTraverse * DEG * (Math.abs(this.speed) > 0.3 ? 1 : 0.65) * (this.speed < 0 ? -1 : 1);
    this.heading += steer * turnRate * dt;

    const step = this.forward.multiplyScalar(this.speed * dt);
    const next = this.position.clone().add(step);
    this.resolveCollisions(next);
    this.position.copy(next);

    // анимация катков
    for (const w of this.model.wheels) w.rotation.x += this.speed * dt * 1.6;
    this.moving = Math.abs(this.speed) / maxFwd;
  }

  resolveCollisions(next) {
    for (const c of this.battle.mapColliders) {
      const cx = Math.max(c.minX, Math.min(next.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(next.z, c.maxZ));
      const dx = next.x - cx, dz = next.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < this.radius * this.radius) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          next.x = cx + (dx / d) * this.radius;
          next.z = cz + (dz / d) * this.radius;
        } else { next.x -= this.forward.x * 0.5; next.z -= this.forward.z * 0.5; }
      }
    }
    const B = WORLD.half - 3;
    next.x = Math.max(-B, Math.min(B, next.x));
    next.z = Math.max(-B, Math.min(B, next.z));
  }

  getMuzzleWorld() {
    this.model.group.updateWorldMatrix(true, true);
    return this.model.muzzle.getWorldPosition(new THREE.Vector3());
  }

  canShoot() { return this.alive && this.reloadLeft <= 0; }

  takeDamage(amount) {
    if (!this.alive) return false;
    this.hp -= amount;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; return true; }
    return false;
  }

  destroy() {
    this.alive = false;
    this.model.group.visible = false;
  }

  dispose() {
    this.battle.scene.remove(this.model.group);
    disposeModel(this.model);
  }
}

// ============================================================
export class Battle {
  constructor({ canvas, profile, tankId, sound, onFinish, headless = false }) {
    this.canvas = canvas;
    this.profile = profile;
    this.tankId = tankId;
    this.sound = sound;
    this.onFinish = onFinish;

    this.state = 'playing';
    this.time = BATTLE_TIME;
    this.actors = [];
    this.player = null;
    this.capProgress = { A: 0, B: 0 };
    this.spotTimer = 0;
    this.damageDealt = 0;
    this.kills = 0;
    this.spots = 0;
    this.hudTimer = 0;
    this.minimapTimer = 0;
    this.camShake = 0;
    this.zoom = 1;
    this.sniper = false;
    this.headless = headless;
    this.isTouch = !headless && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.touchDrive = { active: false, throttle: 0, steer: 0 };
    this.effects = [];
    this.tracerPool = [];

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e1a);
    this.camera = new THREE.PerspectiveCamera(62, (typeof innerWidth === 'number' ? innerWidth : 1280) / (typeof innerHeight === 'number' ? innerHeight : 720), 0.1, 900);
    this.camera.position.set(0, 8, 12);
    if (!headless) this.initRenderer();
    this.initScene();
    this.spawnTeams();
    this.bindInput();
    this.buildHUD();
    this.setShell(0, false);
  }

  // ---------------- Рендер и сцена ----------------
  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.isTouch ? 1.5 : 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = !this.isTouch;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.onResize = () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    };
    if (typeof addEventListener === 'function') addEventListener('resize', this.onResize);
  }

  initScene() {
    const city = buildCity(this.scene, { fogNear: 90, fogFar: 300, brightness: 1.15, fogColor: 0x0e1420 });
    this.mapColliders = city.colliders;
    this.mapMeshes = [];
    city.group.traverse(o => { if (o.isMesh && o.userData.building) this.mapMeshes.push(o); });

    // Зона захвата
    this.capPoint = new THREE.Vector3(0, 0, 0);
    const capRing = new THREE.Mesh(
      new THREE.RingGeometry(CAP_RADIUS - 0.6, CAP_RADIUS, 48),
      new THREE.MeshBasicMaterial({ color: 0x5aa9e6, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    capRing.rotation.x = -Math.PI / 2;
    capRing.position.set(0, 0.06, 0);
    this.scene.add(capRing);
    this.capRing = capRing;
    const capDisc = new THREE.Mesh(
      new THREE.CircleGeometry(CAP_RADIUS - 0.6, 40),
      new THREE.MeshBasicMaterial({ color: 0x5aa9e6, transparent: true, opacity: 0.07, side: THREE.DoubleSide })
    );
    capDisc.rotation.x = -Math.PI / 2;
    capDisc.position.set(0, 0.05, 0);
    this.scene.add(capDisc);

    // Кусты-укрытия (просто визуал, маскировка учитывается статами)
    const bushGeo = new THREE.IcosahedronGeometry(1.6, 0);
    const bushMat = new THREE.MeshStandardMaterial({ color: 0x22432c, roughness: 1 });
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 95;
      const b = new THREE.Mesh(bushGeo, bushMat);
      b.position.set(Math.cos(a) * r, 1.0, Math.sin(a) * r);
      b.scale.set(1, 0.7 + Math.random() * 0.5, 1);
      b.castShadow = true;
      this.scene.add(b);
    }
  }

  spawnTeams() {
    // Игрок + 6 союзников против 7
    const playerTank = getTank(this.tankId);
    const allyTanks = pickBots(playerTank.tier, TEAM_SIZE - 1);
    const enemyTanks = pickBots(playerTank.tier, TEAM_SIZE);

    const mk = (tankDef, team, isPlayer, name, index, total) => {
      const side = team === 'A' ? 1 : -1;
      const spread = (index - (total - 1) / 2) * 13;
      const spawn = isPlayer ? [spread * 0.4, 0, 96] : [spread, 0, 96 * side];
      const actor = new Actor(this, { tankDef, team, isPlayer, name, spawn });
      actor.updateRig();
      this.actors.push(actor);
      return actor;
    };

    this.player = mk(playerTank, 'A', true, this.profile.name || 'Вы', 0, TEAM_SIZE);
    allyTanks.forEach((t, i) => mk(t, 'A', false, BOT_NAMES[i % BOT_NAMES.length], i + 1, TEAM_SIZE));
    enemyTanks.forEach((t, i) => mk(t, 'B', false, BOT_NAMES[(i + 5) % BOT_NAMES.length], i, TEAM_SIZE));

    this.allies = this.actors.filter(a => a.team === 'A');
    this.enemies = this.actors.filter(a => a.team === 'B');

    // Камера стартует за игроком
    this.camAngle = this.player.heading;
    this.camera.position.copy(this.player.position).add(new THREE.Vector3(0, 7, 16));
  }

  // ---------------- Ввод ----------------
  bindInput() {
    this.keys = {};
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false };
    this.aimPoint = new THREE.Vector3(0, 0, 0);

    this.onKeyDown = (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Digit1') this.setShell(0);
      if (e.code === 'Digit2') this.setShell(1);
      if (e.code === 'Digit3') this.setShell(2);
      if (e.code === 'Escape') this.pause();
    };
    this.onKeyUp = (e) => { this.keys[e.code] = false; };
    this.onMouseMove = (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; };
    this.onMouseDown = (e) => {
      if (e.button === 0) this.mouse.down = true;
      if (e.button === 2) this.sniper = !this.sniper;
    };
    this.onMouseUp = (e) => { if (e.button === 0) this.mouse.down = false; };
    this.onContext = (e) => e.preventDefault();
    this.onWheel = (e) => {
      if (this.sniper) this.zoom = Math.max(0.6, Math.min(2.4, this.zoom + Math.sign(e.deltaY) * 0.15));
    };

    if (this.isTouch) this.bindTouch();

    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    addEventListener('mousemove', this.onMouseMove);
    addEventListener('mousedown', this.onMouseDown);
    addEventListener('mouseup', this.onMouseUp);
    if (this.canvas) {
      this.canvas.addEventListener('contextmenu', this.onContext);
      this.canvas.addEventListener('wheel', this.onWheel, { passive: true });
    }
  }

  bindTouch() {
    const joy = $('battle-joystick');
    const knob = $('battle-joystick-knob');
    const fire = $('battle-fire');
    if (!joy || !fire) return;
    const setKnob = (dx, dy) => { knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; };

    this.onJoyStart = (e) => { this.touchDrive.active = true; e.preventDefault(); };
    this.onJoyMove = (e) => {
      if (!this.touchDrive.active) return;
      const t = e.touches[0];
      const r = joy.getBoundingClientRect();
      let dx = t.clientX - (r.left + r.width / 2);
      let dy = t.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy), max = 46;
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      this.touchDrive.throttle = -dy / max;
      this.touchDrive.steer = dx / max;
      setKnob(dx, dy);
      e.preventDefault();
    };
    this.onJoyEnd = () => {
      this.touchDrive = { active: false, throttle: 0, steer: 0 };
      setKnob(0, 0);
    };
    this.onFireDown = (e) => { this.mouse.down = true; e.preventDefault(); };
    this.onFireUp = () => { this.mouse.down = false; };
    // прицел по тапу на экране
    this.onTouchAim = (e) => {
      const t = e.touches[0];
      if (!t) return;
      this.mouse.x = t.clientX;
      this.mouse.y = t.clientY;
    };

    joy.addEventListener('touchstart', this.onJoyStart, { passive: false });
    addEventListener('touchmove', this.onJoyMove, { passive: false });
    addEventListener('touchend', this.onJoyEnd);
    addEventListener('touchcancel', this.onJoyEnd);
    fire.addEventListener('touchstart', this.onFireDown, { passive: false });
    fire.addEventListener('touchend', this.onFireUp);
    addEventListener('touchmove', this.onTouchAim, { passive: true });
    show($('touch-controls'), true);
  }

  unbindInput() {
    removeEventListener('keydown', this.onKeyDown);
    removeEventListener('keyup', this.onKeyUp);
    removeEventListener('mousemove', this.onMouseMove);
    removeEventListener('mousedown', this.onMouseDown);
    removeEventListener('mouseup', this.onMouseUp);
    removeEventListener('resize', this.onResize);
    if (this.canvas) {
      this.canvas.removeEventListener('contextmenu', this.onContext);
      this.canvas.removeEventListener('wheel', this.onWheel);
    }
  }

  // ---------------- HUD ----------------
  buildHUD() {
    const mkRoster = (host, list, own) => {
      host.innerHTML = list.map(a =>
        `<div class="team-member ${a.isPlayer ? 'player' : ''}" title="${escapeHtml(a.name)} · ${escapeHtml(a.tank.name)}">${roman(a.tank.tier)}</div>`
      ).join('');
    };
    mkRoster($('hud-team-a'), this.allies, true);
    mkRoster($('hud-team-b'), this.enemies, false);
    $('kill-feed').innerHTML = '';
    $('hit-text').classList.add('hidden');
    $('hud-hp-text').textContent = `${this.player.maxHp} / ${this.player.maxHp}`;
    $('hud-hp').style.width = '100%';
    $('btn-battle-menu').onclick = () => this.pause();
    this.renderShellList();
    this.renderMinimap();
  }

  renderShellList() {
    const shells = this.player.tank.shells;
    $('shell-list').innerHTML = shells.map((s, i) => {
      const meta = SHELL_META[s.type];
      return `<div class="shell-slot ${i === this.player.shellIndex ? 'active' : ''}" data-shell="${i}">
        <b>${meta.label}</b><small>${s.pen} мм</small><small>${s.damage} ур.</small></div>`;
    }).join('');
    $('shell-list').querySelectorAll('[data-shell]').forEach(el => {
      el.onclick = () => this.setShell(Number(el.dataset.shell));
    });
  }

  setShell(i, forceReload = true) {
    if (!this.player) return;
    const shells = this.player.tank.shells;
    if (!shells[i]) return;
    this.player.shellIndex = i;
    this.player.shell = shells[i];
    if (forceReload) this.player.reloadLeft = Math.max(this.player.reloadLeft, this.player.tank.gun.reload);
    document.querySelectorAll('.shell-slot').forEach(el =>
      el.classList.toggle('active', Number(el.dataset.shell) === i));
  }

  // ---------------- Бой ----------------
  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    show($('screen-pause'), true);
  }
  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    show($('screen-pause'), false);
  }

  update(dt) {
    if (this.state !== 'playing') return;
    this.time -= dt;

    this.updatePlayer(dt);
    for (const a of this.actors) if (!a.isPlayer) this.updateBot(a, dt);
    this.updateActors(dt);
    this.updateSpotting(dt);
    this.updateCapture(dt);
    this.updateEffects(dt);
    this.updateCamera(dt);
    this.updateHUD(dt);
    if (this.renderer) this.renderer.render(this.scene, this.camera);

    // Условия окончания
    const aliveA = this.allies.filter(a => a.alive).length;
    const aliveB = this.enemies.filter(a => a.alive).length;
    if (aliveB === 0) return this.finish(true, 'all');
    if (aliveA === 0) return this.finish(false, 'all');
    if (this.capProgress.A >= 100) return this.finish(true, 'cap');
    if (this.capProgress.B >= 100) return this.finish(false, 'cap');
    if (this.time <= 0) {
      this.time = 0;
      if (aliveA > aliveB) return this.finish(true, 'time');
      if (aliveA < aliveB) return this.finish(false, 'time');
      return this.finish(null, 'draw');
    }
  }

  updatePlayer(dt) {
    const p = this.player;
    if (!p.alive) return;

    // Прицеливание мышью по земле
    const ndc = new THREE.Vector2((this.mouse.x / innerWidth) * 2 - 1, -(this.mouse.y / innerHeight) * 2 + 1);
    this.raycaster = this.raycaster || new THREE.Raycaster();
    this.groundPlane = this.groundPlane || new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, hit)) {
      hit.y = 0.9;
      this.aimPoint.copy(hit);
    }
    const turretDiff = p.aimAtPoint(this.aimPoint, dt);

    // Движение
    let throttle = 0, steer = 0;
    if (this.keys.KeyW) throttle += 1;
    if (this.keys.KeyS) throttle -= 1;
    if (this.keys.KeyA) steer += 1;
    if (this.keys.KeyD) steer -= 1;
    if (this.touchDrive.active) { throttle = this.touchDrive.throttle; steer = this.touchDrive.steer; }
    const boost = (this.keys.ShiftLeft || this.keys.ShiftRight) ? 1.25 : 1;
    const baseSpeed = p.tank.speed;
    if (boost > 1) p.tank.speed = baseSpeed * boost;
    p.move(throttle, steer, dt);
    p.tank.speed = baseSpeed;
    p.updateRig();

    // Разброс
    p.bloom = Math.min(1, p.bloom + dt * (Math.abs(p.speed) > 1 ? 0.75 : -1 / Math.max(0.4, p.tank.gun.aimTime)));
    p.bloom = Math.max(0, p.bloom);

    // Огонь
    if (this.mouse.down && p.canShoot() && turretDiff < 0.9 * DEG * 8) {
      this.fire(p.shell);
    }

    // Подсветка прицела
    const dispRadius = p.tank.gun.dispersion + p.bloom * 0.28;
    const px = Math.tan(Math.atan(dispRadius / 100)) / Math.tan((this.camera.fov * DEG) / 2) * (innerHeight / 2);
    const el = $('dispersion');
    if (el) {
      const size = Math.max(26, Math.min(260, px * 2));
      el.style.width = size + 'px';
      el.style.height = size + 'px';
      el.style.left = '0px';   // центр — сам прицел, он уже под курсором
      el.style.top = '0px';
    }
    const ch = $('crosshair');
    if (ch) { ch.style.left = this.mouse.x + 'px'; ch.style.top = this.mouse.y + 'px'; }
  }

  updateActors(dt) {
    for (const a of this.actors) {
      if (!a.alive) continue;
      if (a.reloadLeft > 0) a.reloadLeft -= dt;
      if (a.immobilized > 0) a.immobilized -= dt;
    }
  }

  // ---------- Боты ----------
  updateBot(bot, dt) {
    if (!bot.alive) return;
    const ai = bot.ai;
    ai.retarget -= dt;
    if (ai.retarget <= 0) {
      ai.retarget = 1.2 + Math.random() * 0.8;
      const foes = bot.team === 'A' ? this.enemies : this.allies;
      let best = null, bestScore = Infinity;
      for (const f of foes) {
        if (!f.alive) continue;
        if (f.spottedTimer <= 0) continue;
        const d = bot.position.distanceTo(f.position);
        if (d > 190) continue;
        if (this.losBlocked(bot.position, f.position)) continue;
        const score = d * (f.tank.class === 'TD' ? 0.8 : 1);
        if (score < bestScore) { bestScore = score; best = f; }
      }
      ai.target = best;
    }

    const target = ai.target && ai.target.alive ? ai.target : null;
    let desiredPoint;

    if (target) {
      const d = bot.position.distanceTo(target.position);
      const ideal = { HT: 45, MT: 75, LT: 95, TD: 130 }[bot.tank.class] || 80;
      desiredPoint = target.position.clone();
      const dir = bot.position.clone().sub(target.position).setY(0).normalize();
      desiredPoint.addScaledVector(dir, ideal);
      bot.aimAtPoint(target.position.clone().setY(1.2), dt);
      // огонь при готовности
      if (bot.canShoot() && d < 260) {
        const turretErr = bot.aimAtPoint(target.position.clone().setY(1.2), 0);
        if (turretErr < 2.2 * DEG * 6) this.fire(bot.shell, bot);
      }
    } else {
      const cap = this.capPoint;
      const allyNear = (bot.team === 'A' ? this.allies : this.enemies).filter(a => a.alive);
      const idx = allyNear.indexOf(bot);
      const angle = (idx / Math.max(1, allyNear.length)) * Math.PI * 2;
      desiredPoint = new THREE.Vector3(cap.x + Math.cos(angle) * 22, 0, cap.z + Math.sin(angle) * 22);
      bot.aimAtPoint(desiredPoint.clone().setY(1), dt);
    }

    // Движение к точке
    const to = desiredPoint.clone().sub(bot.position).setY(0);
    const dist = to.length();
    if (dist > 6) {
      const desiredHeading = Math.atan2(-to.x, -to.z);
      let diff = desiredHeading - bot.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      let steer = Math.max(-1, Math.min(1, diff * 1.8));
      let throttle = Math.abs(diff) > 1.4 ? 0.35 : 1;

      // объезд препятствий
      const ahead = bot.position.clone().addScaledVector(bot.forward, 8);
      for (const c of this.mapColliders) {
        if (ahead.x > c.minX - 2 && ahead.x < c.maxX + 2 && ahead.z > c.minZ - 2 && ahead.z < c.maxZ + 2) {
          steer = bot.position.x < (c.minX + c.maxX) / 2 ? -1 : 1;
          throttle = 0.85;
          break;
        }
      }
      bot.move(throttle, steer, dt);
    } else {
      bot.move(0, 0, dt);
    }

    // Отталкивание от союзников, чтобы не слипались
    for (const other of this.actors) {
      if (other === bot || !other.alive) continue;
      const delta = bot.position.clone().sub(other.position);
      const d = delta.length();
      const minD = bot.radius + other.radius;
      if (d > 0.001 && d < minD) {
        delta.normalize().multiplyScalar((minD - d) * 0.5);
        bot.position.add(delta);
      }
    }

    bot.updateRig();
    bot.bloom = Math.min(1, bot.bloom + dt * (Math.abs(bot.speed) > 1 ? 0.9 : -1));
    bot.bloom = Math.max(0, bot.bloom);
  }

  // ---------- Засвет ----------
  updateSpotting(dt) {
    this.spotTimer -= dt;
    for (const a of this.actors) if (a.spottedTimer > 0) a.spottedTimer -= dt;
    if (this.spotTimer > 0) return;
    this.spotTimer = 0.25;

    for (const target of this.enemies) {
      if (!target.alive) continue;
      for (const viewer of this.allies) {
        if (!viewer.alive) continue;
        if (this.canSee(viewer, target)) {
          if (target.spottedTimer <= 0 && viewer.isPlayer) this.spots++;
          target.spottedTimer = SPOT_MEMORY;
          break;
        }
      }
    }
    for (const target of this.allies) {
      if (!target.alive) continue;
      for (const viewer of this.enemies) {
        if (!viewer.alive) continue;
        if (this.canSee(viewer, target)) { target.spottedTimer = SPOT_MEMORY; break; }
      }
    }

    // Видимость моделей
    for (const e of this.enemies) {
      const visible = e.alive && (e.spottedTimer > 0 || !this.player.alive);
      e.model.group.visible = visible;
    }
    for (const a of this.allies) a.model.group.visible = a.alive;
  }

  canSee(viewer, target) {
    const d = viewer.position.distanceTo(target.position);
    const camo = target.tank.camo * (Math.abs(target.speed) > 0.5 ? 0.45 : 1);
    const range = viewer.tank.viewRange * SPOT_SCALE * (1 - camo * 0.6);
    if (d > range) return false;
    return !this.losBlocked(viewer.position, target.position);
  }

  losBlocked(from, to) {
    const dx = to.x - from.x, dz = to.z - from.z;
    const dist = Math.hypot(dx, dz);
    const steps = Math.min(48, Math.ceil(dist / 5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = from.x + dx * t, z = from.z + dz * t;
      for (const c of this.mapColliders) {
        if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return true;
      }
    }
    return false;
  }

  // ---------- Захват базы ----------
  updateCapture(dt) {
    const inA = this.allies.some(a => a.alive && a.position.distanceTo(this.capPoint) < CAP_RADIUS);
    const inB = this.enemies.some(a => a.alive && a.position.distanceTo(this.capPoint) < CAP_RADIUS);
    const contested = inA && inB;
    if (inA && !inB) this.capProgress.A = Math.min(100, this.capProgress.A + (100 / CAP_TIME) * dt);
    if (inB && !inA) this.capProgress.B = Math.min(100, this.capProgress.B + (100 / CAP_TIME) * dt);
    const active = (inA && !inB) || (inB && !inA);
    const capEl = $('hud-cap');
    if (capEl) {
      capEl.classList.toggle('hidden', !active);
      $('cap-percent').textContent = Math.round(inA ? this.capProgress.A : this.capProgress.B) + '%';
    }
    this.capRing.material.color.set(contested ? 0xffd166 : inA ? 0x5aa9e6 : inB ? 0xd9534f : 0x5aa9e6);
  }

  // ---------- Выстрел с расчётом брони ----------
  fire(shell, shooter = this.player) {
    if (!shooter.alive || shooter.reloadLeft > 0) return;
    shooter.reloadLeft = shooter.tank.gun.reload;

    const origin = shooter.getMuzzleWorld();
    const dir = shooter.gunDirection.clone();
    // разброс
    const disp = shooter.tank.gun.dispersion + shooter.bloom * 0.2;
    const ang = Math.atan(disp / 100);
    dir.applyAxisAngle(new THREE.Vector3(1, 0, 0), (Math.random() - 0.5) * ang * 2);
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * ang * 2);
    dir.normalize();

    const ray = new THREE.Raycaster(origin, dir, 0, 700);
    const targets = [];
    for (const a of this.actors) if (a.alive) targets.push(...a.model.meshes);
    targets.push(...this.mapMeshes);
    const hits = ray.intersectObjects(targets, false);
    const hit = hits.find(h => {
      const a = h.object.userData.actor;
      if (!a) return true;                       // здание
      return a !== shooter && a.team !== shooter.team;  // без огня по своим
    });

    if (shooter.isPlayer) this.sound?.shoot();
    else if (shooter.position.distanceTo(this.player.position) < 150) this.sound?.enemyShoot();

    const endPoint = hit ? hit.point.clone() : origin.clone().addScaledVector(dir, 700);
    this.spawnTracer(origin, endPoint, SHELL_META[shell.type].color);

    if (!hit) return;

    const actor = hit.object.userData.actor;
    if (actor) {
      this.applyArmorHit({ shooter, target: actor, hit, dir, shell });
    } else {
      this.spawnImpact(hit.point, 0x9aa7b4, 6);
      if (shooter.isPlayer) this.sound?.impact();
    }
  }

  applyArmorHit({ shooter, target, hit, dir, shell }) {
    const mesh = hit.object;
    const base = mesh.userData.zoneBase || 'hull';
    let zone = mesh.userData.zone;
    let nWorld = new THREE.Vector3(0, 0, 1);
    if (hit.face) {
      nWorld = hit.face.normal.clone()
        .applyMatrix3(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)).normalize();
      if (!zone) {
        const inv = new THREE.Matrix4().copy(target.model.group.matrixWorld).invert();
        const nLocal = nWorld.clone().transformDirection(inv);
        const side = sideFromNormal(nocalFix(nLocal));
        zone = side === 'top' ? base + 'Top' : zoneKey(base, side);
      }
    }
    const thickness = target.tank.armor[zone] ?? target.tank.armor[base + 'Side'] ?? 30;
    const angle = impactAngle(dir, nWorld);
    const res = resolveHit({
      thickness, angle, shell, caliber: shooter.tank.gun.caliber, random: Math.random,
    });

    const isPlayerHit = target.isPlayer;
    const byPlayer = shooter.isPlayer;

    // Эффект
    this.spawnImpact(hit.point, SHELL_META[shell.type].color, res.result === 'penetrate' ? 10 : 5);

    if (res.damage > 0) {
      const dead = target.takeDamage(res.damage);
      if (byPlayer) this.damageDealt += res.damage;
      if (res.crit) target.immobilized = 4;

      if (isPlayerHit) {
        this.camShake = 0.55;
        this.sound?.hit();
        this.flashDamage();
      } else if (byPlayer) {
        this.sound?.penetration();
      }

      if (dead) {
        this.onKill(shooter, target);
      }
    } else if (res.result === 'ricochet') {
      this.sound?.ricochet();
      if (byPlayer) this.showHitText('РИКОШЕТ', '#b0bec5');
    } else if (res.result === 'noPen') {
      this.sound?.impact();
      if (byPlayer) this.showHitText('НЕ ПРОБИЛ', '#b0bec5');
    }

    if (byPlayer && res.result === 'penetrate') {
      this.showHitText(`ПРОБИЛ  −${res.damage}`, '#ffd166');
      this.hitMarker('pen');
    } else if (byPlayer) {
      this.hitMarker('nopen');
    }
    this.updateRosterDom();
  }

  onKill(shooter, target) {
    target.destroy();
    this.spawnExplosion(target.position.clone().setY(1.2));
    this.sound?.explosion();
    if (shooter.isPlayer) {
      this.kills++;
      this.hitMarker('kill');
      this.showHitText('УНИЧТОЖЕН', '#ff5252');
    }
    this.addKillFeed(shooter, target);
    if (target.isPlayer) {
      toast('Ваш танк уничтожен — наблюдаем за боем', 4000);
      show($('damage-indicator'), false);
    }
    this.updateRosterDom();
  }

  addKillFeed(killer, victim) {
    const host = $('kill-feed');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'kf-item';
    el.innerHTML = `<span class="${killer.team === 'A' ? 'kf-a' : 'kf-b'}">${escapeHtml(killer.name)}</span>
      <span class="muted"> → </span><span class="${victim.team === 'A' ? 'kf-a' : 'kf-b'}">${escapeHtml(victim.name)}</span>`;
    host.appendChild(el);
    setTimeout(() => el.remove(), 6000);
    while (host.children.length > 5) host.firstChild.remove();
  }

  updateRosterDom() {
    const paint = (host, list) => {
      [...host.children].forEach((el, i) => {
        const a = list[i];
        if (!a) return;
        el.classList.toggle('dead', !a.alive);
      });
    };
    const aHost = $('hud-team-a'), bHost = $('hud-team-b');
    if (aHost) paint(aHost, this.allies);
    if (bHost) paint(bHost, this.enemies);
  }

  flashDamage() {
    const el = $('damage-indicator');
    if (!el) return;
    el.classList.remove('hidden');
    el.style.transform = `translate(-50%, -50%) rotate(${Math.random() * 360}deg)`;
    setTimeout(() => el.classList.add('hidden'), 350);
  }

  showHitText(text, color) {
    const el = $('hit-text');
    if (!el) return;
    el.textContent = text;
    el.style.color = color || '#fff';
    el.classList.remove('hidden');
    clearTimeout(this._hitTextTimer);
    this._hitTextTimer = setTimeout(() => el.classList.add('hidden'), 900);
  }

  hitMarker(kind) {
    const el = $('hit-marker');
    if (!el) return;
    el.className = kind;
    clearTimeout(this._markerTimer);
    this._markerTimer = setTimeout(() => el.classList.add('hidden'), 220);
  }

  // ---------- Эффекты ----------
  spawnTracer(from, to, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.effects.push({ mesh: line, life: 0.08, maxLife: 0.08, kind: 'tracer', geo, mat });
  }

  spawnImpact(pos, color, count = 8) {
    const geo = new THREE.SphereGeometry(0.12, 6, 5);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(pos);
      const vel = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.8 + 0.2, (Math.random() - 0.5))
        .normalize().multiplyScalar(6 + Math.random() * 8);
      this.scene.add(m);
      this.effects.push({ mesh: m, vel, life: 0.45, maxLife: 0.45, kind: 'spark', mat });
    }
  }

  spawnExplosion(pos) {
    for (let i = 0; i < 18; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xffd166 : 0xff7b2e, transparent: true, opacity: 1 });
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.5 + Math.random() * 0.6, 7, 6), mat);
      m.position.copy(pos);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.4, (Math.random() - 0.5) * 2).multiplyScalar(5);
      this.scene.add(m);
      this.effects.push({ mesh: m, vel, life: 0.8 + Math.random() * 0.4, maxLife: 1.2, kind: 'fire', mat, grow: 1.8 });
    }
    const light = new THREE.PointLight(0xffa64d, 120, 30, 2);
    light.position.copy(pos);
    this.scene.add(light);
    this.effects.push({ mesh: light, life: 0.25, maxLife: 0.25, kind: 'light' });
  }

  updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= dt;
      if (e.life <= 0) {
        this.scene.remove(e.mesh);
        if (e.geo) e.geo.dispose();
        if (e.mat) e.mat.dispose();
        if (e.kind === 'fire' && e.mesh.geometry) e.mesh.geometry.dispose();
        this.effects.splice(i, 1);
        continue;
      }
      const k = e.life / e.maxLife;
      if (e.kind === 'spark' || e.kind === 'fire') {
        e.mesh.position.addScaledVector(e.vel, dt);
        e.vel.y -= 12 * dt;
        e.mesh.scale.multiplyScalar(1 + (e.grow || 1) * dt);
        if (e.mat) e.mat.opacity = k;
      } else if (e.kind === 'tracer') {
        if (e.mat) e.mat.opacity = k;
      } else if (e.kind === 'light') {
        e.mesh.intensity = 120 * k;
      }
    }
  }

  // ---------- Камера ----------
  updateCamera(dt) {
    const p = this.player.alive ? this.player
      : (this.allies.find(a => a.alive) || this.enemies.find(a => a.alive));
    if (!p) return;
    const pv = p.position;

    if (this.sniper && this.player.alive) {
      this.camera.fov = 26 / this.zoom;
      this.camera.updateProjectionMatrix();
      const muzzle = this.player.getMuzzleWorld();
      this.camera.position.copy(muzzle).add(new THREE.Vector3(0, 1.6, 0)).addScaledVector(this.player.gunDirection, -6);
      this.camera.lookAt(this.aimPoint);
    } else {
      this.camera.fov = 62;
      this.camera.updateProjectionMatrix();
      const back = p.forward.clone().multiplyScalar(-16);
      const target = pv.clone().add(back).add(new THREE.Vector3(0, 9, 0));
      this.camera.position.lerp(target, 1 - Math.pow(0.0009, dt));
      this.camera.lookAt(pv.clone().add(p.forward.clone().multiplyScalar(10)).add(new THREE.Vector3(0, 1.6, 0)));
    }
    if (this.camShake > 0) {
      this.camShake -= dt;
      this.camera.position.x += (Math.random() - 0.5) * this.camShake * 1.2;
      this.camera.position.y += (Math.random() - 0.5) * this.camShake * 1.2;
    }
  }

  // ---------- HUD ----------
  updateHUD(dt) {
    this.hudTimer -= dt;
    if (this.hudTimer > 0) return;
    this.hudTimer = 0.1;
    const p = this.player;
    const hpPct = Math.max(0, p.hp / p.maxHp) * 100;
    $('hud-hp').style.width = hpPct + '%';
    $('hud-hp').classList.toggle('low', hpPct < 30);
    $('hud-hp-text').textContent = `${Math.round(p.hp)} / ${p.maxHp}`;
    $('hud-speed').textContent = Math.abs(Math.round(p.speed * 3.6));
    const reloadPct = 100 - Math.max(0, Math.min(100, (p.reloadLeft / p.tank.gun.reload) * 100));
    $('hud-reload').style.width = reloadPct + '%';
    $('reload-text').textContent = p.reloadLeft > 0 ? `Перезарядка ${p.reloadLeft.toFixed(1)} с` : 'Орудие готово';
    $('hud-timer').textContent = fmtTime(this.time);
    this.minimapTimer -= 0.1;
    if (this.minimapTimer <= 0) { this.minimapTimer = 0.15; this.renderMinimap(); }
  }

  renderMinimap() {
    const c = $('minimap');
    if (!c) return;
    const ctx = c.getContext('2d');
    const S = c.width, k = S / WORLD.size;
    const toX = x => (x + WORLD.half) * k;
    const toZ = z => (z + WORLD.half) * k;

    ctx.fillStyle = '#151d28';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#2b3849';
    for (const col of this.mapColliders) {
      ctx.fillRect(toX(col.minX), toZ(col.minZ), (col.maxX - col.minX) * k, (col.maxZ - col.minZ) * k);
    }
    // База
    ctx.strokeStyle = 'rgba(90,169,230,.9)';
    ctx.beginPath();
    ctx.arc(toX(0), toZ(0), CAP_RADIUS * k, 0, 7);
    ctx.stroke();

    for (const a of this.allies) {
      if (!a.alive) continue;
      ctx.fillStyle = a.isPlayer ? '#ffd166' : '#6ec06e';
      ctx.beginPath();
      ctx.arc(toX(a.position.x), toZ(a.position.z), a.isPlayer ? 4 : 3, 0, 7);
      ctx.fill();
    }
    for (const e of this.enemies) {
      if (!e.alive || e.spottedTimer <= 0) continue;
      ctx.fillStyle = '#d9534f';
      ctx.beginPath();
      ctx.arc(toX(e.position.x), toZ(e.position.z), 3, 0, 7);
      ctx.fill();
    }
    // Направление игрока
    if (this.player.alive) {
      const p = this.player;
      ctx.strokeStyle = '#ffd166';
      ctx.beginPath();
      ctx.moveTo(toX(p.position.x), toZ(p.position.z));
      ctx.lineTo(toX(p.position.x) - Math.sin(p.heading) * 9, toZ(p.position.z) - Math.cos(p.heading) * 9);
      ctx.stroke();
    }
  }

  // ---------- Итоги ----------
  finish(win, reason) {
    if (this.state === 'finished') return;
    this.state = 'finished';
    const survived = this.player.alive;
    const rewards = applyBattleResult(this.profile, {
      tankId: this.tankId, win: win === true, damage: Math.round(this.damageDealt),
      kills: this.kills, spots: this.spots, survived,
    });
    this.onFinish({
      win, reason, survived,
      damage: Math.round(this.damageDealt),
      kills: this.kills,
      spots: this.spots,
      xp: rewards.xp,
      credits: rewards.credits,
      tankName: this.player.tank.name,
    });
  }

  dispose() {
    this.unbindInput();
    for (const a of this.actors) a.dispose();
    for (const e of this.effects) {
      this.scene.remove(e.mesh);
      if (e.geo) e.geo.dispose();
      if (e.mat) e.mat.dispose();
    }
    this.effects = [];
    this.scene.traverse(o => {
      if (o.isMesh && o.geometry) o.geometry.dispose?.();
    });
    this.renderer?.dispose();
    this.renderer?.forceContextLoss?.();
    show($('touch-controls'), false);
  }
}

// страховка от вырожденных нормалей
function nocalFix(v) {
  if (!isFinite(v.x) || !isFinite(v.y) || !isFinite(v.z)) return new THREE.Vector3(0, 0, 1);
  if (v.lengthSq() < 1e-9) return new THREE.Vector3(0, 0, 1);
  return v.normalize();
}
