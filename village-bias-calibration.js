/* =========================================================
   PHASE G — VILLAGE BIAS CALIBRATION
   ========================================================= */
(() => {
"use strict";
const URL="./data/village-bias-calibration.json";
let db=null, latest=null;

const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

function selected(){
 const l=window.RRP_SELECTED_LOCATION;
 if(!l)return null;
 return {name:l.name||"Selected village",district:l.district||l.districtName||"",latitude:num(l.latitude),longitude:num(l.longitude)};
}
function districtKey(v){return String(v||"").trim().toLowerCase();}
async function load(){
 try{const r=await fetch(URL,{cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);db=await r.json();return db;}
 catch(e){console.warn("[RRP Phase G]",e);return null;}
}
function getDistrictPrior(loc){
 if(!db||!loc)return null;
 const exact=db.districtPriors?.[districtKey(loc.district)];
 if(exact)return exact;
 const entries=Object.entries(db.districtPriors||{});
 const n=districtKey(loc.district);
 return entries.find(([k,v])=>k.includes(n)||n.includes(k))?.[1]||null;
}
function correctionFor(modelId,prior){
 const m=prior?.models?.[modelId];
 if(!m)return {mm:0,source:"no calibration",confidence:"none"};
 const mae=num(m.maeMm,0), bias=num(m.biasMm,0);
 // Convert additive daily bias into a bounded multiplicative adjustment.
 const factor=clamp(1-(bias/Math.max(5,Math.abs(bias)+mae*2+5)),0.70,1.30);
 return {mm:bias,factor,source:prior.source||"district prior",confidence:m.samples>=60?"moderate":"low",samples:m.samples};
}
function apply(){
 const loc=selected(), ens=window.RRP_ENSEMBLE?.getLatest?.();
 if(!loc||!ens||!db)return null;
 const prior=getDistrictPrior(loc);
 if(!prior)return {location:loc,available:false,reason:"No verified calibration prior for this district."};
 const models=(ens.models||[]).map(m=>{
   const c=correctionFor(m.id,prior);
   return {...m,calibration:c,correctedNext24:m.next24?.mean==null?null:Math.max(0,m.next24.mean*c.factor)};
 });
 const raw=ens.aggregate?.mean;
 const corrected=models.filter(m=>Number.isFinite(m.correctedNext24)).reduce((s,m)=>s+m.correctedNext24,0)/(models.filter(m=>Number.isFinite(m.correctedNext24)).length||1);
 return latest={location:loc,available:true,source:db.warning||"calibration database",prior,rawNext24:num(raw),correctedNext24:corrected,models,generatedAt:new Date().toISOString()};
}
function render(x){
 const el=document.getElementById("villageCalibration");if(!el)return;
 if(!x){el.innerHTML="⏳ Calibration waiting for ensemble forecast...";return;}
 if(!x.available){el.innerHTML=`<div class="calibration-muted">ℹ️ ${esc(x.reason)}</div>`;return;}
 const isPrior=true;
 el.innerHTML=`
 <div class="calibration-head"><div><strong>🌾 Phase G — Village Bias Calibration</strong><small>${esc(x.location.name)} · ${esc(x.location.district||"District not mapped")}</small></div><span>District prior</span></div>
 <div class="calibration-grid">
  <div><span>Raw ensemble</span><strong>${x.rawNext24.toFixed(1)} mm</strong></div>
  <div><span>Calibrated estimate</span><strong>${x.correctedNext24.toFixed(1)} mm</strong></div>
  <div><span>Models calibrated</span><strong>${x.models.length}</strong></div>
 </div>
 <p class="calibration-note">Calibration abhi district-level verification prior par based hai. Jab independent village observations available hongi, Phase G unhe district prior se priority dega. Reanalysis-derived calibration ko ground-truth accuracy nahi maana gaya hai.</p>`;
}
async function run(){
 if(!db)await load();
 const x=apply();render(x);
 if(x)window.dispatchEvent(new CustomEvent("rrp:village-calibration-updated",{detail:x}));
}
window.RRP_VILLAGE_CALIBRATION={run,getLatest:()=>latest};
window.addEventListener("rrp:ensemble-updated",()=>setTimeout(run,100));
window.addEventListener("rrp:location-selected",()=>setTimeout(run,700));
document.addEventListener("DOMContentLoaded",()=>setTimeout(run,2200));
})();