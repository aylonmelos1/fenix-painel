import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { CookieJar } from 'tough-cookie';
import {
  computeFenixProcessActions,
  FenixClient,
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
      num_projeto: '020863/45355000/2026'
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
