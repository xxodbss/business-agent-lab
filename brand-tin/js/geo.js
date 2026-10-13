import { REVERSE_GEOCODE_URL } from './config.js';

// 사진에 기록된 GPS (iOS는 업로드 시 지워지는 경우가 많다)
export async function photoLocation(file) {
  try {
    const g = await window.exifr?.gps(file);
    if (g && Number.isFinite(g.latitude) && Number.isFinite(g.longitude)) {
      return { lat: g.latitude, lng: g.longitude, source: 'photo' };
    }
  } catch {
    // EXIF가 없거나 읽을 수 없는 형식
  }
  return null;
}

export function currentLocation(timeout = 8000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, source: 'here' }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 }
    );
  });
}

// 좌표 → 행정동 이름 ("연남동", "망원1동"). 한국에서는 Nominatim의 suburb가 행정동이다.
const cache = new Map();
let lastCall = 0;

export async function dongOf(loc) {
  if (!loc) return null;
  const key = `${loc.lat.toFixed(4)},${loc.lng.toFixed(4)}`;
  if (cache.has(key)) return cache.get(key);

  // 공용 서버 이용 규칙: 초당 1회
  const wait = lastCall + 1100 - Date.now();
  lastCall = Date.now() + Math.max(0, wait);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));

  try {
    const url = `${REVERSE_GEOCODE_URL}?format=jsonv2&lat=${loc.lat}&lon=${loc.lng}&zoom=16&accept-language=ko`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const a = (await res.json()).address ?? {};
    const dong = a.suburb || a.quarter || a.town || a.village || a.borough || a.city_district || null;
    cache.set(key, dong);
    return dong;
  } catch {
    return null;
  }
}
