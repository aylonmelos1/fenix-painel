// Planos de envio de uploads por contexto (sem escrita no Fenix).
// Evidencia: bundle vivo /tmp/fenix-capture/js/app.05d2a1c1.js (~1,47 MB) + docs.
// Nenhuma funcao deste modulo faz rede: apenas descreve endpoint + campos exatos
// e valida IDs. O envio real permanece bloqueado ate homologacao com leitura
// posterior que devolva o documento recebido.

export type FenixUploadContextKey =
  | 'projeto_tecnico'
  | 'vistoria'
  | 'solicitacao'
  | 'retificacao'
  | 'remanejamento';

export type FenixUploadField = {
  key: string;
  kind: 'id' | 'text' | 'file';
  description: string;
};

export type FenixUploadContext = {
  key: FenixUploadContextKey;
  label: string;
  method: 'POST';
  pathTemplate: string;
  fileField: string;
  fields: FenixUploadField[];
  requiredIds: string[];
  limits: string;
  evidence: string;
  homologated: boolean;
};

export const FENIX_UPLOAD_BLOCKED_MESSAGE =
  'Envio ao CBMBA bloqueado: contrato multipart e leitura de recebimento ainda sem homologacao. Arquivo segue guardado apenas no Painel.';

export function isFenixUploadSendEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.FENIX_UPLOAD_SEND_ENABLED || '').trim() === '1';
}

export const FENIX_UPLOAD_CONTEXTS: FenixUploadContext[] = [
  {
    key: 'projeto_tecnico',
    label: 'Projeto tecnico / analise / PTS',
    method: 'POST',
    pathTemplate: '/api/v1/technicalprojectdocs',
    fileField: 'technical_documents[i]',
    fields: [
      { key: 'projeto_tecnico_id[i]', kind: 'id', description: 'ID do projeto tecnico (parseToForm fieldName projeto_tecnico_id)' },
      { key: 'tipo_documento[i]', kind: 'text', description: 'Tipo oficial da lista de documentos solicitados' },
      { key: 'descricao[i]', kind: 'text', description: 'Descricao do arquivo' },
      { key: 'technical_documents[i]', kind: 'file', description: 'Binario do arquivo' },
      { key: 'solicitacao_id', kind: 'id', description: 'ID da solicitacao (escalar, fora do indice)' },
      { key: 'spt_id', kind: 'id', description: 'Opcional: ID da solicitacao de projeto tecnico quando presente' },
      { key: 'usuario_id', kind: 'id', description: 'Opcional: ID do usuario quando showUploadVistoriaDetalhes' },
    ],
    requiredIds: ['projetoTecnicoId', 'solicitacaoId'],
    limits: 'Respeitar maxAnexos/totalAnexos da tela; 203 com msg e um erro; 409 requestAlreadyModified exige reconciliacao; rejeitados (slug_analise=rejeitado) precisam ser excluidos antes.',
    evidence: 'bundle Rh.parseToForm + save() -> POST technicalprojectdocs; DocumentUploadingV2 utilization analise/PTS',
    homologated: false,
  },
  {
    key: 'vistoria',
    label: 'Vistoria (survey)',
    method: 'POST',
    pathTemplate: '/api/v1/documents-survey-store',
    fileField: 'survey_documents[i]',
    fields: [
      { key: 'solicitacao_id[i]', kind: 'id', description: 'ID da solicitacao por indice (parseToForm fieldName solicitacao_id)' },
      { key: 'tipo_documento[i]', kind: 'text', description: 'Tipo oficial da lista de documentos solicitados de vistoria' },
      { key: 'descricao[i]', kind: 'text', description: 'Descricao do arquivo' },
      { key: 'survey_documents[i]', kind: 'file', description: 'Binario do arquivo' },
      { key: 'solicitacao_id', kind: 'id', description: 'ID da solicitacao (escalar, fora do indice)' },
      { key: 'spt_id', kind: 'id', description: 'Opcional: spt_id quando presente na tela' },
      { key: 'usuario_id', kind: 'id', description: 'Opcional: ID do usuario quando showUploadVistoriaDetalhes' },
    ],
    requiredIds: ['solicitacaoId'],
    limits: 'typeDocsProps=survey_documents quando tipo_solicitacao_id 3/4; mesmos 203/409 do saveSurvey().',
    evidence: 'bundle validate() + DocumentUploadingV2 utilization vistoria -> saveSurvey -> POST documents-survey-store',
    homologated: false,
  },
  {
    key: 'solicitacao',
    label: 'Solicitacao existente (documentos)',
    method: 'POST',
    pathTemplate: '/api/v1/solicitacoes/{solicitacao_id}/documentos',
    fileField: '(FormData da tela — campos exatos ainda sem captura)',
    fields: [
      { key: 'solicitacao_id (path)', kind: 'id', description: 'ID da solicitacao no path' },
      { key: 'body (FormData)', kind: 'file', description: 'Corpo FormData observado na interface; campos exatos pendentes de captura de rede' },
    ],
    requiredIds: ['solicitacaoId'],
    limits: 'DELETE /api/v1/solicitacoes/{id}/documentos/{doc} existe no bundle; sem captura de envio no perfil solicitante.',
    evidence: 'bundle service enviarDocumento -> POST solicitacoes/{id}/documentos (sem caller capturado no perfil)',
    homologated: false,
  },
  {
    key: 'retificacao',
    label: 'Retificacao em andamento',
    method: 'POST',
    pathTemplate: '/api/v1/solicitacoes/{solicitacao_id}/retificacoes/{retificacao_id}/documentos',
    fileField: '(FormData da tela — passthrough do boxDocumentUploading)',
    fields: [
      { key: 'solicitacao_id (path)', kind: 'id', description: 'ID da solicitacao no path' },
      { key: 'retificacao_id (path)', kind: 'id', description: 'ID da retificacao no path' },
      { key: 'body (FormData)', kind: 'file', description: 'FormData montado pelo componente de upload da retificacao; download devolve {arquivo base64, nome}' },
    ],
    requiredIds: ['solicitacaoId', 'retificacaoId'],
    limits: 'GET colecao/detalhe/download e DELETE .../documentos/{doc} existem no bundle; sem captura de envio.',
    evidence: 'bundle Ir.salvarDocumentos(solicitacao.id, retificacao.id, FormData) -> POST .../retificacoes/{rid}/documentos',
    homologated: false,
  },
  {
    key: 'remanejamento',
    label: 'Remanejamento (pendente de documentacao)',
    method: 'POST',
    pathTemplate: '/api/v1/remanejamentos/{remanejamento_id}/documentos',
    fileField: 'documentos[i][arquivo]',
    fields: [
      { key: 'documentos[i][tipo]', kind: 'text', description: 'Ex.: vinculo_processo' },
      { key: 'documentos[i][descricao]', kind: 'text', description: 'Descricao do documento' },
      { key: 'documentos[i][nome]', kind: 'text', description: 'Nome do arquivo' },
      { key: 'documentos[i][arquivo]', kind: 'file', description: 'Binario do arquivo' },
    ],
    requiredIds: ['remanejamentoId'],
    limits: 'So em pendente-documentacao; max 3 arquivos no total; PDF ate 5 MB (texto da tela); solicitar exige >=1 documento.',
    evidence: 'bundle Wc.salvarDocumentos + remanejamento-form enviarDocumentos: documentos[t][campo] via FormData',
    homologated: false,
  },
];

export function getFenixUploadContext(key: string): FenixUploadContext | null {
  return FENIX_UPLOAD_CONTEXTS.find((item) => item.key === key) || null;
}

export type FenixUploadPlanInput = {
  context: string;
  projetoTecnicoId?: unknown;
  solicitacaoId?: unknown;
  retificacaoId?: unknown;
  remanejamentoId?: unknown;
  sptId?: unknown;
  usuarioId?: unknown;
  tipoDocumento?: unknown;
  descricao?: unknown;
  fileName?: unknown;
};

export type FenixUploadPlan = {
  context: FenixUploadContextKey;
  method: 'POST';
  endpoint: string;
  fields: Array<{ key: string; value: string }>;
  fileField: string;
  blocked: true;
  blockReason: string;
};

function numericId(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return /^[1-9][0-9]{0,11}$/.test(text) ? text : null;
}

export function buildFenixUploadPlan(input: FenixUploadPlanInput): FenixUploadPlan {
  const context = getFenixUploadContext(String(input.context || ''));
  if (!context) throw new Error('Selecione um contexto de envio valido.');
  const tipo = String(input.tipoDocumento || '').trim().slice(0, 120);
  if (!tipo) throw new Error('Informe o tipo documental oficial.');
  const fileName = String(input.fileName || '').trim().slice(0, 180);
  if (!fileName) throw new Error('Selecione o arquivo guardado no Painel.');
  const descricao = String(input.descricao || '').trim().slice(0, 280);

  if (context.key === 'projeto_tecnico') {
    const projetoId = numericId(input.projetoTecnicoId);
    const solicitacaoId = numericId(input.solicitacaoId);
    if (!projetoId) throw new Error('Informe o ID numerico do projeto tecnico.');
    if (!solicitacaoId) throw new Error('Informe o ID numerico da solicitacao.');
    const sptId = numericId(input.sptId);
    const usuarioId = numericId(input.usuarioId);
    const fields = [
      { key: 'projeto_tecnico_id[0]', value: projetoId },
      { key: 'tipo_documento[0]', value: tipo },
      { key: 'descricao[0]', value: descricao || fileName },
      { key: 'technical_documents[0]', value: `arquivo:${fileName}` },
      { key: 'solicitacao_id', value: solicitacaoId },
      ...(sptId ? [{ key: 'spt_id', value: sptId }] : []),
      ...(usuarioId ? [{ key: 'usuario_id', value: usuarioId }] : []),
    ];
    return { context: context.key, method: 'POST', endpoint: '/api/v1/technicalprojectdocs', fields, fileField: 'technical_documents[0]', blocked: true, blockReason: FENIX_UPLOAD_BLOCKED_MESSAGE };
  }

  if (context.key === 'vistoria') {
    const solicitacaoId = numericId(input.solicitacaoId);
    if (!solicitacaoId) throw new Error('Informe o ID numerico da solicitacao.');
    const sptId = numericId(input.sptId);
    const usuarioId = numericId(input.usuarioId);
    const fields = [
      { key: 'solicitacao_id[0]', value: solicitacaoId },
      { key: 'tipo_documento[0]', value: tipo },
      { key: 'descricao[0]', value: descricao || fileName },
      { key: 'survey_documents[0]', value: `arquivo:${fileName}` },
      { key: 'solicitacao_id', value: solicitacaoId },
      ...(sptId ? [{ key: 'spt_id', value: sptId }] : []),
      ...(usuarioId ? [{ key: 'usuario_id', value: usuarioId }] : []),
    ];
    return { context: context.key, method: 'POST', endpoint: '/api/v1/documents-survey-store', fields, fileField: 'survey_documents[0]', blocked: true, blockReason: FENIX_UPLOAD_BLOCKED_MESSAGE };
  }

  if (context.key === 'solicitacao') {
    const solicitacaoId = numericId(input.solicitacaoId);
    if (!solicitacaoId) throw new Error('Informe o ID numerico da solicitacao.');
    return {
      context: context.key, method: 'POST', endpoint: `/api/v1/solicitacoes/${solicitacaoId}/documentos`,
      fields: [
        { key: 'solicitacao_id (path)', value: solicitacaoId },
        { key: 'tipo_documento', value: tipo },
        { key: 'arquivo', value: `arquivo:${fileName}` },
      ],
      fileField: '(FormData da tela — campos exatos ainda sem captura)', blocked: true, blockReason: FENIX_UPLOAD_BLOCKED_MESSAGE,
    };
  }

  if (context.key === 'retificacao') {
    const solicitacaoId = numericId(input.solicitacaoId);
    const retificacaoId = numericId(input.retificacaoId);
    if (!solicitacaoId) throw new Error('Informe o ID numerico da solicitacao.');
    if (!retificacaoId) throw new Error('Informe o ID numerico da retificacao.');
    return {
      context: context.key, method: 'POST', endpoint: `/api/v1/solicitacoes/${solicitacaoId}/retificacoes/${retificacaoId}/documentos`,
      fields: [
        { key: 'solicitacao_id (path)', value: solicitacaoId },
        { key: 'retificacao_id (path)', value: retificacaoId },
        { key: 'tipo_documento', value: tipo },
        { key: 'arquivo', value: `arquivo:${fileName}` },
      ],
      fileField: '(FormData da tela — passthrough do boxDocumentUploading)', blocked: true, blockReason: FENIX_UPLOAD_BLOCKED_MESSAGE,
    };
  }

  const remanejamentoId = numericId(input.remanejamentoId);
  if (!remanejamentoId) throw new Error('Informe o ID numerico do remanejamento.');
  return {
    context: context.key, method: 'POST', endpoint: `/api/v1/remanejamentos/${remanejamentoId}/documentos`,
    fields: [
      { key: 'documentos[0][tipo]', value: tipo },
      { key: 'documentos[0][descricao]', value: descricao || fileName },
      { key: 'documentos[0][nome]', value: fileName },
      { key: 'documentos[0][arquivo]', value: `arquivo:${fileName}` },
    ],
    fileField: 'documentos[0][arquivo]', blocked: true, blockReason: FENIX_UPLOAD_BLOCKED_MESSAGE,
  };
}
