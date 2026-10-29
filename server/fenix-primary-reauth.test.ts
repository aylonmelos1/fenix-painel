import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createCipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { test } from 'node:test';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolveListen));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return port;
}

const wait = (milliseconds: number) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

test('fenix primary account reauthentication lifecycle (same account OK, different account 409)', { timeout: 30_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'fenix-primary-reauth-'));
  const mockModule = join(directory, 'mock-fenix-upstream.mjs');
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const mockSource = `
const origin = 'https://fenix.cbm.ba.gov.br';
const originalFetch = globalThis.fetch.bind(globalThis);
const accounts = new Map([
  ['principal@example.test', { id: '14574', password: 'senha-correta', name: 'Empresa Principal Ltda' }],
  ['outra@example.test', { id: '99999', password: 'senha-outra', name: 'Outra Empresa Ltda' }]
]);
const sessions = new Map();

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.origin !== origin) return originalFetch(input, init);
  const method = String(init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  const cookie = headers.get('cookie') || '';
  const sessionId = cookie.match(/fenix_cbmba_session=([^;]+)/)?.[1] || '';
  const account = sessions.get(sessionId);

  if (url.pathname === '/api/v1/csrf-cookie' && method === 'GET') {
    return new Response(null, { status: 204, headers: { 'set-cookie': 'XSRF-TOKEN=test-csrf-token; Path=/; Secure; SameSite=Lax' } });
  }

  if (url.pathname === '/api/v1/authenticate' && method === 'POST') {
    const body = JSON.parse(String(init.body || '{}'));
    const user = accounts.get(String(body.email || ''));
    if (!user || body.password !== user.password || body.hcaptcha_token !== 'test-captcha') {
      return json({ message: 'Credenciais inválidas' }, 401);
    }
    const token = 'sess-' + Math.random().toString(36).slice(2);
    sessions.set(token, user);
    return json({ user: { id: user.id, name: user.name, email: body.email } }, 200, {
      'set-cookie': 'fenix_cbmba_session=' + token + '; Path=/; Secure; HttpOnly; SameSite=Lax'
    });
  }

  if (!account) return json({ message: 'Unauthenticated' }, 401);

  if (url.pathname === '/api/v1/detailsRequester') {
    return json({ user: { id: account.id, name: account.name } });
  }

  if (url.pathname.startsWith('/api/v1/usuarios/')) {
    return json({ data: [] });
  }

  if (url.pathname === '/api/v1/request' || url.pathname === '/api/v1/technicalproject') {
    return json({ data: [] });
  }

  return json({ message: 'Not found' }, 404);
};
`;

  await writeFile(mockModule, mockSource, { mode: 0o600 });

  const child = spawn(process.execPath, [join(projectRoot, 'node_modules/tsx/dist/cli.mjs'), join(projectRoot, 'server/index.ts')], {
    cwd: directory,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      FENIX_BASE_URL: 'https://fenix.cbm.ba.gov.br',
      FENIX_PROXY_TOKEN: '',
      NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import=${mockModule}`].filter(Boolean).join(' ')
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverOutput = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });

  let panelDb: Database.Database | undefined;

  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
    panelDb?.close();
    await rm(directory, { recursive: true, force: true });
  });

  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) throw new Error(`Painel encerrou inesperadamente.\n${serverOutput}`);
    try {
      const response = await fetch(`${baseUrl}/api/config`);
      if (response.ok) { ready = true; break; }
    } catch { /* aguarda inicialização */ }
    await wait(100);
  }
  assert.ok(ready, `Servidor de teste não iniciou a tempo.\n${serverOutput}`);

  panelDb = new Database(join(directory, 'data', 'fenix-painel.sqlite'));
  const encryptionKey = await readFile(join(directory, 'data', '.local-key'));

  function seal(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
  }

  // 1. Criar usuário principal autenticado com id fenix:14574
  const principalUserId = 'fenix:14574';
  const panelSessionToken = 'test-panel-session-token-xyz';
  const tokenHash = createHash('sha256').update(panelSessionToken).digest('hex');

  const now = new Date().toISOString();
  // Sessão inicial fictícia expirada
  panelDb.prepare(`INSERT INTO users (id, fenix_user_id, name, email, session_ciphertext, demo, created_at, fenix_session_expired, last_fenix_auth_error)
    VALUES (?, ?, ?, ?, ?, 0, ?, 1, 'Sessão do Fênix expirada.')`).run(
    principalUserId,
    '14574',
    'Empresa Principal Ltda',
    'principal@example.test',
    seal(JSON.stringify({ cookies: [] })),
    now
  );
  panelDb.prepare('INSERT INTO sessions (token_hash, user_id, created_at) VALUES (?, ?, ?)').run(
    tokenHash,
    principalUserId,
    now
  );

  const authHeader = { Cookie: `fenix_painel_session=${panelSessionToken}` };

  // 2. Verificar GET /api/fenix-session/status -> deve retornar status: 'expired'
  const statusRes1 = await fetch(`${baseUrl}/api/fenix-session/status`, { headers: authHeader });
  assert.equal(statusRes1.status, 200);
  const statusJson1 = await statusRes1.json() as any;
  assert.equal(statusJson1.status, 'expired');
  assert.equal(statusJson1.fenixUserId, '14574');
  assert.ok(statusJson1.lastError?.includes('expirada'));

  // 3. Tentar reconectar com CONTA DIFERENTE (id 99999) -> deve recusar com HTTP 409 Conflict
  const reauthDiffRes = await fetch(`${baseUrl}/api/fenix-session/reauthenticate`, {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'outra@example.test',
      password: 'senha-outra',
      hcaptchaToken: 'test-captcha',
      progressId: randomUUID()
    })
  });
  assert.equal(reauthDiffRes.status, 409);
  const diffJson = await reauthDiffRes.json() as any;
  assert.ok(diffJson.error.includes('outro usuário do Fênix'));

  // 4. Reconectar com a MESMA CONTA (id 14574) -> deve retornar HTTP 200 OK
  const reauthSameRes = await fetch(`${baseUrl}/api/fenix-session/reauthenticate`, {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'principal@example.test',
      password: 'senha-correta',
      hcaptchaToken: 'test-captcha',
      progressId: randomUUID()
    })
  });
  assert.equal(reauthSameRes.status, 200);
  const sameJson = await reauthSameRes.json() as any;
  assert.equal(sameJson.ok, true);
  assert.equal(sameJson.user.fenixUserId, '14574');

  // 5. Verificar GET /api/fenix-session/status novamente -> agora deve retornar status: 'ok'
  const statusRes2 = await fetch(`${baseUrl}/api/fenix-session/status`, { headers: authHeader });
  assert.equal(statusRes2.status, 200);
  const statusJson2 = await statusRes2.json() as any;
  assert.equal(statusJson2.status, 'ok');
  assert.equal(statusJson2.lastError, null);

  // 6. Verificar persistência no banco: fenix_session_expired = 0 e ciphertext atualizado
  const userRow = panelDb.prepare('SELECT fenix_session_expired, last_fenix_auth_error, session_ciphertext FROM users WHERE id = ?').get(principalUserId) as any;
  assert.equal(userRow.fenix_session_expired, 0);
  assert.equal(userRow.last_fenix_auth_error, null);
  assert.ok(userRow.session_ciphertext.length > 20);
});
