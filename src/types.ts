export type User = { name: string; email: string | null; demo: boolean };

export type Building = {
  id: string; reference: string; municipality: string; address: string; area: number | null;
  floors: number | null; height: string; processCount: number; protocol: string;
  processType: string; status: string; stage: string; lastUpdated: string | null;
  sourceAccountName?: string | null; sourceConnectionId?: string | null; sourceAccountPaused?: boolean;
  hasRequest?: boolean; hasProject?: boolean; hasDocuments?: boolean;
  requestCount?: number; projectCount?: number; documentsCount?: number;
};

export type DashboardProcess = {
  id: string; buildingId: string; buildingReference: string; municipality: string;
  protocol: string; type: string; status: string; stage: string; updatedAt: string; documentCount: number;
  sourceAccountName?: string | null; sourceConnectionId?: string | null; sourceAccountPaused?: boolean;
  analysisEnteredAt?: string | null; notificationEnteredAt?: string | null; latestActivityAt?: string | null; notificationCount?: number | null; historyAvailable?: boolean;
  projectKind?: string | null;
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
export type ProcessDetail = {
  id: string; remoteId?: string; protocol: string; type: string; status: string; stage: string; updatedAt: string;
  documents: DocumentItem[]; timeline: TimelineItem[]; raw: unknown;
};
export type BuildingDetail = { building: Building & { use?: string; totalArea?: number | null; buildingArea?: number | null; areaToBeBuilt?: number | null; validUntil?: string; technicalFacts?: Array<{ label: string; value: string }> }; processes: ProcessDetail[] };

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init, credentials: 'same-origin',
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erro HTTP ${response.status}`);
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
