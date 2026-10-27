export type ProcessRecord = {
  id: string;
  building_id: string;
  building_reference: string;
  municipality: string;
  protocol: string;
  type: string;
  status: string;
  stage: string;
  updated_at: string;
  payload: string;
  remote_id?: string | null;
  source_account_name?: string | null;
  source_connection_id?: string | null;
  source_account_paused?: number | boolean | null;
};

export type DashboardProcess = {
  id: string;
  buildingId: string;
  buildingReference: string;
  municipality: string;
  protocol: string;
  type: string;
  status: string;
  stage: string;
  updatedAt: string;
  documentCount: number;
  sourceAccountName?: string | null;
  sourceConnectionId?: string | null;
  sourceAccountPaused?: boolean;
  analysisEnteredAt?: string | null;
  notificationEnteredAt?: string | null;
  latestActivityAt?: string | null;
  notificationCount?: number | null;
  historyAvailable?: boolean;
  projectKind?: string | null;
};

export function normalizeStatus(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

export function isAttentionProcess(process: Pick<ProcessRecord, 'status' | 'stage'>) {
  return /pend|exig|document|retific|notific/.test(normalizeStatus(`${process.status} ${process.stage}`));
}

export function isAnalysisProcess(process: Pick<ProcessRecord, 'status' | 'stage'>) {
  return /analise/.test(normalizeStatus(`${process.status} ${process.stage}`));
}

export function isInspectionProcess(process: Pick<ProcessRecord, 'status' | 'stage' | 'type'>) {
  return /vistoria/.test(normalizeStatus(`${process.type} ${process.status} ${process.stage}`));
}

export function deduplicateProcesses(processes: ProcessRecord[]) {
  const grouped = new Map<string, ProcessRecord>();
  for (const process of processes) {
    const protocol = process.protocol.trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, '');
    const key = protocol && protocol !== '—' && protocol !== '-'
      ? `${process.building_id}:${protocol}` : `${process.building_id}:${process.id}`;
    const prior = grouped.get(key);
    if (!prior) { grouped.set(key, process); continue; }
    const project = (item: ProcessRecord) => item.id.startsWith('technicalproject:') ? 1 : 0;
    const winner = project(process) > project(prior) ||
      (project(process) === project(prior) && Date.parse(process.updated_at) > Date.parse(prior.updated_at)) ? process : prior;
    const newest = Date.parse(process.updated_at) > Date.parse(prior.updated_at) ? process : prior;
    grouped.set(key, { ...winner, status: newest.status, stage: newest.stage, updated_at: newest.updated_at,
      payload: countProcessDocuments(process.payload) > countProcessDocuments(prior.payload) ? process.payload : prior.payload });
  }
  return [...grouped.values()].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

export function countProcessDocuments(payload: string) {
  try {
    const parsed = JSON.parse(payload);
    const documents = parsed?.documents ?? parsed?.documentos ?? parsed?.files ?? parsed?.anexos;
    return Array.isArray(documents) ? documents.length : 0;
  } catch {
    return 0;
  }
}

export function summarizeProcesses(processes: ProcessRecord[]) {
  return {
    analysis: processes.filter(isAnalysisProcess).length,
    attention: processes.filter(isAttentionProcess).length,
    inspections: processes.filter(isInspectionProcess).length
  };
}

export function toDashboardProcess(process: ProcessRecord): DashboardProcess {
  return {
    id: process.id,
    buildingId: process.building_id,
    buildingReference: process.building_reference,
    municipality: process.municipality,
    protocol: process.protocol,
    type: process.type,
    status: process.status,
    stage: process.stage,
    updatedAt: process.updated_at,
    documentCount: countProcessDocuments(process.payload),
    sourceAccountName: process.source_account_name || null,
    sourceConnectionId: process.source_connection_id || null,
    sourceAccountPaused: Boolean(process.source_account_paused)
  };
}
