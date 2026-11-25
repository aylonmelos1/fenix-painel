import { getSetting, setSetting } from './store.js';

export const FENIX_FALLBACK_FRONTEND_VERSION = '2.19.2';
export const FENIX_DETECTED_VERSION_SETTING = 'fenix_detected_frontend_version';
export const FENIX_SUPERSEDED_ENV_VERSION_SETTING = 'fenix_superseded_env_frontend_version';

const OFFICIAL_FENIX_ORIGIN = 'https://fenix.cbm.ba.gov.br';
const BUNDLE_CACHE_TTL_MS = 15 * 60_000;
const BUNDLE_FAILURE_COOLDOWN_MS = 60_000;
const BUNDLE_FETCH_TIMEOUT_MS = 4_000;
const INDEX_MAX_BYTES = 512_000;
const BUNDLE_MAX_BYTES = 10_000_000;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

type DetectionSource = 'env' | 'bundle' | 'cache' | 'persisted' | 'fallback';
type DetectionResult = { version: string; bundleHash: string | null; source: DetectionSource };
type DetectionCache = { version: string; bundleHash: string | null; expiresAt: number };
let frontendDetectionCache: DetectionCache | null = null;
let frontendFailureCooldownUntil = 0;
let supersededEnvFrontendVersion: string | null = null;
let inflightDetectionPromise: Promise<DetectionResult> | null = null;

export type FenixFrontendDetectionOptions = {
  forceRefresh?: boolean;
  fetchImpl?: typeof fetch;
};

export function isValidSemver(value: string | null | undefined): value is string {
  return typeof value === 'string' && SEMVER_PATTERN.test(value.trim());
}

export function compareSemver(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const leftPart = left[i] ?? 0;
    const rightPart = right[i] ?? 0;
    if (leftPart !== rightPart) return leftPart - rightPart;
  }
  return 0;
}

export function parseFenixBundleHash(indexHtml: string): string | null {
  const match = /\/js\/app\.([0-9a-f]{8,40})\.js/i.exec(String(indexHtml ?? ''));
  return match?.[1] ?? null;
}

function extractBundleVersion(bundleJs: string): string | null {
  const matches = [...String(bundleJs ?? '').matchAll(/\binfo\s*:\s*\{\s*version\s*:\s*["'](\d+\.\d+\.\d+)["']/g)];
  const versions = [...new Set(matches.map((match) => match[1]).filter(isValidSemver))];
  return versions.length === 1 ? versions[0] ?? null : null;
}

export function parseFenixFrontendVersion(bundleJs: string): string | null {
  const strict = extractBundleVersion(bundleJs);
  if (strict) return strict;
  const match = /version:\s*["'](\d+\.\d+\.\d+)["']/.exec(String(bundleJs ?? ''));
  return match?.[1] ?? null;
}

export async function readBoundedResponseText(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error('Resposta excedeu o limite seguro de bytes.');
  }
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw new Error('Resposta excedeu o limite seguro de bytes.');
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel('Limite de bytes excedido').catch(() => {});
        throw new Error('Stream excedeu o limite seguro de bytes.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, totalBytes).toString('utf8');
}

function configuredFrontendVersion(): string | null {
  const configured = process.env.FENIX_FRONTEND_VERSION?.trim();
  return isValidSemver(configured) ? configured : null;
}

function persistedDetectedVersion(): string | null {
  try {
    const value = getSetting(FENIX_DETECTED_VERSION_SETTING);
    return isValidSemver(value) && compareSemver(value, FENIX_FALLBACK_FRONTEND_VERSION) >= 0 ? value : null;
  } catch {
    return null;
  }
}

function supersededEnvVersion(): string | null {
  if (supersededEnvFrontendVersion) return supersededEnvFrontendVersion;
  try {
    const value = getSetting(FENIX_SUPERSEDED_ENV_VERSION_SETTING);
    return isValidSemver(value) ? value : null;
  } catch {
    return null;
  }
}

export function getFenixFrontendVersion(): string {
  const configured = configuredFrontendVersion();
  const persisted = persistedDetectedVersion();
  const superseded = supersededEnvVersion();
  if (configured && configured !== superseded &&
      (!persisted || compareSemver(configured, persisted) >= 0)) return configured;
  if (frontendDetectionCache && isValidSemver(frontendDetectionCache.version) &&
      (!persisted || compareSemver(frontendDetectionCache.version, persisted) >= 0)) {
    return frontendDetectionCache.version;
  }
  return persisted ?? FENIX_FALLBACK_FRONTEND_VERSION;
}

function fallbackResult(): DetectionResult {
  const version = getFenixFrontendVersion();
  if (configuredFrontendVersion() === version) return { version, bundleHash: frontendDetectionCache?.bundleHash ?? null, source: 'env' };
  if (frontendDetectionCache?.version === version) return { version, bundleHash: frontendDetectionCache.bundleHash, source: 'cache' };
  if (persistedDetectedVersion() === version) return { version, bundleHash: frontendDetectionCache?.bundleHash ?? null, source: 'persisted' };
  return { version, bundleHash: null, source: 'fallback' };
}

export function clearFenixFrontendDetectionCache() {
  frontendDetectionCache = null;
  frontendFailureCooldownUntil = 0;
  supersededEnvFrontendVersion = null;
  inflightDetectionPromise = null;
}

export const resetFenixFrontendVersionCache = clearFenixFrontendDetectionCache;

function configuredOrigin(): { origin: string; proxyToken: string } {
  const raw = process.env.FENIX_BASE_URL?.trim() || OFFICIAL_FENIX_ORIGIN;
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('FENIX_BASE_URL deve ser uma origem HTTPS sem caminho, credenciais ou parâmetros.');
  }
  const origin = url.origin;
  const proxyToken = process.env.FENIX_BASE_URL && origin !== OFFICIAL_FENIX_ORIGIN
    ? process.env.FENIX_PROXY_TOKEN?.trim() || '' : '';
  if (process.env.FENIX_BASE_URL && origin !== OFFICIAL_FENIX_ORIGIN && !proxyToken) {
    throw new Error('FENIX_PROXY_TOKEN é obrigatório quando FENIX_BASE_URL aponta para um proxy.');
  }
  return { origin, proxyToken };
}

export async function detectFenixFrontendVersion(
  input?: FenixFrontendDetectionOptions | typeof fetch
): Promise<DetectionResult> {
  const options = typeof input === 'function' ? { fetchImpl: input } : input ?? {};
  const now = Date.now();
  if (!options.forceRefresh && frontendDetectionCache && frontendDetectionCache.expiresAt > now) {
    return { ...frontendDetectionCache, source: 'cache' };
  }
  if (frontendFailureCooldownUntil > now) return fallbackResult();
  if (!options.forceRefresh && inflightDetectionPromise) return inflightDetectionPromise;

  const run = async (): Promise<DetectionResult> => {
    try {
      const { origin, proxyToken } = configuredOrigin();
      const fetchFn = options.fetchImpl ?? globalThis.fetch;
      const headersFor = (url: URL, accept: string) => {
        if (url.origin !== origin) throw new Error('Requisição fora da origem configurada.');
        const headers = new Headers({ Accept: accept, Origin: origin, Referer: origin + '/' });
        if (proxyToken && origin !== OFFICIAL_FENIX_ORIGIN && url.origin === origin) {
          headers.set('X-Fenix-MCP-Proxy-Key', proxyToken);
        }
        return headers;
      };
      const indexUrl = new URL('/', origin);
      const indexResponse = await fetchFn(indexUrl, {
        method: 'GET', headers: headersFor(indexUrl, 'text/html,application/xhtml+xml,application/json;q=0.9'),
        signal: AbortSignal.timeout(BUNDLE_FETCH_TIMEOUT_MS), redirect: 'manual'
      });
      if (!indexResponse.ok) throw new Error('Índice público indisponível.');
      const indexText = await readBoundedResponseText(indexResponse, INDEX_MAX_BYTES);
      let version: string | null = null;
      let bundleHash: string | null = null;
      if ((indexResponse.headers?.get?.('content-type') || '').toLowerCase().includes('application/json')) {
        const parsed = JSON.parse(indexText) as { version?: string; bundleHash?: unknown };
        version = isValidSemver(parsed.version) ? parsed.version : null;
        bundleHash = typeof parsed.bundleHash === 'string' ? parsed.bundleHash : null;
      } else {
        bundleHash = parseFenixBundleHash(indexText);
        if (!bundleHash) throw new Error('Bundle ausente ou ambíguo no índice.');
        const bundleUrl = new URL('/js/app.' + bundleHash + '.js', origin);
        if (bundleUrl.origin !== origin) throw new Error('Origem do bundle não autorizada.');
        const bundleResponse = await fetchFn(bundleUrl, {
          method: 'GET', headers: headersFor(bundleUrl, 'application/javascript,text/javascript,*/*;q=0.8'),
          signal: AbortSignal.timeout(BUNDLE_FETCH_TIMEOUT_MS), redirect: 'manual'
        });
        if (!bundleResponse.ok) throw new Error('Bundle público indisponível.');
        version = extractBundleVersion(await readBoundedResponseText(bundleResponse, BUNDLE_MAX_BYTES));
      }
      if (!isValidSemver(version) || compareSemver(version, FENIX_FALLBACK_FRONTEND_VERSION) < 0) {
        throw new Error('Versão do bundle inválida ou abaixo do fallback.');
      }
      const persisted = persistedDetectedVersion();
      if (persisted && compareSemver(version, persisted) < 0) {
        frontendDetectionCache = { version: persisted, bundleHash: frontendDetectionCache?.bundleHash ?? null, expiresAt: Date.now() + BUNDLE_CACHE_TTL_MS };
        return { version: persisted, bundleHash: frontendDetectionCache.bundleHash, source: 'persisted' };
      }
      frontendDetectionCache = { version, bundleHash, expiresAt: Date.now() + BUNDLE_CACHE_TTL_MS };
      frontendFailureCooldownUntil = 0;
      try { setSetting(FENIX_DETECTED_VERSION_SETTING, version); } catch {}
      return { version, bundleHash, source: 'bundle' };
    } catch {
      frontendFailureCooldownUntil = Date.now() + BUNDLE_FAILURE_COOLDOWN_MS;
      return fallbackResult();
    } finally {
      inflightDetectionPromise = null;
    }
  };
  inflightDetectionPromise = run();
  return inflightDetectionPromise;
}

const ELIGIBLE_REJECTION_STATUSES = new Set([400, 401, 403, 409, 412, 422, 426]);
const VERSION_MESSAGE_PATTERN = /version|vers[aã]o|atualiz|desatualiz|outdated|upgrade/i;

export function isExplicitFenixVersionRejection(status: number, body: unknown): boolean {
  if (!ELIGIBLE_REJECTION_STATUSES.has(status)) return false;
  if (status === 426) return true;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const errors = (body as Record<string, unknown>).errors;
    if (errors && typeof errors === 'object' && Object.prototype.hasOwnProperty.call(errors, 'version')) return true;
  }
  const message = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  return VERSION_MESSAGE_PATTERN.test(message);
}

export function promoteFenixFrontendVersion(usedVersion: string, detectedVersion: string, bundleHash: string | null): boolean {
  if (!isValidSemver(detectedVersion) ||
      compareSemver(detectedVersion, FENIX_FALLBACK_FRONTEND_VERSION) < 0 ||
      compareSemver(detectedVersion, usedVersion) < 0) return false;
  const latest = persistedDetectedVersion();
  if (latest && compareSemver(detectedVersion, latest) < 0) return false;
  const configured = configuredFrontendVersion();
  if (configured && configured === usedVersion) {
    supersededEnvFrontendVersion = configured;
    try { setSetting(FENIX_SUPERSEDED_ENV_VERSION_SETTING, configured); } catch {}
  }
  frontendDetectionCache = { version: detectedVersion, bundleHash, expiresAt: Date.now() + BUNDLE_CACHE_TTL_MS };
  frontendFailureCooldownUntil = 0;
  try { setSetting(FENIX_DETECTED_VERSION_SETTING, detectedVersion); } catch {}
  return true;
}
