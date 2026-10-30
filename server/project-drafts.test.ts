import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acquireDraftSubmissionLock,
  attachLegacyMeasureAliases,
  buildAndValidateFenixProjectPayload,
  deleteProjectDraft,
  FENIX_22_SECURITY_MEASURES,
  FENIX_LEGACY_MEASURE_ALIASES,
  getFenixDomains,
  getProjectDraft,
  listProjectDrafts,
  lookupCnpjAndIt14,
  mapIt14MeasuresToFenix,
  runDraftAiAssistant,
  simulateProjectDraft,
  streamDraftAiAssistant,
  updateDraftSimulation,
  updateDraftSubmission,
  upsertProjectDraft,
  type DraftAiStreamEvent,
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
    n_art_rrt: 'BA20261628773',
    responsaveis_tecnicos: [
      {
        nome_tecnico: 'ENG. MARCOS VINICIUS ALMEIDA',
        cpf_cnpj_tecnico: '09566970000123',
        conselho: 'CREA',
        n_registro_conselho: '05189283-BA',
        email_tecnico: 'engenharia@abaincendio.com.br',
        tel_tecnico: '7140002895',
        n_art_rrt: 'BA20261628773'
      }
    ],
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
    n_art_rrt: 'BA20230506751',
    responsaveis_tecnicos: [
      {
        nome_tecnico: 'ENG. CIVIL RESPONSAVEL BAMAQ',
        cpf_cnpj_tecnico: '12345678901',
        conselho: 'CREA',
        n_registro_conselho: '123456-BA',
        email_tecnico: 'engenharia@bamaq.com.br',
        tel_tecnico: '71999998888',
        n_art_rrt: 'BA20230506751'
      }
    ],
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
      n_art_rrt: 'BA20261628773',
      responsaveis_tecnicos: [
        {
          nome_tecnico: 'ENG. TESTE CRUD',
          cpf_cnpj_tecnico: '12345678901',
          conselho: 'CREA',
          n_registro_conselho: '99999-BA',
          email_tecnico: 'eng@teste.com',
          tel_tecnico: '71988887777',
          n_art_rrt: 'BA20261628773'
        }
      ],
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

  // 22 chaves oficiais do Fênix
  assert.equal(Object.keys(mapped).length, 22);
  assert.equal(mapped.saidas_emerg, true);
  assert.equal(mapped.iluminacao_emerg, true);
  assert.equal(mapped.sinal_emerg, true);
  assert.equal(mapped.extintores, true);
  assert.equal(mapped.brigada_incendio, true);
  assert.equal(mapped.hidrante_mangot, true);
  assert.equal(mapped.acesso_viatura, true);

  // Compatibilidade legada via aliases não-enumeráveis
  assert.equal(mapped.saidas_emergencia, true);
  assert.equal(mapped.iluminacao_emergencia, true);
  assert.equal(mapped.sinalizacao_emergencia, true);
  assert.equal(mapped.hidrante_mangotinhos, true);
  assert.equal(mapped.acesso_viatura_edificacao, true);

  // Não selecionadas
  assert.equal(mapped.chuveiros_auto, false);
  assert.equal(mapped.resfriamento, false);
  assert.equal(mapped.espuma, false);
  assert.equal(mapped.sis_fixo_gases, false);
  assert.equal(mapped.sis_prot_cont_desc_elet, false);
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

test('acquireDraftSubmissionLock gerencia concorrência e idempotência atômica', () => {
  const testUserId = 'test-lock-user-' + Date.now();
  db.prepare(`
    INSERT INTO users (id, name, email, demo, created_at)
    VALUES (?, ?, ?, 1, ?)
  `).run(testUserId, 'Usuário Lock Test', 'lock-test@exemplo.com', new Date().toISOString());

  try {
    const draftInput: ProjectDraftInput = {
      reference_name: 'Edificação Teste Lock',
      building_area: 100,
      number_floors: 1,
      height: 'Térrea = Um pavimento',
      address: { zip_code: '45355000', public_place: 'RUA LOCK', number: '10', municipio_id: 22 },
      institution: { cnae: '4754701', razao_social: 'EMPRESA LOCK' }
    };

    const draft = upsertProjectDraft(testUserId, draftInput);

    // 1. Lock em rascunho inexistente retorna not_found
    const notFoundLock = acquireDraftSubmissionLock(testUserId, 'inexistent-id-999');
    assert.deepEqual(notFoundLock, { acquired: false, reason: 'not_found' });

    // 2. Primeira aquisição deve ser bem sucedida
    const lock1 = acquireDraftSubmissionLock(testUserId, draft.id);
    assert.deepEqual(lock1, { acquired: true });

    // Status no banco deve ser 'submitting'
    const inFlight = getProjectDraft(testUserId, draft.id);
    assert.equal(inFlight?.status, 'submitting');

    // 3. Segunda tentativa imediata de lock deve ser rejeitada como already_submitting
    const lock2 = acquireDraftSubmissionLock(testUserId, draft.id);
    assert.deepEqual(lock2, { acquired: false, reason: 'already_submitting' });

    // 4. Se a submissão falhar, status vai para 'error' e lock pode ser readquirido (retry)
    updateDraftSubmission(testUserId, draft.id, { ok: false, error: 'Falha temporária de rede' });
    const errorState = getProjectDraft(testUserId, draft.id);
    assert.equal(errorState?.status, 'error');

    const retryLock = acquireDraftSubmissionLock(testUserId, draft.id);
    assert.deepEqual(retryLock, { acquired: true });

    // 5. Quando submissão tiver sucesso, status vai para 'submitted'
    updateDraftSubmission(testUserId, draft.id, {
      ok: true,
      result: { id: 12345, num_projeto: '001/2026' }
    });
    const finalState = getProjectDraft(testUserId, draft.id);
    assert.equal(finalState?.status, 'submitted');

    // 6. Tentativa após submissão definitiva retorna already_submitted
    const submittedLock = acquireDraftSubmissionLock(testUserId, draft.id);
    assert.deepEqual(submittedLock, { acquired: false, reason: 'already_submitted' });
  } finally {
    db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
  }
});

test('Persistência SQLite: criptografia AES-256-GCM do payload_json e compatibilidade legada', () => {
  const testUserId = 'test-crypto-user-' + Date.now();
  db.prepare(`
    INSERT INTO users (id, name, email, demo, created_at)
    VALUES (?, ?, ?, 1, ?)
  `).run(testUserId, 'Usuário Crypto Test', 'crypto-test@exemplo.com', new Date().toISOString());

  try {
    const sensitiveInput: ProjectDraftInput = {
      reference_name: 'Edificação Ultra Segura',
      building_area: 320,
      number_floors: 2,
      height: 'Baixa = H <= 6,00 m',
      address: {
        zip_code: '45355000',
        public_place: 'AVENIDA DA PRIVACIDADE',
        number: '777',
        municipio_id: 22
      },
      institution: {
        tipo_pessoa: 'PJ',
        cnpj: '12345678000199',
        razao_social: 'CONFIDENCIAL ENGENHARIA LTDA'
      },
      proprietario: {
        tipo: 'PF',
        cpf_cnpj: '98765432100',
        nome_razao_social: 'Engenheiro Confidencial'
      }
    };

    // 1. Salva rascunho com dados sensíveis
    const saved = upsertProjectDraft(testUserId, sensitiveInput);
    assert.ok(saved.id);

    // 2. Lê a coluna raw no banco SQLite diretamente
    const rawRow = db
      .prepare('SELECT payload_json FROM fenix_project_drafts WHERE id = ?')
      .get(saved.id) as { payload_json: string } | undefined;
    assert.ok(rawRow);
    const rawPayload = rawRow.payload_json;

    // Garante que os dados sensíveis NÃO estão em texto claro no SQLite
    assert.equal(rawPayload.includes('12345678000199'), false, 'CNPJ não deve estar em texto claro no SQLite');
    assert.equal(rawPayload.includes('98765432100'), false, 'CPF não deve estar em texto claro no SQLite');
    assert.equal(rawPayload.includes('CONFIDENCIAL ENGENHARIA LTDA'), false, 'Razão social não deve estar em texto claro no SQLite');
    assert.equal(rawPayload.includes('Engenheiro Confidencial'), false, 'Nome não deve estar em texto claro no SQLite');

    // Garante formato selado AES-256-GCM (três partes base64url separadas por ponto: iv.tag.ciphertext)
    const parts = rawPayload.split('.');
    assert.equal(parts.length, 3, 'Payload selado deve conter iv, authTag e ciphertext');

    // 3. Lê via getProjectDraft e verifica se a decriptação restaura os dados sensíveis perfeitamente
    const decrypted = getProjectDraft(testUserId, saved.id);
    assert.ok(decrypted);
    assert.equal(decrypted.data.institution?.cnpj, '12345678000199');
    assert.equal(decrypted.data.institution?.razao_social, 'CONFIDENCIAL ENGENHARIA LTDA');
    assert.equal((decrypted.data.proprietario as any)?.cpf_cnpj, '98765432100');
    assert.equal((decrypted.data.proprietario as any)?.nome_razao_social, 'Engenheiro Confidencial');

    // 4. Teste de retrocompatibilidade: rascunho legado armazenado em JSON plano não criptografado
    const legacyPlainJson = JSON.stringify({
      data: {
        reference_name: 'Edificação Legada Plaintext',
        building_area: 150,
        institution: { cnpj: '55555555000155', razao_social: 'LEGADO S/A' }
      }
    });

    db.prepare('UPDATE fenix_project_drafts SET payload_json = ? WHERE id = ?').run(legacyPlainJson, saved.id);

    // Leitura deve suportar JSON plano normalmente sem erros
    const legacyRead = getProjectDraft(testUserId, saved.id);
    assert.ok(legacyRead);
    assert.equal(legacyRead.data.reference_name, 'Edificação Legada Plaintext');
    assert.equal(legacyRead.data.institution?.cnpj, '55555555000155');
    assert.equal(legacyRead.data.institution?.razao_social, 'LEGADO S/A');
  } finally {
    db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
  }
});

test('runDraftAiAssistant responde sobre a situação da edificação e processos com systemContext.activeBuilding', async () => {
  const req = {
    message: 'Explicar a situação atual da edificação...',
    currentDraft: {},
    systemContext: {
      activeBuilding: {
        id: 'b-101',
        reference: 'Galpão Principal Feira',
        municipality: 'FEIRA DE SANTANA',
        area: '450.00',
        floors: '2',
        height: 'Baixa-Média = 6,00 m < H <= 12,00 m',
        processes: [
          {
            protocol: '020863/45355000/2026',
            type: 'Projeto Técnico Simplificado (PTS)',
            status: 'Em análise',
            stage: 'Análise Técnica de Projeto',
            updatedAt: '2026-10-25T10:00:00.000Z'
          }
        ]
      }
    }
  };

  const res = await runDraftAiAssistant(req);

  assert.ok(res.reply.includes('Galpão Principal Feira'));
  assert.ok(res.reply.includes('020863/45355000/2026'));
  assert.ok(res.reply.includes('Em análise'));
  assert.ok(res.thinkingSteps.includes('Consultando base sincronizada de edificações e processos no Fênix...'));
  assert.ok(res.thinkingSteps.includes('Verificando etapas, notificações e status de tramitação...'));
  assert.ok(res.suggestions.includes('✦ Iniciar novo cadastro para esta edificação'));
});

test('runDraftAiAssistant responde sobre o panorama geral da carteira com systemContext.metricsSummary', async () => {
  const req = {
    message: 'Analise a situação geral das edificações e processos acompanhados',
    currentDraft: {},
    systemContext: {
      metricsSummary: {
        totalBuildings: 12,
        inAnalysis: 3,
        notified: 2,
        stopped: 1
      }
    }
  };

  const res = await runDraftAiAssistant(req);

  assert.ok(res.reply.includes('Total de Edificações'));
  assert.ok(res.reply.includes('12'));
  assert.ok(res.reply.includes('Processos Notificados'));
  assert.ok(res.reply.includes('2'));
  assert.ok(res.thinkingSteps.includes('Consultando base sincronizada de edificações e processos no Fênix...'));
  assert.ok(res.thinkingSteps.includes('Verificando etapas, notificações e status de tramitação...'));
  assert.ok(res.suggestions.includes('✦ Iniciar novo cadastro para esta edificação'));
});

test('runDraftAiAssistant preenche formPatch ao solicitar "✦ Iniciar novo cadastro para esta edificação"', async () => {
  const req = {
    message: '✦ Iniciar novo cadastro para esta edificação',
    currentDraft: {},
    systemContext: {
      activeBuilding: {
        id: 'b-202',
        reference: 'Centro Comercial Apuarema',
        municipality: 'APUAREMA',
        area: '220.00',
        floors: '2',
        height: 'Baixa = H <= 6,00 m'
      }
    }
  };

  const res = await runDraftAiAssistant(req);

  assert.ok(res.formPatch);
  assert.equal(res.formPatch.name, 'Centro Comercial Apuarema');
  assert.equal(res.formPatch.edification?.building_area, 220);
  assert.equal(res.formPatch.address?.county, 'APUAREMA');
  assert.equal(res.formPatch.address?.municipio_id, 22);
});

test('runDraftAiAssistant explica indisponibilidade de documentos sem vazar erros de rascunho ou formPatch quando currentView !== register', async () => {
  const req = {
    message: 'O que ta fazendo esses docs ficarem como indisponíveis?',
    currentDraft: {}, // Rascunho vazio
    systemContext: {
      currentView: 'buildings',
      activeTab: 'Documentos',
      activeBuilding: {
        id: 'b-999',
        reference: 'GRAFICO EMPREENDIMENTOS LTDA',
        municipality: 'FEIRA DE SANTANA',
        processes: [
          {
            protocol: '0028099-5/2026',
            type: 'Projeto Técnico Simplificado (PTS)',
            status: 'Homologado',
            stage: 'Processo Homologado',
            documents: [
              { name: 'Metadados de DAE', status: 'Indisponível', available: false },
              { name: 'Comprovante de protocolo', status: 'Indisponível', available: false },
              { name: 'Certificado de aprovação', status: 'Indisponível', available: false }
            ]
          }
        ]
      }
    }
  };

  const res = await runDraftAiAssistant(req);

  // 1. Resposta explica sobre os documentos e a edificação
  assert.ok(res.reply.includes('GRAFICO EMPREENDIMENTOS LTDA'));
  assert.ok(res.reply.includes('0028099-5/2026'));
  assert.ok(res.reply.includes('SEFAZ-BA') || res.reply.includes('DAE'));
  assert.ok(res.reply.includes('Certificado') || res.reply.includes('protocolo'));

  // 2. NÃO deve reclamar de CEP ou complemento de rascunho
  assert.equal(res.reply.includes('CEP deve conter'), false);
  assert.equal(res.reply.includes('Preenchi o complemento com ***'), false);
  assert.equal(res.reply.includes('Existem 4 pendências'), false);

  // 3. NÃO deve retornar formPatch
  assert.equal(res.formPatch, undefined);
  assert.deepEqual(res.appliedChangesSummary, []);

  // 4. Thinking steps adequados
  assert.ok(res.thinkingSteps.some((step) => step.includes('documentos')));

  // 5. NÃO deve inventar regras especulativas sobre CBMBA
  assert.equal(res.reply.includes('desativa a emissão do comprovante'), false);
  assert.equal(res.reply.includes('assinatura digital final do Comando dos Bombeiros'), false);
});

test('runDraftAiAssistant diagnostica falha de consulta / sessão Fênix e orienta reconexão em Configurações', async () => {
  const req = {
    message: 'Por que o certificado e o comprovante deram erro?',
    currentDraft: {},
    systemContext: {
      currentView: 'buildings',
      activeTab: 'Documentos',
      activeBuilding: {
        id: '39315',
        reference: 'Alex Da cruz Gomes',
        municipality: 'CAMACARI',
        processes: [
          {
            protocol: '0030596-5/2024',
            type: 'Projeto técnico · PTSCLCB - Análise',
            status: 'Homologado',
            stage: 'Homologado',
            documents: [
              { name: 'Metadados de DAE', status: 'metadata_error', available: false, error: 'Falha ao consultar os metadados do DAE. Tente consultar novamente.' },
              { name: 'Comprovante de protocolo', status: 'metadata_error', available: false, error: 'Falha ao consultar o comprovante. Tente consultar novamente.' },
              { name: 'Certificado de aprovação', status: 'metadata_error', available: false, error: 'Falha ao consultar o certificado oficial. Tente consultar novamente.' }
            ]
          }
        ]
      }
    }
  };

  const res = await runDraftAiAssistant(req);

  assert.ok(res.reply.includes('Alex Da cruz Gomes'));
  assert.ok(res.reply.includes('0030596-5/2024'));
  assert.ok(res.reply.includes('Configurações'));
  assert.ok(res.reply.includes('Sessão') || res.reply.includes('sessão'));
  assert.ok(res.reply.includes('Falha ao consultar'));
  assert.equal(res.reply.includes('desativa a emissão do comprovante'), false);
  assert.equal(res.reply.includes('assinatura digital final do Comando dos Bombeiros'), false);
  assert.equal(res.formPatch, undefined);
  assert.deepEqual(res.appliedChangesSummary, []);
});

test('Enum Nu: 8 tipos de projeto e enquadramentos oficiais do Fênix CBMBA', () => {
  const domains = getFenixDomains();
  assert.equal(domains.projectTypes.length, 8);
  const typeIds = domains.projectTypes.map((t) => t.id).sort((a, b) => a - b);
  assert.deepEqual(typeIds, [1, 2, 3, 4, 5, 6, 7, 8]);

  // PT (1)
  const pt = domains.projectTypes.find((t) => t.id === 1)!;
  assert.equal(pt.code, 'PT');
  assert.equal(pt.mode, 'pt');
  assert.equal(pt.temporary, false);

  // PTIOT (2)
  const ptiot = domains.projectTypes.find((t) => t.id === 2)!;
  assert.equal(ptiot.code, 'PTIOT');
  assert.equal(ptiot.temporary, true);

  // PTOTEP (3)
  const ptotep = domains.projectTypes.find((t) => t.id === 3)!;
  assert.equal(ptotep.code, 'PTOTEP');
  assert.equal(ptotep.temporary, true);

  // PTSCLCB1 (4)
  const ptsclcb1 = domains.projectTypes.find((t) => t.id === 4)!;
  assert.equal(ptsclcb1.code, 'PTSCLCB1');
  assert.equal(ptsclcb1.mode, 'pts');

  // PTSCLCB2 (5)
  const ptsclcb2 = domains.projectTypes.find((t) => t.id === 5)!;
  assert.equal(ptsclcb2.code, 'PTSCLCB2');

  // PTSAVCB (6)
  const ptsavcb = domains.projectTypes.find((t) => t.id === 6)!;
  assert.equal(ptsavcb.code, 'PTSAVCB');

  // PTSAVCBPTIOT (7)
  const pts7 = domains.projectTypes.find((t) => t.id === 7)!;
  assert.equal(pts7.code, 'PTSAVCBPTIOT');
  assert.equal(pts7.temporary, true);

  // PTSAVCBPTOTEP (8)
  const pts8 = domains.projectTypes.find((t) => t.id === 8)!;
  assert.equal(pts8.code, 'PTSAVCBPTOTEP');
  assert.equal(pts8.temporary, true);
});

test('Validação de eventos temporários: duração <= 180 dias em PTS e antecedência em PT', () => {
  // PTSAVCBPTIOT (7) válido (duração 30 dias <= 180)
  const baseTempPts: ProjectDraftInput = {
    reference_name: 'Circo Temporário',
    tipo_projeto_id: 7,
    form_mode: 'pts',
    building_area: 500,
    number_floors: 1,
    height: 'Térrea = Um pavimento',
    n_art_rrt: 'BA20261628773',
    responsaveis_tecnicos: [
      {
        nome_tecnico: 'ENG. RESPONSAVEL EVENTO',
        cpf_cnpj_tecnico: '12345678901',
        conselho: 'CREA',
        n_registro_conselho: '54321-BA',
        email_tecnico: 'evento@eng.com.br',
        tel_tecnico: '71999990000',
        n_art_rrt: 'BA20261628773'
      }
    ],
    address: { zip_code: '45355000', public_place: 'Praça Central', number: 'S/N', municipio_id: 22 },
    institution: { cnae: '9001901' },
    questionario: {
      data_inicio_evento: '2026-12-01',
      data_termino_evento: '2026-12-30', // 29 dias
      publico_estimado: 300
    }
  };

  const validTempPts = buildAndValidateFenixProjectPayload(baseTempPts, 123);
  assert.equal(validTempPts.tipoProjetoId, 7);
  assert.equal(validTempPts.valid, true);

  // PTSAVCBPTIOT (7) inválido: duração > 180 dias
  const invalidTempPts: ProjectDraftInput = {
    ...baseTempPts,
    questionario: {
      data_inicio_evento: '2026-01-01',
      data_termino_evento: '2026-07-15', // 195 dias > 180
      publico_estimado: 300
    }
  };

  const resInvalidTemp = buildAndValidateFenixProjectPayload(invalidTempPts, 123);
  assert.equal(resInvalidTemp.valid, false);
  assert.ok(resInvalidTemp.errors.some((e) => e.includes('180 dias')));

  // PTSAVCBPTOTEP (8) inválido: duração > 180 dias
  const invalidTemp8: ProjectDraftInput = {
    ...baseTempPts,
    tipo_projeto_id: 8,
    questionario: {
      data_inicio_evento: '2026-01-01',
      data_termino_evento: '2026-08-01', // > 180 dias
      publico_estimado: 500
    }
  };
  const resInvalid8 = buildAndValidateFenixProjectPayload(invalidTemp8, 123);
  assert.equal(resInvalid8.valid, false);
  assert.ok(resInvalid8.errors.some((e) => e.includes('180 dias')));

  // PTIOT (2) com antecedência menor que 15 dias: gera warning
  const today = new Date();
  const soon = new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 dias à frente
  const farEnd = new Date(today.getTime() + 20 * 24 * 60 * 60 * 1000);

  const ptiotInput: ProjectDraftInput = {
    reference_name: 'Festival de Música',
    tipo_projeto_id: 2,
    form_mode: 'pt',
    building_area: 2500,
    number_floors: 1,
    height: 'Térrea = Um pavimento',
    address: { zip_code: '45355000', public_place: 'Parque de Exposições', number: '1', municipio_id: 22 },
    institution: { cnae: '9001901' },
    responsaveis_tecnicos: [
      { nome: 'Engenheiro Teste', crea_cau: '12345/BA', email: 'eng@teste.com', telefone: '71999999999', art_rrt: 'ART123' }
    ],
    questionario: {
      data_inicio_evento: soon.toISOString().split('T')[0],
      data_termino_evento: farEnd.toISOString().split('T')[0],
      publico_estimado: 5000
    }
  };

  const resPtiot = buildAndValidateFenixProjectPayload(ptiotInput, 123);
  assert.equal(resPtiot.tipoProjetoId, 2);
  assert.ok(resPtiot.warnings.some((w) => w.includes('15 dias')));
});

test('22 Medidas de Segurança: 6 básicas ativas em PTS e 16 avançadas zeradas vs todas permitidas em PT', () => {
  // Teste PTS: todas as 22 medidas marcadas no input
  const allMeasures: Record<string, boolean> = {};
  for (const m of FENIX_22_SECURITY_MEASURES) {
    allMeasures[m] = true;
  }

  const ptsInput: ProjectDraftInput = {
    reference_name: 'Mercadinho do Bairro',
    tipo_projeto_id: 4,
    building_area: 180,
    number_floors: 1,
    height: 'Térrea = Um pavimento',
    address: { zip_code: '45355000', public_place: 'Rua Comercial', number: '10', municipio_id: 22 },
    institution: { cnae: '4712100' },
    securityMeasures: allMeasures
  };

  const resPts = buildAndValidateFenixProjectPayload(ptsInput, 123);
  assert.equal(resPts.tipoProjetoId, 4); // PTSCLCB1
  const payloadPtsMeasures = (resPts.fenixPayload as any).medida_seguranca;

  // As 6 básicas permitidas em PTS devem ser 1
  assert.equal(payloadPtsMeasures.iluminacao_emerg, 1);
  assert.equal(payloadPtsMeasures.brigada_incendio, 1);
  assert.equal(payloadPtsMeasures.sinal_emerg, 1);
  assert.equal(payloadPtsMeasures.extintores, 1);
  assert.equal(payloadPtsMeasures.saidas_emerg, 1);
  assert.equal(payloadPtsMeasures.control_mat_acab, 1);

  // As 16 medidas avançadas restritas a PT devem ser forçadas para 0 em PTS
  assert.equal(payloadPtsMeasures.acesso_viatura, 0);
  assert.equal(payloadPtsMeasures.hidrante_mangot, 0);
  assert.equal(payloadPtsMeasures.chuveiros_auto, 0);
  assert.equal(payloadPtsMeasures.deteccao_incendio, 0);
  assert.equal(payloadPtsMeasures.alarme_incendio, 0);
  assert.equal(payloadPtsMeasures.control_fumaca, 0);
  assert.equal(payloadPtsMeasures.resfriamento, 0);
  assert.equal(payloadPtsMeasures.espuma, 0);
  assert.equal(payloadPtsMeasures.sis_fixo_gases, 0);
  assert.equal(payloadPtsMeasures.sis_prot_cont_desc_elet, 0);
  assert.equal(payloadPtsMeasures.comp_horizontal, 0);
  assert.equal(payloadPtsMeasures.comp_vertical, 0);
  assert.equal(payloadPtsMeasures.separacao_edific, 0);
  assert.equal(payloadPtsMeasures.elevador_emerg, 0);
  assert.equal(payloadPtsMeasures.seguranca_estrutural, 0);
  assert.equal(payloadPtsMeasures.plano_emerg_incendio, 0);

  // Teste PT Completo: todas as 22 medidas podem ser 1
  const ptInput: ProjectDraftInput = {
    reference_name: 'Edifício Comercial Grande',
    building_area: 3000,
    number_floors: 5,
    height: 'Média = 12,00 m < H <= 23,00 m',
    address: { zip_code: '45355000', public_place: 'Av Central', number: '100', municipio_id: 22 },
    institution: { cnae: '6821801' },
    responsaveis_tecnicos: [
      { nome: 'Engenheiro Responsável', crea_cau: '54321/BA', email: 'eng@obra.com', telefone: '71988888888', art_rrt: 'ART999' }
    ],
    securityMeasures: allMeasures
  };

  const resPt = buildAndValidateFenixProjectPayload(ptInput, 123);
  assert.equal(resPt.tipoProjetoId, 1); // PT
  const payloadPtMeasures = (resPt.fenixPayload as any).medida_seguranca;

  // Em PT, todas as 22 medidas ativadas no input devem ser 1
  for (const m of FENIX_22_SECURITY_MEASURES) {
    assert.equal(payloadPtMeasures[m], 1, `Medida ${m} deveria ser 1 em PT`);
  }
});

test('Formatos oficiais do payload: registration_zip_code, subsolo dummy e warning de bloqueio PTS via tela PT', () => {
  // 1. registration nulo -> registration_zip_code deve ser "-45355000"
  const draftNullReg: ProjectDraftInput = {
    reference_name: 'Imóvel Sem Inscrição',
    registration: null,
    building_area: 120,
    number_floors: 1,
    height: 'Térrea = Um pavimento',
    address: { zip_code: '45355-000', public_place: 'Rua Sem Inscrição', number: '5', municipio_id: 22 },
    institution: { cnae: '4754701' }
  };

  const resNullReg = buildAndValidateFenixProjectPayload(draftNullReg, 123);
  assert.equal((resNullReg.fenixPayload as any).registration_zip_code, '-45355000');

  // 2. registration preenchido -> registration_zip_code deve ser "12345-45355000"
  const draftWithReg: ProjectDraftInput = {
    ...draftNullReg,
    registration: '12345'
  };
  const resWithReg = buildAndValidateFenixProjectPayload(draftWithReg, 123);
  assert.equal((resWithReg.fenixPayload as any).registration_zip_code, '12345-45355000');

  // 3. Subsolo dummy automático no occupations_divisions quando não há subsolo
  const divisions = (resNullReg.fenixPayload as any).occupations_divisions as any[];
  assert.ok(divisions.length >= 2);
  const underground = divisions.find((d) => d.underground === true);
  assert.ok(underground);
  assert.equal(underground.occupation_group_id, 13);
  assert.equal(underground.division_group_id, 58);
  assert.equal(underground.principal, false);

  // 4. Warning unificado quando imóvel se enquadra em PTS mas usuário selecionou PT Completo
  const draftPtsInPtForm: ProjectDraftInput = {
    ...draftNullReg,
    tipo_projeto_id: 1
  };
  const resBlockedWarning = buildAndValidateFenixProjectPayload(draftPtsInPtForm, 123);
  assert.ok(
    resBlockedWarning.warnings.some((w) =>
      w.includes('campo Tipo do Projeto Técnico')
    )
  );
});

test('Formulário unificado: derivação de modalidade diretamente por tipo_projeto_id sem depender de form_mode', () => {
  const baseInput: ProjectDraftInput = {
    reference_name: 'Loja Teste',
    building_area: 150,
    number_floors: 1,
    height: 'Térrea = Um pavimento',
    address: { zip_code: '45355000', public_place: 'Rua Central', number: '10', municipio_id: 22 },
    institution: { cnae: '4754701' }
  };

  // 1. tipo_projeto_id = 4 (PTSCLCB1) mesmo com form_mode = 'pt'
  const resPts = buildAndValidateFenixProjectPayload({
    ...baseInput,
    tipo_projeto_id: 4,
    form_mode: 'pt' // form_mode não deve interferir
  }, 123);
  assert.equal(resPts.tipoProjetoId, 4);
  assert.equal(resPts.tipoProjetoSigla, 'PTSCLCB1');
  assert.equal(resPts.valid, true);

  // 2. tipo_projeto_id = 1 (PT) mesmo com form_mode = 'pts'
  const resPt = buildAndValidateFenixProjectPayload({
    ...baseInput,
    building_area: 2500,
    number_floors: 4,
    height: 'Baixa-Média = 6,00 m < H <= 12,00 m',
    tipo_projeto_id: 1,
    form_mode: 'pts', // form_mode não deve interferir
    responsaveis_tecnicos: [
      { nome: 'Engenheiro Teste', crea_cau: '12345/BA', email: 'eng@teste.com', telefone: '71999999999' }
    ]
  }, 123);
  assert.equal(resPt.tipoProjetoId, 1);
  assert.equal(resPt.tipoProjetoSigla, 'PT');
});

test('Formulário unificado: 16 medidas avançadas de PT e enquadramento automático vs explicitamente PTS', () => {
  const baseSmallInput: ProjectDraftInput = {
    reference_name: 'Pequena Fábrica',
    building_area: 180,
    number_floors: 1,
    height: 'Térrea = Um pavimento',
    address: { zip_code: '45355000', public_place: 'Rua das Indústrias', number: '50', municipio_id: 22 },
    institution: { cnae: '4754701' }
  };

  // 1. Enquadramento automático COM medida avançada (hidrante_mangot: true): deve enquadrar em PT (1)
  const autoPt = buildAndValidateFenixProjectPayload({
    ...baseSmallInput,
    securityMeasures: {
      hidrante_mangot: true
    }
  }, 123);
  assert.equal(autoPt.tipoProjetoId, 1);
  assert.equal(autoPt.tipoProjetoSigla, 'PT');
  assert.equal((autoPt.fenixPayload as any).medida_seguranca.hidrante_mangot, 1);

  // 2. Explicitamente PTS (tipo_projeto_id: 4) com medida avançada:
  // - Zera a medida avançada no payload enviado ao Fênix para a API não rejeitar
  // - Emite warning explicativo
  const ptsWithAdvanced = buildAndValidateFenixProjectPayload({
    ...baseSmallInput,
    tipo_projeto_id: 4,
    securityMeasures: {
      extintores: true,
      hidrante_mangot: true,
      alarme_incendio: true
    }
  }, 123);
  assert.equal(ptsWithAdvanced.tipoProjetoId, 4);
  assert.equal((ptsWithAdvanced.fenixPayload as any).medida_seguranca.extintores, 1);
  assert.equal((ptsWithAdvanced.fenixPayload as any).medida_seguranca.hidrante_mangot, 0);
  assert.equal((ptsWithAdvanced.fenixPayload as any).medida_seguranca.alarme_incendio, 0);
  assert.ok(
    ptsWithAdvanced.warnings.some((w) =>
      w.includes('Medidas avançadas de engenharia são exclusivas de Projeto Técnico Completo (PT)')
    )
  );
});

test('Copiloto IA atualiza tipo_projeto_id diretamente no formulário unificado', async () => {
  const baseReq = {
    currentDraft: {
      reference_name: 'Edificação Teste',
      building_area: 300,
      number_floors: 1,
      height: 'Térrea = Um pavimento',
      address: { zip_code: '45355000', public_place: 'Rua A', number: '1', municipio_id: 22 }
    }
  };

  // 1. "mudar para ocupação temporária"
  const resTemp = await runDraftAiAssistant({
    ...baseReq,
    message: 'mudar para ocupação temporária'
  });
  assert.equal(resTemp.formPatch?.tipo_projeto_id, 2);
  assert.equal(resTemp.formPatch?.evento, 'S');
  assert.ok(resTemp.appliedChangesSummary.some((s) => s.includes('Tipo do Projeto Técnico')));

  // 2. "colocar PTSAVCB"
  const resAvcb = await runDraftAiAssistant({
    ...baseReq,
    message: 'colocar PTSAVCB no projeto'
  });
  assert.equal(resAvcb.formPatch?.tipo_projeto_id, 6);
  assert.equal(resAvcb.formPatch?.form_mode, 'pts');

  // 3. "mudar para PT completo"
  const resPt = await runDraftAiAssistant({
    ...baseReq,
    message: 'mudar para PT completo'
  });
  assert.equal(resPt.formPatch?.tipo_projeto_id, 1);
  assert.equal(resPt.formPatch?.form_mode, 'pt');

  // 4. "colocar PTSCLCB2"
  const resClcb2 = await runDraftAiAssistant({
    ...baseReq,
    message: 'colocar PTSCLCB2'
  });
  assert.equal(resClcb2.formPatch?.tipo_projeto_id, 5);
  assert.equal(resClcb2.formPatch?.form_mode, 'pts');
});

test('streamDraftAiAssistant emite eventos de progresso SSE (thinking, delta, done) e suporta abort', async () => {
  const req = {
    message: 'Preencha o rascunho com comércio de 300 m² e 2 pavimentos em Salvador',
    currentDraft: {
      reference_name: 'Loja Salvador',
      address: { zip_code: '40000000', public_place: 'Av Sete', number: '100' }
    }
  };

  const events: DraftAiStreamEvent[] = [];
  const finalResponse = await streamDraftAiAssistant(req, (event) => {
    events.push(event);
  });

  assert.ok(finalResponse.reply);
  assert.ok(events.length > 0);

  // Deve haver eventos thinking, delta e done
  const thinkingEvents = events.filter((e) => e.type === 'thinking');
  const deltaEvents = events.filter((e) => e.type === 'delta');
  const doneEvents = events.filter((e) => e.type === 'done');

  assert.ok(thinkingEvents.length >= 1);
  assert.ok(deltaEvents.length >= 1);
  assert.equal(doneEvents.length, 1);

  // O evento done deve conter reply, formPatch e thinkingSteps
  const done = doneEvents[0] as Extract<DraftAiStreamEvent, { type: 'done' }>;
  assert.equal(done.reply, finalResponse.reply);
  assert.ok(done.thinkingSteps.length > 0);
  assert.ok(done.formPatch);
  assert.equal(done.formPatch?.edification?.building_area, 300);
  assert.equal(done.formPatch?.edification?.number_floors, 2);

  // Teste de abort signal
  const controller = new AbortController();
  controller.abort(); // já cancelado
  const abortEvents: DraftAiStreamEvent[] = [];
  await streamDraftAiAssistant(
    req,
    (event) => {
      abortEvents.push(event);
    },
    controller.signal
  );
  // Não deve quebrar o processo e para graciosamente
  assert.ok(abortEvents.length <= 2);
});

test('Bloqueio estrito de RT e ART/RRT: rascunhos PTSCLCB2 ou PT sem RT ou sem ART/RRT retornam valid: false e erros explícitos', () => {
  // 1. PTSCLCB2 sem ART/RRT e sem RT
  const ptsSemRt: ProjectDraftInput = {
    tipo_projeto_id: 5,
    reference_name: 'Comércio Sem RT',
    building_area: 300,
    number_floors: 2,
    height: 'Baixa = H <= 6,00 m',
    address: { zip_code: '45355000', public_place: 'Rua Central', number: '10', municipio_id: 22 },
    institution: { cnae: '4754701', razao_social: 'LOJA TESTE' }
  };
  const resPts = buildAndValidateFenixProjectPayload(ptsSemRt);
  assert.equal(resPts.valid, false);
  assert.equal(resPts.tipoProjetoSigla, 'PTSCLCB2');
  assert.equal(resPts.rtOptional, false);
  assert.ok(resPts.errors.some((e) => e.includes('Número de ART/RRT do projeto técnico é obrigatório.')));
  assert.ok(resPts.errors.some((e) => e.includes('Ao menos 1 Responsável Técnico pelo projeto deve ser informado.')));

  // 2. PT Completo com ART mas com campos incompletos no RT
  const ptRtIncompleto: ProjectDraftInput = {
    tipo_projeto_id: 1,
    reference_name: 'Edifício PT Incompleto',
    building_area: 1200,
    number_floors: 4,
    height: 'Média = 12,00 m < H <= 23,00 m',
    n_art_rrt: 'BA20261234567',
    address: { zip_code: '45355000', public_place: 'Av Central', number: '100', municipio_id: 22 },
    institution: { cnae: '6821801', razao_social: 'EMPRESA PT' },
    responsaveis_tecnicos: [
      {
        nome_tecnico: '', // Vazio
        cpf_cnpj_tecnico: '123', // Dígitos inválidos
        n_registro_conselho: '', // Vazio
        email_tecnico: 'invalido', // Sem @
        tel_tecnico: '123' // Menos de 10 dígitos
      }
    ]
  };
  const resPt = buildAndValidateFenixProjectPayload(ptRtIncompleto);
  assert.equal(resPt.valid, false);
  assert.ok(resPt.errors.some((e) => e.includes('Nome do Responsável Técnico é obrigatório.')));
  assert.ok(resPt.errors.some((e) => e.includes('CPF ou CNPJ do Responsável Técnico é obrigatório e deve ter 11 ou 14 dígitos.')));
  assert.ok(resPt.errors.some((e) => e.includes('Número de registro no conselho do Responsável Técnico é obrigatório.')));
  assert.ok(resPt.errors.some((e) => e.includes('E-mail do Responsável Técnico é obrigatório e deve ser válido.')));
  assert.ok(resPt.errors.some((e) => e.includes('Telefone com DDD do Responsável Técnico é obrigatório (10 ou 11 dígitos).')));
});

test('Mapeamento completo de RT: propriedades do frontend (nome_tecnico, tel_tecnico, etc.) populam fenixPayload corretamente', () => {
  const input: ProjectDraftInput = {
    tipo_projeto_id: 5,
    reference_name: 'Loja com Mapeamento Completo',
    building_area: 250,
    number_floors: 1,
    height: 'Térrea = Um pavimento',
    address: { zip_code: '45355000', public_place: 'Rua Principal', number: '50', municipio_id: 22 },
    institution: { cnae: '4754701', razao_social: 'COMERCIO TESTE' },
    n_art_rrt: 'BA20269999999',
    responsaveis_tecnicos: [
      {
        nome_tecnico: 'DRA. JULIANA ARQUITETA',
        cpf_cnpj_tecnico: '123.456.789-01',
        conselho: 'CAU',
        n_registro_conselho: 'A12345-6',
        email_tecnico: 'juliana@arquitetura.com',
        tel_tecnico: '(71) 98765-4321',
        n_art_rrt: 'BA20269999999'
      }
    ]
  };

  const res = buildAndValidateFenixProjectPayload(input);
  assert.equal(res.valid, true);
  assert.deepEqual(res.errors, []);

  const payload = res.fenixPayload;
  assert.equal(payload.n_art_rrt, 'BA20269999999');

  const tech = payload.technical as any;
  assert.equal(tech.name, 'DRA. JULIANA ARQUITETA');
  assert.equal(tech.tipo_numero, 'CAU');
  assert.equal(tech.crea_cau, 'A12345-6');
  assert.equal(tech.cpf_cnpj, '12345678901');
  assert.equal(tech.phone, '71987654321');
  assert.equal(tech.email, 'juliana@arquitetura.com');

  const rtList = payload.projeto_responsavel_tecnico as any[];
  assert.equal(rtList.length, 1);
  assert.equal(rtList[0].name, 'DRA. JULIANA ARQUITETA');
  assert.equal(rtList[0].tipo_numero, 'CAU');
  assert.equal(rtList[0].crea_cau, 'A12345-6');
  assert.equal(rtList[0].cpf_cnpj, '12345678901');
  assert.equal(rtList[0].phone, '71987654321');
  assert.equal(rtList[0].email, 'juliana@arquitetura.com');
  assert.equal(rtList[0].n_art_rrt, 'BA20269999999');
});

