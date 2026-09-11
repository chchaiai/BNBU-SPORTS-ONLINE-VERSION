# Shared Foundation infrastructure

This tree owns cross-module authentication, authorization, configuration, errors, HTTP, IDs, time, logging, validation, pagination, idempotency, audit, outbox, database, and storage ports.

Business modules may depend on these stable ports. Shared infrastructure must not import a business module, and no controller may call Prisma directly.
