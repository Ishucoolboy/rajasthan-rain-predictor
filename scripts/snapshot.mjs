import {readFile,writeFile,mkdir} from 'node:fs/promises';
const LAT=27.202,LON=73.7339,TZ='Asia/Kolkata';
async function get(url,headers={}){const r=await fetch(url,{headers});if(!r.ok)throw new Error(url+' HTTP '+r.status);return r.json()}
const om=new URL('https://api.open-meteo.com/v1/forecast');om.searchParams.set('latitude',LAT);om.searchParams.set('longitude',LON);om.searchParams.set('hourly','precipitation,precipitation_probability,weather_code');om.searchParams.set('forecast_hours','12');om.searchParams.set('timezone',TZ);
const d=await get(om);const captured=new Date().toISOString();
const snap={captured_at:captured,latitude:LAT,longitude:LON,current:d.current,hourly:{time:d.hourly?.time?.slice(0,12),precipitation:d.hourly?.precipitation?.slice(0,12),probability:d.hourly?.precipitation_probability?.slice(0,12),weather_code:d.hourly?.weather_code?.slice(0,12)}};
await mkdir('data',{recursive:true});let history=[];try{history=JSON.parse(await readFile('data/forecast-snapshots.json','utf8'))}catch{}if(!Array.isArray(history))history=[];history.push(snap);history=history.filter(x=>Date.parse(x.captured_at)>=Date.now()-45*86400000).slice(-1200);await writeFile('data/forecast-snapshots.json',JSON.stringify(history,null,2)+'\n');
let imd=null;try{imd=await get('https://mausam.imd.gov.in/api/districtwise_rainfall_api.php')}catch(e){console.log('IMD rainfall unavailable:',e.message)}
await writeFile('data/imd-rainfall-latest.json',JSON.stringify({captured_at:captured,data:imd},null,2)+'\n');
const key=process.env.RAINBOW_API_KEY;
if(key){try{const rb=await get('https://api.rainbow.ai/nowcast/v1/precip/'+LON+'/'+LAT,{ 'Ocp-Apim-Subscription-Key':key });await writeFile('data/rainbow-nowcast.json',JSON.stringify({captured_at:captured,...rb},null,2)+'\n')}catch(e){console.log('Rainbow unavailable:',e.message)}}else console.log('RAINBOW_API_KEY not configured; keeping fallback JSON');
console.log('Stored forecast snapshot',captured,'history',history.length);
