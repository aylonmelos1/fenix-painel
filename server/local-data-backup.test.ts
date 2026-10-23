import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalDataBackup, restoreLocalDataBackup } from './local-data-backup.js';

test('local backup verifies and restores the database together with its encryption key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fenix-lts-backup-'));
  const source = join(root, 'source-data');
  const backup = join(root, 'backup');
  const restored = join(root, 'restored-data');
  await mkdir(source, { mode: 0o700 });
  const databasePath = join(source, 'fenix-painel.sqlite');
  const sourceDb = new Database(databasePath);
  sourceDb.exec("CREATE TABLE sample (value TEXT); INSERT INTO sample VALUES ('preserved')");
  sourceDb.close();
  const key = Buffer.alloc(32, 7);
  await writeFile(join(source, '.local-key'), key, { mode: 0o600 });
  try {
    const result = await createLocalDataBackup(source, backup);
    assert.match(result.databaseSha256, /^[a-f0-9]{64}$/);
    const restore = await restoreLocalDataBackup(backup, restored);
    assert.equal(restore.previousDirectory, null);
    assert.deepEqual(await readFile(join(restored, '.local-key')), key);
    const restoredDb = new Database(join(restored, 'fenix-painel.sqlite'), { readonly: true });
    assert.equal((restoredDb.prepare('SELECT value FROM sample').get() as { value: string }).value, 'preserved');
    restoredDb.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('restore refuses replacement unless requested and preserves the prior directory when replacing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fenix-lts-restore-'));
  const source = join(root, 'source');
  const backup = join(root, 'backup');
  const target = join(root, 'target');
  await mkdir(source);
  const db = new Database(join(source, 'fenix-painel.sqlite'));
  db.exec('CREATE TABLE sample (value TEXT)');
  db.close();
  await writeFile(join(source, '.local-key'), Buffer.alloc(32, 3));
  await mkdir(target);
  await writeFile(join(target, 'local-note'), 'keep');
  try {
    await createLocalDataBackup(source, backup);
    await assert.rejects(restoreLocalDataBackup(backup, target), /já existe/);
    const result = await restoreLocalDataBackup(backup, target, true);
    assert.ok(result.previousDirectory);
    assert.equal(await readFile(join(result.previousDirectory!, 'local-note'), 'utf8'), 'keep');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
