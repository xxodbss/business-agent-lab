// 사진 없이 흐름을 시험해볼 수 있는 가짜 가게 간판
const SHOPS = [
  { name: '망원 베이커리', wall: '#efe3cc', sign: '#7a3b22', ink: '#f6ead2', weight: 800, awning: ['#7a3b22', '#efe3cc'] },
  { name: '책방 오늘', wall: '#2f4a3a', sign: '#e9e1cf', ink: '#2f4a3a', weight: 800, awning: null },
  { name: '꽃집 봄날', wall: '#f4d9d4', sign: '#ffffff', ink: '#d0526b', weight: 300, awning: ['#d0526b', '#ffffff'] },
  { name: 'COFFEE 한잔', wall: '#1d1d1f', sign: '#1d1d1f', ink: '#f2c94c', weight: 600, awning: null },
  { name: '동네 철물', wall: '#d8d2c4', sign: '#1f5fa8', ink: '#ffffff', weight: 600, awning: ['#1f5fa8', '#d8d2c4'] },
  { name: '레코드 숲', wall: '#e85d3a', sign: '#f7e8c8', ink: '#2b2b2b', weight: 800, awning: null },
  { name: '국수 공방', wall: '#f3efe6', sign: '#2b2b2b', ink: '#f3efe6', weight: 800, awning: ['#b23a2e', '#f3efe6'] },
  { name: '문구 하나', wall: '#ffd84d', sign: '#ffffff', ink: '#2a5bd7', weight: 300, awning: null },
];

let next = Math.floor(Math.random() * SHOPS.length);

export function makeDemo() {
  const shop = SHOPS[next++ % SHOPS.length];
  const c = document.createElement('canvas');
  c.width = 900;
  c.height = 1200;
  const ctx = c.getContext('2d');

  ctx.fillStyle = shop.wall;
  ctx.fillRect(0, 0, 900, 1200);
  // 벽 질감
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * 900, Math.random() * 1200, 3, 3);
  }
  // 간판
  ctx.fillStyle = shop.sign;
  ctx.fillRect(90, 180, 720, 220);
  ctx.strokeStyle = shop.ink;
  ctx.lineWidth = 6;
  ctx.strokeRect(110, 200, 680, 180);
  ctx.fillStyle = shop.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${shop.weight} 110px "Pretendard Variable", Pretendard, sans-serif`;
  ctx.fillText(shop.name, 450, 292, 640);
  // 차양
  if (shop.awning) {
    const sw = 900 / 9;
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = shop.awning[i % 2];
      ctx.beginPath();
      ctx.moveTo(i * sw, 460);
      ctx.lineTo((i + 1) * sw, 460);
      ctx.lineTo((i + 1) * sw, 560);
      ctx.arc(i * sw + sw / 2, 560, sw / 2, 0, Math.PI);
      ctx.fill();
    }
  }
  // 창문과 문
  ctx.fillStyle = 'rgba(40,50,60,0.75)';
  ctx.fillRect(90, 660, 420, 420);
  ctx.fillRect(570, 660, 240, 540);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.moveTo(90, 660);
  ctx.lineTo(260, 660);
  ctx.lineTo(90, 900);
  ctx.fill();
  ctx.fillStyle = shop.sign;
  ctx.fillRect(760, 920, 18, 60);

  return { canvas: c, name: shop.name };
}
