import { dbzRGB, LEVEL } from './map.js';
export function initStorm(el, N = 48) {
  const T = window.THREE, r = new T.WebGLRenderer({ antialias: true }); r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); r.setClearColor(0xe6e8df); el.appendChild(r.domElement);
  const scene = new T.Scene(), cam = new T.PerspectiveCamera(40, 1, .1, 500);
  scene.add(new T.AmbientLight(0xffffff, .75)); const sun = new T.DirectionalLight(0xffffff, .6); sun.position.set(30, 60, 20); scene.add(sun);
  scene.add(new T.GridHelper(N, 8, 0x9fb0ba, 0xc5d1d8));
  const mesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshLambertMaterial(), N * N); scene.add(mesh);
  const bolts = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0x12263a })); scene.add(bolts);
  const pins = new T.Group(); scene.add(pins);
  const d = new T.Object3D(), col = new T.Color(); let az = .8, el_ = .75, dist = 70, drag = null;
  const view = () => { cam.position.set(dist * Math.cos(el_) * Math.sin(az), dist * Math.sin(el_), dist * Math.cos(el_) * Math.cos(az)); cam.lookAt(0, 3, 0); r.render(scene, cam); };
  const cv = r.domElement;
  cv.onpointerdown = e => { drag = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); }; cv.onpointerup = () => drag = null;
  cv.onpointermove = e => { if (!drag) return; az -= (e.clientX - drag[0]) * .008; el_ = Math.max(.15, Math.min(1.45, el_ + (e.clientY - drag[1]) * .008)); drag = [e.clientX, e.clientY]; view(); };
  cv.onwheel = e => { e.preventDefault(); dist = Math.max(25, Math.min(120, dist + e.deltaY * .05)); view(); };
  return {
    resize() { const w = el.clientWidth, h = el.clientHeight; r.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); view(); },
    pins(vs) { pins.clear(); vs.forEach(v => { const hgt = 3 + v.pop / 700, m = new T.Mesh(new T.CylinderGeometry(.35, .35, hgt, 12), new T.MeshLambertMaterial({ color: LEVEL[v.level] }));
      m.position.set(v.x - N / 2 + .5, hgt / 2, v.y - N / 2 + .5); pins.add(m); }); },
    update(z, strikes) {
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const v = z[j][i], h = v < 8 ? .001 : (v - 6) * .14, c = dbzRGB(v) || [200, 210, 215];
        d.position.set(i - N / 2 + .5, h / 2, j - N / 2 + .5); d.scale.set(.92, h, .92); d.updateMatrix(); mesh.setMatrixAt(j * N + i, d.matrix); mesh.setColorAt(j * N + i, col.setRGB(c[0] / 255, c[1] / 255, c[2] / 255)); }
      mesh.instanceMatrix.needsUpdate = mesh.instanceColor.needsUpdate = true;
      const p = []; strikes.forEach(([x, y]) => { const px = x - N / 2 + .5, pz = y - N / 2 + .5, h = Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233) * 43758.5453, q = h - Math.floor(h), top = 4 + q * 6; p.push(px, top, pz, px + (q - .5) * 1.4, 0, pz + (q * .73 - .5) * 1.4); });
      bolts.geometry.setAttribute('position', new T.Float32BufferAttribute(p, 3)); view();
    } };
}
