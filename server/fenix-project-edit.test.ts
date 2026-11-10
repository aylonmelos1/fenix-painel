import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { CookieJar } from 'tough-cookie';
import {
  FENIX_REQUEST_EDIT_ACTIONS,
  FENIX_REQUEST_EDIT_STATUS_PATH,
  FenixRequestModifiedError,
  buildFenixEditNavigationTarget,
  buildFenixRequestEditStatusBody,
  buildFenixTechnicalProjectUpdatePayload,
  isFenixRequestModifiedError,
  resolveFenixBuildingRemoteId,
  resolveFenixRequestEditAction,
  resolveFenixTechnicalProjectRemoteId,
  submitFenixRequestEditStatus
} from './fenix-project-edit.js';
import { FenixClient, FenixError } from './fenix.js';

const input = {
  form_mode: 'pts' as const,
  process_category: 'pts' as const,
  tipo_projeto_id: 4,
  edificacao_mode: 'existing' as const,
  edificacao_id: 90210,
  reference_name: 'Edificação de teste',
  registration: '123',
  building_area: 75,
  area_to_be_built: 0,
  discount_area: 0,
  height: 'Térrea = Um pavimento',
  number_floors: 1,
  address: {
    zip_code: '00000000',
    public_place: 'Rua de teste',
    number: '10',
    complement: '***',
    district: 'Centro',
    county: 'Salvador',
    municipio_id: 1,
    state: 'BA'
  },
  institution: {
    tipo_pessoa: 'PJ' as const,
    cnpj_cpf: '00000000000000',
    razao_social: 'Empresa de teste',
    nome_fantasia: 'Empresa de teste',
    natureza_juridica: 'EPP',
    cnae: '4754701',
    cnae_id: 9,
    atividade_economica: 'Comércio de teste',
    risk: 300
  },
  occupation: { occupation_group_id: 3, division_group_id: 6 },
  occupationsDivisions: [{
    occupation_group_id: 3,
    division_group_id: 6,
    occupation_group: 'Comercial',
    division_group: 'Comércio',
    principal: true,
    area_comum: false,
    sobre_solo: true
  }],
  proprietario: { tipo_pessoa_prop: 'PJ', cpf_cnpj_prop: '00000000000000', nome_proprietario: 'Empresa de teste' },
  responsavel: { tipo_pessoa_resp: 'PJ', cpf_cnpj_resp: '00000000000000', nome_responsavel: 'Empresa de teste' },
  questionario: { edf_saida_direta: true },
  specialRisks: {},
  securityMeasures: { extintores: 1, iluminacao_emerg: 1, sinal_emerg: 1, saidas_emerg: 1 }
};

test('edit payload keeps the existing project and building ids and uses the Fênix update contract', () => {
  const result = buildFenixTechnicalProjectUpdatePayload(input, '12345', '90210', 111, {
    id: 12345,
    num_projeto: 'PT-12345',
    edificacao_id: 90210,
    tipo_projeto_id: 4,
    edification: { reference_name: 'Edificação de teste', total_area: 75 }
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.payload?.id, 12345);
  assert.equal(result.payload?.edificacao_id, 90210);
  assert.equal(result.payload?.reference_name, 'Edificação de teste');
  assert.equal(result.payload?.projetoAnterior, 'N');
  assert.equal((result.payload?.address as any).zip_code, '00000000');
  assert.equal((result.payload?.institution as any).cnae_id, 9);
  assert.equal((result.payload?.institution as any).pessoa.tipo, 'PJ');
  assert.equal((result.payload?.occupationsDivisions as any[])[0].occupation_group, 'Comercial');
  assert.equal((result.payload?.occupationsDivisions as any[])[0].division_group, 'Comércio');
  assert.equal('solicitante' in (result.payload || {}), false);
});

test('edit payload refuses invalid or missing official target ids', () => {
  const missingProject = buildFenixTechnicalProjectUpdatePayload(input, 'new', '90210');
  const missingBuilding = buildFenixTechnicalProjectUpdatePayload(input, '12345', '0');

  assert.equal(missingProject.valid, false);
  assert.equal(missingProject.payload, null);
  assert.match(missingProject.errors[0] ?? '', /ID do Projeto Técnico/);
  assert.equal(missingBuilding.valid, false);
  assert.equal(missingBuilding.payload, null);
  assert.match(missingBuilding.errors[0] ?? '', /ID da edificação/);
});

test('resolves official ids embedded in the primary-account local keys', () => {
  assert.equal(resolveFenixTechnicalProjectRemoteId({ id: 'technicalproject:12345', remote_id: null }), '12345');
  assert.equal(resolveFenixBuildingRemoteId({ id: '90210', remote_id: null }), '90210');
});

test('resolves linked-account ids only when the namespace and stored remote id agree', () => {
  assert.equal(resolveFenixTechnicalProjectRemoteId({
    id: 'technicalproject:connection-a:12345', remote_id: '12345', source_connection_id: 'connection-a'
  }), '12345');
  assert.equal(resolveFenixBuildingRemoteId({
    id: 'linked:connection-a:building:90210', remote_id: '90210', source_connection_id: 'connection-a'
  }), '90210');
  assert.equal(resolveFenixTechnicalProjectRemoteId({
    id: 'technicalproject:connection-a:12345', remote_id: '54321', source_connection_id: 'connection-a'
  }), null);
  assert.equal(resolveFenixBuildingRemoteId({
    id: 'linked:connection-a:building:90210', remote_id: '54321', source_connection_id: 'connection-a'
  }), null);
});

test('rejects unresolved, malformed, and mismatched primary-account identities', () => {
  assert.equal(resolveFenixTechnicalProjectRemoteId({ id: 'technicalproject:not-numeric', remote_id: null }), null);
  assert.equal(resolveFenixTechnicalProjectRemoteId({ id: 'technicalproject:12345', remote_id: '54321' }), null);
  assert.equal(resolveFenixBuildingRemoteId({ id: 'local-building-id', remote_id: null }), null);
  assert.equal(resolveFenixTechnicalProjectRemoteId({
    id: 'technicalproject:connection-a:12345', remote_id: null, source_connection_id: 'connection-a'
  }), null);
});

test('edit status contract mirrors the official definirStatusV2 call (no PUT)', () => {
  assert.equal(FENIX_REQUEST_EDIT_STATUS_PATH, '/api/v1/request/definirStatusV2');
  assert.deepEqual([...FENIX_REQUEST_EDIT_ACTIONS], ['edit-renovacao', 'edit-reavaliacao-renovacao']);

  const built = buildFenixRequestEditStatusBody({
    solicitacaoId: 39315,
    sptId: 777,
    action: 'edit-renovacao',
    dados: { id: 28099 }
  });
  assert.equal(built.valid, true);
  assert.deepEqual(built.errors, []);
  assert.deepEqual(built.body, {
    solicitacao_id: 39315,
    spt_id: 777,
    action: 'edit-renovacao',
    justificativa: null,
    dados: { id: 28099 }
  });
});

test('edit status body rejects unconfirmed ids and unknown actions without sending', () => {
  const badRequest = buildFenixRequestEditStatusBody({ solicitacaoId: 0, sptId: 777, action: 'edit-renovacao' });
  assert.equal(badRequest.valid, false);
  assert.equal(badRequest.body, null);
  assert.match(badRequest.errors[0] ?? '', /solicitacao_id/);

  const badSpt = buildFenixRequestEditStatusBody({ solicitacaoId: 39315, sptId: 'abc', action: 'edit-renovacao' });
  assert.equal(badSpt.valid, false);
  assert.equal(badSpt.body, null);
  assert.match(badSpt.errors[0] ?? '', /spt_id/);

  const badAction = buildFenixRequestEditStatusBody({ solicitacaoId: 39315, sptId: 777, action: 'cancelar-solicitacao' });
  assert.equal(badAction.valid, false);
  assert.equal(badAction.body, null);
  assert.match(badAction.errors[0] ?? '', /edição/);
});

test('edit action resolves the renewal flow from the confirmed status', () => {
  assert.equal(resolveFenixRequestEditAction(), 'edit-renovacao');
  assert.equal(resolveFenixRequestEditAction({ statusSlug: 'homologado' }), 'edit-renovacao');
  assert.equal(resolveFenixRequestEditAction({ statusSlug: 'notificado', renovacao: false }), 'edit-renovacao');
  assert.equal(resolveFenixRequestEditAction({ statusSlug: 'notificado', renovacao: true }), 'edit-reavaliacao-renovacao');
  assert.equal(resolveFenixRequestEditAction({ statusSlug: 'notificado-vistoria', renovacao: true }), 'edit-reavaliacao-renovacao');
});

test('edit navigation target mirrors the official editPT route', () => {
  assert.deepEqual(
    buildFenixEditNavigationTarget({ projectId: 28099, buildingId: 90210, solicitacaoId: 39315, statusSlug: 'notificado' }),
    {
      name: 'technicalProjects-form',
      params: { id: 28099, edificacao_id: 90210, solicitacao_id: 39315, status_slug: 'notificado' }
    }
  );
  assert.equal(buildFenixEditNavigationTarget({ projectId: 0, buildingId: 90210, solicitacaoId: 39315 }), null);
  assert.equal(buildFenixEditNavigationTarget({ projectId: 28099, buildingId: 0, solicitacaoId: 39315 }), null);
});

test('request-modified detection covers the official 409 family', () => {
  assert.equal(isFenixRequestModifiedError(new FenixRequestModifiedError()), true);
  assert.equal(
    isFenixRequestModifiedError(new FenixError('messages.requestAlreadyModified', 409)),
    true
  );
  assert.equal(
    isFenixRequestModifiedError(new FenixError('messages.solicitacao.acaoNaoPermitidaParaStatusAtual', 409)),
    true
  );
  assert.equal(isFenixRequestModifiedError(new FenixError('Outro conflito.', 409)), false);
  assert.equal(isFenixRequestModifiedError(new FenixError('Falha interna.', 500)), false);
  assert.equal(isFenixRequestModifiedError(new Error('request-modified')), false);
});

test('edit status submit POSTs definirStatusV2, never PUTs, and maps 409 to request-modified', async () => {
  const received: Array<{ url: string; method: string; body: string }> = [];
  let postStatus = 200;
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    received.push({ url: req.url || '', method: req.method || '', body });
    if (req.url === '/api/v1/request/definirStatusV2') {
      res.writeHead(postStatus, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(postStatus === 200
        ? { ok: true, message: 'Status atualizado.' }
        : { error: 'messages.requestAlreadyModified' }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: any, init?: any) => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(rawUrl);
    if (url.origin === 'https://fenix.cbm.ba.gov.br') {
      return originalFetch(new URL(url.pathname + url.search, `http://127.0.0.1:${port}`).toString(), init);
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    const jar = new CookieJar();
    const client = new FenixClient(jar);
    const body = buildFenixRequestEditStatusBody({
      solicitacaoId: 39315, sptId: 777, action: 'edit-renovacao', dados: { id: 28099 }
    }).body!;
    const ok = await submitFenixRequestEditStatus(client, body) as any;
    assert.equal(ok.ok, true);
    const post = received.find((r) => r.url === '/api/v1/request/definirStatusV2');
    assert.ok(post);
    assert.equal(post.method, 'POST');
    const parsed = JSON.parse(post.body);
    assert.equal(parsed.solicitacao_id, 39315);
    assert.equal(parsed.spt_id, 777);
    assert.equal(parsed.action, 'edit-renovacao');
    assert.ok(!received.some((r) => r.method === 'PUT'), 'edit must not use PUT');

    postStatus = 409;
    await assert.rejects(
      submitFenixRequestEditStatus(client, body),
      (error: unknown) => {
        assert.ok(error instanceof FenixRequestModifiedError);
        assert.ok(isFenixRequestModifiedError(error));
        assert.equal((error as FenixError).status, 409);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
