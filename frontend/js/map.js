export const STOPS = [[8,[90,160,200]],[20,[70,170,120]],[30,[220,210,80]],[40,[240,150,50]],[50,[220,60,50]],[60,[200,50,160]],[75,[70,70,70]]];
export const LEVEL = { green: '#3f9a62', yellow: '#d4a72c', orange: '#e0722a', red: '#c8372f' };
export function dbzRGB(v) {
  if (v < 8) return null;
  for (let i = 1; i < STOPS.length; i++) if (v <= STOPS[i][0]) { const [a, ca] = STOPS[i-1], [b, cb] = STOPS[i], f = (v - a) / (b - a); return ca.map((c, k) => c + (cb[k] - c) * f); }
  return STOPS.at(-1)[1];
}
export class Map2D {
  constructor(c) { this.c = c; this.g = c.getContext('2d'); this.W = c.width; this.probe = null; this.off = document.createElement('canvas'); }
  layer(grid, fn) {
    const n = grid.length, o = this.off; o.width = o.height = n;
    const x = o.getContext('2d'), im = x.createImageData(n, n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const p = fn(grid[j][i], i, j); if (p) im.data.set(p, (j * n + i) * 4); }
    x.putImageData(im, 0, 0); this.g.imageSmoothingEnabled = true; this.g.imageSmoothingQuality = 'high'; this.g.drawImage(o, 0, 0, this.W, this.W);
  }
  draw(f, m, L, D, t, radOnly) {
    const g = this.g, W = this.W, s = W / m.n, P = (x) => (x + .5) * s;
    g.fillStyle = '#dfe7ea'; g.fillRect(0, 0, W, W);
    g.font = '12px "Instrument Sans",sans-serif'; g.strokeStyle = 'rgba(18,38,58,.09)'; g.fillStyle = '#66798a'; g.lineWidth = 1;
    for (let km = 0; km <= 240; km += 60) { const p = km / 5 * s; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, W); g.moveTo(0, p); g.lineTo(W, p); g.stroke(); if (km && km < 240) { g.fillText(km + ' km', p + 4, W - 6); g.fillText(km + ' km', 6, p - 4); } }
    // The prototype has no geographic boundary dataset. These quiet, dashed
    // contours are explicitly illustrative so they cannot be mistaken for maps.
    g.save(); g.strokeStyle = 'rgba(53,75,62,.38)'; g.lineWidth = 1.5; g.setLineDash([5, 5]);
    [[[-2,4],[9,2],[17,6],[22,13],[20,21],[12,25],[5,23],[0,17],[-2,4]],[[20,0],[25,7],[33,10],[37,17],[35,25],[40,32],[36,40],[28,44],[22,39],[24,31],[18,25],[20,17],[16,10],[20,0]]].forEach(path=>{g.beginPath();path.forEach(([x,y],i)=>i?g.lineTo(P(x),P(y)):g.moveTo(P(x),P(y)));g.stroke()});
    g.setLineDash([]); g.font='9px "DM Mono",monospace';g.fillStyle='rgba(53,75,62,.7)';g.fillText('WEST AREA · GUIDE ONLY',P(2),P(21));g.fillText('EAST AREA · GUIDE ONLY',P(28),P(43));g.fillText('ILLUSTRATIVE OUTLINE',12, W-35);g.restore();
    if (L.sat) this.layer(f.bt, b => { const v = Math.max(0, Math.min(1, (290 - b) / 85)); return [30, 55, 80, 255 * v * .75]; });
    if (L.cape) this.layer(f.cape, c => { const v = Math.max(0, Math.min(1, (c - 800) / 2400)); return [235, 140, 40, 255 * v * .5]; });
    if (L.prob && f.p) this.layer(f.p, p => p < 15 ? null : [90, 50, 170, 255 * Math.min(.6, p / 140)]);
    if (L.rad) this.layer(f.z, (v, i, j) => { if (radOnly && !m.cov[j][i]) return null; const c = dbzRGB(v); return c && [...c, 225]; });
    if (L.virt) { this.layer(m.cov, (v, i, j) => v ? null : [90, 50, 170, 50]); g.save(); g.fillStyle = '#5a32aa'; g.font = '12px "Instrument Sans"'; g.fillText('No radar here. Reflectivity is estimated from IR, strikes and CAPE.', 12, W - 22); g.restore(); }
    m.radars.forEach(([x, y], i) => { g.strokeStyle = 'rgba(18,38,58,.35)'; g.setLineDash([4, 5]); g.beginPath(); g.arc(P(x), P(y), m.radar_range * s, 0, 7); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#12263a'; g.fillRect(P(x) - 4, P(y) - 4, 8, 8); g.fillText('Radar ' + 'AB'[i], P(x) + 8, P(y) + 4); });
    if (L.ltg) { g.strokeStyle = '#12263a'; g.lineWidth = 1.5; f.strikes.forEach(([x, y]) => { const px = x * s + s / 2, py = y * s + s / 2; g.beginPath(); g.moveTo(px - 4, py); g.lineTo(px + 4, py); g.moveTo(px, py - 4); g.lineTo(px, py + 4); g.stroke(); }); }
    if (L.cells) D.cells.forEach(c => { const [vx, vy] = m.vel, e = 18, a = Math.atan2(vy, vx), nx = -Math.sin(a), ny = Math.cos(a), w = 1.2 + .22 * e;
      g.fillStyle = 'rgba(90,50,170,.13)'; g.beginPath(); g.moveTo(P(c.x), P(c.y)); g.lineTo(P(c.x + vx * e + nx * w), P(c.y + vy * e + ny * w)); g.lineTo(P(c.x + vx * e - nx * w), P(c.y + vy * e - ny * w)); g.fill();
      g.strokeStyle = '#5a32aa'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(P(c.x), P(c.y)); g.lineTo(P(c.x + vx * e), P(c.y + vy * e)); g.stroke();
      const k = Math.max(0, t), cx = P(c.x + vx * k), cy = P(c.y + vy * k); g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, 7, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#5a32aa'; g.fillText(c.id + (c.jump ? ' jump' : ''), cx + 10, cy - 8); });
    D.villages.forEach(v => { const px = P(v.x), py = P(v.y); if(L.vil){g.fillStyle = LEVEL[v.level];g.strokeStyle='#fff';g.lineWidth=2;g.beginPath();g.arc(px,py,4+v.pop/1100,0,7);g.fill();g.stroke()}else{g.fillStyle='rgba(32,42,41,.7)';g.beginPath();g.arc(px,py,2.2,0,7);g.fill()}
      g.font='10px "DM Sans",sans-serif';g.lineWidth=3;g.strokeStyle='rgba(255,254,250,.9)';g.strokeText(v.name,px+7,py-5);g.fillStyle='#28342f';g.fillText(v.name,px+7,py-5); });
    if(this.selectedPlace){const v=D.villages.find(x=>x.name.toLowerCase()===this.selectedPlace.toLowerCase());if(v){g.save();g.strokeStyle='#b54c31';g.lineWidth=2;g.beginPath();g.arc(P(v.x),P(v.y),12,0,Math.PI*2);g.stroke();g.fillStyle='#b54c31';g.font='bold 11px "DM Sans",sans-serif';g.fillText(v.name,P(v.x)+12,P(v.y)+14);g.restore()}}
    if (this.probe) { const [i, j] = this.probe; g.strokeStyle = '#12263a'; g.lineWidth = 2; g.strokeRect(i * s, j * s, s, s); }
  }
  cellAt(e, n) { const r = this.c.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / r.width * n), Math.floor((e.clientY - r.top) / r.height * n)]; }
}
