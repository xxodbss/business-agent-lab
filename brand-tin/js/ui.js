import { renderHanji, hanjiSize } from './hanji.js';

export const $ = (sel) => document.querySelector(sel);
const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

let toastTimer = 0;
export function toast(msg, ms = 2200) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), ms);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function swatches(palette) {
  return palette
    .map((c) => `<button class="swatch" data-hex="${c.hex}"><i style="background:${c.hex}"></i><b>${c.hex}</b><span>${Math.round(c.ratio * 100)}%</span></button>`)
    .join('');
}

function bindCopy(root) {
  root.querySelectorAll('.swatch').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const hex = el.dataset.hex;
      navigator.clipboard?.writeText(hex).then(
        () => toast(`${hex} 복사했어요`),
        () => toast(hex)
      ) ?? toast(hex);
    })
  );
}

// 한지 미리보기와 이름 입력. 결과: { name } | 'back' | null
export function openConfirm(canvas, seed, palette) {
  return new Promise((resolve) => {
    const screen = $('#confirm');
    const holder = $('#confirm-piece');
    const name = $('#confirm-name');
    screen.hidden = false;
    const box = holder.getBoundingClientRect();
    const w = Math.max(160, Math.min(box.width, box.height / 1.3, 340));
    const piece = renderHanji(canvas, seed, w * dpr());
    piece.style.width = `${w}px`;
    holder.replaceChildren(piece);
    name.value = '';
    $('#confirm-palette').innerHTML = swatches(palette);
    bindCopy($('#confirm-palette'));

    const ac = new AbortController();
    const done = (v) => {
      ac.abort();
      screen.hidden = true;
      resolve(v);
    };
    const on = (action, fn) => screen.querySelector(`[data-action="${action}"]`).addEventListener('click', fn, { signal: ac.signal });
    on('back', () => done('back'));
    on('cancel', () => done(null));
    on('drop', () => done({ name: name.value.trim() }));
  });
}

// 조각을 탭하면 열리는 카드. 앞면은 한지, 뒷면은 디자인 스펙시트.
export function openSpec(piece, img, no, { onChange, onDelete }) {
  const modal = $('#spec');
  const card = $('#spec-card');
  const W = Math.min(window.innerWidth * 0.84, 360, (window.innerHeight - 140) / 1.3);
  const g = hanjiSize(W);
  card.style.width = `${W}px`;
  card.style.height = `${g.height}px`;
  card.classList.remove('flipped');

  const front = renderHanji(img, piece.seed, W * dpr());
  front.style.width = '100%';
  $('#spec-front').replaceChildren(front);

  const date = new Date(piece.createdAt);
  const stamp = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  const back = $('#spec-back');
  back.style.inset = `${g.pad}px`;
  back.innerHTML = `
    <div class="spec-head"><span>BRAND SPEC</span><span>No.${String(no).padStart(3, '0')}</span></div>
    <input class="spec-name" value="${esc(piece.name)}" placeholder="가게 이름" maxlength="30">
    <section>
      <h3>COLOR</h3>
      <div class="ratio-bar">${piece.palette.map((c) => `<i style="background:${c.hex};flex:${c.ratio}"></i>`).join('')}</div>
      <div class="swatches">${swatches(piece.palette)}</div>
    </section>
    <section class="spec-grid">
      <div><h3>TYPE</h3><p class="pending">AI 분석 예정</p></div>
      <div><h3>TONE</h3><p class="pending">AI 분석 예정</p></div>
      <div><h3>CATEGORY</h3><p class="pending">AI 분석 예정</p></div>
      <div><h3>COLLECTED</h3><p class="stamp">${stamp}</p></div>
    </section>
    <section>
      <h3>MEMO</h3>
      <textarea class="spec-memo" rows="3" placeholder="이 가게에 대한 메모">${esc(piece.memo)}</textarea>
    </section>
    <button class="spec-delete">이 조각 버리기</button>`;
  bindCopy(back);

  let saveTimer = 0;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => onChange(piece), 400);
  };
  back.querySelector('.spec-name').addEventListener('input', (e) => {
    piece.name = e.target.value.trim();
    save();
  });
  back.querySelector('.spec-memo').addEventListener('input', (e) => {
    piece.memo = e.target.value;
    save();
  });
  back.querySelector('.spec-delete').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!confirm('이 조각을 틴에서 꺼내 버릴까요?')) return;
    close();
    onDelete(piece);
  });

  const ac = new AbortController();
  const close = () => {
    ac.abort();
    clearTimeout(saveTimer);
    onChange(piece);
    modal.hidden = true;
  };
  card.addEventListener(
    'click',
    (e) => {
      if (e.target.closest('input, textarea, button')) return;
      card.classList.toggle('flipped');
    },
    { signal: ac.signal }
  );
  modal.addEventListener(
    'click',
    (e) => {
      if (e.target === modal || e.target.closest('[data-close]')) close();
    },
    { signal: ac.signal }
  );
  modal.hidden = false;
}
