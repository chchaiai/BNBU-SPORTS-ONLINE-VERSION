(function(root){
  function normalize(aps){
    const map=new Map();
    for(const ap of aps||[]){
      const id=String(ap.bssid||'').toLowerCase();
      if(!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(id)||['02:00:00:00:00:00','00:00:00:00:00:00'].includes(id)||!Number.isFinite(ap.rssi)||ap.rssi>=0||ap.rssi< -110)continue;
      if(!map.has(id)||ap.rssi>map.get(id))map.set(id,ap.rssi);
    }
    return Object.fromEntries(map);
  }
  function locate(aps,places){
    const current=normalize(aps),ready=places.filter(p=>p.samples.length>=3);
    if(Object.keys(current).length<3)return {reason:'有效 AP 不足 3 个，请重新扫描。'};
    if(ready.length<2)return {reason:'请先保存至少 2 个位置，每个位置至少 3 次采样。'};
    const ranked=ready.map(p=>{
      const ids=new Set(p.samples.flatMap(s=>Object.keys(s))),average={};
      for(const id of ids){const values=p.samples.map(s=>s[id]).filter(Number.isFinite).sort((a,b)=>a-b);if(values.length>=Math.ceil(p.samples.length/2))average[id]=values[Math.floor(values.length/2)];}
      const common=Object.keys(average).filter(id=>id in current),union=new Set([...Object.keys(average),...Object.keys(current)]).size;
      const coverage=common.length/Math.max(1,union);
      const rmse=common.length?Math.sqrt(common.reduce((sum,id)=>sum+(average[id]-current[id])**2,0)/common.length):Infinity;
      return {name:p.name,common:common.length,coverage,rmse,score:rmse+20*(1-coverage)};
    }).sort((a,b)=>a.score-b.score);
    const best=ranked[0];
    if(best.common<3||best.coverage<.6||best.rmse>12)return {reason:'没有足够相似的已采集位置，当前位置未知。'};
    if(ranked[1].score-best.score<3)return {reason:'多个位置指纹过于相似，无法可靠区分。'};
    return best;
  }
  const api={normalize,locate};if(typeof module!=='undefined')module.exports=api;else root.Fingerprint=api;
})(globalThis);
