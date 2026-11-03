import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFenixTechnicalProjectUpdatePayload } from './fenix-project-edit.js';

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
