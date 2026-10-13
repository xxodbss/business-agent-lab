import { renderHanji, hanjiSize, makeShadow } from './hanji.js';

const { Engine, Bodies, Body, Composite, Constraint } = Matter;

const WALL = 1 << 5;
const LAYERS = 3; // 조각은 같은 층끼리만 부딪혀서 서로 겹쳐 쌓일 수 있다
const STEP = 1000 / 60;
const DROP_MS = 620;
const LAND_MS = 180;

// 위에서 내려다본 알루미늄 틴. 물리는 Matter.js, 그리기는 직접 한다.
export class Tin {
  constructor(canvas, { onTap, onMove }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onTap = onTap;
    this.onMove = onMove;
    this.engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0.0011 } });
    this.items = [];
    this.walls = [];
    this.z = 0;
    this.drag = null;
    this.tilt = { x: 0, y: 0 };
    this.acc = 0;
    this.last = performance.now();
    this.paused = false;

    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
    canvas.addEventListener('pointerdown', (e) => this.pointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.pointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.pointerUp(e));
    canvas.addEventListener('pointercancel', (e) => this.pointerUp(e, true));
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------- 배치 ----------

  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h || (w === this.w && h === this.h)) return;
    const snapshot = this.items.length ? this.snapshot() : null;

    this.w = w;
    this.h = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);

    const margin = 10;
    const rim = 22;
    this.outer = { x: margin, y: margin, w: w - margin * 2, h: h - margin * 2 };
    this.floor = { x: margin + rim, y: margin + rim, w: w - (margin + rim) * 2, h: h - (margin + rim) * 2 };
    this.spriteW = Math.max(92, Math.min(170, Math.min(this.floor.w, this.floor.h) * 0.36));
    this.geo = hanjiSize(this.spriteW);
    this.bg = paintTin(this.w, this.h, this.dpr, this.outer, this.floor);

    Composite.clear(this.engine.world, false);
    this.drag = null;
    this.buildWalls();
    for (const item of this.items) {
      this.makeSprites(item);
      const s = snapshot?.[item.piece.id];
      if (item.body) this.makeBody(item, this.fromUnit(s ?? { u: 0.5, v: 0.5, a: 0 }));
    }
  }

  buildWalls() {
    const f = this.floor;
    const t = 400;
    const opt = { isStatic: true, collisionFilter: { category: WALL, mask: 0xffff } };
    this.walls = [
      Bodies.rectangle(f.x + f.w / 2, f.y - t / 2, f.w + t * 2, t, opt),
      Bodies.rectangle(f.x + f.w / 2, f.y + f.h + t / 2, f.w + t * 2, t, opt),
      Bodies.rectangle(f.x - t / 2, f.y + f.h / 2, t, f.h + t * 2, opt),
      Bodies.rectangle(f.x + f.w + t / 2, f.y + f.h / 2, t, f.h + t * 2, opt),
    ];
    Composite.add(this.engine.world, this.walls);
  }

  // 위치는 바닥 기준 0..1 좌표로 저장해서 화면 크기가 달라도 복원된다
  snapshot() {
    const out = {};
    for (const it of this.items) {
      const p = it.body ? { ...it.body.position, a: it.body.angle } : it.drop ? { x: it.drop.x, y: it.drop.y, a: it.drop.a } : null;
      if (!p) continue;
      out[it.piece.id] = {
        u: (p.x - this.floor.x) / this.floor.w,
        v: (p.y - this.floor.y) / this.floor.h,
        a: p.a,
        layer: it.layer,
      };
    }
    return out;
  }

  fromUnit({ u, v, a }) {
    const f = this.floor;
    const hw = this.geo.pw / 2;
    const hh = this.geo.ph / 2;
    return {
      x: clamp(f.x + u * f.w, f.x + hw * 0.6, f.x + f.w - hw * 0.6),
      y: clamp(f.y + v * f.h, f.y + hh * 0.6, f.y + f.h - hh * 0.6),
      a: a || 0,
    };
  }

  // ---------- 조각 ----------

  addPiece(piece, img, { drop = false, pos = null } = {}) {
    const item = { piece, img, z: ++this.z, layer: 0, body: null, drop: null, land: 0 };
    if (pos) {
      item.layer = pos.layer ?? 0;
      this.makeSprites(item);
      this.makeBody(item, this.fromUnit(pos));
    } else {
      const f = this.floor;
      const target = {
        x: f.x + f.w * (0.3 + Math.random() * 0.4),
        y: f.y + f.h * (0.3 + Math.random() * 0.4),
        a: (Math.random() - 0.5) * 0.7,
      };
      item.layer = this.pickLayer(target);
      this.makeSprites(item);
      if (drop) item.drop = { ...target, start: performance.now() };
      else this.makeBody(item, target);
    }
    this.items.push(item);
    return item;
  }

  clear() {
    for (const it of this.items) if (it.body) Composite.remove(this.engine.world, it.body);
    if (this.drag) Composite.remove(this.engine.world, this.drag.constraint);
    this.items = [];
    this.drag = null;
  }

  removePiece(id) {
    const i = this.items.findIndex((it) => it.piece.id === id);
    if (i < 0) return;
    const [it] = this.items.splice(i, 1);
    if (it.body) Composite.remove(this.engine.world, it.body);
  }

  // 떨어질 자리 근처에 가장 덜 붐비는 층을 고른다
  pickLayer(p) {
    const r = this.spriteW * 1.1;
    const crowd = new Array(LAYERS).fill(0);
    for (const it of this.items) {
      if (!it.body) continue;
      if (Math.hypot(it.body.position.x - p.x, it.body.position.y - p.y) < r) crowd[it.layer]++;
    }
    const min = Math.min(...crowd);
    const options = crowd.map((c, i) => (c === min ? i : -1)).filter((i) => i >= 0);
    return options[Math.floor(Math.random() * options.length)];
  }

  makeSprites(item) {
    item.sprite = renderHanji(item.img, item.piece.seed, this.spriteW * this.dpr);
    item.shadow = makeShadow(item.sprite, 7 * this.dpr);
  }

  makeBody(item, { x, y, a }) {
    const { pw, ph } = this.geo;
    const bit = 1 << item.layer;
    item.body = Bodies.rectangle(x, y, pw * 0.95, ph * 0.95, {
      angle: a,
      chamfer: { radius: pw * 0.04 },
      frictionAir: 0.07,
      friction: 0.08,
      restitution: 0.25,
      collisionFilter: { category: bit, mask: bit | WALL },
    });
    Composite.add(this.engine.world, item.body);
  }

  land(item) {
    const { x, y, a } = item.drop;
    item.drop = null;
    item.land = performance.now();
    this.makeBody(item, { x, y, a });
    // 종이가 내려앉으며 일으킨 바람에 주변 조각이 살짝 밀려난다
    const r = this.spriteW * 1.5;
    for (const it of this.items) {
      if (!it.body || it === item) continue;
      const dx = it.body.position.x - x;
      const dy = it.body.position.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > r) continue;
      const k = 2.6 * (1 - d / r);
      Body.setVelocity(it.body, { x: it.body.velocity.x + (dx / d) * k, y: it.body.velocity.y + (dy / d) * k });
      Body.setAngularVelocity(it.body, it.body.angularVelocity + (Math.random() - 0.5) * 0.04);
    }
    this.onMove?.();
  }

  setTilt(x, y) {
    this.tilt.x = x;
    this.tilt.y = y;
  }

  // ---------- 터치 ----------

  local(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  hit(p) {
    const { pw, ph } = this.geo;
    const sorted = this.items.filter((it) => it.body).sort((a, b) => b.z - a.z);
    return sorted.find((it) => {
      const b = it.body;
      const c = Math.cos(-b.angle);
      const s = Math.sin(-b.angle);
      const dx = p.x - b.position.x;
      const dy = p.y - b.position.y;
      return Math.abs(dx * c - dy * s) < pw / 2 && Math.abs(dx * s + dy * c) < ph / 2;
    });
  }

  pointerDown(e) {
    if (this.drag) return;
    const p = this.local(e);
    const item = this.hit(p);
    if (!item) return;
    this.canvas.setPointerCapture(e.pointerId);
    item.z = ++this.z;
    const b = item.body;
    const constraint = Constraint.create({
      pointA: { ...p },
      bodyB: b,
      pointB: { x: p.x - b.position.x, y: p.y - b.position.y },
      length: 0,
      stiffness: 0.12,
      damping: 0.08,
    });
    Composite.add(this.engine.world, constraint);
    this.drag = { id: e.pointerId, item, constraint, start: p, t: performance.now(), moved: false };
  }

  pointerMove(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const p = this.local(e);
    d.constraint.pointA.x = p.x;
    d.constraint.pointA.y = p.y;
    if (Math.hypot(p.x - d.start.x, p.y - d.start.y) > 8) d.moved = true;
  }

  pointerUp(e, cancelled = false) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    Composite.remove(this.engine.world, d.constraint);
    this.drag = null;
    if (!cancelled && !d.moved && performance.now() - d.t < 400) this.onTap?.(d.item.piece, d.item.img);
    else this.onMove?.();
  }

  // ---------- 루프 ----------

  frame(t) {
    const dt = Math.min(t - this.last, 100);
    this.last = t;
    if (this.paused) {
      requestAnimationFrame((n) => this.frame(n));
      return;
    }

    const g = this.engine.gravity;
    g.x += (this.tilt.x - g.x) * 0.2;
    g.y += (this.tilt.y - g.y) * 0.2;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 3) {
      Engine.update(this.engine, STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === 3) this.acc = 0;

    for (const it of this.items) if (it.drop && t - it.drop.start >= DROP_MS) this.land(it);
    this.draw(t);
    requestAnimationFrame((n) => this.frame(n));
  }

  draw(t) {
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const items = [...this.items].sort((a, b) => a.z - b.z);
    for (const it of items) {
      let x, y, a;
      let scale = 1;
      let lift = 3; // 그림자 거리 = 바닥에서 떠 있는 높이
      let shadowAlpha = 1;
      if (it.drop) {
        // 위에서 떨어짐: 점점 빨라지며 작아지고 그림자가 가까워진다
        const p = Math.min(1, (t - it.drop.start) / DROP_MS);
        const fall = 1 - p * p;
        ({ x, y, a } = it.drop);
        scale = 1 + 0.85 * fall;
        lift = 3 + 34 * fall;
        shadowAlpha = 0.35 + 0.65 * p;
        a += fall * 0.25;
      } else {
        ({ x, y } = it.body.position);
        a = it.body.angle;
        if (this.drag?.item === it) {
          scale = 1.06;
          lift = 14;
          shadowAlpha = 0.8;
        }
        const q = (t - it.land) / LAND_MS;
        if (q >= 0 && q < 1) scale *= 1 - 0.035 * Math.sin(Math.PI * q);
      }

      const sw = it.shadow.width / dpr;
      const sh = it.shadow.height / dpr;
      ctx.save();
      ctx.globalAlpha = shadowAlpha;
      ctx.translate(x + lift * 0.5, y + lift);
      ctx.rotate(a);
      ctx.scale(scale, scale);
      ctx.drawImage(it.shadow, -sw / 2, -sh / 2, sw, sh);
      ctx.restore();

      const pw = it.sprite.width / dpr;
      const ph = it.sprite.height / dpr;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.scale(scale, scale);
      ctx.drawImage(it.sprite, -pw / 2, -ph / 2, pw, ph);
      ctx.restore();
    }
  }
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function roundRect(ctx, x, y, w, h, r, fresh = true) {
  if (fresh) ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 알루미늄 틴 배경을 한 번만 그려 둔다
function paintTin(w, h, dpr, o, f) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);

  // 테이블
  const table = ctx.createLinearGradient(0, 0, 0, h);
  table.addColorStop(0, '#332c27');
  table.addColorStop(1, '#221d19');
  ctx.fillStyle = table;
  ctx.fillRect(0, 0, w, h);

  // 테두리 (말린 알루미늄 림)
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  const rim = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y + o.h);
  rim.addColorStop(0, '#f1f2f4');
  rim.addColorStop(0.22, '#aeb3ba');
  rim.addColorStop(0.48, '#eceef1');
  rim.addColorStop(0.72, '#9da2a9');
  rim.addColorStop(1, '#d9dce0');
  ctx.fillStyle = rim;
  roundRect(ctx, o.x, o.y, o.w, o.h, 30);
  ctx.fill();
  ctx.restore();

  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  roundRect(ctx, o.x + 4, o.y + 4, o.w - 8, o.h - 8, 26);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(70,74,80,0.45)';
  roundRect(ctx, o.x + 10, o.y + 10, o.w - 20, o.h - 20, 22);
  ctx.stroke();

  // 안쪽 벽 (위는 밝고 아래는 어둡게)
  const wall = ctx.createLinearGradient(0, o.y, 0, o.y + o.h);
  wall.addColorStop(0, '#d6d9dd');
  wall.addColorStop(1, '#868c93');
  ctx.fillStyle = wall;
  roundRect(ctx, f.x - 6, f.y - 6, f.w + 12, f.h + 12, 20);
  ctx.fill();

  // 바닥: 헤어라인 알루미늄
  ctx.save();
  roundRect(ctx, f.x, f.y, f.w, f.h, 16);
  ctx.clip();
  ctx.fillStyle = '#c4c8cd';
  ctx.fillRect(f.x, f.y, f.w, f.h);
  let s = 12345;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < f.h * 1.6; i++) {
    const y = f.y + rnd() * f.h;
    ctx.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${rnd() * 0.12})` : `rgba(40,44,50,${rnd() * 0.07})`;
    const x0 = f.x + rnd() * f.w * 0.5 - f.w * 0.2;
    ctx.fillRect(x0, y, f.w * (0.4 + rnd() * 0.8), 0.6);
  }
  // 빛 반사
  const sheen = ctx.createLinearGradient(f.x, f.y, f.x + f.w, f.y + f.h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.22)');
  sheen.addColorStop(0.45, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.7, 'rgba(255,255,255,0.1)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.fillStyle = sheen;
  ctx.fillRect(f.x, f.y, f.w, f.h);
  // 바닥에 눌린 테두리 엠보싱
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  roundRect(ctx, f.x + 19, f.y + 19, f.w - 38, f.h - 38, 12);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(60,64,70,0.25)';
  roundRect(ctx, f.x + 17, f.y + 17, f.w - 34, f.h - 34, 13);
  ctx.stroke();
  // 벽이 드리운 안쪽 그림자
  ctx.shadowColor = 'rgba(20,22,26,0.45)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;
  ctx.beginPath();
  ctx.rect(f.x - 200, f.y - 200, f.w + 400, f.h + 400);
  roundRect(ctx, f.x, f.y, f.w, f.h, 16, false);
  ctx.fillStyle = '#000';
  ctx.fill('evenodd');
  ctx.restore();

  return c;
}
