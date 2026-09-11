// Render a synthetic table on the build host, which has fonts installed.
const fs = require('node:fs');
const sharp = require('../../backend/node_modules/sharp');
const rows = [['Student ID', 'Name', 'Gender'], ['9900000001', 'TEST ALPHA', 'FEMALE'], ['9900000002', 'TEST BETA', 'MALE']];
const lines = [0,1,2,3].map(i => `<path d="M40 ${100+i*100} H1160 M${40+i*373} 100 V400"/>`).join('');
const labels = rows.flatMap((row,r) => row.map((cell,c) => `<text x="${60+c*373}" y="${163+r*100}">${cell}</text>`)).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="460"><rect width="1200" height="460" fill="white"/><g stroke="black" stroke-width="3">${lines}</g><g font-family="Arial, sans-serif" font-size="34" fill="black">${labels}</g></svg>`;
fs.mkdirSync('.local/ocr-smoke',{recursive:true});
sharp(Buffer.from(svg)).png().toFile('.local/ocr-smoke/ocr-synthetic-roster.png');
