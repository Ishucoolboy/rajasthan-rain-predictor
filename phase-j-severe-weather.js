/* =========================================================
   Rajasthan Rain Predictor — Phase J
   Lightning & Severe Weather Intelligence v1
   ---------------------------------------------------------
   Uses model-derived CAPE, lightning density/potential,
   gusts, precipitation and thunderstorm weather codes.
   This is a forecast signal, NOT an observed lightning detector.
   ========================================================= */
(function(){
"use strict";
const API="https://api.open-meteo.com/v1/forecast";
const MODELS=[
 {name:"ECMWF",id:"ecmwf_ifs025"},
 {name:"GFS",id:"gfs_seamless"},
 {name:"ICON",id:"icon_seamless"}
];
let latest=null;
function num(v,d=null){const n=Number(v);return Number.isFinite(n)?n:d}
function esc(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function selected(){const l=window.RRP_SELECTED_LOCATION;if(!l)return null;return {name:l.name||"Selected Location",latitude:num(l.latitude),longitude:num(l.longitude)}}
function idx(times){if(!times?.length)return 0;const now=Date.now();let bi=0,bd=Infinity;times.forEach((t,i)=>{const d=Math.abs(new Date(t).getTime()-now);if(Number.isFinite(d)&&d<bd){bd=d;bi=i}});return bi}
async function fetchModel(loc,m){
 const p=new URLSearchParams({latitude:loc.latitude,longitude:loc.longitude,hourly:"precipitation,precipitation_probability,weather_code,cape,lightning_density,lightning_potential,wind_gusts_10m,cloud_cover,pressure_msl,visibility",forecast_days:"3",timezone:"Asia/Kolkata",models:m.id,precipitation_unit:"mm"});
 const r=await fetch(API+"?"+p.toString(),{cache:"no-store"});if(!r.ok)throw new Error(m.name+" HTTP "+r.status);
 const d=await r.json(),h=d.hourly||{},times=h.time||[],i=idx(times);
 const arr=(k)=>Array.isArray(h[k])?h[k].map(x=>num(x,0)):[];
 const rain=arr("precipitation"),prob=arr("precipitation_probability"),cape=arr("cape"),ld=arr("lightning_density"),lp=arr("lightning_potential"),gust=arr("wind_gusts_10m"),code=arr("weather_code"),cloud=arr("cloud_cover"),vis=arr("visibility");
 const end=i+24;
 const max=(a)=>a.slice(i,end).reduce((x,y)=>Math.max(x,y),0);
 const sum=(a)=>a.slice(i,end).reduce((x,y)=>x+y,0);
 const thunderCodes=code.slice(i,end).filter(x=>[95,96,99].includes(x)).length;
 return {name:m.name,id:m.id,next24Rain:sum(rain),peakProb:max(prob),maxCape:max(cape),maxLightningDensity:max(ld),maxLightningPotential:max(lp),maxGust:max(gust),thunderHours:thunderCodes,maxCloud:max(cloud),minVisibility:Math.min(...vis.slice(i,end).filter(x=>x>0)),rawCount:rain.slice(i,end).length};
}
function severity(rows){
 if(!rows.length)return {level:"UNAVAILABLE",score:0,signals:[]};
 const mean=k=>rows.reduce((s,r)=>s+r[k],0)/rows.length;
 const signals=[];
 const avgRain=mean("next24Rain"), peakProb=Math.max(...rows.map(r=>r.peakProb)), maxCape=Math.max(...rows.map(r=>r.maxCape)), maxLD=Math.max(...rows.map(r=>r.maxLightningDensity)), maxLP=Math.max(...rows.map(r=>r.maxLightningPotential)), maxGust=Math.max(...rows.map(r=>r.maxGust)), th=rows.reduce((s,r)=>s+r.thunderHours,0), cloud=Math.max(...rows.map(r=>r.maxCloud));
 let score=0;
 if(peakProb>=70){score+=1;signals.push("high rain probability")}
 if(avgRain>=10){score+=1;signals.push("heavy-rain potential")}
 if(maxCape>=1000){score+=2;signals.push("strong CAPE")}
 else if(maxCape>=500){score+=1;signals.push("elevated CAPE")}
 if(maxGust>=60){score+=2;signals.push("strong gust potential")}
 else if(maxGust>=40){score+=1;signals.push("gust potential")}
 if(maxLD>0||maxLP>0){score+=2;signals.push("model lightning signal")}
 if(th>=1){score+=2;signals.push("thunderstorm weather code")}
 if(cloud>=90&&avgRain>=5){score+=1;signals.push("deep cloud/rain combination")}
 let level=score>=7?"SEVERE":score>=5?"HIGH":score>=3?"ELEVATED":"LOW";
 return {level,score,signals,metrics:{avgRain,peakProb,maxCape,maxLD,maxLP,maxGust,thunderHours:th,maxCloud:cloud}};
}
function render(x){
 const el=document.getElementById("severeWeatherIntel");if(!el)return;
 const s=x.severity;
 const badge=s.level==="SEVERE"?"severe":s.level==="HIGH"?"high":s.level==="ELEVATED"?"elevated":"low";
 const rows=x.models.map(r=>`<div class="severe-model"><strong>${esc(r.name)}</strong><span>Rain 24h</span><b>${r.next24Rain.toFixed(1)} mm</b><span>CAPE</span><b>${r.maxCape.toFixed(0)} J/kg</b><span>Gust</span><b>${r.maxGust.toFixed(0)} km/h</b><span>Lightning</span><b>${(r.maxLightningDensity||r.maxLightningPotential||0).toFixed(2)}</b></div>`).join("");
 el.innerHTML=`<div class="severe-head"><div><h2>⚡ Phase J — Lightning & Severe Weather</h2><small>Model-derived convective risk for the next 24 hours.</small></div><span class="severe-badge ${badge}">${s.level}</span></div><div class="severe-summary"><div><span>Risk score</span><strong>${s.score}/10+</strong></div><div><span>Peak rain probability</span><strong>${s.metrics.peakProb.toFixed(0)}%</strong></div><div><span>Max CAPE</span><strong>${s.metrics.maxCape.toFixed(0)}</strong></div><div><span>Max gust</span><strong>${s.metrics.maxGust.toFixed(0)} km/h</strong></div></div><div class="severe-models">${rows}</div><div class="severe-signals"><strong>Signals:</strong> ${s.signals.length?s.signals.map(esc).join(" • "):"No strong severe-weather signal detected."}</div><p class="severe-note">⚠️ CAPE/lightning/gust values are forecast-model signals, not real-time lightning observations. Lightning density/potential availability can vary by model/API. This panel does not replace IMD warnings or local alerts. If official warnings are issued, follow them.</p>`;
}
async function run(){
 const loc=selected();if(!loc||!Number.isFinite(loc.latitude)||!Number.isFinite(loc.longitude))return;
 const out=[],errors={};for(const m of MODELS){try{out.push(await fetchModel(loc,m))}catch(e){errors[m.name]=String(e)}}
 latest={location:loc,models:out,errors,severity:severity(out),generatedAt:new Date().toISOString()};window.RRP_SEVERE_WEATHER=latest;render(latest);
 return latest;
}
window.RRP_SEVERE_WEATHER_ENGINE={run,getLatest:()=>latest};
window.addEventListener("rrp:location-selected",()=>setTimeout(run,300));
window.addEventListener("rrp:weather-updated",()=>setTimeout(run,500));
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>setTimeout(run,1800));else setTimeout(run,1800);
})();