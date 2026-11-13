import * as THREE from '../vendor/three.module.js';

// Ночной город: дороги, здания с окнами, фонари, деревья, небо.
export const WORLD = { size: 240, half: 120 };

export function buildCity(scene) {
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  // --- Освещение ---
  scene.fog = new THREE.Fog(0x0a0e1a, 70, 230);
  scene.add(new THREE.HemisphereLight(0x8899ff, 0x1a1410, 0.6));
  const moon = new THREE.DirectionalLight(0xaac4ff, 1.0);
  moon.position.set(60, 90, -40);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -130; moon.shadow.camera.right = 130;
  moon.shadow.camera.top = 130; moon.shadow.camera.bottom = -130;
  moon.shadow.bias = -0.0005;
  scene.add(moon);

  // --- Небо: звёзды + луна ---
  const skyGeo = new THREE.BufferGeometry();
  const starPos = [];
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI * 0.45 + 0.08;
    const r = 380;
    starPos.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
  }
  skyGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(skyGeo, new THREE.PointsMaterial({ color: 0xcdd8ff, size: 1.6, sizeAttenuation: false })));
  const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(14, 24, 24), new THREE.MeshBasicMaterial({ color: 0xe8eeff }));
  moonMesh.position.set(180, 190, -260); scene.add(moonMesh);
  const moonGlow = new THREE.Mesh(new THREE.SphereGeometry(20, 24, 24), new THREE.MeshBasicMaterial({ color: 0x8899ff, transparent: true, opacity: 0.18 }));
  moonGlow.position.copy(moonMesh.position); scene.add(moonGlow);

  // --- Земля ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.size, WORLD.size),
    new THREE.MeshStandardMaterial({ color: 0x232a3a, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; group.add(ground);

  // --- Дороги + разметка (разметка одним InstancedMesh) ---
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.95 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
  const step = 40;
  const dashesH = [], dashesV = [];
  for (let i = -WORLD.half; i <= WORLD.half; i += step) {
    const r1 = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.size, 10), roadMat);
    r1.rotation.x = -Math.PI / 2; r1.position.set(0, 0.02, i); r1.receiveShadow = true; group.add(r1);
    const r2 = new THREE.Mesh(new THREE.PlaneGeometry(10, WORLD.size), roadMat);
    r2.rotation.x = -Math.PI / 2; r2.position.set(i, 0.02, 0); r2.receiveShadow = true; group.add(r2);
    for (let j = -WORLD.half + 5; j < WORLD.half; j += 8) {
      dashesH.push([j, i]);
      dashesV.push([i, j]);
    }
  }
  const dashGeoH = new THREE.PlaneGeometry(3, 0.4).rotateX(-Math.PI / 2);
  const dashGeoV = new THREE.PlaneGeometry(0.4, 3).rotateX(-Math.PI / 2);
  const mkInstances = (geo, pts, y) => {
    const inst = new THREE.InstancedMesh(geo, lineMat, pts.length);
    const m = new THREE.Matrix4();
    pts.forEach(([x, z], i) => { m.makeTranslation(x, y, z); inst.setMatrixAt(i, m); });
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  };
  mkInstances(dashGeoH, dashesH, 0.04);
  mkInstances(dashGeoV, dashesV, 0.04);

  // --- Здания ---
  const palette = [0x2b3550, 0x33405e, 0x3d2f4a, 0x2f4a3d, 0x4a3a2f, 0x3a3f55];
  const windowMatLit = new THREE.MeshBasicMaterial({ color: 0xffd98a });
  const windowMatDark = new THREE.MeshBasicMaterial({ color: 0x1c2438 });
  let seed = 42;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  const litMats = [], darkMats = [];
  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpS = new THREE.Vector3(1, 1, 1);
  const pushWindow = (x, y, z, ry) => {
    tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    tmpM.compose(new THREE.Vector3(x, y, z), tmpQ, tmpS);
    (rand() < 0.8 ? litMats : darkMats).push(tmpM.clone());
  };

  const cell = 15;
  for (let gx = -WORLD.half; gx <= WORLD.half - step; gx += step) {
    for (let gz = -WORLD.half; gz <= WORLD.half - step; gz += step) {
      for (let sx = 0; sx < 2; sx++) {
        for (let sz = 0; sz < 2; sz++) {
          const bx = gx + 5 + cell / 2 + sx * cell;
          const bz = gz + 5 + cell / 2 + sz * cell;
          if (Math.abs(bx) < 14 && Math.abs(bz) < 14) continue; // центр — площадь
          if (rand() < 0.28) continue; // пустой участок / двор
          const w = 8 + rand() * 4, d = 8 + rand() * 4;
          const h = 10 + rand() * 36;
          const cx = bx + (rand() - 0.5) * 2, cz = bz + (rand() - 0.5) * 2;
          const color = palette[Math.floor(rand() * palette.length)];
          const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
          b.position.set(cx, h / 2, cz); b.castShadow = true; b.receiveShadow = true; group.add(b);
          const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 1.2, d * 0.6), new THREE.MeshStandardMaterial({ color: 0x14181f }));
          roof.position.set(cx, h + 0.6, cz); group.add(roof);
          // Окна (собираем в инстансы)
          const cols = Math.max(1, Math.floor(w / 3.2)), rows = Math.max(1, Math.floor(h / 3.4));
          for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
            if (rand() < 0.42) continue;
            const wx = cx - w / 2 + 1.7 + c * 3.2, wy = 2.4 + r * 3.4;
            pushWindow(wx, wy, cz + d / 2 + 0.06, 0);
            pushWindow(wx, wy, cz - d / 2 - 0.06, Math.PI);
          }
          colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
        }
      }
    }
  }
  const winGeo = new THREE.PlaneGeometry(1.4, 1.6);
  const addInst = (mat, mats) => {
    if (!mats.length) return;
    const inst = new THREE.InstancedMesh(winGeo, mat, mats.length);
    mats.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  };
  addInst(windowMatLit, litMats);
  addInst(windowMatDark, darkMats);

  // --- Фонари ---
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x333a44, metalness: 0.6, roughness: 0.4 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const poles = [], lamps = [];
  for (let i = -WORLD.half + 10; i < WORLD.half; i += step) {
    for (let j = -WORLD.half + 10; j < WORLD.half; j += step) {
      for (const [ox, oz] of [[-6, -6], [6, 6]]) { poles.push([i + ox, j + oz]); lamps.push([i + ox, j + oz]); }
    }
  }
  const poleInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.18, 5, 6), poleMat, poles.length);
  poles.forEach(([x, z], i) => { tmpM.makeTranslation(x, 2.5, z); poleInst.setMatrixAt(i, tmpM); });
  poleInst.castShadow = false; group.add(poleInst);
  const lampInst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 8, 8), lampMat, lamps.length);
  lamps.forEach(([x, z], i) => { tmpM.makeTranslation(x, 5.1, z); lampInst.setMatrixAt(i, tmpM); });
  group.add(lampInst);
  // Несколько настоящих источников света, чтобы не перегружать сцену
  for (const [x, z] of [[-20, -20], [20, 20], [-20, 20], [20, -20]]) {
    const pl = new THREE.PointLight(0xffd98a, 20, 36, 1.8);
    pl.position.set(x, 6, z); scene.add(pl);
  }

  // --- Деревья ---
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3520 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x1e4d2b, roughness: 1 });
  const trunks = [], crowns = [];
  for (let i = 0; i < 80; i++) {
    const x = (rand() - 0.5) * (WORLD.size - 20), z = (rand() - 0.5) * (WORLD.size - 20);
    if (Math.abs(x) < 8 && Math.abs(z) < 8) continue;
    if (colliders.some(c => x > c.minX - 2 && x < c.maxX + 2 && z > c.minZ - 2 && z < c.maxZ + 2)) continue;
    trunks.push([x, z]); crowns.push([x, z, 1.6 + rand()]);
  }
  const trunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6), trunkMat, trunks.length);
  trunks.forEach(([x, z], i) => { tmpM.makeTranslation(x, 1.2, z); trunkInst.setMatrixAt(i, tmpM); });
  group.add(trunkInst);
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const crownInst = new THREE.InstancedMesh(crownGeo, leafMat, crowns.length);
  crowns.forEach(([x, z, s], i) => {
    tmpQ.identity(); tmpM.compose(new THREE.Vector3(x, 3.6, z), tmpQ, new THREE.Vector3(s, s * 0.85, s));
    crownInst.setMatrixAt(i, tmpM);
  });
  crownInst.castShadow = true; group.add(crownInst);

  // --- Периметр ---
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2b3550, roughness: 0.9 });
  for (const [x, z, w, d] of [[0, -WORLD.half - 2, WORLD.size + 8, 4], [0, WORLD.half + 2, WORLD.size + 8, 4], [-WORLD.half - 2, 0, 4, WORLD.size + 8], [WORLD.half + 2, 0, 4, WORLD.size + 8]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 6, d), wallMat);
    wall.position.set(x, 3, z); wall.castShadow = true; group.add(wall);
  }

  return { colliders, group };
}
