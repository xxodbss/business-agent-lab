const OUT_W = 900;
const OUT_H = 1200;

// 사진을 3:4 프레임에 맞춘다. 결과는 { canvas, blob } 또는 취소 시 null.
export function openCrop(file) {
  return new Promise((resolve) => {
    const screen = document.getElementById('crop');
    const stage = screen.querySelector('.crop-stage');
    const frame = screen.querySelector('.crop-frame');
    const img = document.getElementById('crop-img');
    const url = URL.createObjectURL(file);
    const ac = new AbortController();
    const on = (el, type, fn) => el.addEventListener(type, fn, { signal: ac.signal });

    const finish = (result) => {
      ac.abort();
      screen.hidden = true;
      URL.revokeObjectURL(url);
      resolve(result);
    };

    img.onload = () => {
      screen.hidden = false;
      start();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ error: true });
    };
    img.src = url;

    function start() {
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const box = stage.getBoundingClientRect();
      const fw = Math.floor(Math.min(box.width - 32, (box.height - 16) * 0.75));
      const fh = Math.floor((fw * 4) / 3);
      frame.style.width = `${fw}px`;
      frame.style.height = `${fh}px`;
      img.style.width = `${iw}px`;
      img.style.height = `${ih}px`;

      const minS = Math.max(fw / iw, fh / ih);
      let s = minS;
      let tx = (fw - iw * s) / 2;
      let ty = (fh - ih * s) / 2;
      const apply = () => {
        s = Math.max(minS, Math.min(minS * 5, s));
        tx = Math.min(0, Math.max(fw - iw * s, tx));
        ty = Math.min(0, Math.max(fh - ih * s, ty));
        img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      };
      const zoomAt = (mx, my, ratio) => {
        const ns = Math.max(minS, Math.min(minS * 5, s * ratio));
        tx = mx - ((mx - tx) * ns) / s;
        ty = my - ((my - ty) * ns) / s;
        s = ns;
      };
      apply();

      const pts = new Map();
      const framePoint = (e) => {
        const r = frame.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };
      const pair = () => {
        const [a, b] = [...pts.values()];
        return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
      };
      on(stage, 'pointerdown', (e) => {
        stage.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, framePoint(e));
      });
      on(stage, 'pointermove', (e) => {
        if (!pts.has(e.pointerId)) return;
        const p = framePoint(e);
        if (pts.size === 1) {
          const prev = pts.get(e.pointerId);
          tx += p.x - prev.x;
          ty += p.y - prev.y;
          pts.set(e.pointerId, p);
        } else {
          const before = pair();
          pts.set(e.pointerId, p);
          const after = pair();
          zoomAt(after.mx, after.my, after.d / (before.d || 1));
          tx += after.mx - before.mx;
          ty += after.my - before.my;
        }
        apply();
      });
      const up = (e) => pts.delete(e.pointerId);
      on(stage, 'pointerup', up);
      on(stage, 'pointercancel', up);
      on(stage, 'wheel', (e) => {
        e.preventDefault();
        const p = framePoint(e);
        zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.002));
        apply();
      });

      on(screen.querySelector('[data-action="cancel"]'), 'click', () => finish(null));
      on(screen.querySelector('[data-action="next"]'), 'click', () => {
        const c = document.createElement('canvas');
        c.width = OUT_W;
        c.height = OUT_H;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, -tx / s, -ty / s, fw / s, fh / s, 0, 0, OUT_W, OUT_H);
        c.toBlob((blob) => finish({ canvas: c, blob }), 'image/jpeg', 0.86);
      });
    }
  });
}
