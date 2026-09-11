-- Align email verification foreign-key update behavior with the authoritative Prisma model.
-- This preserves all challenge rows and changes only referential update actions.

ALTER TABLE "email_verification_challenges"
  DROP CONSTRAINT "email_verification_challenges_organization_fkey",
  DROP CONSTRAINT "email_verification_challenges_user_fkey";

ALTER TABLE "email_verification_challenges"
  ADD CONSTRAINT "email_verification_challenges_organization_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "email_verification_challenges_user_fkey"
    FOREIGN KEY ("user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
