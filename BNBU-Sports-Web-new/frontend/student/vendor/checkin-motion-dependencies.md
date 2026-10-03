# Check-in motion dependencies

Locally served, version-pinned browser distributions. Loaded only by the optional check-in motion module.

| Package | Version | Upstream distribution | SHA-256 |
| --- | --- | --- | --- |
| Anime.js | 4.5.0 | https://cdn.jsdelivr.net/npm/animejs@4.5.0/dist/bundles/anime.esm.min.js | a19015a1a92d52025a2fb6703b6d67eadd1cc2aeaf880770e96e04cf6aa07be1 |
| Canvas Confetti | 1.9.4 | https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.4/dist/confetti.module.mjs | d29dc7b2dae5d04baf55666e4f677bbf7f8b0bf587e1ace6098823c4363e7589 |

The confetti ESM file is served with a `.js` extension for the existing static server. Its contents are unchanged. Each package's license is retained alongside its distribution. The application makes no runtime CDN requests for these files.
