import test from 'node:test';
import assert from 'node:assert/strict';
import { countProcessDocuments, isAttentionProcess, isInspectionProcess, summarizeProcesses, toDashboardProcess } from './dashboard.js';

const process = (id: string, status: string, stage = '', type = 'Solicitação') => ({
  id, building_id: 'building-1', building_reference: 'Edificação A', municipality: 'Salvador',
  protocol: `P-${id}`, type, status, stage, updated_at: '2026-10-23T12:00:00Z', payload: '{}'
});

test('dashboard indicators count processes, even when several share one building', () => {
  const rows = Array.from({ length: 38 }, (_, index) => process(`p-${index}`, 'Pendente de documentação'));
  assert.equal(new Set(rows.map((row) => row.building_id)).size, 1);
  assert.deepEqual(summarizeProcesses(rows), { analysis: 0, attention: 38, inspections: 0 });
});

test('status matching handles accents and inspection references in the process type', () => {
  const rows = [
    process('p1', 'Em análise técnica'),
    process('p2', 'Aguardando ação', 'Vistoria agendada', 'Solicitação de vistoria'),
    process('p3', 'Homologado')
  ];
  assert.equal(isAttentionProcess(rows[1]!), false);
  assert.equal(isInspectionProcess(rows[1]!), true);
  assert.deepEqual(summarizeProcesses(rows), { analysis: 1, attention: 0, inspections: 1 });
});

test('document metadata counts tolerate legacy shapes and malformed payloads', () => {
  assert.equal(countProcessDocuments('{"documents":["a.pdf","b.pdf"]}'), 2);
  assert.equal(countProcessDocuments('{"anexos":[{},{}]}'), 2);
  assert.equal(countProcessDocuments('not-json'), 0);
  assert.equal(toDashboardProcess({ ...process('p1', 'Em análise'), payload: '{"documents":["a.pdf"]}' }).documentCount, 1);
});
