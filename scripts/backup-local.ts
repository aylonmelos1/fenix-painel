import { resolve, join } from 'node:path';
import { createLocalDataBackup } from '../server/local-data-backup.js';

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const source = resolve(process.cwd(), 'data');
const destination = resolve(process.argv[2] || join(process.cwd(), '..', 'fenix-painel-backups', timestamp));

try {
  const result = await createLocalDataBackup(source, destination);
  console.log(`Backup verificado em ${result.directory}`);
  console.log(`SHA-256 do banco: ${result.databaseSha256}`);
  console.log('O backup contém a chave local criptográfica. Guarde-o em local protegido.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Não foi possível criar o backup.');
  process.exitCode = 1;
}
