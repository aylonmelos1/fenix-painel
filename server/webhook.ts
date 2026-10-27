import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { randomUUID } from 'node:crypto';
import { db, getSetting, seal, unseal } from './store.js';

const WEBHOOK_SETTING = 'notifications_webhook_url';
const TIMEOUT_MS = 15_000;

function ipv4IsPublic(address: string) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts as [number, number, number, number];
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168) ) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}

function ipv6IsPublic(address: string) {
  const value = address.toLowerCase().split('%')[0] || '';
  if (value.startsWith('::ffff:')) {
    const mapped = value.slice('::ffff:'.length);
    if (isIP(mapped) === 4) return ipv4IsPublic(mapped);
  }
  // Only globally routable unicast space is accepted. This excludes loopback,
  // ULA, link-local, multicast, unspecified and IPv4-compatible ranges.
  return value.startsWith('2') || value.startsWith('3');
}

function publicAddress(address: string, family: number) {
  return family === 4 ? ipv4IsPublic(address) : family === 6 && ipv6IsPublic(address);
}

async function resolvePublicAddress(hostname: string) {
  const literalFamily = isIP(hostname);
  const records = literalFamily ? [{ address: hostname, family: literalFamily }] : await lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => !publicAddress(record.address, record.family))) {
    throw new Error('A URL do webhook precisa apontar para um endereço público.');
  }
  return records[0]!;
}

export async function validateWebhookUrl(value: string, production: boolean) {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error('Informe uma URL válida para o webhook.'); }
  if (!['https:', 'http:'].includes(url.protocol) || (production && url.protocol !== 'https:')) {
    throw new Error(production ? 'Em produção, o webhook precisa usar HTTPS.' : 'O webhook precisa usar HTTP ou HTTPS.');
  }
  if (url.username || url.password || url.hash || !url.hostname || url.hostname.endsWith('.localhost') || url.hostname === 'localhost') {
    throw new Error('A URL do webhook não pode conter credenciais, fragmento ou endereço local.');
  }
  await resolvePublicAddress(url.hostname);
  return url;
}

export type ProcessWebhookPayload = {
  sourceAccount?: { id: string; label: string };
  before: { building: Record<string, unknown>; process: Record<string, unknown> | null } | null;
  after: { building: Record<string, unknown>; process: Record<string, unknown> };
  changes: { eventId: string; event: string; title: string; message: string; occurredAt: string; fields: Array<{ field: string; before: unknown; after: unknown }> };
};

export type ProcessWebhookDocument = {
  id: string;
  name: string;
  type: string;
  date?: string;
  uploadedBy?: string;
  uploadedAt?: string;
  mimeType: string;
  size: number;
  source: 'fenix' | 'sefaz-ba' | 'test';
  associatedWith: {
    buildingId: string;
    buildingName: string;
    processId: string;
    protocol: string;
    processType: string;
  };
  /** Omit contentBase64 for metadata-only files or files over the webhook limit. */
  contentBase64?: string;
  availability: 'included' | 'metadata_only';
  note?: string;
};

type WebhookTestPayload = {
  before: null;
  after: { building: Record<string, unknown>; process: Record<string, unknown> };
  changes: {
    eventId: string;
    event: 'webhook.test';
    title: string;
    message: string;
    occurredAt: string;
    test: true;
    fields: Array<{ field: string; before: unknown; after: unknown }>;
  };
};

function readJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

/** Builds a safe example payload for the settings screen; it never sends it. */
export function buildWebhookTestPayload(userId: string): WebhookTestPayload {
  const notification = db.prepare(`
    SELECT n.id AS notification_id, n.title, n.message, n.created_at,
      p.id AS process_id, p.building_id, p.protocol, p.type, p.status, p.stage,
      p.updated_at AS process_updated_at, p.payload AS process_payload,
      b.id AS current_building_id, b.reference, b.municipality, b.address,
      b.area, b.floors, b.height, b.payload AS building_payload,
      b.updated_at AS building_updated_at
    FROM notifications n
    LEFT JOIN processes p ON p.id = n.process_id AND p.user_id = n.user_id
    LEFT JOIN buildings b ON b.id = p.building_id AND b.user_id = n.user_id
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT 1
  `).get(userId) as {
    notification_id: number; title: string; message: string; created_at: string;
    process_id: string | null; building_id: string | null; protocol: string | null;
    type: string | null; status: string | null; stage: string | null;
    process_updated_at: string | null; process_payload: string | null;
    current_building_id: string | null; reference: string | null; municipality: string | null;
    address: string | null; area: number | null; floors: number | null; height: string | null;
    building_payload: string | null; building_updated_at: string | null;
  } | undefined;

  const occurredAt = new Date().toISOString();
  const eventId = randomUUID();
  let building: Record<string, unknown>;
  let process: Record<string, unknown>;
  let title: string;
  let message: string;
  let fields: WebhookTestPayload['changes']['fields'];

  if (notification?.process_id && notification.current_building_id) {
    building = {
      id: notification.current_building_id,
      reference: notification.reference ?? '',
      municipality: notification.municipality ?? '',
      address: notification.address ?? '',
      area: notification.area,
      floors: notification.floors,
      height: notification.height ?? '',
      payload: readJsonObject(notification.building_payload),
      updatedAt: notification.building_updated_at
    };
    process = {
      id: notification.process_id,
      buildingId: notification.building_id,
      protocol: notification.protocol ?? '',
      type: notification.type ?? '',
      status: notification.status ?? '',
      stage: notification.stage ?? '',
      updatedAt: notification.process_updated_at,
      payload: readJsonObject(notification.process_payload)
    };
    title = notification.title || 'Teste de webhook';
    message = `Teste de webhook baseado na notificação mais recente (ID ${notification.notification_id}): ${notification.message || 'sem mensagem registrada'}`;
    fields = [
      { field: 'process.status', before: null, after: process.status },
      { field: 'process.stage', before: null, after: process.stage }
    ];
  } else {
    // Intentionally generic synthetic data: no names, identifiers or business data.
    building = {
      id: 'exemplo-teste', reference: 'Edificação de exemplo (teste)',
      municipality: '', address: '', area: null, floors: null, height: '', payload: {}
    };
    process = {
      id: 'processo-exemplo-teste', buildingId: 'exemplo-teste', protocol: '',
      type: 'Projeto técnico (exemplo)', status: 'Exemplo', stage: 'Teste de integração', payload: {
        documents: [{
          id: 'webhook-test-document', name: 'anexo-exemplo.txt', type: 'Arquivo sintético de teste',
          mimeType: 'text/plain', size: Buffer.byteLength('Documento sintético para validar o envio Base64 do webhook.'),
          contentBase64: Buffer.from('Documento sintético para validar o envio Base64 do webhook.').toString('base64'),
          source: 'test', availability: 'included', note: 'Arquivo sintético; não contém dados de processo.'
        }]
      }
    };
    title = 'Exemplo de teste de webhook';
    message = notification
      ? `Este é um payload sintético de teste. A notificação mais recente (ID ${notification.notification_id}) não possui processo e edificação vinculados disponíveis.`
      : 'Este é um payload sintético de teste. Nenhuma notificação recente foi encontrada para esta conta.';
    fields = [{ field: 'process.stage', before: null, after: 'Teste de integração' }];
  }

  return {
    before: null,
    after: { building, process },
    changes: {
      eventId, event: 'webhook.test', title, message, occurredAt, test: true, fields
    }
  };
}

export async function deliverWebhook(urlValue: string, payload: ProcessWebhookPayload, production: boolean) {
  const url = await validateWebhookUrl(urlValue, production);
  const target = await resolvePublicAddress(url.hostname);
  const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const body = Buffer.from(JSON.stringify(payload));
  await new Promise<void>((resolve, reject) => {
    const request = transport({
      protocol: url.protocol,
      hostname: target.address,
      family: target.family,
      port: url.port || undefined,
      method: 'POST',
      path: `${url.pathname}${url.search}`,
      servername: url.protocol === 'https:' && !isIP(url.hostname) ? url.hostname : undefined,
      headers: { Host: url.host, 'Content-Type': 'application/json', 'Content-Length': body.length, Accept: 'application/json' },
      timeout: TIMEOUT_MS,
      rejectUnauthorized: true
    }, (response) => {
      response.resume();
      response.on('end', () => {
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) resolve();
        else reject(new Error(`Webhook retornou HTTP ${response.statusCode || 'inválido'}.`));
      });
    });
    request.on('timeout', () => request.destroy(new Error('Tempo limite de entrega do webhook excedido.')));
    request.on('error', reject);
    request.end(body);
  });
}

export type WebhookDeliveryLogItem = {
  id: number;
  eventId: string;
  event: string;
  title: string;
  message: string;
  buildingName: string;
  processId: string;
  protocol: string;
  documents: Array<{ name: string; type: string; availability: string; source: string }>;
  status: 'sending' | 'delivered' | 'failed';
  attempts: number;
  lastHttpStatus: number | null;
  lastError: string;
  createdAt: string;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  attemptHistory: Array<{ source: string; status: string; httpStatus: number | null; error: string; attemptedAt: string }>;
};

function webhookDocumentSummary(payload: ProcessWebhookPayload) {
  const processPayload = payload.after.process.payload;
  const docs = processPayload && typeof processPayload === 'object' && !Array.isArray(processPayload)
    ? (processPayload as Record<string, unknown>).documents : undefined;
  return Array.isArray(docs) ? docs.map((doc: any) => ({
    name: typeof doc === 'string' ? doc : String(doc?.name || doc?.nome || doc?.filename || 'Documento'),
    type: typeof doc === 'string' ? 'Documento do processo' : String(doc?.type || doc?.tipo || 'Anexo'),
    availability: String(doc?.availability || (doc?.contentBase64 ? 'included' : 'metadata_only')),
    source: String(doc?.source || 'fenix')
  })) : [];
}

export async function deliverWebhookLogged(
  userId: string,
  url: string,
  payload: ProcessWebhookPayload,
  production: boolean,
  source: 'automatic' | 'test' | 'manual' = 'automatic',
  existingDeliveryId?: number,
  sourceConnectionId: string | null = null
) {
  const now = new Date().toISOString();
  let deliveryId = existingDeliveryId;
  if (deliveryId === undefined) {
    const documents = webhookDocumentSummary(payload);
    const result = db.prepare(`INSERT INTO webhook_deliveries
      (user_id,source_connection_id,event_id,event,title,message,building_name,process_id,protocol,documents_json,payload_ciphertext,status,attempts,created_at,last_attempt_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'sending',0,?,?)`).run(
      userId, sourceConnectionId, payload.changes.eventId, payload.changes.event, payload.changes.title, payload.changes.message,
      String(payload.after.building.reference || ''), String(payload.after.process.id || ''),
      String(payload.after.process.protocol || ''), JSON.stringify(documents), seal(JSON.stringify(payload)), now, now
    );
    deliveryId = Number(result.lastInsertRowid);
    db.prepare(`DELETE FROM webhook_deliveries WHERE user_id=? AND id NOT IN
      (SELECT id FROM webhook_deliveries WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 500)`).run(userId, userId);
  }

  const attemptAt = new Date().toISOString();
  db.prepare(`UPDATE webhook_deliveries SET status='sending',attempts=attempts+1,last_attempt_at=?,last_error='',last_http_status=NULL WHERE id=? AND user_id=?`)
    .run(attemptAt, deliveryId, userId);
  try {
    await deliverWebhook(url, payload, production);
    db.prepare(`UPDATE webhook_deliveries SET status='delivered',last_http_status=200,last_error='',delivered_at=? WHERE id=? AND user_id=?`)
      .run(new Date().toISOString(), deliveryId, userId);
    db.prepare(`INSERT INTO webhook_delivery_attempts (delivery_id,source,status,http_status,error,attempted_at) VALUES (?,?, 'delivered',200,'',?)`)
      .run(deliveryId, source, attemptAt);
    return { id: deliveryId, delivered: true, error: null as string | null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha desconhecida na entrega.';
    const statusCode = /^Webhook retornou HTTP (\d+)\.$/.exec(message)?.[1];
    const httpStatus = statusCode ? Number(statusCode) : null;
    const safeError = httpStatus ? `Webhook retornou HTTP ${httpStatus}.` : message.slice(0, 500);
    db.prepare(`UPDATE webhook_deliveries SET status='failed',last_http_status=?,last_error=? WHERE id=? AND user_id=?`)
      .run(httpStatus, safeError, deliveryId, userId);
    db.prepare(`INSERT INTO webhook_delivery_attempts (delivery_id,source,status,http_status,error,attempted_at) VALUES (?,?, 'failed',?,?,?)`)
      .run(deliveryId, source, httpStatus, safeError, attemptAt);
    return { id: deliveryId, delivered: false, error: safeError };
  }
}

export function getWebhookDeliveryLog(userId: string, limit = 100): WebhookDeliveryLogItem[] {
  const boundedLimit = Math.min(200, Math.max(1, Math.floor(limit) || 100));
  const rows = db.prepare(`SELECT id,event_id,event,title,message,building_name,process_id,protocol,documents_json,status,attempts,last_http_status,last_error,created_at,last_attempt_at,delivered_at
    FROM webhook_deliveries WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT ?`).all(userId, boundedLimit) as Array<any>;
  const readAttempts = db.prepare(`SELECT source,status,http_status,error,attempted_at FROM webhook_delivery_attempts WHERE delivery_id=? ORDER BY attempted_at DESC,id DESC LIMIT 20`);
  return rows.map((row) => {
    let documents: WebhookDeliveryLogItem['documents'] = [];
    try { documents = JSON.parse(row.documents_json || '[]'); } catch { /* Keep the log readable if legacy JSON is malformed. */ }
    const attemptHistory = (readAttempts.all(row.id) as Array<any>).map((attempt) => ({
      source: attempt.source, status: attempt.status, httpStatus: attempt.http_status,
      error: attempt.error, attemptedAt: attempt.attempted_at
    }));
    return {
      id: row.id, eventId: row.event_id, event: row.event, title: row.title, message: row.message,
      buildingName: row.building_name, processId: row.process_id, protocol: row.protocol,
      documents, status: row.status, attempts: row.attempts, lastHttpStatus: row.last_http_status,
      lastError: row.last_error, createdAt: row.created_at, lastAttemptAt: row.last_attempt_at,
      deliveredAt: row.delivered_at, attemptHistory
    };
  });
}

export async function resendWebhookDelivery(userId: string, deliveryId: number, production: boolean) {
  const row = db.prepare('SELECT payload_ciphertext FROM webhook_deliveries WHERE id=? AND user_id=?').get(deliveryId, userId) as { payload_ciphertext: string } | undefined;
  if (!row) throw new Error('Envio não encontrado no log da sua conta.');
  const url = getSetting(WEBHOOK_SETTING);
  if (!url) throw new Error('Configure o webhook antes de reenviar.');
  const payload = JSON.parse(unseal(row.payload_ciphertext)) as ProcessWebhookPayload;
  return deliverWebhookLogged(userId, url, payload, production, 'manual', deliveryId);
}

export { WEBHOOK_SETTING };
