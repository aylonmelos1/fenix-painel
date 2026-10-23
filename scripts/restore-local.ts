import { resolve, join } from 'node:path';
import { restoreLocalDataBackup } from '../server/local-data-backup.js';

const [backupArg, ...args] = process.argv.slice(2);
const targetArg = args.find((argument) => !argument.startsWith('--'));
const flags = args.filter((argument) => argument.startsWith('--'));
if (!backupArg || !flags.includes('--confirm-stopped')) {
  console.error('Uso: npm run data:restore -- <backup-dir> [data-dir] --confirm-stopped [--replace-existing]');
  console.error('Pare o painel antes de restaurar. A pasta atual, se substituída, será mantida como cópia de recuperação.');
  process.exitCode = 2;
} else {
  try {
    const result = await restoreLocalDataBackup(
      resolve(backupArg),
      resolve(targetArg || join(process.cwd(), 'data')),
      flags.includes('--replace-existing')
    );
    console.log(`Dados restaurados em ${result.directory}`);
    if (result.previousDirectory) console.log(`Dados anteriores preservados em ${result.previousDirectory}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Não foi possível restaurar o backup.');
    process.exitCode = 1;
  }
}
