// 시드 기반 난수: 같은 시드면 어떤 해상도로 그려도 같은 한지 모양이 나온다.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 0..1 구간에서 끝과 처음이 이어지는 1차원 노이즈 (종이 둘레처럼 닫힌 경로용)
export function periodicNoise(rand, freq) {
  const v = Array.from({ length: freq }, rand);
  return (u) => {
    const x = u * freq;
    const i = Math.floor(x);
    const f = x - i;
    const a = v[((i % freq) + freq) % freq];
    const b = v[(((i + 1) % freq) + freq) % freq];
    return a + (b - a) * f * f * (3 - 2 * f);
  };
}

export function newSeed() {
  return (Math.random() * 2 ** 31) | 0;
}

export function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
