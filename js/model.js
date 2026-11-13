import * as THREE from '../vendor/three.module.js';

// ============================================================
//  Построение танка из JSON-профиля (parts + pivots).
//  Формат общий с редактором models.html
//  Система координат: вперёд = -Z, вверх = +Y.
// ============================================================

const matCache = new Map();
function mat(color, metalness = 0.55, roughness = 0.62) {
  const key = color + '|' + metalness + '|' + roughness;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({
      color: new THREE.Color(color), metalness, roughness,
    }));
  }
  return matCache.get(key);
}

// Клин: коробка со скошенной лобовой частью (для брони под углом)
function wedgeGeometry(w, h, d) {
  const dz = d * 0.34;
  const v = [
    -w / 2, -h / 2, -d / 2,  w / 2, -h / 2, -d / 2,
     w / 2,  h / 2, -d / 2 + dz, -w / 2, h / 2, -d / 2 + dz,
    -w / 2, -h / 2, d / 2,   w / 2, -h / 2, d / 2,
     w / 2,  h / 2, d / 2,  -w / 2, h / 2, d / 2,
  ];
  const idx = [
    0, 1, 2, 0, 2, 3,       // лоб
    4, 6, 5, 4, 7, 6,       // корма
    0, 4, 7, 0, 7, 3,       // левый борт
    1, 2, 6, 1, 6, 5,       // правый борт
    3, 6, 2, 3, 7, 6,       // крыша
    0, 1, 5, 0, 5, 4,       // днище
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function geometryFor(part) {
  const s = part.size;
  switch (part.type) {
    case 'box': return new THREE.BoxGeometry(s[0], s[1], s[2]);
    case 'wedge': return wedgeGeometry(s[0], s[1], s[2]);
    case 'cylinder': return new THREE.CylinderGeometry(s[0], s[1], s[2], s[3] || 10);
    case 'sphere': return new THREE.SphereGeometry(s[0], s[1] || 12, s[1] || 10);
    case 'cone': return new THREE.ConeGeometry(s[0], s[1], s[2] || 10);
    default: return new THREE.BoxGeometry(s[0] || 1, s[1] || 1, s[2] || 1);
  }
}

const DEG = Math.PI / 180;

/**
 * Создаёт модель танка по профилю.
 * @returns {{group, hull, turret, gun, muzzle, wheels, meshes, disposables}}
 */
export function createTankModel(profile) {
  const group = new THREE.Group();
  const hull = new THREE.Group();
  const turret = new THREE.Group();
  const gun = new THREE.Group();
  const wheels = [];
  const meshes = [];
  const disposables = [];

  group.add(hull);

  const pv = profile.pivots || { turret: [0, 1.5, 0], gun: [0, 0.4, -1.2], muzzle: [0, 0, -3] };
  turret.position.fromArray(pv.turret);
  gun.position.fromArray(pv.gun);
  hull.add(turret);
  turret.add(gun);

  const parentFor = (kind) => (kind === 'turret' ? turret : kind === 'gun' ? gun : hull);

  for (const part of profile.parts || []) {
    const geo = geometryFor(part);
    const isWheel = part.kind === 'wheel';
    const material = mat(part.color || '#4d5c3f', part.metalness, part.roughness);
    const mesh = new THREE.Mesh(geo, material);
    mesh.rotation.set((part.rot?.[0] || 0) * DEG, (part.rot?.[1] || 0) * DEG, (part.rot?.[2] || 0) * DEG);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.zoneBase = part.zoneBase || (part.kind === 'turret' || part.kind === 'gun' ? 'turret' : 'hull');
    if (part.zone) mesh.userData.zone = part.zone;
    meshes.push(mesh);
    disposables.push(geo);

    if (isWheel) {
      const pivot = new THREE.Group();
      pivot.position.fromArray(part.pos);
      pivot.add(mesh);
      parentFor('hull').add(pivot);
      wheels.push(pivot);
    } else {
      mesh.position.fromArray(part.pos);
      parentFor(part.kind).add(mesh);
    }
  }

  const muzzle = new THREE.Object3D();
  muzzle.position.fromArray(pv.muzzle || [0, 0, -3]);
  gun.add(muzzle);

  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);

  return {
    group, hull, turret, gun, muzzle, wheels, meshes, disposables,
    size,
    setTurretAngle(rad) { turret.rotation.y = rad; },
    setGunPitch(rad) { gun.rotation.x = rad; },
  };
}

/** Габариты профиля (для камеры и коллизий) без создания мешей. */
export function profileBounds(profile) {
  let minY = Infinity, maxY = -Infinity, halfW = 0, minZ = Infinity, maxZ = -Infinity;
  for (const p of profile.parts || []) {
    const [x, y, z] = p.pos;
    const s = p.size;
    let w = s[0], h = s[1], d = s[2];
    if (p.type === 'cylinder' || p.type === 'cone') { h = s[2] ?? s[1]; }
    minY = Math.min(minY, y - h / 2);
    maxY = Math.max(maxY, y + h / 2);
    halfW = Math.max(halfW, Math.abs(x) + w / 2);
    minZ = Math.min(minZ, z - d / 2);
    maxZ = Math.max(maxZ, z + d / 2);
  }
  return { height: maxY - minY, width: halfW * 2, length: maxZ - minZ, minZ, maxZ };
}

export function disposeModel(model) {
  for (const g of model.disposables) g.dispose();
}
