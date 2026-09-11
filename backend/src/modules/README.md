# Modular monolith modules

Only modules admitted by the active implementation gate belong here. Each implemented module separates domain, application, infrastructure, and interface/HTTP responsibilities where those layers are needed.

Foundation starts with health, system mode, organizations, auth, users/profiles, and semesters. Unimplemented business modules are intentionally absent; the service must not expose placeholder-success controllers.
