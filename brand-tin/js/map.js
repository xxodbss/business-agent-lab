import { currentLocation } from './geo.js';
import { FALLBACK_CENTER, TILE_URL, TILE_ATTRIBUTION } from './config.js';
import { renderHanji } from './hanji.js';

const PIECE_ZOOM = 16; // 이 줌 이상으로 확대하면 틴 대신 가게별 조각이 보인다

function baseMap(el, center, zoom) {
  const map = L.map(el, { zoomControl: false, attributionControl: true }).setView([center.lat, center.lng], zoom);
  L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
  map.attributionControl.setPrefix(false);
  return map;
}

// 첫 화면 지도: 동네마다 틴 마커, 확대하면 가게별 한지 조각
export class MapView {
  constructor(el, { onTin, onPiece }) {
    this.onTin = onTin;
    this.onPiece = onPiece;
    this.markers = [];
    this.me = null;
    this.thumbs = new Map();
    this.map = window.L ? baseMap(el, FALLBACK_CENTER, 14) : null;
    this.map?.on('zoomend', () => this.applyZoom());
    this.ready = Promise.resolve(Boolean(this.map));
  }

  get available() {
    return Boolean(this.map);
  }

  center() {
    if (!this.map) return null;
    const c = this.map.getCenter();
    return { lat: c.lat, lng: c.lng };
  }

  relayout() {
    this.map?.invalidateSize();
  }

  // tins: [{ id, label, count, loc }], pieces: [{ piece, img }]
  render(tins, pieces) {
    if (!this.map) return;
    this.markers.forEach((m) => m.marker.remove());
    this.markers = [];

    for (const t of tins) {
      if (!t.loc) continue;
      const el = document.createElement('div');
      el.className = 'tin-marker';
      el.innerHTML = `<span class="tin-marker-can"></span><span class="tin-marker-tape"></span><b></b>`;
      el.querySelector('.tin-marker-tape').textContent = t.label;
      el.querySelector('b').textContent = t.count;
      this.add(el, t.loc, 'tin', () => this.onTin(t.id));
    }

    for (const { piece, img } of pieces) {
      if (!piece.loc) continue;
      const el = document.createElement('div');
      el.className = 'piece-marker';
      el.style.setProperty('--tilt', `${((piece.seed % 13) - 6) * 1.2}deg`);
      el.appendChild(this.thumb(piece, img));
      this.add(el, piece.loc, 'piece', () => this.onPiece(piece, img));
    }
    this.applyZoom();
  }

  // 마커 크기는 CSS가 정하고, 위치 맞춤도 CSS transform으로 한다 (.tin-marker, .piece-marker)
  add(el, loc, kind, onClick) {
    const icon = L.divIcon({ html: el, className: 'marker-host', iconSize: [0, 0], iconAnchor: [0, 0] });
    const marker = L.marker([loc.lat, loc.lng], { icon, keyboard: false }).on('click', onClick);
    this.markers.push({ marker, kind });
  }

  thumb(piece, img) {
    let src = this.thumbs.get(piece.id);
    if (!src) {
      src = renderHanji(img, piece.seed, 120).toDataURL();
      this.thumbs.set(piece.id, src);
    }
    const i = new Image();
    i.src = src;
    i.alt = piece.name || '';
    return i;
  }

  applyZoom() {
    const close = this.map.getZoom() >= PIECE_ZOOM;
    for (const m of this.markers) {
      const show = (m.kind === 'piece') === close;
      if (show && !this.map.hasLayer(m.marker)) m.marker.addTo(this.map);
      if (!show && this.map.hasLayer(m.marker)) m.marker.remove();
    }
  }

  // 수집한 조각이 있으면 모두 보이게, 없으면 내 위치로
  async fit(locs) {
    if (!this.map) return;
    if (locs.length > 1) {
      this.map.fitBounds(
        locs.map((l) => [l.lat, l.lng]),
        { paddingTopLeft: [40, 90], paddingBottomRight: [40, 150], maxZoom: 15 }
      );
    } else if (locs.length === 1) {
      this.map.setView([locs[0].lat, locs[0].lng], 15);
    } else {
      await this.locate();
    }
  }

  async locate() {
    if (!this.map) return null;
    const loc = await currentLocation();
    if (!loc) return null;
    if (!this.me) {
      const icon = L.divIcon({ html: '<div class="me-dot"></div>', className: 'marker-host', iconSize: [0, 0], iconAnchor: [0, 0] });
      this.me = L.marker([loc.lat, loc.lng], { icon, interactive: false, zIndexOffset: -1000 }).addTo(this.map);
    } else {
      this.me.setLatLng([loc.lat, loc.lng]);
    }
    this.map.flyTo([loc.lat, loc.lng], Math.max(this.map.getZoom(), 15), { duration: 0.8 });
    return loc;
  }
}

// 지도 중앙 핀에 맞춰 위치를 고르는 화면. 결과: {lat, lng, source} | null
let pickMap = null;
export async function pickLocation(start) {
  if (!window.L) return null;
  const screen = document.getElementById('pick');
  screen.hidden = false;
  const center = start ?? (await currentLocation(4000)) ?? FALLBACK_CENTER;
  if (!pickMap) pickMap = baseMap(document.getElementById('pick-map'), center, 17);
  pickMap.invalidateSize();
  pickMap.setView([center.lat, center.lng], 17);

  return new Promise((resolve) => {
    const ac = new AbortController();
    const done = (v) => {
      ac.abort();
      screen.hidden = true;
      resolve(v);
    };
    screen.querySelector('[data-action="cancel"]').addEventListener('click', () => done(null), { signal: ac.signal });
    screen.querySelector('[data-action="ok"]').addEventListener(
      'click',
      () => {
        const c = pickMap.getCenter();
        done({ lat: c.lat, lng: c.lng, source: 'manual' });
      },
      { signal: ac.signal }
    );
  });
}
