import test from 'node:test';
import assert from 'node:assert/strict';
import { detectProcessChanges, type ProcessSyncState } from './sync-changes.js';

const base: ProcessSyncState = { id: 'request:1', buildingId: 'building:1', buildingReference: 'Edifício A', protocol: '123/2026', type: 'Solicitação', status: 'Em análise', stage: 'Análise', payload: '{}' };

test('automatic sync notifications are limited to new or materially changed processes', () => {
  assert.deepEqual(detectProcessChanges([base], [base]), []);
  const changed = detectProcessChanges([base], [{ ...base, status: 'Notificado', stage: 'Exigência' }]);
  assert.equal(changed.length, 1);
  assert.match(changed[0]!.message, /Em análise.*Análise.*Notificado.*Exigência/);
  const added = detectProcessChanges([], [base]);
  assert.equal(added[0]!.title, 'Novo processo no Fênix');
});

test('document and timeline changes create a process update notification', () => {
  const changes = detectProcessChanges([base], [{ ...base, payload: '{"documents":["comprovante.pdf"]}' }]);
  assert.equal(changes[0]!.title, 'Dados do processo atualizados');
  assert.equal(changes[0]!.buildingId, base.buildingId);
});
