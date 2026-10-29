import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAndValidateFenixProjectPayload,
  deleteProjectDraft,
  getFenixDomains,
  getProjectDraft,
  listProjectDrafts,
  lookupCnpjAndIt14,
  mapIt14MeasuresToFenix,
  runDraftAiAssistant,
  simulateProjectDraft,
  updateDraftSimulation,
  updateDraftSubmission,
  upsertProjectDraft,
  type ProjectDraftInput
} from './project-drafts.js';
import { db } from './store.js';

test('getFenixDomains loads domains correctly from json', () => {
  const domains = getFenixDomains();
  assert.ok(Array.isArray(domains.counties));
  assert.ok(domains.counties.length > 400);
  assert.ok(Array.isArray(domains.heights));
  assert.equal(domains.heights.length, 6);
  assert.ok(Array.isArray(domains.blockedPtsCnaes));
  assert.ok(domains.blockedPtsCnaes.includes('4731800'));
});

test('Caso Real 1: VAL SAT #89735 -> PTSCLCB2 (434.11 m², 2 pavimentos, 5 medidas)', () => {
  const input: ProjectDraftInput = {
    reference_name: 'VAL SAT',
    building_area: '434.11',
    area_to_be_built: '0',
    discount_area: '0',
    number_floors: 2,
    height: 'Baixa-Média = 6,00 m < H <= 12,00 m',
    address: {
      zip_code: '45355000',
      public_place: 'RUA OTACILIO PINHEIRO',
      number: 'S/N',
      complement: '***',
      district: 'CENTRO',
      municipio_id: 22
    },
    institution: {
      cnae: '4754701',
      razao_social: 'VANDERLEI DA SILVA SANTOS DE APUAREMA',
      tipo_pessoa: 'PJ',
      cnpj: '09566970000123'
    },
    occupation: {
      occupation_group_id: 3,
      division_group_id: 6,
      has_underground: false
    }
  };

  const result = buildAndValidateFenixProjectPayload(input, 14574);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.tipoProjetoId, 5);
  assert.equal(result.tipoProjetoSigla, 'PTSCLCB2');
  assert.equal(result.rtOptional, false);
  assert.deepEqual(result.recommendedMeasures, [
    'iluminacao_emerg',
    'sinal_emerg',
    'extintores',
    'saidas_emerg',
    'brigada_incendio'
  ]);

  const payload = result.fenixPayload;
  assert.equal(payload.total_area, '434.11');
  assert.equal(payload.building_area, '434.11');
  assert.equal(payload.number_floors, 2);
  assert.equal(payload.height, 'Baixa-Média = 6,00 m < H <= 12,00 m');
  assert.equal((payload.address as any).county, 'APUAREMA');
  assert.equal((payload.solicitante as any).id, 14574);

  // Verifica inclusão automática do subsolo vazio
  const occs = payload.occupationsDivisions as Array<any>;
  assert.equal(occs.length, 2);
  const underground = occs.find((o) => o.underground === true);
  assert.ok(underground);
  assert.equal(underground.occupation_group_id, 13);
  assert.equal(underground.division_group_id, 58);
});

test('Caso Real 2: Casa do Pão #32719 -> PTSCLCB1 (41.61 m², térrea, rtOptional: true)', () => {
  const input: ProjectDraftInput = {
    edification: {
      reference_name: 'Casa do Pão',
      building_area: 41.61,
      area_to_be_built: 0,
      discount_area: 0,
      number_floors: 1,
      height: 'Térrea = Um pavimento'
    },
    address: {
      zip_code: '45355-000',
      public_place: 'RUA DO COMERCIO',
      number: '10',
      complement: 'SALA A',
      district: 'CENTRO',
      municipio_id: 22
    },
    institution: {
      cnae: '1091-1/02',
      razao_social: 'PANIFICADORA CASA DO PAO LTDA'
    },
    occupation: {
      occupation_group_id: 1,
      division_group_id: 1,
      has_underground: false
    },
    questionario: {
      edf_saida_direta: true
    }
  };

  const result = simulateProjectDraft(input);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.tipoProjetoId, 4);
  assert.equal(result.tipoProjetoSigla, 'PTSCLCB1');
  assert.equal(result.rtOptional, true);
  assert.deepEqual(result.recommendedMeasures, [
    'iluminacao_emerg',
    'sinal_emerg',
    'extintores',
    'saidas_emerg'
  ]);
  assert.equal(result.fenixPayload.total_area, '41.61');
});

test('Caso Real 3: Bamaq #1069 -> PT (3.695,76 m², 12 medidas recomendadas)', () => {
  const input: ProjectDraftInput = {
    process_category: 'pt',
    reference_name: 'Bamaq Imóveis',
    building_area: '3695.76',
    number_floors: 3,
    height: 'Baixa-Média = 6,00 m < H <= 12,00 m',
    address: {
      zip_code: '45355000',
      public_place: 'RODOVIA BA 026',
      number: 'KM 02',
      complement: 'GALPAO',
      district: 'ZONA RURAL',
      municipio_id: 22
    },
    institution: {
      cnae: '4511101',
      razao_social: 'BAMAQ S.A.'
    },
    occupation: {
      occupation_group_id: 3,
      division_group_id: 6,
      has_underground: false
    }
  };

  const result = buildAndValidateFenixProjectPayload(input);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.tipoProjetoId, 1);
  assert.equal(result.tipoProjetoSigla, 'PT');
  assert.equal(result.recommendedMeasures.length, 12);
  assert.ok(result.recommendedMeasures.includes('hidrante_mangot'));
  assert.ok(result.recommendedMeasures.includes('acesso_viatura'));
  assert.ok(result.recommendedMeasures.includes('alarme_incendio'));
});

test('Caso 4: CNAE Bloqueado 4731800 (Posto de Combustíveis) rejeita PTS', () => {
  const input: ProjectDraftInput = {
    process_category: 'pts',
    reference_name: 'Posto Estrela',
    building_area: '150.00',
    number_floors: 1,
    height: 'Térrea = Um pavimento',
    address: {
      zip_code: '45355000',
      public_place: 'AVENIDA CENTRAL',
      number: '500',
      complement: 'POSTO',
      district: 'CENTRO',
      municipio_id: 22
    },
    institution: {
      cnae: '4731-8/00',
      razao_social: 'AUTO POSTO ESTRELA LTDA'
    }
  };

  const result = buildAndValidateFenixProjectPayload(input);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((err) =>
      err.includes('Este CNAE exige Projeto Técnico Completo (PT) mesmo com área reduzida.')
    )
  );
});

test('Caso 5: Complemento vazio define automaticamente "***" e emite warning', () => {
  const input: ProjectDraftInput = {
    reference_name: 'Loja Teste',
    building_area: '100.00',
    number_floors: 1,
    height: 'Térrea = Um pavimento',
    address: {
      zip_code: '45355000',
      public_place: 'RUA DIREITA',
      number: '42',
      complement: '',
      district: 'CENTRO',
      municipio_id: 22
    },
    institution: {
      cnae: '4754701'
    }
  };

  const result = buildAndValidateFenixProjectPayload(input);

  assert.equal((result.fenixPayload.address as any).complement, '***');
  assert.ok(
    result.warnings.some((w) =>
      w.includes("Complemento não informado; preenchido automaticamente com '***'")
    )
  );
});

test('Validação de consistência: altura Térrea com mais de 1 pavimento falha', () => {
  const input: ProjectDraftInput = {
    reference_name: 'Sobrado Inválido',
    building_area: '120.00',
    number_floors: 2,
    height: 'Térrea = Um pavimento',
    address: {
      zip_code: '45355000',
      public_place: 'RUA A',
      number: '1',
      municipio_id: 22
    }
  };

  const result = buildAndValidateFenixProjectPayload(input);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((err) =>
      err.includes("Para altura 'Térrea = Um pavimento', o número de pavimentos deve ser 1.")
    )
  );
});

test('Validação de áreas: desconto superior à área construída falha', () => {
  const input: ProjectDraftInput = {
    reference_name: 'Área Negativa',
    building_area: '100.00',
    discount_area: '150.00',
    number_floors: 1,
    height: 'Térrea = Um pavimento',
    address: {
      zip_code: '45355000',
      public_place: 'RUA A',
      number: '1',
      municipio_id: 22
    }
  };

  const result = buildAndValidateFenixProjectPayload(input);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((err) =>
      err.includes('Área a descontar não pode ser maior que a soma das áreas construída e a construir.')
    )
  );
});

test('Persistência SQLite: ciclo completo de CRUD para fenix_project_drafts', () => {
  const testUserId = 'test-draft-user-' + Date.now();
  // Garante que o usuário existe na tabela users
  db.prepare(`
    INSERT INTO users (id, name, email, demo, created_at)
    VALUES (?, ?, ?, 1, ?)
  `).run(testUserId, 'Usuário de Teste Draft', 'draft-test@exemplo.com', new Date().toISOString());

  try {
    // 1. Inserção
    const draftInput: ProjectDraftInput = {
      reference_name: 'Edificação Teste SQLite',
      building_area: 250,
      number_floors: 2,
      height: 'Baixa = H <= 6,00 m',
      address: {
        zip_code: '45355000',
        public_place: 'RUA DO TESTE',
        number: '123',
        district: 'BAIRRO',
        municipio_id: 22
      },
      institution: {
        cnae: '4754701',
        razao_social: 'EMPRESA TESTE'
      }
    };

    const created = upsertProjectDraft(testUserId, draftInput);
    assert.ok(created.id);
    assert.equal(created.name, 'Edificação Teste SQLite');
    assert.equal(created.status, 'draft');

    // 2. Leitura individual
    const fetched = getProjectDraft(testUserId, created.id);
    assert.ok(fetched);
    assert.equal(fetched.id, created.id);
    assert.equal(fetched.name, 'Edificação Teste SQLite');

    // 3. Listagem
    const list = listProjectDrafts(testUserId);
    assert.ok(list.length >= 1);
    assert.ok(list.some((d) => d.id === created.id));

    // 4. Atualização com simulação
    const simResult = simulateProjectDraft(draftInput);
    const simulated = updateDraftSimulation(testUserId, created.id, simResult);
    assert.ok(simulated);
    assert.equal(simulated.status, 'simulated');
    assert.equal(simulated.lastSimulation?.ok, true);
    assert.equal(simulated.lastSimulation?.validation.tipoProjetoSigla, 'PTSCLCB2');

    // 5. Atualização com submissão
    const submitted = updateDraftSubmission(testUserId, created.id, {
      ok: true,
      result: { id: 89735, num_projeto: '020863/45355000/2026' }
    });
    assert.ok(submitted);
    assert.equal(submitted.status, 'submitted');
    assert.equal(submitted.lastSubmission?.ok, true);

    // 6. Remoção
    const deleted = deleteProjectDraft(testUserId, created.id);
    assert.equal(deleted, true);
    assert.equal(getProjectDraft(testUserId, created.id), undefined);
  } finally {
    // Limpeza
    db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
  }
});

test('mapIt14MeasuresToFenix maps Decreto 16.302 BA real names to Fenix keys', () => {
  const rawMeasures = [
    'Saídas de Emergência',
    'Iluminação de Emergência X³',
    'Sinalização de Emergência',
    'Extintores',
    'Brigada de Incêndio',
    'Hidrante e Mangotinhos',
    'Acesso de Viatura na Edificação'
  ];

  const mapped = mapIt14MeasuresToFenix(rawMeasures);

  assert.equal(Object.keys(mapped).length, 28);
  assert.equal(mapped.saidas_emergencia, true);
  assert.equal(mapped.iluminacao_emergencia, true);
  assert.equal(mapped.sinalizacao_emergencia, true);
  assert.equal(mapped.extintores, true);
  assert.equal(mapped.brigada_incendio, true);
  assert.equal(mapped.hidrante_mangotinhos, true);
  assert.equal(mapped.acesso_viatura_edificacao, true);

  // Não selecionadas
  assert.equal(mapped.chuveiros_automaticos, false);
  assert.equal(mapped.resfriamento, false);
  assert.equal(mapped.espuma, false);
  assert.equal(mapped.sistema_fixo_gases_limpos, false);
  assert.equal(mapped.spda, false);
});

test('lookupCnpjAndIt14 validates CNPJ length and consults IT14 ABA API', async () => {
  // CNPJ inválido
  await assert.rejects(
    async () => lookupCnpjAndIt14('12345'),
    (err: Error) => err.message.includes('14 dígitos')
  );

  // CNPJ real do VAL SAT (Apuarema)
  const result = await lookupCnpjAndIt14('09566970000123', {
    areaM2: 434.11,
    floors: 2,
    height: 'Baixa-Média = 6,00 m < H <= 12,00 m'
  });

  assert.equal(result.cnpj, '09566970000123');
  assert.equal(result.razao_social, 'VANDERLEI DA SILVA SANTOS DE APUAREMA');
  assert.equal(result.address.county_id, 22);
  assert.equal(result.address.county, 'APUAREMA');
  assert.equal(result.address.uf, 'BA');
  assert.ok(result.it14.allCnaes.length > 0);
  assert.equal(result.it14.areaBand, '200_750');
  assert.equal(result.it14.alturaMeters, 10);
  assert.equal(result.it14.project_type_sugerido, 'PTS');
  assert.equal(result.it14.mappedMeasures.saidas_emergencia, true);
  assert.equal(result.it14.mappedMeasures.extintores, true);
});

test('runDraftAiAssistant interpreta comando em linguagem natural e gera formPatch completo', async () => {
  const req = {
    message: 'Configura um comércio C-2 em Feira de Santana com 480 m² e 2 pavimentos e aplica as medidas recomendadas',
    currentDraft: {
      reference_name: 'Minha Loja',
      building_area: 100,
      number_floors: 1,
      height: 'Térrea = Um pavimento',
      address: {
        zip_code: '44000000',
        public_place: 'Rua Principal',
        number: '10'
      }
    }
  };

  const res = await runDraftAiAssistant(req);

  assert.ok(res.reply);
  assert.ok(res.thinkingSteps.length > 0);
  assert.ok(res.appliedChangesSummary.length > 0);
  assert.ok(res.formPatch);

  // Edificação
  assert.equal(res.formPatch?.edification?.building_area, 480);
  assert.equal(res.formPatch?.edification?.number_floors, 2);
  assert.equal(res.formPatch?.edification?.height, 'Baixa = H <= 6,00 m');

  // Município
  assert.equal(res.formPatch?.address?.county, 'FEIRA DE SANTANA');
  assert.equal(res.formPatch?.address?.municipio_id, 131);

  // Divisão IT-14
  assert.equal(res.formPatch?.occupation?.division_group_id, 7);
  assert.equal(res.formPatch?.occupation?.occupation_group_id, 3);

  // Medidas recomendadas para PTSCLCB2 (480 m², 2 pavimentos)
  assert.equal(res.formPatch?.securityMeasures?.extintores, true);
  assert.equal(res.formPatch?.securityMeasures?.iluminacao_emergencia, true);
  assert.equal(res.formPatch?.securityMeasures?.sinalizacao_emergencia, true);
  assert.equal(res.formPatch?.securityMeasures?.saidas_emergencia, true);
  assert.equal(res.formPatch?.securityMeasures?.brigada_incendio, true);
});

test('runDraftAiAssistant revisa e auto-corrige pendências de rascunho incompleto', async () => {
  const req = {
    message: 'Revise o rascunho e corrija as pendências',
    currentDraft: {
      reference_name: 'Galpão Sem Complemento',
      building_area: 150,
      number_floors: 1,
      height: 'Baixa = H <= 6,00 m', // Incompatível com 1 pavimento
      address: {
        zip_code: '45355000',
        public_place: 'Rua A',
        number: '12',
        complement: '', // Vazio
        municipio_id: 22
      }
    }
  };

  const res = await runDraftAiAssistant(req);

  assert.ok(res.reply);
  assert.ok(res.thinkingSteps.length > 0);
  assert.ok(res.appliedChangesSummary.length > 0);
  assert.ok(res.formPatch);

  // Deve corrigir complemento para "***"
  assert.equal(res.formPatch?.address?.complement, '***');

  // Deve sincronizar altura com "Térrea = Um pavimento"
  assert.equal(res.formPatch?.edification?.height, 'Térrea = Um pavimento');

  // Deve aplicar medidas recomendadas se não havia nenhuma
  assert.equal(res.formPatch?.securityMeasures?.extintores, true);
});

