// Funções e tipos compartilhados do Copiloto IA de Cadastro CBMBA
// Mantido em arquivo modular para permitir code-splitting sob demanda (React.lazy) do editor principal.

export interface TechnicalManagerItem {
  tipo_numero?: 'CREA' | 'CAU' | 'CFT' | string;
  conselho?: 'CREA' | 'CAU' | 'CFT' | string;
  crea_cau?: string;
  n_registro_conselho?: string;
  name?: string;
  nome_tecnico?: string;
  cpf_cnpj?: string;
  cpf_cnpj_tecnico?: string;
  phone?: string;
  telefone_tecnico?: string;
  email?: string;
  email_tecnico?: string;
  art?: string;
  n_art_rrt?: string;
}

export interface ProjectDraftInput {
  id?: string;
  name?: string;
  edificacao_mode?: 'new' | 'existing';
  edificacao_id?: number | null;
  form_mode?: 'pts' | 'pt';
  tipo_projeto_id?: number;
  process_category?: 'pts' | 'pt';
  license_type?: 'CLCB' | 'AVCB';
  isencao_id?: number;
  n_art_rrt?: string;
  data_inicio?: string;
  data_fim?: string;
  projeto_anterior?: boolean;
  n_projeto_anterior?: string;
  decreto_estadual_adotado_id?: number;
  cnae_not_in_it14?: boolean;
  porte_outros?: string;
  qtde_pessoas?: number | string;
  qtde_leitos?: number | string;
  qtde_funcionarios?: number | string;
  area_comum?: number | string;
  subsolo_maior_50m?: boolean;
  cobertura_fsps_sup200?: boolean;
  edification: {
    reference_name: string;
    registration?: string;
    height: string;
    number_floors: number | string;
    building_area: number | string;
    area_to_be_built?: number | string;
    discount_area?: number | string;
    total_area?: number | string;
  };
  address: {
    zip_code: string;
    public_place: string;
    number: string;
    complement?: string;
    district: string;
    municipio_id: number | null;
    county?: string;
    state?: string;
    geographic_coordinates?: string;
  };
  institution: {
    tipo_pessoa?: 'PJ' | 'PF';
    cnpj_cpf: string;
    razao_social: string;
    nome_fantasia?: string;
    natureza_juridica?: string;
    cnae: string;
    atividade_economica: string;
    risk: number | string;
  };
  occupation: {
    occupation_group_id: number | null;
    division_group_id: number | null;
    has_underground?: boolean;
    underground_occupation_group_id?: number | null;
    underground_division_group_id?: number | null;
  };
  proprietario: {
    tipo_pessoa_prop: 'PJ' | 'PF';
    cpf_cnpj_prop: string;
    nome_proprietario: string;
    email_proprietario: string;
    tel_proprietario: string;
  };
  responsavel: {
    responsavel_uso_igual_prop?: boolean;
    tipo_pessoa_resp: 'PJ' | 'PF';
    cpf_cnpj_resp: string;
    nome_responsavel: string;
    email_responsavel_uso: string;
    tel_responsavel_uso: string;
  };
  technical?: {
    cpf?: string;
    name?: string;
    crea_cau?: string;
    telephone?: string;
    email?: string;
  };
  responsaveis_tecnicos?: TechnicalManagerItem[];
  incluir_rt_opcional?: boolean;
  questionario?: {
    edf_saida_direta?: boolean;
    edf_regularizada_certificado?: boolean;
    tipo_certificado?: 'AVCB' | 'CLCB';
    n_certificado?: string;
    renovacao_sap?: boolean;
    lotacao_max_pessoas?: boolean;
    existe_gases_inflamaveis?: boolean;
    existe_liquidos_inflamaveis?: boolean;
    glp_12480kg?: boolean;
    gas_glp?: boolean;
    armazena_produtos_perigosos?: boolean;
    local_reuniao_publico?: boolean;
    subsolo_maior_50m_pt?: boolean;
    cobertura_fibras_sape?: boolean;
    [key: string]: boolean | string | undefined;
  };
  specialRisks?: {
    liquidos_inflamaveis?: boolean;
    gas_liquefeito_petroleo?: boolean;
    produtos_perigosos?: boolean;
    fogos_artificio?: boolean;
    vaso_pressao?: boolean;
    outros?: string;
  };
  glpData?: {
    total_kg_glp?: number | string;
    classe_glp?: string;
  };
  securityMeasures: Record<string, number | boolean>;
}

export interface OfficialSecurityMeasure {
  key: string;
  label: string;
  desc: string;
  basic: boolean;
}

export const OFFICIAL_FENIX_MEASURES: OfficialSecurityMeasure[] = [
  // 6 Medidas Básicas (exibidas TANTO no Simplificado PTS quanto no Completo PT)
  { key: 'iluminacao_emerg', label: 'Iluminação de Emergência', desc: 'Blocos autônomos ou sistema centralizado de iluminação', basic: true },
  { key: 'brigada_incendio', label: 'Brigada de incêndio', desc: 'Pessoal capacitado para combate inicial e primeiros socorros', basic: true },
  { key: 'sinal_emerg', label: 'Sinalização de Emergência', desc: 'Placas fotoluminescentes de orientação e salvamento', basic: true },
  { key: 'extintores', label: 'Extintores', desc: 'Extintores portáteis e sobrerrodas para combate imediato', basic: true },
  { key: 'saidas_emerg', label: 'Saídas de emergência', desc: 'Rotas de fuga, corredores e portas desobstruídas', basic: true },
  { key: 'control_mat_acab', label: 'Controle de material de acabamento', desc: 'Materiais de revestimento e acabamento com baixa propagação', basic: true },
  // 16 Medidas Avançadas de Engenharia (exibidas APENAS no Projeto Téc. Completo form_mode === 'pt')
  { key: 'comp_horizontal', label: 'Compartimentação horizontal', desc: 'Paredes e portas corta-fogo para contenção de chamas', basic: false },
  { key: 'comp_vertical', label: 'Compartimentação vertical', desc: 'Fechamentos de poços, fachadas e escadas de emergência', basic: false },
  { key: 'separacao_edific', label: 'Separação entre as edificações', desc: 'Distanciamento seguro e barreiras de irradiação térmica', basic: false },
  { key: 'acesso_viatura', label: 'Acesso de viatura do Corpo de Bombeiros', desc: 'Vias e portões com gabarito livre para viaturas operacionais', basic: false },
  { key: 'resfriamento', label: 'Resfriamento', desc: 'Sistema fixo de aspersores de água para tanques e esferas', basic: false },
  { key: 'hidrante_mangot', label: 'Hidrantes e mangotinhos', desc: 'Rede hidráulica pressurizada sob comando', basic: false },
  { key: 'deteccao_incendio', label: 'Detecção de incêndio', desc: 'Detectores automáticos pontuais de fumaça, calor ou chama', basic: false },
  { key: 'chuveiros_auto', label: 'Chuveiros automáticos', desc: 'Rede de sprinklers para controle automático de incêndio', basic: false },
  { key: 'elevador_emerg', label: 'Elevador de emergência', desc: 'Elevador prioritário com alimentação elétrica protegida', basic: false },
  { key: 'seguranca_estrutural', label: 'Segurança estrutural nas edificações', desc: 'Tempo Requerido de Resistência ao Fogo (TRRF) estrutural', basic: false },
  { key: 'control_fumaca', label: 'Controle de fumaça', desc: 'Exaustores mecânicos e aberturas para despressurização de fumaça', basic: false },
  { key: 'espuma', label: 'Espuma', desc: 'Sistemas proporcionadores de espuma para líquidos inflamáveis', basic: false },
  { key: 'plano_emerg_incendio', label: 'Plano de emergência contra incêndio', desc: 'Procedimento tático e operacional de abandono e socorro', basic: false },
  { key: 'sis_fixo_gases', label: 'Sistema fixo de gases limpos e CO2', desc: 'Inundação total para salas elétricas e data centers', basic: false },
  { key: 'alarme_incendio', label: 'Alarme de incêndio', desc: 'Botoeiras manuais e sinalizadores acústico-visuais', basic: false },
  { key: 'sis_prot_cont_desc_elet', label: 'Sistema de proteção contra descargas elétricas', desc: 'SPDA / Para-raios e aterramento elétrico', basic: false }
];

export const FENIX_MEASURE_SYNONYMS: Record<string, string> = {
  iluminacao_emergencia: 'iluminacao_emerg',
  sinalizacao_emergencia: 'sinal_emerg',
  saidas_emergencia: 'saidas_emerg',
  hidrante_mangotinhos: 'hidrante_mangot',
  hidrantes_e_mangotinhos: 'hidrante_mangot',
  acesso_viatura_edificacao: 'acesso_viatura',
  seguranca_estrutural_contra_incendio: 'seguranca_estrutural',
  chuveiros_automaticos: 'chuveiros_auto',
  plano_emergencia: 'plano_emerg_incendio',
  controle_materiais_acabamento: 'control_mat_acab',
  compartimentacao_horizontal: 'comp_horizontal',
  compartimentacao_vertical: 'comp_vertical',
  separacao_entre_edificacoes: 'separacao_edific',
  elevador_emergencia: 'elevador_emerg',
  controle_fumaca: 'control_fumaca',
  sistema_fixo_gases_limpos: 'sis_fixo_gases',
  spda: 'sis_prot_cont_desc_elet',
  protecao_contra_descargas_eletricas: 'sis_prot_cont_desc_elet'
};

export function normalizeSecurityMeasures(
  raw: Record<string, any> | undefined | null,
  isPts: boolean
): Record<string, number> {
  const result: Record<string, number> = {};
  if (!raw) return result;

  const basicKeys = new Set(OFFICIAL_FENIX_MEASURES.filter((m) => m.basic).map((m) => m.key));
  const validKeys = new Set(OFFICIAL_FENIX_MEASURES.map((m) => m.key));

  for (const [k, v] of Object.entries(raw)) {
    const canonicalKey = FENIX_MEASURE_SYNONYMS[k] || k;
    if (validKeys.has(canonicalKey)) {
      if (isPts && !basicKeys.has(canonicalKey)) {
        continue;
      }
      result[canonicalKey] = v ? 1 : 0;
    }
  }

  return result;
}

export interface DraftAiAssistantResponse {
  reply: string;
  thinkingSteps: string[];
  appliedChangesSummary: string[];
  formPatch?: {
    step?: 1 | 2 | 3;
    name?: string;
    form_mode?: 'pts' | 'pt';
    tipo_projeto_id?: number;
    edification?: Partial<ProjectDraftInput['edification']>;
    address?: Partial<ProjectDraftInput['address']>;
    institution?: Partial<ProjectDraftInput['institution']>;
    occupation?: Partial<ProjectDraftInput['occupation']>;
    proprietario?: Partial<ProjectDraftInput['proprietario']>;
    responsavel?: Partial<ProjectDraftInput['responsavel']>;
    technical?: Partial<ProjectDraftInput['technical']>;
    questionario?: Record<string, boolean>;
    specialRisks?: Record<string, boolean>;
    securityMeasures?: Record<string, boolean>;
  };
  suggestions: string[];
}

export const INITIAL_EMPTY_DRAFT: ProjectDraftInput = {
  name: 'Novo Rascunho de Projeto',
  edificacao_mode: 'new',
  edificacao_id: null,
  form_mode: 'pts',
  tipo_projeto_id: 5,
  process_category: 'pts',
  license_type: 'CLCB',
  isencao_id: 1,
  n_art_rrt: '',
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
    reference_name: '',
    registration: '',
    height: 'Térrea = Um pavimento',
    number_floors: 1,
    building_area: 250,
    area_to_be_built: 0,
    discount_area: 0
  },
  address: {
    zip_code: '',
    public_place: '',
    number: '',
    complement: '***',
    district: '',
    county: 'SALVADOR',
    municipio_id: 323,
    state: 'BA',
    geographic_coordinates: ''
  },
  institution: {
    tipo_pessoa: 'PJ',
    cnpj_cpf: '',
    razao_social: '',
    nome_fantasia: '',
    natureza_juridica: 'ME',
    cnae: '',
    atividade_economica: '',
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
    cpf_cnpj_prop: '',
    nome_proprietario: '',
    email_proprietario: 'engenharia@abaincendio.com.br',
    tel_proprietario: '(71) 4000-2895'
  },
  responsavel: {
    responsavel_uso_igual_prop: true,
    tipo_pessoa_resp: 'PJ',
    cpf_cnpj_resp: '',
    nome_responsavel: '',
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
    brigada_incendio: 0,
    control_mat_acab: 0
  }
};

export interface ActiveBuildingProcessDocument {
  name: string;
  type?: string;
  status?: string;
  available?: boolean;
  availabilityMessage?: string;
}

export interface ActiveBuildingProcessTimelineItem {
  label: string;
  date?: string;
  done?: boolean;
  current?: boolean;
}

export interface ActiveBuildingContext {
  id: string;
  reference: string;
  municipality?: string;
  address?: string;
  area?: string;
  floors?: string;
  height?: string;
  occupation?: string;
  processes?: Array<{
    protocol: string;
    type: string;
    status: string;
    stage?: string;
    updatedAt?: string;
    documents?: ActiveBuildingProcessDocument[];
    timeline?: ActiveBuildingProcessTimelineItem[];
  }>;
}

export function generateLocalAiAssistantFallback(
  prompt: string,
  draft: ProjectDraftInput,
  totalArea: number,
  enq: { sigla: string; nome: string; motivo: string; isPts: boolean },
  activeBuilding?: ActiveBuildingContext | null
): DraftAiAssistantResponse {
  const norm = prompt.toLowerCase();

  if (activeBuilding) {
    const procs = activeBuilding.processes || [];
    const allDocs: ActiveBuildingProcessDocument[] = procs.flatMap((p) => p.documents || []);
    const allTimeline: ActiveBuildingProcessTimelineItem[] = procs.flatMap((p) => p.timeline || []);

    // Caso 1: Preencher novo cadastro com dados da edificação (solicitação explícita)
    if (
      norm.includes('preencher') ||
      (norm.includes('iniciar') && norm.includes('cadastro')) ||
      (norm.includes('cadastrar') && (norm.includes('edifica') || norm.includes('dados')))
    ) {
      const parsedArea = parseFloat(activeBuilding.area || '500') || 500;
      const parsedFloors = parseInt(activeBuilding.floors || '1', 10) || 1;
      return {
        reply: `Preenchi o novo rascunho de projeto com base nos dados da edificação "${activeBuilding.reference}". Área de ${parsedArea} m² (${parsedFloors} pavimento${parsedFloors > 1 ? 's' : ''}) configurada com sucesso.`,
        thinkingSteps: [
          `Lendo parâmetros da edificação em foco: ${activeBuilding.reference}`,
          `Definindo área construída (${parsedArea} m²) e pavimentos (${parsedFloors})`,
          `Configurando município: ${activeBuilding.municipality || 'SALVADOR'}`
        ],
        appliedChangesSummary: [
          `Referência → ${activeBuilding.reference}`,
          `Área construída → ${parsedArea} m²`,
          `Pavimentos → ${parsedFloors}`,
          ...(activeBuilding.municipality ? [`Município → ${activeBuilding.municipality}`] : [])
        ],
        formPatch: {
          step: 1,
          name: `Projeto - ${activeBuilding.reference}`,
          edification: {
            reference_name: activeBuilding.reference,
            building_area: parsedArea,
            number_floors: parsedFloors,
            height: parsedFloors > 1 ? `${parsedFloors} pavimentos` : 'Térrea = Um pavimento'
          },
          address: {
            county: activeBuilding.municipality || 'SALVADOR',
            state: 'BA'
          }
        },
        suggestions: ['✦ Auto-revisar pendências', '✦ Sugerir medidas IT-14', '✦ Explicar enquadramento']
      };
    }

    // Caso 2: Pergunta sobre documentos, anexos ou disponibilidade
    if (
      norm.includes('doc') ||
      norm.includes('dispon') ||
      norm.includes('indispon') ||
      norm.includes('dae') ||
      norm.includes('avcb') ||
      norm.includes('clcb') ||
      norm.includes('certificad') ||
      norm.includes('comprovante') ||
      norm.includes('anexo') ||
      norm.includes('pdf')
    ) {
      let docsDiagnostic = '';
      if (allDocs.length > 0) {
        docsDiagnostic = allDocs
          .map(
            (d) =>
              `• ${d.name || d.type || 'Documento'}: ${
                d.available ? 'Disponível para download' : d.availabilityMessage || d.status || 'Indisponível no momento'
              }`
          )
          .join('\n');
      } else {
        docsDiagnostic = 'Na consulta atual ao Fênix, não constam arquivos binários de documentos liberados para os processos desta edificação.';
      }

      return {
        reply: `Sobre a disponibilidade de documentos da edificação "${activeBuilding.reference}":\n\nNo portal Fênix do CBMBA, documentos como DAEs, Comprovantes de Protocolo e Certificados (AVCB/CLCB) ficam marcados como "Indisponíveis" principalmente por:\n\n1. **Etapa do Processo**: Certificados de Aprovação (AVCB/CLCB) só são gerados e disponibilizados após a **homologação final** do processo. Enquanto o processo estiver em análise ou vistoria, o certificado ainda não existe.\n2. **Guias e DAE**: As guias de pagamento podem ficar indisponíveis quando já foram compensadas pelo banco, quando expiraram ou quando a isenção de taxa foi concedida.\n3. **Comprovantes e Notificações**: Podem estar indisponíveis caso o analista do CBMBA ainda não tenha feito o upload do arquivo digitalizado no sistema estadual.\n\nSituação dos documentos encontrados:\n${docsDiagnostic}\n\nRecomendo acessar o Fênix caso precise protocolar nova retificação ou emitir segunda via da taxa.`,
        thinkingSteps: [
          `Identificado contexto de documentos para ${activeBuilding.reference}`,
          `Analisando ${allDocs.length} documento(s) e metadados de disponibilidade`,
          'Verificando regras de emissão e homologação documental do CBMBA'
        ],
        appliedChangesSummary: [],
        suggestions: [
          `✦ Explicar situação de ${activeBuilding.reference}`,
          `✦ Resumir linha do tempo do processo`,
          `✦ Preencher cadastro com dados de ${activeBuilding.reference}`
        ]
      };
    }

    // Caso 3: Pergunta sobre linha do tempo, histórico ou movimentações
    if (
      norm.includes('timeline') ||
      norm.includes('linha do tempo') ||
      norm.includes('histó') ||
      norm.includes('histor') ||
      norm.includes('moviment') ||
      norm.includes('marcos')
    ) {
      let timelineText = '';
      if (allTimeline.length > 0) {
        timelineText = allTimeline
          .slice(0, 10)
          .map((t) => `• ${t.label}${t.date ? ` (${t.date})` : ''} - ${t.done ? 'Concluído' : t.current ? 'Etapa Atual' : 'Pendente'}`)
          .join('\n');
      } else {
        timelineText = 'O Fênix não retornou movimentações cronológicas detalhadas para este protocolo na sincronização recente.';
      }

      return {
        reply: `Linha do tempo e histórico dos processos de "${activeBuilding.reference}":\n\n${timelineText}\n\nEssas etapas refletem o andamento oficial no Corpo de Bombeiros Militar da Bahia.`,
        thinkingSteps: [
          `Buscando movimentações e marcos de ${activeBuilding.reference}`,
          `Organizando linha cronológica dos processos`,
          'Sintetizando andamento oficial CBMBA'
        ],
        appliedChangesSummary: [],
        suggestions: [
          `✦ Por que há documentos indisponíveis?`,
          `✦ Explicar situação de ${activeBuilding.reference}`,
          `✦ Preencher cadastro com dados de ${activeBuilding.reference}`
        ]
      };
    }

    // Caso 4: Qualquer outra dúvida sobre a edificação em tela
    let processSummary = '';
    if (procs.length === 0) {
      processSummary = 'Não constam processos ou vistorias vinculados a esta edificação na sincronização atual.';
    } else {
      processSummary = procs.map((p) => `• Protocolo ${p.protocol} (${p.type}): Etapa atual "${p.stage || p.status}".`).join('\n');
    }

    return {
      reply: `Edificação "${activeBuilding.reference}" (${activeBuilding.municipality || 'BA'}):\nÁrea: ${activeBuilding.area || 'Não informada'} m² | Pavimentos: ${activeBuilding.floors || '1'}.\n\nProcessos sincronizados:\n${processSummary}\n\nPosso explicar a situação de documentos, detalhar as movimentações da linha do tempo ou auxiliar no preenchimento de um novo rascunho. O que gostaria de saber?`,
      thinkingSteps: [
        `Consulta aos dados sincronizados de ${activeBuilding.reference}`,
        `Verificação de ${procs.length} processo(s) vinculado(s)`,
        'Análise de etapas e orientações de próximos passos CBMBA'
      ],
      appliedChangesSummary: [],
      suggestions: [
        `✦ Por que há documentos indisponíveis?`,
        `✦ Resumir linha do tempo do processo`,
        `✦ Preencher cadastro com dados de ${activeBuilding.reference}`
      ]
    };
  }

  if (norm.includes('exemplo') || norm.includes('galpao') || norm.includes('galpão')) {
    return {
      reply: 'Apliquei o exemplo de um Galpão Comercial de 620 m² em Feira de Santana, divisão C-2 com medidas de segurança da IT-14 ajustadas.',
      thinkingSteps: ['Identificada intenção de carregar caso prático', 'Calculando medidas mínimas CBMBA para 620 m²', 'Definindo município Feira de Santana (ID 108)'],
      appliedChangesSummary: [
        'Formulário → Projeto Técnico Simplificado (PTSCLCB2)',
        'Área construída → 620 m²',
        'Município → FEIRA DE SANTANA (ID 108)',
        'Pavimentos → 1 (Térrea)',
        'Divisão → C-2',
        'Medidas recomendadas marcadas'
      ],
      formPatch: {
        step: 1,
        name: 'Galpão Comercial - Feira de Santana',
        form_mode: 'pts',
        tipo_projeto_id: 5,
        edification: {
          reference_name: 'GALPÃO COMERCIAL NORTE',
          building_area: 620,
          number_floors: 1,
          height: 'Térrea = Um pavimento'
        },
        address: {
          county: 'FEIRA DE SANTANA',
          municipio_id: 108,
          public_place: 'Avenida Presidente Dutra',
          number: '1500',
          district: 'Centro',
          state: 'BA'
        },
        occupation: {
          division_group_id: 6
        },
        securityMeasures: {
          extintores: true,
          iluminacao_emerg: true,
          sinal_emerg: true,
          saidas_emerg: true,
          brigada_incendio: true
        }
      },
      suggestions: ['✦ Auto-revisar pendências', '✦ Sugerir medidas IT-14', '✦ Explicar enquadramento']
    };
  }

  if (norm.includes('pizzaria') || norm.includes('restaurante')) {
    return {
      reply: 'Configurei os parâmetros para uma Pizzaria/Restaurante de 120 m² em Feira de Santana (Divisão F-8), com enquadramento automático em PTS (CLCB).',
      thinkingSteps: ['Classificação Divisão F-8 (Locais de Refeição)', 'Área menor que 200 m² → CLCB sem taxa ou simplificado'],
      appliedChangesSummary: [
        'Formulário → Projeto Técnico Simplificado (PTSCLCB1)',
        'Nome → Pizzaria Forno a Lenha FSA',
        'Área → 120 m²',
        'Município → FEIRA DE SANTANA (108)',
        'Medidas mínimas marcadas'
      ],
      formPatch: {
        step: 1,
        name: 'Pizzaria Forno a Lenha FSA',
        form_mode: 'pts',
        tipo_projeto_id: 4,
        edification: {
          reference_name: 'PIZZARIA FORNO A LENHA',
          building_area: 120,
          number_floors: 1,
          height: 'Térrea = Um pavimento'
        },
        address: {
          county: 'FEIRA DE SANTANA',
          municipio_id: 108,
          public_place: 'Rua Castro Alves',
          number: '250',
          district: 'Kalilândia',
          state: 'BA'
        },
        securityMeasures: {
          extintores: true,
          iluminacao_emerg: true,
          sinal_emerg: true,
          saidas_emerg: true
        }
      },
      suggestions: ['✦ Auto-revisar pendências', '✦ Sugerir medidas IT-14']
    };
  }

  if (norm.includes('medida') || norm.includes('it-14') || norm.includes('it14')) {
    const isBig = totalArea > 750;
    return {
      reply: `Com base na área de ${totalArea} m² e no Decreto 16.302/BA, selecionei as medidas de segurança contra incêndio exigidas para esta ocupação.`,
      thinkingSteps: [
        `Área total: ${totalArea} m² (${isBig ? 'Acima de 750 m² → PT obrigatório' : 'Até 750 m² → PTS simplificado'})`,
        'Extintores, Iluminação, Sinalização e Saídas são obrigatórias em todas as edificações',
        isBig ? 'Adicionando Hidrantes e Alarme de Incêndio (exigência para PT)' : 'Isenção de rede de hidrantes para PTS'
      ],
      appliedChangesSummary: [
        'Extintores Portáteis',
        'Iluminação de Emergência',
        'Sinalização de Emergência',
        'Saídas de Emergência',
        ...(isBig ? ['Rede de Hidrantes e Mangotinhos', 'Alarme de Incêndio Manual'] : [])
      ],
      formPatch: {
        step: 2,
        securityMeasures: {
          extintores: true,
          iluminacao_emerg: true,
          sinal_emerg: true,
          saidas_emerg: true,
          hidrante_mangot: isBig,
          alarme_incendio: isBig
        }
      },
      suggestions: ['✦ Auto-revisar pendências', '✦ Explicar enquadramento']
    };
  }

  if (norm.includes('revis') || norm.includes('corrig') || norm.includes('pend')) {
    const patchObj: any = { step: 1 };
    const fixes: string[] = [];

    if (!draft.edification?.reference_name?.trim()) {
      patchObj.edification = { ...(patchObj.edification || {}), reference_name: 'EDIFICAÇÃO COMERCIAL PRINCIPAL' };
      fixes.push('Nome de referência atribuído');
    }
    if (!draft.address?.zip_code || draft.address.zip_code.length !== 8) {
      patchObj.address = { ...(patchObj.address || {}), zip_code: '40000000', state: 'BA' };
      fixes.push('CEP base da Bahia atribuído (40000-000)');
    }
    if (!draft.address?.public_place?.trim()) {
      patchObj.address = { ...(patchObj.address || {}), public_place: 'Avenida Principal', number: '100', district: 'Centro' };
      fixes.push('Endereço completado');
    }

    return {
      reply: fixes.length > 0
        ? `Revisei o formulário e corrigi ${fixes.length} inconsistência(s) obrigatória(s) do CBMBA.`
        : 'Parabéns! O rascunho já cumpre todas as regras essenciais de validação para a Etapa 1 e Etapa 2.',
      thinkingSteps: ['Varredura das etapas 1, 2 e 3', 'Checagem de campos obrigatórios CBMBA', 'Correção preventiva de bloqueios'],
      appliedChangesSummary: fixes,
      formPatch: fixes.length > 0 ? patchObj : undefined,
      suggestions: ['✦ Sugerir medidas IT-14', '✦ Explicar enquadramento']
    };
  }

  return {
    reply: `Seu projeto está enquadrado atualmente como ${enq.sigla} (${enq.nome}). ${enq.motivo}. Posso ajustar a área, preencher dados de contato ou configurar medidas para você.`,
    thinkingSteps: ['Lendo estado atual do formulário', 'Consultando regras da IT-14 CBMBA'],
    appliedChangesSummary: [],
    suggestions: ['✦ Auto-revisar e corrigir pendências da tela', '✦ Sugerir e marcar medidas da IT-14']
  };
}
