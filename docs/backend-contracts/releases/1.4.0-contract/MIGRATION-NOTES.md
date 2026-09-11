# Contract 1.4.0 Migration Notes

## Clients

No immediate Android, Web, or iOS source change is required. Existing `/api/v1` paths, methods, fields, and enum values remain available. Clients should consume `listStudentScores.status` as the documented aggregate status and must not assume the three deprecated Score `sort` parameters influence ordering.

## Database

Migration `0013_production_rate_limits` adds durable, HMAC-scoped authentication and QR-join rate-limit windows. It is forward-only and does not rewrite business records. Deploy migrations before the application image.

## Deferred breaking cleanup

A future `/api/v2` may replace open strings with closed endpoint enums and remove deprecated compatibility-only Score sort inputs. That change requires a new compatibility review and client migration; it is not part of this candidate.
