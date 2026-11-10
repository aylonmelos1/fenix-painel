export type User = { name: string; email: string | null; demo: boolean };

export type Building = {
  id: string; reference: string; municipality: string; address: string; area: number | null;
  floors: number | null; height: string; processCount: number; protocol: string;
  processType: string; status: string; stage: string; lastUpdated: string | null;
  notifiedBy?: string | null;
  sourceAccountName?: string | null; sourceConnectionId?: string | null; sourceAccountPaused?: boolean;
  hasRequest?: boolean; hasProject?: boolean; hasDocuments?: boolean;
  requestCount?: number; projectCount?: number; documentsCount?: number;
};

export type DashboardProcess = {
  id: string; buildingId: string; buildingReference: string; municipality: string;
  protocol: string; type: string; status: string; stage: string; updatedAt: string; documentCount: number;
  notifiedBy?: string | null;
  sourceAccountName?: string | null; sourceConnectionId?: string | null; sourceAccountPaused?: boolean;
  analysisEnteredAt?: string | null; notificationEnteredAt?: string | null; latestActivityAt?: string | null; notificationCount?: number | null; historyAvailable?: boolean;
  projectKind?: string | null;
};

export type FenixAccountRequest = {
  id: string; processId: string; remoteId: string; remoteBuildingId: string; buildingId: string | null;
  buildingReference: string; municipality: string; requestNumber: string; protocolNumber: string; protocol: string; serviceType: string; status: string;
  renewal: string; event: string; protocolDate: string; notificationNumber: string; acpProtocol: string;
  avcbNumber: string; daeNumber: string; updatedAt: string; sourceConnectionId?: string | null;
  sourceAccountName?: string | null; sourceAccountPaused?: boolean;
};

export type OfficialRequestSummary = {
  remoteId: string | null;
  requestNumber: string | null;
  protocolNumber: string | null;
  buildingReference: string | null;
  municipality: string | null;
  serviceType: string | null;
  status: string | null;
  renewal: string | null;
  event: string | null;
  protocolDate: string | null;
  notificationNumber: string | null;
  acpProtocol: string | null;
  avcbNumber: string | null;
  daeNumber: string | null;
};

export type OfficialRequestSummaryResponse = {
  request: OfficialRequestSummary;
  sourceAccountName: string | null;
  readAt: string;
};

export type OfficialRequestPayment = {
  id: string;
  number: string | null;
  type: string | null;
  status: string | null;
  dueDate: string | null;
  amountDue: string | null;
  amountPaid: string | null;
  paymentDate: string | null;
  hasDocument: boolean;
};

export type OfficialRequestPaymentsResponse = {
  daes: OfficialRequestPayment[];
  readAt: string;
};

export type RequesterProjectDetailsResponse = {
  project: {
    projectNumber: string | null;
    projectType: string | null;
    status: string | null;
    activity: string | null;
    risk: string | null;
    building: {
      reference: string | null;
      address: string | null;
      municipality: string | null;
      totalArea: number | null;
      buildingArea: number | null;
      areaToBeBuilt: number | null;
      floors: number | null;
      height: string | null;
    };
    ownerName: string | null;
    responsibleName: string | null;
    occupations: string[];
    securityMeasures: string[];
    technicalResponsibles: Array<{ name: string | null; registration: string | null; council: string | null; role: string | null }>;
    history: Array<{ status: string; startedAt: string | null; endedAt: string | null; current: boolean }>;
  };
  sourceAccountName: string;
  readAt: string;
};

export type RequesterProfile = {
  name: string | null;
  email: string | null;
  telephone: string | null;
  verification: {
    status: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    startTime: string | null;
    active: boolean | null;
    documentCount: number;
  } | null;
};

export type RequesterProfileResponse = {
  profile: RequesterProfile;
  sourceAccountKey: string;
  sourceAccountName: string;
  readAt: string;
};

export type RequesterSurvey = {
  id: string;
  type: string;
  status: string;
  date: string;
  buildingReference: string;
  address: string;
  municipality: string;
  requestNumber: string;
  protocolNumber: string;
  sourceAccountKey: string;
  sourceAccountName: string;
};

export type RequesterSurveysResponse = {
  vistorias: RequesterSurvey[];
  partial: boolean;
  warnings: Array<{ code: string; message: string }>;
};

export type ProjectDraftStatus = 'draft' | 'simulated' | 'submitting' | 'verification_pending' | 'submitted' | 'error';

export type DraftSubmissionVerificationResponse<TDraft> = {
  ok: boolean;
  draft: TDraft;
  verification?: 'confirmed' | 'pending' | 'not_pending';
  verified?: boolean;
  pendingVerification?: boolean;
  message?: string;
  result?: unknown;
  error?: string;
};

export type ProcessMenuKey = 'analysis' | 'notified' | 'stopped' | 'certificates' | 'projects';
export type ProcessMenuFilter = { typeTerms: string[]; stageTerms: string[]; join: 'all' | 'any' };
export type ProcessMenuFilters = Record<ProcessMenuKey, ProcessMenuFilter>;

export type Dashboard = {
  user: User;
  historyRefresh: { status: string; startedAt: string | null; completedAt: string | null; total: number; processed: number; failed: number; message: string };
  metrics: { buildings: number; processes: number; analysis: number; attention: number; inspections: number };
  buildings: Building[];
  processes: DashboardProcess[];
  sourceAccounts?: Array<{ id: string; label: string }>;
  processMenuFilters?: ProcessMenuFilters;
  sync: { lastSync: string | null; status: string; message: string; nextSync: string | null; intervalMinutes?: number; runs: Array<{ id: number; startedAt: string; completedAt: string | null; status: string; message: string }> };
};

export type DocumentItem = { id: string; name: string; type: string; date?: string; available: boolean; source?: 'fenix'; processId?: string; kind?: 'certificate' | 'protocol' | 'dae' | 'notification'; daeId?: string; status?: string; availabilityMessage?: string };
export type TimelineItem = { label: string; date?: string; done?: boolean; current?: boolean; pending?: boolean };

export interface FenixProcessAction {
  key:
    | 'solicitar_vistoria'
    | 'solicitar_revistoria'
    | 'solicitar_reanalise'
    | 'reavaliacao_renovacao'
    | 'solicitar_renovacao'
    | 'editar_projeto'
    | 'cancelar_solicitacao'
    | 'cancelar_processo'
    | 'baixar_notificacao'
    | 'baixar_certificado'
    | 'baixar_protocolo';
  label: string;
  shortLabel: string;
  icon: 'walk_transfer' | 'autorenew' | 'edit' | 'cloud_wine' | 'cloud_green' | 'cancel';
  tone: 'wine' | 'green' | 'danger';
  kind: 'download' | 'mutation' | 'edit_draft';
  downloadUrl?: string;
  confirmTitle?: string;
  confirmMessage?: string;
}

export type ProcessDetail = {
  id: string; remoteId?: string; protocol: string; type: string; status: string; stage: string; updatedAt: string;
  notifiedBy?: string | null;
  documents: DocumentItem[]; timeline: TimelineItem[]; raw: unknown;
  fenixActions?: FenixProcessAction[];
};
export type BuildingDetail = { building: Building & { use?: string; totalArea?: number | null; buildingArea?: number | null; areaToBeBuilt?: number | null; validUntil?: string; technicalFacts?: Array<{ label: string; value: string }> }; processes: ProcessDetail[] };

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const multipart = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const response = await fetch(path, {
    ...init, credentials: 'same-origin',
    headers: { ...(init?.body && !multipart ? { 'Content-Type': 'application/json' } : {}), ...init?.headers }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 202) throw new Error(data.error || `Erro HTTP ${response.status}`);
  return data as T;
}

export const formatDate = (date?: string | null) => {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(parsed);
};

export const formatArea = (value?: number | null) => value ? `${value.toLocaleString('pt-BR')} m²` : '—';

export function statusTone(status: string): 'green' | 'amber' | 'red' | 'blue' | 'gray' {
  const value = status.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/pend|exig|retific|document/.test(value)) return 'amber';
  if (/falh|indefer|cancel/.test(value)) return 'red';
  if (/aprov|homolog|conclu|certific/.test(value)) return 'green';
  if (/analise|protocol|andamento|vistoria/.test(value)) return 'blue';
  return 'gray';
}
