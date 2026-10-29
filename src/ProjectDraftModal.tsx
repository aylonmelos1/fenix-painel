import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
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
  Copy,
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
  Play,
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
    cpf: '',
    name: 'ABA Incêndio - Engenharia e Projetos',
    crea_cau: 'BA20261628773',
    telephone: '(71) 4000-2895',
    email: 'engenharia@abaincendio.com.br'
  },
  responsaveis_tecnicos: [
    {
      tipo_numero: 'CREA',
      crea_cau: 'BA20261628773',
      name: 'ABA Incêndio - Engenharia e Projetos',
      cpf_cnpj: '00000000000',
      phone: '(71) 4000-2895',
      email: 'engenharia@abaincendio.com.br'
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

export const ProjectDraftPage = ProjectDraftModal;

export function ProjectDraftModal({
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
  const [draftsLoading, setDraftsLoading] = useState(false);
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

  // Estados de simulação e envio
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<{
    ok: boolean;
    fenixPayload?: Record<string, unknown>;
    validation?: ValidationResult;
  } | null>(null);
  const [copiedPayload, setCopiedPayload] = useState(false);
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
        const isPts = (next.form_mode || prev.form_mode || 'pts') === 'pts';
        const normalized = normalizeSecurityMeasures(patch.securityMeasures, isPts);
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
      setDrafts(res.drafts || []);
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
    const built = parseFloat(String(formData.edification.building_area).replace(',', '.')) || 0;
    const toBuild = parseFloat(String(formData.edification.area_to_be_built || 0).replace(',', '.')) || 0;
    const discount = parseFloat(String(formData.edification.discount_area || 0).replace(',', '.')) || 0;
    return Math.max(0, +(built + toBuild - discount).toFixed(2));
  }, [formData.edification.building_area, formData.edification.area_to_be_built, formData.edification.discount_area]);

  // Enquadramento automático em tempo real
  const enquadramento = useMemo(() => {
    const totalArea = calculatedTotalArea;
    const floors = Number(formData.edification.number_floors) || 1;
    const rawCnae = cleanDigits(formData.institution.cnae);

    const blockedList = domains?.blockedPtsCnaes || BLOCKED_PTS_CNAES_DEFAULT;
    const isCnaeBlocked = blockedList.includes(rawCnae);

    // Identifica riscos especiais de GLP (> 12.480kg ou Classe V+)
    const glpKg = parseFloat(String(formData.glpData?.total_kg_glp || 0)) || 0;
    const isGlpExceedingPts = glpKg > 12480 || (formData.glpData?.classe_glp && ['Classe V', 'Classe VI', 'Classe VII', 'Classe ESPECIAL'].includes(formData.glpData.classe_glp));

    if (isCnaeBlocked || isGlpExceedingPts) {
      return {
        sigla: 'PT',
        nome: 'Projeto Técnico (Completo)',
        badgeClass: 'badge-pt',
        motivo: isCnaeBlocked
          ? 'CNAE de alto risco com bloqueio mandatório para PTS (exige PT Completo)'
          : 'Armazenamento de GLP acima de 12.480 kg (exige sistemas fixos e PT Completo)',
        suggestedCategory: 'pt' as const,
        suggestedLicense: 'AVCB' as const,
        suggestedFormMode: 'pt' as const,
        suggestedTipoProjetoId: 1,
        isPts: false
      };
    }

    if (totalArea <= 200 && floors === 1) {
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
      nome: 'Projeto Técnico (Completo)',
      badgeClass: 'badge-pt',
      motivo: totalArea > 750 ? `Área total de ${totalArea.toLocaleString('pt-BR')} m² supera o limite de 750 m²` : `Nº de pavimentos (${floors}) superior a 3`,
      suggestedCategory: 'pt' as const,
      suggestedLicense: 'AVCB' as const,
      suggestedFormMode: 'pt' as const,
      suggestedTipoProjetoId: 1,
      isPts: false
    };
  }, [calculatedTotalArea, formData.edification.number_floors, formData.institution.cnae, formData.license_type, formData.tipo_projeto_id, formData.glpData, domains]);

  // Lista de erros e validações locais do rascunho
  const localValidation = useMemo(() => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Etapa 1: Edificação e Endereço
    if (!formData.edification.reference_name.trim()) {
      errors.push('Etapa 1: Nome de referência da edificação é obrigatório.');
    }
    if (!formData.edification.height) {
      errors.push('Etapa 1: Altura da edificação é obrigatória.');
    }
    if (formData.edification.height === 'Térrea = Um pavimento' && Number(formData.edification.number_floors) !== 1) {
      errors.push('Etapa 1: Quando a altura for "Térrea", o número de pavimentos deve ser exatamente 1.');
    }
    if (calculatedTotalArea <= 0) {
      errors.push('Etapa 1: A área total construída deve ser maior que zero.');
    }
    if (cleanDigits(formData.address.zip_code).length !== 8) {
      errors.push('Etapa 1: CEP deve conter 8 dígitos.');
    }
    if (!formData.address.public_place.trim()) {
      errors.push('Etapa 1: Logradouro é obrigatório.');
    }
    if (!formData.address.number.trim()) {
      errors.push('Etapa 1: Número predial é obrigatório (use "S/N" caso não exista).');
    }
    if (!formData.address.district.trim()) {
      errors.push('Etapa 1: Bairro é obrigatório.');
    }
    if (!formData.address.municipio_id) {
      errors.push('Etapa 1: Município deve ser selecionado na lista oficial do CBMBA.');
    }

    // Etapa 2: Projeto e Enquadramento
    const rawCnpjCpf = cleanDigits(formData.institution.cnpj_cpf);
    if (!rawCnpjCpf || (rawCnpjCpf.length !== 11 && rawCnpjCpf.length !== 14)) {
      errors.push('Etapa 2: CNPJ ou CPF do estabelecimento é obrigatório e deve ter 11 ou 14 dígitos.');
    }
    if (!formData.institution.razao_social.trim()) {
      errors.push('Etapa 2: Razão Social do estabelecimento é obrigatória.');
    }
    if (!cleanDigits(formData.institution.cnae)) {
      errors.push('Etapa 2: Código CNAE é obrigatório.');
    }
    if (!formData.occupation.occupation_group_id || !formData.occupation.division_group_id) {
      errors.push('Etapa 2: Grupo e Divisão de ocupação IT 14 são obrigatórios.');
    }
    if (!formData.proprietario.nome_proprietario.trim()) {
      errors.push('Etapa 2: Nome do proprietário é obrigatório.');
    }
    if (!cleanDigits(formData.proprietario.cpf_cnpj_prop)) {
      errors.push('Etapa 2: CPF/CNPJ do proprietário é obrigatório.');
    }
    if (!formData.proprietario.email_proprietario.trim() || !formData.proprietario.email_proprietario.includes('@')) {
      errors.push('Etapa 2: E-mail de contato do proprietário é obrigatório.');
    }
    const isPtsClcb1SaidaDireta = formData.tipo_projeto_id === 4 && formData.questionario?.edf_saida_direta !== false;
    if (!isPtsClcb1SaidaDireta && !formData.n_art_rrt?.trim()) {
      warnings.push('Etapa 2: Número de ART/RRT não informado. Será obrigatório para este tipo de projeto técnico antes do protocolo oficial.');
    }

    if ([2, 3, 7, 8].includes(formData.tipo_projeto_id || 0)) {
      if (!formData.data_inicio || !formData.data_fim) {
        errors.push('Etapa 2: Datas de início e término são obrigatórias para ocupações temporárias.');
      }
    }

    // Alertas de coerência
    if (enquadramento.sigla === 'PT' && (formData.form_mode || formData.process_category) === 'pts') {
      warnings.push('Atenção: Os dados informados excedem os limites de PTS; o CBMBA exige formulário de Projeto Técnico Completo.');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }, [formData, calculatedTotalArea, enquadramento]);

  // Modo de formulário atual derivado (PTS ou PT Completo)
  const currentFormMode: 'pts' | 'pt' = formData.form_mode || enquadramento.suggestedFormMode || 'pts';

  // Alternador dos 2 formulários oficiais Fênix CBMBA
  const handleSwitchFormMode = (mode: 'pts' | 'pt') => {
    setFormData((prev) => {
      let nextTipo = prev.tipo_projeto_id;
      if (mode === 'pts') {
        if (!nextTipo || ![4, 5, 6, 7, 8].includes(nextTipo)) {
          nextTipo = enquadramento.suggestedLicense === 'CLCB' ? 4 : 6;
        }
      } else {
        if (!nextTipo || ![1, 2, 3].includes(nextTipo)) {
          nextTipo = 1;
        }
      }
      return {
        ...prev,
        form_mode: mode,
        process_category: mode,
        tipo_projeto_id: nextTipo,
        securityMeasures: normalizeSecurityMeasures(prev.securityMeasures, mode === 'pts')
      };
    });
    showToast(`Formulário alternado para ${mode === 'pts' ? 'Projeto Técnico Simplificado (PTS)' : 'Projeto Técnico Completo (PT)'}.`, 'info');
  };

  // Ações de criação, carga de gabarito e seleção de rascunhos
  const handleNewDraft = () => {
    setCurrentDraft(null);
    setFormData({
      ...INITIAL_EMPTY_DRAFT,
      id: crypto.randomUUID(),
      name: `Rascunho ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    });
    setSimulationResult(null);
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
    setSimulationResult(null);
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
    const loadedData: ProjectDraftInput = {
      ...draft.data,
      id: draft.id,
      name: draft.name
    };
    if (!loadedData.form_mode) {
      loadedData.form_mode = (loadedData.process_category === 'pt' || (loadedData.tipo_projeto_id && loadedData.tipo_projeto_id <= 3)) ? 'pt' : 'pts';
    }
    if (!loadedData.tipo_projeto_id) {
      loadedData.tipo_projeto_id = loadedData.form_mode === 'pt' ? 1 : 5;
    }
    setFormData(loadedData);
    if (draft.lastSimulation) {
      setSimulationResult({
        ok: draft.lastSimulation.ok,
        fenixPayload: draft.lastSimulation.fenixPayload,
        validation: draft.lastSimulation.validation
      });
    } else {
      setSimulationResult(null);
    }
    setSubmissionResult(draft.lastSubmission ? { ok: draft.lastSubmission.ok, data: draft.lastSubmission.result, error: draft.lastSubmission.error } : null);
    setConfirmKey('');
    setStep(1);
    setView('editor');
  };

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
      const activeFormMode = formData.form_mode || enquadramento.suggestedFormMode || 'pts';
      const activeTipoProjetoId = formData.tipo_projeto_id || enquadramento.suggestedTipoProjetoId || (activeFormMode === 'pt' ? 1 : 5);
      const targetType = OFFICIAL_PROJECT_TYPES.find((t) => t.id === activeTipoProjetoId);

      const payload: ProjectDraftInput = {
        ...formData,
        id: currentDraft?.id || formData.id || crypto.randomUUID(),
        form_mode: activeFormMode,
        tipo_projeto_id: activeTipoProjetoId,
        process_category: targetType?.category || (activeFormMode === 'pt' ? 'pt' : 'pts'),
        license_type: targetType?.license || (activeFormMode === 'pt' ? 'AVCB' : 'CLCB'),
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
        const isPts = activeFormMode === 'pts';

        const nextMeasures = {
          ...prev.securityMeasures,
          ...normalizeSecurityMeasures(res.it14.mappedMeasures, isPts)
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
    const isPts = (formData.form_mode || enquadramento.suggestedFormMode || 'pts') === 'pts';
    const isBig = calculatedTotalArea > 750 || !isPts;

    const baseMeasures: Record<string, number> = {
      extintores: 1,
      iluminacao_emerg: 1,
      sinal_emerg: 1,
      saidas_emerg: 1,
      brigada_incendio: calculatedTotalArea > 200 || !isPts ? 1 : 0,
      control_mat_acab: 1
    };

    if (!isPts) {
      baseMeasures.hidrante_mangot = isBig ? 1 : 0;
      baseMeasures.alarme_incendio = isBig ? 1 : 0;
      baseMeasures.deteccao_incendio = calculatedTotalArea > 1200 ? 1 : 0;
      baseMeasures.acesso_viatura = 1;
      baseMeasures.seguranca_estrutural = 1;
      baseMeasures.plano_emerg_incendio = isBig ? 1 : 0;
      baseMeasures.sis_prot_cont_desc_elet = calculatedTotalArea > 750 ? 1 : 0;
      baseMeasures.comp_horizontal = 0;
      baseMeasures.comp_vertical = 0;
      baseMeasures.separacao_edific = 0;
      baseMeasures.resfriamento = 0;
      baseMeasures.chuveiros_auto = 0;
      baseMeasures.elevador_emerg = 0;
      baseMeasures.control_fumaca = 0;
      baseMeasures.espuma = 0;
      baseMeasures.sis_fixo_gases = 0;
    }

    setFormData((prev) => ({
      ...prev,
      securityMeasures: normalizeSecurityMeasures(baseMeasures, isPts)
    }));
    showToast(`Medidas oficiais Fênix CBMBA ajustadas para ${isPts ? 'PTS (6 básicas)' : 'PT (22 medidas)'}.`, 'success');
  };

  // Simular Dry-Run
  const handleSimulate = async () => {
    // Primeiro salva o rascunho
    const saved = await handleSaveDraft(true);
    const draftId = saved?.id || currentDraft?.id || formData.id;
    if (!draftId) {
      showToast('Salve o rascunho antes de simular.', 'error');
      return;
    }

    setSimulating(true);
    setSimulationResult(null);
    try {
      const res = await api<{
        ok: boolean;
        draft: DraftRecord;
        validation: ValidationResult;
        fenixPayload: Record<string, unknown>;
      }>(`/api/drafts/${encodeURIComponent(draftId)}/simulate`, {
        method: 'POST'
      });

      setSimulationResult({
        ok: res.ok,
        validation: res.validation,
        fenixPayload: res.fenixPayload
      });
      setCurrentDraft(res.draft);
      showToast(res.ok ? 'Simulação Dry-Run concluída com sucesso!' : 'Simulação concluída com pendências.', res.ok ? 'success' : 'info');
      void fetchDrafts();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Falha ao executar simulação.', 'error');
    } finally {
      setSimulating(false);
    }
  };

  // Copiar Payload JSON
  const handleCopyPayload = () => {
    if (!simulationResult?.fenixPayload) return;
    const jsonStr = JSON.stringify(simulationResult.fenixPayload, null, 2);
    void navigator.clipboard.writeText(jsonStr);
    setCopiedPayload(true);
    window.setTimeout(() => setCopiedPayload(false), 3000);
    showToast('JSON do Payload copiado para a área de transferência!', 'success');
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
        const patch = aiResult.formPatch;
        const modifiedKeys = new Set<string>();

        setFormData((prev) => {
          const next = { ...prev };
          if (patch.name) {
            next.name = patch.name;
            modifiedKeys.add('name');
          }
          if (patch.edification) {
            next.edification = { ...next.edification, ...patch.edification };
            modifiedKeys.add('edification');
          }
          if (patch.address) {
            next.address = { ...next.address, ...patch.address };
            modifiedKeys.add('address');
          }
          if (patch.occupation) {
            next.occupation = { ...next.occupation, ...patch.occupation };
            modifiedKeys.add('occupation');
          }
          if (patch.responsavel) {
            next.responsavel = { ...next.responsavel, ...patch.responsavel };
            modifiedKeys.add('responsavel');
          }
          if (patch.securityMeasures) {
            const nextMeasures = { ...next.securityMeasures };
            Object.entries(patch.securityMeasures).forEach(([k, v]) => {
              nextMeasures[k] = v ? 1 : 0;
            });
            next.securityMeasures = nextMeasures;
            modifiedKeys.add('measures');
          }
          return next;
        });

        if (patch.step && (patch.step === 1 || patch.step === 2 || patch.step === 3)) {
          setStep(patch.step);
        }

        // Aciona animação de flash nos campos alterados por 2.5s
        setFieldFlashKeys(modifiedKeys);
        setTimeout(() => setFieldFlashKeys(new Set()), 2600);
        showToast('Modificações sugeridas pela IA aplicadas ao formulário!', 'success');
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
                <h4>{draft.name || draft.data.edification.reference_name || 'Rascunho sem nome'}</h4>
                <span className="draft-date">Atualizado em {new Date(draft.updatedAt).toLocaleString('pt-BR')}</span>
              </div>
              <span className={`status-badge status-${isSub ? 'submitted' : isSim ? 'simulated' : 'draft'}`}>
                {isSub ? 'Enviado ao Fênix' : isSim ? 'Simulado (Dry-Run)' : 'Rascunho'}
              </span>
            </div>

            <div className="draft-card-body">
              <div className="draft-info-row">
                <span>Edificação:</span>
                <strong>{draft.data.edification.reference_name || '—'}</strong>
              </div>
              <div className="draft-info-row">
                <span>Município:</span>
                <strong>{draft.data.address.county || '—'}/BA</strong>
              </div>
              <div className="draft-info-row">
                <span>Área total:</span>
                <strong>{draft.data.edification.building_area ? `${draft.data.edification.building_area} m²` : '—'}</strong>
              </div>
              <div className="draft-info-row">
                <span>Enquadramento:</span>
                <span className="badge-tag">{draft.data.process_category?.toUpperCase() || 'PTS'}</span>
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

  // Stepper Visual
  const stepperItems = (
    <>
      <button
        type="button"
        className={`step-item ${step === 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}
        onClick={() => setStep(1)}
      >
        <span className="step-circle">{step > 1 ? <Check size={14} /> : '1'}</span>
        <span className="step-label">
          <strong>Edificação & Endereço</strong>
          <small>Localização física e estrutura</small>
        </span>
      </button>

      <div className="step-divider" />

      <button
        type="button"
        className={`step-item ${step === 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}
        onClick={() => setStep(2)}
      >
        <span className="step-circle">{step > 2 ? <Check size={14} /> : '2'}</span>
        <span className="step-label">
          <strong>Projeto & Enquadramento</strong>
          <small>CNAE, IT 14 e Medidas</small>
        </span>
      </button>

      <div className="step-divider" />

      <button
        type="button"
        className={`step-item ${step === 3 ? 'active' : ''}`}
        onClick={() => setStep(3)}
      >
        <span className="step-circle">3</span>
        <span className="step-label">
          <strong>Validação & Envio</strong>
          <small>Dry-Run e Transmissão</small>
        </span>
      </button>
    </>
  );

  // Conteúdo dos Steps de Formulário
  const renderStepPanels = () => (
    <>
      {/* SELETOR DOS 2 FORMULÁRIOS OFICIAIS DO FÊNIX CBMBA */}
      <div className="fenix-official-selector-wrap animate-fade-in" style={{ marginBottom: '1.25rem' }}>
        <div className="fenix-selector-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div className="fenix-selector-title">
            <span className="section-kicker" style={{ display: 'block', fontSize: '0.72rem', letterSpacing: '0.08em', color: 'var(--color-primary, #0ea5e9)', fontWeight: 700, textTransform: 'uppercase' }}>
              Cartões Oficiais de Entrada do Fênix CBMBA
            </span>
            <h4 style={{ margin: '0.2rem 0 0', fontSize: '1.05rem', fontWeight: 700 }}>Selecione o Tipo de Cadastro Oficial</h4>
          </div>
          <span className="badge-tag tag-purple" style={{ padding: '0.25rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600 }}>
            Paridade 1:1 com Fênix Oficial
          </span>
        </div>

        <div className="fenix-form-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '0.9rem' }}>
          {/* Cartão 1: PT Completo */}
          <div
            className={`fenix-form-card ${currentFormMode === 'pt' ? 'selected' : ''}`}
            onClick={() => handleSwitchFormMode('pt')}
            role="button"
            tabIndex={0}
            style={{
              padding: '1rem',
              borderRadius: '12px',
              border: currentFormMode === 'pt' ? '2px solid var(--color-primary, #0ea5e9)' : '1px solid var(--border-color, rgba(255,255,255,0.1))',
              background: currentFormMode === 'pt' ? 'rgba(14, 165, 233, 0.08)' : 'var(--bg-card, rgba(255,255,255,0.03))',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: currentFormMode === 'pt' ? '0 0 16px rgba(14, 165, 233, 0.2)' : 'none'
            }}
          >
            <div className="fenix-card-badge-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span className="fenix-card-code" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase' }}>
                Cartão 1 · PT Completo
              </span>
              {currentFormMode === 'pt' && (
                <span className="fenix-card-active-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 700, background: '#0ea5e9', color: '#fff', padding: '2px 8px', borderRadius: '999px' }}>
                  <Check size={12} /> Ativo
                </span>
              )}
            </div>
            <h5 style={{ margin: '0 0 0.4rem', fontSize: '0.95rem', fontWeight: 700 }}>Cadastrar Projeto Téc. Completo</h5>
            <p style={{ margin: '0 0 0.6rem', fontSize: '0.8rem', opacity: 0.82, lineHeight: 1.45 }}>
              Para edificações acima de 750 m², com mais de 3 pavimentos, riscos especiais elevados, sistemas hidráulicos ou eventos temporários de grande porte.
            </p>
            <div className="fenix-card-types-list" style={{ fontSize: '0.72rem', opacity: 0.75, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.5rem' }}>
              <span>Opções no Fênix: </span>
              <code style={{ background: 'rgba(0,0,0,0.25)', padding: '1px 5px', borderRadius: '4px' }}>PT (1)</code> · <code style={{ background: 'rgba(0,0,0,0.25)', padding: '1px 5px', borderRadius: '4px' }}>PTIOT (2)</code> · <code style={{ background: 'rgba(0,0,0,0.25)', padding: '1px 5px', borderRadius: '4px' }}>PTOTEP (3)</code>
            </div>
          </div>

          {/* Cartão 2: PTS Simplificado */}
          <div
            className={`fenix-form-card ${currentFormMode === 'pts' ? 'selected' : ''}`}
            onClick={() => handleSwitchFormMode('pts')}
            role="button"
            tabIndex={0}
            style={{
              padding: '1rem',
              borderRadius: '12px',
              border: currentFormMode === 'pts' ? '2px solid var(--color-teal, #14b8a6)' : '1px solid var(--border-color, rgba(255,255,255,0.1))',
              background: currentFormMode === 'pts' ? 'rgba(20, 184, 166, 0.08)' : 'var(--bg-card, rgba(255,255,255,0.03))',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: currentFormMode === 'pts' ? '0 0 16px rgba(20, 184, 166, 0.2)' : 'none'
            }}
          >
            <div className="fenix-card-badge-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span className="fenix-card-code" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#2dd4bf', textTransform: 'uppercase' }}>
                Cartão 2 · PTS Simplificado
              </span>
              {currentFormMode === 'pts' && (
                <span className="fenix-card-active-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 700, background: '#14b8a6', color: '#fff', padding: '2px 8px', borderRadius: '999px' }}>
                  <Check size={12} /> Ativo
                </span>
              )}
            </div>
            <h5 style={{ margin: '0 0 0.4rem', fontSize: '0.95rem', fontWeight: 700 }}>Cadastrar Projeto Téc. Simplificado</h5>
            <p style={{ margin: '0 0 0.6rem', fontSize: '0.8rem', opacity: 0.82, lineHeight: 1.45 }}>
              Para edificações até 750 m² e no máximo 3 pavimentos (altura ≤ 12m), sem riscos complexos. Emite CLCB (dispensa de vistoria prévia) ou AVCB simplificado.
            </p>
            <div className="fenix-card-types-list" style={{ fontSize: '0.72rem', opacity: 0.75, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.5rem' }}>
              <span>Opções no Fênix: </span>
              <code style={{ background: 'rgba(0,0,0,0.25)', padding: '1px 5px', borderRadius: '4px' }}>PTSCLCB1 (4)</code> · <code style={{ background: 'rgba(0,0,0,0.25)', padding: '1px 5px', borderRadius: '4px' }}>PTSCLCB2 (5)</code> · <code style={{ background: 'rgba(0,0,0,0.25)', padding: '1px 5px', borderRadius: '4px' }}>PTSAVCB (6)</code>
            </div>
          </div>
        </div>

        {/* Alertas de Migração e Bloqueios Oficiais CBMBA */}
        {currentFormMode === 'pts' && (calculatedTotalArea > 750 || Number(formData.edification.number_floors) > 3 || (formData.specialRisks?.gas_liquefeito_petroleo && Number(formData.glpData?.total_kg_glp) > 12480)) && (
          <div className="fenix-migration-alert alert-warning animate-fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginTop: '0.75rem', padding: '0.75rem 1rem', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <AlertTriangle size={20} className="text-amber" />
              <div style={{ fontSize: '0.82rem', lineHeight: 1.4 }}>
                <strong>Atenção: A edificação excede os limites de Projeto Técnico Simplificado (PTS)!</strong>
                <div>
                  Área ({calculatedTotalArea} m² {calculatedTotalArea > 750 ? '> 750 m²' : ''})
                  {Number(formData.edification.number_floors) > 3 ? ' ou Pavimentos (> 3 pavimentos)' : ''}
                  {formData.specialRisks?.gas_liquefeito_petroleo && Number(formData.glpData?.total_kg_glp) > 12480 ? ' ou GLP (> 12.480 kg)' : ''}. O CBMBA bloqueará a homologação em PTS.
                </div>
              </div>
            </div>
            <button
              type="button"
              className="button button-outline button-xs"
              style={{ whiteSpace: 'nowrap', borderColor: '#f59e0b', color: '#f59e0b' }}
              onClick={() => handleSwitchFormMode('pt')}
            >
              <ArrowRight size={13} /> Migrar para PT Completo
            </button>
          </div>
        )}

        {currentFormMode === 'pt' && calculatedTotalArea > 0 && calculatedTotalArea <= 750 && Number(formData.edification.number_floors) <= 3 && (!formData.specialRisks?.gas_liquefeito_petroleo || Number(formData.glpData?.total_kg_glp) <= 12480) && formData.tipo_projeto_id === 1 && (
          <div className="fenix-migration-alert alert-info animate-fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginTop: '0.75rem', padding: '0.75rem 1rem', borderRadius: '10px', background: 'rgba(14, 165, 233, 0.12)', border: '1px solid rgba(14, 165, 233, 0.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Info size={20} className="text-teal" />
              <div style={{ fontSize: '0.82rem', lineHeight: 1.4 }}>
                <strong>Aviso de Bloqueio Cadastral CBMBA (bloqueioCadastroPTSviaCardPT):</strong>
                <div>
                  Edificação possui ≤ 750 m² e até 3 pavimentos. O Fênix impede protocolar imóveis desse porte pelo cartão de Projeto Técnico Completo permanente.
                </div>
              </div>
            </div>
            <button
              type="button"
              className="button button-outline button-xs"
              style={{ whiteSpace: 'nowrap', borderColor: '#0ea5e9', color: '#0ea5e9' }}
              onClick={() => handleSwitchFormMode('pts')}
            >
              <ArrowRight size={13} /> Alternar para PTS Simplificado
            </button>
          </div>
        )}
      </div>

      {/* ETAPA 1: EDIFICAÇÃO & ENDEREÇO */}
              {step === 1 && (
                <div className="step-panel animate-fade-in">
                  {/* 0. Card de Consulta Rápida por CNPJ + Enquadramento IT-14 */}
                  <div className={`editor-card cnpj-it14-hero-card ${cnpjLoading ? 'ai-shimmer-active ai-border-beam' : ''}`}>
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
                        <span>CNPJ da Edificação / Estabelecimento *</span>
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
                  <div className="step-section-banner">
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
                  <div className="editor-card">
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
                          <span>Complemento (Obrigatório) *</span>
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
                  <div className="editor-card">
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
                    <div className="area-calculation-banner">
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
                  <div className="enquadramento-hero-card">
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

                    {/* Botão de aplicar sugestão se houver divergência com o sugerido pela IT-14 */}
                    {(currentFormMode !== enquadramento.suggestedFormMode || formData.tipo_projeto_id !== enquadramento.suggestedTipoProjetoId) && (
                      <div className="enquadramento-suggest-action animate-fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginTop: '0.9rem', padding: '0.65rem 0.9rem', borderRadius: '8px', background: 'rgba(14, 165, 233, 0.12)', border: '1px solid rgba(14, 165, 233, 0.3)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
                          <Sparkles size={16} className="text-teal" />
                          <span>
                            A IT-14 sugere: <b>{enquadramento.suggestedFormMode.toUpperCase()} ({OFFICIAL_PROJECT_TYPES.find(t => t.id === enquadramento.suggestedTipoProjetoId)?.sigla})</b>.
                            Atual selecionado: <b>{currentFormMode.toUpperCase()} ({OFFICIAL_PROJECT_TYPES.find(t => t.id === formData.tipo_projeto_id)?.sigla || 'Não definido'})</b>.
                          </span>
                        </div>
                        <button
                          type="button"
                          className="button button-outline button-xs"
                          style={{ borderColor: '#0ea5e9', color: '#0ea5e9', whiteSpace: 'nowrap' }}
                          onClick={() => {
                            handleSwitchFormMode(enquadramento.suggestedFormMode);
                            setFormData(prev => ({ ...prev, tipo_projeto_id: enquadramento.suggestedTipoProjetoId }));
                            showToast('Sugestão da IT-14 aplicada ao cadastro!', 'success');
                          }}
                        >
                          <Check size={13} /> Aplicar Sugestão da IT-14
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Bloco de Dados Gerais do Projeto Técnico */}
                  <div className="editor-card">
                    <div className="card-heading">
                      <ClipboardList size={18} className="text-teal" />
                      <h4>Dados Gerais do Projeto Técnico ({currentFormMode === 'pts' ? 'Cartão 2 · PTS' : 'Cartão 1 · PT'})</h4>
                    </div>

                    <div className="form-grid">
                      {/* Tipo Oficial de Projeto Técnico */}
                      <div className="form-col-6">
                        <label className="field-label">
                          <span>Tipo Oficial de Projeto Técnico (Fênix CBMBA) *</span>
                          <select
                            className="input-select"
                            value={formData.tipo_projeto_id || (currentFormMode === 'pts' ? 4 : 1)}
                            onChange={(e) => {
                              const tid = Number(e.target.value);
                              setFormData((prev) => ({
                                ...prev,
                                tipo_projeto_id: tid,
                                license_type: [4, 5].includes(tid) ? 'CLCB' : 'AVCB'
                              }));
                            }}
                          >
                            {OFFICIAL_PROJECT_TYPES.filter((t) => t.form_mode === currentFormMode).map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.id}: {t.sigla} — {t.descricao}
                              </option>
                            ))}
                          </select>
                        </label>
                        <small className="field-hint">Filtrado estritamente pelas opções oficiais do cartão selecionado.</small>
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
                            <span>Nº ART / RRT</span>
                            {formData.tipo_projeto_id === 4 && formData.questionario?.edf_saida_direta !== false ? (
                              <span className="badge-tag tag-green" style={{ fontSize: '0.65rem' }}>Dispensada no PTSCLCB1</span>
                            ) : (
                              <span className="badge-tag tag-amber" style={{ fontSize: '0.65rem' }}>Obrigatória</span>
                            )}
                          </div>
                          <input
                            type="text"
                            className="input-text"
                            maxLength={30}
                            placeholder="Ex: BA20261628773"
                            value={formData.n_art_rrt || ''}
                            onChange={(e) => setFormData((prev) => ({ ...prev, n_art_rrt: e.target.value.toUpperCase() }))}
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
                  <div className="editor-card">
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
                  <div className="editor-card">
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
                        {currentFormMode === 'pts' && Number(formData.qtde_funcionarios || 0) > 100 && (
                          <small className="field-hint text-amber">Atenção: Divisões com &gt; 100 funcionários podem exigir brigada avançada.</small>
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
                  <div className="editor-card">
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

                          {currentFormMode === 'pts' && !formData.questionario?.edf_regularizada_certificado && (
                            <div className="text-danger mt-1" style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <AlertTriangle size={14} /> Atenção Fênix: Estabelecimentos sem saída direta só podem tramitar por PTS se a edificação-mãe possuir certificado válido!
                            </div>
                          )}
                        </div>
                      )}

                      {currentFormMode === 'pts' && (
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
                      )}
                    </div>
                  </div>

                  {/* Bloco de Riscos Especiais & GLP */}
                  <div className="editor-card">
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

                  {/* Bloco de Proprietário e Responsável pelo Uso */}
                  <div className="editor-card">
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
                              <span>CPF / CNPJ do Responsável</span>
                              <input
                                type="text"
                                className="input-text"
                                value={formatCnpjCpf(formData.responsavel.cpf_cnpj_resp)}
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
                              <span>E-mail do Responsável pelo Uso</span>
                              <input
                                type="email"
                                className="input-text"
                                value={formData.responsavel.email_responsavel_uso || ''}
                                onChange={(e) => setFormData((prev) => ({
                                  ...prev,
                                  responsavel: { ...prev.responsavel, email_responsavel_uso: e.target.value }
                                }))}
                              />
                            </label>
                          </div>

                          <div className="form-col-6 animate-fade-in">
                            <label className="field-label">
                              <span>Telefone do Responsável pelo Uso</span>
                              <input
                                type="text"
                                className="input-text"
                                value={formatPhone(formData.responsavel.tel_responsavel_uso)}
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
                  <div className="editor-card">
                    <div className="card-heading flex-between">
                      <div className="flex-row items-center gap-2">
                        <HardHat size={18} className="text-teal" />
                        <h4>Responsável Técnico pelo Projeto (RT / ART / RRT)</h4>
                      </div>
                      {formData.tipo_projeto_id === 4 && formData.questionario?.edf_saida_direta !== false ? (
                        <span className="badge-tag tag-green">Dispensado no PTSCLCB1 com Saída Direta</span>
                      ) : (
                        <span className="badge-tag tag-amber">Obrigatório no CBMBA</span>
                      )}
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
                        {(formData.responsaveis_tecnicos || []).map((rt, idx) => (
                          <div key={idx} className="rt-card-item" style={{ background: 'rgba(255,255,255,0.03)', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '0.75rem' }}>
                            <div className="rt-card-head flex-between" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                              <span className="rt-index-badge" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8' }}>
                                Responsável Técnico #{idx + 1}
                              </span>
                              {(formData.responsaveis_tecnicos || []).length > 1 && (
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
                              )}
                            </div>

                            <div className="form-grid">
                              <div className="form-col-6">
                                <label className="field-label">
                                  <span>Nome Completo do Profissional *</span>
                                  <input
                                    type="text"
                                    className="input-text"
                                    placeholder="Ex: ENG. MARCOS VINICIUS ALMEIDA"
                                    value={rt.nome_tecnico}
                                    onChange={(e) => {
                                      const val = e.target.value.toUpperCase();
                                      setFormData((prev) => {
                                        const list = [...(prev.responsaveis_tecnicos || [])];
                                        list[idx] = { ...list[idx], nome_tecnico: val };
                                        return { ...prev, responsaveis_tecnicos: list };
                                      });
                                    }}
                                  />
                                </label>
                              </div>

                              <div className="form-col-6">
                                <label className="field-label">
                                  <span>CPF / CNPJ do RT *</span>
                                  <input
                                    type="text"
                                    className="input-text"
                                    placeholder="000.000.000-00"
                                    value={formatCnpjCpf(rt.cpf_cnpj_tecnico)}
                                    onChange={(e) => {
                                      const val = cleanDigits(e.target.value);
                                      setFormData((prev) => {
                                        const list = [...(prev.responsaveis_tecnicos || [])];
                                        list[idx] = { ...list[idx], cpf_cnpj_tecnico: val };
                                        return { ...prev, responsaveis_tecnicos: list };
                                      });
                                    }}
                                  />
                                </label>
                              </div>

                              <div className="form-col-4">
                                <label className="field-label">
                                  <span>Conselho Profissional *</span>
                                  <select
                                    className="input-select"
                                    value={rt.conselho}
                                    onChange={(e) => {
                                      const val = e.target.value as 'CREA' | 'CAU' | 'CFT';
                                      setFormData((prev) => {
                                        const list = [...(prev.responsaveis_tecnicos || [])];
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
                                  <span>Nº Registro no Conselho *</span>
                                  <input
                                    type="text"
                                    className="input-text"
                                    placeholder="Ex: 05189283-BA"
                                    value={rt.n_registro_conselho}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setFormData((prev) => {
                                        const list = [...(prev.responsaveis_tecnicos || [])];
                                        list[idx] = { ...list[idx], n_registro_conselho: val };
                                        return { ...prev, responsaveis_tecnicos: list };
                                      });
                                    }}
                                  />
                                </label>
                              </div>

                              <div className="form-col-4">
                                <label className="field-label">
                                  <span>Nº ART / RRT / TRT *</span>
                                  <input
                                    type="text"
                                    className="input-text"
                                    placeholder="Ex: BA20261628773"
                                    value={rt.n_art_rrt}
                                    onChange={(e) => {
                                      const val = e.target.value.toUpperCase();
                                      setFormData((prev) => {
                                        const list = [...(prev.responsaveis_tecnicos || [])];
                                        list[idx] = { ...list[idx], n_art_rrt: val };
                                        return { ...prev, responsaveis_tecnicos: list, n_art_rrt: val };
                                      });
                                    }}
                                  />
                                </label>
                              </div>

                              <div className="form-col-6">
                                <label className="field-label">
                                  <span>E-mail do Responsável Técnico</span>
                                  <input
                                    type="email"
                                    className="input-text"
                                    placeholder="engenheiro@email.com"
                                    value={rt.email_tecnico || ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setFormData((prev) => {
                                        const list = [...(prev.responsaveis_tecnicos || [])];
                                        list[idx] = { ...list[idx], email_tecnico: val };
                                        return { ...prev, responsaveis_tecnicos: list };
                                      });
                                    }}
                                  />
                                </label>
                              </div>

                              <div className="form-col-6">
                                <label className="field-label">
                                  <span>Telefone do Responsável Técnico</span>
                                  <input
                                    type="text"
                                    className="input-text"
                                    placeholder="(71) 99999-9999"
                                    value={formatPhone(rt.telefone_tecnico)}
                                    onChange={(e) => {
                                      const val = cleanDigits(e.target.value);
                                      setFormData((prev) => {
                                        const list = [...(prev.responsaveis_tecnicos || [])];
                                        list[idx] = { ...list[idx], telefone_tecnico: val };
                                        return { ...prev, responsaveis_tecnicos: list };
                                      });
                                    }}
                                  />
                                </label>
                              </div>
                            </div>
                          </div>
                        ))}

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
                  <div className="editor-card">
                    <div className="card-heading flex-between">
                      <div className="flex-row items-center gap-2">
                        <Flame size={18} className="text-teal" />
                        <h4>Medidas de Segurança Contra Incêndio ({currentFormMode === 'pts' ? '6 Medidas Básicas do PTS' : '22 Medidas Oficiais do PT'})</h4>
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

                    {currentFormMode === 'pts' && (
                      <div className="pts-measures-notice animate-fade-in mb-3" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.65rem 0.9rem', borderRadius: '8px', background: 'rgba(20, 184, 166, 0.08)', border: '1px solid rgba(20, 184, 166, 0.25)', fontSize: '0.82rem' }}>
                        <Info size={16} className="text-teal" />
                        <p style={{ margin: 0, lineHeight: 1.45 }}>
                          No <b>Projeto Técnico Simplificado (PTS)</b>, o Corpo de Bombeiros analisa exclusivamente as <b>6 medidas básicas</b> abaixo. As 16 medidas avançadas (hidrantes, chuveiros automáticos, detecção, controle de fumaça, etc.) são exclusivas de Projeto Técnico Completo (PT).
                        </p>
                      </div>
                    )}

                    <div className="measures-grid">
                      {OFFICIAL_FENIX_MEASURES.filter((m) => currentFormMode === 'pt' || m.basic).map((measure) => {
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
                              badge={measure.basic ? <span className="tag-basic">Básica</span> : <span className="tag-advanced" style={{ background: 'rgba(14, 165, 233, 0.2)', color: '#38bdf8', padding: '1px 6px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 600 }}>Avançada (PT)</span>}
                              description={measure.desc}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ETAPA 3: VALIDAÇÃO, SIMULAÇÃO DRY-RUN & ENVIO */}
              {step === 3 && (
                <div className="step-panel animate-fade-in">
                  {/* Card Informativo de Documentos Exigidos pelo Fênix pós-protocolo */}
                  <div className="editor-card official-docs-checklist-card animate-fade-in" style={{ borderLeft: '4px solid #14b8a6' }}>
                    <div className="card-heading flex-between">
                      <div className="flex-row items-center gap-2">
                        <FileText size={18} className="text-teal" />
                        <h4>Documentos que o Fênix solicitará após gerar o protocolo</h4>
                      </div>
                      <span className="badge-tag tag-teal">
                        Tipo de Projeto #{formData.tipo_projeto_id || (currentFormMode === 'pts' ? 4 : 1)} ({OFFICIAL_PROJECT_TYPES.find(t => t.id === (formData.tipo_projeto_id || (currentFormMode === 'pts' ? 4 : 1)))?.sigla})
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
                      {[1, 2, 3].includes(formData.tipo_projeto_id || (currentFormMode === 'pt' ? 1 : 0)) && (
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
                  <div className="editor-card">
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

                  {/* Ação de Simulação Dry-Run */}
                  <div className="simulation-hero-card">
                    <div className="simulation-intro">
                      <div className="shield-icon-circle">
                        <ShieldCheck size={28} />
                      </div>
                      <div>
                        <h3>Simulação Dry-Run (100% Segura e Local)</h3>
                        <p>
                          Gera o payload exato no formato esperado pelo serviço do Fênix sem enviar dados à API pública do CBMBA.
                          Permite auditar a estrutura completa antes de qualquer ação.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="button button-teal button-lg simulate-button"
                      onClick={() => void handleSimulate()}
                      disabled={simulating || saving}
                    >
                      {simulating ? (
                        <>
                          <LoaderCircle size={18} className="spin" /> Executando Dry-Run...
                        </>
                      ) : (
                        <>
                          <Play size={18} /> Simular Envio (Dry-Run — 100% Seguro)
                        </>
                      )}
                    </button>
                  </div>

                  {/* Painel do Payload Gerado */}
                  {simulationResult && (
                    <div className="editor-card animate-fade-in">
                      <div className="card-heading flex-between">
                        <div className="flex-row items-center gap-2">
                          <CheckCircle2 size={18} className="text-green" />
                          <h4>Payload Fênix CBMBA Gerado</h4>
                          <span className="badge-tag">POST /api/v1/technicalproject</span>
                        </div>
                        <button
                          type="button"
                          className="button button-outline button-sm"
                          onClick={handleCopyPayload}
                        >
                          {copiedPayload ? <Check size={14} className="text-green" /> : <Copy size={14} />}
                          {copiedPayload ? 'Copiado!' : 'Copiar JSON'}
                        </button>
                      </div>

                      <div className="json-viewer-wrap">
                        <pre className="json-code">
                          {JSON.stringify(simulationResult.fenixPayload, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Trava de Segurança e Transmissão para o Fênix Real */}
                  <div className="secure-submission-card">
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
                : `Etapa ${step} de 3 · ${step === 1 ? 'Edificação e Endereço' : step === 2 ? 'Projeto Técnico, Ocupação e Medidas' : 'Simulação Dry-Run e Envio Protegido'}`}
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
            {renderStepPanels()}
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
                  : `Etapa ${step} de 3 · ${step === 1 ? 'Edificação & Endereço' : step === 2 ? 'Projeto Técnico & Enquadramento' : 'Validação, Simulação Dry-Run & Envio'}`}
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
                  disabled={saving || simulating || submitting}
                  title="Voltar para a lista de rascunhos"
                >
                  <ArrowLeft size={14} /> Lista de Rascunhos
                </button>
                <button
                  type="button"
                  className="button button-teal button-sm"
                  onClick={() => void handleSaveDraft()}
                  disabled={saving || simulating || submitting}
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
              disabled={saving || simulating || submitting}
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
              {renderStepPanels()}
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

export default ProjectDraftModal;
export { generateLocalAiAssistantFallback, INITIAL_EMPTY_DRAFT };

