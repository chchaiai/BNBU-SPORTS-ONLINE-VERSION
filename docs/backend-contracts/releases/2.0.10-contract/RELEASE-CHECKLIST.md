# Contract 2.0.10 Post-Merge Release Checklist

Release state: `published`. Do not create a tag or GitHub Release before the candidate is merged, finalized, and revalidated on the authoritative commit.

1. On the merged default branch, run `npm --prefix backend run repo-layout:check`.
2. Run `npm --prefix tools/backend-contracts run contract:release:check` and the full backend CI workflow.
3. Confirm `docs/backend-contracts/openapi.yaml` still hashes to `56f7f13cdd8122dae630fec93bf198f7ed6d92a5fc4f67ae4f866a3b41c38ad7`.
4. Finalize the immutable snapshot at `docs/backend-contracts/contract-history/2.0.10-contract-56f7f13cdd8122dae630fec93bf198f7ed6d92a5fc4f67ae4f866a3b41c38ad7/` in a dedicated post-merge release commit.
5. Confirm the current-baseline pointer reports `2.0.10-contract` as `published` only in that release commit.
6. Create the approved Git tag and GitHub Release from the verified merged commit; attach the manifest, OpenAPI snapshot, compatibility reports, changelog, migration notes, and client handoff.
7. If any hash or gate differs, stop and forward-fix; never overwrite a historical snapshot.
