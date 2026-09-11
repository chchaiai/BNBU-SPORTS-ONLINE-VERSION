# Contract 1.5.0 Post-Merge Release Checklist

This pull request prepares artifacts only. Do not create a tag or GitHub Release before merge.

1. On the merged default branch, run `npm --prefix backend run repo-layout:check`.
2. Run `npm --prefix tools/backend-contracts run contract:release:check` and the full backend CI workflow.
3. Confirm `docs/backend-contracts/openapi.yaml` still hashes to `bf303721fcf8cf7dac2af37559a6ddb77bdf615ad0e3cb63b6849ea3ee645302`.
4. Copy the candidate snapshot into `docs/backend-contracts/contract-history/1.5.0-contract-bf303721fcf8cf7dac2af37559a6ddb77bdf615ad0e3cb63b6849ea3ee645302/` with its manifest in a dedicated post-merge release commit.
5. Update the current-baseline pointer only in that release commit.
6. Create the approved Git tag and GitHub Release from the verified merged commit; attach the manifest, OpenAPI snapshot, compatibility reports, changelog, migration notes, and client handoff.
7. If any hash or gate differs, stop and forward-fix; never overwrite a historical snapshot.
