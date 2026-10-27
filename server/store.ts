import Database from 'better-sqlite3';
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';

const dataDir = join(process.cwd(), 'data');
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const keyPath = join(dataDir, '.local-key');
let masterKey: Buffer;
try {
  masterKey = readFileSync(keyPath);
  if (masterKey.length !== 32) throw new Error('Invalid local encryption key.');
} catch {
  masterKey = randomBytes(32);
  writeFileSync(keyPath, masterKey, { mode: 0o600, flag: 'wx' });
  chmodSync(keyPath, 0o600);
}

export function seal(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

export function unseal(value: string): string {
  const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !encrypted) throw new Error('Stored secret is invalid.');
  const decipher = createDecipheriv('aes-256-gcm', masterKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export const db = new Database(join(dataDir, 'fenix-painel.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  fenix_user_id TEXT,
  name TEXT NOT NULL,
  email TEXT,
  session_ciphertext TEXT,
  demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_sync TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS buildings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_connection_id TEXT,
  remote_id TEXT,
  reference TEXT NOT NULL,
  municipality TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  area REAL,
  floors INTEGER,
  height TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS processes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_connection_id TEXT,
  remote_id TEXT,
  building_id TEXT NOT NULL,
  protocol TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'Projeto técnico',
  status TEXT NOT NULL DEFAULT 'Em análise',
  stage TEXT NOT NULL DEFAULT '',
  notified_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS process_histories (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  process_id TEXT NOT NULL,
  timeline_json TEXT NOT NULL DEFAULT '[]',
  latest_activity_at TEXT,
  analysis_entered_at TEXT,
  notification_entered_at TEXT,
  notification_count INTEGER NOT NULL DEFAULT 0,
  project_kind TEXT,
  history_available INTEGER NOT NULL DEFAULT 0,
  refresh_status TEXT NOT NULL DEFAULT 'pending',
  refreshed_at TEXT,
  error TEXT,
  PRIMARY KEY (user_id, process_id)
);
CREATE TABLE IF NOT EXISTS history_refresh_state (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'idle',
  started_at TEXT,
  completed_at TEXT,
  total_count INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS renewal_dispositions (
  process_id TEXT PRIMARY KEY,
  disposition TEXT NOT NULL CHECK(disposition IN ('archived', 'lost')),
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fenix_request_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requested_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS fenix_request_slots_requested_at ON fenix_request_slots(requested_at);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_ciphertext TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  building_id TEXT,
  process_id TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  dedupe_key TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS notifications_user_created ON notifications(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint_hash TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_ciphertext TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS push_subscriptions_owner ON push_subscriptions(owner_user_id);
CREATE TABLE IF NOT EXISTS push_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  endpoint_hash TEXT NOT NULL REFERENCES push_subscriptions(endpoint_hash) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  delivered_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  UNIQUE(notification_id, endpoint_hash)
);
CREATE INDEX IF NOT EXISTS push_deliveries_due ON push_deliveries(status, next_attempt_at);
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  event TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  building_name TEXT NOT NULL DEFAULT '',
  process_id TEXT NOT NULL DEFAULT '',
  protocol TEXT NOT NULL DEFAULT '',
  documents_json TEXT NOT NULL DEFAULT '[]',
  payload_ciphertext TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_http_status INTEGER,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  last_attempt_at TEXT,
  delivered_at TEXT
);
CREATE INDEX IF NOT EXISTS webhook_deliveries_user_created ON webhook_deliveries(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS webhook_delivery_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id INTEGER NOT NULL REFERENCES webhook_deliveries(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  http_status INTEGER,
  error TEXT NOT NULL DEFAULT '',
  attempted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS webhook_delivery_attempts_delivery ON webhook_delivery_attempts(delivery_id, attempted_at DESC);
CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  building_id TEXT,
  title TEXT NOT NULL DEFAULT 'Nova conversa',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_chat_sessions_user_updated ON ai_chat_sessions(user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content TEXT NOT NULL,
  reasoning_summary TEXT NOT NULL DEFAULT '',
  sources_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_chat_messages_session_created ON ai_chat_messages(session_id, created_at);
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  sync_interval_minutes INTEGER NOT NULL DEFAULT 30,
  ai_data_access INTEGER NOT NULL DEFAULT 1,
  ai_include_documents INTEGER NOT NULL DEFAULT 1,
  ai_max_processes INTEGER NOT NULL DEFAULT 1000,
  ai_custom_prompt TEXT NOT NULL DEFAULT ''
);
UPDATE user_preferences SET ai_max_processes = 1000 WHERE ai_max_processes = 100 AND ai_custom_prompt = '' AND ai_data_access = 1 AND ai_include_documents = 1;
`);

// A linked Fênix identity has its own encrypted session and data partition. It
// is never inserted into `sessions`, which remains the panel's login boundary.
db.exec(`
CREATE TABLE IF NOT EXISTS fenix_connections (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data_user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  fenix_user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  paused INTEGER NOT NULL DEFAULT 0,
  webhook_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_user_id, fenix_user_id)
);
CREATE INDEX IF NOT EXISTS fenix_connections_owner ON fenix_connections(owner_user_id, created_at);
CREATE TABLE IF NOT EXISTS fenix_connection_buildings (
  connection_id TEXT NOT NULL REFERENCES fenix_connections(id) ON DELETE CASCADE,
  remote_building_id TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT 'Edificação',
  municipality TEXT NOT NULL DEFAULT '',
  selected INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(connection_id, remote_building_id)
);
CREATE INDEX IF NOT EXISTS fenix_connection_buildings_selected ON fenix_connection_buildings(connection_id, selected);
`);

for (const [table, column] of [
  ['buildings', 'source_connection_id'], ['buildings', 'remote_id'],
  ['processes', 'source_connection_id'], ['processes', 'remote_id'],
  ['webhook_deliveries', 'source_connection_id']
] as const) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`); }
  catch (error) {
    if (!(error instanceof Error) || !error.message.includes('duplicate column name')) throw error;
  }
}
try {
  db.exec("ALTER TABLE processes ADD COLUMN notified_by TEXT NOT NULL DEFAULT ''");
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes('duplicate column name')) throw error;
}
db.exec(`
CREATE INDEX IF NOT EXISTS buildings_source ON buildings(source_connection_id, remote_id);
CREATE INDEX IF NOT EXISTS processes_source ON processes(source_connection_id, remote_id);
CREATE INDEX IF NOT EXISTS webhook_deliveries_source ON webhook_deliveries(source_connection_id);
`);

db.exec(`
DROP INDEX IF EXISTS notifications_unique_event;
`);
try {
  db.exec("ALTER TABLE notifications ADD COLUMN dedupe_key TEXT NOT NULL DEFAULT ''");
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes('duplicate column name')) throw error;
}

db.exec(`
UPDATE notifications SET dedupe_key=COALESCE((
  SELECT p.building_id || ':' || lower(replace(trim(p.protocol),' ',''))
  FROM processes p WHERE p.user_id=notifications.user_id AND p.id=notifications.process_id LIMIT 1
), process_id);
DELETE FROM notifications AS duplicate
WHERE EXISTS (
  SELECT 1 FROM notifications AS preferred
  WHERE preferred.user_id=duplicate.user_id AND preferred.dedupe_key=duplicate.dedupe_key AND preferred.title=duplicate.title
    AND preferred.message=duplicate.message AND preferred.created_at=duplicate.created_at
    AND (CASE WHEN preferred.read_at IS NULL THEN 0 ELSE 1 END < CASE WHEN duplicate.read_at IS NULL THEN 0 ELSE 1 END
      OR ((preferred.read_at IS NULL) = (duplicate.read_at IS NULL) AND preferred.id < duplicate.id))
);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_unique_event ON notifications(user_id,dedupe_key,title,message,created_at);
`);

try {
  db.exec("ALTER TABLE user_preferences ADD COLUMN ai_response_prompt TEXT NOT NULL DEFAULT 'Explique os processos de incêndio em português simples, priorize pendências e próximos passos práticos e seja conciso.'");
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes('duplicate column name')) throw error;
}

function isoDaysAgo(days: number, hour = 10) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 15, 0, 0);
  return date.toISOString();
}

const existingDemo = db.prepare('SELECT id FROM users WHERE id = ?').get('demo-local');
if (!existingDemo) {
  const seed = db.transaction(() => {
    db.prepare(`INSERT INTO users (id, name, email, demo, created_at, last_sync)
      VALUES (?, ?, ?, 1, ?, ?)`).run('demo-local', 'Usuário demonstração', 'demo@exemplo.local', new Date().toISOString(), isoDaysAgo(0, 9));
    const insertBuilding = db.prepare(`INSERT INTO buildings
      (id, user_id, reference, municipality, address, area, floors, height, payload, updated_at)
      VALUES (?, 'demo-local', ?, ?, ?, ?, ?, ?, '{}', ?)`);
    const buildings = [
      ['demo-b1', 'Edifício Atlântico', 'Salvador', 'Av. Oceânica, 1000 · Barra', 12450, 18, 'Média'],
      ['demo-b2', 'Loja Centro', 'Feira de Santana', 'Rua Sales Barbosa, 85 · Centro', 980, 2, 'Baixa'],
      ['demo-b3', 'Galpão Norte', 'Lauro de Freitas', 'Rod. BA-099, km 5 · Centro Industrial', 5200, 1, 'Térrea'],
      ['demo-b4', 'Condomínio Parque Sul', 'Camaçari', 'Av. Jorge Amado, 420 · Ponto Certo', 8760, 12, 'Média']
    ] as const;
    for (const [id, reference, city, address, area, floors, height] of buildings) {
      insertBuilding.run(id, reference, city, address, area, floors, height, isoDaysAgo(0));
    }
    const insertProcess = db.prepare(`INSERT INTO processes
      (id, user_id, building_id, protocol, type, status, stage, updated_at, payload)
      VALUES (?, 'demo-local', ?, ?, ?, ?, ?, ?, ?)`);
    const processes = [
      ['demo-p1', 'demo-b1', 'CBM-PRJ-2024-00123', 'PT · AVCB', 'Aguardando documento', 'Exigência / retificação', isoDaysAgo(1), JSON.stringify({ documents: ['RT_Projeto_Preventivo.pdf', 'Memorial_Descritivo.pdf', 'ART_Projeto.pdf', 'Comprovante_Pagamento_Taxa.pdf'], timeline: [{ label: 'Protocolado', date: isoDaysAgo(98), done: true }, { label: 'Análise', date: isoDaysAgo(85), done: true }, { label: 'Exigência / retificação', date: isoDaysAgo(11), done: true }, { label: 'Aguardando documento', date: isoDaysAgo(9), current: true }, { label: 'Vistoria', date: '', pending: true }, { label: 'Certificado', date: '', pending: true }] })],
      ['demo-p2', 'demo-b2', 'CBM-PRJ-2025-00456', 'PTS · CLCB', 'Em análise', 'Análise técnica', isoDaysAgo(2), JSON.stringify({ documents: ['Projeto_Simplificado.pdf', 'ART.pdf'], timeline: [{ label: 'Protocolado', date: isoDaysAgo(14), done: true }, { label: 'Análise técnica', date: isoDaysAgo(11), current: true }, { label: 'Aprovação', date: '', pending: true }, { label: 'Certificado', date: '', pending: true }] })],
      ['demo-p3', 'demo-b3', 'CBM-PRJ-2024-00987', 'PT · AVCB', 'Exigência / retificação', 'Aguardando retificação', isoDaysAgo(4), JSON.stringify({ documents: ['Notificacao_Analise.pdf', 'Projeto_Revisado.pdf'], timeline: [{ label: 'Protocolado', date: isoDaysAgo(73), done: true }, { label: 'Análise', date: isoDaysAgo(63), done: true }, { label: 'Exigência / retificação', date: isoDaysAgo(4), current: true }, { label: 'Nova análise', date: '', pending: true }, { label: 'Vistoria', date: '', pending: true }, { label: 'Certificado', date: '', pending: true }] })],
      ['demo-p4', 'demo-b4', 'CBM-PRJ-2025-00321', 'PTS · CLCB', 'Aprovado', 'Aguardando vistoria', isoDaysAgo(3), JSON.stringify({ documents: ['Projeto_Aprovado.pdf', 'Memorial.pdf', 'ART.pdf'], timeline: [{ label: 'Protocolado', date: isoDaysAgo(45), done: true }, { label: 'Análise', date: isoDaysAgo(38), done: true }, { label: 'Aprovado', date: isoDaysAgo(3), done: true }, { label: 'Vistoria', date: '', current: true }, { label: 'Certificado', date: '', pending: true }] })]
    ] as const;
    for (const row of processes) insertProcess.run(...row);
  });
  seed();
}

export function resolveSession(sessionId: string | undefined) {
  if (!sessionId || sessionId.length > 128) return undefined;
  if (sessionId === 'demo-local') return db.prepare(`SELECT id, fenix_user_id, name, email, session_ciphertext, demo, last_sync
    FROM users WHERE id = 'demo-local'`).get() as {
      id: string; fenix_user_id: string | null; name: string; email: string | null;
      session_ciphertext: string | null; demo: number; last_sync: string | null;
    } | undefined;
  const tokenHash = createHash('sha256').update(sessionId).digest('hex');
  return db.prepare(`SELECT u.id, u.fenix_user_id, u.name, u.email, u.session_ciphertext, u.demo, u.last_sync
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).get(tokenHash) as {
      id: string; fenix_user_id: string | null; name: string; email: string | null;
      session_ciphertext: string | null; demo: number; last_sync: string | null;
    } | undefined;
}

export function addSession(token: string, userId: string) {
  const hash = createHash('sha256').update(token).digest('hex');
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at) VALUES (?, ?, ?)').run(hash, userId, new Date().toISOString());
}

export function deleteSession(token: string | undefined) {
  if (!token) return;
  const hash = createHash('sha256').update(token).digest('hex');
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash);
}

export function getSetting(key: string) {
  const row = db.prepare('SELECT value_ciphertext FROM settings WHERE key = ?').get(key) as { value_ciphertext: string } | undefined;
  return row ? unseal(row.value_ciphertext) : undefined;
}

export function setSetting(key: string, value: string) {
  db.prepare(`INSERT INTO settings(key, value_ciphertext, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_ciphertext = excluded.value_ciphertext, updated_at = excluded.updated_at`)
    .run(key, seal(value), new Date().toISOString());
}
