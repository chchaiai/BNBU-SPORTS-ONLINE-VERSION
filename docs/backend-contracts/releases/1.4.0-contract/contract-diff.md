# OpenAPI Compatibility Report: 1.3.0-contract to 1.4.0-contract

Result: **COMPATIBLE**.

| Source | Version | SHA-256 | Operations |
| --- | --- | --- | ---: |
| Published baseline | 1.3.0-contract | `914084874afda2481813a041da4cc01249aa9ea557d9a8bf29baeed4f10e0dc9` | 122 |
| Candidate | 1.4.0-contract | `c5d18c4894bbe421074cba27da3b39a9076328c499cc742b273665994c29059b` | 122 |

| Classification | Count |
| --- | ---: |
| Breaking | 0 |
| Review required | 0 |
| Non-breaking | 74 |
| Approved exceptions | 0 |
| Unapproved blockers | 0 |

## Direction-aware changes

| Change ID | Classification | Direction | Kind | Location | Approved exception |
| --- | --- | --- | --- | --- | --- |
| response-status-added-0759e0d10a444243 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /exercise-sessions/{sessionId}/reconcile/responses/503` | NO |
| response-status-added-0c7d2fc3aac6570c | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /media/{mediaId}/bind/responses/503` | NO |
| response-status-added-0d6eab27ce9e92ac | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /media-uploads/{uploadSessionId}/confirm/responses/503` | NO |
| response-status-added-0e38be5d12d00fc7 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /score-rules/{scoreRuleId}/approve/responses/503` | NO |
| response-status-added-109044a39c3e11ff | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /exercise-sessions/{sessionId}/resume/responses/503` | NO |
| response-status-added-1185558a8219780d | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /class-sections/{classSectionId}/course-invites/responses/503` | NO |
| response-status-added-13e6bf974cffa7fd | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /auth/password-login/responses/503` | NO |
| response-status-added-16dc53e427b86785 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /class-sections/{classSectionId}/enrollments/responses/503` | NO |
| response-status-added-19143a4352738b46 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /exercise-records/{recordId}/discard/responses/503` | NO |
| response-status-added-19981b4cd023b5c2 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /score-rules/{scoreRuleId}/submit-approval/responses/503` | NO |
| response-status-added-26ef27885c532692 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /roster-alignment-results/{alignmentResultId}/resolve/responses/503` | NO |
| response-status-added-2b63e281bb375b3c | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /exercise-records/{recordId}/submit/responses/503` | NO |
| response-status-added-2d0ca54eb07d3a50 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /exercise-records/{recordId}/withdraw/responses/503` | NO |
| response-status-added-2eb01a6e1e581521 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /exercise-reviews/batch/responses/503` | NO |
| response-status-added-301e0f8ca582adcd | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /roster-alignment-results/{alignmentResultId}/reopen/responses/503` | NO |
| response-status-added-387e857de4f258a5 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /student-scores/{studentScoreId}/adjustments/responses/503` | NO |
| response-status-added-3ebe4badfeee4b5f | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /class-sections/{classSectionId}/close/responses/503` | NO |
| response-status-added-3f09266e6871100c | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /enrollments/{enrollmentId}/withdraw/responses/503` | NO |
| response-status-added-42fcd503e189f2eb | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /courses/responses/503` | NO |
| response-status-added-47c4dc8d730c7b5f | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `GET /exports/{exportId}/responses/503` | NO |
| response-status-added-4e781f25a1874051 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /auth/password-login/responses/403` | NO |
| response-status-added-4f5a72af19310993 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /score-adjustments/{scoreAdjustmentId}/reject/responses/503` | NO |
| response-status-added-52f20689585477a2 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /class-sections/{classSectionId}/roster-imports/responses/404` | NO |
| response-status-added-5bd107ae5499cb9e | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /exercise-records/{recordId}/reviews/responses/503` | NO |
| response-status-added-61637fec3cbed9bf | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /course-invites/{inviteToken}/join/responses/503` | NO |
| response-status-added-64bd80f4a2d5bc21 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `PATCH /class-sections/{classSectionId}/responses/503` | NO |
| response-status-added-67b1bf2a94862155 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /class-sections/{classSectionId}/roster-imports/responses/503` | NO |
| response-status-added-6d20eb18bfa7b780 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /roster-alignment-results/{alignmentResultId}/ignore/responses/503` | NO |
| response-status-added-7591067592f1ad36 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /score-rules/{scoreRuleId}/reject/responses/503` | NO |
| response-status-added-777f250a1218c9c3 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /auth/logout/responses/503` | NO |
| response-status-added-7825efaeb13f787c | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /exercise-records/responses/503` | NO |
| response-status-added-7e98bf60993204ca | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `GET /exports/responses/503` | NO |
| response-status-added-81631d8a8109cbc5 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /media/{mediaId}/access-url/responses/503` | NO |
| response-status-added-8be0a88e1a881b7e | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /media-uploads/responses/503` | NO |
| response-status-added-918c20204a5141b6 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /enrollments/{enrollmentId}/remove/responses/503` | NO |
| response-status-added-93002fb60eaf40c7 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /roster-imports/{rosterImportId}/align/responses/503` | NO |
| response-status-added-9525330979cdb907 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /roster-imports/{rosterImportId}/rollback/responses/503` | NO |
| response-status-added-9b807922196fff35 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /student-scores/{studentScoreId}/publish/responses/503` | NO |
| response-status-added-a3f86bbdf1be8eca | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /auth/logout/responses/404` | NO |
| response-status-added-a45ac3b27bd9ed04 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /auth/refresh/responses/503` | NO |
| response-status-added-b2390a392dd5d185 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `PATCH /courses/{courseId}/responses/503` | NO |
| response-status-added-b4bf3fc8bf82ec3a | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /exports/{exportId}/download-url/responses/503` | NO |
| response-status-added-c319a71211592b16 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `PATCH /exercise-records/{recordId}/responses/503` | NO |
| response-status-added-d19fefa728dd2cd3 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /student-scores/{studentScoreId}/open-correction/responses/503` | NO |
| response-status-added-deba74f9f9c56e88 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /score-adjustments/{scoreAdjustmentId}/approve/responses/503` | NO |
| response-status-added-dec20ec0794c26b8 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /exercise-sessions/{sessionId}/cancel/responses/503` | NO |
| response-status-added-df6b81e1133f807c | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /course-invites/{inviteToken}/join-capabilities/responses/503` | NO |
| response-status-added-dfa77e80ec113a65 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /class-sections/responses/503` | NO |
| response-status-added-e09fa4370d338b01 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /student-scores/{studentScoreId}/recalculate/responses/503` | NO |
| response-status-added-eab16374171c05bd | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /exercise-sessions/{sessionId}/pause/responses/503` | NO |
| response-status-added-ed5f1eaea772478b | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /exercise-sessions/responses/503` | NO |
| response-status-added-ef38e729bdc4794a | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /exercise-records/{recordId}/reviews/reopen/responses/503` | NO |
| response-status-added-f0fe4a88483a0204 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /enrollments/{enrollmentId}/restore/responses/503` | NO |
| response-status-added-fb5f83c2012ad19b | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /exercise-sessions/{sessionId}/finish/responses/503` | NO |
| response-status-added-fb7e2481a284daa6 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /roster-alignment-results/{alignmentResultId}/confirm/responses/503` | NO |
| response-status-added-fbe248a78a1e9e29 | NON_BREAKING | response | RESPONSE_STATUS_ADDED | `POST /class-sections/{classSectionId}/score-rules/responses/503` | NO |
| schema-alternative-added-02ffb656839afb30 | NON_BREAKING | response | SCHEMA_ALTERNATIVE_ADDED | `PATCH /class-sections/{classSectionId}/responses/200/application/json/properties/data/properties/dailyEndTime` | NO |
| schema-alternative-added-157304cd3ba98208 | NON_BREAKING | response | SCHEMA_ALTERNATIVE_ADDED | `POST /course-invites/{inviteToken}/join/responses/200/application/json/properties/data/properties/classSection/properties/dailyEndTime` | NO |
| schema-alternative-added-1d2540d0a5ba15d4 | NON_BREAKING | response | SCHEMA_ALTERNATIVE_ADDED | `POST /class-sections/responses/201/application/json/properties/data/properties/dailyEndTime` | NO |
| schema-alternative-added-1f034bd5993c9047 | NON_BREAKING | response | SCHEMA_ALTERNATIVE_ADDED | `GET /class-sections/responses/200/application/json/properties/data/items/properties/dailyStartTime` | NO |
| schema-alternative-added-2094c2893f590037 | NON_BREAKING | response | SCHEMA_ALTERNATIVE_ADDED | `GET /class-sections/{classSectionId}/responses/200/application/json/properties/data/properties/dailyEndTime` | NO |
| schema-alternative-added-2739624e4a9669a8 | NON_BREAKING | response | SCHEMA_ALTERNATIVE_ADDED | `GET /teachers/{teacherId}/class-sections/responses/200/application/json/properties/data/items/properties/dailyEndTime` | NO |
| schema-alternative-added-2b206cb88367d7fe | NON_BREAKING | response | SCHEMA_ALTERNATIVE_ADDED | `POST /class-sections/responses/201/application/json/properties/data/properties/dailyStartTime` | NO |
| schema-alternative-added-4bc9561d4f26c970 | NON_BREAKING | response | SCHEMA_ALTERNATIVE_ADDED | `GET /class-sections/{classSectionId}/responses/200/application/json/properties/data/properties/dailyStartTime` | NO |
| schema-alternative-added-64c5392730d9e144 | NON_BREAKING | request | SCHEMA_ALTERNATIVE_ADDED | `PATCH /class-sections/{classSectionId}/requestBody/application/json/properties/dailyEndTime` | NO |
| schema-alternative-added-7bedc9a77d6867bc | NON_BREAKING | response | SCHEMA_ALTERNATIVE_ADDED | `POST /course-invites/{inviteToken}/join/responses/200/application/json/properties/data/properties/classSection/properties/dailyStartTime` | NO |
| schema-alternative-added-7e80d73d219a7f12 | NON_BREAKING | response | SCHEMA_ALTERNATIVE_ADDED | `POST /course-invites/{inviteToken}/join/responses/201/application/json/properties/data/properties/classSection/properties/dailyEndTime` | NO |
| schema-alternative-added-89f9ab4e9f510a70 | NON_BREAKING | response | SCHEMA_ALTERNATIVE_ADDED | `GET /class-sections/responses/200/application/json/properties/data/items/properties/dailyEndTime` | NO |
| schema-alternative-added-a1097f68cc2c2008 | NON_BREAKING | response | SCHEMA_ALTERNATIVE_ADDED | `GET /teachers/{teacherId}/class-sections/responses/200/application/json/properties/data/items/properties/dailyStartTime` | NO |
| schema-alternative-added-a770a57b771f89f0 | NON_BREAKING | response | SCHEMA_ALTERNATIVE_ADDED | `POST /class-sections/{classSectionId}/close/responses/200/application/json/properties/data/properties/dailyEndTime` | NO |
| schema-alternative-added-b8e3c6847ddff9a6 | NON_BREAKING | request | SCHEMA_ALTERNATIVE_ADDED | `PATCH /class-sections/{classSectionId}/requestBody/application/json/properties/dailyStartTime` | NO |
| schema-alternative-added-c4c099b69e12f971 | NON_BREAKING | response | SCHEMA_ALTERNATIVE_ADDED | `POST /class-sections/{classSectionId}/close/responses/200/application/json/properties/data/properties/dailyStartTime` | NO |
| schema-alternative-added-cdcdc3319f49ed54 | NON_BREAKING | response | SCHEMA_ALTERNATIVE_ADDED | `POST /course-invites/{inviteToken}/join/responses/201/application/json/properties/data/properties/classSection/properties/dailyStartTime` | NO |
| schema-alternative-added-cfea68c6bbd12e5a | NON_BREAKING | response | SCHEMA_ALTERNATIVE_ADDED | `PATCH /class-sections/{classSectionId}/responses/200/application/json/properties/data/properties/dailyStartTime` | NO |
