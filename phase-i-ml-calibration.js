/* =========================================================
   Rajasthan Rain Predictor — Phase I
   ML Calibration & Research Engine v1
   ---------------------------------------------------------
   Purpose:
   - Build an auditable, out-of-sample calibration experiment
     from saved forecast snapshots + actual observations.
   - No production ML activation unless holdout performance
     improves and minimum sample requirements are met.
   - Supports amount calibration and rain/no-rain probability
     calibration using simple, transparent methods.
   - Reanalysis benchmarks are never treated as independent
     ground truth.
   ========================================================= */
(function(){
"use strict";

const CFG={
  version:"phase-i-ml-v1",
  minSamples:60,
  trainFraction:0.70,
  rainThresholds:[2.5,10,25,50,100],
  storageSnapshots:"rrp_forecast_snapshots_v1",
  storageObservations:"rrp_actual_observations_v1",
  storageResult:"rrp_phase_i_ml_result_v1"
};

let latest=null;

function load(key,fallback=[]){
  try{const v=JSON.parse(localStorage.getItem(key)||"null");return v??fallback}catch(e){return fallback}
}
function num(v,d=null){const n=Number(v);return Number.isFinite(n)?n:d}
function round(v,d=3){const n=num(v);if(n===null)return null;const p=10**d;return Math.round(n*p)/p}
function esc(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function mean(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:null}
function rmse(a){return a.length?Math.sqrt(mean(a.map(x=>x*x))):null}
function mae(a){return a.length?mean(a.map(x=>Math.abs(x))):null}
function bias(a){return mean(a)}
function sigmoid(x){return 1/(1+Math.exp(-Math.max(-30,Math.min(30,x))))}
function logit(p){const x=Math.max(.001,Math.min(.999,p));return Math.log(x/(1-x))}
function normDate(v){const m=String(v||"").match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:null}
function modelName(s){
 const t=String(s?.modelId||s?.model||"").toLowerCase();
 if(t.includes("ecmwf"))return "ECMWF";
 if(t.includes("gfs"))return "GFS";
 if(t.includes("icon"))return "ICON";
 return String(s?.model||"UNKNOWN");
}
function obsValue(o){
 return num(o?.rainfallMm ?? o?.observedRainMm ?? o?.precipitationMm ?? o?.rainMm ?? o?.precipitation);
}
function forecastValue(s){return Math.max(0,num(s?.forecastRainMm ?? s?.forecastRainOnlyMm,0));}
function forecastProb(s){
 const p=num(s?.rainProbability);
 return p===null?null:Math.max(0,Math.min(100,p))/100;
}
function sameLocation(s,o){
 const sl=num(s?.latitude),so=num(s?.longitude),ol=num(o?.latitude),oo=num(o?.longitude);
 if([sl,so,ol,oo].every(Number.isFinite))return Math.abs(sl-ol)<=.08&&Math.abs(so-oo)<=.08;
 const a=String(s?.locationName||s?.name||"").trim().toLowerCase();
 const b=String(o?.locationName||o?.name||"").trim().toLowerCase();
 return !!a&&a===b;
}
function pairs(){
 const snaps=load(CFG.storageSnapshots,[]), obs=load(CFG.storageObservations,[]);
 const byKey=new Map();
 obs.forEach(o=>{const d=normDate(o?.validDate||o?.date||o?.observationDate||o?.timestamp); if(!d)return; const k=d+"|"+(String(o?.locationName||o?.name||"").toLowerCase()); if(!byKey.has(k))byKey.set(k,o)});
 const out=[];
 snaps.forEach(s=>{
   const d=normDate(s?.validDate||s?.date); if(!d)return;
   for(const o of obs){
     const od=normDate(o?.validDate||o?.date||o?.observationDate||o?.timestamp);
     if(od!==d||!sameLocation(s,o))continue;
     const y=obsValue(o); if(y===null)continue;
     const x=forecastValue(s), p=forecastProb(s);
     out.push({date:d,model:modelName(s),x,y,p,forecastCreatedAt:s.forecastCreatedAt||null});
     break;
   }
 });
 return out;
}
function split(data){
 const sorted=[...data].sort((a,b)=>String(a.date+a.model).localeCompare(String(b.date+b.model)));
 const n=Math.floor(sorted.length*CFG.trainFraction);
 return {train:sorted.slice(0,n),test:sorted.slice(n)};
}
function linearFit(rows){
 if(rows.length<2)return null;
 const mx=mean(rows.map(r=>r.x)),my=mean(rows.map(r=>r.y));
 let den=0,numr=0;
 rows.forEach(r=>{den+=(r.x-mx)**2;numr+=(r.x-mx)*(r.y-my)});
 const slope=den>1e-9?numr/den:1;
 const intercept=my-slope*mx;
 return {slope:Math.max(0,slope),intercept};
}
function amountModel(train){
 const fit=linearFit(train);
 return fit;
}
function amountMetrics(rows,predict){
 if(!rows.length)return null;
 const e=rows.map(r=>predict(r)-r.y);
 return {samples:rows.length,mae:round(mae(e),3),rmse:round(rmse(e),3),bias:round(bias(e),3)};
}
function probabilityFit(train,threshold){
 const usable=train.filter(r=>r.p!==null);
 if(usable.length<20)return null;
 let a=0,b=1;
 for(let iter=0;iter<60;iter++){
   let gA=0,gB=0,hAA=0,hAB=0,hBB=0;
   usable.forEach(r=>{
     const z=a+b*logit(r.p), q=sigmoid(z), y=r.y>=threshold?1:0, w=Math.max(.02,q*(1-q));
     gA+=y-q;gB+=(y-q)*logit(r.p);hAA+=w;hAB+=w*logit(r.p);hBB+=w*logit(r.p)**2;
   });
   const det=hAA*hBB-hAB*hAB;if(Math.abs(det)<1e-9)break;
   const da=(gA*hBB-gB*hAB)/det, db=(hAA*gB-hAB*gA)/det;
   a+=da;b+=db;if(Math.abs(da)+Math.abs(db)<1e-5)break;
   a=Math.max(-8,Math.min(8,a));b=Math.max(-8,Math.min(8,b));
 }
 return {intercept:a,slope:b,samples:usable.length};
}
function brier(rows,predict,threshold){
 const u=rows.filter(r=>r.p!==null); if(!u.length)return null;
 return mean(u.map(r=>{const y=r.y>=threshold?1:0;const p=predict(r);return(p-y)**2}));
}
function run(){
 const all=pairs(), byModel={};
 ["ECMWF","GFS","ICON"].forEach(m=>byModel[m]=all.filter(r=>r.model===m));
 const result={version:CFG.version,generatedAt:new Date().toISOString(),source:"browser localStorage forecast snapshots + actual observations",models:{},productionActivation:false};
 for(const m of Object.keys(byModel)){
   const data=byModel[m], sp=split(data), fit=amountModel(sp.train);
   const rawAmount=amountMetrics(sp.test,r=>r.x);
   const calibratedAmount=fit?amountMetrics(sp.test,r=>Math.max(0,fit.slope*r.x+fit.intercept)):null;
   const probabilities={};
   for(const th of CFG.rainThresholds){
     const pf=probabilityFit(sp.train,th);
     if(pf){
       const rawBrier=brier(sp.test,r=>r.p,th);
       const calBrier=brier(sp.test,r=>sigmoid(pf.intercept+pf.slope*logit(r.p)),th);
       probabilities[th]={model:pf,rawBrier:round(rawBrier,5),calibratedBrier:round(calBrier,5),holdoutImproved:Number.isFinite(calBrier)&&Number.isFinite(rawBrier)?calBrier<rawBrier:null};
     }
   }
   const amountImproved=!!(rawAmount&&calibratedAmount&&calibratedAmount.mae<rawAmount.mae&&calibratedAmount.rmse<=rawAmount.rmse);
   result.models[m]={samples:data.length,trainSamples:sp.train.length,holdoutSamples:sp.test.length,amountFit:fit,rawAmount,calibratedAmount,amountImproved,probabilities};
   if(data.length>=CFG.minSamples && amountImproved)result.productionActivation=true;
 }
 latest=result;
 try{localStorage.setItem(CFG.storageResult,JSON.stringify(result))}catch(e){}
 render(result);
 return result;
}
function render(r){
 const el=document.getElementById("phaseIML");
 if(!el)return;
 const cards=Object.entries(r.models).map(([m,x])=>{
   const amt=x.amountImproved?"Holdout improvement":"Research only";
   return `<div class="ml-model"><strong>${esc(m)}</strong><span>Matched samples</span><b>${x.samples}</b><span>Holdout MAE raw → calibrated</span><b>${x.rawAmount?.mae??"—"} → ${x.calibratedAmount?.mae??"—"} mm</b><em class="${x.amountImproved?"ml-pass":"ml-pending"}">${amt}</em></div>`
 }).join("");
 const active=r.productionActivation&&Object.values(r.models).some(x=>x.samples>=CFG.minSamples);
 el.innerHTML=`<div class="ml-head"><div><h2>🧠 Phase I — ML Calibration & Research</h2><small>Out-of-sample calibration; production activation is locked until holdout improvement is demonstrated.</small></div><span class="ml-badge">${active?"HOLDOUT PASS":"RESEARCH MODE"}</span></div><div class="ml-grid">${cards}</div><div class="ml-note">Matched data: <strong>${Object.values(r.models).reduce((s,x)=>s+x.samples,0)}</strong>. Train/test split: 70/30 by chronological ordering. Rain probability calibration uses logistic calibration where enough probability observations exist. Metrics are calculated from independent observations stored in this browser. Reanalysis-derived regional database remains a research benchmark, not independent ground truth.</div>`;
}
window.RRP_ML={version:CFG.version,run,getLatest:()=>latest,config:CFG};
window.addEventListener("rrp:forecast-snapshots-updated",()=>setTimeout(run,250));
window.addEventListener("rrp:weather-updated",()=>setTimeout(run,750));
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>setTimeout(run,1500));else setTimeout(run,1500);
})();