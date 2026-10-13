// 지도 타일: OpenStreetMap 공용 타일 (키 불필요, 가벼운 사용만 허용). 실서비스라면 카카오/네이버로 교체.
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// 좌표 → 동네 이름. Nominatim 공용 서버는 초당 1회까지만 허용한다.
export const REVERSE_GEOCODE_URL = 'https://nominatim.openstreetmap.org/reverse';

// 위치를 전혀 알 수 없을 때 지도 중심 (서울시청)
export const FALLBACK_CENTER = { lat: 37.5665, lng: 126.978 };
