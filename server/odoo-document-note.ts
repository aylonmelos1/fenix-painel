type FenixTimelineEvent = { label?: unknown; date?: unknown };

export type OdooDocumentNoteContext = {
  kind: string;
  processProtocol?: string;
  latestSituation: string;
  latestSituationDate?: string;
  daeUrl?: string;
};

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
}

export function resolveLatestFenixSituation(events: readonly FenixTimelineEvent[], fallbackLabel = '', fallbackDate = '') {
  let latest: { label: string; date: string; timestamp: number } | undefined;
  for (const event of events) {
    if (typeof event.label !== 'string' || !event.label.trim() || typeof event.date !== 'string') continue;
    const timestamp = Date.parse(event.date);
    if (!Number.isFinite(timestamp) || (latest && timestamp < latest.timestamp)) continue;
    latest = { label: event.label.trim(), date: event.date, timestamp };
  }
  return latest
    ? { label: latest.label, date: latest.date }
    : { label: fallbackLabel.trim() || 'Situação não informada', date: fallbackDate };
}

function formatNoteDate(value: string) {
  const raw = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const date = new Date(dateOnly ? `${raw}T12:00:00.000Z` : raw.includes('T') ? raw : raw.replace(' ', 'T'));
  if (!Number.isFinite(date.getTime())) return raw;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Bahia' }).format(date);
}

export function buildOdooDocumentNote(context: OdooDocumentNoteContext, fileName: string) {
  const labels: Record<string, string> = {
    protocol: 'Comprovante de protocolo',
    certificate: 'Certificado de Aprovação',
    notification: 'Notificação oficial',
    dae: 'DAE (Documento de Arrecadação Estadual)'
  };
  const documentLabel = labels[context.kind] || fileName;
  const statusDate = context.latestSituationDate ? formatNoteDate(context.latestSituationDate) : '';
  const paragraphs = [
    `<p><strong>Documento novo no Fênix:</strong> ${escapeHtml(documentLabel)}</p>`,
    context.processProtocol ? `<p><strong>Protocolo:</strong> ${escapeHtml(context.processProtocol)}</p>` : '',
    context.kind === 'dae' && context.daeUrl
      ? `<p><strong>Link do DAE:</strong> <a href="${escapeHtml(context.daeUrl)}">Acessar DAE no portal SEFAZ-BA</a></p>`
      : '',
    `<p><strong>Situação atual:</strong> ${escapeHtml(context.latestSituation || 'Situação não informada')}${statusDate ? ` (${escapeHtml(statusDate)})` : ''}</p>`
  ].filter(Boolean);
  return paragraphs.join('');
}
