import test from 'node:test';
import assert from 'node:assert/strict';
import { computeFenixProcessActions } from './fenix.js';
import {
  FENIX_EDIFICACAO_FILTER_KEYS,
  FENIX_PROJETO_TECNICO_FILTER_KEYS,
  FENIX_SOLICITACAO_FILTER_KEYS,
  annotateFenixActionsWithEligibility,
  buildFenixListQuery,
  filterLocalRequestsByFenixFilters,
  parseFenixListQuery,
  parsePermissionResponse,
  resolveActionEligibility,
} from './fenix-eligibility.js';

// URLs reais da captura viva /tmp/fenix-capture/rede-cdp.json (somente leitura).
const LIVE_REQUEST_URL =
  'https://fenix.cbm.ba.gov.br/api/v1/request?perPage=10&page=1&tipoPessoa=Todas&ordenacao=prioridade&solicitacaoFiltros=%7B%22tipoServico%22:null,%22status%22:null,%22renovacao%22:null,%22evento%22:null,%22dataInicial%22:null,%22dataFinal%22:null,%22protocolo%22:null,%22n_notificacao%22:null,%22n_acp%22:null,%22n_avcb%22:null,%22solicitacao%22:null,%22seq_dae_emitido%22:null,%22vistoriador_id%22:null,%22analista_pt_id%22:null,%22analista_pts_id%22:null%7D&projetoTecnicoFiltros=%7B%22tipoProjeto%22:null,%22tipoIsencao%22:null,%22creacau%22:null,%22nomeResponsavelTecnico%22:null,%22cpfResponsavelTecnico%22:null,%22cnpjResponsavelTecnico%22:null,%22projeto%22:null,%22ocupacao%22:null,%22divisao%22:null,%22risco%22:null%7D&edificacaoFiltros=%7B%22altura%22:null,%22area%22:null,%22unidade%22:null,%22municipio%22:null,%22servidor%22:null,%22nomeReferencia%22:null%7D&tipo_lista=solicitacoes&search=false';

const LIVE_SURVEY_URL =
  'https://fenix.cbm.ba.gov.br/api/v1/survey?perPage=10&page=1&orderBy=n_solicitacao_format&orderType=ASC&tipo_lista=vistoria_revistoria&tipoPessoa=Todas&solicitacaoFiltros=%7B%22tipoServico%22:null,%22status%22:null,%22evento%22:null,%22dataInicial%22:null,%22dataFinal%22:null,%22protocolo%22:null,%22solicitacao%22:null%7D&projetoTecnicoFiltros=%7B%22creacau%22:null,%22nomeResponsavelTecnico%22:null,%22cpfResponsavelTecnico%22:null,%22cnpjResponsavelTecnico%22:null,%22projeto%22:null,%22ocupacao%22:null,%22divisao%22:null,%22risco%22:null%7D&edificacaoFiltros=%7B%22altura%22:null,%22area%22:null,%22unidade%22:null,%22municipio%22:null,%22servidor%22:null,%22nomeReferencia%22:null%7D';

const LIVE_TECHNICALPROJECT_URL =
  'https://fenix.cbm.ba.gov.br/api/v1/technicalproject?perPage=10&page=1&orderBy=reference_name&orderType=ASC&tipoPessoa=Todas&projetoTecnicoFiltros=%7B%22creacau%22:null,%22nomeResponsavelTecnico%22:null,%22cpfResponsavelTecnico%22:null,%22cnpjResponsavelTecnico%22:null,%22projeto%22:null,%22ocupacao%22:null,%22divisao%22:null,%22risco%22:null%7D&edificacaoFiltros=%7B%22altura%22:null,%22area%22:null,%22unidade%22:null,%22municipio%22:[],%22servidor%22:null,%22nomeReferencia%22:null%7D&projeto_completo=true&consultaParcial=true';

test('parseFenixListQuery: lista request da captura viva', () => {
  const parsed = parseFenixListQuery(LIVE_REQUEST_URL);
  assert.equal(parsed.list, 'request');
  assert.equal(parsed.tipoLista, 'solicitacoes');
  assert.equal(parsed.tipoPessoa, 'Todas');
  assert.equal(parsed.ordenacao, 'prioridade');
  assert.deepEqual(Object.keys(parsed.solicitacaoFiltros).sort(), [...FENIX_SOLICITACAO_FILTER_KEYS].sort());
  assert.deepEqual(Object.keys(parsed.projetoTecnicoFiltros).sort(), [...FENIX_PROJETO_TECNICO_FILTER_KEYS].sort());
  assert.deepEqual(Object.keys(parsed.edificacaoFiltros).sort(), [...FENIX_EDIFICACAO_FILTER_KEYS].sort());
  // Campos novos da captura que o painel ainda não consumia.
  assert.ok('vistoriador_id' in parsed.solicitacaoFiltros);
  assert.ok('analista_pt_id' in parsed.solicitacaoFiltros);
  assert.ok('analista_pts_id' in parsed.solicitacaoFiltros);
  assert.ok('tipoIsencao' in parsed.projetoTecnicoFiltros);
});

test('parseFenixListQuery: lista survey vistoria_revistoria', () => {
  const parsed = parseFenixListQuery(LIVE_SURVEY_URL);
  assert.equal(parsed.list, 'survey');
  assert.equal(parsed.tipoLista, 'vistoria_revistoria');
  assert.equal(parsed.orderBy, 'n_solicitacao_format');
  assert.equal(parsed.orderType, 'ASC');
});

test('parseFenixListQuery: technicalproject com flags de projeto completo', () => {
  const parsed = parseFenixListQuery(LIVE_TECHNICALPROJECT_URL);
  assert.equal(parsed.list, 'technicalproject');
  assert.equal(parsed.projetoCompleto, true);
  assert.equal(parsed.consultaParcial, true);
  assert.deepEqual(parsed.edificacaoFiltros.municipio, []);
});

test('buildFenixListQuery: reconstrói consulta de request em round-trip', () => {
  const parsed = parseFenixListQuery(LIVE_REQUEST_URL);
  const rebuilt = buildFenixListQuery('request', {
    tipoLista: parsed.tipoLista,
    tipoPessoa: parsed.tipoPessoa,
    ordenacao: parsed.ordenacao,
    solicitacaoFiltros: parsed.solicitacaoFiltros,
    projetoTecnicoFiltros: parsed.projetoTecnicoFiltros,
    edificacaoFiltros: parsed.edificacaoFiltros,
  });
  const reparsed = parseFenixListQuery(`https://fenix.cbm.ba.gov.br/api/v1/request?${rebuilt.toString()}`);
  assert.equal(reparsed.tipoLista, 'solicitacoes');
  assert.equal(reparsed.tipoPessoa, 'Todas');
  assert.deepEqual(reparsed.solicitacaoFiltros, parsed.solicitacaoFiltros);
});

test('parseFenixListQuery: rejeita tipo_lista desconhecido sem inventar filtro', () => {
  const parsed = parseFenixListQuery('https://fenix.cbm.ba.gov.br/api/v1/request?tipo_lista=lista_inexistente');
  assert.equal(parsed.tipoLista, null);
});

test('parsePermissionResponse: corpo sintético de solicitacoes permitidas', () => {
  // A captura viva prova apenas HTTP 200 dos POSTs de permissão; o formato
  // abaixo é sintético e serve para fixar o contrato local de elegibilidade.
  const body = {
    data: {
      permitidas: [
        { solicitacao_id: 10, acoes: ['solicitar_vistoria', 'solicitar_revistoria'] },
        { solicitacao_id: 11, acoes: ['solicitar_reanalise'] },
      ],
    },
  };
  const parsed = parsePermissionResponse(body, 'solicitacoes');
  assert.equal(parsed.source, 'oficial');
  assert.equal(parsed.entries.get('10')?.allowedActions.has('solicitar_vistoria'), true);
  assert.equal(parsed.entries.get('11')?.allowedActions.has('solicitar_vistoria'), false);
});

test('parsePermissionResponse: formato desconhecido vira desconhecido, nunca permitido', () => {
  const parsed = parsePermissionResponse({ inesperado: true }, 'retificacoes');
  assert.equal(parsed.source, 'desconhecida');
  assert.equal(parsed.entries.size, 0);
});

test('resolveActionEligibility: oficial nega mesmo com heurística favorável', () => {
  assert.equal(
    resolveActionEligibility('solicitar_vistoria', true, { allowed: false, source: 'oficial' }),
    'oficial-bloqueada',
  );
  assert.equal(
    resolveActionEligibility('solicitar_vistoria', true, { allowed: true, source: 'oficial' }),
    'oficial-permitida',
  );
  assert.equal(resolveActionEligibility('solicitar_vistoria', true, null), 'heuristica-nao-confirmada');
  assert.equal(resolveActionEligibility('solicitar_vistoria', false, null), 'heuristica-bloqueada');
});

test('annotateFenixActionsWithEligibility: remove mutação negada pelo oficial', () => {
  const actions = [
    { key: 'solicitar_vistoria', label: 'Solicitar Vistoria', kind: 'mutation' },
    { key: 'baixar_protocolo', label: 'Baixar Protocolo', kind: 'download' },
  ] as any[];
  const annotated = annotateFenixActionsWithEligibility(actions, {
    solicitar_vistoria: { allowed: false, source: 'oficial' },
  });
  assert.deepEqual(annotated.map((a: any) => a.key), ['baixar_protocolo']);
});

test('annotateFenixActionsWithEligibility: sem permissão marca heurística não confirmada', () => {
  const actions = [{ key: 'solicitar_revistoria', label: 'Solicitar Revistoria', kind: 'mutation' }] as any[];
  const annotated = annotateFenixActionsWithEligibility(actions, null);
  assert.equal((annotated[0] as any).eligibility, 'heuristica-nao-confirmada');
});

test('computeFenixProcessActions: mutação sai como heurística não confirmada por padrão', () => {
  const actions = computeFenixProcessActions({
    process: {
      id: 'request:40002',
      protocol: '0028102-5/2026',
      type: 'Vistoria · AVCB',
      status: 'Pendente de Pagamento',
    },
    buildingId: 'building-1',
  });
  const cancel = actions.find((a) => a.key === 'cancelar_solicitacao')!;
  assert.ok(cancel);
  assert.equal(cancel.kind, 'mutation');
  assert.equal(cancel.eligibility, 'heuristica-nao-confirmada');
});

test('computeFenixProcessActions: permissão oficial negada remove a mutação', () => {
  const base = {
    process: {
      id: 'request:40002',
      protocol: '0028102-5/2026',
      type: 'Vistoria · AVCB',
      status: 'Pendente de Pagamento',
    },
    buildingId: 'building-1',
  };
  const denied = computeFenixProcessActions(base, 'building-1', {
    cancelar_solicitacao: { allowed: false, source: 'oficial' },
  });
  assert.equal(denied.some((a) => a.key === 'cancelar_solicitacao'), false);
  const allowed = computeFenixProcessActions(base, 'building-1', {
    cancelar_solicitacao: { allowed: true, source: 'oficial' },
  });
  assert.equal(allowed.find((a) => a.key === 'cancelar_solicitacao')?.eligibility, 'oficial-permitida');
});

test('filterLocalRequestsByFenixFilters: filtra snapshot local sem rede', () => {
  const rows = [
    { id: 'a', service_type: 'Vistoria', status: 'Notificado', renewal: 'Não', event: '', request_number: '1', protocol_number: 'P1', municipality: 'Salvador' },
    { id: 'b', service_type: 'Análise', status: 'Homologado', renewal: 'Sim', event: '', request_number: '2', protocol_number: 'P2', municipality: 'Lauro' },
  ];
  const onlyVistoria = filterLocalRequestsByFenixFilters(rows as any[], { tipoServico: 'vistoria' } as any);
  assert.deepEqual(onlyVistoria.map((r: any) => r.id), ['a']);
  const onlyHomologado = filterLocalRequestsByFenixFilters(rows as any[], { status: 'homologado' } as any);
  assert.deepEqual(onlyHomologado.map((r: any) => r.id), ['b']);
  const emptyFilter = filterLocalRequestsByFenixFilters(rows as any[], {});
  assert.equal(emptyFilter.length, 2);
});
