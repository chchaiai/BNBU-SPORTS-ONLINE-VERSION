ALTER TABLE v81_history_settings ADD COLUMN maximum_minutes integer NOT NULL DEFAULT 60 CHECK (maximum_minutes BETWEEN 1 AND 1440);
