import { randomUUID, randomBytes } from 'node:crypto';
import { CookieJar } from 'tough-cookie';
import { db, getSetting, seal, unseal } from './store.js';
import { enqueuePushDelivery } from './push.js';
import { detectProcessChanges, type ProcessSyncState } from './sync-changes.js';
import { deliverWebhookLogged, WEBHOOK_SETTING, type ProcessWebhookDocument, type ProcessWebhookPayload } from './webhook.js';

const OFFICIAL_FENIX_ORIGIN = 'https://fenix.cbm.ba.gov.br';
const FENIX_ORIGIN = (() => {
  const configured = process.env.FENIX_BASE_URL || OFFICIAL_FENIX_ORIGIN;
  const url = new URL(configured);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('FENIX_BASE_URL deve ser uma origem HTTPS sem caminho, credenciais ou parâmetros.');
  }
  return url.origin;
})();
const FENIX_PROXY_TOKEN = process.env.FENIX_BASE_URL && FENIX_ORIGIN !== OFFICIAL_FENIX_ORIGIN
  ? process.env.FENIX_PROXY_TOKEN || '' : '';
if (process.env.FENIX_BASE_URL && FENIX_ORIGIN !== OFFICIAL_FENIX_ORIGIN && !FENIX_PROXY_TOKEN) {
  throw new Error('FENIX_PROXY_TOKEN é obrigatório quando FENIX_BASE_URL aponta para o proxy Cloudflare.');
}
export const HCAPTCHA_SITE_KEY = 'e94868de-18ba-4314-b0ce-c7c84a1440b6';
const FRONTEND_VERSION = '2.19.1';
const REQUEST_TIMEOUT_MS = 25_000;
const FENIX_REQUESTS_PER_MINUTE = 45;
let fenixRequestQueueDepth = 0;

export class FenixError extends Error {
  constructor(message: string, public status?: number, public retryAfterMs?: number) { super(message); }
}

function retryAfterMs(response: Response) {
  const value = response.headers.get('retry-after');
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 5 * 60_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.min(Math.max(0, date - Date.now()), 5 * 60_000) : undefined;
}

async function acquireFenixRequestSlot() {
  let queued = false;
  while (true) {
    const now = Date.now();
    const slot = db.transaction(() => {
      db.prepare('DELETE FROM fenix_request_slots WHERE requested_at <= ?').run(now - 60_000);
      const count = (db.prepare('SELECT COUNT(*) AS count FROM fenix_request_slots').get() as { count: number }).count;
      if (count < FENIX_REQUESTS_PER_MINUTE) {
        db.prepare('INSERT INTO fenix_request_slots (requested_at) VALUES (?)').run(now);
        return { acquired: true, oldest: now };
      }
      return { acquired: false, oldest: (db.prepare('SELECT MIN(requested_at) AS oldest FROM fenix_request_slots').get() as { oldest: number | null }).oldest || now };
    })();
    if (slot.acquired) {
      if (queued) fenixRequestQueueDepth = Math.max(0, fenixRequestQueueDepth - 1);
      return;
    }
    if (!queued) { queued = true; fenixRequestQueueDepth += 1; }
    await new Promise((resolve) => setTimeout(resolve, Math.max(25, 60_000 - (now - slot.oldest))));
  }
}

export function getFenixRequestQueueState() {
  const recentCount = (db.prepare('SELECT COUNT(*) AS count FROM fenix_request_slots WHERE requested_at > ?').get(Date.now() - 60_000) as { count: number }).count;
  return { queued: fenixRequestQueueDepth, recentCount, limitPerMinute: FENIX_REQUESTS_PER_MINUTE };
}

async function fetchBounded(url: URL, init: RequestInit, limit = 1_000_000) {
  if (url.origin === FENIX_ORIGIN) await acquireFenixRequestSlot();
  const headers = new Headers(init.headers);
  if (FENIX_PROXY_TOKEN && url.origin === FENIX_ORIGIN) headers.set('X-Fenix-MCP-Proxy-Key', FENIX_PROXY_TOKEN);
  const response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), redirect: 'manual' });
  const text = await response.text();
  if (Buffer.byteLength(text) > limit) throw new FenixError('A resposta do Fênix excedeu o limite aceito.', response.status);
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text.slice(0, 200); }
  return { response, body };
}

async function storeCookies(response: Response, url: string, jar: CookieJar) {
  await Promise.all(response.headers.getSetCookie().map((cookie) => jar.setCookie(cookie, url, { ignoreError: true })));
}

function xsrf(jar: CookieJar, url: string) {
  const cookie = jar.getCookiesSync(url).find((item) => item.key.toLowerCase() === 'xsrf-token');
  if (!cookie) return undefined;
  try { return decodeURIComponent(cookie.value); } catch { return cookie.value; }
}

export async function loginFenix(email: string, password: string, hcaptchaToken: string, onProgress?: (stage: number) => void) {
  if (!email || !password || !hcaptchaToken) throw new FenixError('Informe usuário, senha e conclua o hCaptcha.');
  onProgress?.(0);
  const jar = new CookieJar();
  const csrfUrl = new URL('/api/v1/csrf-cookie', FENIX_ORIGIN);
  const csrf = await fetchBounded(csrfUrl, {
    method: 'GET', headers: { Accept: 'application/json', Origin: FENIX_ORIGIN, Referer: `${FENIX_ORIGIN}/` }
  });
  await storeCookies(csrf.response, csrfUrl.toString(), jar);
  if (!csrf.response.ok && csrf.response.status !== 204) throw new FenixError('Não foi possível iniciar uma sessão no Fênix.', csrf.response.status);
  onProgress?.(1);

  const loginUrl = new URL('/api/v1/authenticate', FENIX_ORIGIN);
  const headers: Record<string, string> = {
    Accept: 'application/json', 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest',
    Origin: FENIX_ORIGIN, Referer: `${FENIX_ORIGIN}/`, Cookie: jar.getCookieStringSync(loginUrl.toString())
  };
  const csrfToken = xsrf(jar, loginUrl.toString());
  if (csrfToken) headers['X-XSRF-TOKEN'] = csrfToken;
  onProgress?.(2);
  onProgress?.(3);
  const result = await fetchBounded(loginUrl, {
    method: 'POST', headers,
    body: JSON.stringify({ email, password, version: FRONTEND_VERSION, hcaptcha_token: hcaptchaToken })
  });
  await storeCookies(result.response, loginUrl.toString(), jar);
  const payload = result.body as any;
  const user = payload?.user ?? payload?.data?.user;
  if (!result.response.ok || !user?.id) return undefined;
  onProgress?.(4);
  return { jar, user };
}

export class FenixClient {
  constructor(private jar: CookieJar) {}

  async get(path: string, query: Record<string, string | number> = {}) {
    if (!path.startsWith('/api/v1/')) throw new FenixError('Rota fora da API autorizada do Fênix.');
    const url = new URL(path, FENIX_ORIGIN);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const result = await fetchBounded(url, {
      method: 'GET', headers: {
        Accept: 'application/json', Origin: FENIX_ORIGIN, Referer: `${FENIX_ORIGIN}/`,
        Cookie: this.jar.getCookieStringSync(url.toString()), 'X-Requested-With': 'XMLHttpRequest'
      }
    });
    await storeCookies(result.response, url.toString(), this.jar);
    if (!result.response.ok) throw new FenixError(`Consulta ao Fênix retornou HTTP ${result.response.status}.`, result.response.status, retryAfterMs(result.response));
    return result.body;
  }

  async post(path: string, body: Record<string, unknown>) {
    if (!path.startsWith('/api/v1/')) throw new FenixError('Rota fora da API autorizada do Fênix.');
    const url = new URL(path, FENIX_ORIGIN);
    const headers: Record<string, string> = {
      Accept: 'application/json', 'Content-Type': 'application/json', Origin: FENIX_ORIGIN,
      Referer: `${FENIX_ORIGIN}/`, Cookie: this.jar.getCookieStringSync(url.toString()),
      'X-Requested-With': 'XMLHttpRequest'
    };
    const token = xsrf(this.jar, url.toString());
    if (token) headers['X-XSRF-TOKEN'] = token;
    const result = await fetchBounded(url, { method: 'POST', headers, body: JSON.stringify(body) });
    await storeCookies(result.response, url.toString(), this.jar);
    if (!result.response.ok) throw new FenixError(`Solicitação ao Fênix retornou HTTP ${result.response.status}.`, result.response.status);
    return result.body;
  }
}

type TechnicalProjectEvent = { label: string; date?: string; done?: boolean; current?: boolean };
type TechnicalProjectProfile = { address: string; use: string; totalArea: number | null; buildingArea: number | null; areaToBeBuilt: number | null; floors: number | null; height: string; validUntil: string; technicalFacts: Array<{ label: string; value: string }> };
const projectDetailsCache = new Map<string, { expiresAt: number; requestId: string; timeline: TechnicalProjectEvent[]; profile: TechnicalProjectProfile }>();
type TechnicalCertificateInfo = { filename: string; size: number };
const certificateInfoCache = new Map<string, { expiresAt: number; info: TechnicalCertificateInfo | null }>();

async function fenixClientForUser(userId: string) {
  const user = db.prepare('SELECT session_ciphertext FROM users WHERE id = ? AND demo = 0').get(userId) as { session_ciphertext: string | null } | undefined;
  if (!user?.session_ciphertext) throw new FenixError('Sessão Fênix não encontrada.');
  return new FenixClient(CookieJar.deserializeSync(JSON.parse(unseal(user.session_ciphertext))));
}

async function technicalProjectDetails(userId: string, projectId: string, forceRefresh = false) {
  const cacheKey = `${userId}:${projectId}`;
  const cached = projectDetailsCache.get(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached;
  const client = await fenixClientForUser(userId);
  const response = await client.get(`/api/v1/projetos-tecnicos/${encodeURIComponent(projectId)}`) as any;
  const detail = response?.data ?? response;
  const rows = Array.isArray(detail?.status_projeto_tecnico) ? detail.status_projeto_tecnico : [];
  const currentStatusId = String(detail?.status_atual?.status_id ?? '');
  const timeline = rows.map((row: any) => {
    const date = String(first(row, ['data_inicial', 'created_at'], ''));
    const endDate = first(row, ['data_final'], '');
    const statusId = String(first(row, ['status_id'], ''));
    return {
      label: cleanLabel(first(row, ['status.status', 'status.nome', 'status.name'], 'Etapa do processo')),
      date,
      done: Boolean(endDate),
      current: Boolean(currentStatusId && statusId === currentStatusId) || (!currentStatusId && !endDate),
      _sort: Date.parse(date) || 0
    };
  }).sort((a: any, b: any) => a._sort - b._sort).map(({ _sort, ...item }: any) => item);
  const useParts = Array.isArray(detail?.occupation_division_technical_projects) ? detail.occupation_division_technical_projects.map((item: any) =>
    first(item, ['occupation.occupation_use', 'occupation.group.name', 'occupation.group.nome', 'occupation.group'])
  ).filter((value: unknown) => (typeof value === 'string' || typeof value === 'number') && !/^nenhuma ocupação$/i.test(String(value).trim())) : [];
  const directUse = first(detail, ['instituicao.atividade_economica', 'institution.activity_economica', 'activity_economica', 'uso'], '');
  const projectAddress = first(detail, ['edification.address'], {}) || {};
  const address = [
    first(projectAddress, ['public_place', 'logradouro']),
    first(projectAddress, ['number', 'numero']),
    first(projectAddress, ['complement', 'complemento']),
    first(projectAddress, ['district', 'bairro'])
  ].filter(Boolean).map(cleanLabel).join(', ');
  const numeric = (keys: string[]) => {
    const value = Number(first(detail, keys, ''));
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  const profile: TechnicalProjectProfile = {
    address,
    use: cleanLabel(useParts.length ? [...new Set(useParts)].join(' · ') : directUse),
    totalArea: numeric(['edification.total_area', 'total_area', 'area_total']),
    buildingArea: numeric(['edification.building_area', 'building_area', 'area_construida']),
    areaToBeBuilt: numeric(['edification.area_to_be_built', 'area_to_be_built', 'area_construir']),
    floors: numeric(['edification.number_floors', 'number_floors', 'numberFloors', 'pavimentos']),
    height: cleanLabel(first(detail, ['edification.height', 'height'], '')),
    validUntil: cleanLabel(first(detail, ['valid_until', 'valid_until_date', 'validade_acp', 'data_validade_acp', 'certificate.valid_until', 'certificado.data_validade', 'acp.valid_until'], '')),
    technicalFacts: [
      ['Tipo de projeto', ['tipo_projeto.sigla', 'tipo_projeto.nome', 'tipoProjeto.sigla', 'tipoProjeto.nome', 'project_type.name', 'tipo_projeto_id']],
      ['Número do projeto', ['num_projeto', 'n_projeto', 'numero_projeto']],
      ['Responsável técnico', ['technical.name', 'responsavel_tecnico.name', 'responsavelTecnico.name']],
      ['Registro profissional', ['technical.crea_cau', 'responsavel_tecnico.crea_cau', 'responsavelTecnico.crea_cau']],
      ['Risco', ['institution.risco', 'instituicao.risco', 'risco']],
      ['Ocupação / divisão', ['occupation_division_technical_projects.0.occupation.occupation_use', 'occupation_division_technical_projects.0.division.division_use']]
    ].map(([label, keys]) => ({ label: String(label), value: cleanLabel(first(detail, keys as string[], '')) }))
      .filter((fact) => fact.value && fact.value !== '[object Object]')
  };
  const snapshot = { expiresAt: Date.now() + 10 * 60_000, requestId: String(detail?.solicitacao_atual?.id ?? ''), timeline, profile };
  projectDetailsCache.set(cacheKey, snapshot);
  if (projectDetailsCache.size > 500) {
    for (const [key, item] of projectDetailsCache) if (item.expiresAt <= Date.now()) projectDetailsCache.delete(key);
    if (projectDetailsCache.size > 500) projectDetailsCache.delete(projectDetailsCache.keys().next().value!);
  }
  return snapshot;
}

export async function getTechnicalProjectTimeline(userId: string, projectId: string): Promise<TechnicalProjectEvent[]> {
  return (await technicalProjectDetails(userId, projectId)).timeline;
}

export async function refreshTechnicalProjectDetails(userId: string, projectId: string) {
  const { timeline, profile } = await technicalProjectDetails(userId, projectId, true);
  return { timeline, profile };
}

export async function getTechnicalProjectBuildingProfile(userId: string, projectId: string): Promise<TechnicalProjectProfile> {
  return (await technicalProjectDetails(userId, projectId)).profile;
}

export async function getFenixEdificationProfile(userId: string, buildingId: string) {
  const client = await fenixClientForUser(userId);
  const response = await client.get(`/api/v1/edifications/${encodeURIComponent(buildingId)}`) as any;
  const root = response?.data?.edification ?? response?.data ?? response;
  const address = first(root, ['address'], {}) || {};
  const street = cleanLabel(first(address, ['public_place', 'logradouro'], ''));
  const number = cleanLabel(first(address, ['number', 'numero'], ''));
  const complement = cleanLabel(first(address, ['complement', 'complemento'], ''));
  const district = cleanLabel(first(address, ['district', 'bairro'], ''));
  const useParts = Array.isArray(root?.occupationsDivisions) ? root.occupationsDivisions.flatMap((item: any) => [
    first(item, ['occupation_group.name', 'occupation_group.nome', 'occupation_group_name', 'occupation_group']),
    first(item, ['division_group.name', 'division_group.nome', 'division_group_name', 'division_group'])
  ]).filter((value: unknown) => typeof value === 'string' || typeof value === 'number') : [];
  const directUse = first(root, ['institution.activity_economica', 'activity_economica', 'uso'], '');
  const useName = cleanLabel(typeof directUse === 'string' || typeof directUse === 'number' ? directUse : useParts.join(' · '));
  const value = (keys: string[]) => {
    const parsed = Number(first(root, keys, ''));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  return {
    address: [street, number, complement, district].filter(Boolean).join(', '),
    use: useName,
    totalArea: value(['total_area', 'area_total']),
    buildingArea: value(['building_area', 'area_construida']),
    areaToBeBuilt: value(['area_to_be_built', 'area_construir']),
    floors: value(['number_floors', 'numberFloors', 'pavimentos']),
    height: cleanLabel(first(root, ['height'], ''))
  };
}

export async function getTechnicalProjectCertificate(userId: string, projectId: string) {
  const detail = await technicalProjectDetails(userId, projectId);
  if (!detail.requestId) throw new FenixError('O projeto não possui uma solicitação atual para consultar o certificado.', 404);
  const response = await (await fenixClientForUser(userId)).get(`/api/v1/solicitacoes/${encodeURIComponent(detail.requestId)}/certificados/aprovacao`) as any;
  const payload = response?.data ?? response;
  const encoded = String(payload?.arquivo ?? '');
  if (!encoded || encoded.length > 950_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new FenixError('O Fênix não retornou um arquivo de certificado válido.', 404);
  const content = Buffer.from(encoded, 'base64');
  if (!content.length || content.subarray(0, 5).toString('ascii') !== '%PDF-') throw new FenixError('O arquivo retornado pelo Fênix não é um certificado PDF válido.', 502);
  const providedName = String(payload?.nome || 'certificado-de-aprovacao.pdf').split(/[\\/]/).pop() || 'certificado-de-aprovacao.pdf';
  const filename = providedName.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120).replace(/\.+$/, '') || 'certificado-de-aprovacao.pdf';
  const safeFilename = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;
  const info = { filename: safeFilename, size: content.length };
  certificateInfoCache.set(`${userId}:${projectId}`, { expiresAt: Date.now() + 10 * 60_000, info });
  return { ...info, content };
}

export async function getTechnicalProjectCertificateInfo(userId: string, projectId: string): Promise<TechnicalCertificateInfo | null> {
  const cacheKey = `${userId}:${projectId}`;
  const cached = certificateInfoCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.info;
  try {
    const { filename, size } = await getTechnicalProjectCertificate(userId, projectId);
    return { filename, size };
  } catch (error) {
    if (error instanceof FenixError && error.status === 404) certificateInfoCache.set(cacheKey, { expiresAt: Date.now() + 2 * 60_000, info: null });
    throw error;
  }
}

const protocolInfoCache = new Map<string, { expiresAt: number; info: TechnicalCertificateInfo | null }>();

export async function getTechnicalProjectProtocolReceipt(userId: string, projectId: string) {
  const detail = await technicalProjectDetails(userId, projectId);
  if (!detail.requestId) throw new FenixError('O projeto não possui uma solicitação atual para consultar o comprovante de protocolo.', 404);
  const response = await (await fenixClientForUser(userId)).get(`/api/v1/solicitacoes/${encodeURIComponent(detail.requestId)}/certificados/protocolo`) as any;
  const payload = response?.data ?? response;
  const encoded = String(payload?.arquivo ?? '');
  if (!encoded || encoded.length > 950_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new FenixError('O Fênix não retornou um comprovante de protocolo válido.', 404);
  const content = Buffer.from(encoded, 'base64');
  if (!content.length || content.subarray(0, 5).toString('ascii') !== '%PDF-') throw new FenixError('O arquivo retornado pelo Fênix não é um PDF válido.', 502);
  const providedName = String(payload?.nome || 'comprovante-de-protocolo.pdf').split(/[\\/]/).pop() || 'comprovante-de-protocolo.pdf';
  const filename = providedName.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120).replace(/\.+$/, '') || 'comprovante-de-protocolo.pdf';
  const safeFilename = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;
  return { filename: safeFilename, size: content.length, content };
}

export async function getTechnicalProjectProtocolReceiptInfo(userId: string, projectId: string): Promise<TechnicalCertificateInfo | null> {
  const cacheKey = `${userId}:${projectId}`;
  const cached = protocolInfoCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.info;
  try {
    const { filename, size } = await getTechnicalProjectProtocolReceipt(userId, projectId);
    const info = { filename, size };
    protocolInfoCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60_000, info });
    return info;
  } catch (error) {
    if (error instanceof FenixError && error.status === 404) protocolInfoCache.set(cacheKey, { expiresAt: Date.now() + 2 * 60_000, info: null });
    throw error;
  }
}

export async function getFenixRequestNotification(userId: string, requestId: string) {
  if (!/^\d+$/.test(requestId)) throw new FenixError('Identificador de solicitação inválido.', 404);
  const response = await (await fenixClientForUser(userId)).post('/api/v1/request/download', {
    solicitacao_id: Number(requestId), tipo_documento: null
  }) as any;
  const payload = response?.data ?? response;
  const encoded = String(payload?.arquivo ?? '');
  if (!encoded || encoded.length > 950_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new FenixError('O Fênix não retornou uma notificação disponível para esta solicitação.', 404);
  }
  const content = Buffer.from(encoded, 'base64');
  if (!content.length || content.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new FenixError('O arquivo de notificação retornado pelo Fênix não é um PDF válido.', 502);
  }
  const providedName = String(payload?.nome_arquivo || `notificacao-${requestId}.pdf`).split(/[\\/]/).pop() || `notificacao-${requestId}.pdf`;
  const filename = providedName.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120).replace(/\.+$/, '') || `notificacao-${requestId}.pdf`;
  const safeFilename = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;
  return { filename: safeFilename, size: content.length, content };
}

export async function getTechnicalProjectNotification(userId: string, projectId: string) {
  const detail = await technicalProjectDetails(userId, projectId);
  if (!detail.requestId) throw new FenixError('O projeto não possui uma solicitação atual para consultar a notificação.', 404);
  return getFenixRequestNotification(userId, detail.requestId);
}

type TechnicalProjectDae = { id: string; type: string; status: string; dueDate?: string; paymentDate?: string; available: boolean };
const daeDeliveryCache = new Map<string, { expiresAt: number; mode: 'manual' | 'direct' }>();

async function technicalProjectDaes(userId: string, projectId: string) {
  const detail = await technicalProjectDetails(userId, projectId);
  if (!detail.requestId) return [];
  const client = await fenixClientForUser(userId);
  const response = await client.get(`/api/v1/solicitacoes/${encodeURIComponent(detail.requestId)}/daes`) as any;
  const root = response?.data ?? response;
  const rows = Array.isArray(root) ? root : Array.isArray(root?.data) ? root.data : Array.isArray(root?.rows) ? root.rows : Array.isArray(root?.daes) ? root.daes : [];
  return rows.map((row: any) => {
    const id = String(row.id ?? '');
    const deliveryKey = `${userId}:${projectId}:${id}`;
    let delivery = daeDeliveryCache.get(deliveryKey);
    if (delivery && delivery.expiresAt <= Date.now()) { daeDeliveryCache.delete(deliveryKey); delivery = undefined; }
    return {
      id,
      type: cleanLabel(String(row.tipo_taxa || 'Documento de arrecadação estadual')),
      status: cleanLabel(String(row.status?.nome || row.status?.status || row.status || 'Situação não informada')),
      dueDate: String(row.data_vencimento || row.data_max_pagamento || ''),
      paymentDate: String(row.data_pagamento || ''),
      available: typeof row.url_dae === 'string' && Boolean(row.url_dae)
    };
  }).filter((item: TechnicalProjectDae) => item.id);
}

export async function getTechnicalProjectDaes(userId: string, projectId: string): Promise<TechnicalProjectDae[]> {
  return technicalProjectDaes(userId, projectId);
}

export async function getTechnicalProjectDaeUrl(userId: string, projectId: string, daeId: string) {
  const detail = await technicalProjectDetails(userId, projectId);
  if (!detail.requestId) throw new FenixError('O projeto não possui solicitação atual.', 404);
  const response = await (await fenixClientForUser(userId)).get(`/api/v1/solicitacoes/${encodeURIComponent(detail.requestId)}/daes`) as any;
  const root = response?.data ?? response;
  const rows = Array.isArray(root) ? root : Array.isArray(root?.data) ? root.data : Array.isArray(root?.rows) ? root.rows : Array.isArray(root?.daes) ? root.daes : [];
  const dae = rows.find((row: any) => String(row.id ?? '') === daeId);
  if (!dae || typeof dae.url_dae !== 'string') throw new FenixError('O Fênix não retornou o endereço deste DAE.', 404);
  let url: URL;
  try { url = new URL(dae.url_dae); } catch { throw new FenixError('O endereço do DAE retornado pelo Fênix é inválido.', 502); }
  if (url.protocol !== 'https:' || url.hostname !== 'servicos.sefaz.ba.gov.br' || url.username || url.password) throw new FenixError('O endereço do DAE não pertence ao portal oficial esperado.', 502);
  return url.toString();
}

export async function getTechnicalProjectDaePdf(userId: string, projectId: string, daeId: string) {
  const detail = await technicalProjectDetails(userId, projectId);
  if (!detail.requestId) throw new FenixError('O projeto não possui solicitação atual.', 404);
  const client = await fenixClientForUser(userId);
  const response = await client.get(`/api/v1/solicitacoes/${encodeURIComponent(detail.requestId)}/daes`) as any;
  const root = response?.data ?? response;
  const rows = Array.isArray(root) ? root : Array.isArray(root?.data) ? root.data : Array.isArray(root?.rows) ? root.rows : Array.isArray(root?.daes) ? root.daes : [];
  const dae = rows.find((row: any) => String(row.id ?? '') === daeId);
  if (!dae || typeof dae.url_dae !== 'string') throw new FenixError('Documento DAE não encontrado no Fênix.', 404);
  let url: URL;
  try { url = new URL(dae.url_dae); } catch { throw new FenixError('O endereço do DAE retornado pelo Fênix é inválido.', 502); }
  const allowedHost = 'servicos.sefaz.ba.gov.br';
  if (url.protocol !== 'https:' || url.hostname !== allowedHost || url.username || url.password) throw new FenixError('O endereço do DAE não pertence ao portal oficial esperado.', 502);
  let fileResponse: Response | undefined;
  for (let redirect = 0; redirect <= 2; redirect++) {
    fileResponse = await fetch(url, { method: 'GET', headers: {
      Accept: 'application/pdf, application/octet-stream, text/html;q=0.9, */*;q=0.8',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Referer: 'https://servicos.sefaz.ba.gov.br/'
    }, signal: AbortSignal.timeout(25_000), redirect: 'manual' });
    const location = fileResponse.headers.get('location');
    if (fileResponse.status < 300 || fileResponse.status >= 400 || !location) break;
    if (redirect === 2) throw new FenixError('O portal SEFAZ-BA redirecionou o DAE muitas vezes.', 502);
    const next = new URL(location, url);
    if (next.protocol !== 'https:' || next.hostname !== allowedHost || next.username || next.password) throw new FenixError('O portal SEFAZ-BA redirecionou para um endereço não autorizado.', 502);
    url = next;
  }
  if (!fileResponse?.ok || !fileResponse.body) throw new FenixError('O portal SEFAZ-BA não disponibilizou o arquivo DAE.', fileResponse?.status || 502);
  const reader = fileResponse.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 12_000_000) { await reader.cancel(); throw new FenixError('O arquivo DAE excede o limite aceito.', 413); }
    chunks.push(value);
  }
  const content = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  if (content.subarray(0, 5).toString('ascii') !== '%PDF-') {
    const html = content.toString('utf8');
    const contentType = fileResponse.headers.get('content-type') || '';
    const hasPostForm = /<form\b[^>]*\bmethod\s*=\s*["']?post\b/i.test(html);
    if (contentType.toLowerCase().includes('text/html') && hasPostForm) {
      daeDeliveryCache.set(`${userId}:${projectId}:${daeId}`, { expiresAt: Date.now() + 30 * 60_000, mode: 'manual' });
      throw new FenixError('A SEFAZ exige uma etapa de formulário para abrir este DAE; o painel não enviou o formulário.', 409);
    }
    throw new FenixError('O portal SEFAZ-BA não retornou um PDF DAE válido.', 502);
  }
  daeDeliveryCache.set(`${userId}:${projectId}:${daeId}`, { expiresAt: Date.now() + 30 * 60_000, mode: 'direct' });
  return { filename: `DAE-${daeId.replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`, content, size: content.length };
}

const WEBHOOK_DOCUMENT_LIMIT_BYTES = 1_500_000;
const WEBHOOK_DOCUMENT_TOTAL_LIMIT_BYTES = 5_000_000;

/** Adds only files returned by the Fênix/SEFAZ read routes already used by the panel. */
export async function addProcessDocumentsToWebhook(userId: string, event: ProcessWebhookPayload): Promise<ProcessWebhookPayload> {
  const process = event.after.process;
  const processId = String(process.id || '');
  const storedRemoteId = db.prepare('SELECT remote_id FROM processes WHERE user_id=? AND id=?').get(userId, processId) as { remote_id: string | null } | undefined;
  const remoteProcessId = storedRemoteId?.remote_id || processId.replace(/^[^:]+:/, '');
  const building = event.after.building;
  const association = {
    buildingId: String(building.id || ''),
    buildingName: String(building.reference || ''),
    processId,
    protocol: String(process.protocol || ''),
    processType: String(process.type || '')
  };
  const payload = process.payload && typeof process.payload === 'object' && !Array.isArray(process.payload)
    ? process.payload as Record<string, unknown> : {};
  const sourceDocuments = Array.isArray(payload.documents) ? payload.documents : [];
  const documents: ProcessWebhookDocument[] = sourceDocuments.map((item: any, index) => {
    const name = typeof item === 'string' ? item : String(item?.name || item?.nome || item?.filename || 'Documento');
    const contentBase64 = typeof item?.contentBase64 === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(item.contentBase64)
      ? item.contentBase64 : undefined;
    const source = item?.source === 'test' ? 'test' : 'fenix';
    return {
      id: String(item?.id || `${processId}:metadata:${index}`), name,
      type: typeof item === 'string' ? 'Documento do processo' : String(item?.type || item?.tipo || 'Anexo'),
      ...(item?.date || item?.createdAt ? { date: String(item.date || item.createdAt) } : {}),
      ...(item?.uploadedBy ? { uploadedBy: String(item.uploadedBy) } : {}),
      ...(item?.uploadedAt ? { uploadedAt: String(item.uploadedAt) } : {}),
      mimeType: String(item?.mimeType || item?.mime_type || 'application/octet-stream'), size: Number(item?.size) || 0,
      source, associatedWith: association, availability: contentBase64 ? 'included' : 'metadata_only',
      ...(contentBase64 ? { contentBase64 } : { note: 'O Fênix informou o documento, mas não disponibilizou o conteúdo binário nesta consulta.' })
    };
  });
  const files: Array<{ id: string; name: string; type: string; source: 'fenix' | 'sefaz-ba'; content: Buffer }> = [];
  const addFile = (id: string, name: string, type: string, source: 'fenix' | 'sefaz-ba', content: Buffer) => {
    if (content.subarray(0, 5).toString('ascii') === '%PDF-') files.push({ id, name, type, source, content });
  };
  const tryRead = async (id: string, type: string, source: 'fenix' | 'sefaz-ba', read: () => Promise<{ filename: string; content: Buffer }>) => {
    try { const file = await read(); addFile(id, file.filename, type, source, file.content); }
    catch { /* Missing or unauthorized files remain absent; sync and webhook still proceed. */ }
  };

  if (processId.startsWith('technicalproject:')) {
    const projectId = remoteProcessId;
    try {
      const daes = await getTechnicalProjectDaes(userId, projectId);
      const reads: Array<Promise<void>> = [
        tryRead(`${processId}:protocol-receipt`, 'Comprovante de protocolo', 'fenix', () => getTechnicalProjectProtocolReceipt(userId, projectId)),
        tryRead(`${processId}:certificate`, 'Certificado de aprovação', 'fenix', () => getTechnicalProjectCertificate(userId, projectId)),
        tryRead(`${processId}:notification`, 'Notificação oficial', 'fenix', () => getTechnicalProjectNotification(userId, projectId))
      ];
      for (const dae of daes.slice(0, 4)) {
        const metadata: ProcessWebhookDocument = {
          id: `${processId}:dae:${dae.id}`, name: dae.type, type: 'Documento de arrecadação (DAE)',
          ...(dae.dueDate ? { date: dae.dueDate } : {}), mimeType: 'application/pdf', size: 0,
          source: 'fenix', associatedWith: association, availability: 'metadata_only',
          note: 'O link do DAE é disponibilizado pela SEFAZ; o PDF pode exigir uma etapa manual.'
        };
        documents.push(metadata);
        if (dae.available) reads.push(tryRead(metadata.id, metadata.type, 'sefaz-ba', () => getTechnicalProjectDaePdf(userId, projectId, dae.id)));
      }
      await Promise.all(reads);
    } catch { /* Preserve metadata and deliver the process event even if Fênix document lookup fails. */ }
  } else if (processId.startsWith('request:')) {
    const requestId = remoteProcessId;
    await tryRead(`${processId}:notification`, 'Notificação oficial', 'fenix', () => getFenixRequestNotification(userId, requestId));
  }

  let totalBytes = 0;
  for (const file of files.slice(0, 8)) {
    const existingIndex = documents.findIndex((doc) => doc.id === file.id || (doc.name === file.name && doc.availability === 'included'));
    if (existingIndex >= 0 && documents[existingIndex]?.availability === 'included') continue;
    const fits = file.content.length <= WEBHOOK_DOCUMENT_LIMIT_BYTES && totalBytes + file.content.length <= WEBHOOK_DOCUMENT_TOTAL_LIMIT_BYTES;
    const enrichedDocument: ProcessWebhookDocument = {
      id: file.id, name: file.name, type: file.type, mimeType: 'application/pdf', size: file.content.length,
      source: file.source, associatedWith: association,
      availability: fits ? 'included' : 'metadata_only',
      ...(fits ? { contentBase64: file.content.toString('base64') } : { note: 'Arquivo omitido do payload por exceder o limite de tamanho do webhook.' })
    };
    if (existingIndex >= 0) documents[existingIndex] = { ...documents[existingIndex]!, ...enrichedDocument };
    else documents.push(enrichedDocument);
    if (fits) totalBytes += file.content.length;
  }

  if (event.changes.event === 'webhook.test' && !documents.some((doc) => doc.availability === 'included' && doc.contentBase64)) {
    const example = Buffer.from('Documento sintético para validar o envio Base64 do webhook.');
    documents.push({
      id: 'webhook-test-document', name: 'anexo-exemplo.txt', type: 'Arquivo sintético de teste',
      mimeType: 'text/plain', size: example.length, source: 'test', associatedWith: association,
      availability: 'included', contentBase64: example.toString('base64'),
      note: 'Arquivo sintético; não contém dados de processo.'
    });
  }

  return {
    ...event,
    after: { ...event.after, process: { ...process, payload: { ...payload, documents } } }
  };
}

function records(value: any): any[] {
  if (Array.isArray(value)) return value;
  for (const candidate of [value?.data, value?.rows, value?.items, value?.results, value?.edifications, value?.requests, value?.technicalprojects]) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === 'object') {
      for (const nested of [candidate.data, candidate.rows, candidate.items, candidate.results]) if (Array.isArray(nested)) return nested;
    }
  }
  return [];
}

async function allRecords(client: FenixClient, path: string, query: Record<string, string | number>) {
  const pageSize = 100;
  const firstPage = await client.get(path, { ...query, page: 1, perPage: pageSize }) as any;
  const firstRows = records(firstPage);
  const total = Number(firstPage?.total ?? firstPage?.data?.total ?? firstRows.length);
  if (!Number.isFinite(total) || total <= firstRows.length || firstRows.length < pageSize) return firstRows;
  const pageCount = Math.min(Math.ceil(total / pageSize), 100);
  const rows = [...firstRows];
  for (let page = 2; page <= pageCount; page++) {
    const result = await client.get(path, { ...query, page, perPage: pageSize });
    const batch = records(result);
    if (!batch.length) break;
    rows.push(...batch);
  }
  return rows;
}

const first = (object: any, keys: string[], fallback: any = ''): any => {
  for (const key of keys) {
    const value = key.split('.').reduce((current, part) => current?.[part], object);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
};

export type FenixBuildingOption = { id: string; reference: string; municipality: string };

function mapFenixBuildingOptions(rows: any[]): FenixBuildingOption[] {
  const seen = new Set<string>();
  return rows.flatMap((building) => {
    const id = String(first(building, ['id', 'edificacao_id'], ''));
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      reference: cleanLabel(first(building, ['reference_name', 'nome', 'name', 'razao_social', 'nome_fantasia'], `Edificação ${id}`)).slice(0, 180),
      municipality: cleanLabel(first(building, ['address.county', 'county', 'municipio.nome', 'municipality', 'cidade'], '')).slice(0, 120)
    }];
  });
}

export async function listFenixEdificationsForJar(jar: CookieJar, fenixUserId: string): Promise<FenixBuildingOption[]> {
  const client = new FenixClient(jar);
  const requester = await client.get('/api/v1/detailsRequester') as any;
  const actualUserId = String(first(requester, ['user.id', 'data.user.id', 'id'], fenixUserId));
  if (!actualUserId || actualUserId !== fenixUserId) throw new FenixError('A sessão retornou uma identidade Fênix diferente. Entre novamente.');
  const rows = await allRecords(client, `/api/v1/usuarios/${encodeURIComponent(actualUserId)}/edifications`, {});
  return mapFenixBuildingOptions(rows);
}

export async function listFenixEdificationsForUser(userId: string): Promise<FenixBuildingOption[]> {
  const user = db.prepare('SELECT fenix_user_id, session_ciphertext FROM users WHERE id=? AND demo=0').get(userId) as { fenix_user_id: string | null; session_ciphertext: string | null } | undefined;
  if (!user?.fenix_user_id || !user.session_ciphertext) throw new FenixError('Sessão Fênix não encontrada. Reconecte a conta.');
  const jar = CookieJar.deserializeSync(JSON.parse(unseal(user.session_ciphertext)));
  const rows = await listFenixEdificationsForJar(jar, user.fenix_user_id);
  db.prepare('UPDATE users SET session_ciphertext=? WHERE id=?').run(seal(JSON.stringify(jar.serializeSync())), userId);
  return rows;
}

function cleanLabel(value: unknown) {
  return String(value || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[e-mail removido]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF removido]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[CNPJ removido]')
    .replace(/\b\(?\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, '[telefone removido]');
}

function safeProcessPayload(process: any) {
  const rawDocuments = first(process, ['documents', 'documentos', 'files', 'anexos'], []);
  const documents = (Array.isArray(rawDocuments) ? rawDocuments : []).map((doc: any) => typeof doc === 'string'
    ? cleanLabel(doc)
    : {
      name: cleanLabel(first(doc, ['name', 'nome', 'filename', 'arquivo'], 'Documento')),
      type: cleanLabel(first(doc, ['tipo_documento.nome', 'tipo', 'type'], 'Anexo')),
      date: String(first(doc, ['created_at', 'data', 'data_envio'], '')),
      uploadedBy: cleanLabel(first(doc, ['uploaded_by.name', 'usuario.nome', 'user.name', 'created_by.name', 'responsavel.nome', 'enviado_por.name'], ''))
    });
  const rawTimeline = first(process, ['timeline', 'historico', 'movimentacoes', 'history'], []);
  const timeline = (Array.isArray(rawTimeline) ? rawTimeline : []).map((step: any) => ({
    label: cleanLabel(first(step, ['label', 'etapa', 'descricao', 'status'], 'Movimentação')),
    date: String(first(step, ['date', 'data', 'created_at'], '')),
    done: Boolean(first(step, ['done', 'concluido'], false)),
    current: Boolean(first(step, ['current', 'atual'], false))
  }));
  return { documents, timeline };
}

function safeBuildingPayload(building: any): Record<string, unknown> {
  const forbiddenKey = /cookie|authorization|auth|password|senha|token|secret|captcha|session|credential|header/i;
  const sanitize = (value: unknown): unknown => {
    if (typeof value === 'string') return cleanLabel(value);
    if (Array.isArray(value)) return value.map(sanitize);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !forbiddenKey.test(key))
        .map(([key, nested]) => [key, sanitize(nested)]));
    }
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
    return undefined;
  };
  const result = sanitize(building);
  return result && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, unknown> : {};
}

function processBuildingId(process: any) {
  return String(first(process, ['edificacao_id', 'edification_id', 'edificationId', 'edificacao.id', 'edification.id', 'imovel.id'], ''));
}

function processStatus(process: any) {
  return String(first(process, ['status.descricao', 'status.name', 'status', 'situacao', 'etapa_atual', 'project_status.name', 'project_status'], 'Em acompanhamento'));
}

function processProtocol(process: any) {
  return String(first(process, ['n_protocolo_format', 'n_solicitacao_format', 'num_projeto', 'n_protocolo', 'n_protocolo_sap', 'protocolo', 'protocol', 'numero_processo', 'solicitacao', 'n_projeto'], ''));
}

export async function syncFenixUser(userId: string) {
  const user = db.prepare('SELECT id, fenix_user_id, session_ciphertext, last_sync FROM users WHERE id = ? AND demo = 0').get(userId) as
    { id: string; fenix_user_id: string; session_ciphertext: string; last_sync: string | null } | undefined;
  if (!user?.session_ciphertext) throw new FenixError('Sessão Fênix não encontrada. Entre novamente.');
  const connection = db.prepare('SELECT id, owner_user_id, fenix_user_id, label, paused, webhook_enabled FROM fenix_connections WHERE data_user_id=?').get(userId) as
    { id: string; owner_user_id: string; fenix_user_id: string; label: string; paused: number; webhook_enabled: number } | undefined;
  if (connection?.paused) throw new FenixError('Esta conexão Fênix está pausada.');
  const localBuildingId = (remoteId: string) => connection ? `linked:${connection.id}:building:${remoteId}` : remoteId;
  const localProcessId = (source: string, remoteId: string) => connection ? `${source}:${connection.id}:${remoteId}` : `${source}:${remoteId}`;
  const jar = CookieJar.deserializeSync(JSON.parse(unseal(user.session_ciphertext)));
  const client = new FenixClient(jar);
  const requester = await client.get('/api/v1/detailsRequester') as any;
  const fenixUserId = String(first(requester, ['user.id', 'data.user.id', 'id'], user.fenix_user_id));
  if (connection && fenixUserId !== connection.fenix_user_id) {
    db.prepare("UPDATE fenix_connections SET status='reauth_required', updated_at=? WHERE id=?").run(new Date().toISOString(), connection.id);
    throw new FenixError('A sessão autenticada pertence a outra conta Fênix. Reconecte a conta correta.', 401);
  }
  const allBuildingRows = await allRecords(client, `/api/v1/usuarios/${encodeURIComponent(fenixUserId)}/edifications`, {});
  if (connection) {
    const upsertCatalog = db.prepare(`INSERT INTO fenix_connection_buildings (connection_id,remote_building_id,reference,municipality,selected,updated_at)
      VALUES (?,?,?,?,0,?) ON CONFLICT(connection_id,remote_building_id) DO UPDATE SET reference=excluded.reference, municipality=excluded.municipality, updated_at=excluded.updated_at`);
    const catalogOptions = mapFenixBuildingOptions(allBuildingRows);
    const municipalityById = new Map(catalogOptions.map((item) => [item.id, item.municipality]));
    const referenceById = new Map(catalogOptions.map((item) => [item.id, item.reference]));
    const updateCatalog = db.transaction(() => {
      for (const item of catalogOptions) upsertCatalog.run(connection.id, item.id, referenceById.get(item.id) || 'Edificação', municipalityById.get(item.id) || '', new Date().toISOString());
    });
    updateCatalog();
  }
  const selectedRemoteIds = connection
    ? new Set((db.prepare('SELECT remote_building_id FROM fenix_connection_buildings WHERE connection_id=? AND selected=1').all(connection.id) as Array<{ remote_building_id: string }>).map((item) => item.remote_building_id))
    : null;
  const buildingRows = connection ? allBuildingRows.filter((row) => selectedRemoteIds!.has(String(first(row, ['id', 'edificacao_id'], '')))) : allBuildingRows;
  const requestRows = await allRecords(client, '/api/v1/request', { tipo_lista: 'minhas_solicitacoes' });
  const projectRows = await allRecords(client, '/api/v1/technicalproject', {});
  const buildingIds = new Set(buildingRows.map((item) => String(first(item, ['id', 'edificacao_id'], ''))).filter(Boolean));
  const localBuildingIds = new Map([...buildingIds].map((remoteId) => [remoteId, localBuildingId(remoteId)]));
  const fetchedProcesses = [
    ...requestRows.map((row) => ({ ...row, __source: 'request' })),
    ...projectRows.map((row) => ({ ...row, __source: 'technicalproject' }))
  ];
  const latestByIdentity = new Map<string, any>();
  for (const row of fetchedProcesses) {
    const source = row.__source || 'process';
    const rawId = String(first(row, ['id', 'solicitacao_id', 'projeto_tecnico_id'], ''));
    if (!rawId) continue;
    const key = `${source}:${rawId}`;
    const current = latestByIdentity.get(key);
    const rowDate = Date.parse(String(first(row, ['dt_protocolo', 'updated_at', 'created_at'], ''))) || 0;
    const currentDate = current ? Date.parse(String(first(current, ['dt_protocolo', 'updated_at', 'created_at'], ''))) || 0 : -1;
    if (!current || rowDate >= currentDate) latestByIdentity.set(key, row);
  }
  const processRows = [...latestByIdentity.values()].filter((row) => {
    const buildingId = processBuildingId(row);
    return buildingId && buildingIds.has(buildingId);
  });
  const hadPriorSync = Boolean(user.last_sync);
  const selectedLocalBuildingIds = [...localBuildingIds.values()];
  const selectedIdSql = selectedLocalBuildingIds.map(() => '?').join(',');
  const previousProcesses = (connection
    ? selectedLocalBuildingIds.length ? db.prepare(`SELECT id, building_id, protocol, type, status, stage, updated_at, payload, remote_id FROM processes WHERE user_id=? AND source_connection_id=? AND building_id IN (${selectedIdSql})`).all(userId, connection.id, ...selectedLocalBuildingIds) : []
    : db.prepare('SELECT id, building_id, protocol, type, status, stage, updated_at, payload, remote_id FROM processes WHERE user_id = ?').all(userId)) as Array<{ id: string; building_id: string; protocol: string; type: string; status: string; stage: string; updated_at: string; payload: string; remote_id: string | null }>;
  const previousBuildingRows = (connection
    ? buildingIds.size ? db.prepare(`SELECT * FROM buildings WHERE user_id=? AND source_connection_id=? AND remote_id IN (${[...buildingIds].map(() => '?').join(',')})`).all(userId, connection.id, ...buildingIds) : []
    : db.prepare('SELECT * FROM buildings WHERE user_id=?').all(userId)) as Array<any>;
  const previousBuildings = new Map(previousBuildingRows.map((row) => [row.id, row]));
  const buildingNames = new Map(buildingRows.map((building) => [String(first(building, ['id', 'edificacao_id'], '')), cleanLabel(first(building, ['reference_name', 'nome', 'name', 'razao_social', 'nome_fantasia'], 'Edificação'))]));
  const currentStates: ProcessSyncState[] = [];
  for (const process of processRows) {
    const remoteBuildingId = processBuildingId(process);
    const buildingId = localBuildingIds.get(remoteBuildingId) || '';
    const rawId = String(first(process, ['id', 'solicitacao_id', 'projeto_tecnico_id'], ''));
    const id = rawId ? localProcessId(process.__source || 'process', rawId) : '';
    if (!id || !buildingIds.has(remoteBuildingId)) continue;
    const status = cleanLabel(processStatus(process));
    const stage = cleanLabel(String(first(process, ['etapa_atual', 'fase', 'stage'], status)));
    const protocol = cleanLabel(processProtocol(process));
    currentStates.push({
      id, buildingId, buildingReference: buildingNames.get(remoteBuildingId) || 'Edificação acompanhada', protocol,
      type: cleanLabel(`${process.__source === 'request' ? 'Solicitação' : 'Projeto técnico'}${first(process, ['tipo_solicitacao_display', 'tipo_solicitacao', 'sigla'], '') ? ` · ${first(process, ['tipo_solicitacao_display', 'tipo_solicitacao', 'sigla'], '')}` : ''}`),
      status, stage, payload: JSON.stringify(safeProcessPayload(process))
    });
  }
  const previousStates: ProcessSyncState[] = previousProcesses.map((item) => ({
    id: item.id, buildingId: item.building_id,
    buildingReference: previousBuildings.get(item.building_id)?.reference || 'Edificação acompanhada',
    protocol: item.protocol, type: item.type, status: item.status, stage: item.stage, payload: item.payload
  }));
  const changes = hadPriorSync ? detectProcessChanges(previousStates, currentStates) : [];
  const now = new Date().toISOString();
  const webhookUrl = connection && !connection.webhook_enabled ? '' : getSetting(WEBHOOK_SETTING);
  const webhookEvents: ProcessWebhookPayload[] = [];
  const currentBuildingSnapshots = new Map<string, Record<string, unknown>>();
  for (const row of buildingRows) {
    const remoteId = String(first(row, ['id', 'edificacao_id'], ''));
    const id = localBuildingIds.get(remoteId) || '';
    if (!remoteId || !id) continue;
    currentBuildingSnapshots.set(id, {
      id, reference: cleanLabel(first(row, ['reference_name', 'nome', 'name', 'razao_social', 'nome_fantasia'], `Edificação ${id}`)),
      municipality: cleanLabel(first(row, ['address.county', 'county', 'municipio.nome', 'municipality', 'cidade'], '')),
      address: cleanLabel(first(row, ['address.public_place', 'address.logradouro', 'logradouro'], '')),
      area: Number(first(row, ['total_area', 'building_area', 'area'], '0')) || 0,
      floors: Number(first(row, ['number_floors', 'pavimentos'], '0')) || 0,
      height: cleanLabel(first(row, ['height'], '')), payload: safeBuildingPayload(row), snapshotComplete: true
    });
  }
  const currentProcessSnapshots = new Map<string, Record<string, unknown>>();
  for (const process of currentStates) {
    const raw = processRows.find((row) => localProcessId(row.__source || 'process', String(first(row, ['id', 'solicitacao_id', 'projeto_tecnico_id'], ''))) === process.id);
    currentProcessSnapshots.set(process.id, {
      id: process.id, buildingId: process.buildingId, protocol: process.protocol, type: process.type,
      status: process.status, stage: process.stage,
      updatedAt: String(first(raw, ['updated_at', 'data_atualizacao', 'created_at'], now)),
      payload: JSON.parse(process.payload)
    });
  }
  const parseStoredObject = (value: string | null | undefined) => {
    try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}; }
    catch { return {}; }
  };
  const oldBuildingSnapshot = (row: any): Record<string, unknown> | undefined => {
    if (!row) return undefined;
    const storedPayload = parseStoredObject(row.payload);
    const snapshotComplete = Object.keys(storedPayload).length > 0;
    return {
      id: row.id, reference: cleanLabel(row.reference), municipality: cleanLabel(row.municipality), address: cleanLabel(row.address),
      area: row.area, floors: row.floors, height: cleanLabel(row.height), payload: storedPayload, snapshotComplete,
      ...(!snapshotComplete ? { snapshotNote: 'O snapshot bruto da edificação não era persistido nesta versão; somente os campos estruturados disponíveis foram recuperados.' } : {})
    };
  };
  const newSnapshot = (building: Record<string, unknown> | undefined, process: Record<string, unknown> | null) => ({
    building: building || { snapshotComplete: false, snapshotNote: 'A edificação ainda não existia no snapshot anterior conhecido pelo painel.' }, process
  });
  const changedFields = (before: ProcessWebhookPayload['before'], after: ProcessWebhookPayload['after']) => {
    const flatten = (prefix: string, value: unknown, output: Record<string, unknown>) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [key, nested] of Object.entries(value as Record<string, unknown>)) flatten(prefix ? `${prefix}.${key}` : key, nested, output);
      } else output[prefix] = value;
    };
    const oldFields: Record<string, unknown> = {}; const newFields: Record<string, unknown> = {};
    flatten('', before, oldFields);
    flatten('', after, newFields);
    return [...new Set([...Object.keys(oldFields), ...Object.keys(newFields)])]
      .filter((field) => JSON.stringify(oldFields[field]) !== JSON.stringify(newFields[field]))
      .map((field) => ({ field, before: oldFields[field] ?? null, after: newFields[field] ?? null }));
  };
  const upsertBuilding = db.prepare(`INSERT INTO buildings
    (id, user_id, source_connection_id, remote_id, reference, municipality, address, area, floors, height, payload, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET reference=excluded.reference, municipality=excluded.municipality,
      address=excluded.address, area=excluded.area, floors=excluded.floors, height=excluded.height,
      payload=excluded.payload, updated_at=excluded.updated_at, source_connection_id=excluded.source_connection_id, remote_id=excluded.remote_id`);
  const upsertProcess = db.prepare(`INSERT INTO processes
    (id, user_id, source_connection_id, remote_id, building_id, protocol, type, status, stage, notified_by, updated_at, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET building_id=excluded.building_id, protocol=excluded.protocol,
      type=excluded.type, status=excluded.status, stage=excluded.stage, updated_at=excluded.updated_at,
      notified_by=excluded.notified_by, payload=excluded.payload, source_connection_id=excluded.source_connection_id, remote_id=excluded.remote_id`);
  const sync = db.transaction(() => {
    if (connection) {
      if (selectedLocalBuildingIds.length) {
        db.prepare(`DELETE FROM processes WHERE user_id=? AND source_connection_id=? AND building_id IN (${selectedIdSql})`)
          .run(userId, connection.id, ...selectedLocalBuildingIds);
      }
    } else {
      db.prepare('DELETE FROM processes WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM buildings WHERE user_id = ?').run(userId);
    }
    for (const building of buildingRows) {
      const remoteId = String(first(building, ['id', 'edificacao_id'], ''));
      const id = localBuildingIds.get(remoteId) || '';
      if (!remoteId || !id) continue;
      upsertBuilding.run(...([id, userId, connection?.id || null, connection ? remoteId : null,
        String(first(building, ['reference_name', 'nome', 'name', 'razao_social', 'nome_fantasia'], `Edificação ${id}`)),
        String(first(building, ['address.county', 'county', 'municipio.nome', 'municipality', 'cidade'], '')),
        String(first(building, ['address.public_place', 'address.logradouro', 'logradouro'], '')),
        String(Number(first(building, ['total_area', 'building_area', 'area'], '0')) || 0),
        String(Number(first(building, ['number_floors', 'pavimentos'], '0')) || 0),
        String(first(building, ['height'], '')), JSON.stringify(safeBuildingPayload(building)), now] as any[]));
    }
    for (const process of processRows) {
      const remoteBuildingId = processBuildingId(process);
      const buildingId = localBuildingIds.get(remoteBuildingId) || '';
      const remoteId = String(first(process, ['id', 'solicitacao_id', 'projeto_tecnico_id'], ''));
      const id = remoteId ? localProcessId(process.__source || 'process', remoteId) : '';
      if (!id || !buildingIds.has(remoteBuildingId)) continue;
      upsertProcess.run(id, userId, connection?.id || null, connection ? remoteId : null, buildingId, processProtocol(process),
        `${process.__source === 'request' ? 'Solicitação' : 'Projeto técnico'}${first(process, ['tipo_solicitacao_display', 'tipo_solicitacao', 'sigla'], '') ? ` · ${first(process, ['tipo_solicitacao_display', 'tipo_solicitacao', 'sigla'], '')}` : ''}`,
        processStatus(process), String(first(process, ['etapa_atual', 'fase', 'stage'], processStatus(process))),
        process.__source === 'request' ? cleanLabel(first(process, ['notificado_por', 'previous_request_notificado_por'], '')) : '',
        String(first(process, ['updated_at', 'data_atualizacao', 'created_at'], now)), JSON.stringify(safeProcessPayload(process)));
    }
    const insertNotification = db.prepare('INSERT OR IGNORE INTO notifications (user_id, building_id, process_id, dedupe_key, title, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const change of changes) {
      const source = currentStates.find((item) => item.id === change.processId);
      const protocolKey = source?.protocol.trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, '');
      const dedupeKey = protocolKey && protocolKey !== '—' && protocolKey !== '-'
        ? `${change.buildingId}:${protocolKey}` : `${change.buildingId}:${change.processId}`;
      const inserted = insertNotification.run(userId, change.buildingId, change.processId, dedupeKey, change.title, change.message, now);
      // The SQLite insert is the idempotency gate: only the sync that creates a
      // notification event is allowed to trigger its webhook delivery.
      if (inserted.changes) enqueuePushDelivery(connection?.owner_user_id || userId, Number(inserted.lastInsertRowid), now);
      if (inserted.changes && webhookUrl && source) {
        const currentProcess = currentProcessSnapshots.get(change.processId);
        if (!currentProcess) continue;
        const oldRow = previousProcesses.find((item) => item.id === change.processId);
        const oldProcess = oldRow ? {
          id: oldRow.id, buildingId: oldRow.building_id, protocol: oldRow.protocol, type: oldRow.type,
          status: oldRow.status, stage: oldRow.stage, updatedAt: oldRow.updated_at,
          payload: parseStoredObject(oldRow.payload)
        } : null;
        const oldBuildingRow = previousBuildings.get(oldRow?.building_id || change.buildingId);
        const before = newSnapshot(oldBuildingSnapshot(oldBuildingRow), oldProcess);
        const after = newSnapshot(currentBuildingSnapshots.get(change.buildingId), currentProcess) as ProcessWebhookPayload['after'];
        webhookEvents.push({
          ...(connection ? { sourceAccount: { id: connection.id, label: connection.label } } : {}),
          before, after,
          changes: {
            eventId: randomUUID(), event: oldProcess ? 'process.updated' : 'process.created',
            title: change.title, message: change.message, occurredAt: now,
            fields: changedFields(before, after)
          }
        });
      }
    }
    db.prepare('UPDATE users SET fenix_user_id = ?, last_sync = ? WHERE id = ?').run(fenixUserId, now, userId);
  });
  sync();
  db.prepare(`UPDATE users SET session_ciphertext = ? WHERE id = ?`).run(seal(JSON.stringify(jar.serializeSync())), userId);
  if (connection) db.prepare("UPDATE fenix_connections SET status='active', updated_at=? WHERE id=?").run(now, connection.id);
  if (webhookUrl) {
    for (const event of webhookEvents) {
      void addProcessDocumentsToWebhook(userId, event)
        .then((enrichedEvent) => deliverWebhookLogged(connection?.owner_user_id || userId, webhookUrl, enrichedEvent, process.env.NODE_ENV === 'production', 'automatic', undefined, connection?.id || null))
        .catch((error) => {
          const status = error instanceof Error && /^Webhook retornou HTTP \d+\.$/.test(error.message)
            ? error.message.replace(/\D/g, '') : 'falha de rede ou validação';
          console.warn(`Entrega do webhook de notificações falhou (${status}).`);
        });
    }
  }
  return { buildings: buildingRows.length, processes: processRows.length, changes: changes.length, completedAt: now };
}

export function newLocalId() { return randomUUID(); }
export function newSessionId() { return randomBytes(32).toString('base64url'); }
export function saveCookieJar(jar: CookieJar) { return seal(JSON.stringify(jar.serializeSync())); }

export function inspectFenixSessionCookie(sessionCiphertext: string | null): { expired: boolean; expiresAt: string | null } {
  if (!sessionCiphertext) return { expired: true, expiresAt: null };
  try {
    const raw = JSON.parse(unseal(sessionCiphertext));
    const jar = CookieJar.deserializeSync(raw);
    const cookies = jar.getCookiesSync(FENIX_ORIGIN);
    const sessionCookie = cookies.find((item) => {
      const key = item.key.toLowerCase();
      return key.includes('fenix_cbmba_session') || key.includes('cookiesession1') || key.includes('session');
    }) || cookies.find((item) => item.key.toLowerCase().includes('xsrf'));

    if (!sessionCookie) {
      return { expired: cookies.length === 0, expiresAt: null };
    }

    if (sessionCookie.expires && sessionCookie.expires !== 'Infinity') {
      const expDate = sessionCookie.expires instanceof Date ? sessionCookie.expires : new Date(sessionCookie.expires);
      if (Number.isFinite(expDate.getTime())) {
        const expiresAt = expDate.toISOString();
        const expired = expDate.getTime() <= Date.now();
        return { expired, expiresAt };
      }
    }
    return { expired: false, expiresAt: null };
  } catch {
    return { expired: true, expiresAt: null };
  }
}

export async function lookupFenixCnae(
  userId: string,
  rawCode: string
): Promise<{ cnae: string; atividade_economica: string; risk: number; division_group_id?: number; occupation_group_id?: number }> {
  const clean = rawCode.replace(/\D/g, '');
  if (!clean || clean.length < 5) {
    throw new FenixError('Código CNAE inválido.', 400);
  }

  const user = db.prepare('SELECT demo, session_ciphertext FROM users WHERE id = ?').get(userId) as
    | { demo: number; session_ciphertext: string | null }
    | undefined;
  if (!user) throw new FenixError('Usuário não encontrado.', 404);

  if (user.demo || !user.session_ciphertext) {
    if (clean === '4754701') {
      return { cnae: '4754701', atividade_economica: 'Comércio varejista de móveis', risk: 300, division_group_id: 6, occupation_group_id: 3 };
    }
    if (clean === '1091102') {
      return { cnae: '1091102', atividade_economica: 'Fabricação de produtos de padaria e confeitaria', risk: 300, division_group_id: 1, occupation_group_id: 1 };
    }
    if (clean === '4731800') {
      return { cnae: '4731800', atividade_economica: 'Comércio varejista de combustíveis para veículos automotores', risk: 800, division_group_id: 20, occupation_group_id: 7 };
    }
    return { cnae: clean, atividade_economica: 'Atividade comercial e serviços', risk: 300 };
  }

  const client = await fenixClientForUser(userId);
  const result = (await client.get('/api/v1/cnaes', { categoria: 'codigo', codigo: clean })) as any;
  const list = Array.isArray(result) ? result : Array.isArray(result?.data) ? result.data : [];
  if (list.length === 0) {
    throw new FenixError(`CNAE ${clean} não encontrado na base do Fênix.`, 404);
  }
  const item = list[0];
  return {
    cnae: String(item.codigo || clean),
    atividade_economica: String(item.descricao || ''),
    risk: Number(item.risco) || 300,
    division_group_id: item.division?.id,
    occupation_group_id: item.division?.group_occupation_id
  };
}

export async function submitFenixTechnicalProject(
  userId: string,
  payload: Record<string, unknown>
): Promise<{ id: number; num_projeto: string; edificacao_id?: number; solicitacao_id?: number }> {
  const user = db.prepare('SELECT demo, session_ciphertext FROM users WHERE id = ?').get(userId) as
    | { demo: number; session_ciphertext: string | null }
    | undefined;
  if (!user) throw new FenixError('Usuário não encontrado.', 404);

  if (user.demo) {
    const fakeId = Math.floor(80000 + Math.random() * 19000);
    const fakeZip = (payload.address as any)?.zip_code || '45355000';
    return {
      id: fakeId,
      num_projeto: `020863/${fakeZip}/2026`,
      edificacao_id: Math.floor(90000 + Math.random() * 10000),
      solicitacao_id: Math.floor(190000 + Math.random() * 10000)
    };
  }

  const client = await fenixClientForUser(userId);
  const result = (await client.post('/api/v1/technicalproject', payload)) as any;
  const data = result?.data ?? result;
  if (!data || !data.id) {
    throw new FenixError(result?.message || 'Falha ao cadastrar Projeto Técnico no Fênix.', 502);
  }
  return {
    id: Number(data.id),
    num_projeto: String(data.num_projeto || ''),
    edificacao_id: data.edificacao_id ? Number(data.edificacao_id) : undefined,
    solicitacao_id: data.solicitacao_id ? Number(data.solicitacao_id) : undefined
  };
}

