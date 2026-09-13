import assert from 'node:assert/strict';
const origin='http://tauri.localhost';
for(const path of ['points/29.4300,-98.7800','stations/KSAT/observations/latest']){
 const response=await fetch(`https://api.weather.gov/${path}`,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'RBRWX NEXT (https://github.com/RBRTWTX/RBRWX_NEXT)',Origin:origin,Accept:'application/geo+json'}});
 assert.equal(response.ok,true,`NWS ${path}: HTTP ${response.status}`);assert.ok(['*',origin].includes(response.headers.get('access-control-allow-origin')),'NWS CORS does not permit the Windows origin');
 const data=await response.json();assert.ok(data.properties,'Missing NWS properties');
 if(path.includes('observations'))assert.ok(Number.isFinite(Date.parse(data.properties.timestamp)),'Missing observation timestamp');else assert.ok(data.properties.observationStations?.startsWith('https://api.weather.gov/'),'Missing station discovery');
}
console.log('Live NWS station discovery, observation timestamp and Windows-origin CORS: PASS');
