\set ON_ERROR_STOP on
SELECT current_user, current_database(), version();
SELECT ssl, version AS tls_version, cipher FROM pg_stat_ssl WHERE pid = pg_backend_pid();
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolcanlogin
FROM pg_roles WHERE rolname IN ('bnbusports_app', 'bnbusports_sqladmin');
SELECT r.rolname,
  has_database_privilege(r.rolname, 'bnbusports', 'CONNECT') AS db_connect,
  has_database_privilege(r.rolname, 'bnbusports', 'CREATE') AS db_create,
  has_schema_privilege(r.rolname, 'public', 'USAGE') AS public_usage,
  has_schema_privilege(r.rolname, 'public', 'CREATE') AS public_create
FROM pg_roles r WHERE r.rolname IN ('bnbusports_app', 'bnbusports_sqladmin');
SELECT member_role.rolname AS member, parent_role.rolname AS parent
FROM pg_auth_members m JOIN pg_roles member_role ON member_role.oid=m.member
JOIN pg_roles parent_role ON parent_role.oid=m.roleid
WHERE member_role.rolname IN ('bnbusports_app', 'bnbusports_sqladmin');
SELECT count(*) AS public_business_tables FROM pg_tables WHERE schemaname='public';
SELECT defaclrole::regrole AS creator, defaclnamespace::regnamespace AS schema,
  defaclobjtype, defaclacl FROM pg_default_acl;
SHOW max_connections;
SHOW timezone;

-- One real DDL/DML transaction, entirely rolled back. No business tables touched.
BEGIN;
CREATE SCHEMA infra_probe_20260909;
CREATE TABLE infra_probe_20260909.probe (id integer PRIMARY KEY, value text NOT NULL);
GRANT USAGE ON SCHEMA infra_probe_20260909 TO bnbusports_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON infra_probe_20260909.probe TO bnbusports_app;
SET LOCAL ROLE bnbusports_app;
INSERT INTO infra_probe_20260909.probe VALUES (1,'synthetic');
UPDATE infra_probe_20260909.probe SET value='verified' WHERE id=1;
SELECT current_user, count(*)=1 AND min(value)='verified' AS app_dml_pass
FROM infra_probe_20260909.probe;
DELETE FROM infra_probe_20260909.probe WHERE id=1;
SELECT count(*)=0 AS app_delete_pass FROM infra_probe_20260909.probe;
RESET ROLE;
ROLLBACK;
SELECT NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='infra_probe_20260909') AS rollback_cleanup_pass;
