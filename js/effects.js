import * as THREE from '../vendor/three.module.js';

// Снаряды + частицы взрывов/дыма/искр.
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.bullets = [];
    this.particles = [];
    this.bulletGeo = new THREE.SphereGeometry(0.32, 10, 10);
    this.bulletMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
    this.trailMat = new THREE.MeshBasicMaterial({ color: 0xff9f43, transparent: true, opacity: 0.5 });
    this.smokeGeo = new THREE.SphereGeometry(0.5, 8, 8);
    this.fireMat = new THREE.MeshBasicMaterial({ color: 0xff7b2e, transparent: true });
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
    this.flashLight = new THREE.PointLight(0xffb347, 0, 22, 1.6);
    scene.add(this.flashLight);
    this.flashTimer = 0;
  }

  fireBullet(from, dir, owner, speed = 70) {
    const mesh = new THREE.Mesh(this.bulletGeo, this.bulletMat);
    mesh.position.copy(from);
    this.scene.add(mesh);
    const trail = new THREE.Mesh(this.bulletGeo, this.trailMat);
    trail.scale.setScalar(0.6);
    trail.position.copy(from).addScaledVector(dir, -0.8);
    this.scene.add(trail);
    this.bullets.push({ mesh, trail, vel: dir.clone().multiplyScalar(speed), owner, life: 3 });
    // Вспышка выстрела
    this.flashLight.position.copy(from);
    this.flashLight.intensity = 60;
    this.flashTimer = 0.07;
    this.burst(from, 6, 0xffd166, 6, 0.25, 0.3);
  }

  burst(pos, count, color, speed, life, size) {
    for (let i = 0; i < count; i++) {
      const mat = color === 0xff7b2e ? this.fireMat : this.sparkMat;
      const m = new THREE.Mesh(this.smokeGeo, mat);
      m.position.copy(pos);
      m.scale.setScalar(size * (0.6 + Math.random() * 0.8));
      const vel = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.8, (Math.random() - 0.5))
        .normalize().multiplyScalar(speed * (0.4 + Math.random()));
      this.scene.add(m);
      this.particles.push({ mesh: m, vel, life: life * (0.6 + Math.random() * 0.8), maxLife: life, grow: 1.5 });
    }
  }

  explosion(pos) {
    this.burst(pos, 26, 0xff7b2e, 16, 0.9, 1.1);
    this.burst(pos, 18, 0xffe066, 22, 0.5, 0.45);
    this.burst(pos, 10, 0x555555, 7, 1.6, 1.6);
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 120;
    this.flashTimer = 0.18;
  }

  smoke(pos) {
    const m = new THREE.Mesh(this.smokeGeo, new THREE.MeshBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.55 }));
    m.position.copy(pos);
    m.scale.setScalar(0.8);
    this.scene.add(m);
    this.particles.push({ mesh: m, vel: new THREE.Vector3((Math.random() - 0.5) * 2, 2.5, (Math.random() - 0.5) * 2), life: 1.8, maxLife: 1.8, grow: 2.2 });
  }

  clearBullets() {
    for (const b of this.bullets) { this.scene.remove(b.mesh); this.scene.remove(b.trail); }
    this.bullets.length = 0;
  }

  // Полная очистка снарядов и частиц (рестарт)
  clear() {
    this.clearBullets();
    for (const p of this.particles) this.scene.remove(p.mesh);
    this.particles.length = 0;
    this.flashLight.intensity = 0;
    this.flashTimer = 0;
  }

  update(dt, colliders, tanks, onHit) {
    if (this.flashTimer > 0) { this.flashTimer -= dt; if (this.flashTimer <= 0) this.flashLight.intensity = 0; }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.trail.position.copy(b.mesh.position).addScaledVector(b.vel, -0.02);
      let dead = b.life <= 0;
      const p = b.mesh.position;
      // Стена карты
      if (Math.abs(p.x) > 122 || Math.abs(p.z) > 122) dead = true;
      // Здания
      if (!dead) for (const c of colliders) {
        if (p.x > c.minX && p.x < c.maxX && p.z > c.minZ && p.z < c.maxZ) { dead = true; this.burst(p, 8, 0xffe066, 8, 0.4, 0.4); break; }
      }
      // Танки
      if (!dead) for (const t of tanks) {
        if (!t.alive || t === b.owner) continue;
        if (p.distanceTo(t.position) < t.radius + 0.4) {
          dead = true;
          this.burst(p, 10, 0xffe066, 9, 0.4, 0.5);
          onHit(b.owner, t);
          break;
        }
      }
      if (dead) {
        this.scene.remove(b.mesh); this.scene.remove(b.trail);
        this.bullets.splice(i, 1);
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) { this.scene.remove(pt.mesh); this.particles.splice(i, 1); continue; }
      pt.mesh.position.addScaledVector(pt.vel, dt);
      pt.vel.y += 4 * dt; // лёгкий подъём дыма
      pt.mesh.scale.multiplyScalar(1 + pt.grow * dt);
      pt.mesh.material.transparent = true;
      pt.mesh.material.opacity = Math.max(0, pt.life / pt.maxLife);
    }
  }
}
