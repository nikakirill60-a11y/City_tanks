import * as THREE from '../vendor/three.module.js';

// Танк из примитивов: корпус, башня, ствол, гусеницы, колёса.
export class Tank {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.isPlayer = !!opts.isPlayer;
    this.color = opts.color ?? (this.isPlayer ? 0x3a7d44 : 0x8c3b3b);
    this.maxHp = opts.hp ?? 100;
    this.hp = this.maxHp;
    this.speed = opts.speed ?? 14;
    this.turnSpeed = 2.2;
    this.radius = 2.1;
    this.alive = true;
    this.reloadTime = opts.reload ?? 1.1;
    this.reloadTimer = 0;
    this.damage = opts.damage ?? 25;
    this.group = new THREE.Group();
    this.wheels = [];
    this.build();
    scene.add(this.group);
    this.group.position.copy(opts.position ?? new THREE.Vector3());
    this.heading = opts.heading ?? 0;
    this.group.rotation.y = this.heading;
    this.turretAngle = 0; // относительно корпуса
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.35, -4.6);
    this.turret.add(this.muzzle);

    // Полоска здоровья над врагами (спрайт всегда лицом к камере)
    if (!this.isPlayer && typeof document !== 'undefined') {
      this.hpCanvas = document.createElement('canvas');
      this.hpCanvas.width = 64; this.hpCanvas.height = 8;
      this.hpTexture = new THREE.CanvasTexture(this.hpCanvas);
      const mat = new THREE.SpriteMaterial({ map: this.hpTexture, depthTest: false, transparent: true });
      this.hpSprite = new THREE.Sprite(mat);
      this.hpSprite.scale.set(4.2, 0.52, 1);
      this.hpSprite.position.set(0, 4.2, 0);
      this.hpSprite.renderOrder = 10;
      this.group.add(this.hpSprite);
      this.drawHealthBar();
    }
  }

  drawHealthBar() {
    if (!this.hpCanvas) return;
    const c = this.hpCanvas.getContext('2d');
    const pct = Math.max(0, this.hp / this.maxHp);
    c.clearRect(0, 0, 64, 8);
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, 0, 64, 8);
    c.fillStyle = pct > 0.55 ? '#37d67a' : pct > 0.25 ? '#ffb347' : '#ff4757';
    c.fillRect(1, 1, 62 * pct, 6);
    this.hpTexture.needsUpdate = true;
  }

  build() {
    const hullMat = new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.6, metalness: 0.3 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    const accentMat = new THREE.MeshStandardMaterial({ color: this.isPlayer ? 0xffd166 : 0xff4757, emissive: this.isPlayer ? 0x664400 : 0x550000, roughness: 0.4 });

    // Корпус
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 5.2), hullMat);
    hull.position.y = 1.0; hull.castShadow = true; this.group.add(hull);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.8, 1.0), hullMat);
    nose.position.set(0, 0.9, -2.9); nose.rotation.x = 0.35; nose.castShadow = true; this.group.add(nose);

    // Гусеницы + колёса
    for (const side of [-1, 1]) {
      const track = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 5.6), darkMat);
      track.position.set(side * 1.85, 0.55, 0); track.castShadow = true; this.group.add(track);
      for (let i = 0; i < 5; i++) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.5, metalness: 0.6 }));
        w.rotation.z = Math.PI / 2;
        w.position.set(side * 1.85, 0.42, -2.1 + i * 1.05);
        this.group.add(w); this.wheels.push(w);
      }
    }

    // Башня
    this.turret = new THREE.Group();
    this.turret.position.set(0, 1.55, 0.3);
    const turretMesh = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 2.6), hullMat);
    turretMesh.castShadow = true; this.turret.add(turretMesh);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 12), hullMat);
    dome.scale.y = 0.55; dome.position.y = 0.45; this.turret.add(dome);
    // Ствол
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 3.6, 12), darkMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.15, -2.6); barrel.castShadow = true; this.turret.add(barrel);
    const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.7, 12), darkMat);
    muzzleBrake.rotation.x = Math.PI / 2; muzzleBrake.position.set(0, 0.15, -4.3); this.turret.add(muzzleBrake);
    // Фонарь / маркер
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.1), accentMat);
    light.position.set(0, 0.5, -1.32); this.turret.add(light);
    this.group.add(this.turret);
  }

  get position() { return this.group.position; }
  forwardVec() { return new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading)); }

  // Движение: throttle -1..1, steer -1..1
  move(throttle, steer, dt, colliders) {
    if (!this.alive) return;
    const boost = throttle !== 0 ? 1 : 1;
    this.heading += steer * this.turnSpeed * dt * (throttle < 0 ? -1 : 1);
    const v = this.forwardVec().multiplyScalar(throttle * this.speed * boost * dt);
    const next = this.position.clone().add(v);
    // Коллизия с зданиями (круг vs AABB) + границы карты
    for (const c of colliders) {
      const cx = Math.max(c.minX, Math.min(next.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(next.z, c.maxZ));
      const dx = next.x - cx, dz = next.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < this.radius * this.radius) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          next.x = cx + (dx / d) * this.radius;
          next.z = cz + (dz / d) * this.radius;
        } else {
          next.x += v.x * -1; next.z += v.z * -1;
        }
      }
    }
    const B = 118;
    next.x = Math.max(-B, Math.min(B, next.x));
    next.z = Math.max(-B, Math.min(B, next.z));
    this.position.copy(next);
    this.group.rotation.y = this.heading;
    // Вращение колёс
    for (const w of this.wheels) w.rotation.x += throttle * this.speed * dt * 2;
  }

  aimAt(worldPoint) {
    const local = worldPoint.clone().sub(this.position);
    const worldAngle = Math.atan2(-local.x, -local.z);
    let diff = worldAngle - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.turretAngle = diff;
    this.turret.rotation.y = diff;
  }

  getMuzzleWorld() {
    const p = new THREE.Vector3();
    this.muzzle.getWorldPosition(p);
    return p;
  }
  getBarrelDir() {
    // getWorldDirection возвращает +Z объекта, а ствол смотрит в -Z — инвертируем.
    const dir = new THREE.Vector3();
    this.turret.getWorldDirection(dir);
    dir.negate();
    dir.y = 0; dir.normalize();
    return dir;
  }
  canShoot() { return this.alive && this.reloadTimer <= 0; }
  shoot() { this.reloadTimer = this.reloadTime; }
  update(dt) { if (this.reloadTimer > 0) this.reloadTimer -= dt; }
  reloadProgress() { return 1 - Math.max(0, this.reloadTimer) / this.reloadTime; }
  takeDamage(amount) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.drawHealthBar();
    if (this.hp <= 0) { this.hp = 0; this.alive = false; return true; }
    return false;
  }
  dispose() {
    this.scene.remove(this.group);
    if (this.hpTexture) this.hpTexture.dispose();
    if (this.hpSprite) this.hpSprite.material.dispose();
  }
}
