# Stage 15 MediaEvidence operation inventory

Generated from the authoritative `openapi.yaml` before implementation. Stage 15 implements exactly five MediaEvidence operations. It does not add an ExerciseRecord operation, Controller, table, or route, and the OpenAPI operation total remains 88.

| operationId | method | path | policyId | roles | resource resolver | request | success | pre-stage status | target |
|---|---|---|---|---|---|---|---|---|---|
| `initiateMediaUpload` | POST | `/media-uploads` | `MEDIA-UPLOAD-INITIATE` | `STUDENT` | `EXERCISE_SESSION_FROM_REQUEST` | `InitiateMediaUploadRequest` + `Idempotency-Key` | `MediaUploadSessionResponse` (201) | `NOT_IMPLEMENTED` | `IMPLEMENTED_VERIFIED` |
| `confirmMediaUpload` | POST | `/media-uploads/{uploadSessionId}/confirm` | `MEDIA-UPLOAD-CONFIRM` | `STUDENT` | `MEDIA_UPLOAD_FROM_PATH` | `ConfirmMediaUploadRequest` + `Idempotency-Key` | `MediaEvidenceResponse` (200) | `NOT_IMPLEMENTED` | `IMPLEMENTED_VERIFIED` |
| `getMediaEvidence` | GET | `/media/{mediaId}` | `MEDIA-READ` | `STUDENT`, `TEACHER` | `MEDIA_FROM_PATH` | `mediaId` | `MediaEvidenceResponse` (200) | `NOT_IMPLEMENTED` | `IMPLEMENTED_VERIFIED` |
| `bindMediaEvidence` | POST | `/media/{mediaId}/bind` | `MEDIA-BIND` | `STUDENT` | `MEDIA_FROM_PATH` | `BindMediaRequest` + `Idempotency-Key` | `MediaEvidenceResponse` (200) | `NOT_IMPLEMENTED` | `IMPLEMENTED_VERIFIED` |
| `createMediaAccessUrl` | POST | `/media/{mediaId}/access-url` | `MEDIA-ACCESS-URL` | `STUDENT`, `TEACHER` | `MEDIA_FROM_PATH` | `MediaAccessRequest` + `Idempotency-Key` | `MediaAccessResponse` (200) | `NOT_IMPLEMENTED` | `IMPLEMENTED_VERIFIED` |

Every policy remains default deny. Student access is limited to the authenticated student's own organization, Enrollment, ExerciseSession, and media. Stage 15 does not grant Teacher original-object access because no ExerciseRecord ownership relation exists yet. The Teacher read operation can expose only the role-safe metadata projection when the existing policy resolver proves scope. `ADMIN` is not added to the OpenAPI roles in this stage.

The deterministic contract closure changes `BindMediaRequest` from a future `recordId` target to the existing owned `sessionId`. `recordId` remains nullable in the response and is always `null` during Stage 15. Initiation allocates the stable `mediaId`; confirmation updates that same aggregate rather than creating a second identity.
