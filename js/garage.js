import * as THREE from '../vendor/three.module.js';
import {
  TANKS, NATIONS, CLASSES, TECH_TREE, getTank, tankToProfile,
  registerCustomTank, saveCustomTanks, loadCustomProfiles,
} from './data/tanks.js';
import { createTankModel, disposeModel } from './model.js';
import {
  loadProfile, saveProfile, resetProfile, researchInfo, research, buyInfo, buy,
  ownTanks, selectTank, grantTank,
} from './profile.js';
import { $, fmt, escapeHtml, toast, roman } from './ui.js';

// ============================================================
//  АНГАР: 3D-подиум с танком + дерево прокачки + характеристики
// ============================================================
export class Garage {
  constructor({ onBattle, sound, profile }) {
    this.onBattle = onBattle;
    this.sound = sound;
    this.profile = profile || loadProfile();
    this.nation = 'ussr';
    this.model = null;
    this.angle = 0.5;
    this.zoom = 1;
    this.init3D();
    this.bindUI();
    this.renderAll();
  }

  // ---------- 3D ----------
  init3D() {
    const canvas = $('garage-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    this.camera.position.set(8, 5.5, 9);
    this.camera.lookAt(0, 1.4, 0);

    // Свет: холодный верхний + тёплый контровой, как в ангаре
    this.scene.add(new THREE.HemisphereLight(0x9fc4ff, 0x1a1f26, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(6, 11, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -12; key.shadow.camera.right = 12;
    key.shadow.camera.top = 12; key.shadow.camera.bottom = -12;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffc46b, 1.3);
    rim.position.set(-8, 5, -7);
    this.scene.add(rim);
    const fill = new THREE.PointLight(0x7fb0ff, 12, 26, 2);
    fill.position.set(0, 4, 8);
    this.scene.add(fill);

    // Подиум
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(6.4, 6.8, 0.35, 64),
      new THREE.MeshStandardMaterial({ color: 0x232e3c, roughness: 0.75, metalness: 0.35 })
    );
    platform.position.y = -0.18;
    platform.receiveShadow = true;
    this.scene.add(platform);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(6.42, 6.75, 64),
      new THREE.MeshBasicMaterial({ color: 0xe8b93b, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.005;
    this.scene.add(ring);
    const grid = new THREE.GridHelper(26, 26, 0x2f3d4f, 0x1b2431);
    grid.position.y = -0.34;
    this.scene.add(grid);

    this.tankHolder = new THREE.Group();
    this.scene.add(this.tankHolder);

    // Управление мышью
    const c = $('garage-canvas');
    let dragging = false, lastX = 0;
    c.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; });
    addEventListener('pointerup', () => { dragging = false; });
    addEventListener('pointermove', e => {
      if (!dragging) return;
      this.angle -= (e.clientX - lastX) * 0.01;
      lastX = e.clientX;
      this.autoRotate = false;
      clearTimeout(this._autoTimer);
      this._autoTimer = setTimeout(() => { this.autoRotate = true; }, 3000);
    });
    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoom = Math.max(0.6, Math.min(1.8, this.zoom + Math.sign(e.deltaY) * 0.08));
    }, { passive: false });
    this.autoRotate = true;

    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const wrap = $('garage-viewport');
    if (!wrap) return;
    const w = wrap.clientWidth || 800, h = wrap.clientHeight || 600;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setTank(id) {
    const tank = getTank(id);
    if (!tank) return;
    if (this.model) { this.tankHolder.remove(this.model.group); disposeModel(this.model); }
    const profile = tankToProfile(tank);
    this.model = createTankModel(profile);
    // Модели строятся вокруг нуля; ставим на подиум
    const box = new THREE.Box3().setFromObject(this.model.group);
    this.model.group.position.y -= box.min.y;
    this.model.setTurretAngle(0.35);
    this.model.setGunPitch(0.02);
    this.tankHolder.add(this.model.group);
    $('tank-title').textContent = tank.name;
    $('tank-subtitle').textContent = `${CLASSES[tank.class].name} танк · ${NATIONS[tank.nation].name}`;
    $('tank-tier').textContent = roman(tank.tier);
  }

  update(dt) {
    if (this.autoRotate) this.angle += dt * 0.25;
    const r = 10.5 * this.zoom;
    this.camera.position.set(Math.sin(this.angle) * r, 4.6 * this.zoom + 0.8, Math.cos(this.angle) * r);
    this.camera.lookAt(0, 1.3, 0);
    this.renderer.render(this.scene, this.camera);
  }

  // ---------- UI ----------
  bindUI() {
    $('btn-battle').onclick = () => {
      this.sound?.ensure();
      this.onBattle(this.profile.selected);
    };
    $('btn-models').onclick = () => window.open('models.html', '_blank');
    $('btn-import-model').onclick = () => $('model-input').click();
    $('model-input').onchange = (e) => this.importModel(e);
    $('btn-settings').onclick = () => {
      $('set-sound').checked = !!this.profile.settings.sound;
      $('set-name').value = this.profile.name;
      $('screen-settings').classList.remove('hidden');
    };
    $('btn-close-settings').onclick = () => {
      this.profile.name = ($('set-name').value || 'Командир').slice(0, 16);
      this.profile.settings.sound = $('set-sound').checked;
      this.sound.setEnabled(this.profile.settings.sound);
      saveProfile(this.profile);
      $('player-name').textContent = this.profile.name;
      $('screen-settings').classList.add('hidden');
      this.refreshCurrencies();
    };
    $('btn-reset-profile').onclick = () => {
      if (!confirm('Сбросить весь прогресс? Танки, серебро и опыт будут обнулены.')) return;
      this.profile = resetProfile();
      this.nation = 'ussr';
      this.renderAll();
      toast('Прогресс сброшен');
    };
    $('set-sound').onchange = () => {
      this.profile.settings.sound = $('set-sound').checked;
      this.sound.setEnabled(this.profile.settings.sound);
      saveProfile(this.profile);
    };
  }

  // Вызывается после боя: профиль изменился
  refreshProfile(profile) {
    if (profile) this.profile = profile;
    this.renderAll();
  }

  // Импорт модели из редактора моделей
  importModel(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.parts) || !data.parts.length) throw new Error('в файле нет parts[]');
        const def = registerCustomTank(data);

        // сохраняем список пользовательских танков
        const list = loadCustomProfiles().filter(p => p.id !== def.id);
        list.push(data);
        saveCustomTanks(list);

        grantTank(this.profile, def.id);
        this.renderAll();
        toast(`Модель «${def.name}» добавлена в ангар`);
        this.sound?.click();
      } catch (err) {
        toast('Ошибка импорта: ' + err.message);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  refreshCurrencies() {
    $('currency-credits').textContent = fmt(this.profile.credits);
    $('currency-xp').textContent = fmt(this.profile.freeXp);
    $('player-name').textContent = this.profile.name;
  }

  renderAll() {
    this.refreshCurrencies();
    this.renderNationTabs();
    this.renderTech();
    this.renderStats();
    this.renderCarousel();
    this.setTank(this.profile.selected);
  }

  renderNationTabs() {
    const tabs = Object.entries(TECH_TREE).filter(([, list]) => list.some(id => getTank(id)));
    const labels = { ussr: 'СССР', germany: 'Германия', usa: 'США', td: 'ПТ' };
    $('nation-tabs').innerHTML = tabs.map(([key]) =>
      `<button class="nation-tab ${this.nation === key ? 'active' : ''}" data-nation="${key}">${labels[key] || key}</button>`
    ).join('');
    $('nation-tabs').querySelectorAll('.nation-tab').forEach(btn => {
      btn.onclick = () => { this.nation = btn.dataset.nation; this.renderNationTabs(); this.renderTech(); };
    });
  }

  renderTech() {
    const line = TECH_TREE[this.nation] || [];
    const html = [];
    line.forEach((id, i) => {
      const tank = getTank(id);
      if (!tank) return;
      const st = this.profile.tanks[id];
      const isCurrent = this.profile.selected === id;
      const rInfo = researchInfo(this.profile, id);
      const bInfo = buyInfo(this.profile, id);
      const pred = i > 0 ? getTank(line[i - 1]) : null;

      let actions = '';
      if (st.owned) {
        actions = `<button class="tech-btn gold" data-select="${id}" ${isCurrent ? 'disabled' : ''}>${isCurrent ? 'В ангаре' : 'Выбрать'}</button>`;
      } else if (!st.researched) {
        actions = `<button class="tech-btn ${rInfo.can ? 'gold' : ''}" data-research="${id}" ${rInfo.can ? '' : 'disabled'}>
          Исследовать · ${fmt(tank.cost.xp)} XP</button>`;
      } else {
        actions = `<button class="tech-btn ${bInfo.can ? 'gold' : ''}" data-buy="${id}" ${bInfo.can ? '' : 'disabled'}>
          Купить · ${fmt(tank.cost.credits)}</button>`;
      }
      const note = !st.owned && !st.researched && !rInfo.can && rInfo.reason
        ? `<div class="tech-note">${escapeHtml(rInfo.reason)}</div>` : '';

      html.push(`
        <div class="tech-item ${isCurrent ? 'current' : ''} ${!st.owned && !st.researched ? 'locked' : ''}">
          <div class="tech-row">
            <div class="tech-tier">${roman(tank.tier)}</div>
            <div style="flex:1">
              <div class="tech-name">${escapeHtml(tank.name)}</div>
              <div class="tech-class">${CLASSES[tank.class].icon} ${CLASSES[tank.class].name} · ${tank.hp} HP</div>
            </div>
          </div>
          <div class="tech-actions">${actions}</div>
          ${note}
        </div>`);
      if (pred && i < line.length) html.push('<div class="tech-arrow">▲</div>');
    });
    const list = $('tech-list');
    list.innerHTML = html.join('');
    list.querySelectorAll('[data-select]').forEach(b => b.onclick = () => {
      if (selectTank(this.profile, b.dataset.select)) this.renderAll();
    });
    list.querySelectorAll('[data-research]').forEach(b => b.onclick = () => {
      const res = research(this.profile, b.dataset.research);
      if (!res.ok) return toast(res.reason || 'Нельзя исследовать');
      toast(`Исследован ${res.tank.name}`);
      this.sound?.click();
      this.renderAll();
    });
    list.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
      const res = buy(this.profile, b.dataset.buy);
      if (!res.ok) return toast(res.reason || 'Нельзя купить');
      toast(`${res.tank.name} куплен`);
      this.sound?.click();
      this.renderAll();
    });
  }

  renderStats() {
    const tank = getTank(this.profile.selected);
    if (!tank) return;
    const a = tank.armor;
    const g = tank.gun;
    const shells = tank.shells.map(s => {
      const meta = { AP: 'ББ', APCR: 'БП', HE: 'ОФ' }[s.type] || s.type;
      return `<div class="shell-chip"><b>${meta}</b>${s.pen} мм<br>${s.damage} урон</div>`;
    }).join('');

    $('stats-body').innerHTML = `
      <div class="stat-group">
        <h4>Бронирование, мм</h4>
        <div class="armor-grid">
          <div class="armor-cell">Лоб корпуса<b>${a.hullFront}</b></div>
          <div class="armor-cell">Борт<b>${a.hullSide}</b></div>
          <div class="armor-cell">Корма<b>${a.hullRear}</b></div>
          <div class="armor-cell">Лоб башни<b>${a.turretFront}</b></div>
          <div class="armor-cell">Борт башни<b>${a.turretSide}</b></div>
          <div class="armor-cell">Корма башни<b>${a.turretRear}</b></div>
        </div>
      </div>
      <div class="stat-group">
        <h4>Огневая мощь · ${escapeHtml(g.name)}</h4>
        <div class="stat-row"><span>Урон</span><b>${tank.shells[0].damage}</b></div>
        <div class="stat-row"><span>Пробитие</span><b>${tank.shells[0].pen} мм</b></div>
        <div class="stat-row"><span>Перезарядка</span><b>${g.reload.toFixed(1)} с</b></div>
        <div class="stat-row"><span>Сведение</span><b>${g.aimTime.toFixed(1)} с</b></div>
        <div class="stat-row"><span>Разброс</span><b>${g.dispersion.toFixed(2)}</b></div>
        <div class="shell-row">${shells}</div>
      </div>
      <div class="stat-group">
        <h4>Подвижность и обзор</h4>
        <div class="stat-row"><span>Прочность</span><b>${tank.hp}</b></div>
        <div class="stat-row"><span>Макс. скорость</span><b>${tank.speed} км/ч</b></div>
        <div class="stat-row"><span>Поворот корпуса</span><b>${tank.hullTraverse} °/с</b></div>
        <div class="stat-row"><span>Поворот башни</span><b>${tank.turretTraverse} °/с</b></div>
        <div class="stat-row"><span>Обзор</span><b>${tank.viewRange} м</b></div>
        <div class="stat-row"><span>Маскировка</span><b>${Math.round(tank.camo * 100)}%</b></div>
      </div>`;
  }

  renderCarousel() {
    const owned = ownTanks(this.profile);
    $('carousel').innerHTML = owned.map(t => `
      <button class="car-card ${t.id === this.profile.selected ? 'active' : ''}" data-id="${t.id}">
        <div class="cc-name">${escapeHtml(t.name)}</div>
        <div class="cc-tier">${roman(t.tier)} ур. · ${CLASSES[t.class].name}</div>
        <div class="cc-xp">${fmt(this.profile.tanks[t.id]?.xp || 0)} XP</div>
      </button>`).join('');
    $('carousel').querySelectorAll('.car-card').forEach(card => {
      card.onclick = () => {
        if (selectTank(this.profile, card.dataset.id)) this.renderAll();
      };
    });
    $('btn-battle').disabled = !this.profile.tanks[this.profile.selected]?.owned;
  }
}
