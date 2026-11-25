import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FENIX_DETECTED_VERSION_SETTING,
  FENIX_SUPERSEDED_ENV_VERSION_SETTING,
  clearFenixFrontendDetectionCache,
  detectFenixFrontendVersion,
  getFenixFrontendVersion,
  loginFenix
} from './fenix.js';
import { deleteSetting, getSetting, setSetting } from './store.js';

const BUNDLE_INDEX = '<html><script src="/js/app.a1b2c3d4.js"></script></html>';
const bundleResponse = (version: string) =>
  new Response('window.app={info:{version:"' + version + '"}};', {
    status: 200,
    headers: { 'content-type': 'application/javascript' }
  });
const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function requestUrl(input: RequestInfo | URL): URL {
  if (typeof input === 'string') return new URL(input);
  return input instanceof URL ? input : new URL(input.url);
}

async function withVersionState(envVersion: string, run: () => Promise<void>) {
  const previousEnv = process.env.FENIX_FRONTEND_VERSION;
  const previousDetected = getSetting(FENIX_DETECTED_VERSION_SETTING);
  const previousSuperseded = getSetting(FENIX_SUPERSEDED_ENV_VERSION_SETTING);
  process.env.FENIX_FRONTEND_VERSION = envVersion;
  deleteSetting(FENIX_DETECTED_VERSION_SETTING);
  deleteSetting(FENIX_SUPERSEDED_ENV_VERSION_SETTING);
  clearFenixFrontendDetectionCache();
  try {
    await run();
  } finally {
    if (previousEnv === undefined) delete process.env.FENIX_FRONTEND_VERSION;
    else process.env.FENIX_FRONTEND_VERSION = previousEnv;
    if (previousDetected === undefined) deleteSetting(FENIX_DETECTED_VERSION_SETTING);
    else setSetting(FENIX_DETECTED_VERSION_SETTING, previousDetected);
    if (previousSuperseded === undefined) deleteSetting(FENIX_SUPERSEDED_ENV_VERSION_SETTING);
    else setSetting(FENIX_SUPERSEDED_ENV_VERSION_SETTING, previousSuperseded);
    clearFenixFrontendDetectionCache();
  }
}

async function withFetch(fakeFetch: typeof fetch, run: () => Promise<void>) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch;
  try {
    await run();
  } finally {
    globalThis.fetch = previousFetch;
  }
}

test('FENIX_FRONTEND_VERSION do ambiente é a versão inicial enviada no login', async () => {
  await withVersionState('2.19.3', async () => {
    assert.equal(getFenixFrontendVersion(), '2.19.3');
    const sentVersions: string[] = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const path = requestUrl(input).pathname;
      if (path === '/api/v1/csrf-cookie') return new Response(null, { status: 204 });
      if (path === '/api/v1/authenticate') {
        sentVersions.push(String(JSON.parse(String(init?.body)).version));
        return jsonResponse({ user: { id: 17 } }, 200);
      }
      return new Response('not found', { status: 404 });
    };
    await withFetch(fakeFetch, async () => {
      const result = await loginFenix('fixture@example.invalid', 'not-a-real-password', 'fixture-captcha');
      assert.equal(result?.user.id, 17);
    });
    assert.deepEqual(sentVersions, ['2.19.3']);
  });
});

test('rejeição explícita substitui versão do ambiente, persiste no SQLite e vale após limpar o cache', async () => {
  await withVersionState('2.19.3', async () => {
    const sentVersions: string[] = [];
    let bundleRequests = 0;
    const fakeFetch: typeof fetch = async (input, init) => {
      const url = requestUrl(input);
      if (url.pathname === '/api/v1/csrf-cookie') return new Response(null, { status: 204 });
      if (url.pathname === '/api/v1/authenticate') {
        const version = String(JSON.parse(String(init?.body)).version);
        sentVersions.push(version);
        return sentVersions.length === 1
          ? jsonResponse({ errors: { version: ['Versão desatualizada'] } }, 426)
          : jsonResponse({ user: { id: 23 } }, 200);
      }
      if (url.pathname === '/') return new Response(BUNDLE_INDEX, { status: 200, headers: { 'content-type': 'text/html' } });
      if (url.pathname === '/js/app.a1b2c3d4.js') {
        bundleRequests += 1;
        return bundleResponse('2.20.0');
      }
      return new Response('not found', { status: 404 });
    };
    await withFetch(fakeFetch, async () => {
      const result = await loginFenix('fixture@example.invalid', 'fixture-password', 'fixture-captcha');
      assert.equal(result?.user.id, 23);
    });
    assert.deepEqual(sentVersions, ['2.19.3', '2.20.0']);
    assert.equal(bundleRequests, 1);
    assert.equal(getSetting(FENIX_SUPERSEDED_ENV_VERSION_SETTING), '2.19.3');
    assert.equal(getSetting(FENIX_DETECTED_VERSION_SETTING), '2.20.0');
    assert.equal(getFenixFrontendVersion(), '2.20.0');

    clearFenixFrontendDetectionCache();
    assert.equal(getFenixFrontendVersion(), '2.20.0');
    process.env.FENIX_FRONTEND_VERSION = '2.21.0';
    assert.equal(getFenixFrontendVersion(), '2.21.0');
  });
});

test('falhas transitórias não consultam bundle nem marcam a versão do ambiente como superada', async () => {
  await withVersionState('2.19.3', async () => {
    for (const status of [500, 502, 503, 504, 429, 408, 419]) {
      let bundleRequests = 0;
      const fakeFetch: typeof fetch = async (input) => {
        const url = requestUrl(input);
        if (url.pathname === '/api/v1/csrf-cookie') return new Response(null, { status: 204 });
        if (url.pathname === '/api/v1/authenticate') return jsonResponse({ message: 'falha comum' }, status);
        if (url.pathname === '/' || url.pathname.startsWith('/js/')) bundleRequests += 1;
        return new Response(BUNDLE_INDEX, { status: 200 });
      };
      await withFetch(fakeFetch, async () => {
        const result = await loginFenix('fixture@example.invalid', 'fixture-password', 'fixture-captcha');
        assert.equal(result, undefined);
      });
      assert.equal(bundleRequests, 0, 'HTTP ' + status + ' não deve consultar o bundle');
      assert.equal(getSetting(FENIX_SUPERSEDED_ENV_VERSION_SETTING), undefined);
      clearFenixFrontendDetectionCache();
    }

    let bundleRequests = 0;
    const timeoutFetch: typeof fetch = async (input) => {
      const url = requestUrl(input);
      if (url.pathname === '/api/v1/csrf-cookie') return new Response(null, { status: 204 });
      if (url.pathname === '/api/v1/authenticate') throw new Error('timeout de fixture');
      bundleRequests += 1;
      return new Response(BUNDLE_INDEX, { status: 200 });
    };
    await withFetch(timeoutFetch, async () => {
      await assert.rejects(
        loginFenix('fixture@example.invalid', 'fixture-password', 'fixture-captcha'),
        /timeout de fixture/
      );
    });
    assert.equal(bundleRequests, 0);
    assert.equal(getSetting(FENIX_SUPERSEDED_ENV_VERSION_SETTING), undefined);
  });
});

test('401 de credencial com bundle na mesma versão não substitui a versão do ambiente', async () => {
  await withVersionState('2.19.3', async () => {
    const sentVersions: string[] = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const url = requestUrl(input);
      if (url.pathname === '/api/v1/csrf-cookie') return new Response(null, { status: 204 });
      if (url.pathname === '/api/v1/authenticate') {
        sentVersions.push(String(JSON.parse(String(init?.body)).version));
        return jsonResponse({ message: 'Credenciais inválidas' }, 401);
      }
      if (url.pathname === '/') return new Response(BUNDLE_INDEX, { status: 200, headers: { 'content-type': 'text/html' } });
      if (url.pathname === '/js/app.a1b2c3d4.js') return bundleResponse('2.19.3');
      return new Response('not found', { status: 404 });
    };
    await withFetch(fakeFetch, async () => {
      assert.equal(await loginFenix('fixture@example.invalid', 'wrong-password', 'fixture-captcha'), undefined);
    });
    assert.deepEqual(sentVersions, ['2.19.3']);
    assert.equal(getSetting(FENIX_SUPERSEDED_ENV_VERSION_SETTING), undefined);
    assert.equal(getFenixFrontendVersion(), '2.19.3');
  });
});

test('falha ou downgrade do bundle preserva a última versão válida e respeita cooldown', async () => {
  await withVersionState('2.19.3', async () => {
    setSetting(FENIX_DETECTED_VERSION_SETTING, '2.20.0');
    setSetting(FENIX_SUPERSEDED_ENV_VERSION_SETTING, '2.19.3');
    clearFenixFrontendDetectionCache();
    assert.equal(getFenixFrontendVersion(), '2.20.0');

    let failedFetchCalls = 0;
    const failed = await detectFenixFrontendVersion({
      forceRefresh: true,
      fetchImpl: (async () => {
        failedFetchCalls += 1;
        throw new Error('bundle indisponível');
      }) as typeof fetch
    });
    assert.equal(failed.version, '2.20.0');
    assert.equal(getSetting(FENIX_DETECTED_VERSION_SETTING), '2.20.0');
    assert.equal(failedFetchCalls, 1);

    let cooldownFetchCalls = 0;
    const duringCooldown = await detectFenixFrontendVersion({
      forceRefresh: true,
      fetchImpl: (async () => {
        cooldownFetchCalls += 1;
        return new Response(BUNDLE_INDEX, { status: 200 });
      }) as typeof fetch
    });
    assert.equal(duringCooldown.version, '2.20.0');
    assert.equal(cooldownFetchCalls, 0);

    clearFenixFrontendDetectionCache();
    const downgrade = await detectFenixFrontendVersion({
      forceRefresh: true,
      fetchImpl: (async (input) => {
        const url = requestUrl(input);
        if (url.pathname === '/') return new Response(BUNDLE_INDEX, { status: 200, headers: { 'content-type': 'text/html' } });
        return bundleResponse('2.19.3');
      }) as typeof fetch
    });
    assert.equal(downgrade.version, '2.20.0');
    assert.equal(downgrade.source, 'persisted');
    assert.equal(getSetting(FENIX_DETECTED_VERSION_SETTING), '2.20.0');
  });
});
