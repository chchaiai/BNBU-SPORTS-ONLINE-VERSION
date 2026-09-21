CREATE TABLE v81_teacher_notes (
 teacher_id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,
 remark varchar(1000) NOT NULL DEFAULT '',
 updated_at timestamptz NOT NULL,
 CONSTRAINT v81_teacher_notes_teacher_scope_fk FOREIGN KEY (teacher_id,organization_id) REFERENCES teacher_profiles(id,organization_id) ON DELETE CASCADE
);
