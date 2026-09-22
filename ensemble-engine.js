/* =========================================================
   RRP PHASE E — ENSEMBLE PROBABILITY ENGINE
   =========================================================
   Uses Open-Meteo Ensemble API for:
   - ECMWF IFS 0.25° Ensemble (51 members)
   - GFS Ensemble 0.25° (31 members)
   - ICON EPS Global (40 members)
   - ECMWF AIFS 0.25° Ensemble (51 members) as an additional
     independent AI forecast signal.

   This is probabilistic guidance, not a guarantee.
   ========================================================= */
(() => {
  "use strict";

  const API = "https://ensemble-api.open-meteo.com/v1/ensemble";
  const MODELS = [
    {key:"ECMWF IFS ENS", id:"ecmwf_ifs025_ensemble"},
    {key:"GFS ENS", id:"ncep_gefs025"},
    {key:"ICON EPS", id:"icon_global_eps"},
    {key:"ECMWF AIFS ENS", id:"ecmwf_aifs025_ensemble"}
  ];
  const TARGETS = [1, 5, 10, 25, 50];

  let latest = null;
  let running = false;

  const num = (v, d=0) => Number.isFinite(Number(v)) ? Number(v) : d;

  function selectedLocation() {
    const l = window.RRP_SELECTED_LOCATION;
    if (!l) return null;
    const lat = Number(l.latitude), lon = Number(l.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {name:l.name || "Selected village", latitude:lat, longitude:lon};
  }

  function memberKeys(hourly) {
    return Object.keys(hourly || {})
      .filter(k => /^precipitation_member\d+$/i.test(k));
  }

  function sums(hourly, keys, start, count) {
    return keys.map(k => {
      const a = hourly[k] || [];
      return a.slice(start, start + count)
        .reduce((s,v)=>s+Math.max(0,num(v)),0);
    });
  }

  function quantile(values, q) {
    if (!values.length) return 0;
    const a = [...values].sort((x,y)=>x-y);
    const pos = (a.length-1)*q;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    if (lo === hi) return a[lo];
    return a[lo] + (a[hi]-a[lo])*(pos-lo);
  }

  function probability(values, threshold) {
    if (!values.length) return 0;
    return 100 * values.filter(v => v >= threshold).length / values.length;
  }

  function summarize(values) {
    if (!values.length) return null;
    const mean = values.reduce((a,b)=>a+b,0)/values.length;
    return {
      members: values.length,
      mean,
      median: quantile(values,.5),
      p10: quantile(values,.10),
      p25: quantile(values,.25),
      p75: quantile(values,.75),
      p90: quantile(values,.90),
      max: Math.max(...values),
      prob: Object.fromEntries(TARGETS.map(t=>[String(t), probability(values,t)]))
    };
  }

  async function fetchModel(location, model) {
    const p = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      hourly: "precipitation",
      forecast_days: "3",
      timezone: "auto",
      models: model.id
    });
    const r = await fetch(API + "?" + p.toString(), {cache:"no-store"});
    if (!r.ok) throw new Error(model.key + " HTTP " + r.status);
    const data = await r.json();
    const h = data.hourly || {};
    const keys = memberKeys(h);
    if (!keys.length) throw new Error(model.key + " returned no ensemble members");
    const times = h.time || [];
    const now = Date.now();
    let idx = 0, best = Infinity;
    times.forEach((t,i)=>{
      const d=Math.abs(new Date(t).getTime()-now);
      if(Number.isFinite(d)&&d<best){best=d;idx=i;}
    });
    return {
      key:model.key,
      id:model.id,
      hourlyTime:times,
      next24:summarize(sums(h,keys,idx,24)),
      next72:summarize(sums(h,keys,idx,72)),
      memberCount:keys.length
    };
  }

  function aggregate(models) {
    const usable = models.filter(x=>x && x.next24);
    if (!usable.length) return null;
    const means=usable.map(x=>x.next24.mean);
    const p90s=usable.map(x=>x.next24.p90);
    const probs=usable.map(x=>x.next24.prob["10"]);
    const mean=means.reduce((a,b)=>a+b,0)/means.length;
    const p90=p90s.reduce((a,b)=>a+b,0)/p90s.length;
    const p10prob=usable.map(x=>x.next24.prob["10"]).reduce((a,b)=>a+b,0)/usable.length;
    const spread=mean ? ((Math.max(...means)-Math.min(...means))/mean)*100 : 0;

    let tier="LOW";
    if(mean>=25 && p10prob>=70) tier="VERY_HIGH";
    else if(mean>=10 && p10prob>=55) tier="HIGH";
    else if(mean>=5 || p10prob>=35) tier="MODERATE";

    return {modelCount:usable.length, mean, p90, probability10:p10prob, spread, tier};
  }

  function render(result, errorText) {
    const el=document.getElementById("ensembleForecast");
    if(!el) return;
    if(errorText){
      el.innerHTML=`<div class="ensemble-error">⚠️ Ensemble data unavailable: ${String(errorText).replace(/[<>]/g,"")}</div>`;
      return;
    }
    if(!result){
      el.innerHTML="<div>⏳ Ensemble forecast load ho raha hai...</div>";
      return;
    }
    const a=result.aggregate;
    const rows=result.models.map(m=>`
      <div class="ensemble-model-row">
        <strong>${m.key}</strong>
        <span>${m.memberCount} members</span>
        <b>${m.next24.mean.toFixed(1)} mm</b>
        <small>≥10mm: ${m.next24.prob["10"].toFixed(0)}% · P10/P90: ${m.next24.p10.toFixed(1)}–${m.next24.p90.toFixed(1)} mm</small>
      </div>`).join("");
    el.innerHTML=`
      <div class="ensemble-head">
        <div>
          <strong>🎯 Probabilistic rainfall forecast</strong>
          <div class="ensemble-sub">Selected village · next 24 hours</div>
        </div>
        <div class="ensemble-tier">${a.tier}</div>
      </div>
      <div class="ensemble-main">
        <div><span>Ensemble mean</span><strong>${a.mean.toFixed(1)} mm</strong></div>
        <div><span>Average P(≥10 mm)</span><strong>${a.probability10.toFixed(0)}%</strong></div>
        <div><span>Model spread</span><strong>${a.spread.toFixed(0)}%</strong></div>
        <div><span>Average P90</span><strong>${a.p90.toFixed(1)} mm</strong></div>
      </div>
      <div class="ensemble-note">P10–P90 is the member range used for uncertainty; it is not a guarantee. Four ensemble systems are shown when available.</div>
      <div class="ensemble-models">${rows}</div>
    `;
  }

  async function run(location) {
    if(running) return;
    const loc=location || selectedLocation();
    if(!loc) return;
    running=true;
    render(null);
    const results=[];
    for(const model of MODELS){
      try { results.push(await fetchModel(loc,model)); }
      catch(e){ console.warn("[RRP Phase E]",model.key,e); }
    }
    if(!results.length){
      running=false;
      render(null,"No ensemble model returned usable data.");
      return;
    }
    latest={location:loc,models:results,aggregate:aggregate(results),generatedAt:new Date().toISOString()};
    running=false;
    render(latest);
    window.dispatchEvent(new CustomEvent("rrp:ensemble-updated",{detail:latest}));
  }

  window.RRP_ENSEMBLE = {version:"1.0",run, getLatest:()=>latest};

  window.addEventListener("rrp:location-selected", e => {
    setTimeout(()=>run(e?.detail?.location || selectedLocation()), 400);
  });

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",()=>setTimeout(()=>run(),1200));
  } else {
    setTimeout(()=>run(),1200);
  }
})();