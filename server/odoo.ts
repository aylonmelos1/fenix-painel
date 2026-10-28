import { createHash } from 'node:crypto';
import { getSetting, setSetting } from './store.js';
import { buildOdooDocumentNote, type OdooDocumentNoteContext } from './odoo-document-note.js';
import { buildOdooInternalNoteBody, isDisplayableOdooMessage, odooHtmlToPlainText } from './odoo-message.js';
import { OdooRequestQueue, OdooRequestQueueFullError } from './odoo-request-queue.js';

type OdooRelation = false | number | [number, string] | number[];
type OdooRecord = Record<string, unknown> & { id: number };

export class OdooApiError extends Error {
  constructor(message: string, readonly httpStatus = 502) {
    super(message);
    this.name = 'OdooApiError';
  }
}

export type OdooConfiguration = { url: string; database: string; apiKey: string };
export type OdooUploadFile = { name: string; mimetype: string; content: Buffer };
const ODOO_CONFIGURATION_SETTING = 'odoo_integration';
// Shared across all users in this server process: max one outbound request per second, no overlap.
const odooRequestQueue = new OdooRequestQueue({ minIntervalMs: 1000, maxPending: 32 });

export type OdooProjectSnapshot = {
  project: {
    id: number;
    name: string;
    description: string;
    customer: OdooRelation;
    manager: OdooRelation;
    stage: OdooRelation;
    startDate: string | false;
    endDate: string | false;
    taskCount: number;
    openTaskCount: number;
    createdAt: string | false;
    updatedAt: string | false;
  };
  tasks: Array<{ id: number; name: string; stage: OdooRelation; assignees: OdooRelation; deadline: string | false; priority: string }>;
  messages: Array<{ id: number; date: string | false; author: OdooRelation; body: string; type: string; subtype: OdooRelation; subject: string | false; attachmentIds: number[] }>;
  attachments: Array<{ id: number; name: string; mimetype: string; fileSize: number; createdAt: string | false }>;
  activities: Array<{ id: number; type: OdooRelation; summary: string; note: string; deadline: string | false; assignee: OdooRelation; state: string }>;
  activityTypes: Array<{ id: number; name: string; category: string }>;
};

export type OdooProjectSuggestion = {
  id: number;
  name: string;
  customer: OdooRelation;
  stage: OdooRelation;
  taskCount: number;
  openTaskCount: number;
  matchScore: number;
};

function storedOdooConfiguration(): OdooConfiguration | null {
  try {
    const raw = getSetting(ODOO_CONFIGURATION_SETTING);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.url !== 'string' || typeof parsed?.apiKey !== 'string') return null;
    return { url: parsed.url, database: typeof parsed.database === 'string' ? parsed.database : '', apiKey: parsed.apiKey };
  } catch { return null; }
}

function odooBaseUrl(config = storedOdooConfiguration()) {
  const raw = (config?.url || '').trim();
  if (!raw || !config?.apiKey.trim()) return null;
  let base: URL;
  try { base = new URL(raw); }
  catch { return null; }
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(base.hostname);
  if ((!local && base.protocol !== 'https:') || (local && !['https:', 'http:'].includes(base.protocol)) || base.username || base.password || base.search || base.hash) return null;
  let path = base.pathname.replace(/\/+$/, '').replace(/\/json\/2$/i, '');
  return `${base.origin}${path}/json/2`;
}

export function isOdooConfigured() {
  return Boolean(odooBaseUrl());
}

export function getOdooSettingsStatus() {
  const config = storedOdooConfiguration();
  return {
    configured: Boolean(odooBaseUrl(config)),
    apiKeyConfigured: Boolean(config?.apiKey.trim()),
    url: config?.url || '',
    database: config?.database || ''
  };
}

export function normalizeOdooUrl(value: unknown) {
  if (typeof value !== 'string' || value.trim().length > 2048) throw new OdooApiError('Informe uma URL base válida para a Odoo.', 400);
  const raw = value.trim().replace(/\/+$/, '');
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new OdooApiError('Informe uma URL base válida para a Odoo.', 400); }
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  if ((!local && url.protocol !== 'https:') || (local && !['https:', 'http:'].includes(url.protocol)) || url.username || url.password || url.search || url.hash) {
    throw new OdooApiError('Use uma URL HTTPS da Odoo, sem usuário, senha, consulta ou fragmento.', 400);
  }
  let pathname = url.pathname.replace(/\/+$/, '').replace(/\/json\/2$/i, '');
  return `${url.origin}${pathname}`;
}

export function saveOdooConfiguration(config: OdooConfiguration) {
  setSetting(ODOO_CONFIGURATION_SETTING, JSON.stringify(config));
}

export function prepareOdooConfiguration(input: { url: unknown; database?: unknown; apiKey?: unknown }): OdooConfiguration {
  const existing = storedOdooConfiguration();
  const url = normalizeOdooUrl(input.url);
  const database = typeof input.database === 'string' ? input.database.trim() : '';
  const suppliedKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  if (database.length > 150 || /[\r\n]/.test(database)) throw new OdooApiError('O nome do banco Odoo é inválido.', 400);
  if (suppliedKey.length > 4096 || /[\r\n]/.test(suppliedKey)) throw new OdooApiError('A chave da API Odoo é inválida.', 400);
  const apiKey = suppliedKey || existing?.apiKey || '';
  if (!apiKey) throw new OdooApiError('Informe a chave da API JSON-2 da Odoo.', 400);
  return { url, database, apiKey };
}

async function callOdoo<T>(model: string, method: string, payload: Record<string, unknown> = {}, override?: OdooConfiguration): Promise<T> {
  const config = override || storedOdooConfiguration();
  const baseUrl = odooBaseUrl(config);
  const apiKey = config?.apiKey.trim();
  if (!baseUrl || !apiKey) throw new OdooApiError('Configure a URL e a chave da API Odoo em Configurações.', 503);
  const endpoint = `${baseUrl}/${encodeURIComponent(model)}/${encodeURIComponent(method)}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json; charset=utf-8',
    'User-Agent': 'Fenix-Painel/1.0'
  };
  const database = config?.database.trim() ?? '';
  if (database) headers['X-Odoo-Database'] = database;

  try {
    return await odooRequestQueue.enqueue(async () => {
      let response: Response;
      try {
        response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(25_000) });
      } catch (error) {
        const timeout = error instanceof Error && error.name === 'TimeoutError';
        throw new OdooApiError(timeout ? 'A Odoo demorou para responder. Tente novamente.' : 'Não foi possível conectar à Odoo.', 502);
      }
      if (!response.ok) {
        const status = response.status;
        if (status === 429) {
          const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
          odooRequestQueue.deferFor(retryAfter ?? 60_000);
          throw new OdooApiError('A Odoo limitou as consultas. Aguarde um pouco e tente novamente.', 503);
        }
        if (status === 503) {
          const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
          if (retryAfter !== null) odooRequestQueue.deferFor(retryAfter);
          throw new OdooApiError('A Odoo está temporariamente indisponível. Tente novamente em instantes.', 503);
        }
        if (status === 401 || status === 403) throw new OdooApiError('A Odoo recusou o acesso. Verifique as permissões da chave de integração.', 502);
        if (status === 404) throw new OdooApiError('O recurso solicitado não foi encontrado na Odoo.', 404);
        throw new OdooApiError('A Odoo não concluiu a operação. Verifique a configuração e tente novamente.', 502);
      }
      try { return await response.json() as T; }
      catch { throw new OdooApiError('A Odoo retornou uma resposta inválida.', 502); }
    });
  } catch (error) {
    if (error instanceof OdooRequestQueueFullError) {
      throw new OdooApiError('A integração Odoo está ocupada. Aguarde alguns segundos e tente novamente.', 503);
    }
    throw error;
  }
}

function parseRetryAfter(value: string | null) {
  if (!value || value.length > 128) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const retryAt = Date.parse(value);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - Date.now()) : null;
}

export async function verifyOdooConfiguration(config: OdooConfiguration) {
  if (!odooBaseUrl(config)) throw new OdooApiError('Confira a URL HTTPS e a chave da API Odoo.', 400);
  const context = await callOdoo<{ uid?: unknown }>('res.users', 'context_get', {}, config);
  const uid = Number(context?.uid);
  if (!Number.isSafeInteger(uid) || uid < 1) throw new OdooApiError('A Odoo não identificou o usuário desta chave de integração.', 502);
  return { ok: true };
}

function relation(value: unknown): OdooRelation {
  if (value === false || value === null || value === undefined) return false;
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) return value as OdooRelation;
  return false;
}

function firstRecordId(value: unknown) {
  const candidate = Array.isArray(value) ? value[0] : value;
  const rawId = candidate && typeof candidate === 'object' ? (candidate as { id?: unknown }).id : candidate;
  const id = typeof rawId === 'number' ? rawId : Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) throw new OdooApiError('A Odoo não retornou o identificador do registro criado.', 502);
  return id;
}

async function createOdooRecord(model: string, values: Record<string, unknown>) {
  const result = await callOdoo<unknown>(model, 'create', { vals_list: [values] });
  return firstRecordId(result);
}

async function searchRead(model: string, domain: unknown[], fields: string[], limit: number, order?: string) {
  return callOdoo<OdooRecord[]>(model, 'search_read', { domain, fields, limit, ...(order ? { order } : {}) });
}

function matchTokens(value: string) {
  const legalSuffixes = new Set(['ltda', 'limitada', 'eireli', 'mei', 'me', 'epp', 'sa', 's', 'cia']);
  return [...new Set(value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
    .split(/[^a-z0-9]+/).filter((token) => token.length >= 3 && !legalSuffixes.has(token)))];
}

function nameSimilarity(target: string[], candidate: string) {
  const candidateTokens = matchTokens(candidate);
  if (!target.length || !candidateTokens.length) return 0;
  const shared = target.filter((token) => candidateTokens.includes(token)).length;
  const coverage = shared / target.length;
  const precision = shared / candidateTokens.length;
  return Math.round((coverage * 0.72 + precision * 0.28) * 100);
}

export async function findOdooProjectSuggestions(clientName: string): Promise<OdooProjectSuggestion[]> {
  const targetTokens = matchTokens(clientName);
  if (!targetTokens.length) return [];
  const queryTokens = [...targetTokens].sort((a, b) => b.length - a.length).slice(0, 6);
  const leaves = queryTokens.flatMap((token) => [
    ['partner_id.name', 'ilike', token],
    ['name', 'ilike', token]
  ]);
  const domain = [
    ['active', '=', true],
    ...(leaves.length > 1 ? Array(leaves.length - 1).fill('|') : []),
    ...leaves
  ];
  const rows = await searchRead('project.project', domain, ['id', 'name', 'partner_id', 'stage_id', 'task_count', 'open_task_count', 'write_date'], 200, 'write_date desc, id desc');
  return rows.map((row) => {
    const customer = relation(row.partner_id);
    const customerName = Array.isArray(customer) ? String(customer[1] || '') : '';
    const customerScore = nameSimilarity(targetTokens, customerName);
    const projectScore = nameSimilarity(targetTokens, String(row.name || ''));
    const matchScore = Math.max(customerScore, Math.round(customerScore * 0.85 + projectScore * 0.15), Math.round(projectScore * 0.75));
    return {
      id: row.id,
      name: String(row.name || row.display_name || `Projeto ${row.id}`),
      customer,
      stage: relation(row.stage_id),
      taskCount: Number(row.task_count) || 0,
      openTaskCount: Number(row.open_task_count) || 0,
      matchScore
    };
  }).filter((project) => project.matchScore >= 20)
    .sort((a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, 30);
}

export async function searchOdooMentionPeople(query: string) {
  const term = query.trim().slice(0, 80);
  if (term.length < 2) return [];
  const users = await searchRead('res.users', [['active', '=', true], ['name', 'ilike', term]], ['id', 'name', 'partner_id'], 15, 'name asc');
  return users.map((user) => ({
    userId: user.id,
    partnerId: Array.isArray(user.partner_id) ? Number(user.partner_id[0]) : 0,
    name: String(user.name || '')
  })).filter((person) => person.partnerId > 0 && person.name);
}

export async function getOdooActivityAssignees() {
  const users = await searchRead('res.users', [['active', '=', true], ['share', '=', false]], ['id', 'name', 'partner_id'], 100, 'name asc');
  return users.map((user) => ({
    id: user.id,
    name: String(user.name || ''),
    partnerId: Array.isArray(user.partner_id) ? Number(user.partner_id[0]) : 0
  })).filter((user) => user.name && user.partnerId > 0);
}

export async function getOdooProject(projectId: number): Promise<OdooProjectSnapshot | null> {
  const projects = await callOdoo<OdooRecord[]>('project.project', 'read', {
    ids: [projectId],
    fields: ['id', 'name', 'description', 'partner_id', 'user_id', 'stage_id', 'date_start', 'date', 'task_count', 'open_task_count', 'create_date', 'write_date']
  });
  const project = projects?.[0];
  if (!project) return null;
  // JSON-2 has one model/method per HTTP request; callOdoo serializes these reads through the shared queue.
  const [tasks, messages, activities, activityTypes, projectAttachments] = await Promise.all([
    searchRead('project.task', [['project_id', '=', projectId]], ['id', 'name', 'stage_id', 'user_ids', 'date_deadline', 'priority'], 30, 'write_date desc, id desc'),
    searchRead('mail.message', [['model', '=', 'project.project'], ['res_id', '=', projectId]], ['id', 'date', 'author_id', 'body', 'message_type', 'subtype_id', 'subject', 'attachment_ids'], 30, 'date desc, id desc'),
    searchRead('mail.activity', [['res_model', '=', 'project.project'], ['res_id', '=', projectId]], ['id', 'activity_type_id', 'summary', 'note', 'date_deadline', 'user_id', 'state'], 30, 'date_deadline asc, id asc'),
    searchRead('mail.activity.type', [['active', '=', true], '|', ['res_model', '=', false], ['res_model', '=', 'project.project']], ['id', 'name', 'category'], 100, 'sequence asc, id asc'),
    searchRead('ir.attachment', [['res_model', '=', 'project.project'], ['res_id', '=', projectId]], ['id', 'name', 'mimetype', 'file_size', 'create_date'], 1000, 'create_date desc, id desc')
  ]);
  const projectAttachmentIds = new Set(projectAttachments.map((attachment) => attachment.id));
  const messageAttachmentIds = [...new Set(messages.flatMap((message) => Array.isArray(message.attachment_ids) ? message.attachment_ids.filter((id): id is number => typeof id === 'number') : []))];
  const messageOnlyAttachmentIds = messageAttachmentIds.filter((id) => !projectAttachmentIds.has(id));
  const messageAttachments = messageOnlyAttachmentIds.length
    ? await searchRead('ir.attachment', [['id', 'in', messageOnlyAttachmentIds]], ['id', 'name', 'mimetype', 'file_size', 'create_date'], messageOnlyAttachmentIds.length, 'create_date desc, id desc')
    : [];
  const attachmentsById = new Map([...projectAttachments, ...messageAttachments].map((attachment) => [attachment.id, attachment]));
  return {
    project: {
      id: project.id,
      name: String(project.name || project.display_name || `Projeto ${projectId}`),
      description: odooHtmlToPlainText(project.description),
      customer: relation(project.partner_id),
      manager: relation(project.user_id),
      stage: relation(project.stage_id),
      startDate: typeof project.date_start === 'string' ? project.date_start : false,
      endDate: typeof project.date === 'string' ? project.date : false,
      taskCount: Number(project.task_count) || 0,
      openTaskCount: Number(project.open_task_count) || 0,
      createdAt: typeof project.create_date === 'string' ? project.create_date : false,
      updatedAt: typeof project.write_date === 'string' ? project.write_date : false
    },
    tasks: tasks.map((task) => ({ id: task.id, name: String(task.name || ''), stage: relation(task.stage_id), assignees: relation(task.user_ids), deadline: typeof task.date_deadline === 'string' ? task.date_deadline : false, priority: String(task.priority || '0') })),
    messages: messages.map((message) => ({ id: message.id, date: typeof message.date === 'string' ? message.date : false as const, author: relation(message.author_id), body: odooHtmlToPlainText(message.body), type: String(message.message_type || ''), subtype: relation(message.subtype_id), subject: typeof message.subject === 'string' ? message.subject : false as const, attachmentIds: Array.isArray(message.attachment_ids) ? message.attachment_ids.filter((id): id is number => typeof id === 'number') : [] })).filter((message) => isDisplayableOdooMessage(message.body, message.attachmentIds)),
    attachments: [...attachmentsById.values()].map((attachment) => ({ id: attachment.id, name: String(attachment.name || `Arquivo ${attachment.id}`), mimetype: String(attachment.mimetype || 'application/octet-stream'), fileSize: Number(attachment.file_size) || 0, createdAt: typeof attachment.create_date === 'string' ? attachment.create_date : false })),
    activities: activities.filter((activity) => activity.state !== 'done').map((activity) => ({ id: activity.id, type: relation(activity.activity_type_id), summary: String(activity.summary || ''), note: odooHtmlToPlainText(activity.note), deadline: typeof activity.date_deadline === 'string' ? activity.date_deadline : false, assignee: relation(activity.user_id), state: String(activity.state || '') })),
    activityTypes: activityTypes.map((type) => ({ id: type.id, name: String(type.name || ''), category: String(type.category || '') }))
  };
}

async function getActiveProjectStages(companyId: number) {
  const domain: unknown[] = [['active', '=', true], ['company_id', 'in', companyId > 0 ? [false, companyId] : [false]]];
  return searchRead('project.project.stage', domain, ['id', 'name'], 100, 'sequence asc, id asc');
}

export async function getOdooProjectStages(projectId: number) {
  const projects = await callOdoo<OdooRecord[]>('project.project', 'read', {
    ids: [projectId], fields: ['id', 'company_id', 'stage_id']
  });
  const project = projects?.[0];
  if (!project) throw new OdooApiError(`O projeto ${projectId} não foi encontrado ou não está acessível para a integração.`, 404);
  const companyId = Array.isArray(project.company_id) ? Number(project.company_id[0]) : 0;
  const stages = await getActiveProjectStages(companyId);
  const options = stages.map((stage) => ({ id: stage.id, name: String(stage.name || '') })).filter((stage) => stage.name);
  const currentStage = relation(project.stage_id);
  if (Array.isArray(currentStage) && !options.some((stage) => stage.id === Number(currentStage[0]))) {
    options.unshift({ id: Number(currentStage[0]), name: String(currentStage[1] || '') });
  }
  return options;
}

export async function setOdooProjectStage(projectId: number, stageId: number) {
  const projects = await callOdoo<OdooRecord[]>('project.project', 'read', {
    ids: [projectId], fields: ['id', 'company_id']
  });
  const project = projects?.[0];
  if (!project) throw new OdooApiError(`O projeto ${projectId} não foi encontrado ou não está acessível para a integração.`, 404);
  const companyId = Array.isArray(project.company_id) ? Number(project.company_id[0]) : 0;
  const stages = await getActiveProjectStages(companyId);
  const stage = stages.find((item) => item.id === stageId);
  if (!stage) throw new OdooApiError('Esta etapa não está disponível para o projeto selecionado.', 400);
  await callOdoo<boolean>('project.project', 'write', { ids: [projectId], vals: { stage_id: stageId } });
  return { id: stage.id, name: String(stage.name || '') };
}

export async function odooProjectExists(projectId: number) {
  const projects = await callOdoo<Array<{ id: number }>>('project.project', 'read', { ids: [projectId], fields: ['id'] });
  return projects?.some((project) => project.id === projectId) || false;
}

async function createOdooAttachments(projectId: number, files: OdooUploadFile[]) {
  if (!files.length) return [];
  const valsList = files.map((file) => {
    const name = file.name.replace(/[\\/\x00-\x1f\x7f]/g, '_').trim().slice(0, 180) || 'Anexo';
    const mimetype = file.mimetype.trim().slice(0, 160) || 'application/octet-stream';
    return {
      name,
      type: 'binary',
      mimetype,
      datas: file.content.toString('base64'),
      res_model: 'project.project',
      res_id: projectId
    };
  });
  const created = await callOdoo<unknown>('ir.attachment', 'create', { vals_list: valsList });
  const ids = (Array.isArray(created) ? created : [created]).map(firstRecordId);
  if (ids.length !== files.length) throw new OdooApiError('A Odoo não confirmou todos os anexos enviados.', 502);
  return ids;
}

export async function createOdooInternalNote(projectId: number, body: string, requestId: string, authorPartnerId: number, requestedPartnerIds: number[] = [], files: OdooUploadFile[] = []) {
  const messageId = `<fenix-note-${requestId}@fenix-painel>`;
  const previous = await searchRead('mail.message', [['model', '=', 'project.project'], ['res_id', '=', projectId], ['message_id', '=', messageId]], ['id'], 1);
  if (previous[0]) return { id: previous[0].id, alreadyExists: true };
  if (!Number.isSafeInteger(authorPartnerId) || authorPartnerId < 1) throw new OdooApiError('Selecione um usuário interno ativo para assinar a nota.', 400);
  const uniquePartnerIds = [...new Set(requestedPartnerIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  const partnerIdsToLoad = [...new Set([authorPartnerId, ...uniquePartnerIds])];
  const users = await searchRead('res.users', [['active', '=', true], ['partner_id', 'in', partnerIdsToLoad]], ['name', 'partner_id', 'share'], Math.min(200, Math.max(10, partnerIdsToLoad.length * 5)));
  const authorUser = users.find((user) => Array.isArray(user.partner_id) && Number(user.partner_id[0]) === authorPartnerId && user.share === false);
  if (!authorUser) throw new OdooApiError('Selecione um usuário interno ativo para assinar a nota.', 400);
  const mentionedUsers = users.filter((user) => Array.isArray(user.partner_id) && uniquePartnerIds.includes(Number(user.partner_id[0])));
  const mentions = mentionedUsers.map((user) => ({
    partnerId: Array.isArray(user.partner_id) ? Number(user.partner_id[0]) : 0,
    name: String(user.name || '')
  })).filter((person) => person.partnerId > 0 && person.name);
  const note = buildOdooInternalNoteBody(body, mentions);
  const attachmentIds = await createOdooAttachments(projectId, files);
  const id = await callOdoo<unknown>('project.project', 'message_post', {
    ids: [projectId], body: note.body, body_is_html: true, message_type: 'comment', subtype_xmlid: 'mail.mt_note', message_id: messageId,
    author_id: authorPartnerId,
    ...(note.partnerIds.length ? { partner_ids: note.partnerIds } : {}),
    ...(attachmentIds.length ? { attachment_ids: attachmentIds } : {})
  });
  return { id: firstRecordId(id), alreadyExists: false };
}

export async function createOdooActivity(projectId: number, activityTypeId: number, assigneeId: number, summary: string, note: string, deadline: string, files: OdooUploadFile[] = []) {
  const [models, assignees] = await Promise.all([
    searchRead('ir.model', [['model', '=', 'project.project']], ['id'], 1),
    searchRead('res.users', [['id', '=', assigneeId], ['active', '=', true]], ['id'], 1)
  ]);
  const modelId = models[0]?.id;
  if (!modelId) throw new OdooApiError('O tipo de atividade não está disponível para este projeto na Odoo.', 502);
  if (!Number.isSafeInteger(assigneeId) || assigneeId < 1 || !assignees[0]) throw new OdooApiError('Selecione um usuário ativo para receber a atividade.', 400);
  const attachmentIds = await createOdooAttachments(projectId, files);
  const id = await createOdooRecord('mail.activity', {
    activity_type_id: activityTypeId,
    res_model_id: modelId,
    res_id: projectId,
    user_id: assigneeId,
    summary,
    ...(note ? { note } : {}),
    date_deadline: deadline,
    ...(attachmentIds.length ? { attachment_ids: [[6, 0, attachmentIds]] } : {})
  });
  return { id };
}

export async function updateOdooActivity(projectId: number, activityId: number, activityTypeId: number, assigneeId: number, summary: string, note: string, deadline: string, files: OdooUploadFile[] = []) {
  const activity = await searchRead('mail.activity', [['id', '=', activityId], ['res_model', '=', 'project.project'], ['res_id', '=', projectId], ['active', '=', true]], ['id'], 1);
  if (!activity[0]) throw new OdooApiError('A atividade não está mais planejada neste projeto.', 404);
  const [activityTypes, assignees] = await Promise.all([
    searchRead('mail.activity.type', [['id', '=', activityTypeId], ['active', '=', true], '|', ['res_model', '=', false], ['res_model', '=', 'project.project']], ['id'], 1),
    searchRead('res.users', [['id', '=', assigneeId], ['active', '=', true], ['share', '=', false]], ['id'], 1)
  ]);
  if (!activityTypes[0]) throw new OdooApiError('Selecione um tipo de atividade disponível para projetos.', 400);
  if (!assignees[0]) throw new OdooApiError('Selecione um usuário interno ativo para receber a atividade.', 400);
  const attachmentIds = await createOdooAttachments(projectId, files);
  const vals: Record<string, unknown> = { activity_type_id: activityTypeId, user_id: assigneeId, summary, note, date_deadline: deadline };
  if (attachmentIds.length) vals.attachment_ids = attachmentIds.map((id) => [4, id]);
  await callOdoo<boolean>('mail.activity', 'write', { ids: [activityId], vals });
  return { id: activityId };
}

export async function getOdooProjectAttachment(projectId: number, attachmentId: number) {
  const direct = await searchRead('ir.attachment', [['id', '=', attachmentId], ['res_model', '=', 'project.project'], ['res_id', '=', projectId]], ['id', 'name', 'mimetype', 'file_size'], 1);
  let attachment = direct[0];
  if (!attachment) {
    const messages = await searchRead('mail.message', [['model', '=', 'project.project'], ['res_id', '=', projectId], ['attachment_ids', 'in', [attachmentId]]], ['id'], 1);
    if (!messages[0]) throw new OdooApiError('O arquivo não pertence ao projeto Odoo vinculado.', 404);
    const linked = await searchRead('ir.attachment', [['id', '=', attachmentId]], ['id', 'name', 'mimetype', 'file_size'], 1);
    attachment = linked[0];
  }
  if (!attachment) throw new OdooApiError('Arquivo não encontrado na Odoo.', 404);
  const fileSize = Number(attachment.file_size) || 0;
  if (fileSize > 25 * 1024 * 1024) throw new OdooApiError('O arquivo excede o limite de 25 MB para visualização no Fênix.', 413);
  const records = await callOdoo<OdooRecord[]>('ir.attachment', 'read', { ids: [attachmentId], fields: ['id', 'name', 'mimetype', 'file_size', 'datas'] });
  const record = records?.[0];
  const encoded = typeof record?.datas === 'string' ? record.datas : '';
  if (!record || !encoded) throw new OdooApiError('A Odoo não retornou o conteúdo deste arquivo.', 404);
  const content = Buffer.from(encoded, 'base64');
  if (!content.length || content.length > 25 * 1024 * 1024) throw new OdooApiError('Não foi possível carregar o arquivo dentro do limite de 25 MB.', 413);
  return { id: attachmentId, name: String(record.name || attachment.name || `Arquivo ${attachmentId}`), mimetype: String(record.mimetype || attachment.mimetype || 'application/octet-stream'), content };
}

export async function getOdooProjectAttachmentPreviews(projectId: number, requestedIds: number[]) {
  const ids = [...new Set(requestedIds)].filter((id) => Number.isSafeInteger(id) && id > 0).slice(0, 24);
  if (!ids.length) return {};
  const imageTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']);
  const [candidates, messages] = await Promise.all([
    searchRead('ir.attachment', [['id', 'in', ids]], ['id', 'mimetype', 'file_size', 'res_model', 'res_id'], ids.length),
    searchRead('mail.message', [['model', '=', 'project.project'], ['res_id', '=', projectId], ['attachment_ids', 'in', ids]], ['attachment_ids'], 100)
  ]);
  const messageAttachmentIds = new Set(messages.flatMap((message) => Array.isArray(message.attachment_ids) ? message.attachment_ids.filter((id): id is number => typeof id === 'number') : []));
  let totalBytes = 0;
  const allowed = candidates.filter((attachment) => {
    const direct = attachment.res_model === 'project.project' && Number(attachment.res_id) === projectId;
    const inProjectChatter = messageAttachmentIds.has(attachment.id);
    const mimetype = String(attachment.mimetype || '').toLowerCase();
    const fileSize = Number(attachment.file_size) || 0;
    if ((!direct && !inProjectChatter) || !imageTypes.has(mimetype) || fileSize < 1 || fileSize > 2 * 1024 * 1024 || totalBytes + fileSize > 8 * 1024 * 1024) return false;
    totalBytes += fileSize;
    return true;
  });
  if (!allowed.length) return {};
  const records = await callOdoo<OdooRecord[]>('ir.attachment', 'read', { ids: allowed.map((attachment) => attachment.id), fields: ['id', 'mimetype', 'datas'] });
  return Object.fromEntries((records || []).flatMap((record) => {
    const id = Number(record.id);
    const mimetype = String(record.mimetype || '').toLowerCase();
    const datas = typeof record.datas === 'string' ? record.datas : '';
    return allowed.some((attachment) => attachment.id === id) && imageTypes.has(mimetype) && datas ? [[id, `data:${mimetype};base64,${datas}`]] : [];
  }));
}

export async function attachOdooDocument(projectId: number, file: { name: string; content: Buffer }, reference: string, context: OdooDocumentNoteContext) {
  if (!file.content.length || file.content.length > 12_000_000 || file.content.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new OdooApiError('O documento precisa ser um PDF válido de até 12 MB.', 400);
  }
  const checksum = createHash('sha1').update(file.content).digest('hex');
  const messageKey = createHash('sha256').update(`${projectId}:${reference}:${checksum}`).digest('hex').slice(0, 32);
  const messageId = `<fenix-doc-${messageKey}@fenix-painel>`;
  const previousMessage = await searchRead('mail.message', [['model', '=', 'project.project'], ['res_id', '=', projectId], ['message_id', '=', messageId]], ['id'], 1);
  if (previousMessage[0]) return { id: previousMessage[0].id, alreadyExists: true };

  const existingAttachments = await searchRead('ir.attachment', [['res_model', '=', 'project.project'], ['res_id', '=', projectId], ['checksum', '=', checksum]], ['id', 'name'], 1);
  const numericAttachmentId = existingAttachments[0]?.id || await createOdooRecord('ir.attachment', {
    name: file.name.slice(0, 180), type: 'binary', datas: file.content.toString('base64'), res_model: 'project.project', res_id: projectId
  });
  const note = buildOdooDocumentNote(context, file.name);
  const posted = await callOdoo<unknown>('project.project', 'message_post', {
    ids: [projectId], body: note, message_type: 'comment', subtype_xmlid: 'mail.mt_note',
    attachment_ids: [numericAttachmentId], message_id: messageId
  });
  return { id: firstRecordId(posted), alreadyExists: false };
}
