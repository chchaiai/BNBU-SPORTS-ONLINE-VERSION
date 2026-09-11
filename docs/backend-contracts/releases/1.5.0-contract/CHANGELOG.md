# Contract 1.5.0 Candidate Changelog

Baseline: immutable `1.4.0-contract` SHA-256 `c5d18c4894bbe421074cba27da3b39a9076328c499cc742b273665994c29059b`.

- Preserves the published Contract 1.4 snapshot and advances the mutable API surface under the new `1.5.0-contract` version.
- Makes exercise descriptions required only for `GENERAL` records; `COURSE_RELATED` descriptions may be omitted or null.
- Adds byte-level WebM validation for browser-recorded exercise videos while retaining the 15-second maximum and mandatory video and audio tracks.
- Clarifies that clients must not request GPS permission or collect coordinates for evidence upload. Recognized GPS, EXIF location, or container location metadata is rejected with `MEDIA_LOCATION_METADATA_NOT_ALLOWED`.
- Keeps SHA-256, declared MIME, actual container, duration, track, and size verification authoritative on the Backend.
- Adds the ADMIN-only `GET /health/admin` projection for measured PostgreSQL, notification-outbox, roster-object-storage, and media-storage status without changing the public readiness response.
- Clarifies that QR enrollment remains a pre-authentication capability flow: join returns a restricted `PENDING_CONTACT_BINDING` session, email verification activates that session, and protected student operations remain blocked until activation.
- Adds lossless exemption application details for 800m, 1000m, school-team, student-club, and special-circumstance applications through additive request fields and `GET /exemption-application-details`, without changing the existing exemption response projection.
- Publishes the repository-owned local integration initializer and checker required to create a secret-safe Backend environment for Android, iOS, and Web synthetic E2E.
