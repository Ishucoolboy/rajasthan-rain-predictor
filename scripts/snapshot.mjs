import {readFile,writeFile,mkdir} from 'node:fs/promises';
const LAT=27.202,LON=73.7339,TZ='Asia/Kolkata';
const url=new URL('https://api.open-meteo.com/v1/forecast');
url.searchParams.set('latitude',LAT);url.searchParams.set('longitude',LON);
url.searchParams.set('current','temperature_2m,precipitation,rain,showers,weather_code,wind_speed_10m,wind_gusts_10m');
url.searchParams.set('hourly','precipitation,precipitation_probability,weather_code');
url.searchParams.set('forecast_hours','12');url.searchParams.set('timezone',TZ);
const r=await fetch(url);if(!r.ok)throw new Error('Open-Meteo HTTP '+r.status);
const d=await r.json();
const snap={captured_at:new Date().toISOString(),latitude:LAT,longitude:LON,current:d.current,hourly:{time:d.hourly?.time?.slice(0,12),precipitation:d.hourly?.precipitation?.slice(0,12),probability:d.hourly?.precipitation_probability?.slice(0,12),weather_code:d.hourly?.weather_code?.slice(0,12)}};
await mkdir('data',{recursive:true});
let history=[];try{history=JSON.parse(await readFile('data/forecast-snapshots.json','utf8'));if(!Array.isArray(history))history=[]}catch{}
history.push(snap);
const cutoff=Date.now()-45*24*60*60*1000;
history=history.filter(x=>Date.parse(x.captured_at)>=cutoff).slice(-1200);
await writeFile('data/forecast-snapshots.json',JSON.stringify(history,null,2)+'\n');
console.log('Stored snapshot',snap.captured_at,'count',history.length);
