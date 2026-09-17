-- AI findings are advisory. No teacher decision, credit or workflow is changed here.
CREATE TABLE v81_ai_review_jobs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  record_id uuid NOT NULL,
  material_version integer NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','SUPERSEDED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  lease_owner uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  recommendation text CHECK (recommendation IN ('SUGGEST_PASS','TEACHER_REVIEW','SUSPECTED_RISK')),
  flags jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(flags)='array'),
  assessment jsonb,
  provider text,
  model text,
  policy_version text NOT NULL DEFAULT 'advisory-v1',
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(record_id,material_version),
  FOREIGN KEY(record_id,organization_id) REFERENCES exercise_records(id,organization_id) ON DELETE CASCADE,
  FOREIGN KEY(record_id,material_version) REFERENCES v81_material_versions(record_id,material_version) ON DELETE CASCADE,
  CHECK ((status='SUCCEEDED') = (recommendation IS NOT NULL)),
  CHECK (status<>'RUNNING' OR (lease_owner IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX v81_ai_review_queue ON v81_ai_review_jobs(next_attempt_at,created_at) WHERE status IN ('QUEUED','RUNNING');
CREATE INDEX v81_ai_review_filter ON v81_ai_review_jobs(organization_id,recommendation,record_id);
-- Conservative permanent reservation per external attempt; retries also consume it.
-- Retained independently from student deletion so deleting records cannot reset spend.
CREATE TABLE v81_ai_review_budget (
  id integer PRIMARY KEY CHECK(id=1),
  reserved_fen integer NOT NULL DEFAULT 0 CHECK(reserved_fen>=0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO v81_ai_review_budget(id) VALUES(1);
