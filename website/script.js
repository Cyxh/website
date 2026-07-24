/* ============================================================
   REVIN JUN — "SOFT SIGNAL" — interactive engine
   ascii art × gen x soft club
   ============================================================ */

'use strict';

// ------------------------------------------------------------
// helpers
// ------------------------------------------------------------
const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;

// Motion: system preference by default, manual [M] override on top.
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let prefersStill = true; // resolved by applyStillState() below

function computeStill() {
  let override = null;
  try { override = localStorage.getItem('rj-motion'); } catch (e) { /* ignore */ }
  if (override === 'on') return false;
  if (override === 'off') return true;
  return motionQuery.matches;
}

function applyStillState() {
  const wasStill = prefersStill;
  prefersStill = computeStill();
  document.documentElement.classList.toggle('still', prefersStill);
  const mt = $('#motion-toggle');
  if (mt) {
    mt.textContent = prefersStill ? '−' : '∿';
    mt.title = prefersStill ? 'Motion off — click for full motion [M]' : 'Motion on [M]';
  }
  if (wasStill !== prefersStill) {
    document.dispatchEvent(new CustomEvent('motionchange', { detail: !prefersStill }));
  }
}
applyStillState();
motionQuery.addEventListener('change', applyStillState);

function toggleMotion() {
  try { localStorage.setItem('rj-motion', prefersStill ? 'on' : 'off'); } catch (e) { /* ignore */ }
  applyStillState();
  toast(prefersStill ? '((( motion off — calm )))' : '((( motion on )))');
}

const isCoarse = window.matchMedia('(pointer: coarse)').matches;

function safeStore(kind, key, val) {
  try {
    const s = kind === 'session' ? sessionStorage : localStorage;
    if (val === undefined) return s.getItem(key);
    s.setItem(key, val);
  } catch (e) { return null; }
}

// ------------------------------------------------------------
// THEME — night / day (applied immediately, before first paint)
// ------------------------------------------------------------
const themeToggleBtn = $('#theme-toggle');

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'day' ? 'day' : 'night';
}

function applyTheme(theme, persist) {
  document.documentElement.setAttribute('data-theme', theme);
  if (themeToggleBtn) themeToggleBtn.textContent = theme === 'night' ? '☼' : '☾';
  if (persist) safeStore('local', 'rj-theme', theme);
  document.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
}

(function initTheme() {
  const saved = safeStore('local', 'rj-theme');
  if (saved === 'night' || saved === 'day') {
    applyTheme(saved, false);
  } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    applyTheme('day', false);
  } else {
    applyTheme('night', false);
  }
})();

function toggleTheme() {
  applyTheme(currentTheme() === 'night' ? 'day' : 'night', true);
}

if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);
{
  const mt = $('#motion-toggle');
  if (mt) mt.addEventListener('click', toggleMotion);
}
document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k !== 't' && k !== 'm') return;
  const el = document.activeElement;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
  if (k === 't') toggleTheme();
  else toggleMotion();
});

// ------------------------------------------------------------
// API CONFIGURATION (unchanged endpoints)
// ------------------------------------------------------------
const SPOTIFY_PROXY_URL = '/api/spotify';
const GAMING_PROXY_URL = '/api/gaming';
// Keys come from config.js (gitignored — see config.example.js)
const YOUTUBE_API_KEY = (window.SITE_CONFIG && window.SITE_CONFIG.YOUTUBE_API_KEY) || '';
const YOUTUBE_CHANNEL_ID = (window.SITE_CONFIG && window.SITE_CONFIG.YOUTUBE_CHANNEL_ID) || '';

// Champion ID -> name mapping (Data Dragon)
const CHAMPION_NAMES = {};
async function loadChampionData() {
  try {
    const res = await fetch('https://ddragon.leagueoflegends.com/cdn/14.8.1/data/en_US/champion.json');
    const data = await res.json();
    Object.values(data.data).forEach(c => { CHAMPION_NAMES[parseInt(c.key)] = c.id; });
  } catch (e) {
    console.warn('Failed to load champion data:', e);
  }
}
function getChampionImageUrl(championIdOrName) {
  const name = typeof championIdOrName === 'number'
    ? (CHAMPION_NAMES[championIdOrName] || 'Unknown')
    : championIdOrName;
  return `https://ddragon.leagueoflegends.com/cdn/14.8.1/img/champion/${name}.png`;
}

// ------------------------------------------------------------
// TOAST
// ------------------------------------------------------------
const toastEl = $('#toast');
let toastTimer = null;
function toast(msg, ms) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 2200);
}

// ------------------------------------------------------------
// SECTIONS / FREQUENCIES
// ------------------------------------------------------------
const SECTION_NAMES = { hero: 'ON AIR', about: 'ABOUT', academics: 'ACADEMICS', projects: 'PROJECTS', skills: 'SKILLS', fun: 'FUN', contact: 'CONTACT' };
const scenes = $$('.scene');
const sceneFreqs = scenes.map(s => parseFloat(s.dataset.freq || '88.1'));

function fmtFreq(f) {
  return f.toFixed(1).padStart(5, '0');
}

// Continuous position on the dial: index + fraction between scene anchors.
function scrollDialIndex() {
  const cy = window.scrollY + window.innerHeight * 0.42;
  let i = 0;
  for (let k = 0; k < scenes.length; k++) {
    if (scenes[k].offsetTop <= cy) i = k;
  }
  const cur = scenes[i], nxt = scenes[i + 1];
  let f = 0;
  if (cur && nxt) {
    f = clamp((cy - cur.offsetTop) / Math.max(1, nxt.offsetTop - cur.offsetTop), 0, 1);
  }
  return i + f;
}

// ------------------------------------------------------------
// INTRO — tuning in (once per session)
// ------------------------------------------------------------
const intro = $('#intro');
let siteStarted = false;

function initIntro() {
  const seen = safeStore('session', 'rj-intro-seen');
  if (!intro) { startSite(); return; }
  if (seen || prefersStill) {
    intro.classList.add('gone');
    startSite();
    return;
  }

  const freqNum = $('#intro-freq-num');
  const scanEl = $('#intro-scan');
  const statusEl = $('#intro-status');
  const callEl = $('#intro-call');
  const waveEl = $('#intro-wave');
  const starsEl = $('#intro-stars');
  const SCAN_LEN = 28;
  const WAVE_LEN = 26;
  const CALLSIGNS = ['KSFT', 'WAVE', 'KDRM', 'QSSB', 'KHZE', 'WLUV', 'KMST', 'DRFT'];
  const t0 = performance.now();
  const SCAN_MS = 1700;
  let done = false;
  let callTick = 0;

  // a sprinkle of twinkling glyphs behind the tuner
  if (starsEl) {
    for (let i = 0; i < 26; i++) {
      const s = document.createElement('span');
      s.textContent = ['✦', '✧', '·', '·', ':'][i % 5];
      s.style.left = (Math.random() * 96 + 2) + '%';
      s.style.top = (Math.random() * 92 + 4) + '%';
      s.style.fontSize = (9 + Math.random() * 6) + 'px';
      s.style.animationDelay = (Math.random() * 3).toFixed(2) + 's';
      starsEl.appendChild(s);
    }
  }

  function finish() {
    if (done) return;
    done = true;
    safeStore('session', 'rj-intro-seen', '1');
    intro.classList.add('found');
    if (freqNum) freqNum.textContent = '088.1';
    if (scanEl) scanEl.textContent = '▓'.repeat(SCAN_LEN);
    if (callEl) callEl.textContent = '((( soft signal — locked )))';
    if (waveEl) waveEl.textContent = '~ · ~ · ~ · ~ · ~';
    if (statusEl) statusEl.textContent = 'signal found';
    setTimeout(() => {
      intro.classList.add('leaving');
      startSite();
      setTimeout(() => intro.classList.add('gone'), 900);
    }, 800);
  }

  function frame(now) {
    if (done) return;
    const p = clamp((now - t0) / SCAN_MS, 0, 1);
    const tt = now / 1000;
    if (freqNum) freqNum.textContent = fmtFreq(lerp(88.1, 107.9, p));
    if (scanEl) {
      const filled = Math.floor(p * SCAN_LEN);
      let s = '';
      for (let i = 0; i < SCAN_LEN; i++) {
        if (i < filled) s += '▓';
        else if (i === filled) s += ['░', '▒', '▓'][Math.floor(Math.random() * 3)];
        else s += '░';
      }
      scanEl.textContent = s;
    }
    if (waveEl) {
      let w = '';
      for (let i = 0; i < WAVE_LEN; i++) {
        const v = Math.sin(i * 0.55 + tt * 9) + Math.sin(i * 0.23 - tt * 5.2);
        w += ['·', '˜', '~', '≈'][clamp(Math.round((v + 2) / 4 * 3), 0, 3)];
      }
      waveEl.textContent = w;
    }
    if (callEl && (callTick++ % 6 === 0)) {
      const cs = CALLSIGNS[Math.floor(Math.random() * CALLSIGNS.length)];
      callEl.textContent = `≋ ${cs} ${fmtFreq(88.1 + Math.random() * 19.8)} — static`;
    }
    if (p >= 1) { finish(); return; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const skip = () => finish();
  intro.addEventListener('pointerdown', skip, { once: true });
  document.addEventListener('keydown', skip, { once: true });
}

// ------------------------------------------------------------
// ASCII ORB — breathing sphere behind the hero name
// ------------------------------------------------------------
const orbCanvas = $('#orb-canvas');
const orb = {
  ctx: null, w: 0, h: 0, dpr: 1,
  cellW: 11, cellH: 12,
  cols: 0, rows: 0,
  lightX: 0.45, lightY: -0.35, targetLX: 0.45, targetLY: -0.35,
  mouseSeen: 0,
  palette: null, hyperHue: 0,
  visible: true, running: false, lastFrame: 0,
};
const ORB_RAMP = ' .·:-=+*#%@';

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
function mixRgb(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}
function rotateHue(rgb, deg) {
  // quick-and-cheerful hue rotation (only used in hyperdrift)
  const [r, g, b] = rgb;
  const rad = deg * Math.PI / 180;
  const cosA = Math.cos(rad), sinA = Math.sin(rad);
  const m = [
    .213 + cosA * .787 - sinA * .213, .715 - cosA * .715 - sinA * .715, .072 - cosA * .072 + sinA * .928,
    .213 - cosA * .213 + sinA * .143, .715 + cosA * .285 + sinA * .140, .072 - cosA * .072 - sinA * .283,
    .213 - cosA * .213 - sinA * .787, .715 - cosA * .715 + sinA * .715, .072 + cosA * .928 + sinA * .072,
  ];
  return [
    clamp(r * m[0] + g * m[1] + b * m[2], 0, 255),
    clamp(r * m[3] + g * m[4] + b * m[5], 0, 255),
    clamp(r * m[6] + g * m[7] + b * m[8], 0, 255),
  ];
}

function buildOrbPalette(hueOffset = 0) {
  const theme = currentTheme();
  const HUES = 6, LEVELS = 13;
  let stops, hi, lo;
  if (theme === 'night') {
    stops = [hexToRgb('#a78bfa'), hexToRgb('#7dd3fc'), hexToRgb('#f0abfc')];
    hi = hexToRgb('#ffffff');
    lo = hexToRgb('#312c55');
  } else {
    stops = [hexToRgb('#6d59cf'), hexToRgb('#3d7fb8'), hexToRgb('#a855b5')];
    hi = hexToRgb('#181430');
    lo = hexToRgb('#c3bfdd');
  }
  const table = [];
  for (let h = 0; h < HUES; h++) {
    const t = h / (HUES - 1);
    let base = t < 0.5 ? mixRgb(stops[0], stops[1], t * 2) : mixRgb(stops[1], stops[2], (t - 0.5) * 2);
    if (hueOffset) base = rotateHue(base, hueOffset);
    const row = [];
    for (let l = 0; l < LEVELS; l++) {
      const b = l / (LEVELS - 1);
      let c;
      if (b < 0.6) c = mixRgb(lo, base, b / 0.6);
      else c = mixRgb(base, hi, (b - 0.6) / 0.4);
      row.push(`rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`);
    }
    table.push(row);
  }
  return {
    table, HUES, LEVELS,
    star: theme === 'night' ? 'rgba(160,150,210,0.5)' : 'rgba(90,84,140,0.45)',
    halo: theme === 'night' ? 'rgba(167,139,250,0.14)' : 'rgba(127,106,216,0.10)',
  };
}

function orbResize() {
  if (!orbCanvas) return;
  const rect = orbCanvas.getBoundingClientRect();
  if (rect.width < 10) return;
  orb.dpr = Math.min(window.devicePixelRatio || 1, 2);
  orb.w = rect.width;
  orb.h = rect.height;
  orbCanvas.width = Math.round(rect.width * orb.dpr);
  orbCanvas.height = Math.round(rect.height * orb.dpr);
  orb.ctx = orbCanvas.getContext('2d');
  orb.ctx.setTransform(orb.dpr, 0, 0, orb.dpr, 0, 0);
  // scale character cells with canvas size (fewer cells on small screens)
  const target = rect.width < 480 ? 42 : rect.width < 640 ? 54 : 64;
  orb.cellW = Math.max(8, rect.width / target);
  orb.cellH = orb.cellW * 1.12;
  orb.cols = Math.ceil(orb.w / orb.cellW);
  orb.rows = Math.ceil(orb.h / orb.cellH);
  orb.ctx.font = `${Math.round(orb.cellW * 1.15)}px "IBM Plex Mono", monospace`;
  orb.ctx.textBaseline = 'middle';
  orb.ctx.textAlign = 'center';
}

function orbFrame(now) {
  if (!orb.running) return;
  requestAnimationFrame(orbFrame);
  if (prefersStill || !orb.visible || document.hidden || !orb.ctx) return;
  if (now - orb.lastFrame < 33) return; // ~30fps cap
  orb.lastFrame = now;
  drawOrb(now / 1000);
}

let hyperMode = false;
let lastPaletteRefresh = 0;

function drawOrb(t) {
  const { ctx, w, h, cols, rows, cellW, cellH } = orb;
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);

  if (hyperMode && (t * 1000 - lastPaletteRefresh > 180)) {
    orb.hyperHue = (orb.hyperHue + 6) % 360;
    orb.palette = buildOrbPalette(orb.hyperHue);
    lastPaletteRefresh = t * 1000;
  }
  const pal = orb.palette || (orb.palette = buildOrbPalette());

  // idle: light orbits; with a recent mouse, light follows it
  const idle = (performance.now() - orb.mouseSeen) > 2600;
  if (idle) {
    orb.targetLX = Math.cos(t * 0.32) * 0.7;
    orb.targetLY = Math.sin(t * 0.26) * 0.55 - 0.15;
  }
  const easeAmt = prefersStill ? 1 : 0.055;
  orb.lightX += (orb.targetLX - orb.lightX) * easeAmt;
  orb.lightY += (orb.targetLY - orb.lightY) * easeAmt;

  const lz = 0.72;
  const lmag = Math.sqrt(orb.lightX * orb.lightX + orb.lightY * orb.lightY + lz * lz);
  const lx = orb.lightX / lmag, ly = orb.lightY / lmag, lzn = lz / lmag;

  const breathe = prefersStill ? 1 : 1 + Math.sin(t * 0.55) * 0.025;
  const R = Math.min(w, h) * 0.42 * breathe;
  const cx = w / 2, cy = h / 2;
  const noiseAmp = hyperMode ? 0.24 : 0.13;

  // soft halo painted in-canvas (a CSS drop-shadow here would re-blur
  // every frame and stall the compositor). Its radius must die out
  // BEFORE the canvas edge or the square bounds visibly clip the glow.
  const haloR = Math.min(w, h) * 0.485;
  const halo = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, haloR);
  halo.addColorStop(0, pal.halo);
  halo.addColorStop(0.65, pal.halo.replace(/[\d.]+\)$/, '0.05)'));
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);

  let lastFill = null;
  for (let gy = 0; gy < rows; gy++) {
    const py = gy * cellH + cellH / 2;
    const ny = (py - cy) / R;
    for (let gx = 0; gx < cols; gx++) {
      const px = gx * cellW + cellW / 2;
      const nx = (px - cx) / R;
      const d2 = nx * nx + ny * ny;

      if (d2 > 1) {
        // sparse drifting star chars in the void (kept inside the halo
        // radius so nothing pops against the square canvas edge)
        if (d2 < 1.55) {
          const hash = Math.sin(gx * 127.1 + gy * 311.7) * 43758.5453;
          const frac = hash - Math.floor(hash);
          if (frac < 0.012) {
            const tw = prefersStill ? 0.5 : 0.3 + 0.7 * Math.abs(Math.sin(t * 0.7 + frac * 90));
            if (tw > 0.42) {
              if (lastFill !== pal.star) { ctx.fillStyle = pal.star; lastFill = pal.star; }
              ctx.globalAlpha = tw * 0.6;
              ctx.fillText('·', px, py);
              ctx.globalAlpha = 1;
            }
          }
        }
        continue;
      }

      const nz = Math.sqrt(1 - d2);
      const diff = Math.max(0, nx * lx + ny * ly + nz * lzn);
      const spec = Math.pow(diff, 22);
      const noise =
        Math.sin(nx * 4.3 + t * 0.8) *
        Math.sin(ny * 4.7 - t * 0.6) *
        Math.sin((nx + ny + nz) * 3.4 + t * 0.45);

      let b = 0.14 + diff * 0.74 + spec * 0.5 + noise * noiseAmp;
      // rim-light: dim the middle so the hero name stays legible over the orb
      b *= 0.6 + 0.4 * d2;
      b = clamp(b, 0, 1);

      const ci = Math.min(ORB_RAMP.length - 1, Math.floor(b * ORB_RAMP.length));
      if (ci <= 0) continue;
      const ch = ORB_RAMP[ci];

      const hueT = clamp((nx * 0.5 + ny * -0.35 + 0.5), 0, 1);
      const hueI = Math.min(pal.HUES - 1, Math.floor(hueT * pal.HUES));
      const lvlI = Math.min(pal.LEVELS - 1, Math.floor(b * pal.LEVELS));
      const fill = pal.table[hueI][lvlI];
      if (fill !== lastFill) { ctx.fillStyle = fill; lastFill = fill; }
      ctx.fillText(ch, px, py);
    }
  }
}

function initOrb() {
  if (!orbCanvas) return;
  orbResize();
  orb.palette = buildOrbPalette();

  document.addEventListener('themechange', () => {
    orb.palette = buildOrbPalette(orb.hyperHue);
    if (prefersStill) drawOrb(0.001);
  });

  window.addEventListener('mousemove', (e) => {
    orb.targetLX = (e.clientX / window.innerWidth - 0.5) * 1.6;
    orb.targetLY = (e.clientY / window.innerHeight - 0.5) * 1.3;
    orb.mouseSeen = performance.now();
  }, { passive: true });

  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => { orb.visible = en.isIntersecting; });
  }, { threshold: 0.02 });
  io.observe(orbCanvas);

  window.addEventListener('resize', () => {
    orbResize();
    if (prefersStill) drawOrb(0.001);
  });

  document.addEventListener('motionchange', (e) => {
    if (!e.detail) drawOrb(0.001); // going still — leave one calm frame
  });

  if (prefersStill) drawOrb(0.001); // static frame while calm
  orb.running = true;
  requestAnimationFrame(orbFrame); // loop self-gates on prefersStill
}

// ------------------------------------------------------------
// POINTER — shared cursor state for reactive layers
// ------------------------------------------------------------
const pointer = { x: -1e4, y: -1e4 };
window.addEventListener('mousemove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });
document.addEventListener('mouseleave', () => { pointer.x = -1e4; pointer.y = -1e4; });

// ------------------------------------------------------------
// HAZE — drifting aurora orbs: breathe, parallax, lean to cursor
// ------------------------------------------------------------
const hazeOrbs = $$('.haze-orb').map((el, i) => ({
  el,
  ampX: [70, 90, 60, 110][i % 4],
  ampY: [50, 70, 80, 60][i % 4],
  spdX: [0.05, 0.038, 0.061, 0.045][i % 4],
  spdY: [0.041, 0.052, 0.033, 0.06][i % 4],
  bspd: [0.11, 0.09, 0.13, 0.08][i % 4],
  att: [0.045, 0.07, 0.055, 0.09][i % 4],
  phase: i * 1.7,
  par: [0.05, 0.09, 0.06, 0.12][i % 4],
  mx: 0, my: 0,
}));

function updateHaze(t) {
  const sy = window.scrollY;
  const px = pointer.x > -9000 ? pointer.x - window.innerWidth / 2 : 0;
  const py = pointer.y > -9000 ? pointer.y - vhCache / 2 : 0;
  for (const o of hazeOrbs) {
    o.mx += (px * o.att - o.mx) * 0.03;   // slow lean toward the cursor
    o.my += (py * o.att - o.my) * 0.03;
    // primary drift + a second, incommensurate wobble so paths never repeat
    const dx = Math.sin(t * o.spdX + o.phase) * o.ampX + Math.sin(t * o.spdX * 2.7 + o.phase * 3.1) * 16 + o.mx;
    const dy = Math.cos(t * o.spdY + o.phase * 1.3) * o.ampY + Math.cos(t * o.spdY * 3.3 + o.phase * 1.9) * 12 - sy * o.par + o.my;
    const s = 1 + Math.sin(t * o.bspd + o.phase * 2.3) * 0.045; // breathing
    o.el.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
  }
}

// ------------------------------------------------------------
// STAR FIELD — ascii glyphs drifting behind everything; they
// brighten and shy away when the cursor comes near
// ------------------------------------------------------------
const fieldCv = $('#field-canvas');
const field = { ctx: null, w: 0, h: 0, glyphs: [], sat: null, nextSat: 14 };
const FIELD_GLYPHS = ['·', '·', '·', '·', ':', '˜', '+', '✦', '·'];

function fieldColors() {
  return currentTheme() === 'night'
    ? [[167, 139, 250], [125, 211, 252], [240, 171, 252], [216, 212, 240]]
    : [[109, 89, 207], [61, 127, 184], [168, 85, 181], [90, 86, 130]];
}

function resizeField() {
  if (!fieldCv) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  field.w = window.innerWidth;
  field.h = window.innerHeight;
  fieldCv.width = Math.round(field.w * dpr);
  fieldCv.height = Math.round(field.h * dpr);
  field.ctx = fieldCv.getContext('2d');
  field.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  field.ctx.textBaseline = 'middle';
  field.ctx.textAlign = 'center';
}

function initField() {
  if (!fieldCv) return;
  resizeField();
  window.addEventListener('resize', () => { resizeField(); if (prefersStill) fieldTick(0.001, true); });
  const count = clamp(Math.round(field.w * field.h / 16000), 40, 140);
  field.glyphs = [];
  for (let i = 0; i < count; i++) {
    field.glyphs.push({
      x0: Math.random() * field.w,
      y0: Math.random() * field.h,
      ch: FIELD_GLYPHS[Math.floor(Math.random() * FIELD_GLYPHS.length)],
      size: 9 + Math.random() * 6,
      a: 0.1 + Math.random() * 0.3,
      wp: Math.random() * Math.PI * 2,
      ws: 0.12 + Math.random() * 0.3,
      wa: 10 + Math.random() * 26,
      vy: 2.5 + Math.random() * 5.5,       // px/s upward drift
      c: Math.floor(Math.random() * 4),
      tw: 0.4 + Math.random() * 1.1,       // twinkle speed
      k: 0,                                // eased cursor-proximity (bokeh)
      dp: 0.05 + Math.random() * 0.17,     // scroll-parallax depth (slower than content)
    });
  }
  document.addEventListener('themechange', () => { if (prefersStill) fieldTick(0.001, true); });
  document.addEventListener('motionchange', (e) => { if (!e.detail) fieldTick(0.001, true); });
  if (prefersStill) fieldTick(0.001, true);
}

function drawDotsPatch(ctx, g, px, py, t, col) {
  ctx.save();
  ctx.translate(px + g.w / 2, py + g.h / 2);
  ctx.rotate(g.rot + Math.sin(t * 0.11 + g.x * 9) * 0.02); // slow wobble
  const STEP = 20;
  const drift = (t * 3.2) % STEP;
  const hw = g.w / 2, hh = g.h / 2;
  ctx.fillStyle = col;
  for (let yy = -hh - STEP; yy <= hh; yy += STEP) {
    for (let xx = -hw - STEP; xx <= hw; xx += STEP) {
      const dxx = xx + drift, dyy = yy + drift;
      const fall = (1 - (dxx / hw) * (dxx / hw)) * (1 - (dyy / hh) * (dyy / hh));
      if (fall <= 0.04) continue;
      // per-dot shimmer + a light band sweeping diagonally through
      const shimmer = 0.72 + 0.28 * Math.sin(t * 1.1 + (dxx + dyy) * 0.03);
      const band = Math.sin((dxx * 0.9 + dyy * 0.45) * 0.012 - t * 1.5);
      const lit = band > 0.9 ? 2.1 : 1;
      ctx.globalAlpha = Math.min(0.95, fall * 0.42 * shimmer * lit);
      const s = lit > 1 ? 2.3 : 1.7;
      ctx.fillRect(dxx, dyy, s, s);
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawMeshPatch(ctx, g, px, py, t, col) {
  ctx.save();
  ctx.translate(px + g.w / 2, py + g.h / 2);
  ctx.rotate(g.rot + Math.sin(t * 0.09 + g.y * 7) * 0.018);
  const hw = g.w / 2, hh = g.h / 2;
  const driftX = (t * 2.2) % 36;
  ctx.lineWidth = 1;
  ctx.strokeStyle = col;
  const colsX = [];
  for (let xx = -hw - 36; xx <= hw; xx += 36) {
    const dxx = xx + driftX;
    colsX.push(dxx);
    // breathing alpha wave traveling across the wires
    const wave = 0.68 + 0.32 * Math.sin(t * 1.3 + xx * 0.045);
    ctx.globalAlpha = Math.max(0, 1 - (dxx / hw) * (dxx / hw)) * 0.24 * wave;
    ctx.beginPath();
    ctx.moveTo(dxx, -hh);
    ctx.lineTo(dxx, hh);
    ctx.stroke();
  }
  for (let yy = -hh; yy <= hh; yy += 44) {
    const wave = 0.68 + 0.32 * Math.sin(t * 1.05 + yy * 0.05);
    ctx.globalAlpha = Math.max(0, 1 - (yy / hh) * (yy / hh)) * 0.24 * wave;
    ctx.beginPath();
    ctx.moveTo(-hw, yy);
    ctx.lineTo(hw, yy);
    ctx.stroke();
  }
  // a light runner tracing one wire (Tron by way of chillout compilation).
  // One cycle = one full pass down one wire; a sine envelope fades it in
  // and out at the ends, and it only hops wires while fully faded.
  if (colsX.length) {
    const cycle = t * 0.26 + g.w * 0.013;
    const wire = colsX[Math.floor(cycle) % colsX.length];
    const prog = cycle % 1;
    const env = Math.sin(Math.PI * prog);
    if (env > 0.03) {
      const run = -hh + prog * (hh * 2);
      ctx.globalAlpha = 0.72 * env * env;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(wire, run - 12 * env);
      ctx.lineTo(wire, run + 12 * env);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawPlane(ctx, bottomY, t, colA, colB) {
  const H = Math.min(320, field.h * 0.4);
  const y0 = bottomY - H;
  if (y0 > field.h || bottomY < 0) return;
  const cx = field.w / 2;
  const gradA = ctx.createLinearGradient(0, y0, 0, bottomY);
  gradA.addColorStop(0, 'rgba(0,0,0,0)');
  gradA.addColorStop(0.45, colA);
  gradA.addColorStop(1, colA.replace(/[\d.]+\)$/, '0.06)'));
  ctx.lineWidth = 1;
  for (let k = -15; k <= 15; k++) {           // converging verticals, shimmering
    ctx.strokeStyle = gradA;
    ctx.globalAlpha = 0.66 + 0.34 * Math.sin(t * 0.9 + k * 0.7);
    ctx.beginPath();
    ctx.moveTo(cx + k * 9, y0);
    ctx.lineTo(cx + k * 135, bottomY + 30);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const gradB = ctx.createLinearGradient(0, y0, 0, bottomY);
  gradB.addColorStop(0, 'rgba(0,0,0,0)');
  gradB.addColorStop(0.5, colB);
  gradB.addColorStop(1, colB.replace(/[\d.]+\)$/, '0.08)'));
  ctx.strokeStyle = gradB;
  const N = 12;
  const ph = prefersStill ? 0 : (t * 0.5) % 1;
  for (let i = 0; i <= N; i++) {              // horizontals marching toward you
    const v = (i + ph) / N;
    const yy = y0 + H * v * v;
    if (yy > field.h + 20) continue;
    ctx.beginPath();
    ctx.moveTo(0, yy);
    ctx.lineTo(field.w, yy);
    ctx.stroke();
  }
  // a glint gliding along the horizon line
  const gx = ((t * 105) % (field.w + 360)) - 180;
  const glint = ctx.createLinearGradient(gx - 70, 0, gx + 70, 0);
  glint.addColorStop(0, 'rgba(0,0,0,0)');
  glint.addColorStop(0.5, colA.replace(/[\d.]+\)$/, '0.85)'));
  glint.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.strokeStyle = glint;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(gx - 70, y0 + 1);
  ctx.lineTo(gx + 70, y0 + 1);
  ctx.stroke();
}

function drawGeometry(ctx, t, cols) {
  if (!geoScenes) {
    geoScenes = GEO_CONF
      .map(g => ({ ...g, el: document.getElementById(g.id) }))
      .filter(g => g.el);
  }
  const sy = window.scrollY;
  for (const g of geoScenes) {
    const top = g.el.offsetTop, sh = g.el.offsetHeight;
    if (g.kind === 'plane') {
      const co = (top + sh / 2 - sy) - field.h / 2;
      const bottomY = top + sh - sy + co * 0.07;   // lags the content slightly
      if (bottomY < 20 || bottomY - 340 > field.h) continue;
      const a = cols[0], b = cols[1];
      drawPlane(ctx, bottomY, t,
        `rgba(${a[0]},${a[1]},${a[2]},0.2)`,
        `rgba(${b[0]},${b[1]},${b[2]},0.16)`);
    } else {
      const seed = g.w * 0.11 + g.h * 0.07;
      const px = g.x * field.w + Math.sin(t * 0.21 + seed) * 9;
      const centerOff = (top + sh / 2 - sy) - field.h / 2;
      const py = top + g.y * sh - sy - centerOff * (g.depth || 0.12)
        + Math.cos(t * 0.17 + seed * 1.6) * 7;
      if (py + g.h < -40 || py > field.h + 40) continue;
      const c = cols[g.c];
      const col = `rgba(${c[0]},${c[1]},${c[2]},1)`;
      if (g.kind === 'dots') drawDotsPatch(ctx, g, px, py, t, col);
      else drawMeshPatch(ctx, g, px, py, t, col);
    }
  }
}

function fieldTick(t, force) {
  const ctx = field.ctx;
  if (!ctx || (prefersStill && !force)) return;
  ctx.clearRect(0, 0, field.w, field.h);
  const cols = fieldColors();
  drawGeometry(ctx, t, cols);
  const R = 190;                            // cursor influence radius

  const sy = window.scrollY;
  for (const g of field.glyphs) {
    let x = g.x0 + Math.sin(t * g.ws + g.wp) * g.wa + Math.sin(t * g.ws * 2.4 + g.wp * 1.7) * (g.wa * 0.35);
    let y = (((g.y0 - t * g.vy - sy * g.dp) % field.h) + field.h) % field.h
      + Math.sin(t * g.ws * 1.6 + g.wp * 2.3) * 5;
    const twk = 0.55 + 0.45 * Math.sin(t * g.tw + g.wp * 3);

    // bokeh: near the cursor glyphs slowly defocus — larger, fainter,
    // barely displaced. Eased per glyph so nothing ever pops.
    const dx = x - pointer.x, dy = y - pointer.y;
    const d2 = dx * dx + dy * dy;
    let targetK = 0;
    if (d2 < R * R) {
      const d = Math.sqrt(d2) || 1;
      targetK = (1 - d / R) * (1 - d / R);
    }
    g.k += (targetK - g.k) * 0.09;
    const k = g.k;
    if (k > 0.01) {
      const d = Math.sqrt(d2) || 1;
      x += (dx / d) * k * 7;
      y += (dy / d) * k * 7;
    }
    const alpha = g.a * twk * (1 - k * 0.72);
    const size = g.size * (1 + k * 1.5);

    const c = cols[g.c];
    ctx.font = `${size.toFixed(1)}px "IBM Plex Mono", monospace`;
    ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${alpha.toFixed(3)})`;
    ctx.fillText(g.ch, x, y);
  }

  // an occasional satellite drifts across the whole sky
  if (!prefersStill) {
    if (!field.sat && t > field.nextSat) {
      const fromLeft = Math.random() < 0.5;
      field.sat = {
        x: fromLeft ? -30 : field.w + 30,
        y: field.h * (0.12 + Math.random() * 0.5),
        vx: (fromLeft ? 1 : -1) * (34 + Math.random() * 26),
        vy: (Math.random() - 0.35) * 12,
        t0: t,
      };
    }
    if (field.sat) {
      const s = field.sat;
      const age = t - s.t0;
      const sx = s.x + s.vx * age;
      const sy2 = s.y + s.vy * age;
      const c = cols[3];
      for (let e = 0; e < 3; e++) {         // trailing echoes
        const back = e * 0.55;
        ctx.font = `${(12 - e * 2.4).toFixed(1)}px "IBM Plex Mono", monospace`;
        ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${(0.7 - e * 0.24).toFixed(2)})`;
        ctx.fillText('✧', sx - s.vx * back, sy2 - s.vy * back);
      }
      if (sx < -60 || sx > field.w + 60) {
        field.sat = null;
        field.nextSat = t + 16 + Math.random() * 22;
      }
    }
  }
}

// ------------------------------------------------------------
// DIAL RAIL + FREQ READOUT + NAV STATE (main rAF loop)
// ------------------------------------------------------------
const freqReadout = $('#freq-readout');
const dialRail = $('#dial-rail');
const dialThumb = $('#dial-thumb');
const tunerBar = $('#tuner');
const navLinks = $$('.tuner-link');
let dialTicks = [];
let smoothdIdx = 0;

function buildDialTicks() {
  if (!dialRail) return;
  dialTicks.forEach(t => t.el.remove());
  dialTicks = [];
  const docH = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  scenes.forEach((s, i) => {
    const el = document.createElement('button');
    el.className = 'dial-tick';
    el.type = 'button';
    el.dataset.label = `${fmtFreq(sceneFreqs[i])} ${SECTION_NAMES[s.id] || s.id.toUpperCase()}`;
    const p = clamp(s.offsetTop / docH, 0, 1);
    el.style.top = `${(p * 100).toFixed(2)}%`;
    el.addEventListener('click', () => {
      window.scrollTo({ top: s.offsetTop, behavior: prefersStill ? 'auto' : 'smooth' });
    });
    dialRail.appendChild(el);
    dialTicks.push({ el, scene: s });
  });
}

let mainLoopStarted = false;
function mainLoop(now) {
  requestAnimationFrame(mainLoop);
  if (document.hidden) return;
  const t = now / 1000;

  mainLoop._f = (mainLoop._f || 0) + 1;
  const slowTick = (mainLoop._f & 1) === 0;   // half-rate lane (reel drift only)
  if (!prefersStill) updateHaze(t);
  // full-rate: anything scroll-coupled must track the frame exactly,
  // otherwise the decor visibly lags behind the content while scrolling
  scrollTheatre(window.scrollY, t, slowTick);
  if (!prefersStill) fieldTick(t);

  // dial position
  const target = scrollDialIndex();
  smoothdIdx += (target - smoothdIdx) * (prefersStill ? 1 : 0.12);
  const i = clamp(Math.floor(smoothdIdx), 0, sceneFreqs.length - 1);
  const frac = clamp(smoothdIdx - i, 0, 1);
  const f = lerp(sceneFreqs[i], sceneFreqs[Math.min(i + 1, sceneFreqs.length - 1)], frac);
  if (freqReadout) {
    if (scrambleTicks > 0 && !prefersStill) {
      scrambleTicks--;
      freqReadout.textContent = scrambledFreq();
    } else {
      freqReadout.textContent = `FM ${fmtFreq(f)}`;
    }
  }

  // rail thumb
  if (dialThumb) {
    const docH = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const p = clamp(window.scrollY / docH, 0, 1);
    dialThumb.style.top = `${(p * 100).toFixed(2)}%`;
  }

  // active states (only touch DOM when the active section changes)
  const activeIdx = Math.round(clamp(smoothdIdx, 0, scenes.length - 1));
  if (mainLoop._active !== activeIdx) {
    if (mainLoop._active !== undefined) scrambleTicks = 7; // static burst while retuning
    mainLoop._active = activeIdx;
    const id = scenes[activeIdx] ? scenes[activeIdx].id : '';
    navLinks.forEach(l => l.classList.toggle('active', l.dataset.target === id));
    dialTicks.forEach((tk, k) => tk.el.classList.toggle('active', k === activeIdx));
  }

  // nav backdrop
  const scrolled = window.scrollY > 24;
  if (mainLoop._scrolled !== scrolled) {
    mainLoop._scrolled = scrolled;
    if (tunerBar) tunerBar.classList.toggle('scrolled', scrolled);
  }
}

// ------------------------------------------------------------
// NAV (mobile menu)
// ------------------------------------------------------------
function initNav() {
  const menuBtn = $('#menu-btn');
  const links = $('#tuner-links');
  if (!menuBtn || !links) return;

  function setOpen(open) {
    links.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.textContent = open ? '[ close ]' : '[ menu ]';
  }
  menuBtn.addEventListener('click', () => setOpen(!links.classList.contains('open')));
  links.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  document.addEventListener('click', (e) => {
    if (!links.classList.contains('open')) return;
    if (!links.contains(e.target) && e.target !== menuBtn) setOpen(false);
  });
}

// ------------------------------------------------------------
// SCROLL REVEALS
// ------------------------------------------------------------
let revealObserver = null;
function revealScan(scope) {
  if (!revealObserver) return;
  const els = $$('.reveal:not(.visible):not([data-observed])', scope || document);
  // stagger within each batch
  els.forEach((el, i) => {
    el.dataset.observed = '1';
    if (!el.style.getPropertyValue('--d')) {
      el.style.setProperty('--d', `${(i % 7) * 0.08}s`);
    }
    revealObserver.observe(el);
  });
  // desync each panel's ambling shine so they don't flash in unison
  $$('.glass', scope || document).forEach((g, i) => {
    if (!g.style.getPropertyValue('--gd')) {
      g.style.setProperty('--gd', `${((i * 1.9) % 9).toFixed(2)}s`);
    }
  });
}

function initReveals() {
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
  revealScan(document);
}

// ------------------------------------------------------------
// TYPED ROLES (hero)
// ------------------------------------------------------------
function initTyped() {
  const phrases = [
    'simulating metasurfaces with RCWA',
    'producing music in FL Studio',
    'editing in Premiere Pro',
    'modeling in Blender',
    'calibrating polarimetric optics',
    'Harvard eSports president',
    'published at IEEE CLEO 2023',
    'researching nanophotonics at Harvard SEAS',
  ];
  const el = $('#typed');
  if (!el) return;

  let pi = 0, ci = 0, deleting = false;
  (function type() {
    if (prefersStill) {
      // calm mode: show the full phrase; poll gently in case motion returns
      el.textContent = phrases[pi];
      ci = phrases[pi].length;
      deleting = true;
      setTimeout(type, 2500);
      return;
    }
    const cur = phrases[pi];
    el.textContent = deleting ? cur.substring(0, ci - 1) : cur.substring(0, ci + 1);
    ci += deleting ? -1 : 1;
    let speed = deleting ? 26 : 58;
    if (!deleting && ci === cur.length) { speed = 2300; deleting = true; }
    else if (deleting && ci === 0) { deleting = false; pi = (pi + 1) % phrases.length; speed = 420; }
    setTimeout(type, speed);
  })();
}

// ------------------------------------------------------------
// COUNT-UP (hero stats)
// ------------------------------------------------------------
function initCountUp() {
  const stats = $$('.hstat-num');
  if (!stats.length) return;
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const end = parseInt(el.dataset.count, 10) || 0;
      obs.unobserve(el);
      if (prefersStill) { el.textContent = end.toLocaleString() + '+'; return; }
      const t0 = performance.now(), dur = 1600;
      (function tick(now) {
        const p = clamp((now - t0) / dur, 0, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.floor(end * eased).toLocaleString();
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = end.toLocaleString() + '+';
      })(t0);
    });
  }, { threshold: 0.6 });
  stats.forEach(s => obs.observe(s));
}

// ------------------------------------------------------------
// TRANSMISSION LOG (about) — line-by-line reveal
// ------------------------------------------------------------
function initLogReveal() {
  const body = $('#log-body');
  if (!body) return;
  const lines = $$('.log-line', body);
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      obs.unobserve(entry.target);
      lines.forEach((line, i) => {
        if (prefersStill) { line.classList.add('visible'); return; }
        setTimeout(() => line.classList.add('visible'), i * 70);
      });
    });
  }, { threshold: 0.25 });
  obs.observe(body);
}

// ------------------------------------------------------------
// ASCII SIGNAL METERS (skills)
// ------------------------------------------------------------
function buildMeter(el, cells) {
  el.innerHTML = '';
  el.dataset.cells = cells;
  for (let i = 0; i < cells; i++) {
    const c = document.createElement('span');
    c.className = 'cell';
    c.textContent = '░';
    el.appendChild(c);
  }
}

function fillMeter(el, level, animate) {
  const cells = $$('.cell', el);
  const onCount = Math.round((level / 100) * cells.length);
  cells.forEach((c, i) => {
    const turnOn = () => {
      if (i < onCount) {
        c.textContent = '█';
        c.classList.add('on');
        if (i === onCount - 1) c.classList.add('peak');
      }
    };
    if (animate && !prefersStill) setTimeout(turnOn, 220 + i * 26);
    else turnOn();
  });
}

function initMeters() {
  const master = $('#master-meter');
  if (master) buildMeter(master, 34);
  $$('.skill-row .skill-meter').forEach(m => buildMeter(m, 18));

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      obs.unobserve(entry.target);
      const el = entry.target;
      const level = parseInt(el.closest('[data-level]')?.dataset.level || el.dataset.level || '0', 10);
      fillMeter(el, level, true);
    });
  }, { threshold: 0.4 });

  if (master) { master.dataset.level = master.dataset.level || '78'; obs.observe(master); }
  $$('.skill-row .skill-meter').forEach(m => obs.observe(m));

  // VU flutter on hover — the peak boundary wobbles like a live meter
  {
    $$('.skill-row').forEach(row => {
      let timer = null;
      row.addEventListener('mouseenter', () => {
        if (prefersStill) return;
        const meter = $('.skill-meter', row);
        if (!meter) return;
        const cells = $$('.cell', meter);
        const level = parseInt(row.dataset.level || '0', 10);
        const onCount = Math.round((level / 100) * cells.length);
        timer = setInterval(() => {
          const wobble = Math.random() < 0.5 ? 0 : 1;
          cells.forEach((c, i) => {
            const on = i < onCount + wobble - (Math.random() < 0.3 ? 1 : 0);
            c.textContent = on ? '█' : '░';
            c.classList.toggle('on', on);
            c.classList.toggle('peak', on && i >= onCount - 1);
          });
        }, 130);
      });
      row.addEventListener('mouseleave', () => {
        clearInterval(timer);
        const meter = $('.skill-meter', row);
        if (!meter) return;
        fillMeter(meter, parseInt(row.dataset.level || '0', 10), false);
      });
    });
  }
}

// ------------------------------------------------------------
// WAVE DIVIDERS — drifting ascii water
// ------------------------------------------------------------
function initWaves() {
  const els = $$('[data-wave]');
  const GLYPHS = ['·', '˜', '~', '≈', '~', '˜'];
  const BARS = '▁▂▃▄▅▆▇';
  const LEN = 46;
  const orns = $$('.sec-orn');
  const tape = $('#side-tape');
  const tapeChars = Array.from({ length: 24 }, () => '·');
  const TAPE_SET = ['·', '·', ':', '·', '┆', '·', '╎', ':'];
  const setStatic = () => {
    els.forEach(el => { el.textContent = '~ · ~ · ~ · ~ · ~ · ~'; });
    orns.forEach(o => { o.textContent = '▂▄▂▅▃▄▂▃'; });
  };
  if (prefersStill) setStatic();
  document.addEventListener('motionchange', (e) => { if (!e.detail) setStatic(); });
  let t = 0, tick = 0;
  setInterval(() => {
    if (document.hidden || prefersStill) return;
    t += 0.22 + waveEnergy * 0.3; // scrolling stirs the water
    tick++;
    let s = '';
    for (let i = 0; i < LEN; i++) {
      const v = (Math.sin(i * 0.42 + t) + Math.sin(i * 0.17 - t * 0.7)) * (0.62 + waveEnergy * 1.15);
      const idx = clamp(Math.round((v + 2) / 4 * (GLYPHS.length - 1)), 0, GLYPHS.length - 1);
      s += GLYPHS[idx];
    }
    els.forEach(el => { el.textContent = s; });
    // mini-equalizers breathe beside each section title
    orns.forEach((o, k) => {
      let b = '';
      for (let i = 0; i < 8; i++) {
        const v = (Math.sin(i * 0.9 + t * 1.6 + k * 2.2) + Math.sin(i * 1.7 - t * 1.1)) / 2;
        b += BARS[clamp(Math.round((v + 1) / 2 * (BARS.length - 1)), 0, BARS.length - 1)];
      }
      o.textContent = b;
    });
    // the side tape crawls one notch every other tick
    if (tape && (tick & 1) === 0) {
      tapeChars.pop();
      const v = Math.sin(t * 0.9) + Math.sin(t * 2.3);
      tapeChars.unshift(TAPE_SET[clamp(Math.round((v + 2) / 4 * (TAPE_SET.length - 1)), 0, TAPE_SET.length - 1)]);
      tape.textContent = tapeChars.join('\n');
    }
  }, 120);
}

// ------------------------------------------------------------
// DRIFT ROWS — drag to scrub with momentum
// ------------------------------------------------------------
function initDriftRow(rowEl) {
  if (!rowEl || rowEl.dataset.driftInit) return;
  rowEl.dataset.driftInit = '1';

  let dragging = false, dragged = false;
  let startX = 0, startScroll = 0;
  let velocity = 0, lastX = 0, lastT = 0, momentumId = null;

  const stopMomentum = () => { if (momentumId) { cancelAnimationFrame(momentumId); momentumId = null; } };
  const applyMomentum = () => {
    if (Math.abs(velocity) < 0.4) { momentumId = null; return; }
    rowEl.scrollLeft -= velocity;
    velocity *= 0.94;
    momentumId = requestAnimationFrame(applyMomentum);
  };

  rowEl.addEventListener('mousedown', (e) => {
    dragging = true; dragged = false;
    stopMomentum();
    startX = e.pageX; startScroll = rowEl.scrollLeft;
    lastX = e.pageX; lastT = performance.now(); velocity = 0;
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.pageX - startX;
    if (Math.abs(dx) > 4 && !dragged) { dragged = true; rowEl.classList.add('dragging'); }
    rowEl.scrollLeft = startScroll - dx * 1.6;
    const now = performance.now(), dt = now - lastT;
    if (dt > 0) {
      velocity = (e.pageX - lastX) * 1.6 / Math.max(dt, 8) * 16;
      lastX = e.pageX; lastT = now;
    }
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    rowEl.classList.remove('dragging');
    if (!prefersStill) applyMomentum();
  });
  rowEl.addEventListener('click', (e) => {
    if (dragged) { e.preventDefault(); e.stopPropagation(); dragged = false; }
  }, true);
  rowEl.addEventListener('dragstart', e => e.preventDefault());
  // touch scrolling is native (overflow-x: auto)
}

// ------------------------------------------------------------
// ASCIIFY — video thumbnails dissolve into ascii on hover
// ------------------------------------------------------------
const ASCII_COLS = 72;
const ASCII_RAMP = ' .·:-=+*#%@';

function asciifyCard(card) {
  const thumb = $('.video-thumb', card);
  const img = $('img', thumb || card);
  const pre = $('.video-ascii', card);
  if (!thumb || !img || !pre || pre.dataset.done) return;
  if (!img.complete || img.naturalWidth === 0) return;

  const rows = Math.max(10, Math.round(ASCII_COLS * (9 / 16) * 0.56));
  try {
    const cv = document.createElement('canvas');
    cv.width = ASCII_COLS;
    cv.height = rows;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0, ASCII_COLS, rows);
    const data = cx.getImageData(0, 0, ASCII_COLS, rows).data;
    let out = '';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < ASCII_COLS; x++) {
        const k = (y * ASCII_COLS + x) * 4;
        const lum = (data[k] * 0.2126 + data[k + 1] * 0.7152 + data[k + 2] * 0.0722) / 255;
        const boosted = Math.pow(lum, 0.82); // lift mids so thumbs stay readable
        out += ASCII_RAMP[Math.min(ASCII_RAMP.length - 1, Math.floor(boosted * ASCII_RAMP.length))];
      }
      if (y < rows - 1) out += '\n';
    }
    pre.textContent = out;
    const w = thumb.clientWidth, h = thumb.clientHeight;
    pre.style.fontSize = `${(w / ASCII_COLS / 0.602).toFixed(2)}px`;
    pre.style.lineHeight = `${(h / rows).toFixed(2)}px`;
    pre.style.paddingLeft = '2px';
    pre.classList.add('ready');
    pre.dataset.done = '1';
  } catch (err) {
    // canvas tainted (no CORS) — fall back to the scanline veil
    thumb.classList.add('no-ascii');
    pre.dataset.done = '1';
  }
}

function bindAsciify(scope) {
  $$('.video-card', scope || document).forEach(card => {
    if (card.dataset.asciiBound) return;
    card.dataset.asciiBound = '1';
    card.addEventListener('mouseenter', () => asciifyCard(card), { passive: true });
  });
}

// ------------------------------------------------------------
// SPOTIFY (ported — same proxy contract)
// ------------------------------------------------------------
async function fetchSpotifyTracks() {
  if (!SPOTIFY_PROXY_URL) return { tracks: null, playlist: null };
  try {
    const res = await fetch(SPOTIFY_PROXY_URL);
    if (!res.ok) return { tracks: null, playlist: null };
    const data = await res.json();

    function parseTrack(track, isNowPlaying) {
      return {
        name: track.name,
        artist: track.artists.map(a => a.name).join(', '),
        album: track.album.name,
        albumArt: track.album.images[0]?.url,
        url: track.external_urls.spotify,
        nowPlaying: isNowPlaying || false,
      };
    }

    const tracks = [];
    if (data.now_playing && data.now_playing.item) {
      tracks.push(parseTrack(data.now_playing.item, data.now_playing.is_playing));
    }
    if (data.recently_played) {
      data.recently_played.forEach(item => tracks.push(parseTrack(item.track, false)));
    }
    if (data.items) {
      data.items.forEach(item => tracks.push(parseTrack(item.track, false)));
    } else if (data.item && !data.now_playing) {
      tracks.push(parseTrack(data.item, data.is_playing));
    }

    return { tracks: tracks.length ? tracks : null, playlist: data.playlist || null };
  } catch (e) {
    console.warn('Spotify fetch failed:', e);
    return { tracks: null, playlist: null };
  }
}

function albumCardHTML(track, i, withEq) {
  const art = track.albumArt
    ? `<img src="${track.albumArt}" alt="${track.album}" loading="lazy">`
    : `<div class="album-fallback">${String(i + 1).padStart(2, '0')}</div>`;
  const eq = withEq
    ? `<div class="album-eq" aria-hidden="true"><span></span><span></span><span></span><span></span></div>`
    : '';
  return `
    <a class="album-card reveal" href="${track.url}" target="_blank" rel="noopener">
      <div class="album-art">${art}${eq}</div>
      <div class="album-info">
        <h4>${track.name}</h4>
        <p>${track.artist}</p>
      </div>
    </a>`;
}

function renderPlaylistTracks(playlistData) {
  const container = $('#playlist-tracks');
  if (!container) return;
  if (!playlistData || !playlistData.tracks || playlistData.tracks.length === 0) {
    container.innerHTML = '<div class="spotify-empty">((( no signal — playlist unavailable )))</div>';
    return;
  }
  const tracks = playlistData.tracks
    .filter(item => item.track || item.item)
    .map(item => {
      const t = item.track || item.item;
      return {
        name: t.name,
        artist: t.artists.map(a => a.name).join(', '),
        album: t.album.name,
        albumArt: t.album.images[0]?.url,
        url: t.external_urls.spotify,
      };
    });
  container.innerHTML = tracks.slice(0, 14).map((t, i) => albumCardHTML(t, i, false)).join('');
  initDriftRow(container);
  revealScan(container);
}

function renderSpotifyTracks(tracks) {
  const container = $('#spotify-tracks');
  const label = $('#spotify-label');
  const badge = $('#spotify-badge');
  if (!container) return;
  if (!tracks || tracks.length === 0) {
    container.innerHTML = '<div class="spotify-empty">((( no signal — recent tracks unavailable )))</div>';
    return;
  }
  if (tracks[0].nowPlaying && label && badge) {
    label.textContent = 'NOW PLAYING';
    badge.textContent = 'LIVE';
    badge.classList.add('live');
  }
  const seen = new Set();
  const unique = tracks.filter(t => {
    if (seen.has(t.name)) return false;
    seen.add(t.name);
    return true;
  });
  container.innerHTML = unique.slice(0, 14).map((t, i) => albumCardHTML(t, i, t.nowPlaying)).join('');
  initDriftRow(container);
  revealScan(container);
}

// ------------------------------------------------------------
// YOUTUBE (ported)
// ------------------------------------------------------------
async function fetchYouTubeVideos() {
  if (!YOUTUBE_API_KEY || !YOUTUBE_CHANNEL_ID) return null;
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${YOUTUBE_CHANNEL_ID}&maxResults=8&order=date&type=video&key=${YOUTUBE_API_KEY}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data.items || []).map(item => ({
      id: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
    }));
  } catch (e) {
    console.warn('YouTube fetch failed:', e);
    return null;
  }
}

function renderYouTubeVideos(videos) {
  const container = $('#video-row');
  if (!container) return;

  if (!videos || videos.length === 0) {
    container.innerHTML = Array.from({ length: 3 }, (_, i) => `
      <div class="video-card glass reveal">
        <div class="video-thumb no-ascii">
          <div class="video-placeholder">▷</div>
        </div>
        <div class="video-meta">
          <span class="vnum mono">${String(i + 1).padStart(3, '0')}</span>
          <h3>((( transmission pending )))</h3>
        </div>
      </div>
    `).join('');
    revealScan(container);
    return;
  }

  container.innerHTML = videos.map((v, i) => `
    <a class="video-card glass reveal" href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener">
      <div class="video-thumb">
        <img src="${v.thumbnail}" alt="${v.title.replace(/"/g, '&quot;')}" crossorigin="anonymous" loading="lazy">
        <pre class="video-ascii mono" aria-hidden="true"></pre>
      </div>
      <div class="video-meta">
        <span class="vnum mono">${String(i + 1).padStart(3, '0')}</span>
        <h3>${v.title}</h3>
      </div>
    </a>
  `).join('');

  // if CORS-tagged thumbnails fail to load, retry untagged (no ascii, but visible)
  $$('#video-row img').forEach(img => {
    img.addEventListener('error', () => {
      if (!img.dataset.retried) {
        img.dataset.retried = '1';
        img.removeAttribute('crossorigin');
        img.closest('.video-thumb')?.classList.add('no-ascii');
        const src = img.src;
        img.src = '';
        img.src = src;
      }
    });
  });

  initDriftRow(container);
  bindAsciify(container);
  revealScan(container);
}

// ------------------------------------------------------------
// GAMING — Riot + Steam (ported render logic, soft-signal skin)
// ------------------------------------------------------------
async function fetchGamingData() {
  if (!GAMING_PROXY_URL) return null;
  try {
    const res = await fetch(GAMING_PROXY_URL);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('Gaming fetch failed:', e);
    return null;
  }
}

function formatPlaytime(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 1000) return `${hours}h`;
  return `${(hours / 1000).toFixed(1)}k hrs`;
}

function renderRiotData(riot) {
  const container = $('#riot-cards');
  const badge = $('#riot-badge');
  if (!container) return;

  if (!riot || (!riot.lol && !riot.account)) {
    container.innerHTML = '<div class="spotify-empty">((( riot api key expired — dev keys refresh every 24h )))</div>';
    return;
  }

  if (riot.account && badge) {
    badge.textContent = `${riot.account.gameName}#${riot.account.tagLine}`;
    badge.classList.add('active');
  }

  let html = '';

  if (riot.lol) {
    const lol = riot.lol;
    const soloQ = lol.ranked?.RANKED_SOLO_5x5;
    const flex = lol.ranked?.RANKED_FLEX_SR;
    const totalPoints = lol.totalMasteryPoints ? (lol.totalMasteryPoints / 1000000).toFixed(1) + 'M' : '0';

    if (soloQ || flex) {
      const q = soloQ || flex;
      const queueName = soloQ ? 'Solo/Duo' : 'Flex';
      const winrate = ((q.wins / (q.wins + q.losses)) * 100).toFixed(0);
      html += `
        <div class="game-card glass tilt reveal">
          <div class="game-card-header">
            <img class="game-card-icon rank-icon" src="https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${q.tier.toLowerCase()}.png" alt="${q.tier}">
            <div class="game-card-titles">
              <h4>League of Legends</h4>
              <span class="game-card-sub">${queueName} · Level ${lol.summonerLevel}</span>
            </div>
          </div>
          <div class="game-card-rank">
            <span class="rank-tier">${q.tier} ${q.rank}</span>
            <span class="rank-lp">${q.lp} LP</span>
          </div>
          <div class="game-card-stats">
            <span class="stat-win">${q.wins}W</span>
            <span class="stat-loss">${q.losses}L</span>
            <span class="stat-wr">${winrate}% WR</span>
          </div>
          <div class="lol-meta-stats">
            <div class="lol-meta"><span class="lol-meta-val">${lol.championsPlayed || 0}</span><span class="lol-meta-label">Champs</span></div>
            <div class="lol-meta"><span class="lol-meta-val">${lol.masteryScore || 0}</span><span class="lol-meta-label">Mastery</span></div>
            <div class="lol-meta"><span class="lol-meta-val">${totalPoints}</span><span class="lol-meta-label">Points</span></div>
          </div>
        </div>`;
    } else {
      const recentWins = lol.recentMatches ? lol.recentMatches.filter(m => m.win).length : 0;
      const recentTotal = lol.recentMatches ? lol.recentMatches.length : 0;
      const recentWR = recentTotal > 0 ? ((recentWins / recentTotal) * 100).toFixed(0) : 0;
      html += `
        <div class="game-card glass tilt reveal">
          <div class="game-card-header">
            <div class="game-card-icon lol-icon">LoL</div>
            <div class="game-card-titles">
              <h4>League of Legends</h4>
              <span class="game-card-sub">Level ${lol.summonerLevel}</span>
            </div>
          </div>
          <div class="lol-overview-stats">
            <div class="lol-overview-stat">
              <span class="lol-overview-val">${lol.championsPlayed || 0}</span>
              <span class="lol-overview-label">Champions</span>
            </div>
            <div class="lol-overview-stat">
              <span class="lol-overview-val">${lol.masteryScore || 0}</span>
              <span class="lol-overview-label">Mastery</span>
            </div>
            <div class="lol-overview-stat">
              <span class="lol-overview-val">${totalPoints}</span>
              <span class="lol-overview-label">Total Points</span>
            </div>
          </div>
          <div class="lol-recent-record">
            <span class="stat-win">${recentWins}W</span>
            <span class="stat-loss">${recentTotal - recentWins}L</span>
            <span class="lol-recent-wr">${recentWR}% WR</span>
            <span class="lol-recent-label">last ${recentTotal} games</span>
          </div>
        </div>`;
    }

    if (lol.topChampions && lol.topChampions.length > 0) {
      html += `<div class="game-card glass tilt reveal">
        <div class="game-card-header">
          <div class="game-card-icon champ-icon">✦</div>
          <div class="game-card-titles">
            <h4>Top Champions</h4>
            <span class="game-card-sub">By mastery</span>
          </div>
        </div>
        <div class="champion-list">`;
      lol.topChampions.forEach(c => {
        const champName = CHAMPION_NAMES[c.championId] || `Champ ${c.championId}`;
        const pointsK = (c.points / 1000).toFixed(0) + 'k';
        html += `
          <div class="champion-row">
            <img class="champion-img" src="${getChampionImageUrl(c.championId)}" alt="${champName}" loading="lazy">
            <span class="champion-name">${champName}</span>
            <span class="champion-mastery">M${c.level}</span>
            <span class="champion-points">${pointsK}</span>
          </div>`;
      });
      html += `</div></div>`;
    }

    if (lol.recentMatches && lol.recentMatches.length > 0) {
      const wins = lol.recentMatches.filter(m => m.win).length;
      const losses = lol.recentMatches.length - wins;
      const avgKills = (lol.recentMatches.reduce((s, m) => s + m.kills, 0) / lol.recentMatches.length).toFixed(1);
      const avgDeaths = (lol.recentMatches.reduce((s, m) => s + m.deaths, 0) / lol.recentMatches.length).toFixed(1);
      const avgAssists = (lol.recentMatches.reduce((s, m) => s + m.assists, 0) / lol.recentMatches.length).toFixed(1);
      html += `<div class="game-card glass tilt reveal">
        <div class="game-card-header">
          <div class="game-card-icon match-icon">⚔</div>
          <div class="game-card-titles">
            <h4>Recent Matches</h4>
            <span class="game-card-sub">Last ${lol.recentMatches.length} games</span>
          </div>
        </div>
        <div class="match-summary">
          <div class="match-summary-record">
            <span class="stat-win">${wins}W</span>
            <span class="stat-loss">${losses}L</span>
          </div>
          <div class="match-summary-kda">
            <span class="match-summary-val">${avgKills} / ${avgDeaths} / ${avgAssists}</span>
            <span class="match-summary-label">AVG KDA</span>
          </div>
        </div>
        <div class="match-list">`;
      lol.recentMatches.forEach(m => {
        const kda = `${m.kills}/${m.deaths}/${m.assists}`;
        html += `
          <div class="match-row ${m.win ? 'win' : 'loss'}">
            <img class="match-champ-img" src="${getChampionImageUrl(m.champion)}" alt="${m.champion}" loading="lazy">
            <span class="match-champ">${m.champion}</span>
            <span class="match-kda">${kda}</span>
            <span class="match-result">${m.win ? 'WIN' : 'LOSS'}</span>
          </div>`;
      });
      html += `</div></div>`;
    }
  }

  // Valorant (static — no public API)
  html += `
    <div class="game-card glass tilt reveal">
      <div class="game-card-header">
        <div class="game-card-icon val-icon">VAL</div>
        <div class="game-card-titles">
          <h4>Valorant</h4>
          <span class="game-card-sub">Cyxh#thao</span>
        </div>
      </div>
      <div class="game-card-rank">
        <span class="rank-tier">Ascendant 2</span>
        <span class="rank-lp">PEAK</span>
      </div>
    </div>`;

  container.innerHTML = html || '<div class="spotify-empty">((( no riot data available )))</div>';
  initTilt(container);
  revealScan(container);
}

function renderSteamData(steam) {
  const container = $('#steam-cards');
  const badge = $('#steam-badge');
  if (!container) return;

  if (!steam || !steam.profile) {
    container.innerHTML = '<div class="spotify-empty">((( could not load steam data )))</div>';
    return;
  }

  if (badge) {
    badge.textContent = steam.profile.status;
    badge.classList.add('active');
    if (steam.profile.status === 'Online') badge.classList.add('live');
  }

  const allGames = [];
  if (steam.recentGames) {
    steam.recentGames.forEach(g => allGames.push({ ...g, isRecent: true }));
  }
  if (steam.topGames) {
    const recentIds = new Set((steam.recentGames || []).map(g => g.appid));
    steam.topGames.filter(g => !recentIds.has(g.appid)).forEach(g => allGames.push(g));
  }

  const totalHours = steam.totalPlaytime ? Math.floor(steam.totalPlaytime / 60) : 0;

  let html = `
    <a class="game-card glass tilt reveal" href="${steam.profile.profileUrl}" target="_blank" rel="noopener">
      <div class="game-card-header">
        <img class="game-card-icon steam-avatar" src="${steam.profile.avatar}" alt="${steam.profile.name}">
        <div class="game-card-titles">
          <h4>${steam.profile.name}</h4>
          <span class="game-card-sub">${steam.profile.status}</span>
        </div>
      </div>
      <div class="steam-profile-stats">
        <div class="steam-profile-stat">
          <span class="steam-profile-val">${steam.ownedCount}</span>
          <span class="steam-profile-label">Games</span>
        </div>
        <div class="steam-profile-stat">
          <span class="steam-profile-val">${totalHours.toLocaleString()}</span>
          <span class="steam-profile-label">Hours</span>
        </div>
      </div>
    </a>`;

  allGames.slice(0, 7).forEach(g => {
    const recent = g.isRecent ? formatPlaytime(g.playtime2Weeks || 0) : null;
    const total = formatPlaytime(g.playtimeForever || 0);
    html += `
      <div class="game-card glass tilt steam-game-card reveal">
        <img class="steam-game-header" src="${g.header}" alt="${g.name}" loading="lazy">
        <div class="steam-game-info">
          <h4>${g.name}</h4>
          <div class="steam-game-time">
            ${recent ? `<span>${recent} recent</span>` : ''}
            <span class="steam-total">${total} total</span>
          </div>
        </div>
      </div>`;
  });

  container.innerHTML = html;
  initTilt(container);
  revealScan(container);
}

async function initLiveData() {
  await loadChampionData();
  const [spotifyData, youtubeVideos, gamingData] = await Promise.all([
    fetchSpotifyTracks(),
    fetchYouTubeVideos(),
    fetchGamingData(),
  ]);
  renderPlaylistTracks(spotifyData.playlist);
  renderSpotifyTracks(spotifyData.tracks);
  renderYouTubeVideos(youtubeVideos);
  if (gamingData) {
    renderRiotData(gamingData.riot);
    renderSteamData(gamingData.steam);
  } else {
    renderRiotData(null);
    renderSteamData(null);
  }
  buildDialTicks(); // content changed the page height
}

// ------------------------------------------------------------
// TILT — gentle 3D lean on glass cards
// ------------------------------------------------------------
function initTilt(scope) {
  if (isCoarse) return;
  $$('.tilt', scope || document).forEach(el => {
    if (el.dataset.tiltInit) return;
    el.dataset.tiltInit = '1';

    el.addEventListener('mousemove', (e) => {
      if (prefersStill) return;
      const r = el.getBoundingClientRect();
      const rx = (0.5 - (e.clientY - r.top) / r.height) * 4.5;
      const ry = ((e.clientX - r.left) / r.width - 0.5) * 4.5;
      el.style.transition = 'transform .16s ease-out';
      el.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(-3px)`;
    });
    el.addEventListener('mouseleave', () => {
      el.style.transition = 'transform .7s var(--ease)';
      el.style.transform = '';
      setTimeout(() => { el.style.transition = ''; }, 720);
    });
  });
}

// ------------------------------------------------------------
// COPY TO CLIPBOARD
// ------------------------------------------------------------
function initCopy() {
  $$('[data-copy]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = el.dataset.copy;
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          () => toast('((( copied )))'),
          () => toast('((( copy failed )))')
        );
      } else {
        toast('((( clipboard unavailable )))');
      }
    });
  });
}

// ------------------------------------------------------------
// KONAMI — after hours mode
// ------------------------------------------------------------
function initKonami() {
  const seq = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let idx = 0;
  document.addEventListener('keydown', (e) => {
    if (e.key === seq[idx]) {
      idx++;
      if (idx === seq.length) {
        idx = 0;
        hyperMode = !hyperMode;
        document.body.classList.toggle('hyper', hyperMode);
        if (!hyperMode) { orb.hyperHue = 0; orb.palette = buildOrbPalette(); }
        toast(hyperMode ? '((( after hours )))' : '((( back to calm )))');
      }
    } else {
      idx = e.key === seq[0] ? 1 : 0;
    }
  });
}

// ------------------------------------------------------------
// SCROLL THEATRE — smooth wheel, lens reveals, drifting shapes
// ------------------------------------------------------------
let waveEnergy = 0;
let lastTheatreS = 0;
let vhCache = window.innerHeight;
window.addEventListener('resize', () => { vhCache = window.innerHeight; });

// --- scrolling: wheel stays fully NATIVE (zero added latency);
//     click + drag anywhere empty scrubs the page like a reel ---
function initDragScroll() {
  if (isCoarse) return;
  const IGNORE = 'a, button, input, textarea, select, .drift-row, .skill-row, .dial-rail, .tuner';
  let active = false, engaged = false, swallow = false;
  let lastY = 0, lastT = 0, vel = 0, momId = null;

  const stopMom = () => { if (momId) { cancelAnimationFrame(momId); momId = null; } };
  const mom = () => {
    if (Math.abs(vel) < 0.6) { momId = null; return; }
    window.scrollBy(0, vel);
    vel *= 0.95;
    momId = requestAnimationFrame(mom);
  };

  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest && e.target.closest(IGNORE)) return;
    active = true;
    engaged = false;
    lastY = e.clientY;
    lastT = performance.now();
    vel = 0;
    stopMom();
  });
  window.addEventListener('mousemove', (e) => {
    if (!active) return;
    const dy = e.clientY - lastY;
    if (!engaged) {
      if (Math.abs(dy) < 5) return;
      engaged = true;
      document.body.classList.add('drag-scrolling');
    }
    window.scrollBy(0, -dy);
    const now = performance.now(), dt = now - lastT;
    if (dt > 0) vel = -dy / Math.max(dt, 8) * 16;
    lastY = e.clientY;
    lastT = now;
    e.preventDefault();
  }, { passive: false });
  window.addEventListener('mouseup', () => {
    if (!active) return;
    active = false;
    if (engaged) {
      swallow = true;
      engaged = false;
      document.body.classList.remove('drag-scrolling');
      if (!prefersStill) mom();
    }
  });
  window.addEventListener('click', (e) => {
    if (swallow) { swallow = false; e.preventDefault(); e.stopPropagation(); }
  }, true);
}

// --- split section titles into outline + lens-revealed chrome ---
function enhanceTitles() {
  $$('.sec-title').forEach(h => {
    if (h.dataset.lens) return;
    h.dataset.lens = '1';
    const text = h.textContent.trim();
    h.classList.remove('chrome');
    h.textContent = '';
    const base = document.createElement('span');
    base.className = 'st-base';
    base.textContent = text;
    const chromeL = document.createElement('span');
    chromeL.className = 'st-chrome chrome';
    chromeL.textContent = text;
    chromeL.setAttribute('aria-hidden', 'true');
    h.append(base, chromeL);
  });
  const ct = $('.contact-title');
  if (ct) ct.classList.add('chrome-scrub');
}

// --- floating decor: aurora orbs, halo rings, stars, light streaks ---
// [kind, color, size, x, y, depth, extra]
const SHAPE_CONF = {
  hero:      [['orb', 'a', 680, '50%', '10%', .1], ['streak', 'b', 560, '10%', '18%', .2], ['ring', 'c', 260, '78%', '14%', .32], ['star', 'b', 18, '14%', '62%', .5], ['star', 'c', 14, '84%', '68%', .55]],
  about:     [['orb', 'a', 520, '70%', '-10%', .18, 'ringed'], ['orb', 'c', 340, '-6%', '58%', .34], ['ring', 'b', 300, '84%', '66%', .46], ['streak', 'b', 520, '6%', '14%', .26], ['star', 'c', 22, '26%', '30%', .5], ['star', 'a', 15, '62%', '80%', .62]],
  academics: [['orb', 'b', 560, '-12%', '-8%', .2], ['ring', 'a', 260, '80%', '58%', .42], ['orb', 'a', 300, '86%', '72%', .34], ['star', 'b', 18, '68%', '18%', .55], ['star', 'd', 13, '10%', '74%', .6]],
  projects:  [['orb', 'c', 480, '84%', '-12%', .22, 'ringed'], ['ring', 'b', 340, '-8%', '68%', .38], ['star', 'a', 20, '12%', '22%', .5], ['star', 'c', 14, '88%', '46%', .6]],
  skills:    [['orb', 'a', 520, '76%', '4%', .16], ['streak', 'c', 480, '-4%', '68%', .3], ['orb', 'd', 260, '4%', '82%', .44], ['star', 'b', 18, '8%', '28%', .52]],
  fun:       [['orb', 'b', 500, '-10%', '2%', .24, 'ringed'], ['ring', 'c', 300, '86%', '52%', .4], ['star', 'b', 16, '42%', '10%', .58], ['star', 'd', 20, '82%', '82%', .48]],
  contact:   [['orb', 'a', 620, '30%', '2%', .15], ['ring', 'd', 380, '8%', '56%', .34], ['streak', 'a', 560, '28%', '80%', .22], ['star', 'c', 18, '20%', '26%', .55], ['star', 'b', 13, '78%', '38%', .6]],
};

// canvas-drawn geometry (dot matrices, wire meshes, horizon planes):
// DOM versions of these overwhelmed the rasterizer deep in the page,
// so they live on the star-field canvas instead — one proven layer.
const GEO_CONF = [
  { id: 'hero',      kind: 'plane' },
  { id: 'contact',   kind: 'plane' },
  { id: 'about',     kind: 'dots', x: .72, y: .02, w: 440, h: 310, c: 1, rot: -.09, depth: .3 },
  { id: 'academics', kind: 'mesh', x: .01, y: .2,  w: 480, h: 350, c: 0, rot: .07,  depth: .16 },
  { id: 'projects',  kind: 'dots', x: .03, y: .0,  w: 430, h: 300, c: 0, rot: .05,  depth: .26 },
  { id: 'skills',    kind: 'mesh', x: .6,  y: .48, w: 470, h: 340, c: 1, rot: -.06, depth: .34 },
  { id: 'fun',       kind: 'dots', x: .05, y: .58, w: 420, h: 300, c: 2, rot: .08,  depth: .14 },
  { id: 'contact',   kind: 'mesh', x: .6,  y: .18, w: 470, h: 330, c: 0, rot: -.07, depth: .22 },
];
let geoScenes = null;

function initDecor() {
  scenes.forEach(scene => {
    const conf = SHAPE_CONF[scene.id];
    if (!conf) return;
    const wrap = document.createElement('div');
    wrap.className = 'drift-shapes';
    wrap.setAttribute('aria-hidden', 'true');
    conf.forEach(([kind, c, s, x, y, d, extra], i) => {
      const el = document.createElement('div');
      el.className = `shape ${kind} shape-${c}` + (extra === 'ringed' ? ' ringed' : '');
      if (kind === 'streak') {
        el.style.width = s * 2.3 + 'px';
        el.style.height = Math.max(24, s * 0.16) + 'px';
        el.dataset.rot = (Math.random() < 0.5 ? -1 : 1) * (12 + Math.random() * 8);
        el.innerHTML = '<i class="glint"></i>';
      } else if (kind === 'star') {
        el.style.width = el.style.height = s * 2 + 'px';
        el.style.fontSize = s + 'px';
        el.innerHTML = `<span class="tw">${['✦', '✧', '·'][i % 3]}</span>`;
      } else {
        el.style.width = s + 'px';
        el.style.height = s + 'px';
      }
      el.style.left = x;
      el.style.top = y;
      el.style.setProperty('--si', i);
      el.dataset.depth = d;
      wrap.appendChild(el);
    });
    scene.appendChild(wrap);
  });

  // shapes fade in softly the first time their section drifts into view
  const shapeIO = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add('on');
        shapeIO.unobserve(en.target);
      }
    });
  }, { threshold: 0.12 });
  $$('.drift-shapes').forEach(w => shapeIO.observe(w));

  // ascii mini-equalizers beside each section header (safe gutter space)
  $$('.sec-head').forEach(h => {
    const orn = document.createElement('div');
    orn.className = 'sec-orn mono';
    orn.setAttribute('aria-hidden', 'true');
    orn.textContent = '▂▄▂▅▃▄▂▃';
    h.appendChild(orn);
  });

  // signal tape running down the left margin (desktop)
  const tape = document.createElement('pre');
  tape.id = 'side-tape';
  tape.setAttribute('aria-hidden', 'true');
  tape.textContent = Array.from({ length: 24 }, () => '·').join('\n');
  document.body.appendChild(tape);

  // procedural ascii fields — animated character panels tucked into
  // safe corners (behind content, over nothing that matters)
  ASCII_FIELDS.forEach(f => {
    const scene = document.getElementById(f.id);
    if (!scene) return;
    const pre = document.createElement('pre');
    pre.className = 'ascii-decor mono';
    pre.setAttribute('aria-hidden', 'true');
    Object.assign(pre.style, f.style);
    if (f.color) pre.style.color = `var(${f.color})`;
    scene.insertBefore(pre, scene.firstChild ? scene.firstChild.nextSibling : null);
    f.el = pre;
    f.phase = (f.id.length * 3.7) % 12;
    f.visible = false;
    new IntersectionObserver(en => { f.visible = en[0].isIntersecting; }).observe(pre);
    renderAsciiField(f);
  });
  setInterval(() => {
    if (document.hidden || prefersStill) return;
    ASCII_FIELDS.forEach(f => {
      if (!f.el || !f.visible) return;
      f.phase += 0.14;
      renderAsciiField(f);
    });
  }, 150);
}

// animated ascii panels: interference (standing waves), flow (streaming),
// columns (equalizer bars), pulse (expanding transmission rings)
const ASCII_FIELDS = [
  { id: 'academics', kind: 'interference', cols: 54, rows: 12, color: '--glow-b', style: { left: '3%', bottom: '26px', fontSize: '11px' } },
  { id: 'about',     kind: 'flow',         cols: 44, rows: 9,  color: '--glow-c', style: { right: '2%', bottom: '18px', fontSize: '11px' } },
  { id: 'projects',  kind: 'flow',         cols: 48, rows: 10, color: '--glow-a', style: { left: '3%', bottom: '14px', fontSize: '11px' } },
  { id: 'skills',    kind: 'columns',      cols: 42, rows: 9,  color: '--glow-b', style: { right: '3%', bottom: '24px', fontSize: '11px' } },
  { id: 'fun',       kind: 'columns',      cols: 38, rows: 8,  color: '--glow-c', style: { right: '3%', top: '110px', fontSize: '11px' } },
  { id: 'contact',   kind: 'pulse',        cols: 58, rows: 14, color: '--glow-a', style: { left: '50%', bottom: '4px', transform: 'translateX(-50%)', fontSize: '10px' } },
];

function renderAsciiField(f) {
  const { cols, rows, kind } = f;
  const p = f.phase || 0;
  let out = '';
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let ch = ' ';
      if (kind === 'interference') {
        const v = Math.sin(x * 0.52 + p) + Math.sin(y * 0.74 - p * 0.7) + Math.sin((x * 0.3 + y * 0.42) + p * 0.45);
        ch = ' ·:≡#'[clamp(Math.round((v + 3) / 6 * 4), 0, 4)];
      } else if (kind === 'flow') {
        const v = Math.sin(x * 0.34 - p * 2.2 + Math.sin(y * 0.9) * 1.4) + Math.sin(x * 0.11 - p * 1.05 + y * 0.35);
        ch = ' ··-=≡'[clamp(Math.round((v + 2) / 4 * 5), 0, 5)];
      } else if (kind === 'columns') {
        const lvl = (Math.sin(x * 0.72 + p * 1.4) + Math.sin(x * 0.31 - p * 0.9) + 2) / 4 * rows;
        const fromBottom = rows - 1 - y;
        if (fromBottom < lvl) {
          ch = fromBottom > lvl - 1.2 ? '░' : fromBottom > lvl - 3 ? '▒' : '▓';
        }
      } else if (kind === 'pulse') {
        const dx = (x - cols / 2) * 0.55, dy = y - rows / 2;
        const d = Math.sqrt(dx * dx + dy * dy);
        const v = Math.sin(d * 0.95 - p * 2.1) - d * 0.12;
        ch = ' ·:≡#'[clamp(Math.round((v + 2.2) / 3.2 * 4), 0, 4)];
      }
      out += ch;
    }
    if (y < rows - 1) out += '\n';
  }
  f.el.textContent = out;
}

// --- cached refs for per-frame work (no per-frame querySelectorAll) ---
const heroRefs = {};
let theatreScenes = [];
let contactRings = null, contactTitle = null;
let videoRowEl = null, videoRowHover = false, videoRowInView = false, videoDrift = 0.34;

function cacheTheatreRefs() {
  heroRefs.hn1 = $('.hn1');
  heroRefs.hn2 = $('.hn2');
  heroRefs.orb = $('#orb-canvas');
  heroRefs.soft = [$('.hero-kicker'), $('.hero-sub'), $('.hero-stats')].filter(Boolean);
  heroRefs.cue = $('.hero-cue'); // keeps its own translateX(-50%) — fade only
  contactRings = $('.tx-rings');
  contactTitle = $('.contact-title');
  theatreScenes = scenes.map(sc => {
    const chromeL = $('.st-chrome', sc);
    return {
      el: sc,
      shapes: $$('.shape', sc).map(sh => ({
        el: sh,
        d: parseFloat(sh.dataset.depth || '.3'),
        rot: parseFloat(sh.dataset.rot || '0'),
        // organic wander: two incommensurate sines per axis, seeded randomly
        w1: 0.18 + Math.random() * 0.22,
        w2: 0.31 + Math.random() * 0.3,
        a1: 9 + Math.random() * 11,
        a2: 5 + Math.random() * 8,
        wx: 0.14 + Math.random() * 0.2,
        ax: 7 + Math.random() * 12,
        p1: Math.random() * 6.28,
        p2: Math.random() * 6.28,
        p3: Math.random() * 6.28,
      })),
      ghost: $('.sec-ghost', sc),
      chrome: chromeL,
      title: chromeL ? chromeL.parentElement : null,
      lastCenter: 1e9,
      lastP: -1,
    };
  });
  videoRowEl = $('#video-row');
  if (videoRowEl) {
    videoRowEl.addEventListener('mouseenter', () => { videoRowHover = true; });
    videoRowEl.addEventListener('mouseleave', () => { videoRowHover = false; });
    new IntersectionObserver(en => { videoRowInView = en[0].isIntersecting; }).observe(videoRowEl);
  }
}

// --- the per-frame choreography ---
function scrollTheatre(S, t, slow) {
  if (prefersStill) return;
  const vh = vhCache;

  // scroll velocity feeds the wave dividers
  const vel = Math.abs(S - lastTheatreS);
  lastTheatreS = S;
  waveEnergy += (Math.min(1, vel / 26) - waveEnergy) * 0.07;

  // hero splits apart and dissolves as you tune away.
  // engage only once actually scrolled — inline styles would otherwise
  // override the entrance reveal transition at rest.
  if (S < vh * 1.2 && heroRefs.hn1) {
    const hp = clamp(S / (vh * 0.85), 0, 1);
    if (hp <= 0.004) {
      if (scrollTheatre._heroFx) {
        scrollTheatre._heroFx = false;
        [heroRefs.hn1, heroRefs.hn2, heroRefs.orb, heroRefs.cue, ...heroRefs.soft].forEach(el => {
          if (el) { el.style.transform = ''; el.style.opacity = ''; }
        });
      }
      return;
    }
    scrollTheatre._heroFx = true;
    const e = hp * hp;
    heroRefs.hn1.style.transform = `translate3d(${(-e * 150).toFixed(1)}px, ${(-e * 40).toFixed(1)}px, 0) rotate(${(-e * 2.2).toFixed(2)}deg)`;
    heroRefs.hn2.style.transform = `translate3d(${(e * 170).toFixed(1)}px, ${(-e * 22).toFixed(1)}px, 0) rotate(${(e * 2).toFixed(2)}deg)`;
    heroRefs.hn1.style.opacity = heroRefs.hn2.style.opacity = String(clamp(1 - hp * 1.15, 0, 1));
    heroRefs.orb.style.transform = `translate(-50%, -50%) translateY(${(-e * 60).toFixed(1)}px) scale(${(1 - e * 0.16).toFixed(3)})`;
    heroRefs.orb.style.opacity = String(clamp(1 - hp, 0, 1));
    heroRefs.soft.forEach(el => {
      el.style.opacity = String(clamp(1 - hp * 1.6, 0, 1));
      el.style.transform = `translateY(${(-e * 70).toFixed(1)}px)`;
    });
    if (heroRefs.cue) heroRefs.cue.style.opacity = String(clamp(1 - hp * 2.2, 0, 1));
  }

  // ---- read phase (all rects first: no interleaved layout thrash) ----
  // instant section index, NOT the smoothed one — during fast scrolling the
  // smoothed index lags, decor of the arriving section goes stale, then
  // visibly snaps into place once the index catches up
  const ci = clamp(Math.round(scrollDialIndex()), 0, theatreScenes.length - 1);
  const jobs = [];
  for (let k = Math.max(0, ci - 1); k <= Math.min(theatreScenes.length - 1, ci + 2); k++) {
    const ts = theatreScenes[k];
    const rect = ts.el.getBoundingClientRect();
    if (rect.bottom < -100 || rect.top > vh + 100) continue;
    jobs.push({ ts, rect, titleRect: ts.chrome ? ts.title.getBoundingClientRect() : null });
  }
  let ringsRect = null, ctRect = null;
  if (contactRings) {
    const r = contactRings.getBoundingClientRect();
    if (r.top < vh && r.bottom > 0) ringsRect = r;
  }
  if (contactTitle) {
    const r = contactTitle.getBoundingClientRect();
    if (r.top < vh && r.bottom > 0) ctRect = r;
  }

  // ---- write phase ----
  for (const { ts, rect, titleRect } of jobs) {
    const centerOff = (rect.top + rect.height / 2) - vh / 2;

    ts.shapes.forEach(sp => {
      const wanderY = Math.sin(t * sp.w1 + sp.p1) * sp.a1 + Math.sin(t * sp.w2 + sp.p2) * sp.a2;
      const wanderX = Math.sin(t * sp.wx + sp.p3) * sp.ax;
      sp.el.style.transform =
        `translate3d(${wanderX.toFixed(1)}px, ${(-centerOff * sp.d * 0.62 + wanderY).toFixed(1)}px, 0)` +
        (sp.rot ? ` rotate(${sp.rot}deg)` : '');
    });

    if (ts.ghost) {
      ts.ghost.style.transform = `translate3d(0, ${(centerOff * 0.2).toFixed(1)}px, 0)`;
    }

    if (titleRect) {
      const p = clamp(1 - (titleRect.top - vh * 0.1) / (vh * 0.62), 0, 1);
      if (Math.abs(p - ts.lastP) > 0.003) {   // skip repaints when parked
        ts.lastP = p;
        const tw = Math.max(1, titleRect.width);
        ts.chrome.style.setProperty('--lx', `${(-12 + p * 128).toFixed(1)}%`);
        ts.chrome.style.setProperty('--lr', `${(tw * (0.12 + p * p * 1.7)).toFixed(0)}px`);
        ts.chrome.style.backgroundPosition = `0% ${(8 + p * 74).toFixed(1)}%`;
      }
    }
  }

  if (ringsRect) {
    const p = clamp(1 - (ringsRect.top - vh * 0.08) / (vh * 0.7), 0, 1);
    if (Math.abs(p - (scrollTheatre._ringsP ?? -1)) > 0.004) {
      scrollTheatre._ringsP = p;
      contactRings.style.transform = `scale(${(0.82 + p * 0.18).toFixed(3)})`;
      contactRings.style.opacity = String(0.35 + p * 0.65);
    }
  }
  if (ctRect) {
    const p = clamp(1 - ctRect.top / vh, 0, 1);
    if (Math.abs(p - (scrollTheatre._ctP ?? -1)) > 0.004) {
      scrollTheatre._ctP = p;
      contactTitle.style.backgroundPosition = `0% ${(p * 80).toFixed(1)}%`;
    }
  }

  // the video reel drifts on its own like a late-night channel crawl
  if (slow && videoRowEl && videoRowInView && !videoRowHover && !videoRowEl.classList.contains('dragging')) {
    const maxScroll = videoRowEl.scrollWidth - videoRowEl.clientWidth;
    if (maxScroll > 4) {
      videoRowEl.scrollLeft += videoDrift * 2; // half-rate tick, double step
      if (videoRowEl.scrollLeft <= 0 || videoRowEl.scrollLeft >= maxScroll - 1) videoDrift = -videoDrift;
    }
  }
}

// return the stage to rest when motion turns off
function resetScrollFX() {
  const clear = el => { if (el) { el.style.transform = ''; el.style.opacity = ''; } };
  clear(heroRefs.hn1); clear(heroRefs.hn2); clear(heroRefs.orb); clear(heroRefs.cue);
  (heroRefs.soft || []).forEach(clear);
  $$('.shape, .sec-ghost').forEach(el => { el.style.transform = ''; });
  clear(contactRings);
  $$('.st-chrome').forEach(el => {
    el.style.removeProperty('--lx');
    el.style.removeProperty('--lr');
    el.style.backgroundPosition = '';
  });
  if (contactTitle) contactTitle.style.backgroundPosition = '';
}

// --- cursor spotlight inside glass cards ---
function initSpotlight() {
  if (isCoarse) return;
  document.addEventListener('pointermove', (e) => {
    const g = e.target && e.target.closest ? e.target.closest('.glass') : null;
    if (!g) return;
    const r = g.getBoundingClientRect();
    g.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
    g.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
  }, { passive: true });
}

// --- frequency readout static burst on section change ---
let scrambleTicks = 0;
const SCRAMBLE_CHARS = '░▒▓01894·';
function scrambledFreq() {
  let s = '';
  for (let i = 0; i < 5; i++) s += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
  return `FM ${s.slice(0, 3)}.${s.slice(3, 4)}`;
}

// ------------------------------------------------------------
// TAB TITLE — still broadcasting
// ------------------------------------------------------------
function initTitleWhisper() {
  const original = document.title;
  document.addEventListener('visibilitychange', () => {
    document.title = document.hidden ? '((( still broadcasting )))' : original;
  });
}

// ------------------------------------------------------------
// BOOT
// ------------------------------------------------------------
function startSite() {
  if (siteStarted) return;
  siteStarted = true;
  document.body.classList.add('arrived');

  enhanceTitles();
  initDecor();
  cacheTheatreRefs();
  initDragScroll();
  initSpotlight();
  initField();
  document.addEventListener('motionchange', (e) => { if (!e.detail) resetScrollFX(); });

  initOrb();
  initNav();
  initReveals();
  initTyped();
  initCountUp();
  initLogReveal();
  initMeters();
  initWaves();
  initTilt(document);
  initCopy();
  initKonami();
  initTitleWhisper();
  buildDialTicks();
  $$('.drift-row').forEach(initDriftRow);

  if (!mainLoopStarted) {
    mainLoopStarted = true;
    requestAnimationFrame(mainLoop);
  }

  initLiveData();

  // if the system preference put us in calm mode, say so once — otherwise
  // the whole show silently stays parked and looks broken
  if (prefersStill && !safeStore('local', 'rj-motion')) {
    setTimeout(() => toast('((( calm mode — press [ M ] for full motion )))', 5200), 1400);
  }

  window.addEventListener('resize', () => {
    clearTimeout(startSite._rz);
    startSite._rz = setTimeout(buildDialTicks, 250);
  });
}

initIntro();
