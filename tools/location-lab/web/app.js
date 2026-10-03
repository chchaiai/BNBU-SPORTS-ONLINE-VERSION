'use strict';
const $=id=>document.getElementById(id),native=!!window.AndroidCollector;
let latest=null,places=[],busy=false;
try{const saved=JSON.parse(localStorage.getItem('location-lab-v1')||'[]');if(Array.isArray(saved))places=saved.filter(p=>typeof p.name==='string'&&Array.isArray(p.samples)&&p.samples.every(s=>s&&typeof s==='object')).slice(0,100);}catch{}
$('mode').textContent=native?'Android 采集模式 · 请开启 Wi-Fi 和系统定位':'浏览器模式 · 支持经纬度；BSSID 和 AP 扫描需安装 Android 采集端。';
$('download').hidden=native;
function render(){ $('places').replaceChildren();for(const p of places){const li=document.createElement('li');li.textContent=`${p.name} · ${p.samples.length} 次采样${p.samples.length<3?'（至少需 3 次）':''}`;$('places').append(li);} }
function persist(next){try{localStorage.setItem('location-lab-v1',JSON.stringify(next));places=next;render();return true;}catch{$('result').textContent='本机存储不可用，未保存。';return false;}}
window.onNativeStatus=message=>{$('status').textContent=message;};
window.onNativeLocation=position=>{if(position.error){$('gpsStatus').textContent=position.error;return;}const c=position.coords;$('lat').textContent=c.latitude.toFixed(7);$('lon').textContent=c.longitude.toFixed(7);$('accuracy').textContent=`± ${c.accuracy.toFixed(1)} 米`;$('provider').textContent=position.provider||'浏览器系统定位（融合来源）';$('time').textContent=new Date(position.timestamp).toLocaleString();$('gpsStatus').textContent='已获取';};
window.onNativeWifi=data=>{
  latest=data.fresh?{...data,receivedAt:Date.now()}:null;
  $('bssid').textContent=data.connectedBssid||'未连接或系统未提供';$('wifiStatus').textContent=data.message||`扫描到 ${data.aps.length} 个 AP`;$('aps').replaceChildren();
  for(const ap of data.aps||[]){const tr=document.createElement('tr'),name=document.createElement('td'),signal=document.createElement('td'),detail=document.createElement('small');name.textContent=ap.ssid||'隐藏网络';detail.textContent=ap.bssid;name.append(detail);signal.textContent=`${ap.rssi} dBm`;tr.append(name,signal);$('aps').append(tr);}
};
$('scan').onclick=()=>{
  if(busy)return;latest=null;$('result').textContent='尚无本次匹配结果';$('gpsStatus').textContent='正在定位…';$('status').textContent='正在获取…';
  for(const id of ['lat','lon','accuracy','provider','time','bssid'])$(id).textContent='—';$('aps').replaceChildren();$('wifiStatus').textContent=native?'正在扫描…':'普通浏览器不提供 BSSID、AP 列表或信号强度。';
  if(native){window.AndroidCollector.collect();return;}
  if(!window.isSecureContext||!navigator.geolocation){$('gpsStatus').textContent='需要 HTTPS 和支持定位的浏览器。';$('status').textContent='定位不可用';return;}
  busy=true;$('scan').disabled=true;
  navigator.geolocation.getCurrentPosition(p=>{window.onNativeLocation({coords:{latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy},timestamp:p.timestamp});done('定位完成');},e=>{const msg=({1:'定位权限被拒绝，请在浏览器设置中允许位置访问。',2:'暂时无法定位，请开启系统定位后重试。',3:'定位超时，请移到窗边或室外重试。'})[e.code]||'定位失败';$('gpsStatus').textContent=msg;done(msg);},{enableHighAccuracy:true,timeout:25000,maximumAge:0});
};
function done(message){busy=false;$('scan').disabled=false;$('status').textContent=message;}
function fresh(){if(!latest||Date.now()-latest.receivedAt>30000){$('result').textContent='需要 30 秒内的新扫描结果，请点击获取定位与 Wi-Fi。';return false;}return true;}
$('save').onclick=()=>{if(!fresh())return;const name=$('place').value.trim();if(!name){$('result').textContent='请填写当前位置名称。';return;}const sample=Fingerprint.normalize(latest.aps);if(Object.keys(sample).length<3){$('result').textContent='有效 AP 不足 3 个，无法保存指纹。';return;}const next=JSON.parse(JSON.stringify(places));let p=next.find(p=>p.name===name);if(!p){if(next.length>=100){$('result').textContent='已达到 100 个位置上限。';return;}p={name,samples:[],scanIds:[]};next.push(p);}if((p.scanIds||[]).includes(latest.scanId)){$('result').textContent='本次扫描已保存，请重新扫描再采样。';return;}p.samples.push(sample);p.scanIds=(p.scanIds||[]).concat(latest.scanId);p.samples=p.samples.slice(-20);p.scanIds=p.scanIds.slice(-20);if(persist(next))$('result').textContent=`已保存「${name}」，共 ${p.samples.length} 次采样。`;};
$('match').onclick=()=>{if(!fresh())return;const result=Fingerprint.locate(latest.aps,places);$('result').textContent=result.reason||`可能位置：${result.name} · ${result.common} 个共同 AP · 信号差 ${result.rmse.toFixed(1)} dBm（实验匹配）`;};
$('clear').onclick=()=>{if(confirm('清空本机全部位置指纹？'))if(persist([]))$('result').textContent='指纹库已清空。';};render();
