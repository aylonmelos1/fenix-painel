import { createHash } from 'node:crypto';
import { sendNotification, setVapidDetails, type PushSubscription, type WebPushError } from 'web-push';
import { db, seal, unseal } from './store.js';

const MAX_ATTEMPTS = 8;
const MAX_DELIVERY_BATCH = 20;

type NormalizedSubscription = PushSubscription;
type PushConfiguration = { subject: string; publicKey: string; privateKey: string };

function configuration(): PushConfiguration | null {
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim() || '';
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() || '';
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() || '';
  return subject && publicKey && privateKey ? { subject, publicKey, privateKey } : null;
}

function configureWebPush(): PushConfiguration | null {
  const values = configuration();
  if (!values) return null;
  try {
    setVapidDetails(values.subject, values.publicKey, values.privateKey);
    return values;
  } catch {
    return null;
  }
}

export function getWebPushConfig() {
  const values = configureWebPush();
  return values ? { enabled: true, publicKey: values.publicKey } : { enabled: false, publicKey: null };
}

function allowedPushEndpoint(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const endpoint = new URL(value);
    const hostname = endpoint.hostname.toLowerCase();
    const trustedHost = hostname === 'fcm.googleapis.com'
      || hostname === 'push.services.mozilla.com'
      || hostname.endsWith('.push.services.mozilla.com')
      || hostname === 'push.apple.com'
      || hostname.endsWith('.push.apple.com');
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.port || !trustedHost) return null;
    return endpoint.toString();
  } catch {
    return null;
  }
}

export function normalizePushSubscription(value: unknown): NormalizedSubscription | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = allowedPushEndpoint(input.endpoint);
  const p256dh = input.keys?.p256dh;
  const auth = input.keys?.auth;
  if (!endpoint || typeof p256dh !== 'string' || typeof auth !== 'string'
    || p256dh.length > 256 || auth.length > 256
    || !/^[A-Za-z0-9_-]+$/.test(p256dh) || !/^[A-Za-z0-9_-]+$/.test(auth)) return null;
  return { endpoint, keys: { p256dh, auth } };
}

function endpointHash(endpoint: string) {
  return createHash('sha256').update(endpoint).digest('hex');
}

export function savePushSubscription(ownerUserId: string, subscription: NormalizedSubscription) {
  const hash = endpointHash(subscription.endpoint);
  const now = new Date().toISOString();
  const save = db.transaction(() => {
    db.prepare(`UPDATE push_deliveries SET status='cancelled',last_error='Assinatura transferida para outra conta.'
      WHERE endpoint_hash=? AND owner_user_id<>? AND status='pending'`).run(hash, ownerUserId);
    db.prepare(`INSERT INTO push_subscriptions (endpoint_hash,owner_user_id,subscription_ciphertext,created_at,updated_at)
      VALUES (?,?,?,?,?) ON CONFLICT(endpoint_hash) DO UPDATE SET owner_user_id=excluded.owner_user_id,
      subscription_ciphertext=excluded.subscription_ciphertext,updated_at=excluded.updated_at`)
      .run(hash, ownerUserId, seal(JSON.stringify(subscription)), now, now);
  });
  save();
}

export function removePushSubscription(ownerUserId: string, endpointValue: unknown) {
  const endpoint = allowedPushEndpoint(endpointValue);
  if (!endpoint) return false;
  return db.prepare('DELETE FROM push_subscriptions WHERE endpoint_hash=? AND owner_user_id=?')
    .run(endpointHash(endpoint), ownerUserId).changes > 0;
}

export function enqueuePushDelivery(ownerUserId: string, notificationId: number, now: string) {
  db.prepare(`INSERT OR IGNORE INTO push_deliveries
      (owner_user_id,notification_id,endpoint_hash,status,attempts,next_attempt_at,created_at)
    SELECT ?,?,endpoint_hash,'pending',0,?,? FROM push_subscriptions WHERE owner_user_id=?`)
    .run(ownerUserId, notificationId, now, now, ownerUserId);
}

type DueDelivery = {
  id: number;
  notificationId: number;
  ownerUserId: string;
  endpointHash: string;
  subscriptionCiphertext: string;
  title: string;
  message: string;
  attempts: number;
};

let dispatchInProgress = false;

export async function dispatchPendingPushDeliveries() {
  if (dispatchInProgress || !configureWebPush()) return;
  dispatchInProgress = true;
  try {
    const now = new Date().toISOString();
    const due = db.prepare(`SELECT d.id,d.notification_id AS notificationId,d.owner_user_id AS ownerUserId,
        d.endpoint_hash AS endpointHash,d.attempts,p.subscription_ciphertext AS subscriptionCiphertext,
        n.title,n.message
      FROM push_deliveries d
      JOIN push_subscriptions p ON p.endpoint_hash=d.endpoint_hash AND p.owner_user_id=d.owner_user_id
      JOIN notifications n ON n.id=d.notification_id
      WHERE d.status='pending' AND d.next_attempt_at<=?
      ORDER BY d.id LIMIT ?`).all(now, MAX_DELIVERY_BATCH) as DueDelivery[];

    for (const delivery of due) {
      try {
        const subscription = JSON.parse(unseal(delivery.subscriptionCiphertext)) as PushSubscription;
        const body = JSON.stringify({
          notificationId: delivery.notificationId,
          title: delivery.title.slice(0, 120),
          body: delivery.message.slice(0, 220),
          url: '/painel'
        });
        await sendNotification(subscription, body, { TTL: 60 * 60 });
        db.prepare("UPDATE push_deliveries SET status='sent',delivered_at=?,last_error='' WHERE id=? AND status='pending'")
          .run(new Date().toISOString(), delivery.id);
      } catch (error) {
        const statusCode = Number((error as Partial<WebPushError>)?.statusCode || 0);
        if (statusCode === 404 || statusCode === 410) {
          db.prepare('DELETE FROM push_subscriptions WHERE endpoint_hash=?').run(delivery.endpointHash);
          continue;
        }
        const attempts = delivery.attempts + 1;
        const retryable = !statusCode || statusCode === 429 || statusCode >= 500;
        const status = retryable && attempts < MAX_ATTEMPTS ? 'pending' : 'failed';
        const delayMs = Math.min(30_000 * (2 ** delivery.attempts), 6 * 60 * 60_000);
        const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
        const safeError = statusCode ? `O serviço de notificações retornou HTTP ${statusCode}.` : 'Falha temporária de rede.';
        db.prepare('UPDATE push_deliveries SET status=?,attempts=?,next_attempt_at=?,last_error=? WHERE id=? AND status=\'pending\'')
          .run(status, attempts, nextAttemptAt, safeError, delivery.id);
      }
    }
    return { processed: due.length };
  } finally {
    dispatchInProgress = false;
  }
}
