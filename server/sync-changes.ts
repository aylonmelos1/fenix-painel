export type ProcessSyncState = {
  id: string;
  buildingId: string;
  buildingReference: string;
  protocol: string;
  type: string;
  status: string;
  stage: string;
  payload: string;
};

export type ProcessSyncChange = { buildingId: string; processId: string; title: string; message: string };

export function detectProcessChanges(previous: ProcessSyncState[], current: ProcessSyncState[]): ProcessSyncChange[] {
  const byId = new Map(previous.map((process) => [process.id, process]));
  const changes: ProcessSyncChange[] = [];
  for (const process of current) {
    const old = byId.get(process.id);
    const reference = process.buildingReference || 'Edificação acompanhada';
    if (!old) {
      changes.push({ buildingId: process.buildingId, processId: process.id, title: 'Novo processo no Fênix', message: `${reference} · protocolo ${process.protocol || 'não informado'} · ${process.stage || process.status}` });
    } else if (old.status !== process.status || old.stage !== process.stage) {
      const before = [old.status, old.stage].filter((value, index, all) => value && all.indexOf(value) === index).join(' · ');
      const after = [process.status, process.stage].filter((value, index, all) => value && all.indexOf(value) === index).join(' · ');
      changes.push({ buildingId: process.buildingId, processId: process.id, title: 'Etapa do processo alterada', message: `${reference} · ${before || 'Etapa anterior'} → ${after || 'nova etapa'}` });
    } else if (old.protocol !== process.protocol || old.type !== process.type || old.payload !== process.payload) {
      changes.push({ buildingId: process.buildingId, processId: process.id, title: 'Dados do processo atualizados', message: `${reference} · protocolo ${process.protocol || 'não informado'}` });
    }
  }
  return changes;
}
