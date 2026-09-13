const fs = require('node:fs');
const sharp = require('../../backend/node_modules/sharp');
const rows = [['Student ID','Name','Event','Time','Date'],
  ['9900000001','TEST ALPHA','800m','4:30','2026-09-12'],
  ['9900000002','TEST BETA','1000m','5:00','2026-09-12']];
const horizontal = [0,1,2,3].map(i=>`<path d="M40 ${80+i*100} H1790"/>`).join('');
const vertical = [0,1,2,3,4,5].map(i=>`<path d="M${40+i*350} 80 V380"/>`).join('');
const labels = rows.flatMap((row,r)=>row.map((text,c)=>`<text x="${55+c*350}" y="${145+r*100}">${text}</text>`)).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1830" height="440"><rect width="1830" height="440" fill="white"/><g stroke="black" stroke-width="3">${horizontal}${vertical}</g><g font-family="Arial, sans-serif" font-size="32" fill="black">${labels}</g></svg>`;
fs.mkdirSync('.local/ocr-smoke',{recursive:true});
sharp(Buffer.from(svg)).png().toFile('.local/ocr-smoke/ocr-synthetic-physical.png');
