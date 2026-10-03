# HTTP compression and caching deployment — 2026-09-28

Deployed to Hong Kong CVM 43.129.193.7. Existing application release remains ui-refinement-20260925. Only live Nginx configuration was changed; application containers were verified unchanged.

## Changes

- Enable gzip level 5 for JS, CSS, SVG and WASM, minimum 1024 bytes, with Vary: Accept-Encoding. Existing HTML gzip remains enabled.
- Student static assets: public, no-cache allows storage but requires validation before reuse. Matching ETags return 304. HTML and runtime configuration retain existing policies.
- Teacher content-hashed /assets/ files: public, max-age=31536000, immutable, overriding the upstream cache header. This does not cache API responses.
- VerityAI existing immutable cache policy retained; knowledge assets retain upstream revalidation policy. Both benefit from compression.

## Verification

Four site homepages and both sports readiness endpoints returned 200. Nginx syntax passed. Decompressed student responses were byte-identical to uncompressed responses; conditional requests returned 304.

| Resource | Original bytes | Gzip bytes |
| --- | ---: | ---: |
| student/js/app.js | 42557 | 11258 |
| student/js/api.js | 130411 | 36521 |
| student/css/screens.css | 47252 | 8522 |

Public response from the desktop confirmed api.js gzip at 36521 bytes and public, no-cache. Server HTTPS checks confirmed gzip for teacher CSS, knowledge JS, VerityAI CSS and student CSS; teacher and VerityAI hashed assets returned immutable cache headers.

Initial validation ran before Nginx reload had settled and failed to observe gzip; automatic rollback restored original configuration. After adding a two-second reload settling interval, deployment and all checks passed. Intermittent SSH and desktop TLS connection failures also occurred during this operation; improved asset transfer does not establish resolution of the underlying network incident.

## Recovery

Server backups and verification JSON: /opt/bnbu-sports-production/backups/http-optimization-20260928

Rollback on server:

```sh
sudo python3 /home/ubuntu/optimize-http-20260928.py --rollback
```

The script restores both original Nginx files, validates syntax, and reloads Nginx. Do not use this rollback after unrelated later edits without reviewing the differences.

Source: tools/production/optimize-http-20260928.py. No application build, database migration, CDN purchase, lazy-loading refactor or new monitoring configuration was included. Real campus/mobile incident-period acceptance remains outstanding.
