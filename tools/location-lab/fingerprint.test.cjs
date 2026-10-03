const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalize,locate}=require('./web/fingerprint.js');
const aps=values=>values.map((rssi,i)=>({bssid:`aa:bb:cc:dd:ee:0${i}`,rssi}));
const place=(name,values)=>({name,samples:Array.from({length:3},()=>normalize(aps(values)))});
test('rejects redacted addresses and invalid RSSI, deduplicates APs',()=>{
  assert.deepEqual(normalize([{bssid:'02:00:00:00:00:00',rssi:-40},...aps([-40]),...aps([-60]),{bssid:'aa:bb:cc:dd:ee:02',rssi:0}]),{'aa:bb:cc:dd:ee:00':-40});
});
test('matches sufficiently distinct surveyed locations',()=>assert.equal(locate(aps([-41,-55,-67]),[place('A',[-40,-55,-66]),place('B',[-70,-40,-35])]).name,'A'));
test('rejects ambiguous fingerprints',()=>assert.match(locate(aps([-40,-55,-66]),[place('A',[-40,-55,-66]),place('B',[-41,-54,-65])]).reason,/相似/));
test('rejects unknown locations and too few common APs',()=>{
  assert.match(locate(aps([-95,-95,-95]),[place('A',[-40,-55,-66]),place('B',[-70,-40,-35])]).reason,/未知/);
  assert.match(locate(aps([-40,-55]),[place('A',[-40,-55,-66]),place('B',[-70,-40,-35])]).reason,/不足/);
});
test('requires at least two surveyed locations with three observations',()=>assert.match(locate(aps([-40,-55,-66]),[place('A',[-40,-55,-66])]).reason,/至少 2/));
