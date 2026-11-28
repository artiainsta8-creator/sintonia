// Sintonia: player de músicas e sons do VoxForge (faixas de sons-para-dormir/faixas.json).
// Climas (Dormir, Relaxar, Foco...), download offline (Cache API + service worker), timer,
// fila, misturar, repetir e controles na tela de bloqueio (Media Session).
'use strict';

const $ = (id) => document.getElementById(id);
const audio = $('audio');
const CACHE = 'dormir-audio-v1';
const LS = 'dormir-state-v1';

const ICON = {
  play: '<svg viewBox="0 0 24 24" class="f"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" class="f"><rect x="6" y="5" width="4.2" height="14" rx="1.5"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.5"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg>',
  done: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
};

const MOODS = [
  { id: 'all', label: 'Tudo', c: '#ff8a3d', icon: '<path d="M4 6h16M4 12h16M4 18h16"/>' },
  { id: 'Desacelerar', label: 'Desacelerar', c: '#c084fc', playlist: true, timer: 45, icon: '<path d="M4 5h16M6 10h12M8 15h8M10 20h4"/>' },
  { id: 'Gospel', label: 'Gospel', c: '#fcd34d', playlist: true, timer: 45, icon: '<path d="M12 3v18M7 8h10"/>' },
  { id: 'Dormir', label: 'Dormir', c: '#a78bfa', icon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>' },
  { id: 'Relaxar', label: 'Relaxar', c: '#5eead4', icon: '<path d="M12 21c-4-3-7-6-7-10a7 7 0 0 1 14 0c0 4-3 7-7 10Z"/><path d="M12 21V11"/>' },
  { id: 'Foco', label: 'Foco', c: '#fbbf24', icon: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>' },
  { id: 'Clássicos', label: 'Clássicos', c: '#f472b6', icon: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>' },
  { id: 'Natureza', label: 'Natureza', c: '#4ade80', icon: '<path d="M7 18a4 4 0 0 1-.6-7.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9Z"/><path d="M9 21l1-2M14 21l1-2"/>' },
  { id: 'Binaural', label: 'Binaural', c: '#60a5fa', icon: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>' },
  { id: 'fav', label: 'Favoritas', c: '#fb7185', icon: '<path d="M12 20s-7.5-4.6-9.2-9.3C1.6 7.3 3.8 4 7.2 4c2 0 3.6 1.1 4.8 2.8C13.2 5.1 14.8 4 16.8 4c3.4 0 5.6 3.3 4.4 6.7C19.5 15.4 12 20 12 20Z"/>' },
  { id: 'off', label: 'Offline', c: '#94a3b8', icon: '<path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14"/>' },
];

let tracks = [];
let state = { queue: [], idx: 0, shuffle: false, repeat: 'off', fav: [], pos: {}, filter: 'all' };
let offline = new Set();
const downloading = new Map(); // id -> progresso 0..1
let timer = { end: 0, mode: null, label: '' };
let baseVolume = 1;

try { Object.assign(state, JSON.parse(localStorage.getItem(LS) || '{}')); } catch { /* sem storage */ }
const save = () => { try { localStorage.setItem(LS, JSON.stringify(state)); } catch { /* ignore */ } };

// ---------------------------------------------------------------- capas geradas
const PAL = {
  brahms: ['#2b1d4f', '#7a4fa3', '#f6e0a8', 'moon'],
  pachelbel: ['#0f2a3f', '#3f7ea6', '#e8f1ff', 'notes'],
  bach: ['#2d1a12', '#9a5b2e', '#ffe2b8', 'organ'],
  arias: ['#3a1230', '#b04e7a', '#ffd9e8', 'notes'],
  quartetos: ['#13261d', '#4f8a6b', '#e6ffef', 'strings'],
  'delta-brahms': ['#0b1030', '#4b3fb0', '#d8d4ff', 'wave'],
  chuva: ['#14202e', '#4b6b8a', '#dbe9f7', 'rain'],
  mar: ['#062a3a', '#1f7a99', '#d6f6ff', 'sea'],
  marrom: ['#24170f', '#7a5534', '#f2dcc6', 'noise'],
  lareira: ['#2a0f06', '#c2541b', '#ffd8a8', 'fire'],
  delta: ['#0d0b26', '#5a3fa0', '#e4dcff', 'wave'],
  g01: ['#2a1f10', '#b38a4a', '#fff1d6', 'moon'],
  g02: ['#0e2433', '#3d7d99', '#e6f7ff', 'sea'],
  g03: ['#231a33', '#8a6bc7', '#fff4d6', 'notes'],
  g04: ['#1d1426', '#6a4a8f', '#ffe9c7', 'moon'],
  g05: ['#1c2414', '#7a9446', '#fffbe0', 'wave'],
  g06: ['#14233a', '#5c7fb8', '#ffffff', 'strings'],
  g07: ['#261a14', '#8a5a3c', '#ffeede', 'organ'],
  g08: ['#0f1024', '#3a3a7a', '#fff6c7', 'moon'],
  g09: ['#1a1a1f', '#5a5a66', '#fff8e6', 'organ'],
  d01: ['#1d2340', '#6b7fd1', '#e8ecff', 'wave'],
  d02: ['#2a2420', '#8a7666', '#f5ebe0', 'notes'],
  d03: ['#141a3a', '#3e4f9e', '#f4ecc4', 'moon'],
  d04: ['#2b1e2e', '#8b5a8f', '#f7e3f8', 'wave'],
  d05: ['#0c2a33', '#2f8295', '#dff7fb', 'sea'],
  d06: ['#26303d', '#7d93ad', '#ffffff', 'rain'],
  d07: ['#2e1d12', '#a86b3c', '#ffe9d1', 'strings'],
  d08: ['#2a1a2a', '#c27a6e', '#ffe4d6', 'sea'],
  d09: ['#152626', '#4f8a84', '#e3fffb', 'wave'],
  d10: ['#0f0f24', '#33336b', '#dcdcff', 'moon'],
  d11: ['#16181c', '#4a5059', '#e6e9ee', 'noise'],
};
const covers = {};

function cover(t, size = 600) {
  const key = t.id + size;
  if (covers[key]) return covers[key];
  const [c1, c2, ink, motif] = PAL[t.id] || ['#1a1a2e', '#4a4a7a', '#ffffff', 'moon'];
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const s = size / 600;
  const gr = g.createLinearGradient(0, 0, size * 0.4, size);
  gr.addColorStop(0, c1); gr.addColorStop(1, c2);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  // estrelas
  let seed = [...t.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  g.fillStyle = ink;
  for (let i = 0; i < 60; i++) {
    g.globalAlpha = 0.25 + rnd() * 0.6;
    g.beginPath(); g.arc(rnd() * size, rnd() * size * 0.6, (0.6 + rnd() * 1.6) * s, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  g.strokeStyle = ink; g.fillStyle = ink; g.lineCap = 'round'; g.lineWidth = 6 * s;
  const cx = size / 2, cy = size * 0.4;
  g.save();
  if (motif === 'moon') {
    g.beginPath(); g.arc(cx, cy, 95 * s, 0, 7); g.fill();
    g.fillStyle = gr; // recorta a lua com o próprio fundo (JPEG não tem transparência)
    g.beginPath(); g.arc(cx + 45 * s, cy - 25 * s, 85 * s, 0, 7); g.fill();
  } else if (motif === 'notes') {
    for (const [x, y] of [[-55, 30], [45, 0]]) {
      g.beginPath(); g.ellipse(cx + x * s, cy + y * s + 50 * s, 26 * s, 19 * s, -0.4, 0, 7); g.fill();
      g.fillRect(cx + x * s + 18 * s, cy + y * s - 70 * s, 8 * s, 122 * s);
    }
    g.beginPath(); g.moveTo(cx - 33 * s, cy - 40 * s); g.lineTo(cx + 67 * s, cy - 70 * s);
    g.lineWidth = 16 * s; g.stroke();
  } else if (motif === 'organ') {
    for (let i = -4; i <= 4; i++) {
      const h = (150 - Math.abs(i) * 22) * s;
      g.fillRect(cx + i * 22 * s - 7 * s, cy + 80 * s - h, 14 * s, h);
    }
  } else if (motif === 'strings') {
    g.lineWidth = 4 * s;
    for (let i = -3; i <= 3; i++) {
      g.beginPath(); g.moveTo(cx + i * 18 * s, cy - 110 * s); g.lineTo(cx + i * 18 * s, cy + 100 * s); g.stroke();
    }
    g.lineWidth = 7 * s;
    g.beginPath(); g.moveTo(cx - 120 * s, cy + 40 * s); g.lineTo(cx + 120 * s, cy - 40 * s); g.stroke();
  } else if (motif === 'wave') {
    for (let k = 0; k < 3; k++) {
      g.globalAlpha = 1 - k * 0.28; g.beginPath();
      for (let x = -150; x <= 150; x += 2) {
        const y = Math.sin(x / 22 + k) * (40 - k * 10) * Math.exp(-((x / 120) ** 2));
        g[x === -150 ? 'moveTo' : 'lineTo'](cx + x * s, cy + y * s + k * 4 * s);
      }
      g.stroke();
    }
  } else if (motif === 'rain') {
    g.lineWidth = 5 * s;
    for (let i = 0; i < 26; i++) {
      const x = rnd() * size, y = rnd() * size * 0.7;
      g.globalAlpha = 0.4 + rnd() * 0.6;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - 10 * s, y + 38 * s); g.stroke();
    }
  } else if (motif === 'sea') {
    for (let k = 0; k < 4; k++) {
      g.globalAlpha = 0.95 - k * 0.2; g.beginPath();
      for (let x = 0; x <= size; x += 4) {
        const y = cy - 30 * s + k * 34 * s + Math.sin(x / (40 * s) + k * 1.3) * 12 * s;
        g[x === 0 ? 'moveTo' : 'lineTo'](x, y);
      }
      g.stroke();
    }
  } else if (motif === 'noise') {
    for (let i = 0; i < 1600; i++) {
      g.globalAlpha = rnd() * 0.5;
      g.fillRect(cx + (rnd() - 0.5) * 260 * s, cy + (rnd() - 0.5) * 220 * s, 3 * s, 3 * s);
    }
  } else if (motif === 'fire') {
    g.beginPath();
    g.moveTo(cx, cy - 120 * s);
    g.bezierCurveTo(cx + 90 * s, cy - 20 * s, cx + 80 * s, cy + 90 * s, cx, cy + 95 * s);
    g.bezierCurveTo(cx - 80 * s, cy + 90 * s, cx - 90 * s, cy - 10 * s, cx - 20 * s, cy - 60 * s);
    g.bezierCurveTo(cx - 15 * s, cy - 20 * s, cx + 5 * s, cy - 30 * s, cx, cy - 120 * s);
    g.fill();
  }
  g.restore();
  // título
  g.globalAlpha = 1; g.fillStyle = ink; g.textAlign = 'center';
  g.font = `600 ${50 * s}px Georgia, "Times New Roman", serif`;
  wrapText(g, t.title, cx, size * 0.74, size * 0.84, 56 * s);
  g.globalAlpha = 0.8;
  g.font = `${22 * s}px system-ui, sans-serif`;
  g.fillText(t.artist.length > 40 ? t.artist.slice(0, 38) + '…' : t.artist, cx, size * 0.92);
  return (covers[key] = cv.toDataURL('image/jpeg', 0.86));
}

function wrapText(g, text, x, y, max, lh) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > max && line) { lines.push(line); line = w; } else line = test;
  }
  lines.push(line);
  const y0 = y - ((lines.length - 1) * lh) / 2;
  lines.slice(0, 3).forEach((l, i) => g.fillText(l, x, y0 + i * lh));
}

// ---------------------------------------------------------------- util
const fmt = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};
const mb = (b) => `${Math.round(b / 1048576)} MB`;
const byId = (id) => tracks.find((t) => t.id === id);
const current = () => byId(state.queue[state.idx]);
let toastT;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), 2600);
}

// ---------------------------------------------------------------- offline (Cache API)
async function refreshOffline() {
  if (!('caches' in window)) return;
  const c = await caches.open(CACHE);
  const keys = await c.keys();
  const paths = new Set(keys.map((r) => new URL(r.url).pathname));
  offline = new Set(tracks.filter((t) => paths.has(new URL(t.url, location.href).pathname)).map((t) => t.id));
}

async function download(t) {
  if (!('caches' in window)) return toast('Este navegador não permite guardar faixas offline.');
  if (downloading.has(t.id) || offline.has(t.id)) return;
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  downloading.set(t.id, 0); render();
  try {
    const res = await fetch(t.url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const total = Number(res.headers.get('Content-Length')) || t.size || 0;
    const reader = res.body.getReader();
    const parts = [];
    let got = 0, last = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value); got += value.length;
      if (total && Date.now() - last > 250) { downloading.set(t.id, got / total); last = Date.now(); paintProgress(t.id); }
    }
    const blob = new Blob(parts, { type: 'audio/mpeg' });
    const c = await caches.open(CACHE);
    await c.put(new URL(t.url, location.href).href, new Response(blob, {
      headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(blob.size) },
    }));
    offline.add(t.id);
    toast(`“${t.title}” disponível offline`);
  } catch (e) {
    toast(`Não deu para baixar “${t.title}”. Verifique a conexão.`);
  } finally {
    downloading.delete(t.id); render(); updateStorage();
  }
}

async function removeDownload(t) {
  const c = await caches.open(CACHE);
  await c.delete(new URL(t.url, location.href).href);
  offline.delete(t.id); render(); updateStorage();
  toast(`“${t.title}” removida dos downloads`);
}

async function downloadAll() {
  const falta = tracks.filter((t) => !offline.has(t.id));
  if (!falta.length) return toast('Todas já estão baixadas');
  const total = falta.reduce((a, t) => a + (t.size || 0), 0);
  if (!confirm(`Baixar ${falta.length} faixas (${mb(total)}) para ouvir sem internet?`)) return;
  for (const t of falta) await download(t);
}

async function updateStorage() {
  const el = $('storageInfo');
  const n = offline.size;
  let txt = n ? `${n} de ${tracks.length} faixas disponíveis offline` : 'Toque em ⬇ numa capa para ouvir sem internet';
  if (navigator.storage && navigator.storage.estimate) {
    try { const e = await navigator.storage.estimate(); if (e.usage) txt += ` · ${mb(e.usage)} usados`; } catch { /* ignore */ }
  }
  el.textContent = txt;
  const all = tracks.length && n === tracks.length;
  $('downloadAllLabel').textContent = all ? 'Tudo offline' : 'Baixar todas';
}

// ---------------------------------------------------------------- biblioteca
function dlIcon(t) {
  if (downloading.has(t.id)) {
    const p = downloading.get(t.id);
    const C = 2 * Math.PI * 9;
    return `<svg class="ring" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,.25)"/><circle cx="12" cy="12" r="9" stroke="#ff8a3d" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p)}" transform="rotate(-90 12 12)" data-ring="${t.id}"/></svg>`;
  }
  return offline.has(t.id) ? ICON.done : ICON.down;
}

function paintProgress(id) {
  const c = document.querySelector(`[data-ring="${CSS.escape(id)}"]`);
  if (c) c.setAttribute('stroke-dashoffset', String(2 * Math.PI * 9 * (1 - downloading.get(id))));
}

function visible(filter = state.filter) {
  if (filter === 'fav') return tracks.filter((t) => state.fav.includes(t.id));
  if (filter === 'off') return tracks.filter((t) => offline.has(t.id));
  if (filter === 'all') return tracks;
  const list = tracks.filter((t) => (t.tags || []).includes(filter));
  const m = MOODS.find((x) => x.id === filter);
  return m && m.playlist ? list.sort((a, b) => (a.ordem || 50) - (b.ordem || 50)) : list;
}

function renderMoods() {
  const box = $('moods');
  box.innerHTML = '';
  for (const m of MOODS) {
    if (!['all', 'fav', 'off'].includes(m.id) && !visible(m.id).length) continue;
    const b = document.createElement('button');
    b.className = 'mood' + (state.filter === m.id ? ' on' : '');
    b.style.setProperty('--mc', m.c);
    b.style.setProperty('--mg', `linear-gradient(140deg, ${m.c}, transparent 75%)`);
    const n = visible(m.id).length;
    b.innerHTML = `<svg viewBox="0 0 24 24">${m.icon}</svg><span><b>${m.label}</b><small>${n} ${n === 1 ? 'faixa' : 'faixas'}</small></span>`;
    b.addEventListener('click', () => { state.filter = m.id; save(); render(); });
    box.appendChild(b);
  }
}

const moodOf = (id) => MOODS.find((x) => x.id === id) || {};

function render() {
  renderMoods();
  const m = moodOf(state.filter);
  $('hint').hidden = !m.playlist;
  if (m.playlist) {
    const mins = Math.round(visible().reduce((a, t) => a + t.duration, 0) / 60);
    $('hint').innerHTML = `<b>Playlist ${esc(m.label)}</b> · ${mins} min, do mais calmo ao quase silêncio.
      Toque em <b>Tocar</b>: a ordem fica fixa e o timer de ${m.timer} min liga sozinho.
      Deixe o volume baixo e use sempre a mesma playlist.`;
  }
  const grid = $('grid');
  const cur = current();
  const vis = visible();
  grid.innerHTML = '';
  if (!vis.length) {
    grid.innerHTML = `<p class="empty">${state.filter === 'fav' ? 'Nenhuma favorita ainda. Toque em ♡ Favoritar no player.' : state.filter === 'off' ? 'Nada baixado ainda. Toque em ⬇ numa capa.' : 'Nenhuma faixa aqui.'}</p>`;
  }
  for (const t of vis) {
    const card = document.createElement('div');
    card.className = 'card' + (cur && cur.id === t.id ? ' playing' : '');
    card.innerHTML = `<div class="cover"><img alt="" loading="lazy" src="${cover(t, 360)}">
        <span class="len">${fmt(t.duration)}</span>
        <button class="dl${offline.has(t.id) ? ' done' : ''}" aria-label="Baixar">${dlIcon(t)}</button>
        <span class="eq"><i></i><i></i><i></i></span></div>
      <span class="t"></span><span class="a"></span>`;
    card.querySelector('.t').textContent = t.title;
    card.querySelector('.a').textContent = t.artist;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.dl')) return;
      if (cur && cur.id === t.id) { openNow(); return; }
      playList(vis.map((x) => x.id), t.id, moodOf(state.filter).playlist ? false : state.shuffle);
      autoTimer();
    });
    card.querySelector('.dl').addEventListener('click', () => {
      if (offline.has(t.id)) { if (confirm(`Remover “${t.title}” das faixas offline?`)) removeDownload(t); } else download(t);
    });
    grid.appendChild(card);
  }
  updateNow();
}

// ---------------------------------------------------------------- reprodução
function playList(ids, startId, shuffle = state.shuffle) {
  let q = [...ids];
  if (shuffle) {
    q = q.filter((id) => id !== startId);
    for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
    if (startId) q.unshift(startId);
  }
  state.queue = q;
  state.idx = Math.max(0, q.indexOf(startId || q[0]));
  load(true);
}

function load(autoplay, resume = false) {
  const t = current();
  if (!t) return;
  audio.src = t.url;
  const pos = resume ? state.pos[t.id] || 0 : 0;
  if (pos > 5) audio.currentTime = pos;
  if (autoplay) audio.play().catch(() => {});
  save(); render(); mediaSession(t);
}

function next(auto = false) {
  if (!state.queue.length) return;
  if (auto && state.repeat === 'one') { audio.currentTime = 0; audio.play(); return; }
  if (state.idx < state.queue.length - 1) state.idx++;
  else if (state.repeat === 'all' || !auto) state.idx = 0;
  else { audio.pause(); return; }
  load(true);
}

function prev() {
  if (audio.currentTime > 4) { audio.currentTime = 0; return; }
  state.idx = state.idx > 0 ? state.idx - 1 : state.queue.length - 1;
  load(true);
}

function toggle() {
  if (!current()) { if (tracks.length) playList(tracks.map((t) => t.id), tracks[0].id); return; }
  if (audio.paused) audio.play().catch(() => toast('Toque de novo para tocar')); else audio.pause();
}

function updateNow() {
  const t = current();
  $('mini').hidden = !t;
  const playing = !audio.paused;
  $('miniPlay').innerHTML = playing ? ICON.pause : ICON.play;
  $('btnPlay').innerHTML = playing ? ICON.pause : ICON.play;
  $('mini').classList.toggle('is-playing', playing);
  $('disc').classList.toggle('is-playing', playing);
  $('grid').classList.toggle('paused', !playing);
  $('btnShuffle').classList.toggle('on', state.shuffle);
  const r = $('btnRepeat');
  r.classList.toggle('on', state.repeat !== 'off');
  r.classList.toggle('repeat-one', state.repeat === 'one');
  if (!t) return;
  if ($('nowArt').dataset.id !== t.id) {
    $('nowArt').src = cover(t); $('nowArt').dataset.id = t.id;
    $('miniArt').src = cover(t, 160);
    $('now').style.setProperty('--tint', (PAL[t.id] || [])[1] || '#4a2a1a');
    $('nowTags').innerHTML = (t.tags || []).map((x) => `<span>${esc(x)}</span>`).join('');
  }
  $('miniTitle').textContent = t.title; $('miniArtist').textContent = t.artist;
  $('nowTitle').textContent = t.title; $('nowArtist').textContent = t.artist;
  $('nowAlbum').textContent = t.album;
  const fav = state.fav.includes(t.id);
  $('nowFav').classList.toggle('on', fav);
  $('favLabel').textContent = fav ? 'Favorita' : 'Favoritar';
  const dl = downloading.has(t.id);
  $('offlineLabel').textContent = offline.has(t.id) ? 'Offline ✓' : dl ? `${Math.round(downloading.get(t.id) * 100)}%` : 'Offline';
  $('btnOffline').classList.toggle('on', offline.has(t.id));
  $('btnSave').href = t.url;
  $('btnSave').setAttribute('download', t.file.split('/').pop());
  $('timerLabel').textContent = timer.mode ? timer.label : 'Timer';
  $('btnTimer').classList.toggle('on', !!timer.mode);
}

let seeking = false;
function progress() {
  const d = audio.duration || (current() && current().duration) || 0;
  const c = audio.currentTime || 0;
  const p = d ? (c / d) * 100 : 0;
  $('miniProg').style.width = p + '%';
  if (!seeking) {
    $('seek').value = String(Math.round(p * 10));
    $('seek').style.setProperty('--p', p + '%');
    $('tCur').textContent = fmt(c);
  }
  $('tDur').textContent = fmt(d);
}

function mediaSession(t) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title, artist: t.artist, album: t.album,
    artwork: [{ src: cover(t, 512), sizes: '512x512', type: 'image/jpeg' }],
  });
}
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  const set = (a, f) => { try { ms.setActionHandler(a, f); } catch { /* sem suporte */ } };
  set('play', () => audio.play());
  set('pause', () => audio.pause());
  set('previoustrack', prev);
  set('nexttrack', () => next());
  set('seekbackward', (d) => (audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset || 15))));
  set('seekforward', (d) => (audio.currentTime = audio.currentTime + (d.seekOffset || 15)));
  set('seekto', (d) => (audio.currentTime = d.seekTime));
}

// ---------------------------------------------------------------- timer de sono
function setTimer(min) {
  audio.volume = baseVolume;
  if (min === 0) timer = { end: 0, mode: null, label: '' };
  else if (min === 'end') timer = { end: 0, mode: 'end', label: 'Fim da faixa' };
  else timer = { end: Date.now() + min * 60000, mode: 'time', label: `${min} min` };
  closeSheet(); updateNow();
  if (timer.mode) toast(timer.mode === 'end' ? 'Para no fim desta faixa' : `O som vai parar em ${min} minutos`);
}
setInterval(() => {
  if (timer.mode !== 'time') return;
  const left = (timer.end - Date.now()) / 1000;
  timer.label = left > 60 ? `${Math.ceil(left / 60)} min` : `${Math.max(0, Math.ceil(left))} s`;
  if (left <= 30 && left > 0) audio.volume = baseVolume * Math.max(0, left / 30); // diminui aos poucos
  if (left <= 0) { audio.pause(); audio.volume = baseVolume; timer = { end: 0, mode: null, label: '' }; }
  updateNow();
}, 1000);

// ---------------------------------------------------------------- folhas
function openSheet(title, html, bind) {
  $('sheetTitle').textContent = title;
  $('sheetBody').innerHTML = html;
  $('sheet').hidden = false;
  bind && bind($('sheetBody'));
}
function closeSheet() { $('sheet').hidden = true; }
$('sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });

$('btnTimer').addEventListener('click', () => {
  const opts = [[15, '15 minutos'], [30, '30 minutos'], [45, '45 minutos'], [60, '1 hora'], [90, '1 h 30 min'], [120, '2 horas'], ['end', 'Fim da faixa']];
  let html = opts.map(([v, l]) => `<button class="opt" data-v="${v}">${l}</button>`).join('');
  if (timer.mode) html += '<button class="opt" data-v="0" style="color:#ff6b6b">Desligar timer</button>';
  openSheet(timer.mode ? `Timer: ${timer.label}` : 'Parar o som depois de…', html, (b) =>
    b.querySelectorAll('.opt').forEach((o) => o.addEventListener('click', () => {
      const v = o.dataset.v; setTimer(v === 'end' ? 'end' : Number(v));
    })));
});

$('nowQueueBtn').addEventListener('click', () => {
  const html = state.queue.map((id, i) => {
    const t = byId(id); if (!t) return '';
    return `<button class="opt${i === state.idx ? ' on' : ''}" data-i="${i}"><img alt="" src="${cover(t, 160)}"><span>${esc(t.title)}<small>${esc(t.artist)} · ${fmt(t.duration)}</small></span></button>`;
  }).join('');
  openSheet('Fila', html, (b) => b.querySelectorAll('.opt').forEach((o) => o.addEventListener('click', () => {
    state.idx = Number(o.dataset.i); load(true); closeSheet();
  })));
});
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------- eventos
$('btnPlay').addEventListener('click', toggle);
$('miniPlay').addEventListener('click', toggle);
$('btnNext').addEventListener('click', () => next());
$('btnPrev').addEventListener('click', prev);
$('btnShuffle').addEventListener('click', () => {
  state.shuffle = !state.shuffle;
  const curId = state.queue[state.idx];
  if (state.shuffle) {
    const rest = state.queue.filter((id) => id !== curId);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    state.queue = curId ? [curId, ...rest] : rest; state.idx = 0;
  } else {
    const order = tracks.map((t) => t.id).filter((id) => state.queue.includes(id));
    state.queue = order; state.idx = Math.max(0, order.indexOf(curId));
  }
  save(); updateNow();
  toast(state.shuffle ? 'Misturar ligado' : 'Misturar desligado');
});
$('btnRepeat').addEventListener('click', () => {
  state.repeat = { off: 'all', all: 'one', one: 'off' }[state.repeat];
  save(); updateNow();
  toast({ off: 'Repetir desligado', all: 'Repetir todas', one: 'Repetir esta faixa' }[state.repeat]);
});
$('nowFav').addEventListener('click', () => {
  const t = current(); if (!t) return;
  const i = state.fav.indexOf(t.id);
  if (i >= 0) state.fav.splice(i, 1); else state.fav.push(t.id);
  save(); render();
  toast(i >= 0 ? 'Removida das favoritas' : 'Adicionada às favoritas ♥');
});
$('btnOffline').addEventListener('click', () => {
  const t = current(); if (!t) return;
  if (offline.has(t.id)) { if (confirm('Remover dos downloads?')) removeDownload(t); } else download(t);
});
$('miniOpen').addEventListener('click', openNow);
$('miniArt').addEventListener('click', openNow);
$('nowClose').addEventListener('click', closeNow);
function openNow() { $('now').hidden = false; history.pushState({ now: 1 }, ''); }
function closeNow() { if (!$('now').hidden) { $('now').hidden = true; if (history.state && history.state.now) history.back(); } }
window.addEventListener('popstate', () => { $('now').hidden = true; closeSheet(); });

// deslizar para baixo fecha o player
let touchY = null;
$('now').addEventListener('touchstart', (e) => { if (!e.target.closest('.seek')) touchY = e.touches[0].clientY; }, { passive: true });
$('now').addEventListener('touchend', (e) => {
  if (touchY !== null && e.changedTouches[0].clientY - touchY > 120) closeNow();
  touchY = null;
});

const seek = $('seek');
seek.addEventListener('input', () => {
  seeking = true;
  const d = audio.duration || current()?.duration || 0;
  seek.style.setProperty('--p', seek.value / 10 + '%');
  $('tCur').textContent = fmt((seek.value / 1000) * d);
});
seek.addEventListener('change', () => {
  const d = audio.duration || 0;
  if (d) audio.currentTime = (seek.value / 1000) * d;
  seeking = false;
});

$('playAll').addEventListener('click', () => {
  const v = visible(); if (!v.length) return;
  const pl = moodOf(state.filter).playlist;
  if (pl) state.shuffle = false; // a ordem da playlist foi pensada para ir desacelerando
  playList(v.map((t) => t.id), state.shuffle ? v[Math.floor(Math.random() * v.length)].id : v[0].id, pl ? false : state.shuffle);
  autoTimer();
  openNow();
});
function autoTimer() {
  const m = moodOf(state.filter);
  if (m.playlist && m.timer && !timer.mode) setTimer(m.timer);
}
$('shuffleAll').addEventListener('click', () => { const v = visible(); if (!v.length) return; state.shuffle = true; playList(v.map((t) => t.id), v[Math.floor(Math.random() * v.length)].id, true); openNow(); });
$('downloadAll').addEventListener('click', downloadAll);

audio.addEventListener('play', updateNow);
audio.addEventListener('pause', () => { updateNow(); savePos(); });
audio.addEventListener('timeupdate', progress);
audio.addEventListener('loadedmetadata', progress);
audio.addEventListener('ended', () => {
  const t = current(); if (t) delete state.pos[t.id];
  if (timer.mode === 'end') { setTimer(0); return; }
  next(true);
});
audio.addEventListener('error', () => {
  if (audio.src) toast(navigator.onLine ? 'Não deu para tocar esta faixa' : 'Sem internet: baixe as faixas para ouvir offline');
});
let lastSave = 0;
function savePos() { const t = current(); if (t && audio.currentTime > 5) { state.pos[t.id] = Math.floor(audio.currentTime); save(); } }
audio.addEventListener('timeupdate', () => { if (Date.now() - lastSave > 10000) { lastSave = Date.now(); savePos(); } });

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); toggle(); }
  if (e.code === 'ArrowRight') audio.currentTime += 15;
  if (e.code === 'ArrowLeft') audio.currentTime -= 15;
});

// ---------------------------------------------------------------- início
async function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  try {
    // Site estático (GitHub Pages): a lista vem de faixas.json ao lado da página.
    // Dentro do VoxForge esse arquivo não existe e a lista vem do servidor (/api/sons).
    let r = await fetch('faixas.json', { cache: 'no-store' }).catch(() => null);
    const estatico = !!(r && r.ok && (r.headers.get('Content-Type') || '').includes('json'));
    if (estatico) document.querySelector('.link')?.remove();
    if (!estatico) r = await fetch('/api/sons', { cache: 'no-store' });
    const json = (r.headers.get('Content-Type') || '').includes('json');
    // 401 do próprio VoxForge (JSON) = falta login. Qualquer outra falha (Codespace desligado) = modo offline.
    if (r.status === 401 && json && !r.redirected) { location.href = '/login'; return; }
    if (!r.ok || !json) throw new Error('offline');
    tracks = await r.json();
    try { localStorage.setItem('dormir-faixas', JSON.stringify(tracks)); } catch { /* ignore */ }
  } catch {
    try { tracks = JSON.parse(localStorage.getItem('dormir-faixas') || '[]'); } catch { tracks = []; }
    if (tracks.length) { window.__offline = true; setTimeout(() => toast('Sem conexão com o VoxForge: mostrando as faixas baixadas'), 600); }
  }
  const total = tracks.reduce((a, t) => a + t.duration, 0);
  $('libSub').textContent = tracks.length ? `${tracks.length} faixas · ${(Math.round(total / 360) / 10).toLocaleString("pt-BR")} horas de música e sons` : 'Nenhuma faixa encontrada';
  const h = new Date().getHours();
  $('greeting').textContent = h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  if (!MOODS.some((m) => m.id === state.filter)) state.filter = 'all';
  state.queue = state.queue.filter((id) => byId(id));
  await refreshOffline();
  if (window.__offline && offline.size) state.filter = 'off';
  render(); updateStorage();
  if (current()) load(false, true); // retoma onde parou, sem tocar sozinho
}
init();
