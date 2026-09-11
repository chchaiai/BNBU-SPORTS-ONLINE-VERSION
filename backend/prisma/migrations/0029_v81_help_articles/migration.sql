CREATE TABLE v81_help_articles (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(id, organization_id)
);
CREATE TABLE v81_help_article_revisions (
  article_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  version INTEGER NOT NULL CHECK(version >= 1),
  title_zh TEXT NOT NULL CHECK(length(btrim(title_zh)) > 0),
  title_en TEXT NOT NULL CHECK(length(btrim(title_en)) > 0),
  body_zh TEXT NOT NULL,
  body_en TEXT NOT NULL,
  keywords TEXT[] NOT NULL,
  category VARCHAR(32) NOT NULL CHECK(category IN ('login','enrollment','checkin','evidence','course','exemption','organization','notification','maintenance','feedback')),
  status VARCHAR(16) NOT NULL CHECK(status IN ('draft','published','archived')),
  sort_weight DOUBLE PRECISION NOT NULL CHECK(sort_weight > '-Infinity'::float8 AND sort_weight < 'Infinity'::float8),
  actor_id UUID NOT NULL,
  request_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(article_id, version),
  FOREIGN KEY(article_id, organization_id) REFERENCES v81_help_articles(id, organization_id),
  FOREIGN KEY(actor_id, organization_id) REFERENCES users(id, organization_id),
  CHECK(status <> 'published' OR (length(btrim(body_zh)) > 0 AND length(btrim(body_en)) > 0 AND cardinality(keywords) > 0))
);
CREATE INDEX v81_help_revisions_organization_idx ON v81_help_article_revisions(organization_id,article_id,version DESC);
CREATE TRIGGER v81_help_articles_immutable BEFORE UPDATE OR DELETE ON v81_help_articles
  FOR EACH ROW EXECUTE FUNCTION reject_stage21_append_only_mutation();
CREATE TRIGGER v81_help_revisions_immutable BEFORE UPDATE OR DELETE ON v81_help_article_revisions
  FOR EACH ROW EXECUTE FUNCTION reject_stage21_append_only_mutation();
CREATE FUNCTION guard_v81_help_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous_version INTEGER; previous_status VARCHAR(16);
BEGIN
  PERFORM id FROM v81_help_articles WHERE id=NEW.article_id FOR UPDATE;
  SELECT version,status INTO previous_version,previous_status FROM v81_help_article_revisions
    WHERE article_id=NEW.article_id ORDER BY version DESC LIMIT 1;
  IF NEW.version <> coalesce(previous_version,0)+1 THEN RAISE EXCEPTION 'help revision must be consecutive'; END IF;
  IF previous_status IS NULL THEN
    IF NEW.status='archived' THEN RAISE EXCEPTION 'new help article cannot be archived'; END IF;
  ELSIF previous_status <> NEW.status AND NOT (
    (previous_status='draft' AND NEW.status='published') OR
    (previous_status='published' AND NEW.status='archived') OR
    (previous_status='archived' AND NEW.status='published')) THEN
    RAISE EXCEPTION 'invalid help article transition';
  END IF;
  IF EXISTS(SELECT 1 FROM unnest(NEW.keywords) keyword WHERE keyword IS NULL OR length(btrim(keyword))=0)
    THEN RAISE EXCEPTION 'empty help keyword'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_help_revision_guard BEFORE INSERT ON v81_help_article_revisions
  FOR EACH ROW EXECUTE FUNCTION guard_v81_help_revision();
