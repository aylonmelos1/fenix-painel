import { FenixError, fenixClientForUser } from './fenix.js';
import { buildAndValidateFenixProjectPayload, type ProjectDraftInput } from './project-drafts.js';

type FenixProjectUpdatePayload = Record<string, unknown> & { id: number; edificacao_id: number };
type FenixProjectUpdateResult = { id: number; num_projeto: string; edificacao_id: number; solicitacao_id?: number };

type SyncedFenixIdentity = {
  id: unknown;
  remote_id?: unknown;
  source_connection_id?: unknown;
};

function validRemoteId(value: string) {
  const parsed = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(parsed) && parsed > 0;
}

export function resolveFenixTechnicalProjectRemoteId(process: SyncedFenixIdentity): string | null {
  const id = String(process.id || '');
  const connectionId = String(process.source_connection_id || '');
  const storedRemoteId = String(process.remote_id || '').trim();
  let embeddedRemoteId = '';

  if (!connectionId) {
    if (!id.startsWith('technicalproject:')) return null;
    embeddedRemoteId = id.slice('technicalproject:'.length);
    if (embeddedRemoteId.includes(':')) return null;
    if (storedRemoteId && storedRemoteId !== embeddedRemoteId) return null;
  } else {
    const prefix = `technicalproject:${connectionId}:`;
    if (!id.startsWith(prefix) || !storedRemoteId) return null;
    embeddedRemoteId = id.slice(prefix.length);
    if (embeddedRemoteId !== storedRemoteId) return null;
  }

  return validRemoteId(embeddedRemoteId) ? embeddedRemoteId : null;
}

export function resolveFenixBuildingRemoteId(building: SyncedFenixIdentity): string | null {
  const id = String(building.id || '');
  const connectionId = String(building.source_connection_id || '');
  const storedRemoteId = String(building.remote_id || '').trim();
  let embeddedRemoteId = '';

  if (!connectionId) {
    embeddedRemoteId = id;
    if (storedRemoteId && storedRemoteId !== embeddedRemoteId) return null;
  } else {
    const prefix = `linked:${connectionId}:building:`;
    if (!id.startsWith(prefix) || !storedRemoteId) return null;
    embeddedRemoteId = id.slice(prefix.length);
    if (embeddedRemoteId !== storedRemoteId) return null;
  }

  return validRemoteId(embeddedRemoteId) ? embeddedRemoteId : null;
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function first(value: Record<string, any>, paths: string[], fallback: unknown = undefined) {
  for (const path of paths) {
    const found = path.split('.').reduce((current: any, key) => current?.[key], value);
    if (found !== undefined && found !== null && found !== '') return found;
  }
  return fallback;
}

function flag(value: unknown): 0 | 1 {
  if (value === undefined || value === null || value === false || value === 0) return 0;
  if (typeof value === 'string' && ['0', 'n', 'nao', 'não', 'false', ''].includes(value.trim().toLocaleLowerCase('pt-BR'))) return 0;
  return 1;
}

function unwrapProject(value: unknown): Record<string, any> {
  const response = record(value);
  const data = record(response.data);
  const project = record(data.technicalproject || data.projeto_tecnico || data.project || response.technicalproject || response.projeto_tecnico || data || response);
  return record(project.technicalproject || project.projeto_tecnico || project);
}

function personPayload(input: ProjectDraftInput, existingProject: Record<string, any>) {
  const source = record(input.institution);
  const existingInstitution = record(first(existingProject, ['institution', 'instituicao'], {}));
  const existingPerson = record(first(existingInstitution, ['pessoa'], {}));
  const existingPf = record(existingPerson.pessoa_fisica);
  const existingPj = record(existingPerson.pessoa_juridica);
  const type = String(source.tipo_pessoa || existingPerson.tipo || existingInstitution.tipo_pessoa || 'PJ').toUpperCase() === 'PF' ? 'PF' : 'PJ';
  const document = String(source.cnpj_cpf || (type === 'PF' ? source.cpf : source.cnpj) || first(existingPerson, [type === 'PF' ? 'pessoa_fisica.cpf' : 'pessoa_juridica.cnpj'], '')).replace(/\D/g, '');
  const name = String(source.razao_social || existingPj.razao_social || existingPf.nome || '');
  const cnae = String(source.cnae || existingInstitution.cnae || '').replace(/\D/g, '');

  return {
    id: existingInstitution.id ?? source.id ?? null,
    cnae,
    cnae_id: source.cnae_id ?? existingInstitution.cnae_id ?? null,
    risco: Number(source.risk ?? existingInstitution.risco ?? existingInstitution.risk) || 300,
    atividade_economica: String(source.atividade_economica || existingInstitution.atividade_economica || ''),
    cnae_selecao_automatica: Boolean(source.cnae_selecao_automatica ?? existingInstitution.cnae_selecao_automatica ?? true),
    cnae_not_in_it14: Boolean(source.cnae_not_in_it14 ?? existingInstitution.cnae_not_in_it14 ?? false),
    pessoa: {
      ...existingPerson,
      id: existingPerson.id ?? null,
      tipo: type,
      pessoa_fisica: {
        ...existingPf,
        nome: type === 'PF' ? name : String(existingPf.nome || ''),
        cpf: type === 'PF' ? document : String(existingPf.cpf || '')
      },
      pessoa_juridica: {
        ...existingPj,
        cnpj: type === 'PJ' ? document : String(existingPj.cnpj || ''),
        razao_social: type === 'PJ' ? name : String(existingPj.razao_social || ''),
        nome_fantasia: String(source.nome_fantasia || existingPj.nome_fantasia || name),
        natureza_juridica: String(source.natureza_juridica || existingPj.natureza_juridica || ''),
        porte_outros: source.porte_outros ?? existingPj.porte_outros ?? null
      }
    }
  };
}

function normalizeOccupations(input: ProjectDraftInput, existingProject: Record<string, any>, payloadOccupations: unknown) {
  const supplied = Array.isArray(input.occupationsDivisions) && input.occupationsDivisions.length
    ? input.occupationsDivisions
    : Array.isArray(payloadOccupations) && payloadOccupations.length
      ? payloadOccupations as Array<Record<string, unknown>>
      : first(existingProject, ['occupationsDivisions', 'occupations_divisions', 'ocupacoes_divisoes'], []) as Array<Record<string, unknown>>;

  return (Array.isArray(supplied) ? supplied : []).map((item) => {
    const row = record(item);
    return {
      ...row,
      occupation_group_id: Number(row.occupation_group_id ?? row.occupation?.id ?? row.occupation_group?.id) || 1,
      division_group_id: Number(row.division_group_id ?? row.division?.id ?? row.division_group?.id) || 1,
      occupation_group: String(row.occupation_group?.value ?? row.occupation_group ?? row.occupation?.value ?? ''),
      division_group: String(row.division_group?.value ?? row.division_group ?? row.division?.value ?? ''),
      principal: flag(row.principal) === 1,
      area_comum: flag(row.area_comum) === 1,
      sobre_solo: row.sobre_solo !== undefined ? flag(row.sobre_solo) === 1 : flag(row.underground) === 0
    };
  });
}

export function buildFenixTechnicalProjectUpdatePayload(
  input: ProjectDraftInput,
  projectId: string | number,
  buildingId: string | number,
  fenixUserId?: number | null,
  existingProjectValue?: unknown
): { valid: boolean; errors: string[]; warnings: string[]; payload: FenixProjectUpdatePayload | null } {
  const projectIdNumber = Number(projectId);
  const buildingIdNumber = Number(buildingId);
  if (!Number.isSafeInteger(projectIdNumber) || projectIdNumber <= 0) {
    return { valid: false, errors: ['ID do Projeto Técnico inválido para edição.'], warnings: [], payload: null };
  }
  if (!Number.isSafeInteger(buildingIdNumber) || buildingIdNumber <= 0) {
    return { valid: false, errors: ['ID da edificação vinculada inválido para edição.'], warnings: [], payload: null };
  }

  const validation = buildAndValidateFenixProjectPayload(input, fenixUserId);
  if (!validation.valid) return { valid: false, errors: validation.errors, warnings: validation.warnings, payload: null };

  const base = validation.fenixPayload;
  const {
    occupations_divisions: _legacyOccupations,
    projeto_anterior: _legacyPreviousProject,
    solicitante: _createRequester,
    medida_seguranca: _legacySecurityMeasures,
    responsaveis_tecnicos: _legacyTechnicalManagers,
    projeto_responsavel_tecnico: _legacyTechnicalLinks,
    liquidos_inflamaveis: _legacyFlammableLiquids,
    gas_liquefeito_petroleo: _legacyLpg,
    produtos_perigosos: _legacyDangerousGoods,
    fogos_artificio: _legacyFireworks,
    vaso_pressao: _legacyPressureVessel,
    outros: _legacyOtherRisk,
    total_kg_glp: _legacyTotalLpg,
    classes_glp: _legacyGlpClasses,
    ...updateBase
  } = base;
  const existingProject = unwrapProject(existingProjectValue);
  const existingRisks = record(first(existingProject, ['specialRisks', 'special_risks'], {}));
  const inputRisks = record(input.specialRisks);
  const rawRisks = record(base);
  const specialRisks = {
    liquidos_inflamaveis: flag(inputRisks.liquidos_inflamaveis ?? existingRisks.liquidos_inflamaveis ?? rawRisks.liquidos_inflamaveis),
    gas_liquefeito_petroleo: flag(inputRisks.gas_liquefeito_petroleo ?? existingRisks.gas_liquefeito_petroleo ?? rawRisks.gas_liquefeito_petroleo),
    produtos_perigosos: flag(inputRisks.produtos_perigosos ?? existingRisks.produtos_perigosos ?? rawRisks.produtos_perigosos),
    fogos_artificio: flag(inputRisks.fogos_artificio ?? existingRisks.fogos_artificio ?? rawRisks.fogos_artificio),
    vaso_pressao: flag(inputRisks.vaso_pressao ?? existingRisks.vaso_pressao ?? rawRisks.vaso_pressao),
    outros: inputRisks.outros ?? existingRisks.outros ?? rawRisks.outros ?? null
  };
  const questionnaire = Object.keys(record(input.questionario)).length
    ? input.questionario
    : first(existingProject, ['questionario', 'questionnaire'], {});
  const sourceAddress = record(base.address);
  const existingAddress = record(first(existingProject, ['address', 'edification.address', 'edificacao.address'], {}));
  const sourceInstitution = personPayload(input, existingProject);
  const sourceOwner = Object.keys(record(input.proprietario)).length ? input.proprietario : first(existingProject, ['proprietario', 'prop_projeto'], {});
  const sourceResponsible = Object.keys(record(input.responsavel)).length ? input.responsavel : first(existingProject, ['responsavel', 'resp_projeto'], {});
  const sourceTechnical = Object.keys(record(input.technical)).length ? input.technical : first(existingProject, ['technical', 'projeto_responsavel_tecnico.0'], {});
  const occupations = normalizeOccupations(input, existingProject, base.occupationsDivisions);
  const measures = record(base.medida_seguranca);
  const projetoAnterior = input.projeto_anterior ?? String(first(existingProject, ['projetoAnterior', 'projeto_anterior'], 'N')).toUpperCase() === 'S';

  const payload: FenixProjectUpdatePayload = {
    ...updateBase,
    id: projectIdNumber,
    edificacao_id: buildingIdNumber,
    tipo_projeto_id: validation.tipoProjetoId,
    evento: String(input.evento ?? base.evento ?? 'N').toUpperCase() === 'S' ? 'S' : 'N',
    projetoAnterior: projetoAnterior ? 'S' : 'N',
    n_projeto_anterior: input.n_projeto_anterior ?? first(existingProject, ['n_projeto_anterior'], null),
    address: { ...existingAddress, ...sourceAddress, state: 'BA' },
    institution: sourceInstitution,
    occupationsDivisions: occupations,
    proprietario: sourceOwner,
    responsavel: sourceResponsible,
    technical: sourceTechnical,
    questionario: questionnaire,
    specialRisks: { ...specialRisks, total_kg_glp: input.total_kg_glp ?? inputRisks.total_kg_glp ?? existingRisks.total_kg_glp ?? rawRisks.total_kg_glp ?? null },
    securityMeasures: measures,
    classesGlp: input.classes_glp ?? first(existingProject, ['classesGlp', 'classes_glp'], base.classes_glp ?? []),
    comprovanteDae: first(existingProject, ['comprovanteDae', 'comprovante_dae'], {
      comprovanteDaeRequired: false,
      tipo_taxa: 'taxa-analise',
      tipo_taxaInc: 'taxa-incendio',
      taxa_incendio_isenta: 1,
      taxas: []
    })
  };

  return { valid: true, errors: [], warnings: validation.warnings, payload };
}

function normalizedResult(project: Record<string, any>, expectedId: number, expectedBuildingId: number, payload: FenixProjectUpdatePayload): FenixProjectUpdateResult {
  const id = Number(first(project, ['id', 'projeto_tecnico_id', 'technical_project_id'], 0));
  if (id !== expectedId) throw new FenixError('A leitura do Fênix não corresponde ao ID do Projeto Técnico editado.', 409);
  const buildingId = Number(first(project, ['edificacao_id', 'edification_id', 'edification.id', 'edification.edificacao_id', 'edification_id', 'edification.id'], 0));
  if (buildingId !== expectedBuildingId) throw new FenixError('A leitura do Fênix não confirmou o vínculo com a mesma edificação.', 409);

  const expectedReference = String(payload.reference_name || '').trim();
  const actualReference = String(first(project, ['reference_name', 'edification.reference_name', 'edificacao.reference_name'], '')).trim();
  const expectedArea = Number(payload.total_area);
  const actualArea = Number(first(project, ['total_area', 'edification.total_area', 'edificacao.total_area'], NaN));
  const expectedType = Number(payload.tipo_projeto_id);
  const actualType = Number(first(project, ['tipo_projeto_id', 'project_type_id'], NaN));
  if (!actualReference || actualReference !== expectedReference || !Number.isFinite(actualArea) || Math.abs(actualArea - expectedArea) > 0.01 || actualType !== expectedType) {
    throw new FenixError('A leitura posterior ainda não confirmou os campos principais da edição.', 409);
  }

  return {
    id,
    num_projeto: String(first(project, ['num_projeto', 'n_projeto', 'numero_projeto'], '')),
    edificacao_id: buildingId,
    ...(Number(first(project, ['solicitacao_id', 'solicitacao_atual.id', 'request_id'], 0)) > 0
      ? { solicitacao_id: Number(first(project, ['solicitacao_id', 'solicitacao_atual.id', 'request_id'], 0)) }
      : {})
  };
}

export async function submitFenixTechnicalProjectUpdate(
  userId: string,
  projectId: number,
  buildingId: number,
  payload: FenixProjectUpdatePayload
): Promise<{ verification: 'confirmed'; result: FenixProjectUpdateResult } | { verification: 'pending'; result: FenixProjectUpdateResult; error: string }> {
  const client = await fenixClientForUser(userId);
  let writeResponse: unknown;
  try {
    writeResponse = await client.put(`/api/v1/technicalproject/${projectId}`, payload);
  } catch (error) {
    const status = error instanceof FenixError ? error.status : undefined;
    if (status !== undefined && status >= 400 && status < 500 && ![408, 409, 425, 429].includes(status)) throw error;
    const response = await client.get(`/api/v1/projetos-tecnicos/${projectId}`).catch(() => null);
    if (!response) {
      return {
        verification: 'pending',
        result: { id: projectId, num_projeto: '', edificacao_id: buildingId },
        error: 'O resultado da atualização ficou incerto. Consulte o mesmo Projeto Técnico antes de repetir o envio.'
      };
    }
    try {
      const result = normalizedResult(unwrapProject(response), projectId, buildingId, payload);
      return { verification: 'confirmed', result };
    } catch {
      return {
        verification: 'pending',
        result: { id: projectId, num_projeto: '', edificacao_id: buildingId },
        error: 'O Fênix respondeu à atualização, mas a leitura ainda não confirmou as alterações. Consulte novamente antes de tentar de novo.'
      };
    }
  }

  const returnedProject = unwrapProject(writeResponse);
  const returnedNumber = String(first(returnedProject, ['num_projeto', 'n_projeto', 'numero_projeto'], ''));
  const fallbackResult: FenixProjectUpdateResult = { id: projectId, num_projeto: returnedNumber, edificacao_id: buildingId };
  try {
    const response = await client.get(`/api/v1/projetos-tecnicos/${projectId}`);
    const result = normalizedResult(unwrapProject(response), projectId, buildingId, payload);
    return { verification: 'confirmed', result: { ...fallbackResult, ...result, num_projeto: result.num_projeto || returnedNumber } };
  } catch {
    return {
      verification: 'pending',
      result: fallbackResult,
      error: 'O projeto foi atualizado, mas a leitura de confirmação ainda não comprovou os dados. Consulte novamente antes de tentar qualquer novo envio.'
    };
  }
}

export async function verifyFenixTechnicalProjectUpdate(
  userId: string,
  projectId: number,
  buildingId: number,
  payload: FenixProjectUpdatePayload
): Promise<FenixProjectUpdateResult> {
  const client = await fenixClientForUser(userId);
  const response = await client.get(`/api/v1/projetos-tecnicos/${projectId}`);
  return normalizedResult(unwrapProject(response), projectId, buildingId, payload);
}
