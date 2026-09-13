ALTER TABLE student_profiles ADD COLUMN other_region_name varchar(100);
ALTER TABLE student_profiles ADD CONSTRAINT student_other_region_name_check
CHECK (other_region_name IS NULL OR (region_code='OTHER' AND btrim(other_region_name)<>''));
