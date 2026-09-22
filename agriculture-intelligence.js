/* =========================================================
   PHASE H — AGRICULTURE INTELLIGENCE
   ========================================================= */
(() => {
"use strict";
const API="https://api.open-meteo.com/v1/forecast";
let latest=null, running=false;
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function loc(){const l=window.RRP_SELECTED_LOCATION;if(!l)return null;return {name:l.name||"Selected village",latitude:num(l.latitude),longitude:num(l.longitude)};}
function sum(a){return (a||[]).reduce((s,v)=>s+Math.max(0,num(v)),0);}
function avg(a){return a.length?a.reduce((s,v)=>s+num(v),0)/a.length:0;}
function riskRain(mm,prob){
 if(mm>=64.5||prob>=85)return["VERY HIGH","Heavy rainfall risk"];
 if(mm>=25||prob>=70)return["HIGH","Significant rainfall risk"];
 if(mm>=10||prob>=50)return["MODERATE","Rain may affect field operations"];
 if(mm>=2.5||prob>=30)return["LOW","Some rain possible"];
 return["LOW","Low rainfall signal"];
}
async function run(){
 if(running)return;const l=loc();if(!l)return;running=true;
 try{
  const p=new URLSearchParams({latitude:l.latitude,longitude:l.longitude,
   hourly:"precipitation,precipitation_probability,temperature_2m,relative_humidity_2m,et0_fao_evapotranspiration,soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm,vapour_pressure_deficit,wind_gusts_10m",
   daily:"precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min,et0_fao_evapotranspiration_sum",
   forecast_days:"7",timezone:"auto"});
  const r=await fetch(API+"?"+p.toString(),{cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);
  const d=await r.json(),h=d.hourly||{},dy=d.daily||{};
  const now=new Date(), times=h.time||[];let idx=0,best=Infinity;
  times.forEach((t,i)=>{const x=Math.abs(new Date(t).getTime()-now.getTime());if(x<best){best=x;idx=i;}});
  const rain24=sum((h.precipitation||[]).slice(idx,idx+24));
  const rain72=sum((h.precipitation||[]).slice(idx,idx+72));
  const probs=(h.precipitation_probability||[]).slice(idx,idx+24).map(num);
  const p24=probs.length?Math.max(...probs):0;
  const soil=avg((h.soil_moisture_0_to_1cm||[]).slice(idx,idx+24));
  const et7=sum(dy.et0_fao_evapotranspiration_sum||[]);
  const [risk,label]=riskRain(rain24,p24);
  latest={location:l,rain24,rain72,probability24:p24,soilMoisture:soil,et0_7d:et7,
   temperatureMax:Math.max(...(dy.temperature_2m_max||[]).map(num),-999),
   temperatureMin:Math.min(...(dy.temperature_2m_min||[]).map(num),999),
   windGust:Math.max(...(h.wind_gusts_10m||[]).slice(idx,idx+24).map(num),0),
   risk,label,generatedAt:new Date().toISOString()};
  render(latest);
  window.dispatchEvent(new CustomEvent("rrp:agri-intelligence-updated",{detail:latest}));
 }catch(e){console.warn("[RRP Phase H]",e);render({error:true});}
 running=false;
}
function render(x){
 const el=document.getElementById("agricultureIntelligence");if(!el)return;
 if(x?.error){el.innerHTML="⚠️ Agriculture weather variables unavailable right now.";return;}
 if(!x){el.innerHTML="⏳ Agriculture intelligence load ho rahi hai...";return;}
 el.innerHTML=`
 <div class="agri-head"><div><strong>🌾 Field & Crop Weather Intelligence</strong><small>${esc(x.location.name)}</small></div><span class="agri-risk agri-${x.risk.toLowerCase().replace(" ","-")}">${x.risk}</span></div>
 <div class="agri-grid">
  <div><span>Rain next 24h</span><strong>${x.rain24.toFixed(1)} mm</strong></div>
  <div><span>Rain next 72h</span><strong>${x.rain72.toFixed(1)} mm</strong></div>
  <div><span>Rain probability</span><strong>${x.probability24.toFixed(0)}%</strong></div>
  <div><span>Surface soil moisture*</span><strong>${x.soilMoisture.toFixed(3)}</strong></div>
  <div><span>7-day ET₀</span><strong>${x.et0_7d.toFixed(1)} mm</strong></div>
  <div><span>Max wind gust</span><strong>${x.windGust.toFixed(0)} km/h</strong></div>
 </div>
 <div class="agri-advice"><strong>${esc(x.label)}</strong><br>Rainfall, soil-moisture and atmospheric-demand indicators ko ek saath dekh kar field planning support diya ja raha hai.</div>
 <p class="agri-note">* Soil moisture model estimate hai, field sensor measurement nahi. Crop-specific irrigation recommendation abhi automatically prescribe nahi ki ja rahi.</p>`;
}
window.RRP_AGRI={run,getLatest:()=>latest};
window.addEventListener("rrp:location-selected",()=>setTimeout(run,700));
window.addEventListener("rrp:ensemble-updated",()=>setTimeout(run,300));
document.addEventListener("DOMContentLoaded",()=>setTimeout(run,2400));
})();