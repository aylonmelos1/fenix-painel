import { copyFileSync } from 'node:fs';

copyFileSync('server/fenix-domains.json', 'dist-server/fenix-domains.json');
