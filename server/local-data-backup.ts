import Database from 'better-sqlite3';
import { createHash, randomBytes } from 'node:crypto';
import { chmod, copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';

const DATABASE_NAME = 'fenix-painel.sqlite';
const KEY_NAME = '.local-key';

function inside(child: string, parent: string) {
  return child === parent || child.startsWith(`${parent}${sep}`);
}

async function verifyBackup(directory: string) {
  const databasePath = join(directory, DATABASE_NAME);
  const keyPath = join(directory, KEY_NAME);
  const [databaseInfo, key] = await Promise.all([stat(databasePath), readFile(keyPath)]);
  if (!databaseInfo.isFile() || key.length !== 32) throw new Error('O backup local está incompleto ou inválido.');
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const result = database.pragma('quick_check') as Array<{ quick_check: string }>;
    if (result.length !== 1 || result[0]?.quick_check !== 'ok') throw new Error('A verificação de integridade do backup falhou.');
  } finally {
    database.close();
  }
  return { databasePath, keyPath, databaseSha256: createHash('sha256').update(await readFile(databasePath)).digest('hex') };
}

export async function createLocalDataBackup(sourceDataDir: string, destination: string) {
  const source = resolve(sourceDataDir);
  const target = resolve(destination);
  if (inside(target, source)) throw new Error('Guarde o backup fora da pasta de dados do painel.');
  const sourceDatabasePath = join(source, DATABASE_NAME);
  const sourceKeyPath = join(source, KEY_NAME);
  const targetExisted = await stat(target).then(() => true, () => false);
  if (targetExisted) throw new Error(`O destino já existe: ${target}`);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await mkdir(target, { mode: 0o700 });
  try {
    const sourceDatabase = new Database(sourceDatabasePath, { readonly: true, fileMustExist: true });
    try { await sourceDatabase.backup(join(target, DATABASE_NAME)); }
    finally { sourceDatabase.close(); }
    await copyFile(sourceKeyPath, join(target, KEY_NAME));
    await chmod(join(target, DATABASE_NAME), 0o600);
    await chmod(join(target, KEY_NAME), 0o600);
    await chmod(target, 0o700);
    const verification = await verifyBackup(target);
    const manifest = { createdAt: new Date().toISOString(), database: DATABASE_NAME, databaseSha256: verification.databaseSha256 };
    await writeFile(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    return { directory: target, databaseSha256: verification.databaseSha256 };
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
}

export async function restoreLocalDataBackup(backupDirectory: string, destinationDataDir: string, replaceExisting = false) {
  const backup = resolve(backupDirectory);
  const target = resolve(destinationDataDir);
  const verified = await verifyBackup(backup);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const staging = join(dirname(target), `.${basename(target)}-restore-${randomBytes(6).toString('hex')}`);
  await mkdir(staging, { mode: 0o700 });
  let previous: string | null = null;
  try {
    await copyFile(verified.databasePath, join(staging, DATABASE_NAME));
    await copyFile(verified.keyPath, join(staging, KEY_NAME));
    await chmod(join(staging, DATABASE_NAME), 0o600);
    await chmod(join(staging, KEY_NAME), 0o600);
    await verifyBackup(staging);
    const targetExists = await stat(target).then(() => true, () => false);
    if (targetExists) {
      if (!replaceExisting) throw new Error('A pasta de dados já existe. Use a opção de substituição após parar o painel.');
      previous = `${target}.pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      await rename(target, previous);
    }
    await rename(staging, target);
    await chmod(target, 0o700);
    return { directory: target, previousDirectory: previous };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    if (previous) await rename(previous, target).catch(() => undefined);
    throw error;
  }
}
