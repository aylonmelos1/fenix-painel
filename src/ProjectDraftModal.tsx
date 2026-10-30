import React, { Component, useEffect, useMemo, useState, useCallback, useRef, type ErrorInfo, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  ExternalLink,
  FileText,
  Flame,
  HardHat,
  HelpCircle,
  Info,
  Layers,
  LoaderCircle,
  Lock,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unlock,
  X,
  Zap
} from 'lucide-react';
import { api, type Building } from './types';
import {
  type ProjectDraftInput,
  type TechnicalManagerItem,
  type DraftAiAssistantResponse,
  OFFICIAL_FENIX_MEASURES,
  FENIX_MEASURE_SYNONYMS,
  normalizeSecurityMeasures,
  generateLocalAiAssistantFallback,
  INITIAL_EMPTY_DRAFT
} from './draftAiHelper';

export type { ProjectDraftInput, TechnicalManagerItem, DraftAiAssistantResponse };

/**
 * Normaliza um rascunho de projeto garantindo integridade defensiva e suporte a dados legados/planos.
 */
export function normalizeProjectDraftInput(
  raw: any,
  fallbackName?: string,
  fallbackId?: string
): ProjectDraftInput {
  const base = INITIAL_EMPTY_DRAFT;
  const src = raw || {};

  const id = src.id || fallbackId || undefined;
  const name = String(
    src.name ||
      fallbackName ||
      src.reference_name ||
      src?.edification?.reference_name ||
      base.name ||
      'Novo Rascunho de Projeto'
  );

  const tipo_projeto_id = Number(
    src.tipo_projeto_id ||
      (src.form_mode === 'pt' || src.process_category === 'pt' ? 1 : base.tipo_projeto_id)
  );
  const isPt = [1, 2, 3].includes(tipo_projeto_id) || src.form_mode === 'pt' || src.process_category === 'pt';
  const form_mode: 'pt' | 'pts' = src.form_mode || (isPt ? 'pt' : 'pts');
  const process_category: 'pt' | 'pts' = src.process_category || (isPt ? 'pt' : 'pts');
  const license_type: 'CLCB' | 'AVCB' =
    src.license_type ||
    (isPt ? 'AVCB' : tipo_projeto_id === 6 || tipo_projeto_id === 7 || tipo_projeto_id === 8 ? 'AVCB' : 'CLCB');

  // Sub-objeto: edification
  const edRaw = src.edification || {};
  const edification = {
    reference_name: String(
      edRaw.reference_name ?? src.reference_name ?? src.nome_referencia ?? base.edification.reference_name ?? ''
    ),
    registration: String(
      edRaw.registration ?? src.registration ?? src.matricula ?? base.edification.registration ?? ''
    ),
    height: String(edRaw.height || src.altura || base.edification.height),
    number_floors: Number(edRaw.number_floors ?? src.pavimentos ?? base.edification.number_floors) || 1,
    building_area: Number(
      edRaw.building_area ?? src.area_construida ?? src.area_total ?? base.edification.building_area ?? 0
    ) || 0,
    area_to_be_built: Number(
      edRaw.area_to_be_built ?? src.area_a_construir ?? base.edification.area_to_be_built ?? 0
    ) || 0,
    discount_area: Number(
      edRaw.discount_area ?? src.area_desconto ?? base.edification.discount_area ?? 0
    ) || 0,
    total_area: Number(edRaw.total_area ?? src.area_total ?? 0) || 0
  };

  // Sub-objeto: address
  const addrRaw = src.address || {};
  const address = {
    zip_code: String(addrRaw.zip_code ?? src.cep ?? base.address.zip_code ?? ''),
    public_place: String(addrRaw.public_place ?? src.logradouro ?? base.address.public_place ?? ''),
    number: String(addrRaw.number ?? src.numero ?? base.address.number ?? ''),
    complement: String(addrRaw.complement ?? src.complemento ?? base.address.complement ?? '***'),
    district: String(addrRaw.district ?? src.district ?? src.neighborhood ?? src.bairro ?? base.address.district ?? ''),
    county: String(addrRaw.county ?? src.cidade ?? src.municipio ?? base.address.county ?? 'SALVADOR'),
    municipio_id:
      addrRaw.municipio_id !== undefined && addrRaw.municipio_id !== null
        ? Number(addrRaw.municipio_id)
        : src.municipio_id !== undefined && src.municipio_id !== null
        ? Number(src.municipio_id)
        : base.address.municipio_id,
    state: String(addrRaw.state ?? src.uf ?? base.address.state ?? 'BA'),
    geographic_coordinates: String(
      addrRaw.geographic_coordinates ??
        src.coordenadas ??
        src.geographic_coordinates ??
        base.address.geographic_coordinates ??
        ''
    )
  };

  // Sub-objeto: institution
  const instRaw = src.institution || {};
  const institution = {
    tipo_pessoa: (instRaw.tipo_pessoa || src.tipo_pessoa || base.institution.tipo_pessoa || 'PJ') as 'PJ' | 'PF',
    cnpj_cpf: String(instRaw.cnpj_cpf ?? src.cnpj_cpf ?? src.cnpj ?? src.cpf ?? base.institution.cnpj_cpf ?? ''),
    razao_social: String(instRaw.razao_social ?? src.razao_social ?? base.institution.razao_social ?? ''),
    nome_fantasia: String(instRaw.nome_fantasia ?? src.nome_fantasia ?? base.institution.nome_fantasia ?? ''),
    natureza_juridica: String(instRaw.natureza_juridica ?? src.natureza_juridica ?? base.institution.natureza_juridica ?? 'ME'),
    cnae: String(instRaw.cnae ?? src.cnae ?? src.cnae_id ?? base.institution.cnae ?? ''),
    atividade_economica: String(
      instRaw.atividade_economica ??
        src.atividade_economica ??
        src.descricao_ocupacao ??
        base.institution.atividade_economica ??
        ''
    ),
    risk: Number(instRaw.risk ?? src.risk ?? base.institution.risk ?? 300) || 300
  };

  // Sub-objeto: occupation
  const occRaw = src.occupation || {};
  const occupation = {
    occupation_group_id: Number(occRaw.occupation_group_id ?? src.ocupacao_id ?? base.occupation.occupation_group_id) || 0,
    division_group_id: Number(occRaw.division_group_id ?? src.divisao_id ?? base.occupation.division_group_id) || 0,
    has_underground: Boolean(occRaw.has_underground ?? src.has_underground ?? base.occupation.has_underground ?? false),
    underground_occupation_group_id:
      Number(occRaw.underground_occupation_group_id ?? base.occupation.underground_occupation_group_id ?? 13) || 13,
    underground_division_group_id:
      Number(occRaw.underground_division_group_id ?? base.occupation.underground_division_group_id ?? 58) || 58
  };

  // Sub-objeto: proprietario
  const propRaw = src.proprietario || {};
  const proprietario = {
    tipo_pessoa_prop: (propRaw.tipo_pessoa_prop ||
      propRaw.tipo_pessoa ||
      src.tipo_pessoa_prop ||
      base.proprietario.tipo_pessoa_prop ||
      'PJ') as 'PJ' | 'PF',
    cpf_cnpj_prop: String(
      propRaw.cpf_cnpj_prop ?? propRaw.cpf_cnpj ?? propRaw.cnpj_cpf ?? src.cpf_cnpj_prop ?? base.proprietario.cpf_cnpj_prop ?? ''
    ),
    nome_proprietario: String(
      propRaw.nome_proprietario ?? propRaw.nome ?? src.nome_proprietario ?? base.proprietario.nome_proprietario ?? ''
    ),
    email_proprietario: String(
      propRaw.email_proprietario ?? propRaw.email ?? src.email_proprietario ?? base.proprietario.email_proprietario ?? ''
    ),
    tel_proprietario: String(
      propRaw.tel_proprietario ?? propRaw.telefone ?? propRaw.tel ?? src.tel_proprietario ?? base.proprietario.tel_proprietario ?? ''
    )
  };

  // Sub-objeto: responsavel
  const respRaw = src.responsavel || {};
  const responsavel = {
    responsavel_uso_igual_prop: Boolean(
      respRaw.responsavel_uso_igual_prop ??
        src.responsavel_uso_igual_prop ??
        base.responsavel.responsavel_uso_igual_prop ??
        true
    ),
    tipo_pessoa_resp: (respRaw.tipo_pessoa_resp ||
      respRaw.tipo_pessoa ||
      src.tipo_pessoa_resp ||
      base.responsavel.tipo_pessoa_resp ||
      'PJ') as 'PJ' | 'PF',
    cpf_cnpj_resp: String(respRaw.cpf_cnpj_resp ?? respRaw.cpf_cnpj ?? src.cpf_cnpj_resp ?? base.responsavel.cpf_cnpj_resp ?? ''),
    nome_responsavel: String(respRaw.nome_responsavel ?? respRaw.nome ?? src.nome_responsavel ?? base.responsavel.nome_responsavel ?? ''),
    email_responsavel_uso: String(
      respRaw.email_responsavel_uso ?? respRaw.email ?? src.email_responsavel_uso ?? base.responsavel.email_responsavel_uso ?? ''
    ),
    tel_responsavel_uso: String(
      respRaw.tel_responsavel_uso ?? respRaw.telefone ?? respRaw.tel ?? src.tel_responsavel_uso ?? base.responsavel.tel_responsavel_uso ?? ''
    )
  };

  // Sub-objeto: technical
  const techRaw = src.technical || {};
  const technical = {
    cpf: String(techRaw.cpf ?? base.technical?.cpf ?? ''),
    name: String(techRaw.name ?? base.technical?.name ?? ''),
    crea_cau: String(techRaw.crea_cau ?? base.technical?.crea_cau ?? ''),
    telephone: String(techRaw.telephone ?? base.technical?.telephone ?? ''),
    email: String(techRaw.email ?? base.technical?.email ?? '')
  };

  // Sub-objeto: questionario
  const qRaw = src.questionario || {};
  const questionario = {
    ...base.questionario,
    ...qRaw,
    edf_saida_direta:
      qRaw.edf_saida_direta !== undefined
        ? Boolean(qRaw.edf_saida_direta)
        : src.edf_saida_direta !== undefined
        ? Boolean(src.edf_saida_direta)
        : (base.questionario?.edf_saida_direta ?? true),
    edf_regularizada_certificado: Boolean(
      qRaw.edf_regularizada_certificado ??
        src.edf_regularizada_certificado ??
        base.questionario?.edf_regularizada_certificado ??
        false
    ),
    tipo_certificado: (qRaw.tipo_certificado ||
      src.tipo_certificado ||
      base.questionario?.tipo_certificado ||
      'AVCB') as 'AVCB' | 'CLCB',
    n_certificado: String(qRaw.n_certificado ?? src.n_certificado ?? base.questionario?.n_certificado ?? ''),
    renovacao_sap: Boolean(qRaw.renovacao_sap ?? src.renovacao_sap ?? base.questionario?.renovacao_sap ?? false),
    lotacao_max_pessoas: Boolean(
      qRaw.lotacao_max_pessoas ?? src.lotacao_max_pessoas ?? base.questionario?.lotacao_max_pessoas ?? false
    ),
    existe_gases_inflamaveis: Boolean(
      qRaw.existe_gases_inflamaveis ?? src.existe_gases_inflamaveis ?? base.questionario?.existe_gases_inflamaveis ?? false
    ),
    existe_liquidos_inflamaveis: Boolean(
      qRaw.existe_liquidos_inflamaveis ??
        src.existe_liquidos_inflamaveis ??
        base.questionario?.existe_liquidos_inflamaveis ??
        false
    ),
    glp_12480kg: Boolean(qRaw.glp_12480kg ?? src.glp_12480kg ?? base.questionario?.glp_12480kg ?? false),
    gas_glp: Boolean(qRaw.gas_glp ?? src.gas_glp ?? base.questionario?.gas_glp ?? false),
    armazena_produtos_perigosos: Boolean(
      qRaw.armazena_produtos_perigosos ??
        src.armazena_produtos_perigosos ??
        base.questionario?.armazena_produtos_perigosos ??
        false
    ),
    local_reuniao_publico: Boolean(
      qRaw.local_reuniao_publico ?? src.local_reuniao_publico ?? base.questionario?.local_reuniao_publico ?? false
    ),
    subsolo_maior_50m_pt: Boolean(
      qRaw.subsolo_maior_50m_pt ?? src.subsolo_maior_50m_pt ?? base.questionario?.subsolo_maior_50m_pt ?? false
    ),
    cobertura_fibras_sape: Boolean(
      qRaw.cobertura_fibras_sape ?? src.cobertura_fibras_sape ?? base.questionario?.cobertura_fibras_sape ?? false
    )
  };

  // Sub-objeto: specialRisks
  const srRaw = src.specialRisks || {};
  const specialRisks = {
    ...base.specialRisks,
    ...srRaw,
    liquidos_inflamaveis: Boolean(
      srRaw.liquidos_inflamaveis ?? src.liquidos_inflamaveis ?? base.specialRisks?.liquidos_inflamaveis ?? false
    ),
    gas_liquefeito_petroleo: Boolean(
      srRaw.gas_liquefeito_petroleo ?? src.gas_liquefeito_petroleo ?? base.specialRisks?.gas_liquefeito_petroleo ?? false
    ),
    produtos_perigosos: Boolean(
      srRaw.produtos_perigosos ?? src.produtos_perigosos ?? base.specialRisks?.produtos_perigosos ?? false
    ),
    fogos_artificio: Boolean(
      srRaw.fogos_artificio ?? src.fogos_artificio ?? base.specialRisks?.fogos_artificio ?? false
    ),
    vaso_pressao: Boolean(srRaw.vaso_pressao ?? src.vaso_pressao ?? base.specialRisks?.vaso_pressao ?? false),
    outros: String(srRaw.outros ?? src.outros ?? base.specialRisks?.outros ?? '')
  };

  // Sub-objeto: glpData
  const glpRaw = src.glpData || {};
  const glpData = {
    total_kg_glp: glpRaw.total_kg_glp ?? src.total_kg_glp ?? src.glp_quantidade_kg ?? base.glpData?.total_kg_glp ?? '',
    classe_glp: String(glpRaw.classe_glp ?? src.classe_glp ?? base.glpData?.classe_glp ?? 'Classe I')
  };

  // Sub-objeto: securityMeasures
  const securityMeasures: Record<string, number | boolean> = {
    ...base.securityMeasures
  };
  if (src.securityMeasures && typeof src.securityMeasures === 'object') {
    for (const [k, v] of Object.entries(src.securityMeasures)) {
      securityMeasures[k] = v ? 1 : 0;
    }
  }
  if (src.medidas_seguranca && typeof src.medidas_seguranca === 'object') {
    for (const [k, v] of Object.entries(src.medidas_seguranca)) {
      securityMeasures[k] = v ? 1 : 0;
    }
  }

  // Sub-objeto: responsaveis_tecnicos
  const rawRts = Array.isArray(src.responsaveis_tecnicos)
    ? src.responsaveis_tecnicos
    : Array.isArray(src.rts)
    ? src.rts
    : Array.isArray(base.responsaveis_tecnicos)
    ? base.responsaveis_tecnicos
    : [];

  const responsaveis_tecnicos: TechnicalManagerItem[] = rawRts.map((item: any) => ({
    tipo_numero: String(item?.tipo_numero ?? item?.conselho ?? 'CREA'),
    conselho: String(item?.conselho ?? item?.tipo_numero ?? 'CREA'),
    crea_cau: String(item?.crea_cau ?? item?.n_registro_conselho ?? ''),
    n_registro_conselho: String(item?.n_registro_conselho ?? item?.crea_cau ?? ''),
    name: String(item?.name ?? item?.nome_tecnico ?? item?.nome ?? ''),
    nome_tecnico: String(item?.nome_tecnico ?? item?.name ?? item?.nome ?? ''),
    cpf_cnpj: String(item?.cpf_cnpj ?? item?.cpf_cnpj_tecnico ?? item?.cpf ?? ''),
    cpf_cnpj_tecnico: String(item?.cpf_cnpj_tecnico ?? item?.cpf_cnpj ?? item?.cpf ?? ''),
    phone: String(item?.phone ?? item?.telefone_tecnico ?? item?.telefone ?? ''),
    telefone_tecnico: String(item?.telefone_tecnico ?? item?.phone ?? item?.telefone ?? ''),
    email: String(item?.email ?? item?.email_tecnico ?? ''),
    email_tecnico: String(item?.email_tecnico ?? item?.email ?? ''),
    art: String(item?.art ?? item?.n_art_rrt ?? ''),
    n_art_rrt: String(item?.n_art_rrt ?? item?.art ?? src.n_art_rrt ?? '')
  }));

  return {
    ...base,
    ...src,
    id,
    name,
    edificacao_mode: (src.edificacao_mode || base.edificacao_mode || 'new') as 'new' | 'existing',
    edificacao_id:
      src.edificacao_id !== undefined && src.edificacao_id !== null
        ? Number(src.edificacao_id)
        : base.edificacao_id ?? null,
    form_mode,
    tipo_projeto_id,
    process_category,
    license_type,
    isencao_id: Number(src.isencao_id ?? base.isencao_id ?? 1),
    n_art_rrt: String(src.n_art_rrt ?? responsaveis_tecnicos[0]?.n_art_rrt ?? base.n_art_rrt ?? ''),
    projeto_anterior: Boolean(src.projeto_anterior ?? base.projeto_anterior ?? false),
    n_projeto_anterior: String(src.n_projeto_anterior ?? base.n_projeto_anterior ?? ''),
    decreto_estadual_adotado_id: Number(src.decreto_estadual_adotado_id ?? base.decreto_estadual_adotado_id ?? 2),
    cnae_not_in_it14: Boolean(src.cnae_not_in_it14 ?? base.cnae_not_in_it14 ?? false),
    porte_outros: String(src.porte_outros ?? base.porte_outros ?? ''),
    qtde_pessoas: src.qtde_pessoas ?? base.qtde_pessoas ?? '',
    qtde_leitos: src.qtde_leitos ?? base.qtde_leitos ?? '',
    qtde_funcionarios: src.qtde_funcionarios ?? base.qtde_funcionarios ?? '',
    area_comum: src.area_comum ?? base.area_comum ?? '',
    subsolo_maior_50m: Boolean(src.subsolo_maior_50m ?? base.subsolo_maior_50m ?? false),
    cobertura_fsps_sup200: Boolean(src.cobertura_fsps_sup200 ?? base.cobertura_fsps_sup200 ?? false),
    edification,
    address,
    institution,
    occupation,
    proprietario,
    responsavel,
    technical,
    responsaveis_tecnicos,
    incluir_rt_opcional: Boolean(src.incluir_rt_opcional ?? base.incluir_rt_opcional ?? false),
    questionario,
    specialRisks,
    glpData,
    securityMeasures
  };
}

export interface DraftRecord {
  id: string;
  name: string;
  status: 'draft' | 'simulated' | 'submitted' | 'error';
  updatedAt: string;
  data: ProjectDraftInput;
  lastSimulation?: {
    ok: boolean;
    validation: {
      valid: boolean;
      errors: string[];
      warnings: string[];
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

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  category?: string;
  license_type?: string;
}

export interface FenixDomainResponse {
  counties: Array<{ id: number; municipio: string; habilitar: boolean; cod_municipio_ibge?: number }>;
  occupationGroups: Array<{ id: number; group: string; occupation_use: string }>;
  divisionGroups: Array<{ id: number; division: string; description: string; typification: string; group_occupation_id: number }>;
  projectTypes: Array<{ id: number; sigla: string; descricao: string }>;
  exemptions: Array<{ id: number; descricao: string }>;
  heights: string[];
  blockedPtsCnaes: string[];
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

export interface ProjectDraftModalProps {
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  buildings?: Building[];
  onProjectSubmitted?: () => void;
  mode?: 'page' | 'modal';
  copilotOpen?: boolean;
  onToggleCopilot?: () => void;
  onDraftContextChange?: (ctx: {
    currentDraft: ProjectDraftInput;
    applyPatch: (patch: NonNullable<DraftAiAssistantResponse['formPatch']>) => void;
    isEditor: boolean;
  } | null) => void;
}

export interface FenixOfficialProjectType {
  id: number;
  sigla: string;
  descricao: string;
  form_mode: 'pts' | 'pt';
  category: 'pts' | 'pt';
  license: 'CLCB' | 'AVCB';
  isTemporario?: boolean;
}

export const OFFICIAL_PROJECT_TYPES: FenixOfficialProjectType[] = [
  // PT (Completo - form_mode: 'pt' — EXATAMENTE AS 3 OPÇÕES OFICIAIS)
  {
    id: 1,
    sigla: 'PT',
    descricao: 'Projeto Técnico (PT)',
    form_mode: 'pt',
    category: 'pt',
    license: 'AVCB',
    isTemporario: false
  },
  {
    id: 2,
    sigla: 'PTIOT',
    descricao: 'Projeto Técnico para Instalação e Ocupação Temporária (PTIOT)',
    form_mode: 'pt',
    category: 'pt',
    license: 'AVCB',
    isTemporario: true
  },
  {
    id: 3,
    sigla: 'PTOTEP',
    descricao: 'Projeto Técnico para Ocupação Temporária em Edificação Permanente (PTOTEP)',
    form_mode: 'pt',
    category: 'pt',
    license: 'AVCB',
    isTemporario: true
  },
  // PTS (Simplificado - form_mode: 'pts' — EXATAMENTE AS 5 OPÇÕES OFICIAIS)
  {
    id: 4,
    sigla: 'PTSCLCB1',
    descricao: 'Projeto Técnico Simplificado com área até 200 m e altura térrea (PTSCLCB1)',
    form_mode: 'pts',
    category: 'pts',
    license: 'CLCB',
    isTemporario: false
  },
  {
    id: 5,
    sigla: 'PTSCLCB2',
    descricao: 'Projeto Técnico Simplificado com área menor do que 750 m e altura térrea até 3 pavimentos (PTSCLCB2)',
    form_mode: 'pts',
    category: 'pts',
    license: 'CLCB',
    isTemporario: false
  },
  {
    id: 6,
    sigla: 'PTSAVCB',
    descricao: 'Projeto Técnico Simplificado que se regulariza com vistoria (PTSAVCB)',
    form_mode: 'pts',
    category: 'pts',
    license: 'AVCB',
    isTemporario: false
  },
  {
    id: 7,
    sigla: 'PTSAVCBPTIOT',
    descricao: 'Projeto Técnico Simplificado para Instalação e Ocupação Temporária (PTSAVCBPTIOT)',
    form_mode: 'pts',
    category: 'pts',
    license: 'AVCB',
    isTemporario: true
  },
  {
    id: 8,
    sigla: 'PTSAVCBPTOTEP',
    descricao: 'Projeto Técnico Simplificado para Ocupação Temporária em Edificação Permanente (PTSAVCBPTOTEP)',
    form_mode: 'pts',
    category: 'pts',
    license: 'AVCB',
    isTemporario: true
  }
];

export const GLP_CLASSES = [
  { id: 'Classe I', label: 'Classe I', limit: 'Até 520 kg', maxKg: 520, isPt: false },
  { id: 'Classe II', label: 'Classe II', limit: 'Até 1.560 kg', maxKg: 1560, isPt: false },
  { id: 'Classe III', label: 'Classe III', limit: 'Até 6.240 kg', maxKg: 6240, isPt: false },
  { id: 'Classe IV', label: 'Classe IV', limit: 'Até 12.480 kg', maxKg: 12480, isPt: false },
  { id: 'Classe V', label: 'Classe V', limit: 'Até 24.960 kg', maxKg: 24960, isPt: true },
  { id: 'Classe VI', label: 'Classe VI', limit: 'Até 49.920 kg', maxKg: 49920, isPt: true },
  { id: 'Classe VII', label: 'Classe VII', limit: 'Até 99.840 kg', maxKg: 99840, isPt: true },
  { id: 'Classe ESPECIAL', label: 'Classe ESPECIAL', limit: 'Acima de 99.840 kg', maxKg: Infinity, isPt: true }
] as const;

export const PORTES_INSTITUICAO = [
  'MEI - Microempreendedor Individual',
  'ME - Microempresa',
  'EPP - Empresa de Pequeno Porte',
  'Médio Porte',
  'Grande Empresa',
  'Outros'
];

/** Componente de Switch Slider Deslizante moderno para substituir todas as checkboxes */
function ToggleSlider({
  checked,
  onChange,
  disabled,
  label,
  description,
  badge
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <label className={`toggle-slider-wrapper ${checked ? 'is-active' : ''} ${disabled ? 'is-disabled' : ''}`}>
      <span className="toggle-slider-track">
        <input
          type="checkbox"
          className="sr-only toggle-slider-input"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="toggle-slider-thumb" />
      </span>
      {(label || description || badge) && (
        <span className="toggle-slider-content">
          <span className="toggle-slider-header">
            {label && <strong className="toggle-slider-title">{label}</strong>}
            {badge}
          </span>
          {description && <small className="toggle-slider-description">{description}</small>}
        </span>
      )}
    </label>
  );
}

// 6 Alturas Oficiais do Enum Fênix CBMBA
const FENIX_HEIGHTS_DEFAULT = [
  'Térrea = Um pavimento',
  'Baixa = H <= 6,00 m',
  'Baixa-Média = 6,00 m < H <= 12,00 m',
  'Média = 12,00 m < H <= 23,00 m',
  'Medianamente Alta = 23,00 m < H <= 30,00 m',
  'Alta = Acima de 30,00 m'
];

// CNAEs Bloqueados para PTS
const BLOCKED_PTS_CNAES_DEFAULT = [
  '0600001',
  '2092401',
  '2092402',
  '2092403',
  '4681801',
  '4731800',
  '4732600',
  '4789006'
];

// Dados Gabarito Reais do VAL SAT extraídos de docs/FENIX-CADASTRO-EDIFICACAO-E-PROJETO.md
export const VAL_SAT_SAMPLE: ProjectDraftInput = {
  name: 'VAL SAT - Apuarema (Gabarito Oficial CBMBA)',
  edificacao_mode: 'new',
  edificacao_id: null,
  form_mode: 'pts',
  tipo_projeto_id: 5,
  process_category: 'pts',
  license_type: 'CLCB',
  isencao_id: 1,
  n_art_rrt: 'BA20261628773',
  data_inicio: '',
  data_fim: '',
  projeto_anterior: false,
  n_projeto_anterior: '',
  decreto_estadual_adotado_id: 2,
  cnae_not_in_it14: false,
  porte_outros: '',
  qtde_pessoas: '',
  qtde_leitos: '',
  qtde_funcionarios: '',
  area_comum: '',
  subsolo_maior_50m: false,
  cobertura_fsps_sup200: false,
  edification: {
    reference_name: 'VAL SAT',
    registration: '',
    height: 'Baixa-Média = 6,00 m < H <= 12,00 m',
    number_floors: 2,
    building_area: 434.11,
    area_to_be_built: 0,
    discount_area: 0
  },
  address: {
    zip_code: '45355000',
    public_place: 'RUA OTACILIO PINHEIRO',
    number: 'S/N',
    complement: '***',
    district: 'CENTRO',
    county: 'APUAREMA',
    municipio_id: 22,
    state: 'BA',
    geographic_coordinates: '-13.7844,-39.8183'
  },
  institution: {
    tipo_pessoa: 'PJ',
    cnpj_cpf: '09566970000123',
    razao_social: 'VANDERLEI DA SILVA SANTOS DE APUAREMA',
    nome_fantasia: 'VAL SAT E CASA DOS COLCHÕES',
    natureza_juridica: 'EPP - Empresa de Pequeno Porte',
    cnae: '4754701',
    atividade_economica: 'Comércio varejista de móveis',
    risk: 300
  },
  occupation: {
    occupation_group_id: 3,
    division_group_id: 6,
    has_underground: false,
    underground_occupation_group_id: 13,
    underground_division_group_id: 58
  },
  proprietario: {
    tipo_pessoa_prop: 'PJ',
    cpf_cnpj_prop: '09566970000123',
    nome_proprietario: 'VAL SAT E CASA DOS COLCHÕES',
    email_proprietario: 'engenharia@abaincendio.com.br',
    tel_proprietario: '(71) 4000-2895'
  },
  responsavel: {
    responsavel_uso_igual_prop: true,
    tipo_pessoa_resp: 'PJ',
    cpf_cnpj_resp: '09566970000123',
    nome_responsavel: 'VAL SAT E CASA DOS COLCHÕES',
    email_responsavel_uso: 'engenharia@abaincendio.com.br',
    tel_responsavel_uso: '(71) 4000-2895'
  },
  technical: {
    cpf: '09566970000123',
    name: 'ENG. MARCOS VINICIUS ALMEIDA',
    crea_cau: '05189283-BA',
    telephone: '(71) 4000-2895',
    email: 'engenharia@abaincendio.com.br'
  },
  responsaveis_tecnicos: [
    {
      tipo_numero: 'CREA',
      conselho: 'CREA',
      crea_cau: '05189283-BA',
      n_registro_conselho: '05189283-BA',
      name: 'ENG. MARCOS VINICIUS ALMEIDA',
      nome_tecnico: 'ENG. MARCOS VINICIUS ALMEIDA',
      cpf_cnpj: '09566970000123',
      cpf_cnpj_tecnico: '09566970000123',
      phone: '7140002895',
      telefone_tecnico: '7140002895',
      email: 'engenharia@abaincendio.com.br',
      email_tecnico: 'engenharia@abaincendio.com.br',
      n_art_rrt: 'BA20261628773'
    }
  ],
  incluir_rt_opcional: false,
  questionario: {
    edf_saida_direta: true,
    edf_regularizada_certificado: false,
    tipo_certificado: 'AVCB',
    n_certificado: '',
    renovacao_sap: false,
    lotacao_max_pessoas: false,
    existe_gases_inflamaveis: false,
    existe_liquidos_inflamaveis: false,
    glp_12480kg: false,
    gas_glp: false,
    armazena_produtos_perigosos: false,
    local_reuniao_publico: false,
    subsolo_maior_50m_pt: false,
    cobertura_fibras_sape: false
  },
  specialRisks: {
    liquidos_inflamaveis: false,
    gas_liquefeito_petroleo: false,
    produtos_perigosos: false,
    fogos_artificio: false,
    vaso_pressao: false,
    outros: ''
  },
  glpData: {
    total_kg_glp: '',
    classe_glp: 'Classe I'
  },
  securityMeasures: {
    iluminacao_emerg: 1,
    sinal_emerg: 1,
    extintores: 1,
    saidas_emerg: 1,
    brigada_incendio: 1,
    control_mat_acab: 1
  }
};

// Funções de formatação e máscaras
function cleanDigits(val?: string | number | null): string {
  if (!val) return '';
  return String(val).replace(/\D/g, '');
}

function formatCnpjCpf(val?: string): string {
  const digits = cleanDigits(val);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

function formatCep(val?: string): string {
  const digits = cleanDigits(val).slice(0, 8);
  if (digits.length > 5) {
    return digits.replace(/(\d{5})(\d{1,3})/, '$1-$2');
  }
  return digits;
}

function formatPhone(val?: string): string {
  const digits = cleanDigits(val).slice(0, 11);
  if (digits.length > 10) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  if (digits.length > 6) {
    return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  }
  if (digits.length > 2) {
    return digits.replace(/(\d{2})(\d{0,5})/, '($1) $2');
  }
  return digits;
}

function formatCnae(val?: string): string {
  const digits = cleanDigits(val).slice(0, 7);
  if (digits.length > 5) {
    return digits.replace(/(\d{4})(\d{1})(\d{1,2})/, '$1-$2/$3');
  }
  if (digits.length > 4) {
    return digits.replace(/(\d{4})(\d{1})/, '$1-$2');
  }
  return digits;
}

// Parse inteligente de endereço para reaproveitamento de edificações existentes
export function parseBuildingAddressString(rawAddress?: string | null): {
  zip_code?: string;
  public_place?: string;
  number?: string;
  district?: string;
  complement?: string;
} {
  if (!rawAddress || typeof rawAddress !== 'string') return {};
  const cleaned = rawAddress.trim();
  if (!cleaned) return {};

  let remaining = cleaned;
  let zip_code: string | undefined;

  const cepMatch = remaining.match(/\b(\d{5}-?\d{3})\b/);
  if (cepMatch) {
    zip_code = cepMatch[1].replace('-', '');
    remaining = remaining.replace(cepMatch[0], '').trim();
  }

  const segments = remaining
    .split(/[,–—]/)
    .map((s) => s.trim())
    .filter((s) => Boolean(s) && !/^(BA|Bahia)$/i.test(s));

  let public_place: string | undefined;
  let number: string | undefined;
  let district: string | undefined;
  let complement: string | undefined;

  if (segments.length >= 1) {
    const first = segments[0];
    const numMatch = first.match(/^(.*?)(?:,\s*|\s+(?:n[ºo]?\s*)|\s+)(\d+|s\/?n\b)(.*)$/i);
    if (numMatch && numMatch[1].trim() && numMatch[2]) {
      public_place = numMatch[1].trim();
      number = numMatch[2].trim();
      if (numMatch[3]?.trim()) complement = numMatch[3].trim();
    } else {
      public_place = first;
    }
  }

  if (segments.length >= 2) {
    const second = segments[1];
    if (!number && /^\s*(?:n[ºo]?\s*)?(\d+|s\/?n\b)\s*$/i.test(second)) {
      number = second.replace(/n[ºo]?\s*/i, '').trim();
    } else if (!district) {
      district = second;
    }
  }

  if (segments.length >= 3) {
    const third = segments[2];
    if (!district) {
      district = third;
    } else if (!complement) {
      complement = third;
    }
  }

  return {
    ...(zip_code ? { zip_code } : {}),
    ...(public_place ? { public_place } : {}),
    ...(number ? { number } : {}),
    ...(district ? { district } : {}),
    ...(complement ? { complement } : {})
  };
}

interface DraftAnchorItem {
  id: string;
  label: string;
}

const DRAFT_STEP_ANCHORS: Record<number, DraftAnchorItem[]> = {
  1: [
    { id: 'draft-s1-cnpj', label: 'Consulta Rápida CNPJ / IT-14' },
    { id: 'draft-s1-origem', label: 'Origem do Imóvel' },
    { id: 'draft-s1-endereco', label: 'Endereço Oficial' },
    { id: 'draft-s1-estrutura', label: 'Características e Áreas' },
    { id: 'draft-s1-resumo-area', label: 'Área Total do Projeto' }
  ],
  2: [
    { id: 'draft-s2-enquadramento', label: 'Enquadramento CBMBA' },
    { id: 'draft-s2-dados-gerais', label: 'Tipo de Projeto e Dados Gerais' },
    { id: 'draft-s2-instituicao', label: 'Estabelecimento e CNAE' },
    { id: 'draft-s2-ocupacao', label: 'Ocupação e Divisão (IT-14)' },
    { id: 'draft-s2-questionario', label: 'Questionário Técnico' },
    { id: 'draft-s2-proprietario', label: 'Proprietário e Responsável' },
    { id: 'draft-s2-rt', label: 'Responsáveis Técnicos (RT)' },
    { id: 'draft-s2-medidas', label: 'Medidas de Segurança (22)' },
    { id: 'draft-s2-riscos-glp', label: 'Riscos Especiais e GLP' }
  ],
  3: [
    { id: 'draft-s3-documentos', label: 'Documentos Pós-Protocolo' },
    { id: 'draft-s3-conformidade', label: 'Diagnóstico de Conformidade' },
    { id: 'draft-s3-transmissao', label: 'Envio Oficial ao Fênix' }
  ]
};

function DraftSectionAnchorRail({
  step,
  edificacaoMode
}: {
  step: number;
  edificacaoMode?: string;
}) {
  const [activeAnchors, setActiveAnchors] = useState<DraftAnchorItem[]>([]);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let observer: IntersectionObserver | null = null;
    const candidates = DRAFT_STEP_ANCHORS[step] || [];

    const updateAnchorsAndObserver = () => {
      const available = candidates.filter((a) => Boolean(document.getElementById(a.id)));
      setActiveAnchors(available);

      if (!available.length) {
        setVisibleIds(new Set());
        return;
      }

      if (!('IntersectionObserver' in window)) {
        setVisibleIds(new Set([available[0].id]));
        return;
      }

      const visible = new Set<string>();
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const id = (entry.target as HTMLElement).id;
            if (entry.isIntersecting) {
              visible.add(id);
            } else {
              visible.delete(id);
            }
          }
          setVisibleIds((current) => {
            if (current.size === visible.size && [...current].every((id) => visible.has(id))) return current;
            return new Set(visible);
          });
        },
        { rootMargin: '-96px 0px -35% 0px', threshold: 0 }
      );

      available.forEach((a) => {
        const el = document.getElementById(a.id);
        if (el) observer?.observe(el);
      });
    };

    const animFrame = requestAnimationFrame(updateAnchorsAndObserver);

    return () => {
      cancelAnimationFrame(animFrame);
      if (observer) observer.disconnect();
    };
  }, [step, edificacaoMode]);

  const scrollToAnchor = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    target.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start'
    });
  };

  if (!activeAnchors.length) return null;

  const currentAnchorId = activeAnchors.find((anchor) => visibleIds.has(anchor.id))?.id;

  return (
    <nav
      className="settings-anchor-rail"
      aria-label="Atalhos para seções do cadastro"
      style={{ top: 'calc(62px + 28vh)' }}
    >
      {activeAnchors.map((anchor) => {
        const isVisible = visibleIds.has(anchor.id);
        return (
          <button
            key={anchor.id}
            type="button"
            className={`settings-anchor-link ${isVisible ? 'is-current' : ''}`}
            onClick={() => scrollToAnchor(anchor.id)}
            aria-label={`Ir para ${anchor.label}`}
            aria-current={anchor.id === currentAnchorId ? 'location' : undefined}
          >
            <span className="settings-anchor-mark" aria-hidden="true" />
            <span className="settings-anchor-tooltip" aria-hidden="true">
              {anchor.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function ProjectDraftModalContent({
  open,
  isOpen: legacyIsOpen,
  onClose,
  buildings = [],
  onProjectSubmitted,
  mode = 'page',
  copilotOpen: externalCopilotOpen,
  onToggleCopilot,
  onDraftContextChange
}: ProjectDraftModalProps) {
  const isOpen = Boolean(open ?? legacyIsOpen);
  const isPage = mode === 'page';
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [currentDraft, setCurrentDraft] = useState<DraftRecord | null>(null);
  const [formData, setFormData] = useState<ProjectDraftInput>(INITIAL_EMPTY_DRAFT);
  const [domains, setDomains] = useState<FenixDomainResponse | null>(null);
  const [domainsLoading, setDomainsLoading] = useState(false);

  // Estados de busca por CNPJ e integração IT-14 (AbaIncêndio)
  const [cnpjSearchInput, setCnpjSearchInput] = useState('');
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjNotice, setCnpjNotice] = useState<{ message: string; type: 'success' | 'warning' | 'error' } | null>(null);
  const [it14Result, setIt14Result] = useState<CnpjIt14LookupResult | null>(null);

  // Estados de ações de busca
  const [cepLoading, setCepLoading] = useState(false);
  const [cepNotice, setCepNotice] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [cnaeLoading, setCnaeLoading] = useState(false);
  const [cnaeNotice, setCnaeNotice] = useState<{ message: string; type: 'success' | 'warning' | 'error' } | null>(null);

  // Estados de salvamento e envio
  const [saving, setSaving] = useState(false);
  const [confirmKey, setConfirmKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<{
    ok: boolean;
    data?: unknown;
    error?: string;
  } | null>(null);

  // Toast / feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Estados do Copiloto IA Integrado
  const [localCopilotOpen, setLocalCopilotOpen] = useState(false);
  const copilotOpen = externalCopilotOpen !== undefined ? externalCopilotOpen : localCopilotOpen;
  const toggleCopilot = onToggleCopilot || (() => setLocalCopilotOpen((prev) => !prev));

  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotThinking, setCopilotThinking] = useState<string>('');
  const [copilotPrompt, setCopilotPrompt] = useState('');
  const [fieldFlashKeys, setFieldFlashKeys] = useState<Set<string>>(new Set());

  // Aplicação reativa de patch de rascunho
  const applyFormPatch = useCallback((patch: NonNullable<DraftAiAssistantResponse['formPatch']>) => {
    const modifiedKeys = new Set<string>();

    setFormData((prev) => {
      const next = { ...prev };
      if (patch.name) {
        next.name = patch.name;
        modifiedKeys.add('name');
      }
      if (patch.form_mode) {
        next.form_mode = patch.form_mode;
        modifiedKeys.add('form_mode');
      }
      if (patch.tipo_projeto_id) {
        next.tipo_projeto_id = patch.tipo_projeto_id;
        const targetType = OFFICIAL_PROJECT_TYPES.find((t) => t.id === patch.tipo_projeto_id);
        if (targetType) {
          next.form_mode = targetType.form_mode;
          next.process_category = targetType.category;
          next.license_type = targetType.license;
        }
        modifiedKeys.add('tipo_projeto_id');
      } else if (patch.evento === 'S' && ![2, 3, 7, 8].includes(next.tipo_projeto_id || 0)) {
        const isCurrentlyPt = [1, 2, 3].includes(next.tipo_projeto_id || 0) || next.form_mode === 'pt';
        const targetId = isCurrentlyPt ? 2 : 7;
        next.tipo_projeto_id = targetId;
        const targetType = OFFICIAL_PROJECT_TYPES.find((t) => t.id === targetId);
        if (targetType) {
          next.form_mode = targetType.form_mode;
          next.process_category = targetType.category;
          next.license_type = targetType.license;
        }
        modifiedKeys.add('tipo_projeto_id');
      }
      if (patch.process_category) {
        next.process_category = patch.process_category as 'pts' | 'pt';
      }
      if (patch.license_type) {
        next.license_type = patch.license_type as 'CLCB' | 'AVCB';
      }
      if (patch.edification) {
        next.edification = { ...next.edification, ...patch.edification };
        modifiedKeys.add('edification');
      }
      if (patch.address) {
        next.address = { ...next.address, ...patch.address };
        modifiedKeys.add('address');
      }
      if (patch.institution) {
        next.institution = { ...next.institution, ...patch.institution };
        modifiedKeys.add('institution');
      }
      if (patch.occupation) {
        next.occupation = { ...next.occupation, ...patch.occupation };
        modifiedKeys.add('occupation');
      }
      if (patch.proprietario) {
        next.proprietario = { ...next.proprietario, ...patch.proprietario };
        modifiedKeys.add('proprietario');
      }
      if (patch.responsavel) {
        next.responsavel = { ...next.responsavel, ...patch.responsavel };
        modifiedKeys.add('responsavel');
      }
      if (patch.technical) {
        next.technical = { ...next.technical, ...patch.technical };
        modifiedKeys.add('technical');
      }
      if (patch.questionario) {
        next.questionario = { ...(next.questionario || {}), ...patch.questionario };
        modifiedKeys.add('questionario');
      }
      if (patch.specialRisks) {
        next.specialRisks = { ...(next.specialRisks || {}), ...patch.specialRisks };
        modifiedKeys.add('specialRisks');
      }
      if (patch.securityMeasures) {
        const normalized = normalizeSecurityMeasures(patch.securityMeasures, false);
        next.securityMeasures = { ...next.securityMeasures, ...normalized };
        modifiedKeys.add('measures');
      }
      return next;
    });

    if (patch.step && (patch.step === 1 || patch.step === 2 || patch.step === 3)) {
      setStep(patch.step);
    }

    setFieldFlashKeys(modifiedKeys);
    setTimeout(() => setFieldFlashKeys(new Set()), 2600);
    setToast({ message: 'Modificações da IA aplicadas ao formulário!', type: 'success' });
  }, []);

  // Notifica o Shell/Sidebar do Copiloto sobre o rascunho atual em edição
  useEffect(() => {
    onDraftContextChange?.({
      currentDraft: formData,
      applyPatch: applyFormPatch,
      isEditor: view === 'editor'
    });
  }, [formData, applyFormPatch, view, onDraftContextChange]);

  useEffect(() => {
    return () => {
      onDraftContextChange?.(null);
    };
  }, [onDraftContextChange]);
  const [copilotMessages, setCopilotMessages] = useState<Array<{
    role: 'user' | 'assistant';
    content: string;
    thinkingSteps?: string[];
    appliedChangesSummary?: string[];
    suggestions?: string[];
  }>>([
    {
      role: 'assistant',
      content: 'Olá! Sou o Copiloto IA do Fênix Painel, especialista no Decreto Estadual 16.302/BA e IT-14 do CBMBA. Posso preencher campos, sugerir medidas, revisar pendências e calcular enquadramentos em tempo real.',
      suggestions: [
        '✦ Auto-revisar e corrigir pendências da tela',
        '✦ Sugerir e marcar medidas da IT-14',
        '✦ Exemplo: Galpão 620 m² em Feira de Santana',
        '✦ Explicar meu enquadramento atual'
      ]
    }
  ]);

  // Municípios ordenados alfabeticamente para select único
  const sortedCounties = useMemo(() => {
    if (!domains?.counties) return [];
    return [...domains.counties].sort((a, b) => a.municipio.localeCompare(b.municipio, 'pt-BR'));
  }, [domains?.counties]);

  // Trava scroll da tela somente no modo modal flutuante
  useEffect(() => {
    if (!isOpen || isPage) return;
    const prevBody = document.body.style.overflow;
    const prevDoc = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevDoc;
    };
  }, [isOpen, isPage]);

  // Tecla Escape para fechar (somente em modo modal)
  useEffect(() => {
    if (!isOpen || isPage) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, isPage, onClose]);

  // Carrega lista de rascunhos e domínios do Fênix
  const fetchDrafts = async () => {
    setDraftsLoading(true);
    try {
      const res = await api<{ drafts: DraftRecord[] }>('/api/drafts');
      const normalized = (res.drafts || []).map((d) => ({
        ...d,
        data: normalizeProjectDraftInput(d?.data, d?.name, d?.id)
      }));
      setDrafts(normalized);
    } catch {
      // Falha silenciosa no carregamento inicial
    } finally {
      setDraftsLoading(false);
    }
  };

  const fetchDomains = async () => {
    setDomainsLoading(true);
    try {
      const res = await api<FenixDomainResponse>('/api/fenix-domains');
      setDomains(res);
    } catch {
      // Mantém fallbacks padrão
    } finally {
      setDomainsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void fetchDrafts();
      void fetchDomains();
    }
  }, [isOpen]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 4000);
  };

  // Cálculo da área total reativo
  const calculatedTotalArea = useMemo(() => {
    const built = parseFloat(String(formData.edification?.building_area ?? (formData as any)?.area_construida ?? 0).replace(',', '.')) || 0;
    const toBuild = parseFloat(String(formData.edification?.area_to_be_built ?? (formData as any)?.area_a_construir ?? 0).replace(',', '.')) || 0;
    const discount = parseFloat(String(formData.edification?.discount_area ?? (formData as any)?.area_desconto ?? 0).replace(',', '.')) || 0;
    return Math.max(0, +(built + toBuild - discount).toFixed(2));
  }, [formData.edification?.building_area, formData.edification?.area_to_be_built, formData.edification?.discount_area, (formData as any)?.area_construida]);

  // Enquadramento automático em tempo real
  const enquadramento = useMemo(() => {
    const totalArea = calculatedTotalArea;
    const floors = Number(formData.edification?.number_floors ?? (formData as any)?.pavimentos) || 1;
    const rawCnae = cleanDigits(formData.institution?.cnae ?? (formData as any)?.cnae);

    const blockedList = domains?.blockedPtsCnaes || BLOCKED_PTS_CNAES_DEFAULT;
    const isCnaeBlocked = blockedList.includes(rawCnae);

    // Identifica riscos especiais de GLP (> 12.480kg ou Classe V+)
    const glpKg = parseFloat(String(formData.glpData?.total_kg_glp || 0)) || 0;
    const isGlpExceedingPts = glpKg > 12480 || (formData.glpData?.classe_glp && ['Classe V', 'Classe VI', 'Classe VII', 'Classe ESPECIAL'].includes(formData.glpData.classe_glp));

    // Verifica se alguma das 16 medidas avançadas de engenharia foi selecionada
    const hasAdvancedMeasure = OFFICIAL_FENIX_MEASURES.some((m) => !m.basic && Boolean(formData.securityMeasures?.[m.key]));

    // Se for ocupação temporária
    const isCurrentTemporario = [2, 3, 7, 8].includes(formData.tipo_projeto_id || 0);

    const requiresPt = totalArea > 750 || floors > 3 || isCnaeBlocked || isGlpExceedingPts || hasAdvancedMeasure;

    if (requiresPt) {
      let ptId = 1;
      let ptSigla = 'PT';
      let ptNome = 'Projeto Técnico Completo';
      if (formData.tipo_projeto_id === 7 || (isCurrentTemporario && formData.tipo_projeto_id !== 3 && formData.tipo_projeto_id !== 8)) {
        ptId = 2;
        ptSigla = 'PTIOT';
        ptNome = 'Projeto Técnico para Instalação e Ocupação Temporária (PTIOT)';
      } else if (formData.tipo_projeto_id === 8 || formData.tipo_projeto_id === 3) {
        ptId = 3;
        ptSigla = 'PTOTEP';
        ptNome = 'Projeto Técnico para Ocupação Temporária em Edificação Permanente (PTOTEP)';
      }

      let motivo = '';
      if (totalArea > 750) motivo = `Área total de ${totalArea.toLocaleString('pt-BR')} m² supera o limite de 750 m²`;
      else if (floors > 3) motivo = `Nº de pavimentos (${floors}) superior a 3 pavimentos`;
      else if (isCnaeBlocked) motivo = 'CNAE de alto risco com bloqueio mandatório para PTS';
      else if (isGlpExceedingPts) motivo = 'Armazenamento de GLP acima de 12.480 kg (exige sistemas fixos e PT)';
      else if (hasAdvancedMeasure) motivo = 'Medidas avançadas de engenharia selecionadas (exigem PT Completo)';
      else motivo = 'Edificação com características de Projeto Técnico Completo';

      return {
        sigla: ptSigla,
        nome: ptNome,
        badgeClass: 'badge-pt',
        motivo,
        suggestedCategory: 'pt' as const,
        suggestedLicense: 'AVCB' as const,
        suggestedFormMode: 'pt' as const,
        suggestedTipoProjetoId: ptId,
        isPts: false
      };
    }

    if (isCurrentTemporario) {
      if (formData.tipo_projeto_id === 3 || formData.tipo_projeto_id === 8) {
        return {
          sigla: 'PTSAVCBPTOTEP',
          nome: 'PTS para Ocupação Temporária em Edificação Permanente',
          badgeClass: 'badge-avcb',
          motivo: 'Ocupação temporária em edificação até 750 m²',
          suggestedCategory: 'pts' as const,
          suggestedLicense: 'AVCB' as const,
          suggestedFormMode: 'pts' as const,
          suggestedTipoProjetoId: 8,
          isPts: true
        };
      }
      return {
        sigla: 'PTSAVCBPTIOT',
        nome: 'PTS para Instalação e Ocupação Temporária',
        badgeClass: 'badge-avcb',
        motivo: 'Instalação e ocupação temporária simplificada (até 750 m²)',
        suggestedCategory: 'pts' as const,
        suggestedLicense: 'AVCB' as const,
        suggestedFormMode: 'pts' as const,
        suggestedTipoProjetoId: 7,
        isPts: true
      };
    }

    if (totalArea <= 200 && floors === 1 && formData.license_type !== 'AVCB' && formData.tipo_projeto_id !== 6) {
      return {
        sigla: 'PTSCLCB1',
        nome: 'PTS até 200 m² (CLCB Automático)',
        badgeClass: 'badge-clcb',
        motivo: 'Edificação térrea com área total até 200 m²',
        suggestedCategory: 'pts' as const,
        suggestedLicense: 'CLCB' as const,
        suggestedFormMode: 'pts' as const,
        suggestedTipoProjetoId: 4,
        isPts: true
      };
    }

    if (totalArea <= 750 && floors <= 3) {
      if (formData.license_type === 'AVCB' || formData.tipo_projeto_id === 6) {
        return {
          sigla: 'PTSAVCB',
          nome: 'PTS com Vistoria Prévia (AVCB)',
          badgeClass: 'badge-avcb',
          motivo: 'Área até 750 m² e até 3 pavimentos com vistoria presencial do CBMBA',
          suggestedCategory: 'pts' as const,
          suggestedLicense: 'AVCB' as const,
          suggestedFormMode: 'pts' as const,
          suggestedTipoProjetoId: 6,
          isPts: true
        };
      }
      return {
        sigla: 'PTSCLCB2',
        nome: 'PTS até 750 m² e até 3 pavimentos (CLCB)',
        badgeClass: 'badge-clcb',
        motivo: 'Área até 750 m² e até 3 pavimentos sem vistoria prévia',
        suggestedCategory: 'pts' as const,
        suggestedLicense: 'CLCB' as const,
        suggestedFormMode: 'pts' as const,
        suggestedTipoProjetoId: 5,
        isPts: true
      };
    }

    return {
      sigla: 'PT',
      nome: 'Projeto Técnico Completo',
      badgeClass: 'badge-pt',
      motivo: `Área de ${totalArea.toLocaleString('pt-BR')} m² ou ${floors} pavimentos`,
      suggestedCategory: 'pt' as const,
      suggestedLicense: 'AVCB' as const,
      suggestedFormMode: 'pt' as const,
      suggestedTipoProjetoId: 1,
      isPts: false
    };
  }, [calculatedTotalArea, formData.edification.number_floors, formData.institution.cnae, formData.license_type, formData.tipo_projeto_id, formData.glpData, formData.securityMeasures, domains]);

  // Lista de erros e validações locais do rascunho
  const localValidation = useMemo(() => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Etapa 1: Edificação e Endereço
    if (formData.edificacao_mode === 'existing' && !String(formData.edificacao_id || '').trim()) {
      errors.push('Etapa 1: Informe o ID da edificação existente no Fênix.');
    }
    if (!(formData.edification?.reference_name || '').trim()) {
      errors.push('Etapa 1: Nome de referência da edificação é obrigatório.');
    }
    if (!formData.edification?.height) {
      errors.push('Etapa 1: Altura da edificação é obrigatória.');
    }
    if (formData.edification?.height === 'Térrea = Um pavimento' && Number(formData.edification?.number_floors) !== 1) {
      errors.push('Etapa 1: Quando a altura for "Térrea", o número de pavimentos deve ser exatamente 1.');
    }
    if (calculatedTotalArea <= 0) {
      errors.push('Etapa 1: A área total construída deve ser maior que zero.');
    }
    if (cleanDigits(formData.address?.zip_code).length !== 8) {
      errors.push('Etapa 1: CEP deve conter 8 dígitos.');
    }
    if (!(formData.address?.public_place || '').trim()) {
      errors.push('Etapa 1: Logradouro é obrigatório.');
    }
    if (!(formData.address?.number || '').trim()) {
      errors.push('Etapa 1: Número predial é obrigatório (use "S/N" caso não exista).');
    }
    if (!(formData.address?.district || '').trim()) {
      errors.push('Etapa 1: Bairro é obrigatório.');
    }
    if (!formData.address?.municipio_id) {
      errors.push('Etapa 1: Município deve ser selecionado na lista oficial do CBMBA.');
    }

    // Etapa 2: Projeto e Enquadramento
    const rawCnpjCpf = cleanDigits(formData.institution?.cnpj_cpf);
    if (!rawCnpjCpf || (rawCnpjCpf.length !== 11 && rawCnpjCpf.length !== 14)) {
      errors.push('Etapa 2: CNPJ ou CPF do estabelecimento é obrigatório e deve ter 11 ou 14 dígitos.');
    }
    if (!(formData.institution?.razao_social || '').trim()) {
      errors.push('Etapa 2: Razão Social do estabelecimento é obrigatória.');
    }
    if (!cleanDigits(formData.institution?.cnae)) {
      errors.push('Etapa 2: Código CNAE é obrigatório.');
    }
    if (
      (formData.institution?.natureza_juridica === 'Outros' || (formData.institution as any)?.porte === 'Outros' || (formData as any)?.porte === 'Outros') &&
      !formData.porte_outros?.trim() &&
      !(formData.institution as any)?.porte_outros?.trim()
    ) {
      errors.push('Etapa 2: Especifique a Natureza Jurídica quando selecionar "Outros".');
    }
    if (!formData.occupation?.occupation_group_id || !formData.occupation?.division_group_id) {
      errors.push('Etapa 2: Grupo e Divisão de ocupação IT 14 são obrigatórios.');
    }
    if (!(formData.proprietario?.nome_proprietario || '').trim()) {
      errors.push('Etapa 2: Nome do proprietário é obrigatório.');
    }
    if (!cleanDigits(formData.proprietario?.cpf_cnpj_prop)) {
      errors.push('Etapa 2: CPF/CNPJ do proprietário é obrigatório.');
    }
    if (!(formData.proprietario?.email_proprietario || '').trim() || !formData.proprietario?.email_proprietario?.includes('@')) {
      errors.push('Etapa 2: E-mail de contato do proprietário é obrigatório.');
    }
    const propTel = cleanDigits(formData.proprietario?.tel_proprietario);
    if (!propTel || (propTel.length !== 10 && propTel.length !== 11)) {
      errors.push('Etapa 2: Telefone do proprietário é obrigatório (com DDD).');
    }

    // Responsável pelo uso quando não for a mesma pessoa
    const mesmoProp = Boolean(formData.responsavel?.responsavel_uso_igual_prop ?? (formData as any).mesmo_proprietario);
    if (!mesmoProp) {
      if (!formData.responsavel?.nome_responsavel?.trim()) {
        errors.push('Etapa 2: Nome do responsável pelo uso é obrigatório.');
      }
      const respDoc = cleanDigits(formData.responsavel?.cpf_cnpj_resp);
      if (!respDoc || (respDoc.length !== 11 && respDoc.length !== 14)) {
        errors.push('Etapa 2: CPF/CNPJ do responsável pelo uso é obrigatório (11 ou 14 dígitos).');
      }
      const respEmail = String(formData.responsavel?.email_responsavel_uso || (formData.responsavel as any)?.email_responsavel || '').trim();
      if (!respEmail || !respEmail.includes('@')) {
        errors.push('Etapa 2: E-mail do responsável pelo uso é obrigatório.');
      }
      const respTel = cleanDigits(formData.responsavel?.tel_responsavel_uso || (formData.responsavel as any)?.tel_responsavel || '');
      if (!respTel || (respTel.length !== 10 && respTel.length !== 11)) {
        errors.push('Etapa 2: Telefone do responsável pelo uso é obrigatório (com DDD).');
      }
    }

    // Riscos Especiais: GLP
    const isGlpAtivo = Boolean(formData.specialRisks?.gas_liquefeito_petroleo || (formData as any).glp_quantidade_kg || formData.glpData?.total_kg_glp);
    const qtdGlp = Number(formData.glpData?.total_kg_glp ?? (formData as any).glp_quantidade_kg ?? (formData as any).total_kg_glp ?? 0);
    if (isGlpAtivo && !(qtdGlp > 0)) {
      errors.push('Etapa 2: Informe a quantidade total de GLP (kg).');
    }

    // Validação de Responsável Técnico e ART/RRT
    const isPtsClcb1SaidaDireta = formData.tipo_projeto_id === 4 && formData.questionario?.edf_saida_direta !== false;
    const mainArt = String(formData.n_art_rrt?.trim() || formData.responsaveis_tecnicos?.[0]?.n_art_rrt?.trim() || '');

    if (!isPtsClcb1SaidaDireta) {
      if (!mainArt) {
        errors.push('Etapa 2: Número de ART/RRT do projeto técnico é obrigatório.');
      }
      if (!formData.responsaveis_tecnicos || formData.responsaveis_tecnicos.length === 0) {
        errors.push('Etapa 2: Cadastre ao menos 1 Responsável Técnico pelo projeto.');
      } else {
        formData.responsaveis_tecnicos.forEach((rt, idx) => {
          const idxMsg = formData.responsaveis_tecnicos!.length > 1 ? ` #${idx + 1}` : '';
          if (!rt.nome_tecnico?.trim()) {
            errors.push(`Etapa 2: Nome do Responsável Técnico${idxMsg} é obrigatório.`);
          }
          const cDigits = cleanDigits(rt.cpf_cnpj_tecnico);
          if (!cDigits || (cDigits.length !== 11 && cDigits.length !== 14)) {
            errors.push(`Etapa 2: CPF/CNPJ do Responsável Técnico${idxMsg} é obrigatório (11 ou 14 dígitos).`);
          }
          if (!rt.conselho || !['CREA', 'CAU', 'CFT'].includes(rt.conselho)) {
            errors.push(`Etapa 2: Conselho do Responsável Técnico${idxMsg} deve ser CREA, CAU ou CFT.`);
          }
          if (!rt.n_registro_conselho?.trim()) {
            errors.push(`Etapa 2: Nº de registro no conselho do Responsável Técnico${idxMsg} é obrigatório.`);
          }
          if (formData.responsaveis_tecnicos!.length > 1 && !rt.n_art_rrt?.trim()) {
            errors.push(`Etapa 2: Nº da ART/RRT do Responsável Técnico${idxMsg} é obrigatório.`);
          }
          if (!rt.email_tecnico?.trim() || !rt.email_tecnico.includes('@')) {
            errors.push(`Etapa 2: E-mail do Responsável Técnico${idxMsg} é obrigatório e deve ser válido.`);
          }
          const tDigits = cleanDigits(rt.telefone_tecnico);
          if (!tDigits || (tDigits.length !== 10 && tDigits.length !== 11)) {
            errors.push(`Etapa 2: Telefone do Responsável Técnico${idxMsg} é obrigatório (10 ou 11 dígitos com DDD).`);
          }
        });
      }
    } else if (formData.incluir_rt_opcional) {
      if (!formData.responsaveis_tecnicos || formData.responsaveis_tecnicos.length === 0) {
        errors.push('Etapa 2: Ao optar por cadastrar Responsável Técnico, cadastre ao menos 1 profissional.');
      } else {
        formData.responsaveis_tecnicos.forEach((rt, idx) => {
          const idxMsg = formData.responsaveis_tecnicos!.length > 1 ? ` #${idx + 1}` : '';
          if (!rt.nome_tecnico?.trim()) {
            errors.push(`Etapa 2: Nome do Responsável Técnico${idxMsg} é obrigatório.`);
          }
          const cDigits = cleanDigits(rt.cpf_cnpj_tecnico);
          if (!cDigits || (cDigits.length !== 11 && cDigits.length !== 14)) {
            errors.push(`Etapa 2: CPF/CNPJ do Responsável Técnico${idxMsg} é obrigatório (11 ou 14 dígitos).`);
          }
          if (!rt.conselho || !['CREA', 'CAU', 'CFT'].includes(rt.conselho)) {
            errors.push(`Etapa 2: Conselho do Responsável Técnico${idxMsg} deve ser CREA, CAU ou CFT.`);
          }
          if (!rt.n_registro_conselho?.trim()) {
            errors.push(`Etapa 2: Nº de registro no conselho do Responsável Técnico${idxMsg} é obrigatório.`);
          }
          if (!rt.n_art_rrt?.trim() && !mainArt) {
            errors.push(`Etapa 2: Nº da ART/RRT do Responsável Técnico${idxMsg} é obrigatório.`);
          }
          if (!rt.email_tecnico?.trim() || !rt.email_tecnico.includes('@')) {
            errors.push(`Etapa 2: E-mail do Responsável Técnico${idxMsg} é obrigatório e deve ser válido.`);
          }
          const tDigits = cleanDigits(rt.telefone_tecnico);
          if (!tDigits || (tDigits.length !== 10 && tDigits.length !== 11)) {
            errors.push(`Etapa 2: Telefone do Responsável Técnico${idxMsg} é obrigatório (10 ou 11 dígitos com DDD).`);
          }
        });
      }
    }

    if ([2, 3, 7, 8].includes(formData.tipo_projeto_id || 0)) {
      if (!formData.data_inicio || !formData.data_fim) {
        errors.push('Etapa 2: Datas de início e término são obrigatórias para ocupações temporárias.');
      }
    }

    // Modalidade PTS: limites e requisitos bloqueantes
    if ([4, 5, 6, 7, 8].includes(formData.tipo_projeto_id || 0)) {
      if (calculatedTotalArea > 750 || Number(formData.edification?.number_floors) > 3) {
        errors.push('Etapa 2: Edificação acima de 750 m² ou 3 pavimentos exige Projeto Técnico Completo (PT).');
      }
      if (formData.questionario?.edf_saida_direta === false && !formData.questionario?.edf_regularizada_certificado) {
        errors.push('Etapa 2: Sem saída direta para via pública, o PTS exige que a edificação principal possua AVCB/CLCB vigente (ou altere para PT Completo).');
      }
    }

    // Alertas de coerência
    if (!enquadramento.isPts && [4, 5, 6, 7, 8].includes(formData.tipo_projeto_id || 0)) {
      warnings.push(`Atenção: Os dados informados (${enquadramento.motivo}) exigem Projeto Técnico Completo (PT).`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }, [formData, calculatedTotalArea, enquadramento]);

  // Garante inicialização de ao menos 1 RT quando não for PTSCLCB1 com saída direta
  useEffect(() => {
    const isPtsClcb1SaidaDireta = formData.tipo_projeto_id === 4 && formData.questionario?.edf_saida_direta !== false;
    if (!isPtsClcb1SaidaDireta && (!formData.responsaveis_tecnicos || formData.responsaveis_tecnicos.length === 0)) {
      setFormData((prev) => ({
        ...prev,
        responsaveis_tecnicos: [
          {
            nome_tecnico: '',
            cpf_cnpj_tecnico: '',
            conselho: 'CREA',
            n_registro_conselho: '',
            n_art_rrt: prev.n_art_rrt || '',
            email_tecnico: '',
            telefone_tecnico: ''
          }
        ]
      }));
    }
  }, [formData.tipo_projeto_id, formData.questionario?.edf_saida_direta, formData.responsaveis_tecnicos?.length]);

  // Ações de criação, carga de gabarito e seleção de rascunhos
  const handleNewDraft = () => {
    setCurrentDraft(null);
    setFormData({
      ...INITIAL_EMPTY_DRAFT,
      id: crypto.randomUUID(),
      name: `Rascunho ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      responsaveis_tecnicos: [
        {
          nome_tecnico: '',
          cpf_cnpj_tecnico: '',
          conselho: 'CREA',
          n_registro_conselho: '',
          n_art_rrt: '',
          email_tecnico: '',
          telefone_tecnico: ''
        }
      ]
    });
    setSubmissionResult(null);
    setConfirmKey('');
    setStep(1);
    setView('editor');
  };

  const handleLoadValSatSample = async () => {
    const sampleId = crypto.randomUUID();
    const valSatData: ProjectDraftInput = {
      ...VAL_SAT_SAMPLE,
      id: sampleId
    };
    setCurrentDraft(null);
    setFormData(valSatData);
    setSubmissionResult(null);
    setConfirmKey('');
    setStep(1);
    setView('editor');

    // Salva automaticamente para já deixar persistido
    try {
      setSaving(true);
      const res = await api<{ draft: DraftRecord }>('/api/drafts', {
        method: 'POST',
        body: JSON.stringify(valSatData)
      });
      setCurrentDraft(res.draft);
      showToast('Gabarito VAL SAT carregado e salvo com sucesso!', 'success');
      void fetchDrafts();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Gabarito carregado localmente.', 'info');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenDraft = (draft: DraftRecord) => {
    setCurrentDraft(draft);
    const loadedData: ProjectDraftInput = normalizeProjectDraftInput(draft?.data, draft?.name, draft?.id);
    if (!loadedData.tipo_projeto_id) {
      loadedData.tipo_projeto_id = (loadedData.form_mode === 'pt' || loadedData.process_category === 'pt') ? 1 : 5;
    }
    if (!loadedData.form_mode) {
      loadedData.form_mode = [1, 2, 3].includes(loadedData.tipo_projeto_id) ? 'pt' : 'pts';
    }
    const isPtsClcb1SaidaDireta = loadedData.tipo_projeto_id === 4 && loadedData.questionario?.edf_saida_direta !== false;
    if (!isPtsClcb1SaidaDireta && (!loadedData.responsaveis_tecnicos || loadedData.responsaveis_tecnicos.length === 0)) {
      loadedData.responsaveis_tecnicos = [
        {
          nome_tecnico: '',
          cpf_cnpj_tecnico: '',
          conselho: 'CREA',
          n_registro_conselho: '',
          n_art_rrt: loadedData.n_art_rrt || '',
          email_tecnico: '',
          telefone_tecnico: ''
        }
      ];
    }
    setFormData(loadedData);
    setSubmissionResult(draft.lastSubmission ? { ok: draft.lastSubmission.ok, data: draft.lastSubmission.result, error: draft.lastSubmission.error } : null);
    setConfirmKey('');
    setStep(1);
    setView('editor');
  };

  // Auto-abrir rascunho quando a URL tiver ?draftId=...
  const autoOpenedDraftRef = useRef(false);

  useEffect(() => {
    if (!isOpen || autoOpenedDraftRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const draftIdFromUrl = params.get('draftId');
    if (!draftIdFromUrl) return;

    autoOpenedDraftRef.current = true;

    const loadTargetDraft = async () => {
      try {
        const res = await api<{ draft: DraftRecord }>(`/api/drafts/${encodeURIComponent(draftIdFromUrl)}`);
        if (res.draft) {
          handleOpenDraft(res.draft);
          showToast(`Rascunho "${res.draft.name || 'Projeto'}" carregado para edição.`, 'info');
        }
      } catch {
        const found = drafts.find((d) => d.id === draftIdFromUrl);
        if (found) {
          handleOpenDraft(found);
        }
      } finally {
        try {
          const currentUrl = new URL(window.location.href);
          currentUrl.searchParams.delete('draftId');
          window.history.replaceState({}, '', currentUrl.pathname + currentUrl.search);
        } catch {
          // ignora em navegadores sem suporte
        }
      }
    };

    void loadTargetDraft();
  }, [isOpen, drafts]);

  const handleDeleteDraft = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Tem certeza de que deseja excluir este rascunho?')) return;
    try {
      await api(`/api/drafts/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setDrafts((prev) => prev.filter((d) => d.id !== id));
      if (currentDraft?.id === id) {
        setView('list');
        setCurrentDraft(null);
      }
      showToast('Rascunho excluído.', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Falha ao excluir.', 'error');
    }
  };

  // Salvar rascunho
  const handleSaveDraft = async (silent = false) => {
    setSaving(true);
    try {
      const activeTipoProjetoId = formData.tipo_projeto_id || enquadramento.suggestedTipoProjetoId || 4;
      const isPt = [1, 2, 3].includes(activeTipoProjetoId);
      const activeFormMode: 'pts' | 'pt' = isPt ? 'pt' : 'pts';
      const targetType = OFFICIAL_PROJECT_TYPES.find((t) => t.id === activeTipoProjetoId);

      const payload: ProjectDraftInput = {
        ...formData,
        id: currentDraft?.id || formData.id || crypto.randomUUID(),
        form_mode: activeFormMode,
        tipo_projeto_id: activeTipoProjetoId,
        process_category: targetType?.category || (isPt ? 'pt' : 'pts'),
        license_type: targetType?.license || (isPt ? 'AVCB' : 'CLCB'),
        edification: {
          ...formData.edification,
          total_area: calculatedTotalArea
        }
      };

      const res = await api<{ draft: DraftRecord; validation: ValidationResult }>('/api/drafts', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setCurrentDraft(res.draft);
      setFormData((prev) => ({
        ...prev,
        id: res.draft.id,
        form_mode: activeFormMode,
        tipo_projeto_id: activeTipoProjetoId
      }));
      if (!silent) {
        showToast('Rascunho salvo com sucesso!', 'success');
      }
      void fetchDrafts();
      return res.draft;
    } catch (err) {
      if (!silent) {
        showToast(err instanceof Error ? err.message : 'Falha ao salvar rascunho.', 'error');
      }
      return null;
    } finally {
      setSaving(false);
    }
  };

  // Busca de CEP via ViaCEP com autovinculação ao município oficial CBMBA
  const handleLookupCep = async () => {
    const rawCep = cleanDigits(formData.address.zip_code);
    if (rawCep.length !== 8) {
      setCepNotice({ message: 'Digite um CEP completo com 8 dígitos.', type: 'error' });
      return;
    }

    setCepLoading(true);
    setCepNotice(null);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${rawCep}/json/`);
      const data = await response.json();

      if (data.erro) {
        setCepNotice({ message: 'CEP não encontrado na base dos Correios.', type: 'error' });
        return;
      }

      const logradouro = data.logradouro || '';
      const bairro = data.bairro || '';
      const localidade = (data.localidade || '').toUpperCase().trim();

      // Procura o município na lista de domínios do CBMBA
      let matchedCountyId: number | null = null;
      let matchedCountyName = localidade;

      if (domains?.counties?.length) {
        const normLocalidade = localidade.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const found = domains.counties.find((c) => {
          const normMunicipio = c.municipio.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return normMunicipio === normLocalidade;
        });

        if (found) {
          matchedCountyId = found.id;
          matchedCountyName = found.municipio;
          if (!found.habilitar) {
            setCepNotice({
              message: `Município "${found.municipio}" localizado, mas marcado como não habilitado para emissão no CBMBA.`,
              type: 'error'
            });
          }
        }
      }

      setFormData((prev) => ({
        ...prev,
        address: {
          ...prev.address,
          public_place: logradouro || prev.address.public_place,
          district: bairro || prev.address.district,
          county: matchedCountyName || prev.address.county,
          municipio_id: matchedCountyId ?? prev.address.municipio_id,
          state: 'BA'
        }
      }));

      setCepNotice({
        message: `Endereço localizado: ${logradouro || 'Sem logradouro'}, ${bairro || 'Sem bairro'} - ${matchedCountyName}/BA`,
        type: 'success'
      });
    } catch {
      setCepNotice({ message: 'Falha ao consultar CEP nos Correios.', type: 'error' });
    } finally {
      setCepLoading(false);
    }
  };

  // Busca e validação de CNAE
  const handleLookupCnae = async () => {
    const rawCnae = cleanDigits(formData.institution.cnae);
    if (!rawCnae) {
      setCnaeNotice({ message: 'Informe um código CNAE.', type: 'error' });
      return;
    }

    setCnaeLoading(true);
    setCnaeNotice(null);
    try {
      const res = await api<{ cnae: string; atividade_economica: string; risk: number }>(`/api/fenix-cnae/${encodeURIComponent(rawCnae)}`);
      setFormData((prev) => ({
        ...prev,
        institution: {
          ...prev.institution,
          atividade_economica: res.atividade_economica || prev.institution.atividade_economica,
          risk: res.risk ?? prev.institution.risk
        }
      }));

      const blockedList = domains?.blockedPtsCnaes || BLOCKED_PTS_CNAES_DEFAULT;
      if (blockedList.includes(rawCnae)) {
        setCnaeNotice({
          message: `⚠️ CNAE ${formatCnae(rawCnae)} é classificado como alto risco e BLOQUEIA PTS. Forçará Projeto Técnico Completo.`,
          type: 'warning'
        });
      } else {
        setCnaeNotice({
          message: `Atividade: ${res.atividade_economica} (Carga de Incêndio: ${res.risk} MJ/m²)`,
          type: 'success'
        });
      }
    } catch (err) {
      setCnaeNotice({
        message: err instanceof Error ? err.message : 'CNAE não localizado na tabela do Fênix.',
        type: 'error'
      });
    } finally {
      setCnaeLoading(false);
    }
  };

  // Consulta inteligente por CNPJ + integração IT-14 AbaIncêndio
  const handleLookupCnpjIt14 = async (rawCnpj: string, isAutoRequery = false) => {
    const digits = cleanDigits(rawCnpj);
    if (digits.length !== 14) {
      if (!isAutoRequery) setCnpjNotice({ message: 'Digite um CNPJ válido com 14 dígitos.', type: 'error' });
      return;
    }

    setCnpjLoading(true);
    if (!isAutoRequery) setCnpjNotice(null);

    try {
      const params = new URLSearchParams({
        areaM2: String(calculatedTotalArea || 0),
        floors: String(formData.edification.number_floors || 1),
        height: String(formData.edification.height || '')
      });

      let res: CnpjIt14LookupResult;
      try {
        res = await api<CnpjIt14LookupResult>(`/api/cnpj-it14/${encodeURIComponent(digits)}?${params.toString()}`);
      } catch {
        // Fallback resiliente direto para BrasilAPI caso a rota local não responda
        const bRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
        if (!bRes.ok) throw new Error('Não foi possível obter dados do CNPJ na base pública.');
        const bData = await bRes.json();
        res = {
          cnpj: digits,
          razao_social: bData.razao_social || '',
          nome_fantasia: bData.nome_fantasia || bData.razao_social || '',
          source: 'brasilapi_fallback',
          address: {
            zip_code: cleanDigits(bData.cep),
            street: bData.logradouro || '',
            number: bData.numero || 'S/N',
            complement: bData.complemento || '***',
            neighborhood: bData.bairro || '',
            municipio_raw: bData.municipio || '',
            uf: bData.uf || 'BA',
            county_id: null,
            county: bData.municipio || ''
          },
          contact: {
            phone: cleanDigits(bData.ddd_telefone_1),
            email: bData.email || ''
          },
          it14: {
            areaBand: calculatedTotalArea <= 200 ? 'ate_200' : (calculatedTotalArea <= 750 ? '200_750' : 'acima_750'),
            alturaMeters: 6,
            classificacao_risco: 'Médio',
            tipo_processo_sugerido: calculatedTotalArea > 750 ? 'AVCB' : 'CLCB',
            project_type_sugerido: calculatedTotalArea > 750 ? 'PT' : 'PTS',
            inspection_sugerida: calculatedTotalArea > 750 ? 'Sim' : 'Não',
            occupation_group_id: null,
            division_group_id: null,
            divisao_code: null,
            grupo_code: null,
            cnae: bData.cnae_fiscal ? String(bData.cnae_fiscal) : '',
            atividade_economica: bData.cnae_fiscal_descricao || '',
            qfi_mj_m2: 300,
            mappedMeasures: {
              extintores: true,
              iluminacao_emerg: true,
              sinal_emerg: true,
              saidas_emerg: true
            },
            rawMeasures: ['Extintores', 'Iluminação de Emergência', 'Sinalização', 'Saídas'],
            motivo_classificacao: ['Dados cadastrais obtidos da Receita Federal'],
            notas_especificas: [],
            notas_gerais: [],
            alertas: [],
            brigada: null,
            allCnaes: []
          }
        };
      }

      setIt14Result(res);

      // Localiza município na Bahia
      let resolvedCountyId = res.address.county_id;
      let resolvedCountyName = res.address.county;
      if (!resolvedCountyId && domains?.counties && res.address.municipio_raw) {
        const normMun = res.address.municipio_raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        const matched = domains.counties.find(
          (c) => c.municipio.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() === normMun
        );
        if (matched) {
          resolvedCountyId = matched.id;
          resolvedCountyName = matched.municipio.toUpperCase();
        }
      }

      setFormData((prev) => {
        const suggestedCat = res.it14.project_type_sugerido?.toLowerCase() === 'pt' ? 'pt' : 'pts';
        const suggestedLic = res.it14.tipo_processo_sugerido || (suggestedCat === 'pt' ? 'AVCB' : 'CLCB');
        const activeFormMode = prev.form_mode || suggestedCat;
        const nextMeasures = {
          ...prev.securityMeasures,
          ...normalizeSecurityMeasures(res.it14.mappedMeasures, false)
        };

        return {
          ...prev,
          form_mode: activeFormMode,
          tipo_projeto_id: prev.tipo_projeto_id || (activeFormMode === 'pt' ? 1 : (calculatedTotalArea <= 200 ? 4 : 5)),
          edification: {
            ...prev.edification,
            reference_name: prev.edification.reference_name && prev.edification.reference_name !== 'Nova Edificação'
              ? prev.edification.reference_name
              : (res.nome_fantasia || res.razao_social)
          },
          address: {
            ...prev.address,
            zip_code: res.address.zip_code || prev.address.zip_code,
            public_place: (res.address.street || prev.address.public_place).toUpperCase(),
            number: (res.address.number || prev.address.number || 'S/N').toUpperCase(),
            complement: res.address.complement || prev.address.complement || '***',
            district: (res.address.neighborhood || prev.address.district).toUpperCase(),
            municipio_id: resolvedCountyId || prev.address.municipio_id,
            county: resolvedCountyName ? resolvedCountyName.toUpperCase() : prev.address.county,
            state: res.address.uf || prev.address.state || 'BA'
          },
          institution: {
            ...prev.institution,
            cnpj_cpf: digits,
            razao_social: res.razao_social || prev.institution.razao_social,
            nome_fantasia: res.nome_fantasia || prev.institution.nome_fantasia,
            cnae: res.it14.cnae || prev.institution.cnae,
            atividade_economica: res.it14.atividade_economica || prev.institution.atividade_economica,
            risk: res.it14.qfi_mj_m2 ?? prev.institution.risk ?? 300
          },
          occupation: {
            ...prev.occupation,
            occupation_group_id: res.it14.occupation_group_id || prev.occupation.occupation_group_id,
            division_group_id: res.it14.division_group_id || prev.occupation.division_group_id
          },
          proprietario: {
            ...prev.proprietario,
            nome_proprietario: prev.proprietario.nome_proprietario || res.razao_social,
            cpf_cnpj_prop: prev.proprietario.cpf_cnpj_prop || digits,
            tel_proprietario: prev.proprietario.tel_proprietario || res.contact?.phone || '',
            email_proprietario: prev.proprietario.email_proprietario || res.contact?.email || ''
          },
          process_category: prev.process_category || suggestedCat,
          license_type: prev.license_type || suggestedLic,
          securityMeasures: nextMeasures
        };
      });

      if (!isAutoRequery) {
        setCnpjNotice({
          message: `Dados do CNPJ e parâmetros da IT-14 aplicados com sucesso! (${res.source === 'it14_aba' ? 'Portal Oficial IT-14 AbaIncêndio' : 'Receita Federal'})`,
          type: 'success'
        });
        showToast('CNPJ e enquadramento IT-14 vinculados com sucesso!', 'success');
      }
    } catch (err) {
      if (!isAutoRequery) {
        const msg = err instanceof Error ? err.message : 'Falha ao consultar CNPJ.';
        setCnpjNotice({ message: msg, type: 'error' });
        showToast(msg, 'error');
      }
    } finally {
      setCnpjLoading(false);
    }
  };

  const handleSelectCnaeVariant = (c: NonNullable<CnpjIt14LookupResult['it14']['allCnaes']>[number]) => {
    setFormData((prev) => {
      const nextMeasures: Record<string, number | boolean> = { ...prev.securityMeasures };
      if (c.mappedMeasures) {
        Object.entries(c.mappedMeasures).forEach(([k, v]) => {
          nextMeasures[k] = v ? 1 : 0;
        });
      }
      return {
        ...prev,
        institution: {
          ...prev.institution,
          cnae: c.cnae,
          atividade_economica: c.descricao,
          risk: c.qfi_mj_m2 ?? prev.institution.risk
        },
        occupation: {
          ...prev.occupation,
          occupation_group_id: c.occupation_group_id || prev.occupation.occupation_group_id,
          division_group_id: c.division_group_id || prev.occupation.division_group_id
        },
        process_category: c.tipo_processo === 'AVCB' ? 'pt' : prev.process_category,
        license_type: c.tipo_processo === 'AVCB' ? 'AVCB' : (c.tipo_processo === 'CLCB' ? 'CLCB' : prev.license_type),
        securityMeasures: nextMeasures
      };
    });
    showToast(`Ocupação alterada para CNAE ${formatCnae(c.cnae)} (${c.descricao.slice(0, 32)}...)`, 'info');
  };

  // Reconsulta automática com debounce se houver CNPJ consultado e dimensões mudarem
  useEffect(() => {
    const rawCnpj = cleanDigits(it14Result?.cnpj || formData.institution.cnpj_cpf);
    if (rawCnpj.length !== 14 || !it14Result) return;

    const timer = setTimeout(() => {
      void handleLookupCnpjIt14(rawCnpj, true);
    }, 700);

    return () => clearTimeout(timer);
  }, [calculatedTotalArea, formData.edification.number_floors, formData.edification.height]);

  // Reaproveitar edificação existente
  const handleSelectExistingBuilding = (bId: string) => {
    const selectedBuilding = buildings.find((b) => b.id === bId);
    if (!selectedBuilding) return;

    // Normaliza altura com base nas 6 opções do enum
    let matchedHeight = FENIX_HEIGHTS_DEFAULT[1]; // Baixa como default
    if (selectedBuilding.height) {
      const found = FENIX_HEIGHTS_DEFAULT.find((h) => h.toLowerCase().includes(selectedBuilding.height.toLowerCase()));
      if (found) matchedHeight = found;
    }

    // Tenta encontrar o município nos domínios
    let matchedCountyId: number | null = null;
    let matchedCountyName = selectedBuilding.municipality || '';
    if (domains?.counties?.length && matchedCountyName) {
      const normMun = matchedCountyName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
      const found = domains.counties.find((c) => c.municipio.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() === normMun);
      if (found) {
        matchedCountyId = found.id;
        matchedCountyName = found.municipio;
      }
    }

    const parsedAddr = parseBuildingAddressString(selectedBuilding.address);

    setFormData((prev) => ({
      ...prev,
      edificacao_mode: 'existing',
      edificacao_id: Number(selectedBuilding.id) || null,
      edification: {
        ...prev.edification,
        reference_name: selectedBuilding.reference || prev.edification.reference_name,
        building_area: selectedBuilding.area || prev.edification.building_area,
        number_floors: selectedBuilding.floors || prev.edification.number_floors,
        height: matchedHeight
      },
      address: {
        ...prev.address,
        county: matchedCountyName || prev.address.county,
        municipio_id: matchedCountyId ?? prev.address.municipio_id,
        public_place: parsedAddr.public_place || prev.address.public_place,
        number: parsedAddr.number || prev.address.number,
        district: parsedAddr.district || prev.address.district,
        complement: parsedAddr.complement || prev.address.complement,
        zip_code: parsedAddr.zip_code || prev.address.zip_code
      }
    }));
    showToast(`Edificação "${selectedBuilding.reference}" vinculada ao rascunho com endereço pré-carregado.`, 'info');
  };

  // Preenchimento atalho dos dados da ABA Incêndio para proprietário / responsável
  const handleFillAbaContact = () => {
    const razao = formData.institution.razao_social || formData.institution.nome_fantasia || 'ABA Incêndio';
    const doc = formData.institution.cnpj_cpf || '09.566.970/0001-23';

    setFormData((prev) => ({
      ...prev,
      proprietario: {
        tipo_pessoa_prop: prev.institution.tipo_pessoa || 'PJ',
        cpf_cnpj_prop: doc,
        nome_proprietario: razao,
        email_proprietario: 'engenharia@abaincendio.com.br',
        tel_proprietario: '(71) 4000-2895'
      },
      responsavel: {
        responsavel_uso_igual_prop: true,
        tipo_pessoa_resp: prev.institution.tipo_pessoa || 'PJ',
        cpf_cnpj_resp: doc,
        nome_responsavel: razao,
        email_responsavel_uso: 'engenharia@abaincendio.com.br',
        tel_responsavel_uso: '(71) 4000-2895'
      }
    }));
    showToast('Contatos preenchidos com os dados da empresa e engenharia ABA.', 'info');
  };

  // Marcar medidas recomendadas para o porte
  const handleAutoCheckMeasures = () => {
    const isBig = calculatedTotalArea > 750;

    const baseMeasures: Record<string, number> = {
      extintores: 1,
      iluminacao_emerg: 1,
      sinal_emerg: 1,
      saidas_emerg: 1,
      brigada_incendio: calculatedTotalArea > 200 ? 1 : 0,
      control_mat_acab: 1,
      hidrante_mangot: isBig ? 1 : 0,
      alarme_incendio: isBig ? 1 : 0,
      deteccao_incendio: calculatedTotalArea > 1200 ? 1 : 0,
      acesso_viatura: 1,
      seguranca_estrutural: 1,
      plano_emerg_incendio: isBig ? 1 : 0,
      sis_prot_cont_desc_elet: calculatedTotalArea > 750 ? 1 : 0,
      comp_horizontal: 0,
      comp_vertical: 0,
      separacao_edific: 0,
      resfriamento: 0,
      chuveiros_auto: 0,
      elevador_emerg: 0,
      control_fumaca: 0,
      espuma: 0,
      sis_fixo_gases: 0
    };

    setFormData((prev) => ({
      ...prev,
      securityMeasures: normalizeSecurityMeasures(baseMeasures, false)
    }));
    showToast('Medidas oficiais CBMBA marcadas para a edificação.', 'success');
  };

  // Envio Seguro para o Fênix Real
  const handleSubmitFenix = async () => {
    const draftId = currentDraft?.id || formData.id;
    if (!draftId) {
      showToast('Rascunho não encontrado.', 'error');
      return;
    }

    if (confirmKey !== 'ENVIAR_FENIX') {
      showToast('Digite a palavra exata ENVIAR_FENIX para destravar o envio.', 'error');
      return;
    }

    if (!localValidation.valid) {
      showToast('Corrija os erros do rascunho antes de submeter.', 'error');
      return;
    }

    setSubmitting(true);
    setSubmissionResult(null);
    try {
      const res = await api<{
        ok: boolean;
        draft: DraftRecord;
        result?: unknown;
        error?: string;
      }>(`/api/drafts/${encodeURIComponent(draftId)}/submit`, {
        method: 'POST',
        body: JSON.stringify({ confirmWord: confirmKey })
      });

      if (res.ok) {
        setSubmissionResult({ ok: true, data: res.result });
        setCurrentDraft(res.draft);
        showToast('Projeto Técnico Cadastrado no Fênix com Sucesso!', 'success');
        void fetchDrafts();
        onProjectSubmitted?.();
      } else {
        setSubmissionResult({ ok: false, error: res.error || 'Falha retornada pelo Fênix.' });
        showToast(res.error || 'Erro na transmissão ao Fênix.', 'error');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro na requisição ao Fênix.';
      setSubmissionResult({ ok: false, error: msg });
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Interação com o Copiloto IA (Chat + Aplicação de Mudanças em Tempo Real)
  const handleSendAiPrompt = async (text: string) => {
    const userMessage = text.trim();
    if (!userMessage || copilotLoading) return;

    setCopilotLoading(true);
    setCopilotThinking('Analisando regras da IT-14 / Decreto 16.302/BA...');
    setCopilotPrompt('');

    setCopilotMessages((prev) => [...prev, { role: 'user', content: userMessage }]);

    try {
      let aiResult: DraftAiAssistantResponse;

      try {
        aiResult = await api<DraftAiAssistantResponse>('/api/drafts/ai-assistant', {
          method: 'POST',
          body: JSON.stringify({
            message: userMessage,
            currentDraft: formData,
            history: copilotMessages.slice(-6).map((m) => ({ role: m.role, content: m.content }))
          })
        });
      } catch {
        // Fallback inteligente
        aiResult = generateLocalAiAssistantFallback(userMessage, formData, calculatedTotalArea, enquadramento);
      }

      // Aplica formPatch se retornado
      if (aiResult.formPatch) {
        applyFormPatch(aiResult.formPatch);
      }

      setCopilotMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: aiResult.reply,
          thinkingSteps: aiResult.thinkingSteps,
          appliedChangesSummary: aiResult.appliedChangesSummary,
          suggestions: aiResult.suggestions
        }
      ]);
    } catch {
      setCopilotMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Desculpe, ocorreu uma instabilidade ao consultar as diretrizes. Pode tentar novamente?'
        }
      ]);
    } finally {
      setCopilotLoading(false);
      setCopilotThinking('');
    }
  };

  if (!isOpen) return null;

  // Filtragem de divisões conforme o grupo de ocupação selecionado
  const filteredDivisions = domains?.divisionGroups
    ? domains.divisionGroups.filter((d) => !formData.occupation.occupation_group_id || d.group_occupation_id === formData.occupation.occupation_group_id)
    : [];

  // Painel do Copiloto IA Integrado
  const copilotPanel = (
    <div className="draft-copilot-container animate-fade-in">
      <div className="draft-copilot-header">
        <div className="draft-copilot-title">
          <span className="copilot-icon-badge">
            <Sparkles size={17} />
          </span>
          <div>
            <h4>Copiloto IA do Cadastro</h4>
            <p>Especialista em enquadramento CBMBA, IT-14 e preenchimento inteligente</p>
          </div>
        </div>
        <button
          type="button"
          className="button button-outline button-xs"
          onClick={toggleCopilot}
        >
          <X size={14} /> Recolher
        </button>
      </div>

      <div className="draft-copilot-body">
        <div className="copilot-chips-row">
          <button
            type="button"
            className="copilot-chip-action"
            onClick={() => void handleSendAiPrompt('Auto-revisar e corrigir pendências da tela')}
            disabled={copilotLoading}
          >
            <Sparkles size={13} /> Auto-revisar e corrigir pendências
          </button>
          <button
            type="button"
            className="copilot-chip-action"
            onClick={() => void handleSendAiPrompt('Sugerir e marcar medidas da IT-14')}
            disabled={copilotLoading}
          >
            <ShieldCheck size={13} /> Sugerir medidas IT-14
          </button>
          <button
            type="button"
            className="copilot-chip-action"
            onClick={() => void handleSendAiPrompt('Exemplo: Galpão 620 m² em Feira de Santana')}
            disabled={copilotLoading}
          >
            <Building2 size={13} /> Exemplo: Galpão 620 m² (FSA)
          </button>
          <button
            type="button"
            className="copilot-chip-action"
            onClick={() => void handleSendAiPrompt('Explicar meu enquadramento atual')}
            disabled={copilotLoading}
          >
            <Info size={13} /> Explicar enquadramento
          </button>
        </div>

        <div className="copilot-chat-history">
          {copilotMessages.map((msg, idx) => (
            <div key={idx} className={`copilot-message message-${msg.role}`}>
              <div className="message-text">{msg.content}</div>

              {msg.thinkingSteps && msg.thinkingSteps.length > 0 && (
                <div className="copilot-thinking-box">
                  <strong>Linha de Raciocínio CBMBA:</strong>
                  {msg.thinkingSteps.map((stepItem, sIdx) => (
                    <span key={sIdx}>• {stepItem}</span>
                  ))}
                </div>
              )}

              {msg.appliedChangesSummary && msg.appliedChangesSummary.length > 0 && (
                <div className="copilot-applied-badges">
                  {msg.appliedChangesSummary.map((item, bIdx) => (
                    <span key={bIdx} className="copilot-applied-badge">
                      <CheckCircle2 size={12} /> {item}
                    </span>
                  ))}
                </div>
              )}

              {msg.suggestions && msg.suggestions.length > 0 && (
                <div className="copilot-chips-row mt-1">
                  {msg.suggestions.map((sug, sgIdx) => (
                    <button
                      key={sgIdx}
                      type="button"
                      className="copilot-chip-action"
                      onClick={() => void handleSendAiPrompt(sug)}
                      disabled={copilotLoading}
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {copilotLoading && (
            <div className="copilot-message message-assistant">
              <div className="ai-thinking-pill">
                <LoaderCircle size={15} className="spin text-teal" />
                <span className="text-rainbow-shimmer">{copilotThinking || 'Processando raciocínio com IA...'}</span>
              </div>
            </div>
          )}
        </div>

        <form
          className="copilot-input-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (copilotPrompt.trim()) {
              void handleSendAiPrompt(copilotPrompt);
            }
          }}
        >
          <input
            type="text"
            placeholder="Digite o que deseja alterar ou perguntar (ex: 'Muda a área para 520 m² em Camaçari e marca hidrantes')..."
            value={copilotPrompt}
            onChange={(e) => setCopilotPrompt(e.target.value)}
            disabled={copilotLoading}
          />
          <button
            type="submit"
            className="button button-horizon-ai"
            disabled={copilotLoading || !copilotPrompt.trim()}
          >
            {copilotLoading ? <LoaderCircle size={15} className="spin" /> : <Send size={15} />}
            <span>Enviar</span>
          </button>
        </form>
      </div>
    </div>
  );

  // Grid de cartões de rascunho
  const draftsCardsGrid = (
    <div className="draft-cards-grid">
      {drafts.map((draft) => {
        const isSim = draft.status === 'simulated' || draft.lastSimulation?.ok;
        const isSub = draft.status === 'submitted' || draft.lastSubmission?.ok;
        return (
          <div
            key={draft.id}
            className="draft-card"
            onClick={() => handleOpenDraft(draft)}
            role="button"
            tabIndex={0}
          >
            <div className="draft-card-head">
              <div className="draft-icon-box">
                <Building2 size={20} />
              </div>
              <div className="draft-meta">
                <h4>
                  {draft.name ||
                    draft.data?.edification?.reference_name ||
                    (draft.data as any)?.reference_name ||
                    'Rascunho sem nome'}
                </h4>
                <span className="draft-date">Atualizado em {new Date(draft.updatedAt).toLocaleString('pt-BR')}</span>
              </div>
              <span className={`status-badge status-${isSub ? 'submitted' : isSim ? 'simulated' : 'draft'}`}>
                {isSub ? 'Enviado ao Fênix' : isSim ? 'Validado' : 'Rascunho'}
              </span>
            </div>

            <div className="draft-card-body">
              <div className="draft-info-row">
                <span>Edificação:</span>
                <strong>
                  {draft.data?.edification?.reference_name ||
                    (draft.data as any)?.reference_name ||
                    (draft.data as any)?.nome_referencia ||
                    '—'}
                </strong>
              </div>
              <div className="draft-info-row">
                <span>Município:</span>
                <strong>
                  {draft.data?.address?.county ||
                    (draft.data as any)?.cidade ||
                    (draft.data as any)?.municipio ||
                    '—'}/BA
                </strong>
              </div>
              <div className="draft-info-row">
                <span>Área total:</span>
                <strong>
                  {draft.data?.edification?.building_area
                    ? `${draft.data.edification.building_area} m²`
                    : (draft.data as any)?.area_construida
                    ? `${(draft.data as any).area_construida} m²`
                    : (draft.data as any)?.area_total
                    ? `${(draft.data as any).area_total} m²`
                    : '—'}
                </strong>
              </div>
              <div className="draft-info-row">
                <span>Enquadramento:</span>
                <span className="badge-tag">
                  {(draft.data?.process_category || (draft.data as any)?.form_mode || 'PTS').toUpperCase()}
                </span>
              </div>
            </div>

            <div className="draft-card-footer">
              <button
                type="button"
                className="button button-outline button-sm"
                onClick={(e) => { e.stopPropagation(); handleOpenDraft(draft); }}
              >
                Continuar Editando <ArrowRight size={13} />
              </button>
              <button
                type="button"
                className="icon-button icon-button-danger"
                title="Excluir rascunho"
                onClick={(e) => void handleDeleteDraft(draft.id, e)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

  // Contadores de pendências em tempo real para os 3 passos
  const step1Errors = useMemo(
    () => localValidation.errors.filter((e) => e.startsWith('Etapa 1:')),
    [localValidation.errors]
  );
  const step2Errors = useMemo(
    () => localValidation.errors.filter((e) => !e.startsWith('Etapa 1:')),
    [localValidation.errors]
  );
  const step1Pending = step1Errors.length;
  const step2Pending = step2Errors.length;
  const totalPending = localValidation.errors.length;

  const isStep1Done = step1Pending === 0;
  const isStep2Done = step2Pending === 0;
  const isStep3Done = totalPending === 0;

  // Stepper Visual
  const stepperItems = (
    <>
      <button
        type="button"
        className={`step-item ${step === 1 ? 'active' : ''} ${isStep1Done ? 'completed' : ''}`}
        onClick={() => setStep(1)}
        title={step1Pending > 0 ? `Pendências na Etapa 1:\n${step1Errors.join('\n')}` : 'Etapa 1 preenchida e válida'}
      >
        <span
          className="step-circle"
          style={
            step1Pending > 0
              ? { background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', fontWeight: 700 }
              : undefined
          }
        >
          {isStep1Done ? <Check size={14} /> : '1'}
        </span>
        <span className="step-label">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <strong>Edificação & Endereço</strong>
            {step1Pending > 0 && (
              <span
                style={{
                  background: '#fef2f2',
                  color: '#dc2626',
                  border: '1px solid #fecaca',
                  borderRadius: '999px',
                  padding: '2px 8px',
                  fontSize: '0.70rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap'
                }}
              >
                {step1Pending} {step1Pending === 1 ? 'pendência' : 'pendências'}
              </span>
            )}
          </div>
          <small>Localização física e estrutura</small>
        </span>
      </button>

      <div className="step-divider" />

      <button
        type="button"
        className={`step-item ${step === 2 ? 'active' : ''} ${isStep2Done ? 'completed' : ''}`}
        onClick={() => setStep(2)}
        title={step2Pending > 0 ? `Pendências na Etapa 2:\n${step2Errors.join('\n')}` : 'Etapa 2 preenchida e válida'}
      >
        <span
          className="step-circle"
          style={
            step2Pending > 0
              ? { background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', fontWeight: 700 }
              : undefined
          }
        >
          {isStep2Done ? <Check size={14} /> : '2'}
        </span>
        <span className="step-label">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <strong>Projeto & Enquadramento</strong>
            {step2Pending > 0 && (
              <span
                style={{
                  background: '#fef2f2',
                  color: '#dc2626',
                  border: '1px solid #fecaca',
                  borderRadius: '999px',
                  padding: '2px 8px',
                  fontSize: '0.70rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap'
                }}
              >
                {step2Pending} {step2Pending === 1 ? 'pendência' : 'pendências'}
              </span>
            )}
          </div>
          <small>CNAE, IT 14 e Medidas</small>
        </span>
      </button>

      <div className="step-divider" />

      <button
        type="button"
        className={`step-item ${step === 3 ? 'active' : ''} ${isStep3Done ? 'completed' : ''}`}
        onClick={() => setStep(3)}
        title={totalPending > 0 ? `Pendências gerais do projeto:\n${localValidation.errors.join('\n')}` : 'Projeto totalmente validado e pronto para envio'}
      >
        <span
          className="step-circle"
          style={
            totalPending > 0
              ? { background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', fontWeight: 700 }
              : undefined
          }
        >
          {isStep3Done ? <Check size={14} /> : '3'}
        </span>
        <span className="step-label">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <strong>Validação & Envio</strong>
            {totalPending > 0 && (
              <span
                style={{
                  background: '#fef2f2',
                  color: '#dc2626',
                  border: '1px solid #fecaca',
                  borderRadius: '999px',
                  padding: '2px 8px',
                  fontSize: '0.70rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap'
                }}
              >
                {totalPending} {totalPending === 1 ? 'pendência' : 'pendências'}
              </span>
            )}
          </div>
          <small>Revisão e Transmissão</small>
        </span>
      </button>
    </>
  );

  // Conteúdo dos Steps de Formulário
  const renderStepPanels = () => (
    <>
      {/* ETAPA 1: EDIFICAÇÃO & ENDEREÇO */}
              {step === 1 && (
                <div className="step-panel animate-fade-in">
                  {/* 0. Card de Consulta Rápida por CNPJ + Enquadramento IT-14 */}
                  <div
                    id="draft-s1-cnpj"
                    style={{ scrollMarginTop: '96px' }}
                    className={`editor-card cnpj-it14-hero-card ${cnpjLoading ? 'ai-shimmer-active ai-border-beam' : ''}`}
                  >
                    <div className="card-heading flex-between">
                      <div className="flex-row items-center gap-2">
                        <Sparkles size={18} className="text-teal" />
                        <h4>1. Consulta Rápida por CNPJ + Enquadramento IT-14 (AbaIncêndio)</h4>
                      </div>
                      <span className="badge-tag">Autopreenchimento Oficial</span>
                    </div>

                    <p className="field-hint">
                      Informe o CNPJ da empresa/ocupação para preencher automaticamente Razão Social, Nome Fantasia, Endereço e vincular os parâmetros da IT-14 CBMBA (CNAE, Grupo, Divisão, Carga de Incêndio e Medidas Exigidas).
                    </p>

                    <div className="cnpj-search-row">
                      <label className="field-label cnpj-input-label">
                        <span>CNPJ da Edificação / Estabelecimento (Busca rápida opcional)</span>
                        <div className="input-with-button">
                          <input
                            type="text"
                            className="input-text"
                            placeholder="00.000.000/0000-00"
                            maxLength={18}
                            value={formatCnpjCpf(cnpjSearchInput || formData.institution.cnpj_cpf)}
                            onChange={(e) => {
                              const digits = cleanDigits(e.target.value);
                              setCnpjSearchInput(digits);
                              setFormData((prev) => ({
                                ...prev,
                                institution: { ...prev.institution, cnpj_cpf: digits }
                              }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void handleLookupCnpjIt14(cnpjSearchInput || formData.institution.cnpj_cpf);
                              }
                            }}
                          />
                          <button
                            type="button"
                            className={`button button-teal ${cnpjLoading ? 'button-horizon-ai is-loading' : ''}`}
                            disabled={cnpjLoading || cleanDigits(cnpjSearchInput || formData.institution.cnpj_cpf).length !== 14}
                            onClick={() => void handleLookupCnpjIt14(cnpjSearchInput || formData.institution.cnpj_cpf)}
                          >
                            {cnpjLoading ? <LoaderCircle size={15} className="spin" /> : <Search size={15} />}
                            <span>{cnpjLoading ? 'Consultando...' : 'Consultar CNPJ & IT-14'}</span>
                          </button>
                        </div>
                      </label>
                    </div>

                    {cnpjLoading && (
                      <div className="ai-thinking-pill mt-2">
                        <LoaderCircle size={14} className="spin text-teal" />
                        <span className="text-rainbow-shimmer">Consultando CBMBA / IT-14 & Receita Federal...</span>
                      </div>
                    )}

                    {cnpjNotice && (
                      <div className={`field-notice notice-${cnpjNotice.type}`}>
                        {cnpjNotice.type === 'success' ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
                        <span>{cnpjNotice.message}</span>
                      </div>
                    )}

                    {/* Resumo visual dos dados recuperados do CNPJ e IT-14 */}
                    {it14Result && (
                      <div className="cnpj-it14-summary-panel animate-fade-in">
                        <div className="summary-top-row">
                          <div className="summary-company-info">
                            <b>{it14Result.razao_social}</b>
                            {it14Result.nome_fantasia && it14Result.nome_fantasia !== it14Result.razao_social && (
                              <span className="summary-fantasy">({it14Result.nome_fantasia})</span>
                            )}
                            <div className="summary-cnae-line">
                              <span>CNAE: <b>{formatCnae(formData.institution.cnae || it14Result.it14.cnae)}</b> — {formData.institution.atividade_economica || it14Result.it14.atividade_economica}</span>
                            </div>
                          </div>
                          <div className="summary-tags">
                            <span className="tag-pill tag-teal">
                              Divisão {it14Result.it14.divisao_code || 'IT-14'}
                            </span>
                            <span className="tag-pill tag-blue">
                              Carga {formData.institution.risk || it14Result.it14.qfi_mj_m2 ? `${formData.institution.risk || it14Result.it14.qfi_mj_m2} MJ/m²` : 'Padrão'}
                            </span>
                            <span className="tag-pill tag-purple">
                              {formData.license_type || it14Result.it14.tipo_processo_sugerido || 'CLCB'}
                            </span>
                          </div>
                        </div>

                        {it14Result.it14.allCnaes && it14Result.it14.allCnaes.length > 1 && (
                          <div className="cnae-switcher-box">
                            <small className="field-hint">
                              Este CNPJ possui {it14Result.it14.allCnaes.length} CNAEs na Receita. Clique em uma atividade para alternar a ocupação predominante:
                            </small>
                            <div className="cnae-chips-wrap">
                              {it14Result.it14.allCnaes.map((c) => {
                                const isSelected = cleanDigits(formData.institution.cnae) === cleanDigits(c.cnae);
                                return (
                                  <button
                                    type="button"
                                    key={c.cnae}
                                    className={`cnae-chip-btn ${isSelected ? 'selected' : ''}`}
                                    onClick={() => handleSelectCnaeVariant(c)}
                                    title={`${c.cnae} - ${c.descricao}`}
                                  >
                                    <span className="chip-code">{formatCnae(c.cnae)}</span>
                                    <span className="chip-desc">{c.descricao}</span>
                                    {c.principal && <span className="chip-main">Principal</span>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="step-section-banner" id="draft-s1-origem" style={{ scrollMarginTop: '96px' }}>
                    <div>
                      <h3>1. Origem e Localização do Imóvel</h3>
                      <p>Cadastre uma nova edificação ou reaproveite um imóvel já cadastrado na conta Fênix.</p>
                    </div>
                    {/* Alternador de Modo */}
                    <div className="mode-toggle">
                      <button
                        type="button"
                        className={formData.edificacao_mode === 'new' ? 'selected' : ''}
                        onClick={() => setFormData((prev) => ({ ...prev, edificacao_mode: 'new', edificacao_id: null }))}
                      >
                        Nova Edificação
                      </button>
                      <button
                        type="button"
                        className={formData.edificacao_mode === 'existing' ? 'selected' : ''}
                        onClick={() => setFormData((prev) => ({ ...prev, edificacao_mode: 'existing' }))}
                      >
                        Reaproveitar Existente
                      </button>
                    </div>
                  </div>

                  {/* Seletor de edificação existente */}
                  {formData.edificacao_mode === 'existing' && (
                    <div className="existing-building-picker">
                      <label className="field-label">
                        <span>Selecione a Edificação Acompanhada ({buildings.length} disponíveis)</span>
                        <select
                          className="input-select"
                          value={formData.edificacao_id ? String(formData.edificacao_id) : ''}
                          onChange={(e) => handleSelectExistingBuilding(e.target.value)}
                        >
                          <option value="">-- Escolha uma edificação do seu cadastro --</option>
                          {buildings.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.reference} · {b.municipality || 'Bahia'} · {b.area ? `${b.area} m²` : 'Sem área'}
                            </option>
                          ))}
                        </select>
                      </label>
                      <small className="field-hint">
                        Ao selecionar, os campos estruturais e o município serão preenchidos automaticamente. O Fênix vinculará o projeto ao ID existente.
                      </small>
                    </div>
                  )}

                  {/* Bloco de Endereço */}
                  <div className="editor-card" id="draft-s1-endereco" style={{ scrollMarginTop: '96px' }}>
                    <div className="card-heading">
                      <MapPin size={18} className="text-teal" />
                      <h4>Endereço Oficial no CBMBA</h4>
                    </div>

                    <div className="form-grid">
                      {/* CEP com Busca ViaCEP */}
                      <div className="form-col-4">
                        <label className="field-label">
                          <span>CEP (8 dígitos) *</span>
                          <div className="input-with-button">
                            <input
                              type="text"
                              className="input-text"
                              placeholder="00000-000"
                              maxLength={9}
                              value={formatCep(formData.address.zip_code)}
                              onChange={(e) => {
                                const digits = cleanDigits(e.target.value);
                                setFormData((prev) => ({
                                  ...prev,
                                  address: { ...prev.address, zip_code: digits }
                                }));
                              }}
                            />
                            <button
                              type="button"
                              className="button button-outline button-sm"
                              onClick={() => void handleLookupCep()}
                              disabled={cepLoading}
                              title="Buscar endereço nos Correios e vincular município"
                            >
                              {cepLoading ? <LoaderCircle size={14} className="spin" /> : <Search size={14} />} Buscar
                            </button>
                          </div>
                        </label>
                        {cepNotice && (
                          <div className={`field-notice notice-${cepNotice.type}`}>
                            {cepNotice.type === 'success' ? <Check size={13} /> : <CircleAlert size={13} />}
                            <span>{cepNotice.message}</span>
                          </div>
                        )}
                      </div>

                      {/* Logradouro */}
                      <div className="form-col-8">
                        <label className="field-label">
                          <span>Logradouro (Rua, Av, Praça) *</span>
                          <input
                            type="text"
                            className="input-text"
                            maxLength={100}
                            placeholder="Ex: RUA OTACILIO PINHEIRO"
                            value={formData.address.public_place}
                            onChange={(e) => setFormData((prev) => ({
                              ...prev,
                              address: { ...prev.address, public_place: e.target.value.toUpperCase() }
                            }))}
                          />
                        </label>
                      </div>

                      {/* Número */}
                      <div className="form-col-3">
                        <label className="field-label">
                          <span>Número *</span>
                          <div className="input-with-button">
                            <input
                              type="text"
                              className="input-text"
                              maxLength={10}
                              placeholder="Nº ou S/N"
                              value={formData.address.number}
                              onChange={(e) => setFormData((prev) => ({
                                ...prev,
                                address: { ...prev.address, number: e.target.value.toUpperCase() }
                              }))}
                            />
                            <button
                              type="button"
                              className="button button-outline button-xs"
                              onClick={() => setFormData((prev) => ({ ...prev, address: { ...prev.address, number: 'S/N' } }))}
                              title="Preencher Sem Número"
                            >
                              S/N
                            </button>
                          </div>
                        </label>
                      </div>

                      {/* Complemento */}
                      <div className="form-col-4">
                        <label className="field-label">
                          <span>Complemento (se vazio, enviamos *** automaticamente)</span>
                          <input
                            type="text"
                            className="input-text"
                            maxLength={50}
                            placeholder="*** ou Sala, Galpão..."
                            value={formData.address.complement || ''}
                            onChange={(e) => setFormData((prev) => ({
                              ...prev,
                              address: { ...prev.address, complement: e.target.value }
                            }))}
                          />
                        </label>
                        <small className="field-hint">Se vazio, o sistema enviará automaticamente "***" exigido pelo Fênix.</small>
                      </div>

                      {/* Bairro */}
                      <div className="form-col-5">
                        <label className="field-label">
                          <span>Bairro / Distrito *</span>
                          <input
                            type="text"
                            className="input-text"
                            maxLength={50}
                            placeholder="Ex: CENTRO"
                            value={formData.address.district}
                            onChange={(e) => setFormData((prev) => ({
                              ...prev,
                              address: { ...prev.address, district: e.target.value.toUpperCase() }
                            }))}
                          />
                        </label>
                      </div>

                      {/* Município CBMBA - Select Único com 417 municípios ordenados alfabeticamente */}
                      <div className="form-col-6">
                        <label className="field-label">
                          <span>Município CBMBA (Bahia — 417 municípios) *</span>
                          <select
                            className="input-select"
                            value={formData.address.municipio_id || ''}
                            onChange={(e) => {
                              const val = Number(e.target.value) || null;
                              const matched = domains?.counties?.find((c) => c.id === val);
                              setFormData((prev) => ({
                                ...prev,
                                address: {
                                  ...prev.address,
                                  municipio_id: val,
                                  county: matched ? matched.municipio.toUpperCase() : prev.address.county
                                }
                              }));
                            }}
                          >
                            <option value="">-- Selecione o Município (Bahia) --</option>
                            {sortedCounties.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.municipio} {!c.habilitar ? '(Não Habilitado)' : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                        <small className="field-hint">Preenchido automaticamente ao consultar CNPJ ou CEP.</small>
                      </div>

                      {/* Coordenadas Geográficas */}
                      <div className="form-col-6">
                        <label className="field-label">
                          <span>Coordenadas Geográficas (Latitude, Longitude)</span>
                          <input
                            type="text"
                            className="input-text"
                            placeholder="Ex: -12.9714,-38.5014"
                            maxLength={50}
                            value={formData.address.geographic_coordinates || ''}
                            onChange={(e) => setFormData((prev) => ({
                              ...prev,
                              address: { ...prev.address, geographic_coordinates: e.target.value }
                            }))}
                          />
                        </label>
                        <small className="field-hint">Opcional. Exemplo: Apuarema é -13.7844,-39.8183.</small>
                      </div>
                    </div>
                  </div>

                  {/* Bloco de Dados Estruturais da Edificação */}
                  <div className="editor-card" id="draft-s1-estrutura" style={{ scrollMarginTop: '96px' }}>
                    <div className="card-heading">
                      <Building2 size={18} className="text-teal" />
                      <h4>Características Estruturais e Geométricas</h4>
                    </div>

                    <div className="form-grid">
                      {/* Nome de Referência */}
                      <div className="form-col-6">
                        <label className="field-label">
                          <span>Nome de Referência do Imóvel *</span>
                          <input
                            type="text"
                            className="input-text"
                            maxLength={100}
                            placeholder="Ex: VAL SAT, Condomínio Parque dos Sonhos"
                            value={formData.edification.reference_name}
                            onChange={(e) => setFormData((prev) => ({
                              ...prev,
                              edification: { ...prev.edification, reference_name: e.target.value }
                            }))}
                          />
                        </label>
                      </div>

                      {/* Inscrição Municipal / IPTU */}
                      <div className="form-col-6">
                        <label className="field-label">
                          <span>Inscrição Municipal (IPTU / Cartório)</span>
                          <input
                            type="text"
                            className="input-text"
                            maxLength={30}
                            placeholder="Opcional. Se vazio, o Fênix aceita traço."
                            value={formData.edification.registration || ''}
                            onChange={(e) => setFormData((prev) => ({
                              ...prev,
                              edification: { ...prev.edification, registration: e.target.value }
                            }))}
                          />
                        </label>
                      </div>

                      {/* Altura Oficial (Enum 6 Opções) */}
                      <div className="form-col-6">
                        <label className="field-label">
                          <span>Altura da Edificação (Enum Oficial CBMBA) *</span>
                          <select
                            className="input-select"
                            value={formData.edification.height}
                            onChange={(e) => {
                              const newHeight = e.target.value;
                              const autoFloors = newHeight === 'Térrea = Um pavimento' ? 1 : formData.edification.number_floors;
                              setFormData((prev) => ({
                                ...prev,
                                edification: {
                                  ...prev.edification,
                                  height: newHeight,
                                  number_floors: autoFloors
                                }
                              }));
                            }}
                          >
                            {(domains?.heights || FENIX_HEIGHTS_DEFAULT).map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </label>
                        <small className="field-hint">O Fênix exige a faixa oficial do CBMBA.</small>
                      </div>

                      {/* Número de Pavimentos */}
                      <div className="form-col-6">
                        <label className="field-label">
                          <span>Nº de Pavimentos *</span>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            className="input-text"
                            disabled={formData.edification.height === 'Térrea = Um pavimento'}
                            value={formData.edification.number_floors}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 1;
                              let autoHeight = formData.edification.height;
                              if (val === 1) {
                                autoHeight = 'Térrea = Um pavimento';
                              } else if ((val === 2 || val === 3) && autoHeight === 'Térrea = Um pavimento') {
                                autoHeight = 'Baixa = H <= 6,00 m';
                              }
                              setFormData((prev) => ({
                                ...prev,
                                edification: {
                                  ...prev.edification,
                                  number_floors: val,
                                  height: autoHeight
                                }
                              }));
                            }}
                          />
                        </label>
                        {formData.edification.height === 'Térrea = Um pavimento' ? (
                          <small className="field-hint text-teal">✓ Bloqueado em 1 pavimento devido à altura "Térrea".</small>
                        ) : (
                          <small className="field-hint">1 pavimento sincroniza automaticamente com "Térrea".</small>
                        )}
                      </div>

                      {/* Áreas: Construída, A Construir, Desconto */}
                      <div className="form-col-4">
                        <label className="field-label">
                          <span>Área Construída (m²) *</span>
                          <input
                            type="text"
                            className="input-text"
                            placeholder="Ex: 434.11"
                            value={formData.edification.building_area}
                            onChange={(e) => setFormData((prev) => ({
                              ...prev,
                              edification: { ...prev.edification, building_area: e.target.value }
                            }))}
                          />
                        </label>
                      </div>

                      <div className="form-col-4">
                        <label className="field-label">
                          <span>Área a Construir (m²)</span>
                          <input
                            type="text"
                            className="input-text"
                            placeholder="0"
                            value={formData.edification.area_to_be_built ?? 0}
                            onChange={(e) => setFormData((prev) => ({
                              ...prev,
                              edification: { ...prev.edification, area_to_be_built: e.target.value }
                            }))}
                          />
                        </label>
                      </div>

                      <div className="form-col-4">
                        <label className="field-label">
                          <span>Área de Desconto (m²)</span>
                          <input
                            type="text"
                            className="input-text"
                            placeholder="0"
                            value={formData.edification.discount_area ?? 0}
                            onChange={(e) => setFormData((prev) => ({
                              ...prev,
                              edification: { ...prev.edification, discount_area: e.target.value }
                            }))}
                          />
                        </label>
                      </div>
                    </div>

                    {/* Resumo da Área Total Calculada */}
                    <div className="area-calculation-banner" id="draft-s1-resumo-area" style={{ scrollMarginTop: '96px' }}>
                      <div className="calc-details">
                        <span className="calc-formula">
                          Fórmula Fênix: <code>Área Construída + A Construir - Desconto</code>
                        </span>
                        <strong>Área Total do Projeto: {calculatedTotalArea.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m²</strong>
                      </div>
                      <span className={`status-pill pill-${calculatedTotalArea > 0 ? 'green' : 'amber'}`}>
                        {calculatedTotalArea > 0 ? 'Área Válida' : 'Informe a Área'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* ETAPA 2: PROJETO TÉCNICO & ENQUADRAMENTO */}
              {step === 2 && (
                <div className="step-panel animate-fade-in">
                  {/* Card Executivo de Enquadramento em Tempo Real */}
                  <div className="enquadramento-hero-card" id="draft-s2-enquadramento" style={{ scrollMarginTop: '96px' }}>
                    <div className="enquadramento-header-row">
                      <div className="enquadramento-title-group">
                        <span className={`enquadramento-badge-pill ${enquadramento.badgeClass}`}>
                          {enquadramento.sigla}
                        </span>
                        <div className="enquadramento-titles">
                          <span className="section-kicker">ENQUADRAMENTO CBMBA / IT-14</span>
                          <h3>{enquadramento.nome}</h3>
                        </div>
                      </div>
                      <div className="enquadramento-reason-pill">
                        <Info size={15} />
                        <span>{enquadramento.motivo}</span>
                      </div>
                    </div>

                    <div className="enquadramento-metrics-grid">
                      <div className="metric-box">
                        <small>Área Total Calculada</small>
                        <strong>{calculatedTotalArea.toLocaleString('pt-BR')} m²</strong>
                      </div>
                      <div className="metric-box">
                        <small>Pavimentos & Altura</small>
                        <strong>{formData.edification.number_floors} pav. · {formData.edification.height ? formData.edification.height.split('=')[0].trim() : 'Térrea'}</strong>
                      </div>
                      <div className="metric-box">
                        <small>Tipo de Licença / Vistoria</small>
                        <strong>{enquadramento.suggestedLicense} · {enquadramento.suggestedLicense === 'CLCB' ? 'Dispensa Vistoria' : 'Vistoria Prévia'}</strong>
                      </div>
                      <div className="metric-box">
                        <small>Carga de Incêndio / Divisão</small>
                        <strong>{it14Result?.it14.divisao_code || formData.occupation.division_group_id ? `Divisão ${it14Result?.it14.divisao_code || ''} · ${formData.institution.risk ? `${formData.institution.risk} MJ/m²` : 'Risco Médio'}` : 'Conforme IT-14'}</strong>
                      </div>
                    </div>

                    {/* Botão de ajustar tipo de projeto se houver divergência com o enquadramento CBMBA */}
                    {formData.tipo_projeto_id !== enquadramento.suggestedTipoProjetoId && (
                      <div className="enquadramento-suggest-action animate-fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginTop: '0.9rem', padding: '0.65rem 0.9rem', borderRadius: '8px', background: 'rgba(14, 165, 233, 0.12)', border: '1px solid rgba(14, 165, 233, 0.3)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
                          <Sparkles size={16} className="text-teal" />
                          <span>
                            {[4, 5, 6, 7, 8].includes(formData.tipo_projeto_id || 0) && [1, 2, 3].includes(enquadramento.suggestedTipoProjetoId) ? (
                              <>
                                Os parâmetros informados ({enquadramento.motivo}) requerem <b>Projeto Técnico Completo ({enquadramento.sigla})</b>.
                              </>
                            ) : (
                              <>
                                Sugestão do enquadramento CBMBA: <b>{enquadramento.sigla} — {enquadramento.nome}</b>.
                                Tipo atual: <b>{OFFICIAL_PROJECT_TYPES.find(t => t.id === formData.tipo_projeto_id)?.sigla || 'Não selecionado'}</b>.
                              </>
                            )}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="button button-outline button-xs"
                          style={{ borderColor: '#0ea5e9', color: '#0ea5e9', whiteSpace: 'nowrap' }}
                          onClick={() => {
                            const newId = enquadramento.suggestedTipoProjetoId;
                            const isPt = [1, 2, 3].includes(newId);
                            setFormData(prev => ({
                              ...prev,
                              tipo_projeto_id: newId,
                              form_mode: isPt ? 'pt' : 'pts',
                              process_category: isPt ? 'pt' : 'pts',
                              license_type: [4, 5].includes(newId) ? 'CLCB' : 'AVCB'
                            }));
                            showToast(`Tipo de projeto ajustado para ${enquadramento.sigla}!`, 'success');
                          }}
                        >
                          <Check size={13} /> {[4, 5, 6, 7, 8].includes(formData.tipo_projeto_id || 0) && [1, 2, 3].includes(enquadramento.suggestedTipoProjetoId)
                            ? '✦ Ajustar Tipo para PT Completo'
                            : `✦ Aplicar Sugestão (${enquadramento.sigla})`}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Bloco de Dados Gerais do Projeto Técnico */}
                  <div className="editor-card" id="draft-s2-dados-gerais" style={{ scrollMarginTop: '96px' }}>
                    <div className="card-heading">
                      <ClipboardList size={18} className="text-teal" />
                      <h4>Dados Gerais do Projeto Técnico</h4>
                    </div>

                    <div className="form-grid">
                      {/* Tipo Oficial de Projeto Técnico */}
                      <div className="form-col-6">
                        <label className="field-label">
                          <span>Tipo Oficial de Projeto Técnico (Fênix CBMBA) *</span>
                          <select
                            className="input-select"
                            value={formData.tipo_projeto_id || 4}
                            onChange={(e) => {
                              const tid = Number(e.target.value);
                              const isPt = [1, 2, 3].includes(tid);
                              setFormData((prev) => ({
                                ...prev,
                                tipo_projeto_id: tid,
                                form_mode: isPt ? 'pt' : 'pts',
                                process_category: isPt ? 'pt' : 'pts',
                                license_type: [4, 5].includes(tid) ? 'CLCB' : 'AVCB'
                              }));
                            }}
                          >
                            <optgroup label="Projeto Técnico Simplificado (PTS — até 750 m² e até 3 pav.)">
                              {OFFICIAL_PROJECT_TYPES.filter((t) => t.form_mode === 'pts').map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.id}: {t.sigla} — {t.descricao}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="Projeto Técnico Completo (PT)">
                              {OFFICIAL_PROJECT_TYPES.filter((t) => t.form_mode === 'pt').map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.id}: {t.sigla} — {t.descricao}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </label>
                        <small className="field-hint">Todas as 8 modalidades oficiais do Fênix CBMBA em um único cadastro unificado.</small>
                      </div>

                      {/* Isenção de Taxa */}
                      <div className="form-col-3">
                        <label className="field-label">
                          <span>Isenção da Taxa CBMBA</span>
                          <select
                            className="input-select"
                            value={formData.isencao_id ? 1 : 0}
                            onChange={(e) => setFormData((prev) => ({ ...prev, isencao_id: Number(e.target.value) || undefined }))}
                          >
                            <option value={0}>Não — Taxa Devida</option>
                            <option value={1}>Sim — Isento de Taxa</option>
                          </select>
                        </label>
                        <small className="field-hint">Órgãos públicos e entidades filantrópicas.</small>
                      </div>

                      {/* ART / RRT Geral */}
                      <div className="form-col-3">
                        <label className="field-label">
                          <div className="flex-between">
                            <span>
                              Nº ART / RRT
                              {!(formData.tipo_projeto_id === 4 && formData.questionario?.edf_saida_direta !== false) && (
                                <span style={{ color: '#dc2626', fontWeight: 700 }}> *</span>
                              )}
                            </span>
                            {formData.tipo_projeto_id === 4 && formData.questionario?.edf_saida_direta !== false ? (
                              <span className="badge-tag tag-green" style={{ fontSize: '0.65rem' }}>Dispensada no PTSCLCB1</span>
                            ) : (formData.n_art_rrt?.trim() || formData.responsaveis_tecnicos?.[0]?.n_art_rrt?.trim()) ? (
                              <span className="badge-tag tag-green" style={{ fontSize: '0.65rem' }}>Obrigatória · Preenchida</span>
                            ) : (
                              <span className="badge-tag tag-red" style={{ fontSize: '0.65rem' }}>Obrigatória · Pendente</span>
                            )}
                          </div>
                          <input
                            type="text"
                            className="input-text"
                            maxLength={30}
                            required={!(formData.tipo_projeto_id === 4 && formData.questionario?.edf_saida_direta !== false)}
                            placeholder="Ex: BA20261628773"
                            value={formData.n_art_rrt || formData.responsaveis_tecnicos?.[0]?.n_art_rrt || ''}
                            style={
                              !(formData.tipo_projeto_id === 4 && formData.questionario?.edf_saida_direta !== false) &&
                              !(formData.n_art_rrt?.trim() || formData.responsaveis_tecnicos?.[0]?.n_art_rrt?.trim())
                                ? { borderColor: '#fca5a5', backgroundColor: '#fffafa' }
                                : undefined
                            }
                            onChange={(e) => {
                              const val = e.target.value.toUpperCase();
                              setFormData((prev) => {
                                const list = prev.responsaveis_tecnicos && prev.responsaveis_tecnicos.length > 0
                                  ? [...prev.responsaveis_tecnicos]
                                  : [
                                      {
                                        nome_tecnico: '',
                                        cpf_cnpj_tecnico: '',
                                        conselho: 'CREA' as const,
                                        n_registro_conselho: '',
                                        n_art_rrt: '',
                                        email_tecnico: '',
                                        telefone_tecnico: ''
                                      }
                                    ];
                                if (!list[0].n_art_rrt || list[0].n_art_rrt === prev.n_art_rrt) {
                                  list[0] = { ...list[0], n_art_rrt: val };
                                }
                                return { ...prev, n_art_rrt: val, responsaveis_tecnicos: list };
                              });
                            }}
                          />
                        </label>
                        <small className="field-hint">Registro no CREA / CAU / CFT.</small>
                      </div>

                      {/* Bloco de Datas do Evento se for Temporário */}
                      {[2, 3, 7, 8].includes(formData.tipo_projeto_id || 0) && (
                        <div className="form-col-12 temporary-dates-box" style={{ background: 'rgba(255,255,255,0.03)', padding: '0.85rem', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.15)' }}>
                          <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary, #0ea5e9)', marginBottom: '0.5rem' }}>
                            Período do Evento / Ocupação Temporária (Obrigatório para este Tipo de Projeto)
                          </span>
                          <div className="form-grid">
                            <div className="form-col-6">
                              <label className="field-label">
                                <span>Data de Início do Evento *</span>
                                <input
                                  type="date"
                                  className="input-text"
                                  value={formData.data_inicio || ''}
                                  onChange={(e) => setFormData((prev) => ({ ...prev, data_inicio: e.target.value }))}
                                />
                              </label>
                            </div>
                            <div className="form-col-6">
                              <label className="field-label">
                                <span>Data de Término do Evento *</span>
                                <input
                                  type="date"
                                  className="input-text"
                                  value={formData.data_fim || ''}
                                  onChange={(e) => setFormData((prev) => ({ ...prev, data_fim: e.target.value }))}
                                />
                              </label>
                            </div>
                          </div>
                          {formData.data_inicio && formData.data_fim && (() => {
                            const dStart = new Date(formData.data_inicio);
                            const dEnd = new Date(formData.data_fim);
                            const diffDays = Math.ceil((dEnd.getTime() - dStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                            const isPtsTemp = [7, 8].includes(formData.tipo_projeto_id || 0);
                            return (
                              <div className="temporary-duration-badge" style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
                                <span>Duração prevista do evento: <b>{diffDays > 0 ? `${diffDays} dias` : 'Data de término inválida!'}</b></span>
                                {isPtsTemp && diffDays > 180 && (
                                  <div className="text-danger" style={{ marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <AlertTriangle size={14} /> Alerta CBMBA: O limite máximo para eventos em PTS é de 180 dias!
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* Projeto Anterior */}
                      <div className="form-col-12 mt-1">
                        <ToggleSlider
                          checked={Boolean(formData.projeto_anterior)}
                          onChange={(checked) => setFormData((prev) => ({ ...prev, projeto_anterior: checked }))}
                          label="Esta edificação possui Projeto Técnico anterior aprovado no CBMBA?"
                          description="Marque caso a edificação já possua protocolo aprovado ou processo sob decreto estadual anterior."
                        />
                      </div>

                      {formData.projeto_anterior && (
                        <>
                          <div className="form-col-6 animate-fade-in">
                            <label className="field-label">
                              <span>Nº do Projeto Técnico Anterior</span>
                              <input
                                type="text"
                                className="input-text"
                                placeholder="Ex: PT-00452/2018"
                                value={formData.n_projeto_anterior || ''}
                                onChange={(e) => setFormData((prev) => ({ ...prev, n_projeto_anterior: e.target.value }))}
                              />
                            </label>
                          </div>
                          <div className="form-col-6 animate-fade-in">
                            <label className="field-label">
                              <span>Decreto Estadual Adotado</span>
                              <select
                                className="input-select"
                                value={formData.decreto_estadual_adotado_id || 1}
                                onChange={(e) => setFormData((prev) => ({ ...prev, decreto_estadual_adotado_id: Number(e.target.value) || 1 }))}
                              >
                                <option value={1}>Decreto Estadual nº 16.302/2015 (Vigente)</option>
                                <option value={2}>Decreto Estadual nº 13.963/2012</option>
                                <option value={3}>Decreto Estadual nº 2.115/1974 (Legado)</option>
                              </select>
                            </label>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Bloco do Estabelecimento (Pessoa Jurídica ou Física) */}
                  <div className="editor-card" id="draft-s2-instituicao" style={{ scrollMarginTop: '96px' }}>
                    <div className="card-heading">
                      <Building2 size={18} className="text-teal" />
                      <h4>Estabelecimento & Atividade Econômica (CNAE)</h4>
                    </div>

                    <div className="form-grid">
                      {/* Tipo de Pessoa */}
                      <div className="form-col-3">
                        <label className="field-label">
                          <span>Tipo de Pessoa *</span>
                          <select
                            className="input-select"
                            value={formData.institution.tipo_pessoa || 'PJ'}
                            onChange={(e) => setFormData((prev) => ({
                              ...prev,
                              institution: { ...prev.institution, tipo_pessoa: e.target.value as 'PJ' | 'PF' }
                            }))}
                          >
                            <option value="PJ">Pessoa Jurídica (CNPJ)</option>
                            <option value="PF">Pessoa Física (CPF)</option>
                          </select>
                        </label>
                      </div>

                      {/* CNPJ / CPF */}
                      <div className="form-col-4">
                        <label className="field-label">
                          <span>{formData.institution.tipo_pessoa === 'PF' ? 'CPF *' : 'CNPJ *'}</span>
                          <input
                            type="text"
                            className="input-text"
                            placeholder={formData.institution.tipo_pessoa === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
                            value={formatCnpjCpf(formData.institution.cnpj_cpf)}
                            onChange={(e) => {
                              const digits = cleanDigits(e.target.value);
                              setFormData((prev) => ({
                                ...prev,
                                institution: { ...prev.institution, cnpj_cpf: digits }
                              }));
                            }}
                          />
                        </label>
                      </div>

                      {/* Razão Social */}
                      <div className="form-col-5">
                        <label className="field-label">
                          <span>Razão Social / Nome Completo *</span>
                          <input
                            type="text"
                            className="input-text"
                            maxLength={100}
                            placeholder="Ex: VANDERLEI DA SILVA SANTOS"
                            value={formData.institution.razao_social}
                            onChange={(e) => setFormData((prev) => ({
                              ...prev,
                              institution: { ...prev.institution, razao_social: e.target.value.toUpperCase() }
                            }))}
                          />
                        </label>
                      </div>

                      {/* Nome Fantasia */}
                      <div className="form-col-6">
                        <label className="field-label">
                          <span>Nome Fantasia</span>
                          <input
                            type="text"
                            className="input-text"
                            maxLength={100}
                            placeholder="Ex: VAL SAT E CASA DOS COLCHÕES"
                            value={formData.institution.nome_fantasia || ''}
                            onChange={(e) => setFormData((prev) => ({
                              ...prev,
                              institution: { ...prev.institution, nome_fantasia: e.target.value.toUpperCase() }
                            }))}
                          />
                        </label>
                      </div>

                      {/* Porte / Natureza Jurídica Oficial */}
                      <div className="form-col-6">
                        <label className="field-label">
                          <span>Porte / Natureza Jurídica (Oficial Fênix) *</span>
                          <select
                            className="input-select"
                            value={formData.institution.natureza_juridica || 'Empresa de Pequeno Porte (EPP)'}
                            onChange={(e) => setFormData((prev) => ({
                              ...prev,
                              institution: { ...prev.institution, natureza_juridica: e.target.value }
                            }))}
                          >
                            {PORTES_INSTITUICAO.map((p) => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      {formData.institution.natureza_juridica === 'Outros' && (
                        <div className="form-col-6 animate-fade-in">
                          <label className="field-label">
                            <span>Especifique a Natureza Jurídica *</span>
                            <input
                              type="text"
                              className="input-text"
                              placeholder="Especifique o tipo societário ou porte"
                              value={formData.porte_outros || ''}
                              onChange={(e) => setFormData((prev) => ({ ...prev, porte_outros: e.target.value }))}
                            />
                          </label>
                        </div>
                      )}

                      {/* CNAE com Consulta Fênix */}
                      <div className="form-col-4">
                        <label className="field-label">
                          <span>Código CNAE (7 dígitos) *</span>
                          <div className="input-with-button">
                            <input
                              type="text"
                              className="input-text"
                              placeholder="0000-0/00"
                              value={formatCnae(formData.institution.cnae)}
                              onChange={(e) => {
                                const digits = cleanDigits(e.target.value);
                                setFormData((prev) => ({
                                  ...prev,
                                  institution: { ...prev.institution, cnae: digits }
                                }));
                              }}
                            />
                            <button
                              type="button"
                              className="button button-outline button-sm"
                              onClick={() => void handleLookupCnae()}
                              disabled={cnaeLoading}
                              title="Consultar CNAE na tabela do Fênix CBMBA"
                            >
                              {cnaeLoading ? <LoaderCircle size={14} className="spin" /> : <Search size={14} />} Consultar
                            </button>
                          </div>
                        </label>
                      </div>

                      {/* Atividade Econômica retornada */}
                      <div className="form-col-6">
                        <label className="field-label">
                          <span>Atividade Econômica</span>
                          <input
                            type="text"
                            className="input-text"
                            readOnly
                            placeholder="Preenchida após consultar CNAE"
                            value={formData.institution.atividade_economica}
                          />
                        </label>
                      </div>

                      {/* Carga de Incêndio (Risco em MJ/m²) */}
                      <div className="form-col-2">
                        <label className="field-label">
                          <span>Risco (MJ/m²)</span>
                          <input
                            type="number"
                            className="input-text"
                            value={formData.institution.risk}
                            onChange={(e) => setFormData((prev) => ({
                              ...prev,
                              institution: { ...prev.institution, risk: Number(e.target.value) || 300 }
                            }))}
                          />
                        </label>
                      </div>

                      {/* CNAE não consta na IT-14 (Assemelhação) */}
                      <div className="form-col-12 mt-1">
                        <ToggleSlider
                          checked={Boolean(formData.cnae_not_in_it14)}
                          onChange={(checked) => setFormData((prev) => ({ ...prev, cnae_not_in_it14: checked }))}
                          label="CNAE não consta explicitamente na Tabela 1 da IT-14 (Enquadramento por Assemelhação Técnica)"
                          description="Marque caso a atividade econômica seja atípica e dependa de assemelhação técnica pelos peritos do CBMBA."
                        />
                      </div>
                    </div>

                    {cnaeNotice && (
                      <div className={`cnae-banner banner-${cnaeNotice.type} mt-2`}>
                        {cnaeNotice.type === 'warning' ? <ShieldAlert size={18} /> : <CheckCircle2 size={18} />}
                        <div>
                          <strong>{cnaeNotice.type === 'warning' ? 'Atenção ao Risco Especial do CNAE:' : 'Classificação CNAE:'}</strong>
                          <p>{cnaeNotice.message}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Bloco de Ocupação e Divisão IT 14 */}
                  <div className="editor-card" id="draft-s2-ocupacao" style={{ scrollMarginTop: '96px' }}>
                    <div className="card-heading">
                      <Layers size={18} className="text-teal" />
                      <h4>Ocupação e Divisão (Instrução Técnica 14)</h4>
                    </div>

                    <div className="form-grid">
                      {/* Grupo de Ocupação */}
                      <div className="form-col-6">
                        <label className="field-label">
                          <span>Grupo de Ocupação (Tabela 1 IT 14) *</span>
                          <select
                            className="input-select"
                            value={formData.occupation.occupation_group_id || ''}
                            onChange={(e) => {
                              const gid = Number(e.target.value) || null;
                              setFormData((prev) => ({
                                ...prev,
                                occupation: {
                                  ...prev.occupation,
                                  occupation_group_id: gid,
                                  division_group_id: null
                                }
                              }));
                            }}
                          >
                            <option value="">-- Selecione o Grupo --</option>
                            {(domains?.occupationGroups || [
                              { id: 1, group: 'A', occupation_use: 'Residencial' },
                              { id: 2, group: 'B', occupation_use: 'Serviço de hospedagem' },
                              { id: 3, group: 'C', occupation_use: 'Comercial' },
                              { id: 4, group: 'D', occupation_use: 'Serviço profissional' },
                              { id: 5, group: 'E', occupation_use: 'Educacional e cultura física' },
                              { id: 6, group: 'F', occupation_use: 'Local de reunião de público' },
                              { id: 7, group: 'G', occupation_use: 'Serviços automotivos e assemelhados' },
                              { id: 8, group: 'H', occupation_use: 'Serviços de saúde e institucionais' },
                              { id: 9, group: 'I', occupation_use: 'Indústria' },
                              { id: 10, group: 'J', occupation_use: 'Depósito' }
                            ]).map((g) => (
                              <option key={g.id} value={g.id}>
                                Grupo {g.group} - {g.occupation_use}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      {/* Divisão de Ocupação */}
                      <div className="form-col-6">
                        <label className="field-label">
                          <span>Divisão de Ocupação *</span>
                          <select
                            className="input-select"
                            value={formData.occupation.division_group_id || ''}
                            onChange={(e) => {
                              const did = Number(e.target.value) || null;
                              setFormData((prev) => ({
                                ...prev,
                                occupation: { ...prev.occupation, division_group_id: did }
                              }));
                            }}
                          >
                            <option value="">-- Selecione a Divisão --</option>
                            {filteredDivisions.length > 0 ? (
                              filteredDivisions.map((d) => (
                                <option key={d.id} value={d.id}>
                                  Divisão {d.division} - {d.description}
                                </option>
                              ))
                            ) : (
                              <>
                                <option value={6}>Divisão C-2 - Comércio com média e grande carga de incêndio</option>
                                <option value={7}>Divisão C-3 - Centros comerciais / Shoppings</option>
                              </>
                            )}
                          </select>
                        </label>
                      </div>

                      {/* População / Pessoas */}
                      <div className="form-col-4">
                        <label className="field-label">
                          <span>População / Qtde. Pessoas</span>
                          <input
                            type="number"
                            min={0}
                            className="input-text"
                            placeholder="0"
                            value={formData.qtde_pessoas ?? ''}
                            onChange={(e) => setFormData((prev) => ({ ...prev, qtde_pessoas: Number(e.target.value) || 0 }))}
                          />
                        </label>
                        {formData.occupation.occupation_group_id === 6 && (
                          <small className="field-hint text-teal">★ Grupo F: Reunião de Público (Lotação define saídas de emergência).</small>
                        )}
                      </div>

                      {/* Qtde Leitos (Grupo H) */}
                      {formData.occupation.occupation_group_id === 8 && (
                        <div className="form-col-4 animate-fade-in">
                          <label className="field-label">
                            <span>Quantidade de Leitos (Grupo H - Saúde)</span>
                            <input
                              type="number"
                              min={0}
                              className="input-text"
                              placeholder="0"
                              value={formData.qtde_leitos ?? ''}
                              onChange={(e) => setFormData((prev) => ({ ...prev, qtde_leitos: Number(e.target.value) || 0 }))}
                            />
                          </label>
                        </div>
                      )}

                      {/* Qtde Funcionários */}
                      <div className="form-col-4">
                        <label className="field-label">
                          <span>Quantidade de Funcionários</span>
                          <input
                            type="number"
                            min={0}
                            className="input-text"
                            placeholder="0"
                            value={formData.qtde_funcionarios ?? ''}
                            onChange={(e) => setFormData((prev) => ({ ...prev, qtde_funcionarios: Number(e.target.value) || 0 }))}
                          />
                        </label>
                        {Number(formData.qtde_funcionarios || 0) > 100 && (
                          <small className="field-hint text-amber">Atenção: Divisões com mais de 100 funcionários exigem formação de Brigada de Incêndio (IT-17).</small>
                        )}
                      </div>

                      {/* Área Comum */}
                      <div className="form-col-4">
                        <label className="field-label">
                          <span>Área Comum (m²)</span>
                          <input
                            type="text"
                            className="input-text"
                            placeholder="0.00"
                            value={formData.area_comum ?? ''}
                            onChange={(e) => setFormData((prev) => ({ ...prev, area_comum: e.target.value }))}
                          />
                        </label>
                        <small className="field-hint">Opcional para shopping ou condomínio.</small>
                      </div>

                      {/* Switch Slider de Subsolo */}
                      <div className="form-col-12 mt-1">
                        <ToggleSlider
                          checked={Boolean(formData.occupation.has_underground)}
                          onChange={(checked) => setFormData((prev) => ({
                            ...prev,
                            occupation: { ...prev.occupation, has_underground: checked }
                          }))}
                          label="A edificação possui subsolo ocupado ou com atividades comerciais?"
                          description={formData.occupation.has_underground
                            ? "Subsolo ativo: informe abaixo as características e restrições do subsolo."
                            : "Desativado: o CBMBA considerará o registro padrão sem atividades no subsolo (Grupo 0 / Divisão 0)."
                          }
                        />
                      </div>

                      {formData.occupation.has_underground && (
                        <div className="form-col-12 animate-fade-in">
                          <ToggleSlider
                            checked={Boolean(formData.subsolo_maior_50m)}
                            onChange={(checked) => setFormData((prev) => ({ ...prev, subsolo_maior_50m: checked }))}
                            label="Subsolo possui área superior a 50 m²?"
                            description="Subsolos maiores que 50 m² exigem controle de fumaça e medidas específicas pelo CBMBA."
                          />
                        </div>
                      )}

                      {/* Cobertura FSPS superior a 200 m² */}
                      <div className="form-col-12 mt-1">
                        <ToggleSlider
                          checked={Boolean(formData.cobertura_fsps_sup200)}
                          onChange={(checked) => setFormData((prev) => ({ ...prev, cobertura_fsps_sup200: checked }))}
                          label="Cobertura estrutural (FSPS) superior a 200 m²?"
                          description="Indique se há cobertura metálica ou de lona de grande porte na edificação."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Bloco de Questionário Técnico CBMBA */}
                  <div className="editor-card" id="draft-s2-questionario" style={{ scrollMarginTop: '96px' }}>
                    <div className="card-heading">
                      <HelpCircle size={18} className="text-teal" />
                      <h4>Questionário Técnico CBMBA (Acesso & Regularização)</h4>
                    </div>

                    <div className="form-grid">
                      <div className="form-col-12">
                        <ToggleSlider
                          checked={formData.questionario?.edf_saida_direta !== false}
                          onChange={(checked) => setFormData((prev) => ({
                            ...prev,
                            questionario: { ...prev.questionario, edf_saida_direta: checked }
                          }))}
                          label="A edificação possui saída direta para a via pública?"
                          description="Se o estabelecimento estiver dentro de um shopping, galeria ou condomínio comercial, desative esta opção."
                        />
                      </div>

                      {formData.questionario?.edf_saida_direta === false && (
                        <div className="form-col-12 animate-fade-in" style={{ background: 'rgba(255,255,255,0.03)', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                          <ToggleSlider
                            checked={Boolean(formData.questionario?.edf_regularizada_certificado)}
                            onChange={(checked) => setFormData((prev) => ({
                              ...prev,
                              questionario: { ...prev.questionario, edf_regularizada_certificado: checked }
                            }))}
                            label="A edificação maior (shopping/galeria) possui certificado regularizado no CBMBA?"
                            description="Edificações sem saída direta exigem que o prédio principal esteja regularizado no Corpo de Bombeiros."
                          />

                          {formData.questionario?.edf_regularizada_certificado && (
                            <div className="form-grid mt-2">
                              <div className="form-col-6">
                                <label className="field-label">
                                  <span>Tipo de Certificado da Edificação Maior</span>
                                  <select
                                    className="input-select"
                                    value={formData.questionario?.tipo_certificado || 'AVCB'}
                                    onChange={(e) => setFormData((prev) => ({
                                      ...prev,
                                      questionario: { ...prev.questionario, tipo_certificado: e.target.value as 'AVCB' | 'CLCB' }
                                    }))}
                                  >
                                    <option value="AVCB">AVCB - Auto de Vistoria do Corpo de Bombeiros</option>
                                    <option value="CLCB">CLCB - Certificado de Licença</option>
                                  </select>
                                </label>
                              </div>
                              <div className="form-col-6">
                                <label className="field-label">
                                  <span>Nº do Certificado no CBMBA</span>
                                  <input
                                    type="text"
                                    className="input-text"
                                    placeholder="Ex: AVCB-2024-00129"
                                    value={formData.questionario?.n_certificado || ''}
                                    onChange={(e) => setFormData((prev) => ({
                                      ...prev,
                                      questionario: { ...prev.questionario, n_certificado: e.target.value }
                                    }))}
                                  />
                                </label>
                              </div>
                            </div>
                          )}

                          {!formData.questionario?.edf_regularizada_certificado && (
                            <div className="text-warning mt-1" style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '4px', color: '#f59e0b' }}>
                              <AlertTriangle size={14} /> Atenção CBMBA: Estabelecimentos sem saída direta para a via pública exigem que a edificação maior possua certificado regularizado.
                            </div>
                          )}
                        </div>
                      )}

                      <div className="form-col-12 mt-1">
                        <ToggleSlider
                          checked={Boolean(formData.questionario?.renovacao_sap)}
                          onChange={(checked) => setFormData((prev) => ({
                            ...prev,
                            questionario: { ...prev.questionario, renovacao_sap: checked }
                          }))}
                          label="Renovação de SAP (Sistema de Atendimento Presencial / Processo Legado)"
                          description="Marque apenas se o imóvel possuir processo físico anterior a ser migrado para o Fênix digital."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Bloco de Proprietário e Responsável pelo Uso */}
                  <div className="editor-card" id="draft-s2-proprietario" style={{ scrollMarginTop: '96px' }}>
                    <div className="card-heading flex-between">
                      <div className="flex-row items-center gap-2">
                        <ShieldCheck size={18} className="text-teal" />
                        <h4>Proprietário e Responsável pelo Uso</h4>
                      </div>
                      <button
                        type="button"
                        className="button button-outline button-xs"
                        onClick={handleFillAbaContact}
                        title="Preencher com contatos da engenharia ABA Incêndio"
                      >
                        <Zap size={13} className="text-amber" /> Puxar Dados do Estabelecimento + Contato ABA
                      </button>
                    </div>

                    <div className="form-grid">
                      {/* Tipo Pessoa Proprietário */}
                      <div className="form-col-3">
                        <label className="field-label">
                          <span>Tipo Pessoa Proprietário</span>
                          <select
                            className="input-select"
                            value={formData.proprietario.tipo_pessoa_prop || 'PJ'}
                            onChange={(e) => setFormData((prev) => ({
                              ...prev,
                              proprietario: { ...prev.proprietario, tipo_pessoa_prop: e.target.value as 'PJ' | 'PF' }
                            }))}
                          >
                            <option value="PJ">Pessoa Jurídica (PJ)</option>
                            <option value="PF">Pessoa Física (PF)</option>
                          </select>
                        </label>
                      </div>

                      {/* Nome do Proprietário */}
                      <div className="form-col-5">
                        <label className="field-label">
                          <span>Nome do Proprietário *</span>
                          <input
                            type="text"
                            className="input-text"
                            maxLength={100}
                            placeholder="Nome completo ou Razão Social"
                            value={formData.proprietario.nome_proprietario}
                            onChange={(e) => setFormData((prev) => ({
                              ...prev,
                              proprietario: { ...prev.proprietario, nome_proprietario: e.target.value.toUpperCase() }
                            }))}
                          />
                        </label>
                      </div>

                      <div className="form-col-4">
                        <label className="field-label">
                          <span>CPF / CNPJ do Proprietário *</span>
                          <input
                            type="text"
                            className="input-text"
                            placeholder="00.000.000/0000-00"
                            value={formatCnpjCpf(formData.proprietario.cpf_cnpj_prop)}
                            onChange={(e) => {
                              const digits = cleanDigits(e.target.value);
                              setFormData((prev) => ({
                                ...prev,
                                proprietario: { ...prev.proprietario, cpf_cnpj_prop: digits }
                              }));
                            }}
                          />
                        </label>
                      </div>

                      <div className="form-col-6">
                        <label className="field-label">
                          <span>E-mail do Proprietário *</span>
                          <input
                            type="email"
                            className="input-text"
                            placeholder="engenharia@abaincendio.com.br"
                            value={formData.proprietario.email_proprietario}
                            onChange={(e) => setFormData((prev) => ({
                              ...prev,
                              proprietario: { ...prev.proprietario, email_proprietario: e.target.value }
                            }))}
                          />
                        </label>
                      </div>

                      <div className="form-col-6">
                        <label className="field-label">
                          <span>Telefone do Proprietário *</span>
                          <input
                            type="text"
                            className="input-text"
                            placeholder="(71) 4000-2895"
                            value={formatPhone(formData.proprietario.tel_proprietario)}
                            onChange={(e) => {
                              const digits = cleanDigits(e.target.value);
                              setFormData((prev) => ({
                                ...prev,
                                proprietario: { ...prev.proprietario, tel_proprietario: digits }
                              }));
                            }}
                          />
                        </label>
                      </div>

                      {/* Switch Slider Espelhar Responsável */}
                      <div className="form-col-12 mt-2">
                        <ToggleSlider
                          checked={Boolean(formData.responsavel.responsavel_uso_igual_prop)}
                          onChange={(isSame) => {
                            setFormData((prev) => ({
                              ...prev,
                              responsavel: {
                                ...prev.responsavel,
                                responsavel_uso_igual_prop: isSame,
                                ...(isSame
                                  ? {
                                      tipo_pessoa_resp: prev.proprietario.tipo_pessoa_prop,
                                      cpf_cnpj_resp: prev.proprietario.cpf_cnpj_prop,
                                      nome_responsavel: prev.proprietario.nome_proprietario,
                                      email_responsavel_uso: prev.proprietario.email_proprietario,
                                      tel_responsavel_uso: prev.proprietario.tel_proprietario
                                    }
                                  : {})
                              }
                            }));
                          }}
                          label="Responsável pelo uso é a mesma pessoa que o proprietário"
                          description="Espelha automaticamente nome, documento e contatos do proprietário."
                        />
                      </div>

                      {/* Se não for igual, exibe campos do responsável */}
                      {!formData.responsavel.responsavel_uso_igual_prop && (
                        <>
                          <div className="form-col-3 animate-fade-in">
                            <label className="field-label">
                              <span>Tipo Pessoa Resp. Uso</span>
                              <select
                                className="input-select"
                                value={formData.responsavel.tipo_pessoa_resp || 'PJ'}
                                onChange={(e) => setFormData((prev) => ({
                                  ...prev,
                                  responsavel: { ...prev.responsavel, tipo_pessoa_resp: e.target.value as 'PJ' | 'PF' }
                                }))}
                              >
                                <option value="PJ">Pessoa Jurídica</option>
                                <option value="PF">Pessoa Física</option>
                              </select>
                            </label>
                          </div>

                          <div className="form-col-5 animate-fade-in">
                            <label className="field-label">
                              <span>Nome do Responsável pelo Uso *</span>
                              <input
                                type="text"
                                className="input-text"
                                value={formData.responsavel.nome_responsavel}
                                onChange={(e) => setFormData((prev) => ({
                                  ...prev,
                                  responsavel: { ...prev.responsavel, nome_responsavel: e.target.value.toUpperCase() }
                                }))}
                              />
                            </label>
                          </div>

                          <div className="form-col-4 animate-fade-in">
                            <label className="field-label">
                              <span>CPF / CNPJ do Responsável <span style={{ color: '#dc2626', fontWeight: 700 }}> *</span></span>
                              <input
                                type="text"
                                className="input-text"
                                required
                                value={formatCnpjCpf(formData.responsavel.cpf_cnpj_resp)}
                                style={
                                  !cleanDigits(formData.responsavel.cpf_cnpj_resp) || ![11, 14].includes(cleanDigits(formData.responsavel.cpf_cnpj_resp).length)
                                    ? { borderColor: '#fca5a5', backgroundColor: '#fffafa' }
                                    : undefined
                                }
                                onChange={(e) => {
                                  const digits = cleanDigits(e.target.value);
                                  setFormData((prev) => ({
                                    ...prev,
                                    responsavel: { ...prev.responsavel, cpf_cnpj_resp: digits }
                                  }));
                                }}
                              />
                            </label>
                          </div>

                          <div className="form-col-6 animate-fade-in">
                            <label className="field-label">
                              <span>E-mail do Responsável pelo Uso <span style={{ color: '#dc2626', fontWeight: 700 }}> *</span></span>
                              <input
                                type="email"
                                className="input-text"
                                required
                                value={formData.responsavel.email_responsavel_uso || ''}
                                style={
                                  !formData.responsavel.email_responsavel_uso?.trim() || !formData.responsavel.email_responsavel_uso.includes('@')
                                    ? { borderColor: '#fca5a5', backgroundColor: '#fffafa' }
                                    : undefined
                                }
                                onChange={(e) => setFormData((prev) => ({
                                  ...prev,
                                  responsavel: { ...prev.responsavel, email_responsavel_uso: e.target.value }
                                }))}
                              />
                            </label>
                          </div>

                          <div className="form-col-6 animate-fade-in">
                            <label className="field-label">
                              <span>Telefone do Responsável pelo Uso <span style={{ color: '#dc2626', fontWeight: 700 }}> *</span></span>
                              <input
                                type="text"
                                className="input-text"
                                required
                                value={formatPhone(formData.responsavel.tel_responsavel_uso)}
                                style={
                                  !cleanDigits(formData.responsavel.tel_responsavel_uso) || ![10, 11].includes(cleanDigits(formData.responsavel.tel_responsavel_uso).length)
                                    ? { borderColor: '#fca5a5', backgroundColor: '#fffafa' }
                                    : undefined
                                }
                                onChange={(e) => {
                                  const digits = cleanDigits(e.target.value);
                                  setFormData((prev) => ({
                                    ...prev,
                                    responsavel: { ...prev.responsavel, tel_responsavel_uso: digits }
                                  }));
                                }}
                              />
                            </label>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Bloco de Responsável Técnico */}
                  <div className="editor-card" id="draft-s2-rt" style={{ scrollMarginTop: '96px' }}>
                    <div className="card-heading flex-between">
                      <div className="flex-row items-center gap-2">
                        <HardHat size={18} className="text-teal" />
                        <h4>Responsável Técnico pelo Projeto (RT / ART / RRT)</h4>
                      </div>
                      {(() => {
                        const isPtsClcb1SaidaDireta = formData.tipo_projeto_id === 4 && formData.questionario?.edf_saida_direta !== false;
                        if (isPtsClcb1SaidaDireta) {
                          return <span className="badge-tag tag-green">Dispensado no PTSCLCB1 com Saída Direta</span>;
                        }
                        const rtList = formData.responsaveis_tecnicos || [];
                        if (rtList.length === 0) {
                          return <span className="badge-tag tag-red">Obrigatório no CBMBA · Pendente</span>;
                        }
                        let pendenciasRt = 0;
                        rtList.forEach((rt) => {
                          if (!rt.nome_tecnico?.trim()) pendenciasRt++;
                          const cDigits = cleanDigits(rt.cpf_cnpj_tecnico);
                          if (!cDigits || (cDigits.length !== 11 && cDigits.length !== 14)) pendenciasRt++;
                          if (!rt.conselho || !['CREA', 'CAU', 'CFT'].includes(rt.conselho)) pendenciasRt++;
                          if (!rt.n_registro_conselho?.trim()) pendenciasRt++;
                          if (!rt.n_art_rrt?.trim()) pendenciasRt++;
                          if (!rt.email_tecnico?.trim() || !rt.email_tecnico.includes('@')) pendenciasRt++;
                          const tDigits = cleanDigits(rt.telefone_tecnico);
                          if (!tDigits || (tDigits.length !== 10 && tDigits.length !== 11)) pendenciasRt++;
                        });
                        if (pendenciasRt === 0) {
                          return <span className="badge-tag tag-green">Obrigatório no CBMBA · Concluído</span>;
                        }
                        return (
                          <span className="badge-tag tag-red">
                            Obrigatório no CBMBA · {pendenciasRt} {pendenciasRt === 1 ? 'campo pendente' : 'campos pendentes'}
                          </span>
                        );
                      })()}
                    </div>

                    {formData.tipo_projeto_id === 4 && formData.questionario?.edf_saida_direta !== false && (
                      <div className="form-col-12 mb-2">
                        <ToggleSlider
                          checked={Boolean(formData.incluir_rt_opcional)}
                          onChange={(checked) => setFormData((prev) => ({ ...prev, incluir_rt_opcional: checked }))}
                          label="Deseja cadastrar Responsável Técnico neste processo?"
                          description="O CBMBA dispensa ART/RRT para PTSCLCB1 com saída direta à rua, mas você pode cadastrar o RT opcionalmente para registro de autoria técnica."
                        />
                      </div>
                    )}

                    {(formData.tipo_projeto_id !== 4 || formData.questionario?.edf_saida_direta === false || formData.incluir_rt_opcional) && (
                      <div className="rt-list animate-fade-in">
                        {(() => {
                          const isPtsClcb1SaidaDireta = formData.tipo_projeto_id === 4 && formData.questionario?.edf_saida_direta !== false;
                          const isRtRequired = !isPtsClcb1SaidaDireta || Boolean(formData.incluir_rt_opcional);
                          const rtList = formData.responsaveis_tecnicos && formData.responsaveis_tecnicos.length > 0
                            ? formData.responsaveis_tecnicos
                            : [
                                {
                                  nome_tecnico: '',
                                  cpf_cnpj_tecnico: '',
                                  conselho: 'CREA' as const,
                                  n_registro_conselho: '',
                                  n_art_rrt: formData.n_art_rrt || '',
                                  email_tecnico: '',
                                  telefone_tecnico: ''
                                }
                              ];

                          return rtList.map((rt, idx) => {
                            const isNomePending = isRtRequired && !rt.nome_tecnico?.trim();
                            const cDigits = cleanDigits(rt.cpf_cnpj_tecnico);
                            const isCpfPending = isRtRequired && (!cDigits || ![11, 14].includes(cDigits.length));
                            const isRegPending = isRtRequired && !rt.n_registro_conselho?.trim();
                            const isArtPending = isRtRequired && !rt.n_art_rrt?.trim();
                            const isEmailPending = isRtRequired && (!rt.email_tecnico?.trim() || !rt.email_tecnico.includes('@'));
                            const tDigits = cleanDigits(rt.telefone_tecnico);
                            const isTelPending = isRtRequired && (!tDigits || ![10, 11].includes(tDigits.length));

                            return (
                              <div key={idx} className="rt-card-item" style={{ background: 'rgba(255,255,255,0.03)', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '0.75rem' }}>
                                <div className="rt-card-head flex-between" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                  <span className="rt-index-badge" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8' }}>
                                    Responsável Técnico #{idx + 1}
                                  </span>
                                  {rtList.length > 1 ? (
                                    <button
                                      type="button"
                                      className="button button-outline button-xs text-danger"
                                      onClick={() => {
                                        setFormData((prev) => ({
                                          ...prev,
                                          responsaveis_tecnicos: (prev.responsaveis_tecnicos || []).filter((_, i) => i !== idx)
                                        }));
                                      }}
                                    >
                                      <Trash2 size={13} /> Remover RT
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="button button-outline button-xs"
                                      onClick={() => {
                                        setFormData((prev) => {
                                          const list = [...(prev.responsaveis_tecnicos || [])];
                                          list[idx] = {
                                            nome_tecnico: '',
                                            cpf_cnpj_tecnico: '',
                                            conselho: 'CREA',
                                            n_registro_conselho: '',
                                            n_art_rrt: '',
                                            email_tecnico: '',
                                            telefone_tecnico: ''
                                          };
                                          return { ...prev, responsaveis_tecnicos: list, n_art_rrt: idx === 0 ? '' : prev.n_art_rrt };
                                        });
                                      }}
                                      title="Limpar campos deste responsável técnico"
                                    >
                                      Limpar Campos
                                    </button>
                                  )}
                                </div>

                                <div className="form-grid">
                                  <div className="form-col-6">
                                    <label className="field-label">
                                      <span>
                                        Nome Completo do Profissional
                                        {isRtRequired && <span style={{ color: '#dc2626', fontWeight: 700 }}> *</span>}
                                      </span>
                                      <input
                                        type="text"
                                        className="input-text"
                                        required={isRtRequired}
                                        style={isNomePending ? { borderColor: '#fca5a5', backgroundColor: '#fffafa' } : undefined}
                                        placeholder="Ex: ENG. MARCOS VINICIUS ALMEIDA"
                                        value={rt.nome_tecnico}
                                        onChange={(e) => {
                                          const val = e.target.value.toUpperCase();
                                          setFormData((prev) => {
                                            const list = prev.responsaveis_tecnicos && prev.responsaveis_tecnicos.length > 0
                                              ? [...prev.responsaveis_tecnicos]
                                              : [{ ...rt }];
                                            list[idx] = { ...list[idx], nome_tecnico: val };
                                            return { ...prev, responsaveis_tecnicos: list };
                                          });
                                        }}
                                      />
                                    </label>
                                  </div>

                                  <div className="form-col-6">
                                    <label className="field-label">
                                      <span>
                                        CPF / CNPJ do RT
                                        {isRtRequired && <span style={{ color: '#dc2626', fontWeight: 700 }}> *</span>}
                                      </span>
                                      <input
                                        type="text"
                                        className="input-text"
                                        required={isRtRequired}
                                        style={isCpfPending ? { borderColor: '#fca5a5', backgroundColor: '#fffafa' } : undefined}
                                        placeholder="000.000.000-00"
                                        value={formatCnpjCpf(rt.cpf_cnpj_tecnico)}
                                        onChange={(e) => {
                                          const val = cleanDigits(e.target.value);
                                          setFormData((prev) => {
                                            const list = prev.responsaveis_tecnicos && prev.responsaveis_tecnicos.length > 0
                                              ? [...prev.responsaveis_tecnicos]
                                              : [{ ...rt }];
                                            list[idx] = { ...list[idx], cpf_cnpj_tecnico: val };
                                            return { ...prev, responsaveis_tecnicos: list };
                                          });
                                        }}
                                      />
                                    </label>
                                  </div>

                                  <div className="form-col-4">
                                    <label className="field-label">
                                      <span>
                                        Conselho Profissional
                                        {isRtRequired && <span style={{ color: '#dc2626', fontWeight: 700 }}> *</span>}
                                      </span>
                                      <select
                                        className="input-select"
                                        required={isRtRequired}
                                        value={rt.conselho}
                                        onChange={(e) => {
                                          const val = e.target.value as 'CREA' | 'CAU' | 'CFT';
                                          setFormData((prev) => {
                                            const list = prev.responsaveis_tecnicos && prev.responsaveis_tecnicos.length > 0
                                              ? [...prev.responsaveis_tecnicos]
                                              : [{ ...rt }];
                                            list[idx] = { ...list[idx], conselho: val };
                                            return { ...prev, responsaveis_tecnicos: list };
                                          });
                                        }}
                                      >
                                        <option value="CREA">CREA (Engenharia e Agronomia)</option>
                                        <option value="CAU">CAU (Arquitetura e Urbanismo)</option>
                                        <option value="CFT">CFT (Técnicos Industriais)</option>
                                      </select>
                                    </label>
                                  </div>

                                  <div className="form-col-4">
                                    <label className="field-label">
                                      <span>
                                        Nº Registro no Conselho
                                        {isRtRequired && <span style={{ color: '#dc2626', fontWeight: 700 }}> *</span>}
                                      </span>
                                      <input
                                        type="text"
                                        className="input-text"
                                        required={isRtRequired}
                                        style={isRegPending ? { borderColor: '#fca5a5', backgroundColor: '#fffafa' } : undefined}
                                        placeholder="Ex: 05189283-BA"
                                        value={rt.n_registro_conselho}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setFormData((prev) => {
                                            const list = prev.responsaveis_tecnicos && prev.responsaveis_tecnicos.length > 0
                                              ? [...prev.responsaveis_tecnicos]
                                              : [{ ...rt }];
                                            list[idx] = { ...list[idx], n_registro_conselho: val };
                                            return { ...prev, responsaveis_tecnicos: list };
                                          });
                                        }}
                                      />
                                    </label>
                                  </div>

                                  <div className="form-col-4">
                                    <label className="field-label">
                                      <span>
                                        Nº ART / RRT / TRT
                                        {isRtRequired && <span style={{ color: '#dc2626', fontWeight: 700 }}> *</span>}
                                      </span>
                                      <input
                                        type="text"
                                        className="input-text"
                                        required={isRtRequired}
                                        style={isArtPending ? { borderColor: '#fca5a5', backgroundColor: '#fffafa' } : undefined}
                                        placeholder="Ex: BA20261628773"
                                        value={rt.n_art_rrt}
                                        onChange={(e) => {
                                          const val = e.target.value.toUpperCase();
                                          setFormData((prev) => {
                                            const list = prev.responsaveis_tecnicos && prev.responsaveis_tecnicos.length > 0
                                              ? [...prev.responsaveis_tecnicos]
                                              : [{ ...rt }];
                                            list[idx] = { ...list[idx], n_art_rrt: val };
                                            return { ...prev, responsaveis_tecnicos: list, n_art_rrt: idx === 0 ? val : prev.n_art_rrt };
                                          });
                                        }}
                                      />
                                    </label>
                                  </div>

                                  <div className="form-col-6">
                                    <label className="field-label">
                                      <span>
                                        E-mail do Responsável Técnico
                                        {isRtRequired && <span style={{ color: '#dc2626', fontWeight: 700 }}> *</span>}
                                      </span>
                                      <input
                                        type="email"
                                        className="input-text"
                                        required={isRtRequired}
                                        style={isEmailPending ? { borderColor: '#fca5a5', backgroundColor: '#fffafa' } : undefined}
                                        placeholder="engenheiro@email.com"
                                        value={rt.email_tecnico || ''}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setFormData((prev) => {
                                            const list = prev.responsaveis_tecnicos && prev.responsaveis_tecnicos.length > 0
                                              ? [...prev.responsaveis_tecnicos]
                                              : [{ ...rt }];
                                            list[idx] = { ...list[idx], email_tecnico: val };
                                            return { ...prev, responsaveis_tecnicos: list };
                                          });
                                        }}
                                      />
                                    </label>
                                  </div>

                                  <div className="form-col-6">
                                    <label className="field-label">
                                      <span>
                                        Telefone do Responsável Técnico
                                        {isRtRequired && <span style={{ color: '#dc2626', fontWeight: 700 }}> *</span>}
                                      </span>
                                      <input
                                        type="text"
                                        className="input-text"
                                        required={isRtRequired}
                                        style={isTelPending ? { borderColor: '#fca5a5', backgroundColor: '#fffafa' } : undefined}
                                        placeholder="(71) 99999-9999"
                                        value={formatPhone(rt.telefone_tecnico)}
                                        onChange={(e) => {
                                          const val = cleanDigits(e.target.value);
                                          setFormData((prev) => {
                                            const list = prev.responsaveis_tecnicos && prev.responsaveis_tecnicos.length > 0
                                              ? [...prev.responsaveis_tecnicos]
                                              : [{ ...rt }];
                                            list[idx] = { ...list[idx], telefone_tecnico: val };
                                            return { ...prev, responsaveis_tecnicos: list };
                                          });
                                        }}
                                      />
                                    </label>
                                  </div>
                                </div>
                              </div>
                            );
                          });
                        })()}

                        <button
                          type="button"
                          className="button button-outline button-sm mt-1"
                          onClick={() => {
                            setFormData((prev) => ({
                              ...prev,
                              responsaveis_tecnicos: [
                                ...(prev.responsaveis_tecnicos || []),
                                {
                                  nome_tecnico: '',
                                  cpf_cnpj_tecnico: '',
                                  conselho: 'CREA',
                                  n_registro_conselho: '',
                                  n_art_rrt: '',
                                  email_tecnico: '',
                                  telefone_tecnico: ''
                                }
                              ]
                            }));
                          }}
                        >
                          <Plus size={14} /> Adicionar Outro Responsável Técnico
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Bloco de Medidas de Segurança Contra Incêndio */}
                  <div className="editor-card" id="draft-s2-medidas" style={{ scrollMarginTop: '96px' }}>
                    <div className="card-heading flex-between">
                      <div className="flex-row items-center gap-2">
                        <Flame size={18} className="text-teal" />
                        <h4>Medidas de Segurança Contra Incêndio (22 Medidas Oficiais CBMBA)</h4>
                      </div>
                      <button
                        type="button"
                        className="button button-outline button-xs"
                        onClick={handleAutoCheckMeasures}
                        title="Marcar automaticamente as medidas exigidas pela legislação da Bahia para este porte"
                      >
                        <Sparkles size={13} className="text-teal" /> Marcar Recomendadas para o Porte
                      </button>
                    </div>

                    {[4, 5, 6, 7, 8].includes(formData.tipo_projeto_id || 0) && (
                      <div className="pts-measures-notice animate-fade-in mb-3" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.65rem 0.9rem', borderRadius: '8px', background: 'rgba(20, 184, 166, 0.08)', border: '1px solid rgba(20, 184, 166, 0.25)', fontSize: '0.82rem' }}>
                        <Info size={16} className="text-teal" />
                        <p style={{ margin: 0, lineHeight: 1.45 }}>
                          No envio de processos na modalidade <b>PTS ({OFFICIAL_PROJECT_TYPES.find(t => t.id === formData.tipo_projeto_id)?.sigla || 'Simplificado'})</b>, o Fênix CBMBA homologa as 6 medidas básicas. As 16 medidas de engenharia avançada podem ser marcadas e ficam registradas no seu rascunho técnico.
                        </p>
                      </div>
                    )}

                    <div className="measures-grid">
                      {OFFICIAL_FENIX_MEASURES.map((measure) => {
                        const isChecked = Boolean(formData.securityMeasures?.[measure.key]);
                        return (
                          <div key={measure.key} className={`measure-slider-card ${isChecked ? 'selected' : ''}`}>
                            <ToggleSlider
                              checked={isChecked}
                              onChange={(checked) => {
                                setFormData((prev) => ({
                                  ...prev,
                                  securityMeasures: {
                                    ...prev.securityMeasures,
                                    [measure.key]: checked ? 1 : 0
                                  }
                                }));
                              }}
                              label={measure.label}
                              badge={measure.basic ? <span className="tag-basic">Básica (PTS/PT)</span> : <span className="tag-advanced" style={{ background: 'rgba(14, 165, 233, 0.2)', color: '#38bdf8', padding: '1px 6px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 600 }}>Engenharia (PT)</span>}
                              description={measure.desc}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Bloco de Riscos Especiais & GLP */}
                  <div className="editor-card" id="draft-s2-riscos-glp" style={{ scrollMarginTop: '96px' }}>
                    <div className="card-heading flex-between">
                      <div className="flex-row items-center gap-2">
                        <AlertTriangle size={18} className="text-amber" />
                        <h4>Riscos Especiais & GLP (Gás Liquefeito de Petróleo)</h4>
                      </div>
                      <span className="badge-tag">Controle de Riscos CBMBA</span>
                    </div>

                    <p className="field-hint">
                      Indique se o estabelecimento armazena ou manipula substâncias ou instalações que apresentem risco especial segundo as Instruções Técnicas do CBMBA.
                    </p>

                    <div className="form-grid">
                      <div className="form-col-12">
                        <ToggleSlider
                          checked={Boolean(formData.specialRisks?.liquidos_inflamaveis)}
                          onChange={(checked) => setFormData((prev) => ({
                            ...prev,
                            specialRisks: { ...prev.specialRisks, liquidos_inflamaveis: checked }
                          }))}
                          label="Líquidos combustíveis ou inflamáveis (> 250 L)"
                          description="Armazenamento ou manipulação de diesel, gasolina, solventes ou tintas."
                        />
                      </div>

                      <div className="form-col-12">
                        <ToggleSlider
                          checked={Boolean(formData.specialRisks?.gas_liquefeito_petroleo)}
                          onChange={(checked) => setFormData((prev) => ({
                            ...prev,
                            specialRisks: { ...prev.specialRisks, gas_liquefeito_petroleo: checked }
                          }))}
                          label="Gás Liquefeito de Petróleo (GLP - Central ou Botijões)"
                          description="Utilização de recipientes de gás para cocção, caldeiras ou processos industriais."
                        />
                      </div>

                      {/* Sub-bloco GLP se gas_liquefeito_petroleo estiver ativo */}
                      {formData.specialRisks?.gas_liquefeito_petroleo && (
                        <div className="form-col-12 animate-fade-in" style={{ background: 'rgba(255,255,255,0.03)', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: '#f59e0b', fontWeight: 600, fontSize: '0.85rem' }}>
                            <Flame size={16} /> Detalhamento da Central de GLP (IT-28 CBMBA)
                          </div>

                          <div className="form-grid">
                            <div className="form-col-4">
                              <label className="field-label">
                                <span>Quantidade Total de GLP (kg) *</span>
                                <input
                                  type="number"
                                  min={0}
                                  step="0.1"
                                  className="input-text"
                                  placeholder="Ex: 90"
                                  value={formData.glpData?.total_kg_glp || ''}
                                  onChange={(e) => {
                                    const kg = e.target.value;
                                    const num = Number(kg) || 0;
                                    let autoClass = formData.glpData?.classe_glp || 'Classe I';
                                    if (num <= 26) autoClass = 'Classe I';
                                    else if (num <= 135) autoClass = 'Classe II';
                                    else if (num <= 520) autoClass = 'Classe III';
                                    else if (num <= 1560) autoClass = 'Classe IV';
                                    else if (num <= 6240) autoClass = 'Classe V';
                                    else if (num <= 12480) autoClass = 'Classe VI';
                                    else if (num <= 24960) autoClass = 'Classe VII';
                                    else autoClass = 'Classe VIII';

                                    setFormData((prev) => ({
                                      ...prev,
                                      glpData: {
                                        ...prev.glpData,
                                        total_kg_glp: kg,
                                        classe_glp: autoClass
                                      }
                                    }));
                                  }}
                                />
                              </label>
                            </div>

                            <div className="form-col-8">
                              <label className="field-label">
                                <span>Classe Oficial de GLP (Tabela 1 IT-28)</span>
                                <select
                                  className="input-select"
                                  value={formData.glpData?.classe_glp || 'Classe I'}
                                  onChange={(e) => setFormData((prev) => ({
                                    ...prev,
                                    glpData: { ...prev.glpData, classe_glp: e.target.value }
                                  }))}
                                >
                                  {GLP_CLASSES.map((c) => (
                                    <option key={c.id} value={c.id}>{c.label} ({c.limit})</option>
                                  ))}
                                </select>
                              </label>
                            </div>
                          </div>

                          {Number(formData.glpData?.total_kg_glp) > 12480 && (
                            <div className="text-danger mt-2" style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <AlertTriangle size={15} /> <b>Atenção:</b> Capacidade de GLP superior a 12.480 kg (Classe VII e VIII) exige obrigatoriamente Projeto Técnico Completo (PT) com sistema fixo.
                            </div>
                          )}
                        </div>
                      )}

                      <div className="form-col-12">
                        <ToggleSlider
                          checked={Boolean(formData.specialRisks?.produtos_perigosos)}
                          onChange={(checked) => setFormData((prev) => ({
                            ...prev,
                            specialRisks: { ...prev.specialRisks, produtos_perigosos: checked }
                          }))}
                          label="Produtos Perigosos ou Tóxicos"
                          description="Substâncias químicas oxidantes, corrosivas ou perigosas à saúde humana."
                        />
                      </div>

                      <div className="form-col-12">
                        <ToggleSlider
                          checked={Boolean(formData.specialRisks?.fogos_artificio)}
                          onChange={(checked) => setFormData((prev) => ({
                            ...prev,
                            specialRisks: { ...prev.specialRisks, fogos_artificio: checked }
                          }))}
                          label="Fogos de artifício ou artefatos pirotécnicos"
                          description="Armazenamento, venda ou queima controlada de pirotecnia."
                        />
                      </div>

                      <div className="form-col-12">
                        <ToggleSlider
                          checked={Boolean(formData.specialRisks?.vaso_pressao)}
                          onChange={(checked) => setFormData((prev) => ({
                            ...prev,
                            specialRisks: { ...prev.specialRisks, vaso_pressao: checked }
                          }))}
                          label="Caldeiras e vasos sob pressão"
                          description="Compressores industriais, autoclaves ou reservatórios de ar comprimido."
                        />
                      </div>

                      <div className="form-col-12">
                        <label className="field-label">
                          <span>Outros Riscos Especiais (Descrição livre)</span>
                          <input
                            type="text"
                            className="input-text"
                            placeholder="Opcional. Ex: Cabine primária de alta tensão, gerador diesel 150 kVA..."
                            value={formData.specialRisks?.outros || ''}
                            onChange={(e) => setFormData((prev) => ({
                              ...prev,
                              specialRisks: { ...prev.specialRisks, outros: e.target.value }
                            }))}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ETAPA 3: VALIDAÇÃO, REVISÃO & ENVIO */}
              {step === 3 && (
                <div className="step-panel animate-fade-in">
                  {/* Card Informativo de Documentos Exigidos pelo Fênix pós-protocolo */}
                  <div className="editor-card official-docs-checklist-card animate-fade-in" id="draft-s3-documentos" style={{ borderLeft: '4px solid #14b8a6', scrollMarginTop: '96px' }}>
                    <div className="card-heading flex-between">
                      <div className="flex-row items-center gap-2">
                        <FileText size={18} className="text-teal" />
                        <h4>Documentos que o Fênix solicitará após gerar o protocolo</h4>
                      </div>
                      <span className="badge-tag tag-teal">
                        Tipo de Projeto #{formData.tipo_projeto_id || 4} ({OFFICIAL_PROJECT_TYPES.find(t => t.id === (formData.tipo_projeto_id || 4))?.sigla})
                      </span>
                    </div>

                    <p className="field-hint" style={{ marginBottom: '0.75rem' }}>
                      Ao concluir o protocolo no Fênix CBMBA, a plataforma governamental disponibilizará o upload dos seguintes anexos obrigatórios para este tipo de processo:
                    </p>

                    <div className="required-docs-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.65rem' }}>
                      {formData.tipo_projeto_id === 4 && (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <CheckCircle2 size={16} className="text-teal" /><span>Documento de Identificação com Foto do Proprietário/Responsável (RG / CNH)</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <CheckCircle2 size={16} className="text-teal" /><span>Comprovante de Endereço ou Espelho do IPTU do Imóvel</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <CheckCircle2 size={16} className="text-teal" /><span>Cartão CNPJ atualizado da Receita Federal</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <CheckCircle2 size={16} className="text-teal" /><span>Declaração de Ciência e Atendimento às Normas CBMBA (assinada no Fênix)</span>
                          </div>
                          {formData.incluir_rt_opcional && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                              <CheckCircle2 size={16} className="text-teal" /><span>ART / RRT de Responsabilidade Técnica quitada (opcional cadastrado)</span>
                            </div>
                          )}
                        </>
                      )}
                      {[5, 6].includes(formData.tipo_projeto_id || 0) && (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <CheckCircle2 size={16} className="text-teal" /><span>Documento de Identificação com Foto do Proprietário e Responsável</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <CheckCircle2 size={16} className="text-teal" /><span>Comprovante de Endereço / IPTU da Edificação</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <CheckCircle2 size={16} className="text-teal" /><span>ART / RRT de Responsabilidade Técnica quitada e assinada</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <CheckCircle2 size={16} className="text-teal" /><span>Croqui / Planta de Localização e Implantação das Saídas e Extintores</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <CheckCircle2 size={16} className="text-teal" /><span>Certificado da Brigada de Incêndio (se área &gt; 200 m²)</span>
                          </div>
                        </>
                      )}
                      {[7, 8].includes(formData.tipo_projeto_id || 0) && (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <CheckCircle2 size={16} className="text-teal" /><span>Autorização / Alvará Municipal para o Evento Temporário</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <CheckCircle2 size={16} className="text-teal" /><span>ART / RRT de Montagem de Estruturas Provisórias (palcos, tendas, gradis)</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <CheckCircle2 size={16} className="text-teal" /><span>Planta de Evacuação Rápida e Dimensionamento de Lotação</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <CheckCircle2 size={16} className="text-teal" /><span>Termo de Compromisso de Segurança do Organizador do Evento</span>
                          </div>
                        </>
                      )}
                      {[1, 2, 3].includes(formData.tipo_projeto_id || 0) && (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <CheckCircle2 size={16} className="text-teal" /><span>Pranchas Completas do Projeto de Segurança Contra Incêndio (PSCIP em DWG/PDF)</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <CheckCircle2 size={16} className="text-teal" /><span>ART / RRT de Elaboração de Projeto e Execução quitada</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <CheckCircle2 size={16} className="text-teal" /><span>Memorial Descritivo e Memória de Cálculo Hidráulico (Bombas, Hidrantes e Chuveiros)</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <CheckCircle2 size={16} className="text-teal" /><span>Laudo de Estanqueidade e Testes de Pressão da Rede de GLP (se houver central)</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <CheckCircle2 size={16} className="text-teal" /><span>DAE da Taxa de Análise de Projeto Técnico emitida e comprovante de quitação</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Resumo de Validação do Rascunho */}
                  <div className="editor-card" id="draft-s3-conformidade" style={{ scrollMarginTop: '96px' }}>
                    <div className="card-heading">
                      <ShieldCheck size={18} className="text-teal" />
                      <h4>Diagnóstico de Conformidade do Rascunho</h4>
                    </div>

                    {localValidation.valid ? (
                      <div className="validation-success-banner">
                        <CheckCircle2 size={24} className="text-green" />
                        <div>
                          <strong>Rascunho Pronto para Simulação e Envio!</strong>
                          <p>Todos os campos obrigatórios da Edificação, Endereço, Estabelecimento e IT 14 foram preenchidos.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="validation-error-banner">
                        <CircleAlert size={24} className="text-red" />
                        <div>
                          <strong>{localValidation.errors.length} Pendência(s) Encontrada(s):</strong>
                          <ul>
                            {localValidation.errors.map((err, i) => (
                              <li key={i}>{err}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {localValidation.warnings.length > 0 && (
                      <div className="validation-warning-banner mt-2">
                        <AlertTriangle size={20} className="text-amber" />
                        <div>
                          <strong>Observações:</strong>
                          <ul>
                            {localValidation.warnings.map((w, i) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Trava de Segurança e Transmissão para o Fênix Real */}
                  <div className="secure-submission-card" id="draft-s3-transmissao" style={{ scrollMarginTop: '96px' }}>
                    <div className="submission-warning-head">
                      <AlertTriangle size={24} className="text-amber" />
                      <div>
                        <h4>Ambiente de Transmissão Oficial CBMBA</h4>
                        <p>
                          Atenção: Ao submeter, os dados serão enviados para o sistema oficial do Corpo de Bombeiros Militar da Bahia,
                          criando a Edificação e o Projeto Técnico na base governamental.
                        </p>
                      </div>
                    </div>

                    <div className="submission-lock-body">
                      <p>
                        Para evitar transmissões acidentais, digite exatamente a palavra de confirmação <code>ENVIAR_FENIX</code> no campo abaixo:
                      </p>

                      <div className="submission-form-row">
                        <div className="lock-input-wrap">
                          {confirmKey === 'ENVIAR_FENIX' ? <Unlock size={18} className="text-green" /> : <Lock size={18} className="text-muted" />}
                          <input
                            type="text"
                            className="input-text lock-input"
                            placeholder="Digite ENVIAR_FENIX para destravar"
                            value={confirmKey}
                            onChange={(e) => setConfirmKey(e.target.value)}
                          />
                        </div>

                        <button
                          type="button"
                          className="button button-danger button-submit-fenix"
                          disabled={confirmKey !== 'ENVIAR_FENIX' || submitting || !localValidation.valid}
                          onClick={() => void handleSubmitFenix()}
                        >
                          {submitting ? (
                            <>
                              <LoaderCircle size={16} className="spin" /> Transmitindo ao CBMBA...
                            </>
                          ) : (
                            <>
                              <Send size={16} /> Enviar para o Fênix Real
                            </>
                          )}
                        </button>
                      </div>

                      {submissionResult && (
                        <div className={`submission-result-box ${submissionResult.ok ? 'success' : 'error'} mt-3`}>
                          {submissionResult.ok ? (
                            <>
                              <CheckCircle2 size={24} className="text-green" />
                              <div>
                                <b>🎉 Projeto Técnico Transmitido com Sucesso ao CBMBA!</b>
                                <p>Registro concluído no banco de dados do Fênix.</p>
                                <pre className="json-code mt-1">{JSON.stringify(submissionResult.data, null, 2)}</pre>
                              </div>
                            </>
                          ) : (
                            <>
                              <CircleAlert size={24} className="text-red" />
                              <div>
                                <b>Erro na Transmissão:</b>
                                <p>{submissionResult.error}</p>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
    </>
  );

  // Rodapé do Editor com Navegação de Passos
  const footerItems = (
    <>
      <div className="footer-left">
        {step > 1 ? (
          <button
            type="button"
            className="button button-outline"
            onClick={() => setStep((prev) => (prev - 1) as 1 | 2 | 3)}
          >
            <ArrowLeft size={15} /> Voltar para Etapa {step - 1}
          </button>
        ) : (
          <button
            type="button"
            className="button button-outline"
            onClick={() => setView('list')}
          >
            <ArrowLeft size={15} /> Ver Rascunhos
          </button>
        )}
      </div>

      <div className="footer-center">
        <span className="draft-save-indicator">
          {saving ? <LoaderCircle size={13} className="spin" /> : <Save size={13} />}
          {saving ? 'Salvando...' : currentDraft ? `Salvo às ${new Date(currentDraft.updatedAt).toLocaleTimeString('pt-BR')}` : 'Rascunho não persistido'}
        </span>
      </div>

      <div className="footer-right">
        {step < 3 ? (
          <button
            type="button"
            className="button button-teal"
            onClick={() => {
              void handleSaveDraft(true);
              setStep((prev) => (prev + 1) as 1 | 2 | 3);
            }}
          >
            Avançar para Etapa {step + 1} <ArrowRight size={15} />
          </button>
        ) : (
          <button
            type="button"
            className="button button-teal"
            onClick={() => void handleSaveDraft()}
            disabled={saving}
          >
            <Save size={15} /> Salvar Rascunho Final
          </button>
        )}
      </div>
    </>
  );

  // MODO PÁGINA NATIVA (Dentro do Shell do Fênix Painel, sem caixotão branco)
  if (isPage) {
    return (
      <div className="register-page-view">
        {/* Cabeçalho nativo da página Fênix Painel */}
        <div className="page-heading">
          <div>
            <span className="section-kicker">CADASTRO DE EDIFICAÇÃO E PROJETO TÉCNICO</span>
            <h1>{view === 'list' ? 'Cadastrar no Fênix' : (formData.name || 'Novo Cadastro no Fênix')}</h1>
            <p>
              {view === 'list'
                ? 'Prepare rascunhos locais, consulte o enquadramento IT-14 por CNPJ e valide tudo antes de enviar ao Corpo de Bombeiros.'
                : `Etapa ${step} de 3 · ${step === 1 ? 'Edificação e Endereço' : step === 2 ? 'Projeto Técnico, Ocupação e Medidas' : 'Revisão Final e Envio ao Fênix'}`}
            </p>
          </div>
          <div className="page-heading-actions">
            <button
              type="button"
              className={`button button-horizon-ai ${copilotOpen ? 'active' : ''}`}
              onClick={toggleCopilot}
              title="Abrir o Copiloto IA na lateral direita"
            >
              <Sparkles size={15} /> ✦ Copiloto IA
            </button>
            {view === 'list' ? (
              <>
                <button type="button" className="button button-outline val-sat-button" onClick={() => void handleLoadValSatSample()}>
                  <Zap size={15} className="text-amber" /> Carregar Exemplo (VAL SAT)
                </button>
                <button type="button" className="button button-teal" onClick={handleNewDraft}>
                  <Plus size={15} /> Novo Cadastro
                </button>
              </>
            ) : (
              <>
                <button type="button" className="button button-outline" onClick={() => setView('list')}>
                  <ArrowLeft size={15} /> Meus Rascunhos ({drafts.length})
                </button>
                <button type="button" className="button button-outline val-sat-button" onClick={() => void handleLoadValSatSample()}>
                  <Zap size={15} className="text-amber" /> Exemplo (VAL SAT)
                </button>
                <button type="button" className="button button-teal" onClick={() => void handleSaveDraft()} disabled={saving}>
                  {saving ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />} Salvar Rascunho
                </button>
              </>
            )}
          </div>
        </div>

        {/* Notificações em Toast */}
        {toast && (
          <div className={`draft-toast toast-${toast.type}`} role="alert">
            {toast.type === 'success' ? <CheckCircle2 size={16} /> : toast.type === 'error' ? <CircleAlert size={16} /> : <Info size={16} />}
            <span>{toast.message}</span>
          </div>
        )}

        {/* VIEW 1: LISTA DE RASCUNHOS NATIVA */}
        {view === 'list' && (
          <>
            {draftsLoading ? (
              <div className="draft-list-empty">
                <div className="ai-thinking-pill">
                  <LoaderCircle size={18} className="spin text-teal" />
                  <span className="text-rainbow-shimmer">Carregando rascunhos locais e sincronizações...</span>
                </div>
              </div>
            ) : drafts.length === 0 ? (
              <div className="draft-list-empty">
                <ClipboardList size={40} className="text-muted" />
                <h4>Nenhum rascunho salvo ainda</h4>
                <p>Inicie um novo projeto ou carregue o gabarito oficial do caso real VAL SAT para conhecer o fluxo completo.</p>
                <div className="empty-actions">
                  <button type="button" className="button button-outline" onClick={() => void handleLoadValSatSample()}>
                    <Zap size={15} /> Carregar Exemplo Gabarito (VAL SAT)
                  </button>
                  <button type="button" className="button button-teal" onClick={handleNewDraft}>
                    <Plus size={15} /> Iniciar Novo Rascunho
                  </button>
                </div>
              </div>
            ) : (
              draftsCardsGrid
            )}
          </>
        )}

        {/* VIEW 2: EDITOR COM STEPPER NATIVO (Rolagem natural da janela) */}
        {view === 'editor' && (
          <div className="draft-page-editor">
            <nav className="draft-stepper draft-page-stepper" aria-label="Etapas de Cadastro">
              {stepperItems}
            </nav>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: '16px', alignItems: 'start' }}>
              <div style={{ minWidth: 0 }}>
                {renderStepPanels()}
              </div>
              <DraftSectionAnchorRail step={step} edificacaoMode={formData.edificacao_mode} />
            </div>
            <footer className="draft-editor-footer draft-page-footer">
              {footerItems}
            </footer>
          </div>
        )}
      </div>
    );
  }

  // MODO MODAL CLÁSSICO (Fallback para backdrop)
  return (
    <div className="fenix-modal-backdrop">
      <section className="project-draft-modal" role="dialog" aria-modal="true" aria-labelledby="draft-modal-title">
        <header className="project-draft-header">
          <div className="header-left">
            <span className="brand-badge"><Flame size={18} strokeWidth={2.5} /> CBMBA Fênix</span>
            <div>
              <h2 id="draft-modal-title">
                {view === 'list' ? 'Rascunhos de Cadastro e Projetos' : formData.name || 'Editor de Projeto Técnico'}
              </h2>
              <p>
                {view === 'list'
                  ? 'Gerencie rascunhos locais com validação prévia e transmissão segura para o Corpo de Bombeiros.'
                  : `Etapa ${step} de 3 · ${step === 1 ? 'Edificação & Endereço' : step === 2 ? 'Projeto Técnico & Enquadramento' : 'Validação, Revisão & Envio'}`}
              </p>
            </div>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className={`button button-horizon-ai button-xs ${copilotOpen ? 'active' : ''}`}
              onClick={toggleCopilot}
              title="Abrir o Copiloto IA especializado no CBMBA"
            >
              <Sparkles size={14} /> ✦ Copiloto IA
            </button>
            {view === 'editor' && (
              <>
                <button
                  type="button"
                  className="button button-outline button-sm"
                  onClick={() => setView('list')}
                  disabled={saving || submitting}
                  title="Voltar para a lista de rascunhos"
                >
                  <ArrowLeft size={14} /> Lista de Rascunhos
                </button>
                <button
                  type="button"
                  className="button button-teal button-sm"
                  onClick={() => void handleSaveDraft()}
                  disabled={saving || submitting}
                >
                  {saving ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />} Salvar Rascunho
                </button>
              </>
            )}
            <button
              type="button"
              className="icon-button"
              aria-label="Fechar"
              onClick={onClose}
              disabled={saving || submitting}
              title="Fechar"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {toast && (
          <div className={`draft-toast toast-${toast.type}`} role="alert">
            {toast.type === 'success' ? <CheckCircle2 size={16} /> : toast.type === 'error' ? <CircleAlert size={16} /> : <Info size={16} />}
            <span>{toast.message}</span>
          </div>
        )}

        {copilotOpen && copilotPanel}

        {view === 'list' && (
          <div className="draft-list-view">
            <div className="draft-list-toolbar">
              <div className="toolbar-intro">
                <span className="section-kicker">CADASTRO DE EDIFICAÇÃO & PROJETO TÉCNICO</span>
                <h3>Meus Rascunhos Locais</h3>
                <p>Prepare os dados com tranquilidade, confira as regras do CBMBA e simule sem riscos antes de protocolar.</p>
              </div>
              <div className="toolbar-buttons">
                <button
                  type="button"
                  className="button button-outline val-sat-button"
                  onClick={() => void handleLoadValSatSample()}
                >
                  <Zap size={16} className="text-amber" /> Carregar Exemplo Gabarito (VAL SAT)
                </button>
                <button
                  type="button"
                  className="button button-teal"
                  onClick={handleNewDraft}
                >
                  <Plus size={16} /> Novo Rascunho
                </button>
              </div>
            </div>
            {draftsLoading ? (
              <div className="draft-list-empty">
                <LoaderCircle size={28} className="spin text-teal" />
                <p>Carregando rascunhos...</p>
              </div>
            ) : drafts.length === 0 ? (
              <div className="draft-list-empty">
                <ClipboardList size={40} className="text-muted" />
                <h4>Nenhum rascunho salvo ainda</h4>
                <p>Inicie um novo projeto ou carregue o gabarito oficial do caso real VAL SAT para conhecer o fluxo completo.</p>
                <div className="empty-actions">
                  <button type="button" className="button button-outline" onClick={() => void handleLoadValSatSample()}>
                    <Zap size={15} /> Carregar Exemplo Gabarito (VAL SAT)
                  </button>
                  <button type="button" className="button button-teal" onClick={handleNewDraft}>
                    <Plus size={15} /> Iniciar Novo Rascunho
                  </button>
                </div>
              </div>
            ) : (
              draftsCardsGrid
            )}
          </div>
        )}

        {view === 'editor' && (
          <div className="draft-editor-view">
            <nav className="draft-stepper" aria-label="Etapas de Cadastro">
              {stepperItems}
            </nav>
            <div className="editor-body-scroll">
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: '16px', alignItems: 'start' }}>
              <div style={{ minWidth: 0 }}>
                {renderStepPanels()}
              </div>
              <DraftSectionAnchorRail step={step} edificacaoMode={formData.edificacao_mode} />
            </div>
            </div>
            <footer className="draft-editor-footer">
              {footerItems}
            </footer>
          </div>
        )}
      </section>
    </div>
  );
}

export class ProjectDraftErrorBoundary extends Component<
  { children?: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children?: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ProjectDraftErrorBoundary capturou um erro:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="draft-error-boundary-card"
          style={{
            padding: '2.5rem 1.5rem',
            maxWidth: '560px',
            margin: '3rem auto',
            textAlign: 'center',
            background: 'var(--color-bg-surface, #ffffff)',
            borderRadius: '16px',
            border: '1px solid var(--color-border, #e5e7eb)',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem'
            }}
          >
            <AlertTriangle size={28} />
          </div>
          <h3
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: 'var(--color-text-main, #111827)',
              marginBottom: '0.5rem'
            }}
          >
            Erro ao carregar o projeto
          </h3>
          <p
            style={{
              color: 'var(--color-text-muted, #4b5563)',
              fontSize: '0.925rem',
              lineHeight: 1.5,
              marginBottom: '1.75rem'
            }}
          >
            Ocorreu uma falha inesperada durante a exibição deste rascunho. O painel foi protegido contra tela branca.
            {this.state.error?.message ? (
              <span style={{ display: 'block', marginTop: '0.5rem', fontSize: '0.8rem', color: '#9ca3af', fontFamily: 'monospace' }}>
                {this.state.error.message}
              </span>
            ) : null}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
            <button
              type="button"
              className="button button-teal"
              onClick={this.handleReset}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <RefreshCw size={15} /> Recarregar Rascunhos
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function ProjectDraftModal(props: ProjectDraftModalProps) {
  return (
    <ProjectDraftErrorBoundary>
      <ProjectDraftModalContent {...props} />
    </ProjectDraftErrorBoundary>
  );
}

export const ProjectDraftPage = ProjectDraftModal;
export default ProjectDraftModal;
export { generateLocalAiAssistantFallback, INITIAL_EMPTY_DRAFT };

