# SQLite Migrations

Place `.sql` files here in numeric order (e.g. `0001_add_indexes.sql`, `0002_add_settings.sql`).

Files are applied once, tracked by the `schema_version` key in the `settings` table.
Migration filenames must start with a number: the runner extracts the prefix as the version.

The runner stops at the first error — do not leave DB in an indeterminate state.
