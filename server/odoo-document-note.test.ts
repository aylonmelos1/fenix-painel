import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOdooDocumentNote, resolveLatestFenixSituation } from './odoo-document-note.js';

test('uses the latest dated Fênix history entry and ignores incomplete entries', () => {
  assert.deepEqual(resolveLatestFenixSituation([
    { label: 'Protocolado', date: '2026-10-20T10:00:00-03:00' },
    { label: 'Sem data' },
    { label: 'Em análise', date: '2026-10-22T15:30:00-03:00' },
    { label: 'Data inválida', date: 'não é data' }
  ], 'Fallback', '2026-10-23'), {
    label: 'Em análise', date: '2026-10-22T15:30:00-03:00'
  });
});

test('falls back to the process status when there is no dated history', () => {
  assert.deepEqual(resolveLatestFenixSituation([{ label: 'Sem data' }], 'Aguardando laudos', '2026-10-23'), {
    label: 'Aguardando laudos', date: '2026-10-23'
  });
  assert.deepEqual(resolveLatestFenixSituation([], '', ''), {
    label: 'Situação não informada', date: ''
  });
});

test('formats a protocol document note with the situation date and a human protocol', () => {
  const note = buildOdooDocumentNote({
    kind: 'protocol', processProtocol: 'OO31321-5/2026',
    latestSituation: 'Em análise', latestSituationDate: '2026-10-22T15:30:00-03:00'
  }, 'comprovante.pdf');
  assert.match(note, /Documento novo no Fênix:<\/strong> Comprovante de protocolo/);
  assert.match(note, /Protocolo:<\/strong> OO31321-5\/2026/);
  assert.match(note, /Situação atual:<\/strong> Em análise \(22\/10\/2026\)/);
  assert.doesNotMatch(note, /technicalproject:/);
});

test('includes the official DAE link while keeping the DAE document label', () => {
  const note = buildOdooDocumentNote({
    kind: 'dae', processProtocol: 'P-123', latestSituation: 'Aguardando pagamento',
    latestSituationDate: '2026-10-23', daeUrl: 'https://servicos.sefaz.ba.gov.br/dae?id=1&via=2'
  }, 'dae.pdf');
  assert.match(note, /DAE \(Documento de Arrecadação Estadual\)/);
  assert.match(note, /href="https:\/\/servicos\.sefaz\.ba\.gov\.br\/dae\?id=1&amp;via=2"/);
  assert.match(note, /Acessar DAE no portal SEFAZ-BA/);
  assert.match(note, /Situação atual:<\/strong> Aguardando pagamento \(23\/10\/2026\)/);
});

test('escapes process supplied text before placing it in Odoo HTML', () => {
  const note = buildOdooDocumentNote({
    kind: 'certificate', processProtocol: '<img src=x>',
    latestSituation: '<script>alert(1)</script>'
  }, 'certificado.pdf');
  assert.match(note, /&lt;img src=x&gt;/);
  assert.match(note, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(note, /<script>/);
});
