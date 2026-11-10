import test from 'node:test';
import assert from 'node:assert/strict';
import { CookieJar } from 'tough-cookie';
import {
  FenixClient,
  FenixError,
  FENIX_FALLBACK_FRONTEND_VERSION,
  clearFenixFrontendDetectionCache,
  detectFenixFrontendVersion,
  normalizeFenixApiPath,
  parseFenixBundleHash,
  parseFenixFrontendVersion
} from './fenix.js';

const LIVE_INDEX_SNIPPET =
  '<link as=script href=/js/app.05d2a1c1.js rel=preload>' +
  '<script src=/js/chunk-vendors.36518975.js></script>' +
  '<script src=/js/app.05d2a1c1.js></script>';
const LIVE_BUNDLE_SNIPPET =
  'ayDate:"DD/MM/YYYY"},info:{version:"2.19.2",name:"CBMBA FÊNIX"},' +
  'r.a.defaults.baseURL="api/v1"';

function stubFetch(responses: Array<{ ok: boolean; status: number; text: string }>) {
  let calls = 0;
  const impl = (async () => {
    const response = responses[Math.min(calls, responses.length - 1)] ?? { ok: false, status: 500, text: '' };
    calls += 1;
    return { ok: response.ok, status: response.status, text: async () => response.text };
  }) as unknown as typeof fetch;
  return { impl, calls: () => calls };
}

test('normalizeFenixApiPath: mantém a forma canônica com barra', () => {
  assert.equal(normalizeFenixApiPath('/api/v1/request'), '/api/v1/request');
});

test('normalizeFenixApiPath: aceita a forma relativa do bundle "api/v1/..."', () => {
  assert.equal(normalizeFenixApiPath('api/v1/request'), '/api/v1/request');
});

test('normalizeFenixApiPath: resolve relativo nu sob api/v1 como o bundle', () => {
  assert.equal(normalizeFenixApiPath('solicitacoes/'), '/api/v1/solicitacoes/');
  assert.equal(normalizeFenixApiPath('fora/da/api'), '/api/v1/fora/da/api');
});

test('normalizeFenixApiPath: rejeita rota fora da API', () => {
  assert.throws(() => normalizeFenixApiPath('/fora/da/api'), FenixError);
  assert.throws(() => normalizeFenixApiPath(''), FenixError);
  assert.throws(() => normalizeFenixApiPath('https://example.com/api/v1/request'), FenixError);
});

test('parseFenixBundleHash: extrai o hash do índice público', () => {
  assert.equal(parseFenixBundleHash(LIVE_INDEX_SNIPPET), '05d2a1c1');
  assert.equal(parseFenixBundleHash('<html>sem bundle</html>'), null);
});

test('parseFenixFrontendVersion: extrai info.version do bundle', () => {
  assert.equal(parseFenixFrontendVersion(LIVE_BUNDLE_SNIPPET), '2.19.2');
  assert.equal(parseFenixFrontendVersion('sem marcador'), null);
});

test('detectFenixFrontendVersion: resolve versão via índice + bundle (stub)', async () => {
  clearFenixFrontendDetectionCache();
  const { impl } = stubFetch([
    { ok: true, status: 200, text: LIVE_INDEX_SNIPPET },
    { ok: true, status: 200, text: LIVE_BUNDLE_SNIPPET }
  ]);
  const detected = await detectFenixFrontendVersion(impl);
  assert.equal(detected.version, '2.19.2');
  assert.equal(detected.bundleHash, '05d2a1c1');
  clearFenixFrontendDetectionCache();
});

test('detectFenixFrontendVersion: falha de rede retorna fallback sem lançar', async () => {
  clearFenixFrontendDetectionCache();
  const failing = (async () => { throw new Error('rede indisponível'); }) as unknown as typeof fetch;
  const detected = await detectFenixFrontendVersion(failing);
  assert.equal(detected.version, FENIX_FALLBACK_FRONTEND_VERSION);
  assert.equal(detected.bundleHash, null);
  clearFenixFrontendDetectionCache();
});

test('FenixClient.get: rejeita rota fora da API sem rede', async () => {
  const client = new FenixClient(new CookieJar());
  await assert.rejects(client.get('/fora/da/api'), FenixError);
});
