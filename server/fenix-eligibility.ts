// Elegibilidade local de filtros e permissões do Fênix (somente painel local).
//
// Evidência: captura viva /tmp/fenix-capture/rede-cdp.json prova os GETs de lista
// (request/survey/technicalproject + unity/getAllCountys/occupation_group) e os
// POSTs 200 `getSolicitacoesPermitidas` / `getRetificacoesPermitidas` em
// `/app/request`. O painel não consome esses POSTs nem esses filtros novos;
// `computeFenixProcessActions` decide por heurística local de status/tipo.
//
// Este módulo é puro e local: não faz rede, não usa sessão real e nunca escreve
// no Fênix oficial. Os cuerpos de permissão são injetados pelo chamador (snapshot
// local ou dado sintético de teste); formato desconhecido vira "desconhecida",
// nunca "permitida".

export const FENIX_SOLICITACAO_FILTER_KEYS = [
  'tipoServico',
  'status',
  'renovacao',
  'evento',
  'dataInicial',
  'dataFinal',
  'protocolo',
  'n_notificacao',
  'n_acp',
  'n_avcb',
  'solicitacao',
  'seq_dae_emitido',
  'vistoriador_id',
  'analista_pt_id',
  'analista_pts_id',
] as const;

export const FENIX_PROJETO_TECNICO_FILTER_KEYS = [
  'tipoProjeto',
  'tipoIsencao',
  'creacau',
  'nomeResponsavelTecnico',
  'cpfResponsavelTecnico',
  'cnpjResponsavelTecnico',
  'projeto',
  'ocupacao',
  'divisao',
  'risco',
] as const;

export const FENIX_EDIFICACAO_FILTER_KEYS = [
  'altura',
  'area',
  'unidade',
  'municipio',
  'servidor',
  'nomeReferencia',
] as const;

export type FenixListKind = 'request' | 'survey' | 'technicalproject';

export interface FenixParsedListQuery {
  list: FenixListKind | null;
  tipoLista: string | null;
  tipoPessoa: string | null;
  ordenacao: string | null;
  orderBy: string | null;
  orderType: string | null;
  solicitacaoFiltros: Record<string, unknown>;
  projetoTecnicoFiltros: Record<string, unknown>;
  edificacaoFiltros: Record<string, unknown>;
  projetoCompleto: boolean | null;
  consultaParcial: boolean | null;
}

const KNOWN_TIPO_LISTA = new Set(['solicitacoes', 'minhas_solicitacoes', 'vistoria_revistoria']);

function parseJsonObject(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function pickKnownKeys(parsed: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const key of keys) output[key] = key in parsed ? parsed[key] : null;
  return output;
}

function queryParamsOf(input: string | URLSearchParams | Record<string, string>): URLSearchParams {
  if (typeof input === 'string') {
    const queryIndex = input.indexOf('?');
    const query = queryIndex >= 0 ? input.slice(queryIndex + 1) : input;
    return new URLSearchParams(query);
  }
  if (input instanceof URLSearchParams) return new URLSearchParams(input.toString());
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) params.set(key, value);
  return params;
}

function listKindOf(input: string): FenixListKind | null {
  const lower = String(input || '').toLowerCase();
  if (lower.includes('/survey')) return 'survey';
  if (lower.includes('/technicalproject')) return 'technicalproject';
  if (lower.includes('/request')) return 'request';
  return null;
}

function booleanOrNull(raw: string | null): boolean | null {
  if (raw === null) return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}

/** Interpreta uma query de lista do Fênix a partir da URL/params da captura viva. */
export function parseFenixListQuery(input: string | URLSearchParams | Record<string, string>): FenixParsedListQuery {
  const params = queryParamsOf(input);
  const rawTipoLista = params.get('tipo_lista');
  return {
    list: typeof input === 'string' ? listKindOf(input) : null,
    tipoLista: rawTipoLista && KNOWN_TIPO_LISTA.has(rawTipoLista) ? rawTipoLista : rawTipoLista ? null : null,
    tipoPessoa: params.get('tipoPessoa'),
    ordenacao: params.get('ordenacao'),
    orderBy: params.get('orderBy'),
    orderType: params.get('orderType'),
    solicitacaoFiltros: pickKnownKeys(
      parseJsonObject(params.get('solicitacaoFiltros')),
      FENIX_SOLICITACAO_FILTER_KEYS,
    ),
    projetoTecnicoFiltros: pickKnownKeys(
      parseJsonObject(params.get('projetoTecnicoFiltros')),
      FENIX_PROJETO_TECNICO_FILTER_KEYS,
    ),
    edificacaoFiltros: pickKnownKeys(
      parseJsonObject(params.get('edificacaoFiltros')),
      FENIX_EDIFICACAO_FILTER_KEYS,
    ),
    projetoCompleto: booleanOrNull(params.get('projeto_completo')),
    consultaParcial: booleanOrNull(params.get('consultaParcial')),
  };
}

export interface FenixListFilterInput {
  tipoLista?: string | null;
  tipoPessoa?: string | null;
  ordenacao?: string | null;
  orderBy?: string | null;
  orderType?: string | null;
  solicitacaoFiltros?: Record<string, unknown>;
  projetoTecnicoFiltros?: Record<string, unknown>;
  edificacaoFiltros?: Record<string, unknown>;
  projetoCompleto?: boolean | null;
  consultaParcial?: boolean | null;
}

/** Reconstrói a query canônica de lista (para documentar o contrato local). */
export function buildFenixListQuery(list: FenixListKind, filters: FenixListFilterInput): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.tipoLista) params.set('tipo_lista', filters.tipoLista);
  if (filters.tipoPessoa) params.set('tipoPessoa', filters.tipoPessoa);
  if (filters.ordenacao) params.set('ordenacao', filters.ordenacao);
  if (filters.orderBy) params.set('orderBy', filters.orderBy);
  if (filters.orderType) params.set('orderType', filters.orderType);
  if (list !== 'technicalproject' || filters.solicitacaoFiltros) {
    params.set('solicitacaoFiltros', JSON.stringify(filters.solicitacaoFiltros ?? {}));
  }
  params.set('projetoTecnicoFiltros', JSON.stringify(filters.projetoTecnicoFiltros ?? {}));
  params.set('edificacaoFiltros', JSON.stringify(filters.edificacaoFiltros ?? {}));
  if (filters.projetoCompleto !== undefined && filters.projetoCompleto !== null) {
    params.set('projeto_completo', String(filters.projetoCompleto));
  }
  if (filters.consultaParcial !== undefined && filters.consultaParcial !== null) {
    params.set('consultaParcial', String(filters.consultaParcial));
  }
  return params;
}

// --- Permissões como elegibilidade ---

export type PermissionSource = 'oficial' | 'desconhecida';
export type EligibilityVerdict =
  | 'oficial-permitida'
  | 'oficial-bloqueada'
  | 'heuristica-nao-confirmada'
  | 'heuristica-bloqueada';

export interface PermissionEntry {
  allowedActions: Set<string>;
}

export interface ParsedPermissionResponse {
  source: PermissionSource;
  entries: Map<string, PermissionEntry>;
}

function normalizeActionKey(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function candidateLists(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    for (const key of ['permitidas', 'permitted', 'solicitacoes', 'retificacoes', 'items', 'data']) {
      const value = record[key];
      if (Array.isArray(value)) return value;
    }
    const data = record.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const nested = data as Record<string, unknown>;
      for (const key of ['permitidas', 'permitted', 'solicitacoes', 'retificacoes', 'items']) {
        const value = nested[key];
        if (Array.isArray(value)) return value;
      }
    }
  }
  return [];
}

function entryId(entry: unknown): string {
  if (entry && typeof entry === 'object') {
    const record = entry as Record<string, unknown>;
    for (const key of ['solicitacao_id', 'solicitacaoId', 'id', 'request_id', 'retificacao_id', 'retificacaoId']) {
      const value = record[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
    }
  }
  return '';
}

function entryActions(entry: unknown): Set<string> {
  const actions = new Set<string>();
  if (entry && typeof entry === 'object') {
    const record = entry as Record<string, unknown>;
    const raw = record.acoes ?? record.actions ?? record.acoes_permitidas ?? record.allowed_actions ?? record.permitidas;
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const key = normalizeActionKey(typeof item === 'string' ? item : (item as any)?.acao ?? (item as any)?.action ?? '');
        if (key) actions.add(key);
      }
    }
  }
  return actions;
}

/**
 * Interpreta um corpo de `getSolicitacoesPermitidas` / `getRetificacoesPermitidas`.
 * A captura viva prova apenas HTTP 200; o formato exato não foi capturado, por
 * isso qualquer forma irreconhecível retorna fonte "desconhecida" com zero
 * entradas (nunca "permitida" por padrão).
 */
export function parsePermissionResponse(body: unknown, _kind: 'solicitacoes' | 'retificacoes'): ParsedPermissionResponse {
  const rows = candidateLists(body);
  if (!rows.length) return { source: 'desconhecida', entries: new Map() };
  const entries = new Map<string, PermissionEntry>();
  for (const row of rows) {
    const id = entryId(row);
    if (!id) continue;
    entries.set(id, { allowedActions: entryActions(row) });
  }
  if (!entries.size) return { source: 'desconhecida', entries: new Map() };
  return { source: 'oficial', entries };
}

export interface PermissionDecision {
  allowed: boolean | null;
  source: 'oficial' | 'heuristica';
}

/** A permissão oficial prevalece sobre a heurística; sem permissão, heurística não confirmada. */
export function resolveActionEligibility(
  _actionKey: string,
  heuristicOffered: boolean,
  permission: PermissionDecision | null | undefined,
): EligibilityVerdict {
  if (permission?.source === 'oficial') {
    return permission.allowed ? 'oficial-permitida' : 'oficial-bloqueada';
  }
  return heuristicOffered ? 'heuristica-nao-confirmada' : 'heuristica-bloqueada';
}

export type EligibilityMap = Record<string, PermissionDecision | null | undefined> | null | undefined;

interface ActionLike {
  key: string;
  kind?: string;
  [key: string]: unknown;
}

/**
 * Anota ações com `eligibility` e remove mutações explicitamente negadas pelo
 * oficial. Downloads e rascunhos locais nunca são removidos aqui.
 */
export function annotateFenixActionsWithEligibility<T extends ActionLike>(
  actions: T[],
  permissions: EligibilityMap,
): Array<T & { eligibility?: EligibilityVerdict }> {
  return actions.flatMap((action) => {
    const key = normalizeActionKey(action.key);
    const offered = true;
    const permission = permissions?.[action.key] ?? permissions?.[key] ?? null;
    const eligibility = resolveActionEligibility(key, offered, permission ?? null);
    if (action.kind === 'mutation' && eligibility === 'oficial-bloqueada') return [];
    if (action.kind === 'mutation') return [{ ...action, eligibility }];
    return [{ ...action }];
  });
}

// --- Filtros novos aplicados ao snapshot local (sem rede) ---

export interface LocalRequestFilter {
  tipoServico?: string | null;
  status?: string | null;
  renovacao?: string | null;
  evento?: string | null;
  solicitacao?: string | null;
  protocolo?: string | null;
  municipio?: string | null;
}

function fold(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Filtra linhas do snapshot local `fenix_account_requests` pelos filtros novos. */
export function filterLocalRequestsByFenixFilters<T extends Record<string, any>>(
  rows: T[],
  filters: LocalRequestFilter,
): T[] {
  const tipoServico = fold(filters.tipoServico);
  const status = fold(filters.status);
  const renovacao = fold(filters.renovacao);
  const evento = fold(filters.evento);
  const solicitacao = fold(filters.solicitacao);
  const protocolo = fold(filters.protocolo);
  const municipio = fold(filters.municipio);
  return rows.filter((row) => {
    if (tipoServico && !fold(row.service_type ?? row.serviceType).includes(tipoServico)) return false;
    if (status && !fold(row.status).includes(status)) return false;
    if (renovacao && fold(row.renewal ?? row.renovacao) !== renovacao) return false;
    if (evento && !fold(row.event ?? row.evento).includes(evento)) return false;
    if (solicitacao) {
      const hay = fold(`${row.request_number ?? row.requestNumber ?? ''} ${row.id ?? ''}`);
      if (!hay.includes(solicitacao)) return false;
    }
    if (protocolo) {
      const hay = fold(`${row.protocol_number ?? row.protocolNumber ?? ''} ${row.protocol ?? ''}`);
      if (!hay.includes(protocolo)) return false;
    }
    if (municipio && !fold(row.municipality ?? row.municipio).includes(municipio)) return false;
    return true;
  });
}
