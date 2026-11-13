// Мелкие утилиты интерфейса
export const $ = (id) => document.getElementById(id);

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmt(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

let toastTimer = null;
export function toast(msg, ms = 2200) {
  const host = $('toast');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast-item';
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), ms);
  clearTimeout(toastTimer);
}

export function show(el, on = true) {
  if (el) el.classList.toggle('hidden', !on);
}

export function roman(n) {
  return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] || n;
}

export function fmtTime(sec) {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.floor(Math.max(0, sec) % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
