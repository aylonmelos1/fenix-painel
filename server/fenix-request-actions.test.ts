import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { CookieJar } from 'tough-cookie';
import {
  computeFenixProcessActions,
  FenixClient,
  FenixError,
  fenixWriteRegraOf,
  resolveGerarSolicitacaoTipoId,
  type FenixProcessAction,
  type FenixProcessMeta
} from './fenix.js';

test('1. computeFenixProcessActions: Processo Notificado em Vistoria', () => {
  const actions = computeFenixProcessActions({
    process: {
      id: 'request:39315',
      protocol: '0030596-5/2024',
      type: 'Vistoria · AVCB',
      status: 'Notificado Vistoria',
      stage: 'Notificado Vistoria',
      building_id: 'building-1'
    },
    buildingId: 'building-1'
  });

  const keys = actions.map((a) => a.key);
  assert.deepEqual(keys, ['solicitar_revistoria', 'baixar_notificacao', 'baixar_protocolo']);

  const revistoria = actions.find((a) => a.key === 'solicitar_revistoria')!;
  assert.equal(revistoria.icon, 'walk_transfer');
  assert.equal(revistoria.tone, 'wine');
  assert.equal(revistoria.kind, 'mutation');
  assert.equal(revistoria.label, 'Solicitar Revistoria');

  const notificacao = actions.find((a) => a.key === 'baixar_notificacao')!;
  assert.equal(notificacao.icon, 'cloud_wine');
  assert.equal(notificacao.tone, 'wine');
  assert.equal(notificacao.kind, 'download');

  const protocolo = actions.find((a) => a.key === 'baixar_protocolo')!;
  assert.equal(protocolo.icon, 'cloud_green');
  assert.equal(protocolo.tone, 'green');
  assert.equal(protocolo.kind, 'download');

  // NUNCA incluir botão Visualizar/olho
  assert.equal(actions.some((a) => (a as any).icon === 'eye' || a.key.includes('visualizar')), false);
});

test('2. computeFenixProcessActions: Processo Notificado em Renovação', () => {
  const actions = computeFenixProcessActions({
    process: {
      id: 'request:39316',
      protocol: '0030597-5/2024',
      type: 'Renovação · AVCB',
      status: 'Notificado',
      stage: 'Notificado',
      payload: {
        fenixMeta: {
          renovacao: true,
          statusSlug: 'notificado'
        }
      }
    },
    buildingId: 'building-1'
  });

  const keys = actions.map((a) => a.key);
  assert.deepEqual(keys, ['reavaliacao_renovacao', 'baixar_notificacao', 'baixar_protocolo']);

  const reavaliacao = actions.find((a) => a.key === 'reavaliacao_renovacao')!;
  assert.equal(reavaliacao.icon, 'autorenew');
  assert.equal(reavaliacao.tone, 'wine');
  assert.equal(reavaliacao.kind, 'mutation');

  assert.equal(actions.some((a) => (a as any).icon === 'eye' || a.key.includes('visualizar')), false);
});

test('3. computeFenixProcessActions: Processo Notificado em Análise de Projeto Técnico', () => {
  const actions = computeFenixProcessActions({
    process: {
      id: 'technicalproject:28099',
      protocol: '0028099-5/2026',
      type: 'Análise de Projeto Técnico · PT',
      status: 'Notificado',
      stage: 'Em Notificação',
      building_id: 'building-1'
    },
    buildingId: 'building-1'
  });

  const keys = actions.map((a) => a.key);
  assert.deepEqual(keys, ['editar_projeto', 'baixar_notificacao', 'baixar_protocolo']);

  const editar = actions.find((a) => a.key === 'editar_projeto')!;
  assert.equal(editar.icon, 'edit');
  assert.equal(editar.tone, 'wine');
  assert.equal(editar.kind, 'edit_draft');

  assert.equal(actions.some((a) => (a as any).icon === 'eye' || a.key.includes('visualizar')), false);
});

test('4. computeFenixProcessActions: Processo Homologado em Análise PT', () => {
  const actions = computeFenixProcessActions({
    process: {
      id: 'technicalproject:28100',
      protocol: '0028100-5/2026',
      type: 'PT · AVCB',
      status: 'Homologado',
      stage: 'Homologado',
      building_id: 'building-1'
    },
    buildingId: 'building-1'
  });

  const keys = actions.map((a) => a.key);
  assert.deepEqual(keys, ['solicitar_vistoria', 'baixar_certificado', 'baixar_protocolo']);

  const vistoria = actions.find((a) => a.key === 'solicitar_vistoria')!;
  assert.equal(vistoria.icon, 'walk_transfer');
  assert.equal(vistoria.tone, 'wine');
  assert.equal(vistoria.kind, 'mutation');

  const certificado = actions.find((a) => a.key === 'baixar_certificado')!;
  assert.equal(certificado.icon, 'cloud_wine');
  assert.equal(certificado.tone, 'wine');
  assert.equal(certificado.kind, 'download');

  const protocolo = actions.find((a) => a.key === 'baixar_protocolo')!;
  assert.equal(protocolo.icon, 'cloud_green');
  assert.equal(protocolo.tone, 'green');
  assert.equal(protocolo.kind, 'download');

  assert.equal(actions.some((a) => (a as any).icon === 'eye' || a.key.includes('visualizar')), false);
});

test('5. computeFenixProcessActions: Processo Pendente de Pagamento', () => {
  // 5.1 Projeto Técnico pendente de pagamento -> cancelar_processo e SEM baixar_protocolo
  const actionsPt = computeFenixProcessActions({
    process: {
      id: 'request:40001',
      protocol: '0028101-5/2026',
      type: 'Projeto Técnico',
      status: 'Pendente de Pagamento',
      stage: 'Aguardando Pagamento DAE'
    },
    buildingId: 'building-1'
  });

  assert.deepEqual(actionsPt.map((a) => a.key), ['cancelar_processo']);
  assert.ok(actionsPt[0]);
  assert.equal(actionsPt[0].icon, 'cancel');
  assert.equal(actionsPt[0].tone, 'danger');
  assert.equal(actionsPt[0].kind, 'mutation');
  assert.equal(actionsPt.some((a) => a.key === 'baixar_protocolo'), false);

  // 5.2 Vistoria pendente de pagamento -> cancelar_solicitacao e SEM baixar_protocolo
  const actionsVistoria = computeFenixProcessActions({
    process: {
      id: 'request:40002',
      protocol: '0028102-5/2026',
      type: 'Vistoria · AVCB',
      status: 'Pendente de Pagamento'
    },
    buildingId: 'building-1'
  });

  assert.deepEqual(actionsVistoria.map((a) => a.key), ['cancelar_solicitacao']);
  assert.ok(actionsVistoria[0]);
  assert.equal(actionsVistoria[0].icon, 'cancel');
  assert.equal(actionsVistoria[0].tone, 'danger');
  assert.equal(actionsVistoria[0].kind, 'mutation');
  assert.equal(actionsVistoria.some((a) => a.key === 'baixar_protocolo'), false);
});

test('6. Servidor local mockando Fênix upstream: postFormData, gerarRelatorioProtocoloSolicitacao, gerarNumeroSolicitacao e definirStatusV2', async () => {
  const receivedRequests: Array<{ url: string; method: string; contentType?: string; body: string }> = [];

  const fakePdf = Buffer.from('%PDF-1.4 Fake Official Protocol Content For Testing');
  const fakeCertPdf = Buffer.from('%PDF-1.4 Fake Official Approval Certificate Content For Testing');

  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    receivedRequests.push({
      url: req.url || '',
      method: req.method || '',
      contentType: req.headers['content-type'],
      body
    });

    if (req.url === '/api/v1/gerarRelatorioProtocoloSolicitacao') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        arquivo: fakePdf.toString('base64'),
        nome_arquivo: 'protocolo-solicitacao-39315.pdf'
      }));
      return;
    }

    if (req.url === '/api/v1/gerarNumeroSolicitacao') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        numero_solicitacao: '0030596-5/2026',
        solicitacao_id: 99887
      }));
      return;
    }

    if (req.url === '/api/v1/request/definirStatusV2') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        message: 'Status atualizado com sucesso no Fênix.'
      }));
      return;
    }

    if (req.url === '/api/v1/setProjectStatus') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        message: 'Projeto cancelado com sucesso no Fênix.'
      }));
      return;
    }

    if (req.url === '/api/v1/request/download') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        arquivo: fakeCertPdf.toString('base64'),
        nome_arquivo: 'certificado-oficial-39315.pdf'
      }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input: any, init?: any) => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(rawUrl);
    if (url.origin === 'https://fenix.cbm.ba.gov.br') {
      const redirectedUrl = new URL(url.pathname + url.search, `http://127.0.0.1:${port}`);
      return originalFetch(redirectedUrl.toString(), init);
    }
    return originalFetch(input, init);
  };

  try {
    const jar = new CookieJar();
    jar.setCookieSync('XSRF-TOKEN=mock-token-xyz; Path=/', 'https://fenix.cbm.ba.gov.br');
    const client = new FenixClient(jar);

    // 1. Teste postFormData com gerarRelatorioProtocoloSolicitacao
    const reportResp = await client.postFormData('/api/v1/gerarRelatorioProtocoloSolicitacao', {
      solicitacao_id: 39315
    }) as any;
    assert.ok(reportResp.arquivo);
    assert.equal(reportResp.nome_arquivo, 'protocolo-solicitacao-39315.pdf');

    const req1 = receivedRequests.find((r) => r.url === '/api/v1/gerarRelatorioProtocoloSolicitacao');
    assert.ok(req1);
    assert.ok(req1.contentType?.includes('multipart/form-data'));
    assert.ok(req1.body.includes('solicitacao_id'));
    assert.ok(req1.body.includes('39315'));

    // 2. Teste postFormData com gerarNumeroSolicitacao
    const solicitacaoResp = await client.postFormData('/api/v1/gerarNumeroSolicitacao', {
      projeto_tecnico_id: 1234,
      status_slug: 'pendente-de-documentacao',
      status_slug_old: 'notificado',
      responsavel_id: 5678,
      tipo_solicitacao_id: 4,
      solicitacao_id: 39315
    }) as any;
    assert.equal(solicitacaoResp.ok, true);
    assert.equal(solicitacaoResp.numero_solicitacao, '0030596-5/2026');

    const req2 = receivedRequests.find((r) => r.url === '/api/v1/gerarNumeroSolicitacao');
    assert.ok(req2);
    assert.ok(req2.contentType?.includes('multipart/form-data'));
    assert.ok(req2.body.includes('projeto_tecnico_id'));
    assert.ok(req2.body.includes('1234'));
    assert.ok(req2.body.includes('tipo_solicitacao_id'));
    assert.ok(req2.body.includes('4'));

    // 3. Teste post com definirStatusV2
    const statusResp = await client.post('/api/v1/request/definirStatusV2', {
      solicitacao_id: 39315,
      spt_id: 777,
      action: 'edit-reavaliacao-renovacao',
      justificativa: null,
      dados: { id: 39315, ref: 'test' }
    }) as any;
    assert.equal(statusResp.ok, true);

    const req3 = receivedRequests.find((r) => r.url === '/api/v1/request/definirStatusV2');
    assert.ok(req3);
    assert.ok(req3.contentType?.includes('application/json'));
    const parsedReq3 = JSON.parse(req3.body);
    assert.equal(parsedReq3.action, 'edit-reavaliacao-renovacao');
    assert.equal(parsedReq3.solicitacao_id, 39315);
    assert.equal(parsedReq3.spt_id, 777);

    // 4. Teste post com setProjectStatus
    const cancelResp = await client.post('/api/v1/setProjectStatus', {
      projeto_tecnico_id: 1234,
      solicitacao_id: 39315,
      spt_id: 777,
      status_slug: 'cancelado',
      responsavel_id: 0,
      tipo_requisicao: 'cancelar-processo',
      num_projeto: 'DEMO-999999/40000000/2099'
    }) as any;
    assert.equal(cancelResp.ok, true);

    const req4 = receivedRequests.find((r) => r.url === '/api/v1/setProjectStatus');
    assert.ok(req4);
    assert.equal(JSON.parse(req4.body).status_slug, 'cancelado');

  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// Escopo 5: gates de cancelamento alinhados aos show* ao vivo
// (bundle app.05d2a1c1.js). Com slug oficial vale a regra exata; sem slug
// vale a heurística local (coberta pelos testes 5.1/5.2 acima).
test('7. computeFenixProcessActions: cancelamento segue slugs ao vivo', () => {
  const base = (meta: Record<string, unknown>) => ({
    process: {
      id: 'request:50001',
      protocol: '0050001-5/2026',
      type: 'Solicitação',
      status: 'Pendente de Documentação',
      stage: 'Pendente de Documentação',
      building_id: 'building-1',
      payload: { fenixMeta: { statusSlug: 'pendente-de-documentacao', ...meta } }
    },
    buildingId: 'building-1'
  });

  // slug vistoria + pendente-doc -> cancelar_solicitacao (sem protocolo na exclusão)
  assert.deepEqual(
    computeFenixProcessActions(base({ tipoSolicitacaoSlug: 'vistoria' })).map((a) => a.key),
    ['cancelar_solicitacao']
  );

  // slug revistoria + pendente-pagamento -> nenhum cancel (ao vivo só 'vistoria'; tipo 4 fora do processo)
  assert.deepEqual(
    computeFenixProcessActions(base({ statusSlug: 'pendente-de-pagamento', tipoSolicitacaoSlug: 'revistoria', tipoSolicitacaoId: 4 })).map((a) => a.key),
    []
  );

  // ptsavcb-analise + renovacao + pendente -> cancelar_solicitacao
  assert.deepEqual(
    computeFenixProcessActions(base({ tipoSolicitacaoSlug: 'ptsavcb-analise', renovacao: true })).map((a) => a.key),
    ['cancelar_solicitacao']
  );

  // analise + renovacao + pendente -> nenhum cancel (processo exige !renovacao)
  assert.deepEqual(
    computeFenixProcessActions(base({ tipoSolicitacaoSlug: 'analise', renovacao: true })).map((a) => a.key),
    []
  );

  // analise + pendente-pagamento -> cancelar_processo
  assert.deepEqual(
    computeFenixProcessActions(base({ statusSlug: 'pendente-de-pagamento', tipoSolicitacaoSlug: 'analise' })).map((a) => a.key),
    ['cancelar_processo']
  );

  // analise + tipo 3 + pendente -> nenhum cancel (tipo 3/4 excluído do processo)
  assert.deepEqual(
    computeFenixProcessActions(base({ statusSlug: 'pendente-de-pagamento', tipoSolicitacaoSlug: 'analise', tipoSolicitacaoId: 3 })).map((a) => a.key),
    []
  );
});

test('8. computeFenixProcessActions: reanalise exige tipo 6/8 + ativo + sem renovacao', () => {
  const base = (meta: Record<string, unknown>) => ({
    process: {
      id: 'request:50002',
      protocol: '0050002-5/2026',
      type: 'PTSAVCB',
      status: 'Notificado Vistoria',
      stage: 'Notificado Vistoria',
      building_id: 'building-1',
      payload: { fenixMeta: { statusSlug: 'notificado-vistoria', tipoSolicitacaoId: 8, ...meta } }
    },
    buildingId: 'building-1'
  });

  assert.deepEqual(
    computeFenixProcessActions(base({ ativo: 'S' })).map((a) => a.key),
    ['solicitar_reanalise', 'baixar_notificacao', 'baixar_protocolo']
  );

  // ativo N -> sem reanalise (cai no rascunho local)
  assert.deepEqual(
    computeFenixProcessActions(base({ ativo: 'N' })).map((a) => a.key),
    ['editar_projeto', 'baixar_notificacao', 'baixar_protocolo']
  );

  // renovacao -> reavaliacao da renovacao, não reanalise
  assert.equal(
    computeFenixProcessActions(base({ ativo: 'S', renovacao: true }))[0]?.key,
    'reavaliacao_renovacao'
  );
});

test('9. computeFenixProcessActions: homologado-sap sem mutacao; homologado vistoria vira revistoria', () => {
  const sap = computeFenixProcessActions({
    process: {
      id: 'request:50003',
      protocol: '0050003-5/2026',
      type: 'Análise de Projeto Técnico · PT',
      status: 'Homologado Sap',
      stage: 'Homologado Sap',
      building_id: 'building-1',
      payload: { fenixMeta: { statusSlug: 'homologado-sap', tipoSolicitacaoId: 1 } }
    },
    buildingId: 'building-1'
  });
  assert.equal(sap.some((a) => a.kind === 'mutation'), false);
  assert.deepEqual(sap.map((a) => a.key), []);

  const vistoriaHomologada = computeFenixProcessActions({
    process: {
      id: 'request:50004',
      protocol: '0050004-5/2026',
      type: 'Vistoria · AVCB',
      status: 'Homologado',
      stage: 'Homologado',
      building_id: 'building-1',
      payload: { fenixMeta: { statusSlug: 'homologado', tipoSolicitacaoId: 4 } }
    },
    buildingId: 'building-1'
  });
  assert.deepEqual(vistoriaHomologada.map((a) => a.key), ['solicitar_revistoria', 'baixar_certificado', 'baixar_protocolo']);
});

test('10. computeFenixProcessActions: renovacao cobre edit-reavaliacao-renovacao e exige ativo S', () => {
  const near = new Date(Date.now() + 25 * 86_400_000).toISOString();
  const base = (meta: Record<string, unknown>) => ({
    process: {
      id: 'request:50005',
      protocol: '0050005-5/2026',
      type: 'Vistoria · AVCB',
      status: 'Edit Reavaliacao Renovacao',
      stage: 'Edit Reavaliacao Renovacao',
      building_id: 'building-1',
      payload: { fenixMeta: { statusSlug: 'edit-reavaliacao-renovacao', tipoSolicitacaoSlug: 'vistoria', evento: 'N', dataValidade: near, ...meta } }
    },
    buildingId: 'building-1'
  });

  // O status implica renovacao (derivada do texto): ao vivo, a reavaliacao tem
  // prioridade e a renovacao usa o mesmo status no caminho editPT.
  assert.deepEqual(
    computeFenixProcessActions(base({ ativo: 'S' })).map((a) => a.key),
    ['reavaliacao_renovacao', 'baixar_protocolo']
  );

  // ativo N conhecido nega reavaliacao e renovacao (só resta o protocolo, não excluído nesse status)
  assert.deepEqual(
    computeFenixProcessActions(base({ ativo: 'N' })).map((a) => a.key),
    ['baixar_protocolo']
  );

  // homologado fora de analise: renovacao exige validade proxima + ativo S
  const licenca = (meta: Record<string, unknown>) => ({
    process: {
      id: 'request:50006',
      protocol: '0050006-5/2026',
      type: 'Licença AVCB',
      status: 'Homologado',
      stage: 'Homologado',
      building_id: 'building-1',
      payload: { fenixMeta: { statusSlug: 'homologado', tipoSolicitacaoSlug: 'ptsavcb-analise', evento: 'N', dataValidade: near, ...meta } }
    },
    buildingId: 'building-1'
  });
  assert.deepEqual(
    computeFenixProcessActions(licenca({ ativo: 'S' })).map((a) => a.key),
    ['solicitar_renovacao', 'baixar_certificado', 'baixar_protocolo']
  );
  assert.deepEqual(
    computeFenixProcessActions(licenca({ ativo: 'N' })).map((a) => a.key),
    ['baixar_certificado', 'baixar_protocolo']
  );
});

test('11. resolveGerarSolicitacaoTipoId: reenvia o tipo da linha; fallback por acao', () => {
  assert.equal(resolveGerarSolicitacaoTipoId(6, 'solicitar_reanalise'), 6);
  assert.equal(resolveGerarSolicitacaoTipoId(1, 'solicitar_vistoria'), 1);
  assert.equal(resolveGerarSolicitacaoTipoId(0, 'solicitar_vistoria'), 3);
  assert.equal(resolveGerarSolicitacaoTipoId(0, 'solicitar_revistoria'), 4);
  assert.equal(resolveGerarSolicitacaoTipoId(0, 'solicitar_reanalise'), 2);
});

test('12. fenixWriteRegraOf: extrai regra terminal do erro de escrita', () => {
  assert.equal(fenixWriteRegraOf(new FenixError('x', 422, undefined, { regra: 'prazoVencido' })), 'prazoVencido');
  assert.equal(fenixWriteRegraOf(new FenixError('x', 200, undefined, { data: { regra: 'prazoExpirado' } })), 'prazoExpirado');
  assert.equal(fenixWriteRegraOf(new FenixError('x', 500)), null);
  assert.equal(fenixWriteRegraOf(null), null);
});
