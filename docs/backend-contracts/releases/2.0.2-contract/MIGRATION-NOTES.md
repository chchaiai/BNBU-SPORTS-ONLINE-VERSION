# Contract 2.0.2 Migration Notes

## Clients

iOS may generate and wire `/api/v1` types from this published handoff after its SHA-256 is verified. Android and iOS must require a non-blank description for `GENERAL` records only; `COURSE_RELATED` may omit it. Web may upload a browser-produced `video/webm` file when it contains a video track, an audio track, and a trusted duration no greater than 15 seconds. MP4, MOV, and 3GP remain supported.

Updated clients create exemption applications with both `applicationSubtype` and `organizationName`; legacy clients may omit both. Read exact structured details from `GET /api/v1/exemption-application-details`. The original `/exemption-applications` mutation and list responses intentionally keep their prior projection for compatibility. QR join remains bearer-free and capability-authorized; its restricted session must complete email verification before any protected student operation.

No client is required or permitted by this contract to request location permission or collect coordinates for evidence. If a selected media file already contains recognized location metadata, Backend rejects it with `MEDIA_LOCATION_METADATA_NOT_ALLOWED`; clients should ask the user to remove location metadata or capture a new file.

## Database

Migration `0016_optional_course_exercise_description` makes `exercise_records.description` nullable and adds a database check that still requires a trimmed 1..200 character description for `GENERAL` rows. `COURSE_RELATED` rows may store null or a trimmed 1..200 character description. The migration is forward-only and must run before the application image.

Migration `0017_exemption_application_details` adds nullable `application_subtype` and `organization_name` columns plus a database combination constraint. Null/null preserves legacy rows; new clients use the typed combinations defined by ADR-104. This forward-only migration must run before clients use the structured details endpoint.

## Local integration

Run `npm run local:env:init` from the monorepo root to generate a gitignored Backend environment with fresh synthetic-only secrets, then run `npm run local:env:check` before Docker Compose. Do not use templates containing `CHANGE_ME`, reuse production credentials, or log generated secrets.

## Media deployment

No FFmpeg/WASM or upload-time transcoding service is introduced. Backend validates the original uploaded bytes. Media scanner, object storage, and HTTPS staging configuration remain deployment concerns and are not proven by this candidate package.

## Operational health

`GET /api/v1/health/admin` requires an ADMIN access token and returns safe dependency categories, latency, and notification backlog. The published `/health/live` and `/health/ready` projections remain unchanged. The administrator response never exposes endpoints, bucket credentials, storage keys, or signed URLs.
