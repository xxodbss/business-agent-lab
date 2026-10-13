import { mulberry32, periodicNoise } from './rand.js';

const PAPER = '#f3eee3';
const PAD = 0.06; // 섬유가 삐져나올 여백 (스프라이트 폭 대비)

// 스프라이트 폭이 주어졌을 때 종이(3:4)와 여백 크기
export function hanjiSize(width) {
  const pad = width * PAD;
  const pw = width - pad * 2;
  const ph = (pw * 4) / 3;
  return { width, height: ph + pad * 2, pad, pw, ph };
}

// 사진을 불규칙한 섬유 테두리의 한지 인쇄물로 그린다.
// 모든 길이는 종이 폭 비례라서 seed만 같으면 크기와 무관하게 같은 모양이 된다.
export function renderHanji(img, seed, width) {
  const g = hanjiSize(width);
  const { pad, pw, ph } = g;
  const u = pw;
  const c = document.createElement('canvas');
  c.width = Math.ceil(g.width);
  c.height = Math.ceil(g.height);
  const ctx = c.getContext('2d');
  const rand = mulberry32(seed);

  const paper = tornEdge(rand, pad, pad, pw, ph, u * 0.042, [[4, 0.4], [11, 0.28], [31, 0.18], [90, 0.09], [210, 0.05]], 480);
  const fringe = tornEdge(rand, pad, pad, pw, ph, u * 0.022, [[6, 0.45], [23, 0.3], [120, 0.25]], 480);
  const m = u * 0.055;
  const print = tornEdge(rand, pad + m, pad + m, pw - m * 2, ph - m * 2, u * 0.006, [[7, 0.6], [29, 0.4]], 200);

  // 1. 얇게 비치는 가장자리: 종이가 성기게 남은 반투명 띠
  ctx.fillStyle = 'rgba(243,238,227,0.42)';
  trace(ctx, fringe);
  ctx.fill();

  // 2. 가장자리 섬유: 짧고 촘촘한 보풀 + 드문드문 긴 올
  ctx.lineCap = 'round';
  for (let i = 0; i < 340; i++) {
    const long = rand() < 0.08;
    const p = paper[Math.floor(rand() * paper.length)];
    const a = Math.atan2(p.ny, p.nx) + (rand() - 0.5) * (long ? 1.2 : 2.4);
    const len = u * (long ? 0.03 + rand() * 0.035 : 0.005 + rand() * rand() * 0.022);
    const sx = p.x - p.nx * len * 0.35;
    const sy = p.y - p.ny * len * 0.35;
    const ex = sx + Math.cos(a) * len;
    const ey = sy + Math.sin(a) * len;
    const bend = (rand() - 0.5) * len * 0.9;
    ctx.strokeStyle = `rgba(245,240,229,${(long ? 0.35 : 0.3) + rand() * 0.45})`;
    ctx.lineWidth = u * (long ? 0.0012 + rand() * 0.0012 : 0.0014 + rand() * 0.002);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo((sx + ex) / 2 - Math.sin(a) * bend, (sy + ey) / 2 + Math.cos(a) * bend, ex, ey);
    ctx.stroke();
  }

  // 3. 종이: 가장자리로 갈수록 얇아지도록 한 번 더 겹친다
  ctx.fillStyle = 'rgba(243,238,227,0.7)';
  trace(ctx, paper);
  ctx.fill();
  ctx.save();
  ctx.translate(g.width / 2, g.height / 2);
  ctx.scale(0.985, 0.99);
  ctx.translate(-g.width / 2, -g.height / 2);
  ctx.fillStyle = PAPER;
  trace(ctx, paper);
  ctx.fill();
  ctx.restore();

  // 4. 인쇄: 종이색을 곱해 따뜻하게, 검정은 살짝 들어 올려 잉크처럼
  ctx.save();
  trace(ctx, print);
  ctx.clip();
  drawCover(ctx, img, pad + m, pad + m, pw - m * 2, ph - m * 2);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = 'rgba(243,238,227,0.1)';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.restore();

  // 잉크가 종이에 스민 경계
  trace(ctx, print);
  ctx.strokeStyle = 'rgba(243,238,227,0.5)';
  ctx.lineWidth = u * 0.005;
  ctx.stroke();

  // 5. 종이 결: 인쇄 위로 비치는 긴 섬유와 티끌
  ctx.save();
  trace(ctx, paper);
  ctx.clip();
  for (let i = 0; i < 90; i++) {
    const x = pad + rand() * pw;
    const y = pad + rand() * ph;
    const a = rand() * Math.PI * 2;
    const len = u * (0.04 + rand() * 0.2);
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len;
    const bend = (rand() - 0.5) * len * 0.6;
    ctx.strokeStyle = `rgba(255,252,244,${0.08 + rand() * 0.14})`;
    ctx.lineWidth = u * (0.001 + rand() * 0.002);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo((x + ex) / 2 - Math.sin(a) * bend, (y + ey) / 2 + Math.cos(a) * bend, ex, ey);
    ctx.stroke();
  }
  for (let i = 0; i < 700; i++) {
    const dark = rand() < 0.25;
    ctx.fillStyle = dark ? `rgba(110,90,70,${rand() * 0.12})` : `rgba(255,255,250,${rand() * 0.25})`;
    const s = u * (0.002 + rand() * 0.004);
    ctx.fillRect(pad + rand() * pw, pad + rand() * ph, s, s);
  }
  ctx.restore();

  return c;
}

// 오프셋 그림자 기법: 실루엣은 화면 밖에 그리고 그림자만 남긴다.
export function makeShadow(sprite, blur) {
  const p = Math.ceil(blur * 2);
  const c = document.createElement('canvas');
  c.width = sprite.width + p * 2;
  c.height = sprite.height + p * 2;
  const ctx = c.getContext('2d');
  ctx.shadowColor = 'rgba(30,26,22,0.5)';
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = c.width;
  ctx.drawImage(sprite, p - c.width, p);
  return c;
}

// 사각형 둘레를 따라 안쪽으로 뜯겨 들어간 점들. n은 바깥 방향 법선.
function tornEdge(rand, x, y, w, h, amp, octaves, count) {
  const layers = octaves.map(([f, a]) => [periodicNoise(rand, f), a]);
  const norm = octaves.reduce((s, [, a]) => s + a, 0);
  const L = 2 * (w + h);
  const pts = [];
  for (let i = 0; i < count; i++) {
    const t = i / count;
    let d = t * L;
    let px, py, nx, ny, dc;
    if (d < w) {
      px = x + d; py = y; nx = 0; ny = -1; dc = Math.min(d, w - d);
    } else if ((d -= w) < h) {
      px = x + w; py = y + d; nx = 1; ny = 0; dc = Math.min(d, h - d);
    } else if ((d -= h) < w) {
      px = x + w - d; py = y + h; nx = 0; ny = 1; dc = Math.min(d, w - d);
    } else {
      d -= w;
      px = x; py = y + h - d; nx = -1; ny = 0; dc = Math.min(d, h - d);
    }
    let n = 0;
    for (const [fn, a] of layers) n += fn(t) * a;
    n /= norm;
    const corner = Math.max(0, 1 - dc / (amp * 3));
    const inset = amp * (0.1 + n + rand() * 0.12) + amp * 1.4 * corner * corner;
    pts.push({ x: px - nx * inset, y: py - ny * inset, nx, ny });
  }
  return pts;
}

function trace(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

function drawCover(ctx, img, x, y, w, h) {
  const iw = img.width;
  const ih = img.height;
  const s = Math.max(w / iw, h / ih);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}
