import { Tin } from './tin.js';
import { MapView, pickLocation } from './map.js';
import { openCrop } from './crop.js';
import { openConfirm, openSpec, toast, $ } from './ui.js';
import { extractPalette } from './palette.js';
import { makeDemo } from './demo.js';
import { photoLocation, currentLocation, dongOf } from './geo.js';
import { newId, newSeed } from './rand.js';
import * as store from './store.js';

const DEFAULT_TIN = '우리 동네'; // 동네를 알 수 없는 조각이 모이는 틴

const pieces = []; // 모든 조각
const images = new Map(); // piece.id → 그릴 수 있는 이미지
let tins = {}; // id → { label, since }
let current = null; // 열려 있는 틴 id (지도 화면이면 null)

const tin = new Tin($('#tin'), {
  onTap: (piece, img) => showSpec(piece, img),
  onMove: () => schedulePositions(),
});
tin.paused = true;

const map = new MapView($('#map'), {
  onTin: (id) => enterTin(id),
  onPiece: (piece, img) => showSpec(piece, img),
});

const tinPieces = (id) => pieces.filter((p) => p.tin === id);

function showSpec(piece, img) {
  openSpec(piece, img, tinPieces(piece.tin).indexOf(piece) + 1, { onChange: savePiece, onDelete: removePiece });
}

// ---------- 불러오기 ----------

async function boot() {
  tins = (await store.getMeta('tins')) || {};
  // v1 프로토타입 데이터 이전: 틴이 하나뿐이던 시절의 이름과 배치
  const oldLabel = await store.getMeta('label');
  if (oldLabel && !tins[DEFAULT_TIN]) {
    tins[DEFAULT_TIN] = { label: oldLabel, since: (await store.getMeta('since')) || Date.now() };
    const oldPos = await store.getMeta('positions');
    if (oldPos) await store.setMeta(`positions:${DEFAULT_TIN}`, oldPos);
  }

  for (const piece of await store.allPieces()) {
    try {
      images.set(piece.id, await createImageBitmap(piece.photo));
      piece.tin ??= DEFAULT_TIN;
      ensureTin(piece.tin, piece.createdAt);
      pieces.push(piece);
    } catch (err) {
      console.warn('조각을 불러오지 못했어요', piece.id, err);
    }
  }
  store.setMeta('tins', tins);

  if (!(await map.ready)) $('#map-empty').hidden = false;
  renderMap();
  map.fit(pieces.filter((p) => p.loc).map((p) => p.loc));
  if (!(await store.isPersistent())) toast('이 브라우저에서는 저장이 안 돼요. 새로고침하면 사라져요.', 4000);
}

function ensureTin(id, since = Date.now()) {
  if (!tins[id]) {
    tins[id] = { label: id, since };
    return true;
  }
  return false;
}

// ---------- 지도 ----------

function tinSummaries() {
  return Object.entries(tins)
    .map(([id, t]) => {
      const list = tinPieces(id);
      const located = list.filter((p) => p.loc);
      const loc = located.length
        ? {
            lat: located.reduce((s, p) => s + p.loc.lat, 0) / located.length,
            lng: located.reduce((s, p) => s + p.loc.lng, 0) / located.length,
          }
        : null;
      return { id, label: t.label, count: list.length, loc, since: t.since };
    })
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);
}

function renderMap() {
  const summaries = tinSummaries();
  map.render(summaries, pieces.map((p) => ({ piece: p, img: images.get(p.id) })));
  $('#map-total').textContent = pieces.length ? `틴 ${summaries.length}개 · 조각 ${pieces.length}개` : '첫 가게를 담아보세요';

  const strip = $('#tin-strip');
  strip.replaceChildren(
    ...summaries.map((t) => {
      const b = document.createElement('button');
      b.className = 'strip-tin';
      b.innerHTML = '<span class="strip-can"></span><span class="strip-label"></span><b></b>';
      b.querySelector('.strip-label').textContent = t.label;
      b.querySelector('b').textContent = t.count;
      b.addEventListener('click', () => enterTin(t.id));
      return b;
    })
  );
  strip.hidden = summaries.length === 0;
}

function showMap() {
  if (current) savePositions();
  current = null;
  tin.paused = true;
  document.body.classList.remove('open');
  $('#map-screen').hidden = false;
  renderMap();
  map.relayout();
}

$('#locate-btn').addEventListener('click', async () => {
  if (!map.available) return toast('지도를 불러오지 못했어요');
  if (!(await map.locate())) toast('위치 권한을 허용해주세요');
});

// ---------- 틴 ----------

async function enterTin(id, { open = false } = {}) {
  if (current) savePositions();
  current = id;
  const meta = tins[id];
  setLabel(meta.label);
  const d = new Date(meta.since);
  $('#label-date').textContent = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')} ~`;

  tin.clear();
  const positions = (await store.getMeta(`positions:${id}`)) || {};
  for (const piece of tinPieces(id)) tin.addPiece(piece, images.get(piece.id), { pos: positions[piece.id] ?? null });

  const lid = $('#lid');
  lid.classList.remove('opening', 'closing');
  lid.hidden = open;
  document.body.classList.toggle('open', open);
  $('#map-screen').hidden = true;
  tin.paused = false;
  updateCount();
}

function setLabel(text) {
  $('#label-input').value = text;
  $('#chip-label').textContent = text;
}

function updateCount() {
  const n = current ? tinPieces(current).length : 0;
  $('#chip-count').textContent = n;
  $('#lid-count').textContent = n ? `조각 ${n}개가 들어 있어요` : '아직 비어 있어요';
  $('#empty-hint').hidden = n > 0 || !document.body.classList.contains('open');
}

$('#tin-chip').addEventListener('click', showMap);
$('#lid-back').addEventListener('click', showMap);

$('#label-input').addEventListener('change', (e) => {
  const text = e.target.value.trim() || current;
  setLabel(text);
  tins[current].label = text;
  store.setMeta('tins', tins);
});
$('#label-input').addEventListener('keydown', (e) => e.key === 'Enter' && e.target.blur());

$('#open-btn').addEventListener('click', () => {
  const tilt = enableTilt(); // iOS 권한 요청은 탭 직후에 바로 불러야 한다
  const lid = $('#lid');
  lid.classList.remove('closing');
  lid.classList.add('opening');
  document.body.classList.add('open');
  lid.addEventListener('animationend', () => (lid.hidden = true), { once: true });
  updateCount();
  tilt.then((ok) => {
    setTimeout(() => {
      if (!current || !tinPieces(current).length) return;
      toast(ok ? '폰을 기울여보세요' : '조각을 끌어서 움직여보세요');
    }, 700);
  });
});

$('#close-btn').addEventListener('click', () => {
  savePositions();
  const lid = $('#lid');
  lid.hidden = false;
  lid.classList.remove('opening');
  lid.classList.add('closing');
  document.body.classList.remove('open');
  updateCount();
});

// ---------- 저장 ----------

function savePiece(piece) {
  store.putPiece(piece);
  if (!current) renderMap();
}

function removePiece(piece) {
  pieces.splice(pieces.indexOf(piece), 1);
  images.delete(piece.id);
  tin.removePiece(piece.id);
  store.deletePiece(piece.id);
  if (current) schedulePositions();
  else renderMap();
  updateCount();
}

let posTimer = 0;
function schedulePositions() {
  clearTimeout(posTimer);
  posTimer = setTimeout(savePositions, 1500);
}
function savePositions() {
  clearTimeout(posTimer);
  if (current) store.setMeta(`positions:${current}`, tin.snapshot());
}
document.addEventListener('visibilitychange', () => document.hidden && savePositions());
window.addEventListener('pagehide', savePositions);

// ---------- 기울기 ----------

let base = null;
let tiltOn = false;
let listening = false;
async function enableTilt() {
  base = null; // 뚜껑을 열 때 쥐고 있던 각도를 수평으로 삼는다
  if (tiltOn) return true;
  if (listening) return false;
  if (typeof DeviceOrientationEvent === 'undefined') return false;
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') return false;
    } catch {
      return false;
    }
  }
  listening = true;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 1000);
    window.addEventListener('deviceorientation', (e) => {
      if (e.beta == null || e.gamma == null) return;
      if (!tiltOn) {
        tiltOn = true;
        clearTimeout(timer);
        resolve(true);
      }
      if (!base) base = e.beta;
      const axis = (deg) => {
        const dead = 2.5;
        const v = Math.abs(deg) < dead ? 0 : deg - Math.sign(deg) * dead;
        return Math.max(-1, Math.min(1, Math.sin((v * Math.PI) / 180) * 1.6));
      };
      tin.setTilt(axis(e.gamma), axis(e.beta - base));
    });
  });
}

// 데스크톱 테스트용: 방향키로 기울이기
const keys = new Set();
const keyTilt = () =>
  tin.setTilt(
    (keys.has('ArrowRight') ? 0.7 : 0) - (keys.has('ArrowLeft') ? 0.7 : 0),
    (keys.has('ArrowDown') ? 0.7 : 0) - (keys.has('ArrowUp') ? 0.7 : 0)
  );
window.addEventListener('keydown', (e) => {
  if (!e.key.startsWith('Arrow') || e.target.matches('input, textarea')) return;
  keys.add(e.key);
  keyTilt();
});
window.addEventListener('keyup', (e) => {
  if (keys.delete(e.key)) keyTilt();
});

// ---------- 조각 추가 ----------

const sheet = $('#add-sheet');
for (const btn of [$('#add-btn'), $('#map-add')]) btn.addEventListener('click', () => (sheet.hidden = false));
sheet.addEventListener('click', (e) => {
  if (e.target === sheet || e.target.closest('[data-close]')) sheet.hidden = true;
});

for (const input of [$('#file-camera'), $('#file-album')]) {
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    sheet.hidden = true;
    if (file) await addFromFile(file);
  });
}

$('#demo-btn').addEventListener('click', async () => {
  sheet.hidden = true;
  await document.fonts.load('700 110px "Pretendard Variable"').catch(() => {});
  const { canvas, name } = makeDemo();
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.86));
  // 견본은 지금 보고 있는 지도 근처 아무 곳에 둔다
  const c = map.center();
  const loc = c ? { lat: c.lat + (Math.random() - 0.5) * 0.006, lng: c.lng + (Math.random() - 0.5) * 0.008, source: 'demo' } : null;
  const place = locator(Promise.resolve(loc));
  const seed = newSeed();
  const palette = extractPalette(canvas);
  const res = await openConfirm(canvas, seed, palette);
  place.stop();
  if (!res || res === 'back') return;
  await commit({ canvas, blob, seed, palette, name: res.name || name, ...(await place.result()) });
});

async function addFromFile(file) {
  // 사진 GPS → 지금 위치 순서로 찾는다. 방금 찍은 사진이면 지금 위치가 곧 가게 위치다.
  const found = photoLocation(file).then((loc) => loc ?? currentLocation());
  for (;;) {
    const crop = await openCrop(file);
    if (!crop) return;
    if (crop.error) return toast('이 사진은 열 수 없어요. 다른 사진을 골라주세요.');
    const place = locator(found);
    const seed = newSeed();
    const palette = extractPalette(crop.canvas);
    const res = await openConfirm(crop.canvas, seed, palette);
    place.stop();
    if (res === 'back') continue;
    if (!res) return;
    await commit({ ...crop, seed, palette, name: res.name, ...(await place.result()) });
    return;
  }
}

// 확인 화면의 위치 줄: 찾은 위치와 동네를 보여주고, 탭하면 지도에서 직접 고른다
function locator(found) {
  const row = $('#confirm-loc');
  let loc = null;
  let dong = null;
  let pending = true;
  const ac = new AbortController();
  const SOURCE = { photo: '사진에 기록된 위치', here: '지금 내 위치', manual: '직접 고른 위치', demo: '견본 위치' };

  const paint = () => {
    if (pending) row.innerHTML = '<span class="loc-pin">📍</span> 위치 찾는 중…';
    else if (!loc) row.innerHTML = `<span class="loc-pin">📍</span> 위치를 모르겠어요 <em>지도에서 고르기</em>`;
    else {
      row.innerHTML = `<span class="loc-pin">📍</span> <b></b> <span class="loc-src"></span> <em>바꾸기</em>`;
      row.querySelector('b').textContent = dong ?? '동네 확인 중';
      row.querySelector('.loc-src').textContent = SOURCE[loc.source] ?? '';
    }
  };
  const resolved = (async () => {
    loc = await found;
    dong = loc ? await dongOf(loc) : null;
    pending = false;
    paint();
  })();
  paint();

  row.addEventListener(
    'click',
    async () => {
      const picked = await pickLocation(loc);
      if (!picked) {
        if (!map.available) toast('지도를 불러오지 못했어요');
        return;
      }
      loc = picked;
      dong = null;
      pending = false;
      paint();
      dong = await dongOf(loc);
      paint();
    },
    { signal: ac.signal }
  );

  return {
    stop: () => ac.abort(),
    result: async () => {
      await resolved;
      return { loc, dong };
    },
  };
}

async function commit({ canvas, blob, seed, palette, name, loc, dong }) {
  // 동네를 모르면 지금 열린 틴에, 그것도 아니면 기본 틴에 담는다
  const target = dong ?? current ?? DEFAULT_TIN;
  const piece = {
    id: newId(),
    createdAt: Date.now(),
    seed,
    palette,
    name,
    memo: '',
    photo: blob,
    tin: target,
    loc: loc ? { lat: loc.lat, lng: loc.lng, source: loc.source } : null,
  };
  if (ensureTin(target)) store.setMeta('tins', tins);
  pieces.push(piece);
  images.set(piece.id, canvas);
  await store.putPiece(piece).catch(() => toast('저장 공간이 부족해서 저장하지 못했어요'));

  // 담기는 순간을 보여주려고 해당 틴을 연 채로 들어간다
  if (current !== target) {
    await enterTin(target, { open: true });
    toast(`${tins[target].label} 틴에 담았어요`);
  } else {
    updateCount();
  }
  const placed = new Set(tin.items.map((it) => it.piece.id));
  if (placed.has(piece.id)) tin.removePiece(piece.id); // enterTin이 이미 놓은 경우 다시 떨어뜨린다
  setTimeout(() => tin.addPiece(piece, canvas, { drop: true }), 220);
}

boot();
