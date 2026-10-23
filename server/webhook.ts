import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { randomUUID } from 'node:crypto';
import { db } from './store.js';

const WEBHOOK_SETTING = 'notifications_webhook_url';
const TIMEOUT_MS = 5_000;

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
  before: { building: Record<string, unknown>; process: Record<string, unknown> | null } | null;
  after: { building: Record<string, unknown>; process: Record<string, unknown> };
  changes: { eventId: string; event: string; title: string; message: string; occurredAt: string; fields: Array<{ field: string; before: unknown; after: unknown }> };
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
      type: 'Projeto técnico (exemplo)', status: 'Exemplo', stage: 'Teste de integração', payload: {}
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

export { WEBHOOK_SETTING };
