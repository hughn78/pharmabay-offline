import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

const MAX_BACKUPS = 7;

/**
 * Create a timestamped SQLite backup in userData/backups/.
 * Call after initDB() and before closing the app.
 * Returns the path of the new backup file.
 */
export function createBackup(dbInstance: Database.Database): string {
  const userData = app.getPath('userData');
  const backupDir = path.join(userData, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = path.join(backupDir, `pharmabay-${timestamp}.sqlite`);

  // SQLite native online backup (non-blocking copy)
  const backup = dbInstance.backup(backupPath);
  let remaining = -1;
  while (remaining !== 0) {
    remaining = backup.step(-1) as number; // copy all pages in one go
  }
  backup.finish();

  cleanupOldBackups(backupDir);
  console.log('[backup] Created:', backupPath);
  return backupPath;
}

function cleanupOldBackups(backupDir: string): void {
  const files = fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.sqlite'))
    .map(f => {
      const p = path.join(backupDir, f);
      return { name: f, path: p, mtime: fs.statSync(p).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  for (const file of files.slice(MAX_BACKUPS)) {
    fs.unlinkSync(file.path);
    console.log('[backup] Removed old backup:', file.name);
  }
}

/**
 * Returns true if no backup exists for today's date.
 * Used to avoid redundant startup backups.
 */
export function shouldRunStartupBackup(userData: string): boolean {
  const backupDir = path.join(userData, 'backups');
  if (!fs.existsSync(backupDir)) return true;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return !fs.readdirSync(backupDir).some(f => f.includes(today));
}
