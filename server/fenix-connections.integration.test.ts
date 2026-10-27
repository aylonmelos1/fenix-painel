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
import { CookieJar } from 'tough-cookie';
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

test('linked Fenix accounts complete the isolated connection lifecycle against a local upstream fixture', { timeout: 45_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'fenix-linked-accounts-'));
  const mockLogFile = join(directory, 'mock-upstream.jsonl');
  const mockModule = join(directory, 'mock-fenix.mjs');
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const mockSource = `
import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const logFile = ${JSON.stringify(mockLogFile)};
const origin = 'https://fenix.cbm.ba.gov.br';
const originalFetch = globalThis.fetch.bind(globalThis);
const accountsByEmail = new Map([
  ['principal@example.test', { id: 'fenix-principal', password: 'principal-test-password', name: 'Empresa Principal' }],
  ['alpha@example.test', { id: 'fenix-alpha', password: 'alpha-test-password', name: 'Empresa Alfa' }],
  ['beta@example.test', { id: 'fenix-beta', password: 'beta-test-password', name: 'Empresa Beta' }]
]);
const sessions = new Map();
let failAlphaCatalogOnce = true;
let delayAlphaHistoryOnce = true;
const catalogs = {
  'fenix-alpha': [
    { id: '101', reference_name: 'Centro Comercial Áurea', address: { county: 'Salvador', public_place: 'Rua A' }, total_area: 1200, number_floors: 4 },
    { id: '102', reference_name: 'Edifício Beta', address: { county: 'Feira de Santana', public_place: 'Rua B' }, total_area: 800, number_floors: 3 }
  ],
  'fenix-beta': [
    { id: '101', reference_name: 'Centro Comercial Áurea', address: { county: 'Salvador', public_place: 'Rua A' }, total_area: 1200, number_floors: 4 },
    { id: '201', reference_name: 'Galpão Beta', address: { county: 'Camaçari', public_place: 'Rua C' }, total_area: 2000, number_floors: 1 }
  ],
  'fenix-principal': []
};
const projects = {
  'fenix-alpha': [
    { id: '9001', edificacao_id: '101', num_projeto: 'PT-9001', sigla: 'PT', status: 'Em análise', etapa_atual: 'Análise', updated_at: '2026-10-27T10:00:00.000Z' },
    { id: '9002', edificacao_id: '102', num_projeto: 'PT-9002', sigla: 'PT', status: 'Em análise', etapa_atual: 'Análise', updated_at: '2026-10-27T11:00:00.000Z' }
  ],
  'fenix-beta': [
    { id: '9001', edificacao_id: '101', num_projeto: 'PT-9001', sigla: 'PT', status: 'Em análise', etapa_atual: 'Análise', updated_at: '2026-10-27T10:00:00.000Z' }
  ],
  'fenix-principal': []
};
function log(event, userId, path) {
  appendFileSync(logFile, JSON.stringify({ event, userId: userId || null, path }) + '\\n');
}
function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.origin !== origin) return originalFetch(input, init);
  const method = String(init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  const cookie = headers.get('cookie') || '';
  const sessionId = cookie.match(/cookiesession1=([^;]+)/)?.[1] || '';
  const account = sessions.get(sessionId);
  if (url.pathname === '/api/v1/csrf-cookie' && method === 'GET') {
    return new Response(null, { status: 204, headers: { 'set-cookie': 'XSRF-TOKEN=synthetic-xsrf; Path=/; Secure; SameSite=Lax' } });
  }
  if (url.pathname === '/api/v1/authenticate' && method === 'POST') {
    const body = JSON.parse(String(init.body || '{}'));
    const user = accountsByEmail.get(String(body.email || ''));
    if (!user || body.password !== user.password || body.hcaptcha_token !== 'synthetic-captcha-token') return json({ message: 'invalid test credentials' }, 401);
    const newSession = randomUUID();
    sessions.set(newSession, user);
    return json({ user: { id: user.id, name: user.name } }, 200, { 'set-cookie': 'cookiesession1=' + newSession + '; Path=/; Secure; HttpOnly; SameSite=Lax' });
  }
  if (!account) return json({ message: 'synthetic session missing' }, 401);
  if (url.pathname === '/api/v1/detailsRequester') {
    log('details', account.id, url.pathname);
    return json({ user: { id: account.id } });
  }
  const buildingMatch = url.pathname.match(/^\\/api\\/v1\\/usuarios\\/([^/]+)\\/edifications$/);
  if (buildingMatch) {
    log('catalog', account.id, url.pathname);
    if (decodeURIComponent(buildingMatch[1]) !== account.id) return json({ message: 'wrong account partition' }, 403);
    if (account.id === 'fenix-alpha' && failAlphaCatalogOnce) {
      failAlphaCatalogOnce = false;
      return json({ message: 'temporary catalog failure' }, 503);
    }
    return json({ data: catalogs[account.id] || [] });
  }
  if (url.pathname === '/api/v1/request') return json({ data: [] });
  if (url.pathname === '/api/v1/technicalproject') return json({ data: projects[account.id] || [] });
  const historyMatch = url.pathname.match(/^\\/api\\/v1\\/projetos-tecnicos\\/([^/]+)$/);
  if (historyMatch) {
    log('history-start', account.id, url.pathname);
    if (account.id === 'fenix-alpha' && historyMatch[1] === '9001' && delayAlphaHistoryOnce) {
      delayAlphaHistoryOnce = false;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 900));
    }
    log('history-return', account.id, url.pathname);
    return json({ data: { num_projeto: 'PT-' + historyMatch[1], tipo_projeto: { sigla: 'PT' }, status_atual: { status_id: '1' }, status_projeto_tecnico: [{ status_id: '1', data_inicial: '2026-10-01T12:00:00.000Z', status: { status: 'Em análise' } }], edification: { total_area: 1200, number_floors: 4 } } });
  }
  return json({ message: 'unhandled synthetic Fenix route' }, 404);
};
`;
  await writeFile(mockModule, mockSource, { mode: 0o600 });

  const child = spawn(process.execPath, [join(projectRoot, 'node_modules/tsx/dist/cli.mjs'), join(projectRoot, 'server/index.ts')], {
    cwd: directory,
    env: {
      ...process.env,
      PORT: String(port), NODE_ENV: 'test', FENIX_BASE_URL: 'https://fenix.cbm.ba.gov.br', FENIX_PROXY_TOKEN: '',
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
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Painel de teste encerrou na inicialização.\n${serverOutput}`);
    try {
      const response = await fetch(`${baseUrl}/api/config`);
      if (response.ok) { ready = true; break; }
    } catch { /* aguarda o servidor local iniciar */ }
    await wait(100);
  }
  assert.ok(ready, `Painel de teste não iniciou.\n${serverOutput}`);

  panelDb = new Database(join(directory, 'data', 'fenix-painel.sqlite'));
  const encryptionKey = await readFile(join(directory, 'data', '.local-key'));
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encryptedJar = Buffer.concat([cipher.update(JSON.stringify(new CookieJar().serializeSync()), 'utf8'), cipher.final()]);
  const primarySession = [iv, cipher.getAuthTag(), encryptedJar].map((part) => part.toString('base64url')).join('.');
  const now = new Date().toISOString();
  panelDb.prepare(`INSERT INTO users (id,fenix_user_id,name,email,session_ciphertext,demo,created_at)
    VALUES ('owner','fenix-principal','Empresa Principal','principal@example.test',?,0,?)`).run(primarySession, now);
  panelDb.prepare(`INSERT INTO user_preferences (user_id,sync_interval_minutes) VALUES ('owner',0)`).run();
  panelDb.prepare(`INSERT INTO buildings (id,user_id,source_connection_id,remote_id,reference,municipality,address,area,floors,height,payload,updated_at)
    VALUES ('main-building-999','owner',NULL,'999','Centro Comercial Aurea','SALVADOR','Rua Principal',1000,3,'12m','{}',?)`).run(now);
  panelDb.prepare(`INSERT INTO users (id,fenix_user_id,name,email,session_ciphertext,demo,created_at)
    VALUES ('other-owner','fenix-other-principal','Outra Empresa','other@example.test',NULL,0,?)`).run(now);

  const panelToken = randomBytes(32).toString('hex');
  const otherPanelToken = randomBytes(32).toString('hex');
  const insertPanelSession = panelDb.prepare('INSERT INTO sessions (token_hash,user_id,created_at) VALUES (?,?,?)');
  insertPanelSession.run(createHash('sha256').update(panelToken).digest('hex'), 'owner', now);
  insertPanelSession.run(createHash('sha256').update(otherPanelToken).digest('hex'), 'other-owner', now);

  async function rawApi(path: string, options: { method?: string; body?: unknown; token?: string } = {}) {
    const token = options.token || panelToken;
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers: { cookie: `fenix_painel_session=${token}`, ...(options.body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }
  async function api<T>(path: string, options: { method?: string; body?: unknown; token?: string } = {}) {
    const result = await rawApi(path, options);
    assert.ok(result.response.ok, `${options.method || 'GET'} ${path}: ${JSON.stringify(result.data)}`);
    return result.data as T;
  }
  async function waitForLog(predicate: (item: any) => boolean) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const entries = (await readFile(mockLogFile, 'utf8').catch(() => '')).split('\n').filter(Boolean).map((line) => JSON.parse(line));
      if (entries.some(predicate)) return entries;
      await wait(25);
    }
    throw new Error(`Evento esperado não apareceu no mock Fênix.\n${serverOutput}`);
  }
  const login = (email: string, password: string) => rawApi('/api/fenix-connections/login', {
    method: 'POST', body: { email, password, hcaptchaToken: 'synthetic-captcha-token', progressId: randomUUID() }
  });
  const readMockLog = async () => (await readFile(mockLogFile, 'utf8').catch(() => '')).split('\n').filter(Boolean).map((line) => JSON.parse(line));

  assert.deepEqual((await api<{ connections: unknown[] }>('/api/fenix-connections')).connections, []);
  const principalLogin = await login('principal@example.test', 'principal-test-password');
  assert.equal(principalLogin.response.status, 409, 'a conexão não pode substituir a conta principal');
  const invalidLogin = await login('alpha@example.test', 'invalid-password');
  assert.equal(invalidLogin.response.status, 401);
  assert.deepEqual((await api<{ connections: unknown[] }>('/api/fenix-connections')).connections, []);

  const alphaLogin = await login('alpha@example.test', 'alpha-test-password');
  assert.equal(alphaLogin.response.status, 200, JSON.stringify(alphaLogin.data));
  const alphaPendingId = String(alphaLogin.data.pendingId);
  const inaccessiblePending = await rawApi(`/api/fenix-connections/pending/${encodeURIComponent(alphaPendingId)}/buildings`, { token: otherPanelToken });
  assert.equal(inaccessiblePending.response.status, 404, 'a pending connection belongs only to the panel identity that created it');

  const firstCatalogAttempt = await rawApi(`/api/fenix-connections/pending/${encodeURIComponent(alphaPendingId)}/buildings`);
  assert.equal(firstCatalogAttempt.response.status, 502, 'the synthetic first catalog request should fail');
  const alphaCatalog = await api<{ buildings: Array<{ id: string; possibleDuplicates: string[] }> }>(`/api/fenix-connections/pending/${encodeURIComponent(alphaPendingId)}/buildings`);
  assert.equal(alphaCatalog.buildings.length, 2, 'retrying the catalog must not require a new login');
  assert.ok(alphaCatalog.buildings.find((item) => item.id === '101')?.possibleDuplicates.includes('Conta principal'), 'normalized reference and municipality should flag the primary-account match');
  const invalidSelection = await rawApi('/api/fenix-connections', { method: 'POST', body: { pendingId: alphaPendingId, label: 'Cliente Alfa', selectedBuildingIds: ['999'] } });
  assert.equal(invalidSelection.response.status, 400, 'selection IDs must belong to the authenticated customer catalog');

  const alphaCreated = await api<{ connection: { id: string; label: string }; syncWarning: boolean }>('/api/fenix-connections', {
    method: 'POST', body: { pendingId: alphaPendingId, label: 'Cliente Alfa', selectedBuildingIds: ['101'] }
  });
  assert.equal(alphaCreated.connection.label, 'Cliente Alfa');
  assert.equal(alphaCreated.syncWarning, false);
  const alphaId = alphaCreated.connection.id;

  const alphaHistoryStart = await waitForLog((item) => item.event === 'history-start' && item.userId === 'fenix-alpha' && item.path.endsWith('/9001'));
  const alphaDataUser = panelDb.prepare(`SELECT c.data_user_id,c.fenix_user_id,c.webhook_enabled,u.session_ciphertext
    FROM fenix_connections c JOIN users u ON u.id=c.data_user_id WHERE c.id=?`).get(alphaId) as { data_user_id: string; fenix_user_id: string; webhook_enabled: number; session_ciphertext: string };
  assert.equal(alphaDataUser.fenix_user_id, 'fenix-alpha');
  assert.equal(alphaDataUser.webhook_enabled, 0, 'customer webhooks default to off');
  assert.ok(alphaDataUser.session_ciphertext && alphaDataUser.session_ciphertext !== primarySession);
  assert.equal((panelDb.prepare('SELECT count(*) AS count FROM sessions WHERE user_id=?').get(alphaDataUser.data_user_id) as { count: number }).count, 0, 'linked Fênix sessions must not become panel login sessions');
  assert.equal((panelDb.prepare('SELECT session_ciphertext FROM users WHERE id=\'owner\'').get() as { session_ciphertext: string }).session_ciphertext, primarySession, 'the main Fênix session remains unchanged');
  assert.ok(alphaHistoryStart.length > 0);

  await api(`/api/fenix-connections/${encodeURIComponent(alphaId)}`, { method: 'PATCH', body: { paused: true } });
  const pausedSync = await rawApi(`/api/fenix-connections/${encodeURIComponent(alphaId)}/sync`, { method: 'POST' });
  assert.equal(pausedSync.response.status, 409);
  let dashboard = await api<{ buildings: Array<{ id: string; reference: string; sourceAccountName: string | null; sourceAccountPaused: boolean }>; processes: Array<{ id: string; sourceAccountName?: string | null }> }>('/api/dashboard');
  assert.equal(dashboard.buildings.find((item) => item.sourceAccountName === 'Cliente Alfa')?.sourceAccountPaused, true, 'paused data remains visible and marked');
  await waitForLog((item) => item.event === 'history-return' && item.userId === 'fenix-alpha' && item.path.endsWith('/9001'));
  await wait(75);
  const historyState = panelDb.prepare('SELECT status FROM history_refresh_state WHERE user_id=?').get(alphaDataUser.data_user_id) as { status: string };
  assert.equal(historyState.status, 'interrupted', 'in-flight history refresh stops after pause');
  assert.equal((panelDb.prepare('SELECT count(*) AS count FROM process_histories WHERE user_id=?').get(alphaDataUser.data_user_id) as { count: number }).count, 0, 'a paused connection does not persist a late history response');
  await api(`/api/fenix-connections/${encodeURIComponent(alphaId)}`, { method: 'PATCH', body: { paused: false } });

  const repeatedAlphaLogin = await login('alpha@example.test', 'alpha-test-password');
  assert.equal(repeatedAlphaLogin.response.status, 409, 'a Fênix identity cannot be connected twice to one panel owner');

  const alphaManagedCatalog = await api<{ buildings: Array<{ id: string; possibleDuplicates: string[] }> }>(`/api/fenix-connections/${encodeURIComponent(alphaId)}/buildings`);
  assert.ok(alphaManagedCatalog.buildings.find((item) => item.id === '101')?.possibleDuplicates.includes('Conta principal'));
  assert.ok(!alphaManagedCatalog.buildings.find((item) => item.id === '101')?.possibleDuplicates.includes('Cliente Alfa'), 'management excludes its own connection from duplicate warnings');

  const betaLogin = await login('beta@example.test', 'beta-test-password');
  assert.equal(betaLogin.response.status, 200, JSON.stringify(betaLogin.data));
  const betaPendingId = String(betaLogin.data.pendingId);
  const betaCatalog = await api<{ buildings: Array<{ id: string; possibleDuplicates: string[] }> }>(`/api/fenix-connections/pending/${encodeURIComponent(betaPendingId)}/buildings`);
  const betaBuilding = betaCatalog.buildings.find((item) => item.id === '101');
  assert.ok(betaBuilding?.possibleDuplicates.includes('Conta principal'));
  assert.ok(betaBuilding?.possibleDuplicates.includes('Cliente Alfa'), 'matching remote IDs should be flagged across linked accounts');
  const betaCreated = await api<{ connection: { id: string; label: string } }>('/api/fenix-connections', {
    method: 'POST', body: { pendingId: betaPendingId, label: 'Cliente Beta', selectedBuildingIds: ['101'] }
  });
  const betaId = betaCreated.connection.id;

  dashboard = await api('/api/dashboard');
  assert.equal(dashboard.buildings.length, 3, 'same remote building IDs remain distinct across accounts and the main account');
  assert.equal(dashboard.buildings.filter((item) => item.sourceAccountName === 'Cliente Alfa').length, 1);
  assert.equal(dashboard.buildings.filter((item) => item.sourceAccountName === 'Cliente Beta').length, 1);
  assert.equal(dashboard.processes.filter((item) => item.sourceAccountName === 'Cliente Alfa').length, 1);
  assert.equal(dashboard.processes.filter((item) => item.sourceAccountName === 'Cliente Beta').length, 1);

  await api(`/api/fenix-connections/${encodeURIComponent(alphaId)}`, { method: 'PATCH', body: { label: 'Fênix XPTO' } });
  dashboard = await api('/api/dashboard');
  assert.equal(dashboard.buildings.find((item) => item.sourceAccountName === 'Fênix XPTO')?.reference, 'Centro Comercial Áurea', 'renaming updates the visible source label');
  const betaManagedCatalog = await api<{ buildings: Array<{ id: string; possibleDuplicates: string[] }> }>(`/api/fenix-connections/${encodeURIComponent(betaId)}/buildings`);
  assert.ok(betaManagedCatalog.buildings.find((item) => item.id === '101')?.possibleDuplicates.includes('Fênix XPTO'), 'renaming also updates duplicate-warning labels');
  await api(`/api/fenix-connections/${encodeURIComponent(alphaId)}`, { method: 'PATCH', body: { label: 'Cliente Alfa' } });

  let logEntries = await readMockLog();
  assert.ok(logEntries.some((item) => item.event === 'details' && item.userId === 'fenix-alpha'), 'the first connection sync uses the alpha session');
  assert.ok(logEntries.some((item) => item.event === 'details' && item.userId === 'fenix-beta'), 'the second connection sync uses the beta session');

  const beforeWrongReauth = (panelDb.prepare('SELECT session_ciphertext FROM users WHERE id=?').get(alphaDataUser.data_user_id) as { session_ciphertext: string }).session_ciphertext;
  const wrongReauth = await rawApi(`/api/fenix-connections/${encodeURIComponent(alphaId)}/reauthenticate`, {
    method: 'POST', body: { email: 'beta@example.test', password: 'beta-test-password', hcaptchaToken: 'synthetic-captcha-token' }
  });
  assert.equal(wrongReauth.response.status, 409, 'reauthentication must reject a different Fênix identity');
  const afterWrongReauth = (panelDb.prepare('SELECT session_ciphertext FROM users WHERE id=?').get(alphaDataUser.data_user_id) as { session_ciphertext: string }).session_ciphertext;
  assert.equal(createHash('sha256').update(afterWrongReauth).digest('hex'), createHash('sha256').update(beforeWrongReauth).digest('hex'), 'a different identity cannot replace the linked session');
  await api(`/api/fenix-connections/${encodeURIComponent(alphaId)}/reauthenticate`, {
    method: 'POST', body: { email: 'alpha@example.test', password: 'alpha-test-password', hcaptchaToken: 'synthetic-captcha-token' }
  });
  const afterCorrectReauth = (panelDb.prepare('SELECT session_ciphertext FROM users WHERE id=?').get(alphaDataUser.data_user_id) as { session_ciphertext: string }).session_ciphertext;
  assert.notEqual(createHash('sha256').update(afterCorrectReauth).digest('hex'), createHash('sha256').update(beforeWrongReauth).digest('hex'), 'successful reauthentication rotates only the linked session');
  const beforeManualSync = (await readMockLog()).filter((item) => item.event === 'details').length;
  await api(`/api/fenix-connections/${encodeURIComponent(alphaId)}/sync`, { method: 'POST' });
  logEntries = await readMockLog();
  assert.deepEqual(logEntries.filter((item) => item.event === 'details').slice(beforeManualSync).map((item) => item.userId), ['fenix-alpha'], 'manual sync uses the reauthenticated customer session');
  assert.equal((panelDb.prepare('SELECT session_ciphertext FROM users WHERE id=\'owner\'').get() as { session_ciphertext: string }).session_ciphertext, primarySession);

  await api(`/api/fenix-connections/${encodeURIComponent(alphaId)}/buildings`, { method: 'PUT', body: { selectedBuildingIds: ['102'] } });
  dashboard = await api('/api/dashboard');
  const alphaVisibleBuildings = dashboard.buildings.filter((item) => item.sourceAccountName === 'Cliente Alfa');
  assert.deepEqual(alphaVisibleBuildings.map((item) => item.reference), ['Edifício Beta'], 'only selected buildings appear in active dashboard views');
  assert.equal((panelDb.prepare('SELECT count(*) AS count FROM buildings WHERE user_id=?').get(alphaDataUser.data_user_id) as { count: number }).count, 2, 'unselected snapshots remain available for later reactivation');

  await api(`/api/fenix-connections/${encodeURIComponent(betaId)}`, { method: 'DELETE', body: { deleteLocalData: true } });
  assert.equal((panelDb.prepare('SELECT count(*) AS count FROM users WHERE id=?').get(`fenix-linked:${betaId}`) as { count: number }).count, 0, 'removing a connection deletes its data partition');
  dashboard = await api('/api/dashboard');
  assert.equal(dashboard.buildings.length, 2, 'removal leaves the main account and other linked account intact');
  await api(`/api/fenix-connections/${encodeURIComponent(alphaId)}`, { method: 'DELETE', body: { deleteLocalData: true } });
  dashboard = await api('/api/dashboard');
  assert.deepEqual(dashboard.buildings.map((item) => item.id), ['main-building-999'], 'deleting linked accounts preserves the main building snapshot');
  assert.equal((panelDb.prepare('SELECT session_ciphertext FROM users WHERE id=\'owner\'').get() as { session_ciphertext: string }).session_ciphertext, primarySession);

  logEntries = await readMockLog();
  assert.ok(logEntries.some((item) => item.event === 'catalog' && item.userId === 'fenix-alpha'));
  assert.ok(logEntries.some((item) => item.event === 'catalog' && item.userId === 'fenix-beta'));
  assert.equal(serverOutput.includes('alpha-test-password'), false, 'synthetic passwords are not logged');
  assert.equal(serverOutput.includes('synthetic-captcha-token'), false, 'synthetic hCaptcha tokens are not logged');
});
