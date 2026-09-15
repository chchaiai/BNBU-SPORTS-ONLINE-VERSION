-- Match the 1..1440 minute per-record caps introduced in 0072_exercise_limits.
-- This storage bound does not change rule snapshots or recalculate existing credit.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE v81_credit_projections
  DROP CONSTRAINT v81_credit_projections_eligible_minutes_check;
ALTER TABLE v81_credit_projections
  ADD CONSTRAINT v81_credit_projections_eligible_minutes_check
  CHECK (eligible_minutes BETWEEN 0 AND 1440);

COMMIT;
