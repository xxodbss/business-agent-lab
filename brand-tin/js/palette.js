import { mulberry32 } from './rand.js';

// 축소한 이미지에서 k-means로 대표 컬러를 뽑는다. 비율 높은 순.
export function extractPalette(src, k = 5) {
  const w = 60;
  const h = 80;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const px = [];
  for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);

  // k-means++ 초기값 (결과가 매번 같도록 고정 시드)
  const rand = mulberry32(7);
  const centers = [px[Math.floor(rand() * px.length)].slice()];
  const dist = new Float64Array(px.length).fill(Infinity);
  while (centers.length < k) {
    const last = centers[centers.length - 1];
    let sum = 0;
    for (let i = 0; i < px.length; i++) {
      dist[i] = Math.min(dist[i], d2(px[i], last));
      sum += dist[i];
    }
    let r = rand() * sum;
    let pick = 0;
    while (pick < px.length - 1 && (r -= dist[pick]) > 0) pick++;
    centers.push(px[pick].slice());
  }

  const assign = new Int32Array(px.length);
  for (let iter = 0; iter < 12; iter++) {
    const acc = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < px.length; i++) {
      let best = 0;
      let bd = Infinity;
      for (let j = 0; j < k; j++) {
        const dd = d2(px[i], centers[j]);
        if (dd < bd) { bd = dd; best = j; }
      }
      assign[i] = best;
      const a = acc[best];
      a[0] += px[i][0]; a[1] += px[i][1]; a[2] += px[i][2]; a[3]++;
    }
    acc.forEach((a, j) => {
      if (a[3]) centers[j] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]];
    });
  }

  const counts = new Array(k).fill(0);
  for (const a of assign) counts[a]++;
  const out = [];
  centers
    .map((col, j) => ({ col, ratio: counts[j] / px.length }))
    .sort((a, b) => b.ratio - a.ratio)
    .forEach((e) => {
      if (e.ratio < 0.02) return;
      const near = out.find((o) => d2(o.col, e.col) < 22 * 22);
      if (near) near.ratio += e.ratio;
      else out.push(e);
    });
  return out.map((e) => ({ hex: toHex(e.col), ratio: e.ratio }));
}

function d2(a, b) {
  const r = a[0] - b[0];
  const g = a[1] - b[1];
  const bl = a[2] - b[2];
  return r * r + g * g + bl * bl;
}

function toHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}
