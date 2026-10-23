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
    documentCount: countProcessDocuments(process.payload)
  };
}
