import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';

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
  before: { building: Record<string, unknown>; process: Record<string, unknown> | null };
  after: { building: Record<string, unknown>; process: Record<string, unknown> };
  changes: { eventId: string; event: string; title: string; message: string; occurredAt: string; fields: Array<{ field: string; before: unknown; after: unknown }> };
};

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
