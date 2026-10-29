// Funções e tipos compartilhados do Copiloto IA de Cadastro CBMBA
// Mantido em arquivo modular para permitir code-splitting sob demanda (React.lazy) do editor principal.

export interface ProjectDraftInput {
  id?: string;
  name?: string;
  edificacao_mode?: 'new' | 'existing';
  edificacao_id?: number | null;
  process_category?: 'pts' | 'pt';
  license_type?: 'CLCB' | 'AVCB';
  isencao_id?: number;
  n_art_rrt?: string;
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
  questionario?: Record<string, boolean>;
  securityMeasures: Record<string, number>;
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

export const INITIAL_EMPTY_DRAFT: ProjectDraftInput = {
  name: 'Novo Rascunho de Projeto',
  edificacao_mode: 'new',
  edificacao_id: null,
  process_category: 'pts',
  license_type: 'CLCB',
  isencao_id: 1,
  n_art_rrt: '',
  edification: {
    reference_name: '',
    registration: '',
    height: 'Baixa = H <= 6,00 m',
    number_floors: 1,
    building_area: 250,
    area_to_be_built: 0,
    discount_area: 0
  },
  address: {
    zip_code: '',
    public_place: '',
    number: '',
    complement: '',
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
    natureza_juridica: 'Sociedade Empresária Limitada',
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
    email_proprietario: '',
    tel_proprietario: ''
  },
  responsavel: {
    responsavel_uso_igual_prop: true,
    tipo_pessoa_resp: 'PJ',
    cpf_cnpj_resp: '',
    nome_responsavel: '',
    email_responsavel_uso: '',
    tel_responsavel_uso: ''
  },
  technical: {
    cpf: '',
    name: 'ABA Incêndio - Engenharia e Projetos',
    crea_cau: 'BA20261628773',
    telephone: '(71) 4000-2895',
    email: 'engenharia@abaincendio.com.br'
  },
  questionario: {
    edf_saida_direta: true,
    existe_gases_inflamaveis: false,
    existe_liquidos_inflamaveis: false,
    glp_12480kg: false,
    gas_glp: false,
    armazena_produtos_perigosos: false,
    local_reuniao_publico: false,
    lotacao_max_pessoas: false,
    subsolo_maior_50m_pt: false,
    cobertura_fibras_sape: false
  },
  securityMeasures: {
    iluminacao_emerg: 1,
    sinal_emerg: 1,
    extintores: 1,
    saidas_emerg: 1,
    brigada_incendio: 0,
    acesso_viatura: 0,
    hidrante_mangot: 0,
    alarme_incendio: 0,
    deteccao_incendio: 0,
    seguranca_estrutural: 0,
    chuveiros_auto: 0,
    plano_emerg_incendio: 0
  }
};

export interface ActiveBuildingContext {
  id: string;
  reference: string;
  municipality?: string;
  area?: string;
  floors?: string;
  height?: string;
  processes?: Array<{
    protocol: string;
    type: string;
    status: string;
    stage?: string;
    updatedAt?: string;
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
    const refLower = (activeBuilding.reference || '').toLowerCase();
    const isAboutBuilding = norm.includes(refLower) || norm.includes('edifica') || norm.includes('desta') || norm.includes('este processo') || norm.includes('geral') || norm.includes('situa') || norm.includes('process') || norm.includes('etapa') || norm.includes('pend') || norm.includes('explic') || norm.includes('histor') || norm.includes('analis');

    // Caso 1: Preencher novo cadastro com dados da edificação
    if (norm.includes('preencher') || (norm.includes('cadastro') && norm.includes('dados'))) {
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

    // Caso 2: Explicar situação / processos da edificação
    if (isAboutBuilding) {
      const procs = activeBuilding.processes || [];
      const procCount = procs.length;
      let processSummary = '';
      if (procCount === 0) {
        processSummary = 'Não constam processos ou vistorias vinculados a esta edificação na sincronização atual.';
      } else {
        processSummary = procs.map(p => `• Protocolo ${p.protocol} (${p.type}): Etapa atual "${p.stage || p.status}".`).join('\n');
      }

      return {
        reply: `Edificação "${activeBuilding.reference}" (${activeBuilding.municipality || 'BA'}):\nÁrea: ${activeBuilding.area || 'Não informada'} m² | Pavimentos: ${activeBuilding.floors || '1'}.\n\nProcessos sincronizados:\n${processSummary}\n\nRecomendo verificar as pendências documentais e notificações no portal Fênix caso necessite de renovação ou emissão de AVCB/CLCB.`,
        thinkingSteps: [
          `Consulta aos dados sincronizados de ${activeBuilding.reference}`,
          `Verificação de ${procCount} processo(s) vinculado(s)`,
          'Análise de etapas e orientações de próximos passos CBMBA'
        ],
        appliedChangesSummary: [],
        suggestions: [
          `✦ Preencher novo cadastro com dados de ${activeBuilding.reference}`,
          '✦ Sugerir e marcar medidas da IT-14',
          '✦ Auto-revisar pendências'
        ]
      };
    }
  }

  if (norm.includes('exemplo') || norm.includes('galpao') || norm.includes('galpão')) {
    return {
      reply: 'Apliquei o exemplo de um Galpão Comercial de 620 m² em Feira de Santana, divisão C-2 com medidas de segurança da IT-14 ajustadas.',
      thinkingSteps: ['Identificada intenção de carregar caso prático', 'Calculando medidas mínimas CBMBA para 620 m²', 'Definindo município Feira de Santana (ID 108)'],
      appliedChangesSummary: [
        'Área construída → 620 m²',
        'Município → FEIRA DE SANTANA (ID 108)',
        'Pavimentos → 1 (Térrea)',
        'Divisão → C-2',
        'Medidas recomendadas marcadas'
      ],
      formPatch: {
        step: 1,
        name: 'Galpão Comercial - Feira de Santana',
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
        'Nome → Pizzaria Forno a Lenha FSA',
        'Área → 120 m²',
        'Município → FEIRA DE SANTANA (108)',
        'Medidas mínimas marcadas'
      ],
      formPatch: {
        step: 1,
        name: 'Pizzaria Forno a Lenha FSA',
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
