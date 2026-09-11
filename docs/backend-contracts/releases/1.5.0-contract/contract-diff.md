# OpenAPI Compatibility Report: 1.4.0-contract to 1.5.0-contract

Result: **COMPATIBLE**.

| Source | Version | SHA-256 | Operations |
| --- | --- | --- | ---: |
| Published baseline | 1.4.0-contract | `c5d18c4894bbe421074cba27da3b39a9076328c499cc742b273665994c29059b` | 122 |
| Candidate | 1.5.0-contract | `bf303721fcf8cf7dac2af37559a6ddb77bdf615ad0e3cb63b6849ea3ee645302` | 126 |

| Classification | Count |
| --- | ---: |
| Breaking | 55 |
| Review required | 0 |
| Non-breaking | 17 |
| Approved exceptions | 55 |
| Unapproved blockers | 0 |

## Direction-aware changes

| Change ID | Classification | Direction | Kind | Location | Approved exception |
| --- | --- | --- | --- | --- | --- |
| enum-values-added-114f60e70927f40e | BREAKING | response | ENUM_VALUES_ADDED | `POST /auth/refresh/responses/200/application/json/properties/data/properties/user/properties/status/enum` | YES |
| enum-values-added-399238cb24dfceb6 | NON_BREAKING | request | ENUM_VALUES_ADDED | `POST /media-uploads/requestBody/application/json/properties/mimeType/enum` | NO |
| enum-values-added-4d204ee37d30b860 | BREAKING | response | ENUM_VALUES_ADDED | `POST /auth/student-sign-in-codes/verify/responses/200/application/json/properties/data/properties/user/properties/status/enum` | YES |
| enum-values-added-a3773a192eae004d | BREAKING | response | ENUM_VALUES_ADDED | `POST /auth/password-login/responses/200/application/json/properties/data/properties/user/properties/status/enum` | YES |
| enum-values-added-ba1b5fb38d335530 | BREAKING | response | ENUM_VALUES_ADDED | `POST /course-invites/{inviteToken}/join/responses/200/application/json/properties/data/properties/authSession/properties/user/properties/status/enum` | YES |
| enum-values-added-c8bb8f2d9563b454 | BREAKING | response | ENUM_VALUES_ADDED | `GET /me/responses/200/application/json/properties/data/properties/user/properties/status/enum` | YES |
| enum-values-added-fb983bec811ab6d9 | BREAKING | response | ENUM_VALUES_ADDED | `POST /course-invites/{inviteToken}/join/responses/201/application/json/properties/data/properties/authSession/properties/user/properties/status/enum` | YES |
| enum-values-removed-1df9053b65a2b9ab | BREAKING | request | ENUM_VALUES_REMOVED | `POST /auth/account-recovery-requests/requestBody/application/json/properties/channel/enum` | YES |
| enum-values-removed-a259718a82500839 | BREAKING | request | ENUM_VALUES_REMOVED | `POST /course-invites/{inviteToken}/join-capabilities/requestBody/application/json/properties/gender/enum` | YES |
| enum-values-removed-ae13e512f631dd11 | BREAKING | request | ENUM_VALUES_REMOVED | `POST /auth/student-sign-in-codes/requestBody/application/json/properties/channel/enum` | YES |
| operation-removed-ea73ccd9bdec9a3a | BREAKING | operation | OPERATION_REMOVED | `PATCH /me` | YES |
| property-added-1908909463b5e388 | NON_BREAKING | request | PROPERTY_ADDED | `PATCH /exemption-applications/{applicationId}/requestBody/application/json/properties/applicationSubtype` | NO |
| property-added-2a03006f9f3de4b0 | NON_BREAKING | request | PROPERTY_ADDED | `PATCH /exemption-applications/{applicationId}/requestBody/application/json/properties/organizationName` | NO |
| property-added-b37be7dc9f0cf420 | NON_BREAKING | request | PROPERTY_ADDED | `POST /exemption-applications/requestBody/application/json/properties/applicationSubtype` | NO |
| property-added-bc4db8bbd8ae4bad | NON_BREAKING | request | PROPERTY_ADDED | `POST /exemption-applications/requestBody/application/json/properties/organizationName` | NO |
| property-removed-24b7355070b45b91 | BREAKING | response | PROPERTY_REMOVED | `POST /course-invites/{inviteToken}/join/responses/200/application/json/properties/data/properties/authSession/properties/user/properties/primaryPhoneMasked` | YES |
| property-removed-3540dbcd706e1250 | BREAKING | response | PROPERTY_REMOVED | `POST /course-invites/{inviteToken}/join/responses/201/application/json/properties/data/properties/authSession/properties/user/properties/primaryPhoneMasked` | YES |
| property-removed-41c83a02537eed1c | BREAKING | response | PROPERTY_REMOVED | `POST /auth/student-sign-in-codes/verify/responses/200/application/json/properties/data/properties/user/properties/phoneVerified` | YES |
| property-removed-41dce74b825ec16c | BREAKING | response | PROPERTY_REMOVED | `POST /exercise-records/{recordId}/withdraw/responses/200/application/json/properties/data/properties/studentRemark` | YES |
| property-removed-44137575780297e4 | BREAKING | response | PROPERTY_REMOVED | `POST /course-invites/{inviteToken}/join/responses/201/application/json/properties/data/properties/authSession/properties/user/properties/phoneVerified` | YES |
| property-removed-4b16e834eb8998ef | BREAKING | response | PROPERTY_REMOVED | `POST /auth/refresh/responses/200/application/json/properties/data/properties/user/properties/phoneVerified` | YES |
| property-removed-501d8727387f2e4a | BREAKING | response | PROPERTY_REMOVED | `POST /auth/student-sign-in-codes/verify/responses/200/application/json/properties/data/properties/user/properties/primaryPhoneMasked` | YES |
| property-removed-634284f77d2ae9ca | BREAKING | response | PROPERTY_REMOVED | `POST /course-invites/{inviteToken}/join/responses/200/application/json/properties/data/properties/authSession/properties/user/properties/phoneVerified` | YES |
| property-removed-69d196e5f183a251 | BREAKING | response | PROPERTY_REMOVED | `POST /auth/refresh/responses/200/application/json/properties/data/properties/user/properties/primaryPhoneMasked` | YES |
| property-removed-71cc6ba8bc2d62d4 | BREAKING | response | PROPERTY_REMOVED | `POST /auth/password-login/responses/200/application/json/properties/data/properties/user/properties/primaryPhoneMasked` | YES |
| property-removed-77effd74e4a9b2f4 | BREAKING | response | PROPERTY_REMOVED | `POST /exercise-records/{recordId}/discard/responses/200/application/json/properties/data/properties/studentRemark` | YES |
| property-removed-901462e082bf0322 | BREAKING | response | PROPERTY_REMOVED | `POST /exercise-records/responses/201/application/json/properties/data/properties/studentRemark` | YES |
| property-removed-a30c4329d74e9af8 | BREAKING | response | PROPERTY_REMOVED | `POST /exercise-records/{recordId}/submit/responses/200/application/json/properties/data/properties/studentRemark` | YES |
| property-removed-aa2a15ac1f6d11b0 | BREAKING | response | PROPERTY_REMOVED | `GET /exercise-records/{recordId}/responses/200/application/json/properties/data/properties/studentRemark` | YES |
| property-removed-ad6d840d5a61623c | BREAKING | request | PROPERTY_REMOVED | `POST /exercise-records/requestBody/application/json/properties/studentRemark` | YES |
| property-removed-b00f908f804e6e87 | BREAKING | request | PROPERTY_REMOVED | `PATCH /exercise-records/{recordId}/requestBody/application/json/properties/studentRemark` | YES |
| property-removed-bfd4ac63769e0917 | BREAKING | response | PROPERTY_REMOVED | `GET /me/responses/200/application/json/properties/data/properties/user/properties/primaryPhoneMasked` | YES |
| property-removed-c2bd2df6aee70f40 | BREAKING | response | PROPERTY_REMOVED | `GET /exercise-records/responses/200/application/json/properties/data/items/properties/studentRemark` | YES |
| property-removed-c47759d425bdd954 | BREAKING | response | PROPERTY_REMOVED | `GET /me/responses/200/application/json/properties/data/properties/user/properties/phoneVerified` | YES |
| property-removed-e77bcdde4321d88c | BREAKING | response | PROPERTY_REMOVED | `POST /auth/password-login/responses/200/application/json/properties/data/properties/user/properties/phoneVerified` | YES |
| property-removed-f926b518920a8cea | BREAKING | response | PROPERTY_REMOVED | `PATCH /exercise-records/{recordId}/responses/200/application/json/properties/data/properties/studentRemark` | YES |
| response-status-added-6fe12d29a99e7316 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `GET /me/preferences/responses/409` | NO |
| response-status-added-8c6140e97f4bd71c | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `PATCH /exemption-applications/{applicationId}/responses/422` | NO |
| response-status-added-f94a97fe6c147e30 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /exemption-applications/{applicationId}/submit/responses/422` | NO |
| schema-alternative-added-3235075c6f00436f | NON_BREAKING | response | SCHEMA_ALTERNATIVE_ADDED | `POST /exercise-records/{recordId}/withdraw/responses/200/application/json/properties/data/properties/description` | NO |
| schema-alternative-added-38a1c4c4bbde872e | NON_BREAKING | request | SCHEMA_ALTERNATIVE_ADDED | `PATCH /exercise-records/{recordId}/requestBody/application/json/properties/description` | NO |
| schema-alternative-added-5355a4f0c2013b6f | NON_BREAKING | request | SCHEMA_ALTERNATIVE_ADDED | `POST /exercise-records/requestBody/application/json/properties/description` | NO |
| schema-alternative-added-759a5f2c9b2ff41c | NON_BREAKING | response | SCHEMA_ALTERNATIVE_ADDED | `GET /exercise-records/{recordId}/responses/200/application/json/properties/data/properties/description` | NO |
| schema-alternative-added-addbe0729e55f31c | NON_BREAKING | response | SCHEMA_ALTERNATIVE_ADDED | `POST /exercise-records/responses/201/application/json/properties/data/properties/description` | NO |
| schema-alternative-added-bd5ebc904984e427 | NON_BREAKING | response | SCHEMA_ALTERNATIVE_ADDED | `POST /exercise-records/{recordId}/discard/responses/200/application/json/properties/data/properties/description` | NO |
| schema-alternative-added-d702e945eb7098b8 | NON_BREAKING | response | SCHEMA_ALTERNATIVE_ADDED | `GET /exercise-records/responses/200/application/json/properties/data/items/properties/description` | NO |
| schema-alternative-added-d77fd63280256076 | NON_BREAKING | response | SCHEMA_ALTERNATIVE_ADDED | `PATCH /exercise-records/{recordId}/responses/200/application/json/properties/data/properties/description` | NO |
| schema-alternative-added-e8feb08bf8f67650 | NON_BREAKING | response | SCHEMA_ALTERNATIVE_ADDED | `POST /exercise-records/{recordId}/submit/responses/200/application/json/properties/data/properties/description` | NO |
| schema-composition-changed-0404ff52260db0b3 | BREAKING | response | SCHEMA_COMPOSITION_CHANGED | `GET /me/responses/200/application/json/properties/data/properties/studentProfile` | YES |
| schema-composition-changed-ddd6315e3a007326 | BREAKING | response | SCHEMA_COMPOSITION_CHANGED | `POST /exercise-reviews/batch/responses/200/application/json/properties/data/properties/items/items/properties/data` | YES |
| schema-format-changed-45f6b1a170bfc60e | BREAKING | request | SCHEMA_FORMAT_CHANGED | `POST /auth/account-recovery-requests/requestBody/application/json/properties/account/format` | YES |
| schema-format-changed-96429a8db1425d4e | BREAKING | request | SCHEMA_FORMAT_CHANGED | `POST /auth/student-sign-in-codes/requestBody/application/json/properties/account/format` | YES |
| schema-format-changed-aef80021814edf44 | BREAKING | request | SCHEMA_FORMAT_CHANGED | `POST /auth/password-login/requestBody/application/json/properties/account/format` | YES |
| schema-maximum-changed-08697f6959164752 | BREAKING | response | SCHEMA_MAXIMUM_CHANGED | `PATCH /students/{studentId}/responses/200/application/json/properties/data/properties/gradeYear/maximum` | YES |
| schema-maximum-changed-180a909f73f00070 | BREAKING | response | SCHEMA_MAXIMUM_CHANGED | `POST /course-invites/{inviteToken}/join/responses/201/application/json/properties/data/properties/studentProfile/properties/gradeYear/maximum` | YES |
| schema-maximum-changed-186b1211558b1b62 | BREAKING | response | SCHEMA_MAXIMUM_CHANGED | `GET /students/{studentId}/responses/200/application/json/properties/data/properties/gradeYear/maximum` | YES |
| schema-maximum-changed-467d3e5fd18f9e26 | BREAKING | request | SCHEMA_MAXIMUM_CHANGED | `PATCH /students/{studentId}/requestBody/application/json/properties/gradeYear/maximum` | YES |
| schema-maximum-changed-479a579a25059962 | BREAKING | response | SCHEMA_MAXIMUM_CHANGED | `GET /roster-imports/{rosterImportId}/entries/responses/200/application/json/properties/data/items/properties/gradeYear/maximum` | YES |
| schema-maximum-changed-510b365bda44b516 | BREAKING | response | SCHEMA_MAXIMUM_CHANGED | `GET /students/responses/200/application/json/properties/data/items/properties/gradeYear/maximum` | YES |
| schema-maximum-changed-6c8b67e276f95ea8 | BREAKING | response | SCHEMA_MAXIMUM_CHANGED | `POST /course-invites/{inviteToken}/join/responses/200/application/json/properties/data/properties/studentProfile/properties/gradeYear/maximum` | YES |
| schema-maximum-changed-d35c358288cef08b | BREAKING | request | SCHEMA_MAXIMUM_CHANGED | `POST /course-invites/{inviteToken}/join-capabilities/requestBody/application/json/properties/gradeYear/maximum` | YES |
| schema-minimum-changed-07ab154dd9b372fc | BREAKING | request | SCHEMA_MINIMUM_CHANGED | `PATCH /students/{studentId}/requestBody/application/json/properties/gradeYear/minimum` | YES |
| schema-minimum-changed-07cc5e5a155139e1 | BREAKING | response | SCHEMA_MINIMUM_CHANGED | `POST /course-invites/{inviteToken}/join/responses/200/application/json/properties/data/properties/studentProfile/properties/gradeYear/minimum` | YES |
| schema-minimum-changed-3ff3837f26c8a978 | BREAKING | request | SCHEMA_MINIMUM_CHANGED | `POST /course-invites/{inviteToken}/join-capabilities/requestBody/application/json/properties/gradeYear/minimum` | YES |
| schema-minimum-changed-4737b9b0c04ec5e8 | BREAKING | response | SCHEMA_MINIMUM_CHANGED | `GET /roster-imports/{rosterImportId}/entries/responses/200/application/json/properties/data/items/properties/gradeYear/minimum` | YES |
| schema-minimum-changed-8df0919d11a83df3 | BREAKING | response | SCHEMA_MINIMUM_CHANGED | `POST /course-invites/{inviteToken}/join/responses/201/application/json/properties/data/properties/studentProfile/properties/gradeYear/minimum` | YES |
| schema-minimum-changed-94856ef8536503a9 | BREAKING | response | SCHEMA_MINIMUM_CHANGED | `GET /students/responses/200/application/json/properties/data/items/properties/gradeYear/minimum` | YES |
| schema-minimum-changed-c9a42d113c7a3057 | BREAKING | response | SCHEMA_MINIMUM_CHANGED | `GET /students/{studentId}/responses/200/application/json/properties/data/properties/gradeYear/minimum` | YES |
| schema-minimum-changed-d83366ff85a25e57 | BREAKING | response | SCHEMA_MINIMUM_CHANGED | `PATCH /students/{studentId}/responses/200/application/json/properties/data/properties/gradeYear/minimum` | YES |
| schema-minlength-changed-2db7d9a92e125a18 | BREAKING | request | SCHEMA_MINLENGTH_CHANGED | `POST /auth/account-recovery-requests/requestBody/application/json/properties/account/minLength` | YES |
| schema-minlength-changed-c63f586d8afb97db | BREAKING | request | SCHEMA_MINLENGTH_CHANGED | `POST /auth/password-login/requestBody/application/json/properties/account/minLength` | YES |
| schema-minlength-changed-c8d21486259f5185 | BREAKING | request | SCHEMA_MINLENGTH_CHANGED | `POST /auth/student-sign-in-codes/requestBody/application/json/properties/account/minLength` | YES |
