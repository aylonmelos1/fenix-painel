import { randomUUID, randomBytes } from 'node:crypto';
import { CookieJar } from 'tough-cookie';
import { db, seal, unseal } from './store.js';
import { detectProcessChanges, type ProcessSyncState } from './sync-changes.js';

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

export class FenixError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

async function fetchBounded(url: URL, init: RequestInit, limit = 1_000_000) {
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
    if (!result.response.ok) throw new FenixError(`Consulta ao Fênix retornou HTTP ${result.response.status}.`, result.response.status);
    return result.body;
  }
}

type TechnicalProjectEvent = { label: string; date?: string; done?: boolean; current?: boolean };
type TechnicalProjectProfile = { address: string; use: string; totalArea: number | null; buildingArea: number | null; areaToBeBuilt: number | null; floors: number | null; height: string };
const projectDetailsCache = new Map<string, { expiresAt: number; requestId: string; timeline: TechnicalProjectEvent[]; profile: TechnicalProjectProfile }>();
type TechnicalCertificateInfo = { filename: string; size: number };
const certificateInfoCache = new Map<string, { expiresAt: number; info: TechnicalCertificateInfo | null }>();

async function fenixClientForUser(userId: string) {
  const user = db.prepare('SELECT session_ciphertext FROM users WHERE id = ? AND demo = 0').get(userId) as { session_ciphertext: string | null } | undefined;
  if (!user?.session_ciphertext) throw new FenixError('Sessão Fênix não encontrada.');
  return new FenixClient(CookieJar.deserializeSync(JSON.parse(unseal(user.session_ciphertext))));
}

async function technicalProjectDetails(userId: string, projectId: string) {
  const cacheKey = `${userId}:${projectId}`;
  const cached = projectDetailsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached;
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
    height: cleanLabel(first(detail, ['edification.height', 'height'], ''))
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
      available: typeof row.url_dae === 'string' && Boolean(row.url_dae) && delivery?.mode !== 'manual'
    };
  }).filter((item: TechnicalProjectDae) => item.id);
}

export async function getTechnicalProjectDaes(userId: string, projectId: string): Promise<TechnicalProjectDae[]> {
  return technicalProjectDaes(userId, projectId);
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
    : { name: cleanLabel(first(doc, ['name', 'nome', 'filename', 'arquivo'], 'Documento')), type: cleanLabel(first(doc, ['tipo_documento.nome', 'tipo', 'type'], 'Anexo')), date: String(first(doc, ['created_at', 'data', 'data_envio'], '')) });
  const rawTimeline = first(process, ['timeline', 'historico', 'movimentacoes', 'history'], []);
  const timeline = (Array.isArray(rawTimeline) ? rawTimeline : []).map((step: any) => ({
    label: cleanLabel(first(step, ['label', 'etapa', 'descricao', 'status'], 'Movimentação')),
    date: String(first(step, ['date', 'data', 'created_at'], '')),
    done: Boolean(first(step, ['done', 'concluido'], false)),
    current: Boolean(first(step, ['current', 'atual'], false))
  }));
  return { documents, timeline };
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
  const jar = CookieJar.deserializeSync(JSON.parse(unseal(user.session_ciphertext)));
  const client = new FenixClient(jar);
  const requester = await client.get('/api/v1/detailsRequester') as any;
  const fenixUserId = String(first(requester, ['user.id', 'data.user.id', 'id'], user.fenix_user_id));
  const buildingRows = await allRecords(client, `/api/v1/usuarios/${encodeURIComponent(fenixUserId)}/edifications`, {});
  const requestRows = await allRecords(client, '/api/v1/request', { tipo_lista: 'minhas_solicitacoes' });
  const projectRows = await allRecords(client, '/api/v1/technicalproject', {});
  const buildingIds = new Set(buildingRows.map((item) => String(first(item, ['id', 'edificacao_id'], ''))).filter(Boolean));
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
  const previousProcesses = db.prepare('SELECT id, building_id, protocol, type, status, stage, payload FROM processes WHERE user_id = ?').all(userId) as Array<{ id: string; building_id: string; protocol: string; type: string; status: string; stage: string; payload: string }>;
  const buildingNames = new Map(buildingRows.map((building) => [String(first(building, ['id', 'edificacao_id'], '')), cleanLabel(first(building, ['reference_name', 'nome', 'name', 'razao_social', 'nome_fantasia'], 'Edificação'))]));
  const currentStates: ProcessSyncState[] = [];
  for (const process of processRows) {
    const buildingId = processBuildingId(process);
    const rawId = String(first(process, ['id', 'solicitacao_id', 'projeto_tecnico_id'], ''));
    const id = rawId ? `${process.__source || 'process'}:${rawId}` : '';
    if (!id || !buildingIds.has(buildingId)) continue;
    const status = cleanLabel(processStatus(process));
    const stage = cleanLabel(String(first(process, ['etapa_atual', 'fase', 'stage'], status)));
    const protocol = cleanLabel(processProtocol(process));
    currentStates.push({
      id, buildingId, buildingReference: buildingNames.get(buildingId) || 'Edificação acompanhada', protocol,
      type: cleanLabel(`${process.__source === 'request' ? 'Solicitação' : 'Projeto técnico'}${first(process, ['tipo_solicitacao_display', 'tipo_solicitacao', 'sigla'], '') ? ` · ${first(process, ['tipo_solicitacao_display', 'tipo_solicitacao', 'sigla'], '')}` : ''}`),
      status, stage, payload: JSON.stringify(safeProcessPayload(process))
    });
  }
  const previousStates: ProcessSyncState[] = previousProcesses.map((item) => ({
    id: item.id, buildingId: item.building_id,
    buildingReference: buildingNames.get(item.building_id) || 'Edificação acompanhada',
    protocol: item.protocol, type: item.type, status: item.status, stage: item.stage, payload: item.payload
  }));
  const changes = hadPriorSync ? detectProcessChanges(previousStates, currentStates) : [];
  const now = new Date().toISOString();
  const upsertBuilding = db.prepare(`INSERT INTO buildings
    (id, user_id, reference, municipality, address, area, floors, height, payload, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET reference=excluded.reference, municipality=excluded.municipality,
      address=excluded.address, area=excluded.area, floors=excluded.floors, height=excluded.height,
      payload=excluded.payload, updated_at=excluded.updated_at`);
  const upsertProcess = db.prepare(`INSERT INTO processes
    (id, user_id, building_id, protocol, type, status, stage, updated_at, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET building_id=excluded.building_id, protocol=excluded.protocol,
      type=excluded.type, status=excluded.status, stage=excluded.stage, updated_at=excluded.updated_at,
      payload=excluded.payload`);
  const sync = db.transaction(() => {
    db.prepare('DELETE FROM processes WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM buildings WHERE user_id = ?').run(userId);
    for (const building of buildingRows) {
      const id = String(first(building, ['id', 'edificacao_id'], ''));
      if (!id) continue;
      upsertBuilding.run(...([id, userId,
        String(first(building, ['reference_name', 'nome', 'name', 'razao_social', 'nome_fantasia'], `Edificação ${id}`)),
        String(first(building, ['address.county', 'county', 'municipio.nome', 'municipality', 'cidade'], '')),
        String(first(building, ['address.public_place', 'address.logradouro', 'logradouro'], '')),
        String(Number(first(building, ['total_area', 'building_area', 'area'], '0')) || 0),
        String(Number(first(building, ['number_floors', 'pavimentos'], '0')) || 0),
        String(first(building, ['height'], '')), '{}', now] as any[]));
    }
    for (const process of processRows) {
      const buildingId = processBuildingId(process);
      const rawId = String(first(process, ['id', 'solicitacao_id', 'projeto_tecnico_id'], ''));
      const id = rawId ? `${process.__source || 'process'}:${rawId}` : '';
      if (!id || !buildingIds.has(buildingId)) continue;
      upsertProcess.run(id, userId, buildingId, processProtocol(process),
        `${process.__source === 'request' ? 'Solicitação' : 'Projeto técnico'}${first(process, ['tipo_solicitacao_display', 'tipo_solicitacao', 'sigla'], '') ? ` · ${first(process, ['tipo_solicitacao_display', 'tipo_solicitacao', 'sigla'], '')}` : ''}`,
        processStatus(process), String(first(process, ['etapa_atual', 'fase', 'stage'], processStatus(process))),
        String(first(process, ['updated_at', 'data_atualizacao', 'created_at'], now)), JSON.stringify(safeProcessPayload(process)));
    }
    const insertNotification = db.prepare('INSERT INTO notifications (user_id, building_id, process_id, title, message, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    for (const change of changes) insertNotification.run(userId, change.buildingId, change.processId, change.title, change.message, now);
    db.prepare('UPDATE users SET fenix_user_id = ?, last_sync = ? WHERE id = ?').run(fenixUserId, now, userId);
  });
  sync();
  db.prepare(`UPDATE users SET session_ciphertext = ? WHERE id = ?`).run(seal(JSON.stringify(jar.serializeSync())), userId);
  return { buildings: buildingRows.length, processes: processRows.length, changes: changes.length, completedAt: now };
}

export function newLocalId() { return randomUUID(); }
export function newSessionId() { return randomBytes(32).toString('base64url'); }
export function saveCookieJar(jar: CookieJar) { return seal(JSON.stringify(jar.serializeSync())); }
