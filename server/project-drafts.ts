import { randomUUID, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import OpenAI from 'openai';
import { db } from './store.js';
import { seal, unseal } from './crypto.js';

export function decodeDraftPayloadJson(raw: string): any {
  const trimmed = (raw || '').trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }
  try {
    return JSON.parse(unseal(trimmed));
  } catch {
    return JSON.parse(trimmed);
  }
}

// Inicialização da tabela SQLite para rascunhos de projetos técnicos
db.exec(`
CREATE TABLE IF NOT EXISTS fenix_project_drafts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  edificacao_mode TEXT NOT NULL DEFAULT 'new',
  edificacao_id INTEGER,
  payload_json TEXT NOT NULL,
  fenix_projeto_id INTEGER,
  fenix_num_projeto TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

export interface FenixCounty {
  id: number;
  municipio: string;
  habilitar: boolean;
  cod_municipio_ibge: number;
}

export interface FenixOccupationGroup {
  id: number;
  group: string;
  occupation_use: string;
}

export interface FenixDivisionGroup {
  id: number;
  division: string;
  description: string;
  typification: string;
  group_occupation_id: number;
}

export interface FenixProjectType {
  id: number;
  sigla: string;
  descricao: string;
}

export interface FenixExemption {
  id: number;
  descricao: string;
}

export interface FenixDecree {
  id: number;
  description: string;
}

export interface FenixDomains {
  counties: FenixCounty[];
  occupationGroups: FenixOccupationGroup[];
  divisionGroups: FenixDivisionGroup[];
  projectTypes: FenixProjectType[];
  exemptions: FenixExemption[];
  decrees: FenixDecree[];
  heights: string[];
  blockedPtsCnaes: string[];
}

let cachedDomains: FenixDomains | null = null;

export function getFenixDomains(): FenixDomains {
  if (!cachedDomains) {
    const raw = readFileSync(new URL('./fenix-domains.json', import.meta.url), 'utf-8');
    cachedDomains = JSON.parse(raw) as FenixDomains;
  }
  return cachedDomains;
}

export interface ProjectDraftAddress {
  zip_code?: string;
  public_place?: string;
  number?: string;
  complement?: string;
  district?: string;
  municipio_id?: number | string | null;
  county?: string;
  state?: string;
  geographic_coordinates?: string | null;
}

export interface ProjectDraftInstitution {
  tipo_pessoa?: 'PJ' | 'PF' | string;
  cnpj?: string;
  cpf?: string;
  cnpj_cpf?: string;
  razao_social?: string;
  nome_fantasia?: string;
  natureza_juridica?: string;
  cnae?: string;
  atividade_economica?: string;
  risk?: number | string;
  cobertura_fsps_sup200?: boolean;
}

export interface ProjectDraftOccupation {
  occupation_group_id?: number | null;
  division_group_id?: number | null;
  principal?: boolean;
  underground?: boolean;
  has_underground?: boolean;
  underground_occupation_group_id?: number | null;
  underground_division_group_id?: number | null;
  qtde_leitos?: number | null;
  qtde_pessoas?: number | null;
  qtde_funcionarios?: number | null;
}

export interface ProjectDraftEdification {
  reference_name?: string;
  registration?: string | null;
  building_area?: number | string;
  area_to_be_built?: number | string;
  discount_area?: number | string;
  total_area?: number | string;
  height?: string;
  number_floors?: number | string;
}

export interface ProjectDraftInput {
  id?: string;
  name?: string;
  status?: string;
  edificacao_mode?: 'new' | 'existing';
  edificacao_id?: number | string | null;
  process_category?: 'pts' | 'pt' | string;
  license_type?: 'CLCB' | 'AVCB' | string;
  isencao_id?: number;
  n_art_rrt?: string;
  reference_name?: string;
  registration?: string | null;
  building_area?: number | string;
  area_to_be_built?: number | string;
  discount_area?: number | string;
  total_area?: number | string;
  height?: string;
  number_floors?: number | string;
  edification?: ProjectDraftEdification;
  address?: ProjectDraftAddress;
  institution?: ProjectDraftInstitution;
  occupation?: ProjectDraftOccupation;
  occupationsDivisions?: Array<Record<string, unknown>>;
  proprietario?: Record<string, unknown>;
  responsavel?: Record<string, unknown>;
  responsavel_uso_igual_prop?: boolean | string;
  technical?: Record<string, unknown>;
  questionario?: {
    edf_saida_direta?: boolean;
    existe_gases_inflamaveis?: boolean;
    existe_liquidos_inflamaveis?: boolean;
    glp_12480kg?: boolean;
    gas_glp?: boolean;
    armazena_produtos_perigosos?: boolean;
    local_reuniao_publico?: boolean;
    lotacao_max_pessoas?: boolean;
    subsolo_maior_50m_pt?: boolean;
    cobertura_fibras_sape?: boolean;
    [key: string]: unknown;
  };
  securityMeasures?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BuildPayloadResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  tipoProjetoId: number;
  tipoProjetoSigla: string;
  rtOptional: boolean;
  recommendedMeasures: string[];
  fenixPayload: Record<string, unknown>;
}

export interface DraftRecord {
  id: string;
  name: string;
  status: 'draft' | 'simulated' | 'submitting' | 'submitted' | 'error';
  updatedAt: string;
  data: ProjectDraftInput;
  lastSimulation?: {
    ok: boolean;
    validation: {
      valid: boolean;
      errors: string[];
      warnings: string[];
      tipoProjetoId?: number;
      tipoProjetoSigla?: string;
      rtOptional?: boolean;
      recommendedMeasures?: string[];
      category?: string;
      license_type?: string;
    };
    fenixPayload?: Record<string, unknown>;
  };
  lastSubmission?: {
    ok: boolean;
    result?: unknown;
    error?: string;
  };
}

export function buildAndValidateFenixProjectPayload(
  input: ProjectDraftInput,
  fenixUserId?: number | null
): BuildPayloadResult {
  const domains = getFenixDomains();
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!fenixUserId) {
    warnings.push('ID de solicitante Fênix não identificado na sessão; usando ID de referência para simulação.');
  }

  // 1. Extração normalizada de campos (compatível com raiz ou objeto aninhado)
  const reference_name = String(input.reference_name || input.edification?.reference_name || '').trim();
  const registration = input.registration ?? input.edification?.registration ?? null;
  const building_area = input.building_area ?? input.edification?.building_area ?? 0;
  const area_to_be_built = input.area_to_be_built ?? input.edification?.area_to_be_built ?? 0;
  const discount_area = input.discount_area ?? input.edification?.discount_area ?? 0;
  const height = String(input.height || input.edification?.height || '').trim();
  const number_floors = input.number_floors ?? input.edification?.number_floors ?? 1;
  const process_category = String(input.process_category || 'pts').toLowerCase();
  const license_type = String(input.license_type || 'CLCB').toUpperCase();

  // 2. Validação e formatação do CEP
  const rawZip = String(input.address?.zip_code || '').trim();
  const cleanZip = rawZip.replace(/\D/g, '');
  if (cleanZip.length !== 8) {
    errors.push('CEP deve conter exatamente 8 dígitos numéricos.');
  }

  // 3. Complemento de Endereço (exigência do Fênix: se vazio, preencher com "***")
  let complement = input.address?.complement ? String(input.address.complement).trim() : '';
  if (!complement) {
    complement = '***';
    warnings.push("Complemento não informado; preenchido automaticamente com '***' conforme exigência do Fênix.");
  }

  // 4. Município
  const munId = Number(input.address?.municipio_id);
  const countyObj = domains.counties.find((c) => c.id === munId);
  let county = '';
  if (!countyObj || countyObj.habilitar === false) {
    errors.push('Município não encontrado no Fênix ou não habilitado para tramitação.');
    county = String(input.address?.county || '').toUpperCase();
  } else {
    county = countyObj.municipio.toUpperCase();
  }

  // 5. Áreas
  const bArea = Number(building_area) || 0;
  const toBuildArea = Number(area_to_be_built) || 0;
  const discArea = Number(discount_area) || 0;
  const totalArea = Number((bArea + toBuildArea - discArea).toFixed(2));

  if (discArea > bArea + toBuildArea) {
    errors.push('Área a descontar não pode ser maior que a soma das áreas construída e a construir.');
  }
  if (totalArea <= 0) {
    errors.push('A área total deve ser maior que zero.');
  }

  // 6. Altura e Pavimentos
  if (!domains.heights.includes(height)) {
    errors.push('Altura informada não corresponde a um dos 6 valores oficiais do Fênix.');
  }
  const floors = Number(number_floors);
  if (!Number.isInteger(floors) || floors < 1) {
    errors.push('Número de pavimentos deve ser de no mínimo 1.');
  }
  if (height === 'Térrea = Um pavimento' && floors !== 1) {
    errors.push("Para altura 'Térrea = Um pavimento', o número de pavimentos deve ser 1.");
  }

  // 7. CNAE e Enquadramento de Tipo de Projeto
  const cleanCnae = String(input.institution?.cnae || '').replace(/\D/g, '');
  let tipoProjetoId: number;
  let tipoProjetoSigla: string;

  if (process_category === 'pt') {
    tipoProjetoId = 1;
    tipoProjetoSigla = 'PT';
  } else {
    // Processo PTS (padrão)
    if (totalArea > 750 || floors > 3) {
      errors.push('Para Projeto Técnico Simplificado (PTS), a área total deve ser de até 750 m² e até 3 pavimentos.');
    }
    if (domains.blockedPtsCnaes.includes(cleanCnae)) {
      errors.push('Este CNAE exige Projeto Técnico Completo (PT) mesmo com área reduzida.');
    }

    if (license_type === 'AVCB') {
      tipoProjetoId = 6;
      tipoProjetoSigla = 'PTSAVCB';
    } else if (totalArea <= 200 && floors <= 2) {
      tipoProjetoId = 4;
      tipoProjetoSigla = 'PTSCLCB1';
    } else {
      tipoProjetoId = 5;
      tipoProjetoSigla = 'PTSCLCB2';
    }
  }

  // 8. RT Opcional (dispensa de ART/RRT quando PTSCLCB1 e saída direta para a via pública)
  const rtOptional = tipoProjetoId === 4 && Boolean(input.questionario?.edf_saida_direta);

  // 9. Ocupações e Subsolo
  const occupationsDivisions: Array<Record<string, unknown>> = [];
  if (Array.isArray(input.occupationsDivisions) && input.occupationsDivisions.length > 0) {
    occupationsDivisions.push(...input.occupationsDivisions);
  } else {
    // Monta a partir de input.occupation
    occupationsDivisions.push({
      occupation_group_id: input.occupation?.occupation_group_id || 1,
      division_group_id: input.occupation?.division_group_id || 1,
      principal: true,
      underground: false,
      qtde_leitos: input.occupation?.qtde_leitos ?? null,
      qtde_pessoas: input.occupation?.qtde_pessoas ?? null,
      qtde_funcionarios: input.occupation?.qtde_funcionarios ?? null
    });
    if (input.occupation?.has_underground && input.occupation?.underground_occupation_group_id) {
      occupationsDivisions.push({
        occupation_group_id: input.occupation.underground_occupation_group_id,
        division_group_id: input.occupation.underground_division_group_id || 1,
        principal: false,
        underground: true,
        qtde_leitos: null,
        qtde_pessoas: null,
        qtde_funcionarios: null
      });
    }
  }

  // Se não houver subsolo explicitamente marcado com underground: true:
  const hasUndergroundEntry = occupationsDivisions.some((item) => item.underground === true);
  if (!hasUndergroundEntry) {
    occupationsDivisions.push({
      occupation_group_id: 13,
      division_group_id: 58,
      principal: false,
      underground: true,
      qtde_leitos: null,
      qtde_pessoas: null,
      qtde_funcionarios: null
    });
  }

  // 10. Medidas Recomendadas conforme Porte/Tipo
  let recommendedMeasures: string[] = [];
  if (tipoProjetoId === 4) {
    recommendedMeasures = ['iluminacao_emerg', 'sinal_emerg', 'extintores', 'saidas_emerg'];
  } else if (tipoProjetoId === 5 || tipoProjetoId === 6) {
    recommendedMeasures = ['iluminacao_emerg', 'sinal_emerg', 'extintores', 'saidas_emerg', 'brigada_incendio'];
  } else if (tipoProjetoId === 1) {
    recommendedMeasures = [
      'acesso_viatura',
      'seguranca_estrutural',
      'comp_horizontal',
      'control_mat_acab',
      'saidas_emerg',
      'brigada_incendio',
      'iluminacao_emerg',
      'deteccao_incendio',
      'alarme_incendio',
      'sinal_emerg',
      'extintores',
      'hidrante_mangot'
    ];
  } else {
    recommendedMeasures = ['iluminacao_emerg', 'sinal_emerg', 'extintores', 'saidas_emerg', 'brigada_incendio'];
  }

  // 11. Montagem do payload idêntico ao dataResource do Fênix
  const regValue = registration ? String(registration).trim() : null;
  const registrationZipCode = `${regValue || 'null'}-${cleanZip}`;

  const rawCnpjCpf = String(input.institution?.cnpj_cpf || input.institution?.cnpj || input.institution?.cpf || '').replace(/\D/g, '');
  const tipoPessoa = input.institution?.tipo_pessoa || (rawCnpjCpf.length === 11 ? 'PF' : 'PJ');

  const fenixPayload: Record<string, unknown> = {
    edificacao_id: input.edificacao_mode === 'existing' && input.edificacao_id ? input.edificacao_id : 'new',
    reference_name,
    registration: regValue,
    registration_zip_code: registrationZipCode,
    building_area: bArea.toFixed(2),
    area_to_be_built: toBuildArea.toFixed(2),
    discount_area: discArea.toFixed(2),
    total_area: totalArea.toFixed(2),
    height,
    number_floors: floors,
    address: {
      zip_code: cleanZip,
      public_place: String(input.address?.public_place || ''),
      number: String(input.address?.number || 'S/N'),
      complement,
      district: String(input.address?.district || ''),
      county,
      municipio_id: munId,
      state: 'BA',
      geographic_coordinates: input.address?.geographic_coordinates ?? null
    },
    institution: {
      tipo_pessoa: tipoPessoa,
      cnpj: tipoPessoa === 'PJ' ? (input.institution?.cnpj ? String(input.institution.cnpj).replace(/\D/g, '') : rawCnpjCpf) : '',
      cpf: tipoPessoa === 'PF' ? (input.institution?.cpf ? String(input.institution.cpf).replace(/\D/g, '') : rawCnpjCpf) : '',
      razao_social: String(input.institution?.razao_social || ''),
      nome_fantasia: String(input.institution?.nome_fantasia || input.institution?.razao_social || ''),
      natureza_juridica: String(input.institution?.natureza_juridica || 'Empresa de Pequeno Porte (EPP)'),
      cnae: cleanCnae,
      atividade_economica: String(input.institution?.atividade_economica || ''),
      risk: typeof input.institution?.risk === 'number' ? input.institution.risk : Number(input.institution?.risk) || 300,
      cobertura_fsps_sup200: Boolean(input.institution?.cobertura_fsps_sup200 || input.questionario?.cobertura_fibras_sape)
    },
    occupationsDivisions,
    proprietario: input.proprietario || {},
    responsavel: input.responsavel || {},
    technical: input.technical || {},
    questionario: input.questionario || {},
    securityMeasures: input.securityMeasures || {},
    tipo_projeto_id: tipoProjetoId,
    isencao_id: input.isencao_id || 1,
    n_art_rrt: String(input.n_art_rrt || (input.technical as any)?.n_art_rrt || ''),
    solicitante: { id: fenixUserId || 14574 }
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    tipoProjetoId,
    tipoProjetoSigla,
    rtOptional,
    recommendedMeasures,
    fenixPayload
  };
}

function rowToDraftRecord(row: {
  id: string;
  user_id: string;
  status: string;
  edificacao_mode: string;
  edificacao_id: number | null;
  payload_json: string;
  fenix_projeto_id: number | null;
  fenix_num_projeto: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}): DraftRecord {
  let parsed: any = {};
  try {
    parsed = decodeDraftPayloadJson(row.payload_json);
  } catch {}

  const inputData: ProjectDraftInput = parsed.data || parsed.input || parsed;
  const name =
    parsed.name ||
    inputData.name ||
    inputData.reference_name ||
    inputData.edification?.reference_name ||
    'Rascunho de Projeto';

  return {
    id: row.id,
    name,
    status: row.status as DraftRecord['status'],
    updatedAt: row.updated_at,
    data: inputData,
    lastSimulation: parsed.lastSimulation,
    lastSubmission:
      parsed.lastSubmission ||
      (row.fenix_projeto_id
        ? {
            ok: true,
            result: {
              id: row.fenix_projeto_id,
              num_projeto: row.fenix_num_projeto
            }
          }
        : row.last_error
        ? {
            ok: false,
            error: row.last_error
          }
        : undefined)
  };
}

export function listProjectDrafts(userId: string): DraftRecord[] {
  const rows = db
    .prepare(
      'SELECT * FROM fenix_project_drafts WHERE user_id = ? ORDER BY updated_at DESC'
    )
    .all(userId) as any[];
  return rows.map(rowToDraftRecord);
}

export function getProjectDraft(userId: string, id: string): DraftRecord | undefined {
  const row = db
    .prepare('SELECT * FROM fenix_project_drafts WHERE user_id = ? AND id = ?')
    .get(userId, id) as any;
  if (!row) return undefined;
  return rowToDraftRecord(row);
}

export function upsertProjectDraft(
  userId: string,
  input: ProjectDraftInput,
  id?: string
): DraftRecord {
  const draftId = id || input.id || randomUUID();
  const now = new Date().toISOString();
  const existing = db
    .prepare('SELECT * FROM fenix_project_drafts WHERE id = ? AND user_id = ?')
    .get(draftId, userId) as any;

  const status = input.status || (existing ? existing.status : 'draft');
  const edificacaoMode = input.edificacao_mode || (existing ? existing.edificacao_mode : 'new');
  const edificacaoId =
    input.edificacao_id !== undefined
      ? (Number(input.edificacao_id) || null)
      : (existing ? existing.edificacao_id : null);

  let storedPayload: any = {};
  if (existing) {
    try {
      storedPayload = decodeDraftPayloadJson(existing.payload_json);
    } catch {}
  }

  const name =
    input.name ||
    input.reference_name ||
    input.edification?.reference_name ||
    storedPayload.name ||
    'Rascunho de Projeto';

  const updatedPayload = {
    ...storedPayload,
    name,
    data: input
  };

  const encryptedPayload = seal(JSON.stringify(updatedPayload));

  if (existing) {
    db.prepare(`
      UPDATE fenix_project_drafts 
      SET status = ?, edificacao_mode = ?, edificacao_id = ?, payload_json = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(status, edificacaoMode, edificacaoId, encryptedPayload, now, draftId, userId);
  } else {
    db.prepare(`
      INSERT INTO fenix_project_drafts (id, user_id, status, edificacao_mode, edificacao_id, payload_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(draftId, userId, status, edificacaoMode, edificacaoId, encryptedPayload, now, now);
  }

  return getProjectDraft(userId, draftId)!;
}

export function updateDraftSimulation(
  userId: string,
  id: string,
  simulationResult: BuildPayloadResult
): DraftRecord | undefined {
  const draft = getProjectDraft(userId, id);
  if (!draft) return undefined;

  const row = db
    .prepare('SELECT payload_json FROM fenix_project_drafts WHERE id = ? AND user_id = ?')
    .get(id, userId) as any;
  let storedPayload: any = {};
  try {
    storedPayload = decodeDraftPayloadJson(row?.payload_json || '{}');
  } catch {}

  const nextStatus = simulationResult.valid ? 'simulated' : 'draft';
  const now = new Date().toISOString();

  storedPayload.lastSimulation = {
    ok: simulationResult.valid,
    validation: {
      valid: simulationResult.valid,
      errors: simulationResult.errors,
      warnings: simulationResult.warnings,
      tipoProjetoId: simulationResult.tipoProjetoId,
      tipoProjetoSigla: simulationResult.tipoProjetoSigla,
      rtOptional: simulationResult.rtOptional,
      recommendedMeasures: simulationResult.recommendedMeasures
    },
    fenixPayload: simulationResult.fenixPayload
  };

  const encryptedPayload = seal(JSON.stringify(storedPayload));

  db.prepare(`
    UPDATE fenix_project_drafts 
    SET status = ?, payload_json = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(nextStatus, encryptedPayload, now, id, userId);

  return getProjectDraft(userId, id);
}

export function updateDraftSubmission(
  userId: string,
  id: string,
  submissionResult: {
    ok: boolean;
    result?: { id: number; num_projeto: string; edificacao_id?: number; solicitacao_id?: number };
    error?: string;
  }
): DraftRecord | undefined {
  const draft = getProjectDraft(userId, id);
  if (!draft) return undefined;

  const row = db
    .prepare('SELECT payload_json FROM fenix_project_drafts WHERE id = ? AND user_id = ?')
    .get(id, userId) as any;
  let storedPayload: any = {};
  try {
    storedPayload = decodeDraftPayloadJson(row?.payload_json || '{}');
  } catch {}

  const now = new Date().toISOString();
  storedPayload.lastSubmission = submissionResult;
  const encryptedPayload = seal(JSON.stringify(storedPayload));

  if (submissionResult.ok && submissionResult.result) {
    db.prepare(`
      UPDATE fenix_project_drafts 
      SET status = 'submitted', fenix_projeto_id = ?, fenix_num_projeto = ?, last_error = NULL, payload_json = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      submissionResult.result.id,
      submissionResult.result.num_projeto,
      encryptedPayload,
      now,
      id,
      userId
    );
  } else {
    db.prepare(`
      UPDATE fenix_project_drafts 
      SET status = 'error', last_error = ?, payload_json = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      submissionResult.error || 'Falha desconhecida no envio ao Fênix.',
      encryptedPayload,
      now,
      id,
      userId
    );
  }

  return getProjectDraft(userId, id);
}

export function acquireDraftSubmissionLock(
  userId: string,
  draftId: string
): { acquired: boolean; reason?: 'not_found' | 'already_submitted' | 'already_submitting' } {
  const row = db
    .prepare('SELECT status FROM fenix_project_drafts WHERE id = ? AND user_id = ?')
    .get(draftId, userId) as { status: string } | undefined;

  if (!row) {
    return { acquired: false, reason: 'not_found' };
  }
  if (row.status === 'submitted') {
    return { acquired: false, reason: 'already_submitted' };
  }
  if (row.status === 'submitting') {
    return { acquired: false, reason: 'already_submitting' };
  }

  const now = new Date().toISOString();
  const res = db
    .prepare(
      `UPDATE fenix_project_drafts 
       SET status = 'submitting', updated_at = ?
       WHERE id = ? AND user_id = ? AND status NOT IN ('submitted', 'submitting')`
    )
    .run(now, draftId, userId);

  if (res.changes === 0) {
    return { acquired: false, reason: 'already_submitting' };
  }

  return { acquired: true };
}

export function deleteProjectDraft(userId: string, id: string): boolean {
  const res = db
    .prepare('DELETE FROM fenix_project_drafts WHERE user_id = ? AND id = ?')
    .run(userId, id);
  return res.changes > 0;
}

export function simulateProjectDraft(
  input: ProjectDraftInput,
  fenixUserId?: number | null
): BuildPayloadResult {
  return buildAndValidateFenixProjectPayload(input, fenixUserId);
}

export const FENIX_28_SECURITY_MEASURES = [
  'acesso_viatura_edificacao',
  'seguranca_estrutural_contra_incendio',
  'compartimentacao_horizontal',
  'compartimentacao_vertical',
  'controle_materiais_acabamento',
  'saidas_emergencia',
  'elevador_emergencia',
  'controle_fumaca',
  'iluminacao_emergencia',
  'deteccao_incendio',
  'alarme_incendio',
  'sinalizacao_emergencia',
  'extintores',
  'hidrante_mangotinhos',
  'chuveiros_automaticos',
  'resfriamento',
  'espuma',
  'sistema_fixo_gases_limpos',
  'brigada_incendio',
  'plano_emergencia',
  'spda',
  'controle_fontes_ignicao',
  'central_glp',
  'separacao_entre_edificacoes',
  'bloqueio_fumaca',
  'pressurizacao_escadas',
  'sinalizacao_rotas_resgate',
  'sistema_pararaios'
] as const;

export type FenixSecurityMeasureKey = typeof FENIX_28_SECURITY_MEASURES[number];

export function mapIt14MeasuresToFenix(rawMeasures: string[]): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const key of FENIX_28_SECURITY_MEASURES) {
    result[key] = false;
  }

  const normalizedItems = (rawMeasures || []).map((item) =>
    String(item || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
  );

  for (const item of normalizedItems) {
    if (item.includes('acesso de viatura')) result.acesso_viatura_edificacao = true;
    if (item.includes('seguranca estrutural')) result.seguranca_estrutural_contra_incendio = true;
    if (item.includes('compartimentacao horizontal')) result.compartimentacao_horizontal = true;
    if (item.includes('compartimentacao vertical')) result.compartimentacao_vertical = true;
    if (item.includes('controle de materiais de acabamento') || item.includes('controle de material de acabamento')) result.controle_materiais_acabamento = true;
    if (item.includes('saidas de emergencia') || item.includes('saida de emergencia')) result.saidas_emergencia = true;
    if (item.includes('controle de fumaca')) result.controle_fumaca = true;
    if (item.includes('plano de emergencia')) result.plano_emergencia = true;
    if (item.includes('brigada')) result.brigada_incendio = true;
    if (item.includes('iluminacao de emergencia')) result.iluminacao_emergencia = true;
    if (item.includes('deteccao de incendio')) result.deteccao_incendio = true;
    if (item.includes('alarme de incendio')) result.alarme_incendio = true;
    if (item.includes('sinalizacao de emergencia')) result.sinalizacao_emergencia = true;
    if (item.includes('extintor')) result.extintores = true;
    if (item.includes('hidrante') || item.includes('mangotinho')) result.hidrante_mangotinhos = true;
    if (item.includes('chuveiros automaticos') || item.includes('sprinkler')) result.chuveiros_automaticos = true;
    if (item.includes('resfriamento')) result.resfriamento = true;
    if (item.includes('espuma')) result.espuma = true;
    if (item.includes('gases limpos') || item.includes('co2')) result.sistema_fixo_gases_limpos = true;
    if (item.includes('descargas atmosfericas') || item.includes('spda')) result.spda = true;
    if (item.includes('fontes de ignicao')) result.controle_fontes_ignicao = true;
    if (item.includes('central de glp')) result.central_glp = true;
    if (item.includes('elevador de emergencia')) result.elevador_emergencia = true;
    if (item.includes('separacao entre')) result.separacao_entre_edificacoes = true;
    if (item.includes('bloqueio de fumaca')) result.bloqueio_fumaca = true;
    if (item.includes('pressurizacao')) result.pressurizacao_escadas = true;
  }

  return result;
}

export interface CnpjIt14LookupResult {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  source: 'it14_aba' | 'brasilapi_fallback';
  address: {
    zip_code: string;
    street: string;
    number: string;
    complement: string;
    neighborhood: string;
    municipio_raw: string;
    uf: string;
    county_id: number | null;
    county: string;
  };
  contact: {
    phone: string;
    email: string;
  };
  it14: {
    areaBand: 'ate_200' | '200_750' | 'acima_750';
    alturaMeters: number;
    classificacao_risco: string | null;
    tipo_processo_sugerido: 'CLCB' | 'AVCB' | null;
    project_type_sugerido: 'PT' | 'PTS';
    inspection_sugerida: 'Sim' | 'Não';
    occupation_group_id: number | null;
    division_group_id: number | null;
    divisao_code: string | null;
    grupo_code: string | null;
    cnae: string;
    atividade_economica: string;
    qfi_mj_m2: number | null;
    mappedMeasures: Record<string, boolean>;
    rawMeasures: string[];
    motivo_classificacao: string[];
    notas_especificas: string[];
    notas_gerais: string[];
    alertas: string[];
    brigada: { nivel_treinamento?: string; descricao?: string } | null;
    allCnaes: Array<{
      cnae: string;
      descricao: string;
      principal: boolean;
      divisao: string | null;
      grupo: string | null;
      occupation_group_id: number | null;
      division_group_id: number | null;
      qfi_mj_m2: number | null;
      classificacao_risco: string | null;
      tipo_processo: string | null;
      rawMeasures: string[];
      mappedMeasures: Record<string, boolean>;
    }>;
  };
}

export async function lookupCnpjAndIt14(
  rawCnpj: string,
  options?: { areaM2?: number; floors?: number; height?: string }
): Promise<CnpjIt14LookupResult> {
  const cleanCnpj = String(rawCnpj || '').replace(/\D/g, '');
  if (cleanCnpj.length !== 14) {
    throw new Error('CNPJ deve conter 14 dígitos numéricos.');
  }

  const areaM2 = Number(options?.areaM2 || 0);
  let areaBand: 'ate_200' | '200_750' | 'acima_750';
  if (areaM2 > 750) {
    areaBand = 'acima_750';
  } else if (areaM2 > 200) {
    areaBand = '200_750';
  } else {
    areaBand = 'ate_200';
  }

  let alturaMeters = 0;
  const height = String(options?.height || '').trim();
  const floors = Number(options?.floors || 0);

  if (height === 'Alta = Acima de 30,00 m') {
    alturaMeters = 35;
  } else if (height === 'Medianamente Alta = 23,00 m < H <= 30,00 m') {
    alturaMeters = 26;
  } else if (height === 'Média = 12,00 m < H <= 23,00 m') {
    alturaMeters = 18;
  } else if (height === 'Baixa-Média = 6,00 m < H <= 12,00 m') {
    alturaMeters = 10;
  } else if (height === 'Baixa = H <= 6,00 m') {
    alturaMeters = 6;
  } else if (height === 'Térrea = Um pavimento') {
    alturaMeters = 0;
  } else if (floors > 1) {
    alturaMeters = (floors - 1) * 3;
  } else {
    alturaMeters = 0;
  }

  let it14Data: any = null;
  let source: 'it14_aba' | 'brasilapi_fallback' = 'it14_aba';

  try {
    const handshakeRes = await fetch('https://it14.abaincendio.com.br/api/security/handshake', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    if (!handshakeRes.ok) throw new Error(`Handshake retornou HTTP ${handshakeRes.status}`);

    const setCookie = handshakeRes.headers.get('set-cookie') || '';
    const cookieMatch = setCookie.match(/calcrisco_key=([^;]+)/);
    const cookieId = cookieMatch ? cookieMatch[1] : '';
    const { seed, timestamp } = (await handshakeRes.json()) as { seed: string; timestamp: number };

    const secret = process.env.IT14_CLIENT_SECRET || 'calcrisco-client-secret-v1';
    const signature = createHmac('sha256', secret)
      .update(`${seed}${timestamp}${cookieId}`)
      .digest('hex');
    const token = `${timestamp}:${seed}:${signature}`;

    const it14Res = await fetch(
      `https://it14.abaincendio.com.br/api/cnpj/${cleanCnpj}?area=${areaBand}&altura=${alturaMeters}&uf=BA`,
      {
        headers: {
          Accept: 'application/json',
          'X-Secure-Token': token,
          Cookie: `calcrisco_key=${cookieId}`
        },
        signal: AbortSignal.timeout(8000)
      }
    );
    if (!it14Res.ok) throw new Error(`IT14 retornou HTTP ${it14Res.status}`);
    it14Data = await it14Res.json();
  } catch {
    source = 'brasilapi_fallback';
    const brasilApiRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'FenixPainel/1.0 (Mozilla/5.0)'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!brasilApiRes.ok) {
      throw new Error(`Não foi possível consultar o CNPJ nem no IT-14 nem na BrasilAPI (HTTP ${brasilApiRes.status}).`);
    }
    it14Data = await brasilApiRes.json();
  }

  const domains = getFenixDomains();

  const razao_social = String(it14Data.razao_social || '').trim();
  const nome_fantasia = String(it14Data.nome_fantasia || razao_social).trim();

  let zip_code = '';
  let street = '';
  let number = 'S/N';
  let complement = '';
  let neighborhood = '';
  let municipio_raw = '';
  let uf = 'BA';
  let phone = '';
  let email = '';

  if (source === 'it14_aba') {
    const end = it14Data.dados_cadastrais?.endereco || {};
    zip_code = String(end.cep || '').replace(/\D/g, '');
    street = [end.tipo_logradouro, end.logradouro].filter(Boolean).join(' ').trim();
    number = String(end.numero || 'S/N').trim();
    complement = String(end.complemento || '').trim();
    neighborhood = String(end.bairro || '').trim();
    municipio_raw = String(end.municipio || '').trim();
    uf = String(end.uf || 'BA').trim().toUpperCase();

    const cont = it14Data.dados_cadastrais?.contato || {};
    phone = String(cont.telefone_1 || cont.telefone_2 || '').trim();
    email = String(cont.email || '').trim();
  } else {
    zip_code = String(it14Data.cep || '').replace(/\D/g, '');
    street =
      [it14Data.descricao_tipo_de_logradouro, it14Data.logradouro].filter(Boolean).join(' ').trim() ||
      String(it14Data.logradouro || '').trim();
    number = String(it14Data.numero || 'S/N').trim();
    complement = String(it14Data.complemento || '').trim();
    neighborhood = String(it14Data.bairro || '').trim();
    municipio_raw = String(it14Data.municipio || '').trim();
    uf = String(it14Data.uf || 'BA').trim().toUpperCase();

    phone = [it14Data.ddd_telefone_1, it14Data.ddd_telefone_2].filter(Boolean).join(' / ').trim();
    email = String(it14Data.email || '').trim();
  }

  function normalizeString(val: unknown): string {
    return String(val || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();
  }

  const normMun = normalizeString(municipio_raw);
  const matchedCounty = domains.counties.find(
    (c) => normalizeString(c.municipio) === normMun
  );
  const county_id = matchedCounty ? matchedCounty.id : null;
  const county = matchedCounty ? matchedCounty.municipio.toUpperCase() : '';

  function matchFenixDivision(
    divisaoCode?: string | null,
    grupoCode?: string | null
  ): {
    division_group_id: number | null;
    occupation_group_id: number | null;
    divisao_code: string | null;
    grupo_code: string | null;
  } {
    if (divisaoCode) {
      const cleanDiv = divisaoCode.trim().toUpperCase();
      const d = domains.divisionGroups.find(
        (dg) => dg.division.trim().toUpperCase() === cleanDiv
      );
      if (d) {
        return {
          division_group_id: d.id,
          occupation_group_id: d.group_occupation_id,
          divisao_code: d.division,
          grupo_code: grupoCode || null
        };
      }
    }
    if (grupoCode) {
      const cleanGroup = grupoCode.trim().toUpperCase();
      const g = domains.occupationGroups.find(
        (og) => og.group.trim().toUpperCase() === cleanGroup
      );
      return {
        division_group_id: null,
        occupation_group_id: g ? g.id : null,
        divisao_code: divisaoCode || null,
        grupo_code: grupoCode || null
      };
    }
    return {
      division_group_id: null,
      occupation_group_id: null,
      divisao_code: divisaoCode || null,
      grupo_code: grupoCode || null
    };
  }

  const allCnaes: Array<{
    cnae: string;
    descricao: string;
    principal: boolean;
    divisao: string | null;
    grupo: string | null;
    occupation_group_id: number | null;
    division_group_id: number | null;
    qfi_mj_m2: number | null;
    classificacao_risco: string | null;
    tipo_processo: string | null;
    rawMeasures: string[];
    mappedMeasures: Record<string, boolean>;
  }> = [];

  if (source === 'it14_aba') {
    if (it14Data.cnae_principal) {
      const cp = it14Data.cnae_principal;
      const cleanCode = String(cp.cnae || '').replace(/\D/g, '');
      const divMatch = matchFenixDivision(cp.divisao, cp.grupo);
      const rawMeasures = Array.isArray(cp.medidas_seguranca) ? cp.medidas_seguranca : [];
      allCnaes.push({
        cnae: cleanCode,
        descricao: String(cp.descricao || ''),
        principal: true,
        divisao: cp.divisao || null,
        grupo: cp.grupo || null,
        occupation_group_id: divMatch.occupation_group_id,
        division_group_id: divMatch.division_group_id,
        qfi_mj_m2: typeof cp.qfi_mj_m2 === 'number' ? cp.qfi_mj_m2 : null,
        classificacao_risco: cp.classificacao_risco || null,
        tipo_processo: cp.tipo_processo || null,
        rawMeasures,
        mappedMeasures: mapIt14MeasuresToFenix(rawMeasures)
      });
    }

    if (Array.isArray(it14Data.cnaes_secundarios)) {
      for (const cs of it14Data.cnaes_secundarios) {
        const cleanCode = String(cs.cnae || '').replace(/\D/g, '');
        const divMatch = matchFenixDivision(cs.divisao, cs.grupo);
        const rawMeasures = Array.isArray(cs.medidas_seguranca) ? cs.medidas_seguranca : [];
        allCnaes.push({
          cnae: cleanCode,
          descricao: String(cs.descricao || ''),
          principal: false,
          divisao: cs.divisao || null,
          grupo: cs.grupo || null,
          occupation_group_id: divMatch.occupation_group_id,
          division_group_id: divMatch.division_group_id,
          qfi_mj_m2: typeof cs.qfi_mj_m2 === 'number' ? cs.qfi_mj_m2 : null,
          classificacao_risco: cs.classificacao_risco || null,
          tipo_processo: cs.tipo_processo || null,
          rawMeasures,
          mappedMeasures: mapIt14MeasuresToFenix(rawMeasures)
        });
      }
    }
  } else {
    if (it14Data.cnae_fiscal) {
      const cleanCode = String(it14Data.cnae_fiscal).replace(/\D/g, '');
      allCnaes.push({
        cnae: cleanCode,
        descricao: String(it14Data.cnae_fiscal_descricao || ''),
        principal: true,
        divisao: null,
        grupo: null,
        occupation_group_id: null,
        division_group_id: null,
        qfi_mj_m2: null,
        classificacao_risco: null,
        tipo_processo: null,
        rawMeasures: [],
        mappedMeasures: mapIt14MeasuresToFenix([])
      });
    }
    if (Array.isArray(it14Data.cnaes_secundarios)) {
      for (const cs of it14Data.cnaes_secundarios) {
        const cleanCode = String(cs.codigo || cs.cnae || '').replace(/\D/g, '');
        allCnaes.push({
          cnae: cleanCode,
          descricao: String(cs.descricao || ''),
          principal: false,
          divisao: null,
          grupo: null,
          occupation_group_id: null,
          division_group_id: null,
          qfi_mj_m2: null,
          classificacao_risco: null,
          tipo_processo: null,
          rawMeasures: [],
          mappedMeasures: mapIt14MeasuresToFenix([])
        });
      }
    }
  }

  let refCnae = allCnaes.find((c) => c.principal && c.divisao);
  if (!refCnae && it14Data.maior_carga?.cnae) {
    const mcClean = String(it14Data.maior_carga.cnae).replace(/\D/g, '');
    refCnae = allCnaes.find((c) => c.cnae === mcClean);
  }
  if (!refCnae) {
    refCnae = allCnaes.find((c) => c.principal) || allCnaes[0];
  }

  let project_type_sugerido: 'PT' | 'PTS' = 'PTS';
  let inspection_sugerida: 'Sim' | 'Não' = 'Não';

  const refCode = refCnae?.cnae || '';
  const isBlockedCnae = domains.blockedPtsCnaes.includes(refCode);

  if (areaM2 > 750 || (options?.floors || 1) > 3 || isBlockedCnae) {
    project_type_sugerido = 'PT';
    inspection_sugerida = 'Sim';
  } else if (refCnae?.tipo_processo === 'AVCB') {
    project_type_sugerido = 'PTS';
    inspection_sugerida = 'Sim';
  } else {
    project_type_sugerido = 'PTS';
    inspection_sugerida = 'Não';
  }

  const rawMeasures =
    refCnae?.rawMeasures || (Array.isArray(it14Data.medidas_seguranca) ? it14Data.medidas_seguranca : []);
  const mappedMeasures = refCnae?.mappedMeasures || mapIt14MeasuresToFenix(rawMeasures);

  const motivo_classificacao = Array.isArray(it14Data.motivo_classificacao)
    ? it14Data.motivo_classificacao
    : Array.isArray(it14Data.cnae_principal?.motivo_classificacao)
    ? it14Data.cnae_principal.motivo_classificacao
    : Array.isArray(it14Data.maior_carga?.motivo_classificacao)
    ? it14Data.maior_carga.motivo_classificacao
    : [];

  const notas_especificas = Array.isArray(it14Data.notas_especificas)
    ? it14Data.notas_especificas
    : Array.isArray(it14Data.cnae_principal?.notas_especificas)
    ? it14Data.cnae_principal.notas_especificas
    : [];

  const notas_gerais = Array.isArray(it14Data.notas_gerais)
    ? it14Data.notas_gerais
    : Array.isArray(it14Data.cnae_principal?.notas_gerais)
    ? it14Data.cnae_principal.notas_gerais
    : [];

  const alertas = Array.isArray(it14Data.alertas)
    ? it14Data.alertas
    : Array.isArray(it14Data.cnae_principal?.alertas)
    ? it14Data.cnae_principal.alertas
    : [];

  const brigada = it14Data.cnae_principal?.brigada || null;

  return {
    cnpj: cleanCnpj,
    razao_social,
    nome_fantasia,
    source,
    address: {
      zip_code,
      street,
      number,
      complement,
      neighborhood,
      municipio_raw,
      uf,
      county_id,
      county
    },
    contact: {
      phone,
      email
    },
    it14: {
      areaBand,
      alturaMeters,
      classificacao_risco: refCnae?.classificacao_risco || (it14Data.classificacao_risco as string) || null,
      tipo_processo_sugerido: (refCnae?.tipo_processo as 'CLCB' | 'AVCB' | null) || null,
      project_type_sugerido,
      inspection_sugerida,
      occupation_group_id: refCnae?.occupation_group_id || null,
      division_group_id: refCnae?.division_group_id || null,
      divisao_code: refCnae?.divisao || null,
      grupo_code: refCnae?.grupo || null,
      cnae: refCnae?.cnae || '',
      atividade_economica: refCnae?.descricao || '',
      qfi_mj_m2: refCnae?.qfi_mj_m2 ?? null,
      mappedMeasures,
      rawMeasures,
      motivo_classificacao,
      notas_especificas,
      notas_gerais,
      alertas,
      brigada,
      allCnaes
    }
  };
}

export interface DraftAiAssistantRequest {
  message: string;
  currentDraft: Partial<ProjectDraftInput>;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  systemContext?: {
    activeBuilding?: {
      id: string;
      reference: string;
      municipality: string;
      area?: string;
      floors?: string;
      height?: string;
      processes?: Array<{ protocol: string; type: string; status: string; stage: string; updatedAt: string }>;
    } | null;
    metricsSummary?: {
      totalBuildings: number;
      inAnalysis: number;
      notified: number;
      stopped: number;
    } | null;
  };
  openaiApiKey?: string | null;
  openaiModel?: string | null;
}

export interface DraftAiAssistantResponse {
  reply: string;
  thinkingSteps: string[];
  appliedChangesSummary: string[];
  formPatch?: {
    step?: 1 | 2 | 3;
    name?: string;
    edification?: Partial<ProjectDraftInput['edification']>;
    address?: Partial<ProjectDraftInput['address']>;
    occupation?: Partial<ProjectDraftInput['occupation']>;
    responsavel?: Partial<ProjectDraftInput['responsavel']>;
    securityMeasures?: Record<string, boolean>;
  };
  suggestions: string[];
}

async function runDeterministicDraftAssistant(
  req: DraftAiAssistantRequest,
  initialValidation: BuildPayloadResult,
  domains: FenixDomains
): Promise<DraftAiAssistantResponse> {
  const thinkingSteps: string[] = [];
  const appliedChangesSummary: string[] = [];
  const suggestions: string[] = [];
  const currentDraft = req.currentDraft || {};

  const formPatch: DraftAiAssistantResponse['formPatch'] = {};
  const message = req.message.trim();

  // 0. Verificação de perguntas sobre situação de edificação e processos / métricas gerais
  const isStartDraftQuery =
    Boolean(req.systemContext?.activeBuilding) &&
    /(?:iniciar|novo cadastro|preparar rascunho)/i.test(message);

  const isGeneralPortfolio =
    !isStartDraftQuery &&
    (/(?:situaç[ãa]o\s+geral|carteira|processos?\s+em\s+an[aá]lise|notificaç[õo]es?|pend[êe]ncias?\s+da\s+carteira|edificaç[õo]es?\s+e\s+processos|resumo|panorama|vis[ãa]o\s+geral)/i.test(message) ||
      message.toLowerCase().includes('analise a situação geral'));

  const isActiveBuildingQuery =
    Boolean(req.systemContext?.activeBuilding) &&
    !isStartDraftQuery &&
    !isGeneralPortfolio &&
    (/(?:situaç[ãa]o|processo|etapa|status|notifica|como est[aá]|explic)/i.test(message) ||
      message.toLowerCase().includes('explicar a situação atual da edificação'));

  if (isGeneralPortfolio && req.systemContext?.metricsSummary) {
    thinkingSteps.push(
      'Consultando base sincronizada de edificações e processos no Fênix...',
      'Verificando etapas, notificações e status de tramitação...'
    );

    const m = req.systemContext.metricsSummary;
    let replyText = `Análise geral da carteira de edificações e processos no Fênix:\n\n`;
    replyText += `• **Total de Edificações**: ${m.totalBuildings}\n`;
    replyText += `• **Processos em Análise**: ${m.inAnalysis}\n`;
    replyText += `• **Processos Notificados**: ${m.notified}\n`;
    replyText += `• **Processos Parados / Pendentes**: ${m.stopped}\n\n`;

    if (m.notified > 0) {
      replyText += `⚠️ Atenção: Há **${m.notified} processo(s) com notificação** exigindo cumprimento de pendências junto ao CBMBA.\n`;
    } else {
      replyText += `A carteira está regular e não possui notificações urgentes pendentes.\n`;
    }

    replyText += `\nSelecione uma edificação específica para analisar detalhes ou inicie um novo cadastro quando desejar.`;

    return {
      reply: replyText,
      thinkingSteps,
      appliedChangesSummary: [],
      suggestions: [
        '✦ Iniciar novo cadastro para esta edificação',
        'Filtrar processos notificados',
        'Ver processos em análise',
        'Sincronizar dados do Fênix'
      ]
    };
  }

  if (isActiveBuildingQuery && req.systemContext?.activeBuilding) {
    thinkingSteps.push(
      'Consultando base sincronizada de edificações e processos no Fênix...',
      'Verificando etapas, notificações e status de tramitação...'
    );

    const b = req.systemContext.activeBuilding;
    let replyText = `Situação da edificação **${b.reference}** em **${b.municipality}**:\n\n`;

    const details: string[] = [];
    if (b.area) details.push(`Área: ${b.area} m²`);
    if (b.floors) details.push(`Pavimentos: ${b.floors}`);
    if (b.height) details.push(`Altura: ${b.height}`);
    if (details.length > 0) {
      replyText += `• **Características**: ${details.join(' | ')}\n`;
    }

    if (b.processes && b.processes.length > 0) {
      replyText += `• **Processos vinculados (${b.processes.length})**:\n`;
      for (const p of b.processes) {
        const formattedDate = p.updatedAt ? new Date(p.updatedAt).toLocaleDateString('pt-BR') : '';
        replyText += `  - Protocolo **${p.protocol}** (${p.type || 'Processo'}): Status **${p.status || 'Em tramitação'}**, Etapa: **${p.stage || '—'}**${formattedDate ? ` (Atualizado em ${formattedDate})` : ''}\n`;
      }
    } else {
      replyText += `• Não constam processos ativos vinculados a esta edificação no momento.\n`;
    }

    replyText += `\nCaso precise regularizar ou iniciar um novo processo, posso preparar os dados automaticamente.`;

    return {
      reply: replyText,
      thinkingSteps,
      appliedChangesSummary: [],
      suggestions: [
        '✦ Iniciar novo cadastro para esta edificação',
        'Ver detalhes das notificações',
        'Sincronizar com o Fênix',
        'Consultar exigências da IT-14'
      ]
    };
  }

  if (isStartDraftQuery && req.systemContext?.activeBuilding) {
    const b = req.systemContext.activeBuilding;
    thinkingSteps.push(
      `Iniciando novo rascunho a partir dos dados da edificação ${b.reference}.`,
      'Configurando parâmetros de edificação e município...'
    );
    formPatch.name = b.reference;
    formPatch.edification = {
      building_area: b.area ? Number(b.area) : undefined,
      number_floors: b.floors ? Number(b.floors) : undefined,
      height: b.height || undefined
    };
    if (b.municipality) {
      const norm = (str: unknown) =>
        String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
      const munNorm = norm(b.municipality);
      const m = domains.counties.find((c) => norm(c.municipio) === munNorm);
      formPatch.address = {
        county: b.municipality.toUpperCase(),
        municipio_id: m ? m.id : undefined
      };
    }
    appliedChangesSummary.push(`Definido nome "${b.reference}" e município ${b.municipality}`);
    if (b.area) appliedChangesSummary.push(`Definida área construída para ${b.area} m²`);
  }

  thinkingSteps.push('Analisando solicitação do usuário e estado atual do rascunho.');

  // 1. Extração de CNPJ
  const cnpjMatch = message.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b|\b\d{14}\b/);
  if (cnpjMatch) {
    const rawCnpj = cnpjMatch[0].replace(/\D/g, '');
    if (rawCnpj.length === 14) {
      thinkingSteps.push(`CNPJ detectado no texto: ${rawCnpj}. Consultando dados cadastrais e IT-14.`);
      try {
        const it14Result = await lookupCnpjAndIt14(rawCnpj, {
          areaM2: Number(currentDraft.building_area || currentDraft.edification?.building_area || 0),
          floors: Number(currentDraft.number_floors || currentDraft.edification?.number_floors || 1),
          height: currentDraft.height || currentDraft.edification?.height
        });

        formPatch.name = it14Result.nome_fantasia || it14Result.razao_social;
        formPatch.address = {
          ...formPatch.address,
          zip_code: it14Result.address.zip_code,
          public_place: it14Result.address.street,
          number: it14Result.address.number,
          complement: it14Result.address.complement || '***',
          district: it14Result.address.neighborhood,
          municipio_id: it14Result.address.county_id,
          county: it14Result.address.county,
          state: it14Result.address.uf
        };

        formPatch.occupation = {
          ...formPatch.occupation,
          occupation_group_id: it14Result.it14.occupation_group_id,
          division_group_id: it14Result.it14.division_group_id
        };

        formPatch.securityMeasures = it14Result.it14.mappedMeasures;

        appliedChangesSummary.push(`Preenchidos dados da empresa ${it14Result.razao_social} via CNPJ`);
        appliedChangesSummary.push(`Definido endereço (${it14Result.address.street}, ${it14Result.address.county})`);
        appliedChangesSummary.push(
          `Vinculado CNAE ${it14Result.it14.cnae} e divisão IT-14 ${it14Result.it14.divisao_code || ''}`
        );
        appliedChangesSummary.push(`Medidas de segurança sincronizadas com a tabela IT-14`);
      } catch (cnpjErr) {
        thinkingSteps.push(
          `Falha ao consultar CNPJ: ${cnpjErr instanceof Error ? cnpjErr.message : 'erro desconhecido'}`
        );
      }
    }
  }

  // 2. Extração de Área
  const areaMatch =
    message.match(/(?:área|area|com)\s*(?:de)?\s*(\d+(?:[.,]\d+)?)\s*(?:m²|m2|metros)?/i) ||
    message.match(/\b(\d+(?:[.,]\d+)?)\s*(?:m²|m2)\b/i);
  if (areaMatch && areaMatch[1]) {
    const parsedArea = Number(areaMatch[1].replace(',', '.'));
    if (parsedArea > 0) {
      formPatch.edification = formPatch.edification || {};
      formPatch.edification.building_area = parsedArea;
      thinkingSteps.push(`Área construída identificada: ${parsedArea} m².`);
      appliedChangesSummary.push(`Área construída definida para ${parsedArea} m²`);
    }
  }

  // 3. Extração de Pavimentos e Altura
  const pavMatch = message.match(/(\d+)\s*pavimentos?/i);
  const isTerrea = /\b(?:t[eé]rrea|1\s*pavimento|\bum\s*pavimento|\b[uú]nico\s*pavimento)\b/i.test(message);

  if (isTerrea || (pavMatch && Number(pavMatch[1]) === 1)) {
    formPatch.edification = formPatch.edification || {};
    formPatch.edification.number_floors = 1;
    formPatch.edification.height = 'Térrea = Um pavimento';
    thinkingSteps.push('Edificação identificada como pavimento único térreo.');
    appliedChangesSummary.push('Pavimentos ajustados para 1 com altura "Térrea = Um pavimento"');
  } else if (pavMatch) {
    const floors = Number(pavMatch[1]);
    if (floors > 1) {
      formPatch.edification = formPatch.edification || {};
      formPatch.edification.number_floors = floors;
      let height = 'Baixa = H <= 6,00 m';
      if (floors <= 2) height = 'Baixa = H <= 6,00 m';
      else if (floors <= 4) height = 'Baixa-Média = 6,00 m < H <= 12,00 m';
      else if (floors <= 7) height = 'Média = 12,00 m < H <= 23,00 m';
      else if (floors <= 10) height = 'Medianamente Alta = 23,00 m < H <= 30,00 m';
      else height = 'Alta = Acima de 30,00 m';

      formPatch.edification.height = height;
      thinkingSteps.push(`Edificação identificada com ${floors} pavimentos; enquadrada na altura "${height}".`);
      appliedChangesSummary.push(`Pavimentos ajustados para ${floors} com altura "${height}"`);
    }
  }

  // 4. Extração de Município da Bahia
  function norm(str: unknown) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();
  }
  const normMessage = norm(message);

  const sortedCounties = [...domains.counties].sort((a, b) => b.municipio.length - a.municipio.length);
  for (const c of sortedCounties) {
    const cNorm = norm(c.municipio);
    const pattern = new RegExp(`(?:\\b|\\s)${cNorm}(?:\\b|\\s|[.,;!]|$)`, 'i');
    if (pattern.test(normMessage)) {
      formPatch.address = formPatch.address || {};
      formPatch.address.municipio_id = c.id;
      formPatch.address.county = c.municipio.toUpperCase();
      thinkingSteps.push(`Município reconhecido na mensagem: ${c.municipio} (ID: ${c.id}).`);
      appliedChangesSummary.push(`Município definido para ${c.municipio.toUpperCase()}`);
      break;
    }
  }

  // 5. Extração de Divisão IT-14
  const divMatch = message.match(/\b([A-M])-([1-9]|1[0-2])\b/i);
  if (divMatch) {
    const divCode = divMatch[0].toUpperCase();
    const dg = domains.divisionGroups.find((d) => d.division.trim().toUpperCase() === divCode);
    if (dg) {
      formPatch.occupation = formPatch.occupation || {};
      formPatch.occupation.division_group_id = dg.id;
      formPatch.occupation.occupation_group_id = dg.group_occupation_id;
      thinkingSteps.push(`Divisão IT-14 identificada: ${dg.division} (${dg.description}).`);
      appliedChangesSummary.push(`Divisão IT-14 definida para ${dg.division} - ${dg.description}`);
    }
  }

  // 6. Enquadramento e Medidas de Segurança
  const mergedDraft: ProjectDraftInput = {
    ...currentDraft,
    building_area:
      formPatch.edification?.building_area ??
      currentDraft.building_area ??
      currentDraft.edification?.building_area ??
      100,
    number_floors:
      formPatch.edification?.number_floors ??
      currentDraft.number_floors ??
      currentDraft.edification?.number_floors ??
      1,
    height:
      formPatch.edification?.height ??
      currentDraft.height ??
      currentDraft.edification?.height ??
      'Térrea = Um pavimento',
    address: {
      ...currentDraft.address,
      ...formPatch.address,
      zip_code: formPatch.address?.zip_code || currentDraft.address?.zip_code || '45355000',
      municipio_id: formPatch.address?.municipio_id || currentDraft.address?.municipio_id || 22
    },
    institution: {
      ...currentDraft.institution,
      cnae: currentDraft.institution?.cnae || '4754701'
    }
  };

  const currentVal = buildAndValidateFenixProjectPayload(mergedDraft);
  thinkingSteps.push(`Enquadramento técnico resultante: ${currentVal.tipoProjetoSigla} (Tipo ${currentVal.tipoProjetoId}).`);

  const wantsRecommended = /\b(?:medidas?\s*recomendadas?|medidas?\s*padr[aã]o|aplica(?:r)?\s*as\s*medidas)\b/i.test(
    message
  );
  if (wantsRecommended) {
    formPatch.securityMeasures = formPatch.securityMeasures || {};
    for (const key of FENIX_28_SECURITY_MEASURES) {
      formPatch.securityMeasures[key] = false;
    }
    for (const rec of currentVal.recommendedMeasures) {
      if (rec === 'extintores') formPatch.securityMeasures.extintores = true;
      if (rec === 'iluminacao_emerg') formPatch.securityMeasures.iluminacao_emergencia = true;
      if (rec === 'sinal_emerg') formPatch.securityMeasures.sinalizacao_emergencia = true;
      if (rec === 'saidas_emerg') formPatch.securityMeasures.saidas_emergencia = true;
      if (rec === 'brigada_incendio') formPatch.securityMeasures.brigada_incendio = true;
      if (rec === 'hidrante_mangot') formPatch.securityMeasures.hidrante_mangotinhos = true;
      if (rec === 'alarme_incendio') formPatch.securityMeasures.alarme_incendio = true;
      if (rec === 'deteccao_incendio') formPatch.securityMeasures.deteccao_incendio = true;
      if (rec === 'acesso_viatura') formPatch.securityMeasures.acesso_viatura_edificacao = true;
      if (rec === 'seguranca_estrutural') formPatch.securityMeasures.seguranca_estrutural_contra_incendio = true;
      if (rec === 'comp_horizontal') formPatch.securityMeasures.compartimentacao_horizontal = true;
      if (rec === 'control_mat_acab') formPatch.securityMeasures.controle_materiais_acabamento = true;
    }
    thinkingSteps.push(
      `Ativadas as ${currentVal.recommendedMeasures.length} medidas recomendadas para ${currentVal.tipoProjetoSigla}.`
    );
    appliedChangesSummary.push(
      `Aplicadas ${currentVal.recommendedMeasures.length} medidas de segurança recomendadas para ${currentVal.tipoProjetoSigla}`
    );
  }

  // Medidas individuais mencionadas
  if (/\b(?:hidrante|mangotinho)\b/i.test(message)) {
    formPatch.securityMeasures = formPatch.securityMeasures || {};
    formPatch.securityMeasures.hidrante_mangotinhos = true;
    appliedChangesSummary.push('Ativada medida: Hidrantes e Mangotinhos');
  }
  if (/\b(?:alarme)\b/i.test(message)) {
    formPatch.securityMeasures = formPatch.securityMeasures || {};
    formPatch.securityMeasures.alarme_incendio = true;
    appliedChangesSummary.push('Ativada medida: Alarme de Incêndio');
  }
  if (/\b(?:brigada)\b/i.test(message)) {
    formPatch.securityMeasures = formPatch.securityMeasures || {};
    formPatch.securityMeasures.brigada_incendio = true;
    appliedChangesSummary.push('Ativada medida: Brigada de Incêndio');
  }
  if (/\b(?:extintor|extintores)\b/i.test(message)) {
    formPatch.securityMeasures = formPatch.securityMeasures || {};
    formPatch.securityMeasures.extintores = true;
    appliedChangesSummary.push('Ativada medida: Extintores');
  }

  // 7. Comando de Revisão / Correção
  const isReview = /\b(?:revis(?:e|ar)?|corrig(?:ir|e)?|ajust(?:ar|e)?|pend[eê]ncias?|arrum(?:ar|e)?)\b/i.test(message);
  if (isReview) {
    formPatch.address = formPatch.address || {};
    if (!currentDraft.address?.complement || currentDraft.address.complement.trim() === '') {
      formPatch.address.complement = '***';
      appliedChangesSummary.push('Complemento de endereço preenchido com "***" para atender exigência do Fênix');
    }

    const currentFloors = Number(currentDraft.number_floors || currentDraft.edification?.number_floors || 1);
    const currentHeight = String(currentDraft.height || currentDraft.edification?.height || '');
    if (currentFloors === 1 && currentHeight !== 'Térrea = Um pavimento') {
      formPatch.edification = formPatch.edification || {};
      formPatch.edification.height = 'Térrea = Um pavimento';
      appliedChangesSummary.push('Altura sincronizada para "Térrea = Um pavimento"');
    }

    if (
      !formPatch.securityMeasures &&
      (!currentDraft.securityMeasures || Object.keys(currentDraft.securityMeasures).length === 0)
    ) {
      formPatch.securityMeasures = {};
      for (const rec of currentVal.recommendedMeasures) {
        if (rec === 'extintores') formPatch.securityMeasures.extintores = true;
        if (rec === 'iluminacao_emerg') formPatch.securityMeasures.iluminacao_emergencia = true;
        if (rec === 'sinal_emerg') formPatch.securityMeasures.sinalizacao_emergencia = true;
        if (rec === 'saidas_emerg') formPatch.securityMeasures.saidas_emergencia = true;
        if (rec === 'brigada_incendio') formPatch.securityMeasures.brigada_incendio = true;
      }
      appliedChangesSummary.push(
        `Aplicadas ${currentVal.recommendedMeasures.length} medidas recomendadas para ${currentVal.tipoProjetoSigla}`
      );
    }
  }

  // 8. Resposta amigável (reply)
  let reply = '';
  if (appliedChangesSummary.length > 0) {
    reply = `Pronto! Atualizei o formulário com os dados solicitados:\n\n${appliedChangesSummary.map((s) => `• ${s}`).join('\n')}\n\nO imóvel está enquadrado na modalidade **${currentVal.tipoProjetoSigla}**. Você pode revisar os campos na tela ou simular o envio diretamente ao Fênix.`;
  } else {
    reply = `Analisei o rascunho atual. A edificação está enquadrada em **${currentVal.tipoProjetoSigla}**. ${
      initialValidation.errors.length > 0
        ? `Existem ${initialValidation.errors.length} pendências que precisam de atenção: ${initialValidation.errors.join('; ')}.`
        : 'Todos os parâmetros essenciais estão consistentes e prontos para simulação no Fênix.'
    }`;
  }

  suggestions.push('Simular validação no Fênix');
  if (!currentDraft.institution?.cnpj && !currentDraft.institution?.cnpj_cpf) {
    suggestions.push('Consultar CNPJ da empresa');
  }
  suggestions.push('Aplicar medidas recomendadas');
  suggestions.push('Revisar pendências do rascunho');

  return {
    reply,
    thinkingSteps,
    appliedChangesSummary,
    formPatch: Object.keys(formPatch).length > 0 ? formPatch : undefined,
    suggestions: suggestions.slice(0, 4)
  };
}

export async function runDraftAiAssistant(
  req: DraftAiAssistantRequest
): Promise<DraftAiAssistantResponse> {
  const domains = getFenixDomains();
  const currentDraft = req.currentDraft || {};
  const validation = buildAndValidateFenixProjectPayload(currentDraft as ProjectDraftInput);

  if (req.openaiApiKey) {
    try {
      const client = new OpenAI({ apiKey: req.openaiApiKey, timeout: 30_000 });
      const model = req.openaiModel || 'gpt-4o-mini';

      const systemPrompt = `Você é o Copiloto Especialista em Regularização, Acompanhamento de Processos e Cadastro Técnico no Sistema Fênix (Corpo de Bombeiros Militar da Bahia - CBMBA).
Você atua como copiloto de IA unificado para todo o painel Fênix, respondendo tanto sobre:
1. Situação das edificações sincronizadas, processos em tramitação, etapas, notificações e métricas da carteira do usuário.
2. Preenchimento, conferência e otimização de novos cadastros e projetos técnicos segundo o Decreto Estadual 16.302/2015 e a Instrução Técnica IT-14.

REGRAS OBRIGATÓRIAS DO FÊNIX:
1. Alturas oficiais (exatamente uma das 6 opções):
   - "Térrea = Um pavimento" (OBRIGATÓRIO ter exatamente 1 pavimento)
   - "Baixa = H <= 6,00 m"
   - "Baixa-Média = 6,00 m < H <= 12,00 m"
   - "Média = 12,00 m < H <= 23,00 m"
   - "Medianamente Alta = 23,00 m < H <= 30,00 m"
   - "Alta = Acima de 30,00 m"
2. Complemento de endereço: se não houver, enviar "***".
3. Enquadramento de Projeto:
   - Área total <= 200 m² e até 2 pavimentos -> PTSCLCB1 (CLCB sem vistoria prévia)
   - Área total <= 750 m² e até 3 pavimentos -> PTSCLCB2 (ou PTSAVCB se exigida vistoria)
   - Área total > 750 m² OU > 3 pavimentos OU CNAEs de alto risco (postos, inflamáveis, etc.) -> PT (Projeto Técnico Completo)
4. Mantenha uma fala em português natural, técnica, clara e amigável.
5. Sempre que puder aplicar alterações ou correções nos campos da tela de cadastro, retorne o objeto "formPatch". Se a dúvida for sobre acompanhamento ou situação de processos, explique de forma clara e sugira próximos passos práticos.
6. Retorne ESTRITAMENTE um JSON com as chaves:
   - "reply": string com a resposta ao usuário explicando o que foi feito ou orientando
   - "thinkingSteps": string[] com os passos de raciocínio lógico
   - "appliedChangesSummary": string[] com resumo das alterações aplicadas no formPatch (se houver)
   - "formPatch": objeto com os campos alterados (se aplicável: step, name, edification, address, occupation, responsavel, securityMeasures)
   - "suggestions": string[] com 3 ou 4 ações rápidas sugeridas`;

      const userContent = JSON.stringify({
        message: req.message,
        systemContext: req.systemContext || null,
        currentDraftState: {
          name: currentDraft.name || currentDraft.reference_name,
          edification: currentDraft.edification || {
            building_area: currentDraft.building_area,
            number_floors: currentDraft.number_floors,
            height: currentDraft.height
          },
          address: currentDraft.address,
          occupation: currentDraft.occupation,
          validation: {
            errors: validation.errors,
            warnings: validation.warnings,
            enquadramento: validation.tipoProjetoSigla,
            recommendedMeasures: validation.recommendedMeasures
          }
        }
      });

      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt }
      ];

      if (Array.isArray(req.history)) {
        for (const h of req.history.slice(-4)) {
          messages.push({ role: h.role, content: h.content });
        }
      }
      messages.push({ role: 'user', content: userContent });

      const completion = await client.chat.completions.create({
        model,
        messages,
        response_format: { type: 'json_object' }
      });

      const rawContent = completion.choices[0]?.message?.content;
      if (rawContent) {
        const parsed = JSON.parse(rawContent) as DraftAiAssistantResponse;
        if (parsed.reply && Array.isArray(parsed.thinkingSteps)) {
          if (parsed.formPatch?.address?.county && !parsed.formPatch.address.municipio_id) {
            const norm = (str: unknown) =>
              String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
            const countyNorm = norm(parsed.formPatch.address.county);
            const m = domains.counties.find((c) => norm(c.municipio) === countyNorm);
            if (m) {
              parsed.formPatch.address.municipio_id = m.id;
              parsed.formPatch.address.county = m.municipio.toUpperCase();
            }
          }
          return parsed;
        }
      }
    } catch {
      // Fallback para o motor determinístico em caso de falha da OpenAI
    }
  }

  return runDeterministicDraftAssistant(req, validation, domains);
}


