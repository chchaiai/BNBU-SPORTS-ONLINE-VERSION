import fs from 'node:fs';
const base = 'BNBU-Sports-Web-new/frontend/student/';
// Reuse the application's complete BNBU + SPORTS mark and its existing alpha mask.
// The user screenshot remains a visual reference, not a bitmap tile in navigation.
const source = fs.readFileSync(base + 'bnbu-sports-icon.svg', 'utf8');
const result = source.replace('<defs>', '<defs><linearGradient id="silver" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#d8e8f1"/><stop offset=".38" stop-color="#698594"/><stop offset=".53" stop-color="#d9eaf3"/><stop offset="1" stop-color="#506b7b"/></linearGradient>').replace('fill="#007eb5"', 'fill="url(#silver)"');
fs.writeFileSync(base + 'assets/bnbu-sports-electric.svg', result);
fs.copyFileSync(base + 'assets/bnbu-sports-metal.png', 'evidence/electric-logo-20261002/uploaded-reference.png');
fs.unlinkSync(base + 'assets/bnbu-sports-metal.png');
