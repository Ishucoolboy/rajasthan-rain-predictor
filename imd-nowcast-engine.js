/* =========================================================
   PHASE F — IMD NOWCAST + OFFICIAL WARNING LAYER
   ========================================================= */
(() => {
"use strict";
const API={
 districtNowcast:"https://mausam.imd.gov.in/api/nowcast_district_api.php",
 districtRain:"https://mausam.imd.gov.in/api/districtwise_rainfall_api.php",
 districtWarning:"https://mausam.imd.gov.in/api/warnings_district_api.php",
 stationNowcast:"https://mausam.imd.gov.in/api/nowcastapi.php",
 aws:"https://city.imd.gov.in/api/aws_data_api.php"
};
let latest=null, timer=null;

function esc(v){return String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function norm(v){return String(v??"").trim().toLowerCase().replace(/[^a-z0-9]+/g," ");}
function selected(){const l=window.RRP_SELECTED_LOCATION;if(!l)return null;return {name:l.name||"",latitude:Number(l.latitude),longitude:Number(l.longitude),district:l.district||l.districtName||""};}
function findName(obj){return obj?.district||obj?.district_name||obj?.District||obj?.name||obj?.Name||obj?.station||obj?.Station||"";}
function findWarning(obj){return obj?.warning||obj?.Warning||obj?.status||obj?.Status||obj?.alert||obj?.Alert||obj?.colour||obj?.color||"";}
async function get(url){
 const r=await fetch(url,{cache:"no-store"});
 if(!r.ok) throw new Error("IMD HTTP "+r.status);
 const text=await r.text();
 try{return JSON.parse(text);}catch{return text;}
}
function flatten(x,out=[]){
 if(Array.isArray(x)){x.forEach(v=>flatten(v,out));return out;}
 if(x&&typeof x==="object"){out.push(x);Object.values(x).forEach(v=>{if(v&&typeof v==="object")flatten(v,out);});}
 return out;
}
function bestForLocation(data,loc){
 const target=norm(loc.district);
 const rows=flatten(data);
 return rows.find(x=>norm(findName(x))===target) ||
        rows.find(x=>target && norm(findName(x)).includes(target)) || null;
}
function render(state){
 const el=document.getElementById("imdNowcastLayer"); if(!el)return;
 if(state.error){el.innerHTML='<div class="imd-layer-error">⚠️ IMD layer unavailable right now. NWP/ensemble forecast remains available.</div>';return;}
 const n=state.nowcast||{}, w=state.warning||{}, rr=state.rainfall||{};
 const warning=findWarning(w)||findWarning(n)||"Not available";
 el.innerHTML=`
 <div class="imd-layer-head"><div><strong>🇮🇳 IMD Official Short-Range Layer</strong><small>District/Station nowcast + official warning + rainfall observation</small></div><span class="imd-badge">${esc(warning)}</span></div>
 <div class="imd-layer-grid">
  <div><span>Nowcast</span><strong>${esc(findWarning(n)||"Available")}</strong></div>
  <div><span>Warning</span><strong>${esc(findWarning(w)||"Not available")}</strong></div>
  <div><span>Rainfall</span><strong>${esc(JSON.stringify(rr).slice(0,140))}</strong></div>
 </div>
 <p class="imd-layer-note">IMD warning/nowcast is kept separate from model-derived village rainfall. It is an official signal, not a village-specific rain guarantee.</p>`;
}
async function run(){
 const loc=selected(); if(!loc)return;
 const queries=[
  ["nowcast",API.districtNowcast],
  ["warning",API.districtWarning],
  ["rainfall",API.districtRain]
 ];
 const state={};
 await Promise.all(queries.map(async ([k,u])=>{try{state[k]=bestForLocation(await get(u),loc)||await get(u);}catch(e){console.warn("[RRP Phase F]",k,e);}}));
 if(!state.nowcast&&!state.warning&&!state.rainfall){render({error:true});return;}
 latest={location:loc,...state,generatedAt:new Date().toISOString()};
 render(latest);
 window.dispatchEvent(new CustomEvent("rrp:imd-nowcast-updated",{detail:latest}));
}
window.RRP_IMD_NOWCAST={run,getLatest:()=>latest};
window.addEventListener("rrp:location-selected",()=>setTimeout(run,500));
document.addEventListener("DOMContentLoaded",()=>setTimeout(run,1800));
})();