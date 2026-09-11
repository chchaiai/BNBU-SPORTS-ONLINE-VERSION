# Contract 1.4.0 Changelog

Baseline: immutable `1.3.0-contract` SHA-256 `914084874afda2481813a041da4cc01249aa9ea557d9a8bf29baeed4f10e0dc9`.

- Preserves all 122 published operations and all prior request/response schema alternatives.
- Documents every globally reachable SystemMode mutation response and the Export read fail-closed response.
- Defines mutually exclusive `listStudentScores.status` semantics and aligns the runtime projection with the published flat StudentScore transport.
- Records all 16 Contract 1.3 errata without narrowing the 1.3 request schema: endpoint runtime vocabularies use `x-runtime-enum`; compatibility-only Score sort fields are deprecated and explicitly unsupported.
- Accepts both RFC3339 time values and organization-local wall-clock values for class-section local-time fields while retaining the prior format alternative.
- Adds an explicit UNLICENSED identifier and scoped Redocly suppressions with removal conditions.
- Adds no path removal, method removal, required request field, response field removal, security weakening, permission change, or unapproved breaking change.
