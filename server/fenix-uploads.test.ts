import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FENIX_UPLOAD_BLOCKED_MESSAGE,
  FENIX_UPLOAD_CONTEXTS,
  buildFenixUploadPlan,
  getFenixUploadContext,
  isFenixUploadSendEnabled,
} from './fenix-uploads.js';

test('flag de envio vem desligada por padrao', () => {
  assert.equal(isFenixUploadSendEnabled({} as NodeJS.ProcessEnv), false);
  assert.equal(isFenixUploadSendEnabled({ FENIX_UPLOAD_SEND_ENABLED: '0' } as NodeJS.ProcessEnv), false);
  assert.equal(isFenixUploadSendEnabled({ FENIX_UPLOAD_SEND_ENABLED: '1' } as NodeJS.ProcessEnv), true);
});

test('contextos cobrem os 5 alvos do bundle, sem SAP habilitado', () => {
  const keys = FENIX_UPLOAD_CONTEXTS.map((item) => item.key).sort();
  assert.deepEqual(keys, ['projeto_tecnico', 'remanejamento', 'retificacao', 'solicitacao', 'vistoria']);
  assert.equal(getFenixUploadContext('migracao_sap'), null);
  for (const item of FENIX_UPLOAD_CONTEXTS) assert.equal(item.homologated, false);
});

test('plano projeto_tecnico usa campos exatos do parseToForm', () => {
  const plan = buildFenixUploadPlan({
    context: 'projeto_tecnico',
    projetoTecnicoId: '123',
    solicitacaoId: '456',
    tipoDocumento: 'ART',
    descricao: 'ART do responsavel',
    fileName: 'art.pdf',
  });
  assert.equal(plan.endpoint, '/api/v1/technicalprojectdocs');
  assert.deepEqual(plan.fields.map((f) => f.key), [
    'projeto_tecnico_id[0]',
    'tipo_documento[0]',
    'descricao[0]',
    'technical_documents[0]',
    'solicitacao_id',
  ]);
  assert.equal(plan.blocked, true);
  assert.equal(plan.blockReason, FENIX_UPLOAD_BLOCKED_MESSAGE);
});

test('plano vistoria usa solicitacao_id indexada + survey_documents', () => {
  const plan = buildFenixUploadPlan({
    context: 'vistoria',
    solicitacaoId: '789',
    sptId: '11',
    tipoDocumento: 'Comprovante',
    fileName: 'comp.pdf',
  });
  assert.equal(plan.endpoint, '/api/v1/documents-survey-store');
  const keys = plan.fields.map((f) => f.key);
  assert.ok(keys.includes('solicitacao_id[0]'));
  assert.ok(keys.includes('survey_documents[0]'));
  assert.ok(keys.includes('solicitacao_id'));
  assert.ok(keys.includes('spt_id'));
  assert.equal(plan.blocked, true);
});

test('plano remanejamento usa documentos[i][campo] exatos', () => {
  const plan = buildFenixUploadPlan({
    context: 'remanejamento',
    remanejamentoId: '42',
    tipoDocumento: 'vinculo_processo',
    descricao: 'Vinculo',
    fileName: 'vinculo.pdf',
  });
  assert.equal(plan.endpoint, '/api/v1/remanejamentos/42/documentos');
  assert.deepEqual(plan.fields.map((f) => f.key), [
    'documentos[0][tipo]',
    'documentos[0][descricao]',
    'documentos[0][nome]',
    'documentos[0][arquivo]',
  ]);
  assert.equal(plan.fileField, 'documentos[0][arquivo]');
  assert.equal(plan.blocked, true);
});

test('plano exige IDs numericos por contexto', () => {
  assert.throws(() => buildFenixUploadPlan({ context: 'projeto_tecnico', projetoTecnicoId: 'abc', solicitacaoId: '1', tipoDocumento: 'x', fileName: 'a.pdf' }), /projeto tecnico/i);
  assert.throws(() => buildFenixUploadPlan({ context: 'vistoria', tipoDocumento: 'x', fileName: 'a.pdf' }), /solicitacao/i);
  assert.throws(() => buildFenixUploadPlan({ context: 'retificacao', solicitacaoId: '1', tipoDocumento: 'x', fileName: 'a.pdf' }), /retificacao/i);
  assert.throws(() => buildFenixUploadPlan({ context: 'solicitacao', solicitacaoId: '0', tipoDocumento: 'x', fileName: 'a.pdf' }), /solicitacao/i);
  assert.throws(() => buildFenixUploadPlan({ context: 'nope', tipoDocumento: 'x', fileName: 'a.pdf' }), /contexto/i);
});
