import { Map2D, LEVEL } from './map.js';
import { initStorm } from './storm3d.js';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const map = new Map2D($('#map')); let storm = null, D = null, t = 0, step = 'observe', view = 'map', timer = null, probe = null, xai = null;
const approved = new Set();
const PRE = { observe: { sat: 1, cape: 0, rad: 1, ltg: 1, prob: 0, cells: 0, vil: 0, virt: 0 }, fuse: { sat: 0, cape: 0, rad: 1, ltg: 0, prob: 0, cells: 0, vil: 0, virt: 1 },
  predict: { sat: 0, cape: 0, rad: 1, ltg: 1, prob: 1, cells: 1, vil: 0, virt: 0 }, act: { sat: 0, cape: 0, rad: 1, ltg: 0, prob: 1, cells: 0, vil: 1, virt: 0 } };
const layerInfo = {sat:['Satellite cloud tops','#405e7b'],cape:['CAPE environment','#e58b35'],rad:['Radar reflectivity','#b54c31'],ltg:['Lightning strikes','#353a35'],prob:['Lightning probability','#75559b'],cells:['Tracked cell paths','#6f569a'],vil:['Village exposure markers','#a14b36'],virt:['Radar coverage gaps','#8e75aa']};
const L = () => Object.fromEntries($$('.chips input').map(i => [i.id.slice(2), i.checked]));
const dir = d => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct = a => Math.round(100 * a.flat().reduce((x,y)=>x+y,0) / (a.length * a[0].length));
function updateLegend(){
  const layers=L(),active=Object.entries(layers).filter(([,on])=>on).map(([key])=>{const [label,color]=layerInfo[key];return `<span class="legend-layer"><i style="--layer-color:${color}"></i>${label}</span>`}).join('');
  const reflectivity=layers.rad||layers.virt?'<div class="reflectivity-scale"><b>REFLECTIVITY</b><i></i><span>Light rain</span><span>Steady</span><span>Heavy</span><span>Very intense</span></div>':'';
  $('#legend').innerHTML=`${reflectivity}${active?`<div class="active-layers"><b>ON MAP</b>${active}</div>`:'<div class="active-layers"><b>ON MAP</b><span class="legend-layer">No optional layers selected</span></div>'}`;
}
async function run() {
  const b = $('#run'); b.disabled = true; b.innerHTML = '<span aria-hidden="true">↻</span> Loading';
  try { const r = await fetch(`/api/run?scenario=${encodeURIComponent($('#scn').value)}&seed=${encodeURIComponent($('#seed').value)}`); if (!r.ok) throw new Error('Request failed'); D = await r.json(); }
  catch { $('#clock').innerHTML = 'Demo service unavailable<small>Start the FastAPI server in the backend folder and retry.</small>'; b.disabled = false; b.innerHTML = '<span aria-hidden="true">↻</span> Run cycle'; return; }
  b.disabled = false; b.innerHTML = '<span aria-hidden="true">↻</span> Run cycle'; probe = xai = null; map.probe = null; approved.clear();
  $('#place-list').innerHTML=D.villages.map(v=>`<option value="${esc(v.name)}"></option>`).join(''); storm?.pins(D.villages); setStep(step);
}
function setStep(s) {
  step = s; $$('#steps button').forEach(b => b.classList.toggle('on', b.dataset.s === s));
  Object.entries(PRE[s]).forEach(([k,v]) => {const el=$('#l-'+k); if(el)el.checked=!!v});
  t = (s === 'observe' || s === 'fuse') ? Math.min(t,0) : Math.max(t,3); $('#t').value=t; render();
}
function frame() {
  const h=D.meta.hist, hi=Math.min(t,0)+h, fc=t>0;
  return {z:fc?D.fc.z[t-1]:D.hist.z[hi],p:fc?D.fc.p[t-1]:null,bt:D.hist.bt[fc?h:hi],cape:D.cape,strikes:fc?[]:D.hist.strikes.slice(Math.max(0,hi-2),hi+1).flat()};
}
function render() {
  if(!D)return; const f=frame(),m=D.meta;
  if(view==='map')map.draw(f,m,L(),D,t,step==='observe');else if(storm)storm.update(f.z,f.strikes);
  const lab=t<0?`Observed, ${t*10} min`:t===0?'Observed, now':`Forecast, +${t*10} min`;
  $('#tl').textContent=lab;
  $('#clock').innerHTML=`${lab}<small>${t>m.ai_lead?'NWP blend · confidence '+Math.round(m.conf[t-1]*100)+'%':t>0?'Confidence '+Math.round(m.conf[t-1]*100)+'% · inputs held at analysis time':'Fused grid · 10 min cycle'}</small>`;
  $('#panel').innerHTML=panels[step](f,m); updateLegend();
}
const row=(a,b)=>`<li>${a}<span>${b}</span></li>`;
const riskRank={red:4,orange:3,yellow:2,green:1};
function villagesByRisk(){return D.villages.map((v,i)=>({...v,_i:i})).sort((a,b)=>(riskRank[b.level]-riskRank[a.level])||(a.eta??999)-(b.eta??999)||b.score-a.score)}
const panels={
  observe(f,m){const cov=pct(m.cov),bt=Math.min(...f.bt.flat()),strikes=f.strikes.length;
    return `<p class="panel-eyebrow">01 / OBSERVE</p><h2>Conditions at a glance</h2><div class="stage-summary"><b>${cov}%</b><span>of this simulated grid is within radar range</span></div><ul class="rows">${row('Radar sites','2 synthetic feeds')}${row('Cloud tops',`Coldest ${bt} K`)}${row('Recent lightning',`${strikes} strikes in view`)}${row('Model CAPE',`${Math.max(...D.cape.flat())} J/kg peak`)}</ul><p class="note">The map labels simulated villages and uses illustrative contours. Select a place above to find it.</p>`;},
  fuse(f,m){const cov=pct(m.cov),gap=100-cov;
    return `<p class="panel-eyebrow">02 / FUSE</p><h2>Coverage &amp; estimates</h2><div class="summary-pair"><div><b>${cov}%</b><span>radar observed</span></div><div><b>${gap}%</b><span>estimated gap</span></div></div><ul class="rows">${row('Virtual radar area',`${gap}% of grid`)}${row('Grid resolution','5 km simulated cells')}${row('Update interval','10 minutes')}</ul><p class="note">Dashed contours are illustrative area guides, not administrative boundaries. In uncovered cells, reflectivity is estimated from cloud tops and model fields.</p>`;},
  predict(f,m){const cells=[...D.cells].sort((a,b)=>b.max-a.max),strong=cells[0];
    const rows=cells.map(c=>`<tr><td>${esc(c.id)}</td><td>${c.max} dBZ</td><td>${c.speed} km/h ${dir(c.dir)}</td><td>${c.flashes}${c.jump?' <span class="jump">jump</span>':''}</td></tr>`).join('');
    const names={z:'Reflectivity',bt:'Cloud-top cold',cape:'CAPE (model)',ltg:'Strike density'};
    const bars=xai?Object.entries(xai.terms).map(([k,v])=>`<span>${names[k]||esc(k)}</span><div><em class="${v>=0?'pos':'neg'}" style="width:${Math.min(100,Math.abs(v)*12)}%"></em></div><span class="r">${v>0?'+':''}${v}</span>`).join(''):'';
    return `<p class="panel-eyebrow">03 / FORECAST</p><h2>Storm cells</h2><div class="stage-summary"><b>${cells.length}</b><span>tracked cell${cells.length===1?'':'s'}${strong?` · strongest reaches ${strong.max} dBZ`:''}</span></div><table><thead><tr><th>Cell</th><th>Peak</th><th>Motion</th><th>Lightning</th></tr></thead><tbody>${rows||'<tr><td colspan="4">No cells above 35 dBZ</td></tr>'}</tbody></table><p class="note">A lightning jump marks a recent increase above the cell’s baseline. Select a point on the map to inspect local probability.</p><h2>At selected point</h2>${xai?`<p class="note" style="margin:0 0 8px">${probe[0]}, ${probe[1]} · +${Math.max(1,t)*10} min · <b>${xai.p}% lightning probability</b></p><div class="xai">${bars}</div>`:'<p class="note" style="margin:0">Tap or click the map to inspect a forecast point.</p>'}`;},
  act(){const v=villagesByRisk(),urgent=v.filter(x=>x.level==='red'||x.level==='orange').length;
    const cards=v.map(x=>{const risk=x.level,reason=[`storm probability ${x.peak}%`,`exposure factor ~${Math.round(x.exposure*100)}%`,x.eta?`arrival in ~${x.eta} min`:'risk within 3 h',x.schools?`${x.schools} school${x.schools===1?'':'s'}`:null,x.power?'power-line exposure':null].filter(Boolean).join(' · '),draft=x.cap?`<details class="message-preview"><summary>Preview alert message <span>⌄</span></summary><div class="message-copy"><b>ENGLISH</b><p>${esc(x.text?.en)}</p><b>हिंदी</b><p lang="hi">${esc(x.text?.hi)}</p><b>CAP 1.2 DRAFT</b><pre>${esc(x.cap)}</pre></div></details>`:'';
      return `<article class="village-card"><div class="village-heading"><i style="background:${LEVEL[risk]}"></i><b>${esc(x.name)}</b><span class="risk-tag risk-${risk}">${risk}</span>${x.cap?`<button data-ap="${x._i}" class="review-button ${approved.has(x._i)?'done':''}">${approved.has(x._i)?'Reviewed':'Mark reviewed'}</button>`:'<span class="no-alert">No alert</span>'}</div><p class="village-reason">${esc(reason)}</p><small>Population ${x.pop.toLocaleString()} · exposure ${x.exposure}${x.farm?` · ${x.farm} ha farmland`:''}</small>${draft}</article>`}).join('');
    const V=D.verify,at=[[0,10],[2,30],[5,60],[11,120],[17,180]];
    return `<p class="panel-eyebrow">04 / RESPOND</p><h2>Village alert review</h2><div class="stage-summary"><b>${urgent}</b><span>higher-priority villages · sorted by risk, then arrival time</span></div><div class="village-list">${cards}</div><p class="note">Messages are simulated CAP 1.2 drafts. “Mark reviewed” is a local review state; it does not send or publish an alert.</p><h2>Forecast verification</h2><table><thead><tr><th>Lead</th><th>POD</th><th>FAR</th><th>CSI</th></tr></thead><tbody>${at.map(([k,l])=>`<tr><td>+${l} min</td><td>${V.pod[k]??'-'}</td><td>${V.far[k]??'-'}</td><td>${V.csi[k]??'-'}</td></tr>`).join('')}</tbody></table>`;}
};
async function explain(){if(!probe||step!=='predict')return;try{const r=await fetch(`/api/explain?scenario=${encodeURIComponent($('#scn').value)}&seed=${encodeURIComponent($('#seed').value)}&x=${probe[0]}&y=${probe[1]}&lead=${Math.max(1,t)}`);if(!r.ok)return;xai=await r.json();render()}catch{}}
$('#map').addEventListener('click',e=>{if(!D)return;probe=map.cellAt(e,D.meta.n);map.probe=probe;explain()});
$('#panel').addEventListener('click',e=>{const i=e.target.dataset.ap;if(i!==undefined){approved.add(+i);render()}});
$('#t').addEventListener('input',e=>{t=+e.target.value;render()});$('#t').addEventListener('change',explain);
$$('.chips input').forEach(x=>x.addEventListener('change',render));
$$('#steps button').forEach(b=>b.addEventListener('click',()=>setStep(b.dataset.s)));
$$('.view-switch button').forEach(b=>b.addEventListener('click',()=>{
  view=b.dataset.v;$$('.view-switch button').forEach(x=>{const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-pressed',String(on))});
  $('.map-kicker').innerHTML=view==='3d'?'<span class="live-dot"></span> VOLUME <span class="map-kicker-muted">/ DRAG TO ROTATE · WHEEL TO ZOOM</span>':'<span class="live-dot"></span> REFLECTIVITY <span class="map-kicker-muted">/ 5 KM GRID</span>';
  $('#map').hidden=view!=='map';$('#gl').hidden=view!=='3d';
  if(view==='3d'){
    try{if(!window.THREE)throw new Error('3D library did not load');if(!storm){storm=initStorm($('#gl'));if(D)storm.pins(D.villages)}storm.resize();if(D)storm.update(frame().z,frame().strikes)}
    catch(error){$('#gl').innerHTML='<div class="volume-error"><b>Volume view unavailable</b><span>WebGL could not start in this browser. Try Map view instead.</span></div>';}
  }render();
}));
$('#location-search').addEventListener('change',e=>{const value=e.target.value.trim(),v=D?.villages.find(x=>x.name.toLowerCase()===value.toLowerCase());if(!v){map.selectedPlace=null;render();return}map.selectedPlace=v.name; if(view==='map')render();else{$('.view-switch [data-v="map"]').click()}});
$('#location-search').addEventListener('input',e=>{if(!e.target.value){map.selectedPlace=null;render()}});
$('#clear-location').addEventListener('click',()=>{$('#location-search').value='';map.selectedPlace=null;render();$('#location-search').focus()});
$('#panel-toggle').addEventListener('click',()=>{const hidden=document.body.classList.toggle('panel-collapsed');$('#panel-toggle').setAttribute('aria-expanded',String(!hidden));$('#panel-toggle').setAttribute('aria-label',hidden?'Show details':'Hide details');$('#panel-toggle').innerHTML=hidden?'Show details <span>↙</span>':'Hide details <span>↗</span>';if(view==='3d')requestAnimationFrame(()=>storm?.resize())});
$('#run').addEventListener('click',run);
$('#play').addEventListener('click',()=>{if(timer){clearInterval(timer);timer=null;$('#play').textContent='▶';$('#play').setAttribute('aria-label','Play timeline');return}$('#play').textContent='Ⅱ';$('#play').setAttribute('aria-label','Pause timeline');if(t>=18)t=-6;timer=setInterval(()=>{t=t>=18?-6:t+1;$('#t').value=t;render()},600)});
const guide=$('#welcome');
function closeGuide(){if(guide.open)guide.close();try{localStorage.setItem('tn-guide-seen','1')}catch{}}
$('#welcome-close').addEventListener('click',closeGuide);$('#welcome-start').addEventListener('click',closeGuide);
if(!matchMedia('(min-width: 760px)').matches){document.body.classList.add('panel-collapsed');$('#panel-toggle').setAttribute('aria-expanded','false');$('#panel-toggle').setAttribute('aria-label','Show details');$('#panel-toggle').innerHTML='Show details <span>↙</span>';$('.layer-menu').open=false}
try{if(!localStorage.getItem('tn-guide-seen'))guide.showModal()}catch{guide.showModal()}
addEventListener('resize',()=>{if(view==='3d')storm?.resize()});
run();
