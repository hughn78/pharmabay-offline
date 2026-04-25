import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

/**
 * Simple versioned migration runner.
 *
 * Looks for .sql files in the migrations directory (relative to app root),
 * sorts them by filename, and runs each one whose version is > current_version.
 * Tracks version in the `settings` table under key `schema_version`.
 */

const MIGRATIONS_DIR = (() => {
  try {
    const { app } = require('electron');
    return path.join(app.getAppPath(), 'migrations');
  } catch {
    return path.join(__dirname, '..', 'migrations');
  }
})();

function getSetting(db: Database.Database, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

function listMigrationFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

export function runMigrations(db: Database.Database): { applied: number; errors: string[] } {
  const errors: string[] = [];
  let applied = 0;

  const currentVersion = parseInt(getSetting(db, 'schema_version') ?? '0', 10) || 0;
  const files = listMigrationFiles(MIGRATIONS_DIR);

  for (const file of files) {
    const versionMatch = file.match(/^(\d+)/);
    const version = versionMatch ? parseInt(versionMatch[1], 10) : 0;

    if (version <= currentVersion) continue;

    const filePath = path.join(MIGRATIONS_DIR, file);
    try {
      const sql = fs.readFileSync(filePath, 'utf-8');
      db.exec(sql);
      setSetting(db, 'schema_version', String(version));
      applied++;
    } catch (err: any) {
      errors.push(`Migration ${file} failed: ${err.message}`);
      break; // Stop on first error — do not leave DB in indeterminate state
    }
  }

  return { applied, errors };
}
