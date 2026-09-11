# Contract 1.3 Errata Proposal

Status: proposal only. The published `1.3.0-contract` artifact remains frozen and is not changed by this document.

## 1. Endpoint-specific sort vocabularies

### Problem

Twelve list operations declare an open `string` `sort` parameter, while the backend applies endpoint-specific closed whitelists. Three score operations declare `sort` but the approved score implementation has no corresponding sort behavior. A caller cannot discover the accepted values from Contract 1.3, and accepting arbitrary values in the backend would make ordering ambiguous or unsafe.

The affected operations are `listStudents`, `listEnrollments`, `listRosterImports`, `listRosterEntries`, `listRosterAlignmentResults`, `listExerciseRecords`, `listExerciseRecordReviews`, `listScoreRules`, `listStudentScores`, `listScoreAdjustments`, `listExports`, and `listAuditLogs`.

### Current 1.3 behavior

Each endpoint exposes `sort` as an unrestricted string. No endpoint-level grammar or named enum states which values are valid.

### Backend safe behavior

Existing endpoint whitelists remain closed. The three score endpoints do not pretend to implement an ordering language that has not been specified.

### Compatibility impact

Clients sending an undocumented sort value may be rejected, and the score endpoints cannot honor the underspecified field. Describing the actual accepted values narrows the published input surface.

### Recommended next-contract correction

Define a separate named sort enum for every list operation, including direction syntax. For the score operations, first approve deterministic sortable fields and tie-breakers, then implement backend support and publish those endpoint-specific enums. Do not introduce one global sort grammar.

### Breaking correction

Yes. Replacing an open string with closed enums is a narrowing correction.

## 2. `listClassSections.status`

### Problem

Contract 1.3 declares `status` as an open string, but class-section state is a closed domain state machine.

### Current 1.3 behavior

Any string is structurally valid at the OpenAPI layer.

### Backend safe behavior

The backend accepts only the established `ClassSectionStatus` values and rejects unknown states.

### Compatibility impact

A client that sends an invented state is rejected even though the schema is overly broad.

### Recommended next-contract correction

Reference the canonical named `ClassSectionStatus` schema from this query parameter.

### Breaking correction

Yes. This narrows an open string to the real state machine.

## 3. `InitiateMediaUploadRequest.captureSource`

### Problem

The request reuses the shared `CaptureSource` enum, which contains `SYSTEM_IMPORT`, while the operation description explicitly states that this public upload endpoint does not accept `SYSTEM_IMPORT`. The schema and operation semantics contradict each other.

### Current 1.3 behavior

Schema validation permits `IN_APP_CAMERA`, `FILE_PICKER`, and `SYSTEM_IMPORT`; the endpoint description excludes `SYSTEM_IMPORT`.

### Backend safe behavior

The public endpoint accepts only `IN_APP_CAMERA` and `FILE_PICKER`. System imports remain an internal, separately authorized ingestion concern.

### Compatibility impact

A Contract-derived client can generate `SYSTEM_IMPORT`, but the backend safely rejects it.

### Recommended next-contract correction

Introduce an endpoint-specific `PublicMediaCaptureSource` enum containing only `IN_APP_CAMERA` and `FILE_PICKER`. Keep the broader shared enum only where internal system import is genuinely supported.

### Breaking correction

Yes at the schema level, although it aligns the schema with the already-published operation description and safe runtime behavior.

## 4. `MediaAccessRequest.purpose`

### Problem

Contract 1.3 permits any uppercase token matching the declared pattern. The backend only supports `VIEW_ORIGINAL`; treating arbitrary tokens as equivalent could weaken audit meaning or accidentally create future authorization semantics.

### Current 1.3 behavior

Any uppercase underscore-delimited token satisfying the pattern is structurally valid.

### Backend safe behavior

Only `VIEW_ORIGINAL` is accepted and recorded.

### Compatibility impact

Clients may construct pattern-valid values that are rejected at runtime.

### Recommended next-contract correction

Replace the pattern with a named `MediaAccessPurpose` enum initially containing only `VIEW_ORIGINAL`. Add future purposes only with explicit authorization and audit semantics.

### Breaking correction

Yes. This is a deliberate narrowing of an unsafe open vocabulary.

## 5. `listStudentScores.status`

### Problem

The single Contract 1.3 `status` filter combines concerns that the approved score model keeps orthogonal: calculation/revision state, publication state, and lock state. The current model uses an approved revision pointer and cannot map all five Contract values to one predicate without inventing precedence and historical-revision rules.

### Current 1.3 behavior

The query accepts one of `DRAFT`, `CALCULATED`, `PUBLISHED`, `LOCKED`, or `SUPERSEDED`, but Contract 1.3 does not specify how the value relates to the current revision pointer, publication, lock facts, or superseded revisions.

### Backend safe behavior

The backend accepts the published parameter for input compatibility but does not apply a guessed predicate. It continues to return the authorized current score projections and records this as a known semantic limitation. Cursor pagination is now correctly enforced independently.

### Compatibility impact

Clients cannot rely on the filter to reduce results. Guessing a mapping now could silently omit valid scores or expose historical revisions inconsistently.

### Recommended next-contract correction

Choose and approve one of these mutually exclusive corrections:

1. Define exact precedence and revision semantics for the existing combined `status` filter, including how publication and lock facts override calculation state.
2. Replace it with orthogonal filters such as `calculationStatus`, `publicationStatus`, `lockStatus`, and an explicit revision selector. This is recommended because it matches the existing authority model and avoids hidden precedence.

Until that decision is approved, retain the current safe behavior and document the parameter as not semantically enforceable.

### Breaking correction

Likely yes. Either option changes observable filter semantics; option 2 also changes the request shape.

## Proposal summary

Contract 1.3 contains 16 known granular defect records: 15 machine-detectable static parity exceptions (12 sort findings plus the three schema issues above) and one service-semantic limitation for `listStudentScores.status`. None is repaired in place. A future contract revision should publish the corrections through normal versioning and release review.
