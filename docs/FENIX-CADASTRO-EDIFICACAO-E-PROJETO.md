# Integração Fênix CBMBA: edificação, projeto e documentos

> **Tipo:** referência técnica de integração
> **Sistema**: Fênix CBMBA (Corpo de Bombeiros Militar da Bahia)
> **Versão observada no reverseapi**: `2.19.1`
> **Atualizado em:** 03/11/2026
> **Privacidade:** exemplos deste documento são sintéticos. Não registrar cadastros, IDs ou contatos reais aqui.
> **Escopo observado:** as telas descritas foram acessadas pelo perfil profissional/solicitante. Este guia cobre uma parte do inventário desse perfil; as demais telas e ações estão organizadas no [roadmap de paridade](ROADMAP-V1-A-V2.md).

O reverseapi é a fonte para descobrir rotas e consultar o Fênix. Seu catálogo de escrita é heurístico e não transmite arquivos binários. Uploads precisam usar a sessão Fênix do backend do painel depois de confirmar o formulário e os IDs exigidos na interface oficial.

---

## 1. Como o cadastro de projeto relaciona a edificação

### Cadastro isolado de edificação
Na documentação de rotas e na declaração de serviços do Fênix, constam os seguintes endpoints RESTful clássicos:
- `POST /api/v1/edifications` (declarado no serviço `Cn.enviarDados`)
- `PUT /api/v1/edifications/{id}` (declarado no serviço `Cn.update`)

Na versão observada do frontend, o fluxo de cadastro usa o formulário de Projeto Técnico. A presença de uma rota no catálogo, por si só, não comprova que ela seja usada pela interface.

### Auditoria das rotas de edição pelo reverseapi (03/11/2026)

O catálogo reverseapi do frontend `2.19.1` lista as duas rotas de escrita abaixo. Nesta auditoria também foram consultados os detalhes da edificação e do projeto com os GETs do próprio reverseapi; ambos responderam HTTP 200. Nenhuma escrita foi enviada.

| Operação | Catálogo | Evidência de rede | Avaliação |
|---|---|---|---|
| `PUT /api/v1/edifications/{edificacao_id}` (`put_edifications_param`) | Disponível no catálogo, com corpo para endereço, nome, altura, pavimentos e áreas | `observedInChrome: false`; o bundle declara `Cn.update`, mas não há chamada desse método no fluxo de edição aberto | **Não usar como contrato do botão Salvar desse fluxo.** A interface edita a edificação dentro do formulário do projeto e segue pelo update do projeto. A rota isolada continua sem uso de interface comprovado. |
| `PUT /api/v1/technicalproject/{projeto_tecnico_id}` (`put_technicalproject_param`) | Disponível no catálogo; o corpo inclui dados de projeto e dados da edificação/endereço | `observedInChrome: false`; bundle vincula o modo `editForm` a `I.update(dataResource)`; nenhum `PUT` real foi enviado | **Rota de edição confirmada por interface + catálogo.** O formulário carregou em contexto de edição; a chamada final só foi identificada no bundle, não capturada em rede. |

`get_edifications_param` (`GET /api/v1/edifications/{id}`) e `get_projetos_tecnicos_param` (`GET /api/v1/projetos-tecnicos/{id}`) responderam HTTP 200 via reverseapi e retornaram, respectivamente, dados da edificação vinculados a `technical_project` e o projeto com sua `edification`. Esses GETs confirmam leitura e vínculo, não a execução de uma escrita.

**Conclusão para implementação:** tratar `PUT /technicalproject/{id}` como rota da edição contextual de projeto + edificação no perfil solicitante. A interface não apresenta um salvamento isolado da edificação nesse fluxo. `PUT /edifications/{id}` existe no catálogo e no serviço do bundle, mas não foi observado como chamada desse formulário. A confirmação de resposta e persistência do `PUT` exige um teste de escrita em homologação; nenhum cadastro real foi alterado nesta auditoria.

### Verificação visual do perfil solicitante no Chrome (03/11/2026)

Na sessão autenticada, a lista `Projetos Técnicos > Completos` mostrou a ação `Visualizar`. Em outra lista do perfil solicitante (`Solicitações`), algumas linhas `Notificado` mostraram `Editar`; o link abriu `/#/app/edification/{id}` com o formulário de endereço e edificação preenchido. O botão `CONTINUAR` avançou para `/#/app/technicalproject/{id}`, exibindo o formulário do projeto preenchido e o botão `SALVAR`. Nenhum campo foi alterado e `SALVAR` não foi acionado.

O bundle público `app.204b8f23.js` confirma o encadeamento: a rota `edification/:id` carrega a edificação com `Cn.buscarPorId`; o método `continuar()` faz apenas `router.replace` para `technicalProjects-form`, passando o ID do projeto e o da edificação. No formulário de projeto, o ramo `editForm` chama `I.update(dataResource)` e a resposta de sucesso informa que o projeto foi modificado. A operação do reverseapi compatível com esse `update` é `put_technicalproject_param` (`PUT /api/v1/technicalproject/{id}`), cujo corpo inclui os campos de projeto, edificação e endereço. Esse é o fluxo de atualização combinado observado no perfil solicitante; a chamada PUT em si não foi executada nem capturada no Chrome.

Os GETs `get_edifications_param` e `get_projetos_tecnicos_param` responderam HTTP 200 via reverseapi para o contexto aberto. O antigo resultado `upstream_unavailable` de `get_request` ocorreu sem paginação explícita; a consulta paginada posterior e a lista autenticada carregaram. Nenhum `PUT` foi enviado e nenhum cadastro foi alterado.

### Fluxo observado
No Fênix CBMBA, a **Edificação não possui ciclo de vida desacoplado de um Projeto Técnico ou Solicitação**:
1. **Não existe rascunho de edificação no servidor**: Uma edificação não pode ser criada "órfã" na interface.
2. **A Etapa 1 (`/#/app/edification/new`, componente `edification-form`) é meramente local**: Ao preencher endereço e dados estruturais e clicar no botão **`CONTINUAR`**, o frontend Vue **não faz requisição de mutação (POST/PUT) na rede**.
3. **Passagem de Estado via Vue Router**: O componente valida todos os campos reativos no cliente e invoca:
   ```javascript
   this.$router.replace({
     name: "technicalProjects-form",
     params: {
       id: "new",
       edification: this.edification,
       address: this.address,
       // flags de enquadramento
     }
   });
   ```
4. **Persistência na Etapa 2 (`POST /api/v1/technicalproject`)**:
   O salvamento no banco de dados acontece exclusivamente no método `save()` do componente `technicalProjects-form` (`/#/app/technicalproject/new`).
   Nesse momento, os campos da edificação e do endereço são **mesclados na raiz do payload** (`dataResource`), informando:
   - `"edificacao_id": "new"` (quando o imóvel está sendo cadastrado pela primeira vez)
   - `"edificacao_id": "<ID_DA_EDIFICACAO>"` (quando é reaproveitada uma edificação existente da conta)

---

## 2. Etapa 1 — Formulário de Edificação e Endereço (`edification-form`)

A Etapa 1 é responsável por coletar a localização física e as características geométricas e estruturais do imóvel.

### 2.1 Rotas de Leitura e Apoio

| Rota | Método | Função |
|---|---|---|
| `/api/v1/detailsRequester` | `GET` | Obtém os dados do usuário autenticado (`user.id`, perfil, papel). |
| `/api/v1/usuarios/{id}/edifications` | `GET` | Lista as edificações já vinculadas ao solicitante (para autopreenchimento). |
| `/api/v1/address` | `POST` | Busca endereço de uma edificação existente (`multipart/form-data` ou `urlencoded` com `edificacao_id`). |
| `/api/v1/counties` / `/api/v1/getAllCountys` | `GET` | Catálogo de municípios do estado da Bahia. |

> **Nota**: A rota `GET /api/v1/edifications` retorna HTTP 404 no Fênix 2.19.1. A consulta oficial da lista de imóveis da conta é sempre `GET /api/v1/usuarios/{id}/edifications`.

### 2.2 Estrutura do Objeto `address` (Endereço)

```json
{
  "zip_code": "00000000",
  "public_place": "RUA DO EXEMPLO",
  "number": "100",
  "complement": "SEM COMPLEMENTO",
  "district": "CENTRO",
  "county": "MUNICIPIO EXEMPLO",
  "municipio_id": "<ID_DO_MUNICIPIO>",
  "state": "BA",
  "geographic_coordinates": null
}
```

#### Regras de Campo e Validação:
- `zip_code` (string, 8 dígitos numéricos sem hífen). O preenchimento do CEP dispara no Vue a busca automática do logradouro e do município via `GET /api/v1/counties`.
- `public_place` (string, máx. 100 caracteres): Obrigatório. Nome da rua, avenida, praça, rodovia.
- `number` (string, máx. 10 caracteres): Obrigatório. Se não houver número predial, utilizar `"S/N"` ou `"SN"`.
- `complement` (string, máx. 50 caracteres): **Obrigatório no formulário da UI do Fênix**. Se não houver complemento real (como "Sala 1", "Galpão A"), o padrão adotado pelos projetistas e pela interface é enviar `"***"`, `"-"` ou `"NÃO POSSUI"`.
- `district` (string, máx. 50 caracteres): Obrigatório. Bairro ou distrito.
- `county` (string): Nome do município em maiúsculas (ex: `"MUNICIPIO EXEMPLO"`, `"SALVADOR"`).
- `municipio_id` (integer): ID numérico da tabela oficial de municípios do CBMBA. O campo `municipio.habilitar` deve ser `true`.
- `state` (string, 2 caracteres): Sempre fixado em `"BA"`.
- `geographic_coordinates` (string ou null, máx. 50 caracteres): Opcional, formato `"latitude,longitude"`.

### 2.3 Estrutura do Objeto `edification` (Dados Estruturais)

```json
{
  "reference_name": "EDIFICAÇÃO EXEMPLO",
  "registration": null,
  "registration_zip_code": "-00000000",
  "building_area": "180",
  "area_to_be_built": "0",
  "discount_area": "0",
  "total_area": "180",
  "height": "Térrea = Um pavimento",
  "number_floors": 1
}
```

#### Os 6 Valores Oficiais do Enum `height`:
O Fênix rejeita valores arbitrários de altura em metros. É mandatório enviar exatamente uma das 6 opções do enum:
1. `"Térrea = Um pavimento"`
2. `"Baixa = H <= 6,00 m"`
3. `"Baixa-Média = 6,00 m < H <= 12,00 m"`
4. `"Média = 12,00 m < H <= 23,00 m"`
5. `"Medianamente Alta = 23,00 m < H <= 30,00 m"`
6. `"Alta = Acima de 30,00 m"`

#### Regras de Cálculo e Enquadramento:
- **`total_area`**: Calculado dinamicamente:
  $$\text{total\_area} = \text{building\_area} + \text{area\_to\_be\_built} - \text{discount\_area}$$
  O valor resultante deve ser estritamente maior que zero (`total_area > 0`).
- **`number_floors`**: Número inteiro de pavimentos.
  - Se `height == "Térrea = Um pavimento"`, obrigatoriamente `number_floors` deve ser `1`.
  - Para projetos na modalidade **PTS** (Projeto Técnico Simplificado), `number_floors <= 3` e `total_area <= 750.00`.
- **`registration_zip_code`**: Regra de composição de chave:
  - Formato: `${registration || ''}-${zip_code}`.
  - Se a inscrição municipal/IPTU não for informada, o valor é `"-<CEP>"`.

---

## 3. Etapa 2 — Formulário de Projeto Técnico (`technicalProjects-form`)

A Etapa 2 recebe os objetos da Etapa 1 e vincula a atividade econômica (CNAE), o responsável técnico (ART), as ocupações, os riscos especiais e o questionário para definir as medidas de segurança.

### 3.1 As 8 Modalidades Oficiais de Projeto Técnico (`GET /api/v1/listaTodosTipoProjetos`)

| ID | Sigla | Descrição Oficial no Fênix | Área Máxima | Pavimentos | Vistoria Prévia? |
|---|---|---|---|---|---|
| **1** | **`PT`** | Projeto Técnico (Completo) | Sem limite (> 750 m²) | Sem limite | Sim |
| **2** | **`PTIOT`** | Projeto Técnico para Instalação e Ocupação Temporária | Temporário | Variável | Sim |
| **3** | **`PTOTEP`** | Projeto Técnico para Ocupação Temporária em Edificação Permanente | Permanente | Variável | Sim |
| **4** | **`PTSCLCB1`** | Projeto Técnico Simplificado com área até 200 m e altura térrea | Até 200 m² | Térreo (1 pav) | Não (CLCB Automático) |
| **5** | **`PTSCLCB2`** | Projeto Técnico Simplificado com área menor do que 750 m e altura térrea até 3 pavimentos | < 750 m² | Até 3 pavimentos | Não (CLCB) |
| **6** | **`PTSAVCB`** | Projeto Técnico Simplificado que se regulariza com vistoria | Até 750 m² | Conforme risco | Sim (Gera AVCB) |
| **7** | **`PTSAVCBPTIOT`** | Projeto Técnico Simplificado para Instalação e Ocupação Temporária | Temporário | Temporário | Sim |
| **8** | **`PTSAVCBPTOTEP`** | Projeto Técnico Simplificado para Ocupação Temporária em Edificação Permanente | Permanente | Permanente | Sim |

### 3.2 Regras de Enquadramento Automático (Lógica Interna do Fênix)

O frontend executa a função `defineProjectType()` baseando-se em:
1. **Área Total e Pavimentos**:
   - Se `total_area <= 200.00` e `number_floors == 1` e sem riscos especiais -> Enquadra em **`PTSCLCB1`** (ID 4).
   - Se `total_area <= 750.00` e `number_floors <= 3` -> Enquadra em **`PTSCLCB2`** (ID 5) ou **`PTSAVCB`** (ID 6).
   - Se `total_area > 750.00` ou `number_floors > 3` -> Força **`PT`** (ID 1).
2. **CNAEs com Bloqueio Obrigatório para PTS**:
   Determinados CNAEs de alto risco de explosivos, químicos e combustíveis **bloqueiam automaticamente qualquer modalidade de PTS**, forçando o enquadramento em **`PT Completo`** (ID 1), independentemente da área construída:
   - `0600001` (Extração de petróleo e gás natural)
   - `2092401` (Fabricação de pólvoras, explosivos e detonantes)
   - `2092402` (Fabricação de artigos pirotécnicos)
   - `2092403` (Fabricação de fósforos de segurança)
   - `4681801` (Comércio atacadista de álcool carburante, biodiesel, gasolina e combustíveis)
   - `4731800` (Comércio varejista de combustíveis para veículos automotores - Posto de Combustíveis)
   - `4732600` (Comércio varejista de lubrificantes)
   - `4789006` (Comércio varejista de fogos de artifício e artigos pirotécnicos)
3. **Riscos Especiais Declarados**:
   - Cobertura de fibras de sapé, piaçava ou similares superior a 200 m² (`cobertura_fsps_sup200: true`) desclassifica o PTS automático e exige vistoria prévia.

---

### 3.3 Estrutura Detalhada dos Blocos da Etapa 2

#### Bloco 1: `institution` (Estabelecimento / Pessoa Jurídica ou Física)
```json
{
  "tipo_pessoa": "PJ",
  "cnpj": "00000000000000",
  "razao_social": "EMPRESA EXEMPLO LTDA",
  "nome_fantasia": "COMÉRCIO EXEMPLO",
  "natureza_juridica": "Empresa de Pequeno Porte (EPP)",
  "cnae": "4754701",
  "atividade_economica": "Comércio varejista de móveis",
  "risk": 300
}
```

#### Bloco 2: `occupationsDivisions` (Ocupações e Divisões IT 14)
Um array de objetos contendo a ocupação principal e as ocupações de subsolo ou complementares:
```json
[
  {
    "occupation_group_id": 3,
    "division_group_id": 6,
    "principal": true,
    "underground": false,
    "qtde_leitos": null,
    "qtde_pessoas": null,
    "qtde_funcionarios": null
  },
  {
    "occupation_group_id": 13,
    "division_group_id": 58,
    "principal": false,
    "underground": true,
    "qtde_leitos": null,
    "qtde_pessoas": null,
    "qtde_funcionarios": null
  }
]
```
> **Regra do Subsolo**: Quando a edificação não possui subsolo ou não há ocupação no subsolo, a convenção oficial do Fênix exige enviar o registro especial: `occupation_group_id: 13` (Grupo "0" - Nenhuma ocupação) e `division_group_id: 58` (Divisão "0" - Nenhuma divisão) com `underground: true`.

#### Bloco 3: `proprietario` e `responsavel`
```json
{
  "proprietario": {
    "tipo_pessoa_prop": "PJ",
    "cpf_cnpj_prop": "00000000000000",
    "nome_proprietario": "EMPRESA EXEMPLO LTDA",
    "email_proprietario": "exemplo@example.invalid",
    "tel_proprietario": "71000000000"
  },
  "responsavel": {
    "tipo_pessoa_resp": "PJ",
    "cpf_cnpj_resp": "00000000000000",
    "nome_responsavel": "EMPRESA EXEMPLO LTDA",
    "email_responsavel_uso": "exemplo@example.invalid",
    "tel_responsavel_uso": "71000000000"
  },
  "responsavel_uso_igual_prop": "Sim"
}
```

#### Bloco 4: `technical` (Responsabilidade Técnica)
- `n_art_rrt`: número da Anotação de Responsabilidade Técnica. Use um valor fictício nos exemplos.
- `responsavel_tecnico_id`: integer ou null (ID do profissional quando cadastrado no conselho via `POST /api/v1/responsavelTecnicoCreaCau`).

#### Bloco 5: `specialRisks` e `classesGlp` (Líquidos Inflamáveis e Gases)
```json
{
  "liquidos_inflamaveis": 0,
  "gas_liquefeito_petroleo": 0,
  "produtos_perigosos": 0,
  "fogos_artificio": 0,
  "vaso_pressao": 0,
  "total_kg_glp": null,
  "classes_glp": []
}
```

#### Bloco 6: `securityMeasures` (Medidas de Segurança)
Boleanos/inteiros (`0` ou `1`) indicando os sistemas de proteção contra incêndio previstos no imóvel:
```json
{
  "iluminacao_emerg": 1,
  "sinal_emerg": 1,
  "extintores": 1,
  "saidas_emerg": 1,
  "brigada_incendio": 1,
  "acesso_viatura": 0,
  "hidrante_mangot": 0,
  "alarme_incendio": 0,
  "deteccao_incendio": 0,
  "seguranca_estrutural": 0,
  "chuveiros_auto": 0,
  "plano_emerg_incendio": 0
}
```

---

## 4. Montagem do Payload `save()` e Fluxo Pós-Save

### 4.1 A Chamada `POST /api/v1/technicalproject`
Quando o usuário clica em Salvar na Etapa 2, o método `save()` une todos os dados da Edificação e do Projeto Técnico no objeto `dataResource` e dispara uma única requisição JSON:

```json
{
  "tipo_projeto_id": 5,
  "isencao_id": 1,
  "decreto_estadual_adotado_id": 2,
  "n_art_rrt": "ART-EXEMPLO-0000",
  "n_projeto_anterior": null,

  "edificacao_id": "new",
  "reference_name": "EDIFICAÇÃO EXEMPLO",
  "registration": null,
  "registration_zip_code": "-00000000",
  "building_area": 434.11,
  "area_to_be_built": 0,
  "discount_area": 0,
  "total_area": 434.11,
  "height": "Baixa-Média = 6,00 m < H <= 12,00 m",
  "number_floors": 2,

  "address": {
    "zip_code": "00000000",
    "public_place": "RUA DO EXEMPLO",
    "number": "100",
    "complement": "SEM COMPLEMENTO",
    "district": "CENTRO",
    "county": "MUNICIPIO EXEMPLO",
    "municipio_id": "<ID_DO_MUNICIPIO>",
    "state": "BA",
    "geographic_coordinates": null
  },

  "tipo_pessoa": "PJ",
  "cnpj": "00000000000000",
  "razao_social": "EMPRESA EXEMPLO LTDA",
  "nome_fantasia": "COMÉRCIO EXEMPLO",
  "natureza_juridica": "Empresa de Pequeno Porte (EPP)",
  "cnae": "4754701",
  "risk": 300,
  "cobertura_fsps_sup200": false,

  "occupations": [
    {
      "occupation_group_id": 3,
      "division_group_id": 6,
      "principal": true,
      "underground": false
    },
    {
      "occupation_group_id": 13,
      "division_group_id": 58,
      "principal": false,
      "underground": true
    }
  ],

  "proprietario": {
    "tipo_pessoa_prop": "PJ",
    "nome_proprietario": "EMPRESA EXEMPLO LTDA",
    "cpf_cnpj_prop": "00000000000000",
    "email_proprietario": "exemplo@example.invalid",
    "tel_proprietario": "71000000000"
  },
  "responsavel": {
    "tipo_pessoa_resp": "PJ",
    "nome_responsavel": "EMPRESA EXEMPLO LTDA",
    "cpf_cnpj_resp": "00000000000000",
    "email_responsavel_uso": "exemplo@example.invalid",
    "tel_responsavel_uso": "71000000000"
  },
  "responsavel_uso_igual_prop": "Sim",

  "liquidos_inflamaveis": 0,
  "gas_liquefeito_petroleo": 0,
  "produtos_perigosos": 0,
  "fogos_artificio": 0,
  "vaso_pressao": 0,

  "medidas_seguranca": {
    "iluminacao_emerg": 1,
    "sinal_emerg": 1,
    "extintores": 1,
    "saidas_emerg": 1,
    "brigada_incendio": 1
  }
}
```

#### Resposta de Sucesso da API:
O backend cria a Edificação, a Instituição, as Ocupações e o Projeto Técnico em uma única transação de banco de dados e responde com `status: 200`:
```json
{
  "status": true,
  "message": "Projeto Técnico cadastrado com sucesso!",
  "data": {
    "id": "<ID_DO_PROJETO>",
    "num_projeto": "EXEMPLO/00000000/2099",
    "edificacao_id": "<ID_DA_EDIFICACAO>",
    "solicitacao_id": "<ID_DA_SOLICITACAO>"
  }
}
```

---

### 4.2 Protocolo e documentos depois do projeto

O reverseapi identifica as rotas de geração de solicitação e de anexos, mas não transporta arquivos. O catálogo marca as rotas de escrita como heurísticas; não confirma, por si só, a ordem da interface nem os valores de tipo documental.

Há duas descrições de sequência nos materiais disponíveis: este guia antigo colocava `technicalprojectdocs` antes de `gerarNumeroSolicitacao`, enquanto a skill operacional do reverseapi descreve a geração da solicitação antes do upload. Na inspeção de leitura do Chrome, uma solicitação PTS existente mostrou a aba de uploads descrita na seção 5. Isso confirma uma superfície de anexação em solicitação já criada, mas não confirma a ordem para um projeto técnico novo: a sequência entre `technicalprojectdocs` e `gerarNumeroSolicitacao` continua pendente. Não automatizar a sequência até confirmar esse ponto.

O catálogo `post_technicalprojectdocs` também apresenta um corpo genérico (`dados`), sem enum ou lista de `tipo_documento_id`. Os campos `file`, `projeto_tecnico_id` e `tipo_documento_id` aparecem em notas locais anteriores, mas ainda precisam ser conferidos na chamada observada da interface.

## 5. Uploads de documentos no Fênix: interface e reverseapi

### 5.1 Interface observada no Chrome

Na ficha de uma solicitação PTSAVCB existente, a aba `UPLOADS DE DOCUMENTOS` abriu a seção `Envio de Documentos PTS`. A tela mostrou o seletor `Tipo`, o botão `ANEXAR` (desabilitado antes de escolher um tipo) e a tabela `Documentos enviados`, com tipo, nome e ações de download/visualização. A exclusão estava desabilitada no registro observado.

As categorias visíveis nesse formulário PTS foram:

- Documento de Responsabilidade Técnica (ART, RRT ou TRT).
- Formulário de Segurança contra Incêndio (Anexo D).
- Planta baixa com indicação dos equipamentos de segurança e riscos especiais, quando aplicável.
- Outros Documentos.

Essa observação confirma a área de upload e as categorias de uma solicitação PTS existente. Nenhum tipo foi selecionado, nenhum arquivo foi anexado e nenhuma chamada POST de upload foi capturada. Ela não confirma o contrato de projeto inicial, vistoria, retificação ou remanejamento.

### 5.2 Outras superfícies observadas no Chrome

- **Solicitação de Vistoria:** a ficha mostra a aba `UPLOADS DE DOCUMENTOS`, a seção `Envio de Documentos`, o campo `Tipo` e a tabela `Documentos enviados`. Nenhum arquivo ou tipo foi submetido nessa observação. O conteúdo dessa aba não basta para concluir que o endpoint seja igual ao de projeto PTS.
- **Reanálise notificada (registro histórico):** a ação `Visualizar` abriu a solicitação em contexto de `technicalprojectsanalysis`, com abas `DADOS DO PROJETO`, `UPLOADS DE DOCUMENTOS` e `HISTÓRICO`. A aba de uploads mostrou seletor `Tipo`, `ANEXAR` desabilitado até escolher o tipo e a lista de documentos; `CONFIRMAR SOLICITAÇÃO DE REANÁLISE` também estava desabilitado. O Fênix avisou que esse registro não era o mais recente do processo, então a tela confirma um contexto histórico de anexação, mas não a edição de dados do projeto nem o fluxo vigente de reanálise. Nenhum arquivo foi anexado e nenhuma solicitação foi confirmada.
- **Remanejamento em Pendente de Documentação:** o formulário mostra o campo `Documento Comprobatório do Vínculo com o Processo`, com indicação de PDF até 5 MB, o botão `ANEXAR`, uma tabela de documentos e o botão `SOLICITAR REMANEJAMENTO` desabilitado enquanto não há documento. A tela evidencia uma etapa documental própria do remanejamento, mas não houve seleção de arquivo, envio ou confirmação do pedido.
- **Cadastro de Edificação:** a etapa inicial reúne endereço e características da edificação. O botão `CONTINUAR` conduz ao fluxo de Projeto Técnico; não foi preenchido nem avançado nesta inspeção.
- **Migração SAP:** a lista tem `SOLICITAR NOVA MIGRAÇÃO`; o formulário pede documento anexo, município obrigatório e justificativa opcional. A orientação exige o protocolo completo do ACP no formato `UUUU-NNNN/AAAA` e limita a solicitação ao responsável técnico/proprietário, salvo envio de procuração ou documento de representação. O formulário não foi preenchido nem enviado.
- **Dependência SAP → vistoria:** ao abrir a lista de vistorias, o Fênix informa que projeto aprovado no SAP precisa ser migrado para o sistema antes da solicitação de vistoria de renovação. A migração deferida permite ao solicitante pedir essa vistoria diretamente pelo Fênix.
- **Perfil do solicitante:** a tela `Perfil` permite atualizar telefone, e-mail e senha. `Alterar Dados de Cadastro` apresenta nome, e-mail, nome fantasia, razão social, CNAE e telefone; a tela informa que outros dados dependem de nova verificação de autenticidade.
- **Visualizar solicitação:** a ação `Visualizar` na lista abre uma ficha com as abas `Dados do Projeto`, `Pagamentos`, `Responsáveis Técnicos`, `Uploads de Documentos` e `Histórico`. A aba Pagamentos informa valores pendentes/pagos, oferece `Visualizar` para exibir o QR Code PIX de DAE pendente e apresenta declarações de desconto/isenção; a orientação observada exige até três documentos comprobatórios antes de confirmar a solicitação quando há desconto/isenção. A aba Responsáveis Técnicos mostra uma tabela com CREA/CAU/CFT, telefone, e-mail, documentos e ações; o registro aberto nesta leitura estava sem linhas nessa tabela. O Histórico lista ação/status, solicitação, tipo, processo, protocolo e data, com ações como visualizar e baixar certificado. Nenhum pagamento, declaração, download ou mutação foi executado.

Em 03/11/2026, a leitura GET pelo reverseapi confirmou `detailsRequester` e a solicitação de autenticidade associada a `user.current_verification`; a lista `GET /api/v1/solicitacoes/{solicitacao_id}/daes` também respondeu 200 para uma solicitação da mesma conta. O retorno `data.daes[]` inclui ID, sequência emitida, tipo de taxa, status, vencimento, valor da guia, valor pago e data do pagamento, além de vínculos `solicitacao_id`/`projetos_tecnicos_id` e URLs/códigos que não foram abertos nem reproduzidos. A solicitação da lista pessoal não traz ID de projeto técnico comparável, então a confirmação do DAE deve usar o ID da solicitação. `GET /api/v1/isencao` respondeu 200; a tabela de taxas respondeu 403. Nenhum dado pessoal, QR, documento ou valor individual foi reproduzido, e nenhuma operação de escrita foi executada. A atualização de perfil, verificação documental e geração/recalculo/liquidação de DAE continuam sem contrato de escrita confirmado.

Na mesma auditoria, `GET /api/v1/survey` respondeu 200. O `usuario_id` da amostra coincidiu com a sessão e o `solicitacao_id` com a lista pessoal, mas o endpoint não oferece filtros por solicitante/solicitação. Para uso no Painel, cada vistoria precisa corresponder simultaneamente ao `usuario_id` autenticado e a uma `solicitacao_id` da mesma conta; itens sem os dois vínculos devem ser descartados.

Essas telas mostram que os uploads ficam associados a entidades e etapas diferentes. A ficha de solicitação tem áreas próprias para pagamentos, responsáveis, documentos e histórico, mas isso ainda não confirma uma rota GET geral de detalhe por solicitação. As observações de interface não capturaram as requisições multipart; por isso, os contratos de rede continuam pendentes.

**Limite desta evidência:** todas essas superfícies foram observadas pelo perfil profissional/solicitante. Não foram capturadas as chamadas de envio nem confirmados IDs, limites ou respostas. O catálogo do reverseapi não substitui essa validação.

### 5.3 Rotas candidatas listadas pelo reverseapi

As rotas de upload da tabela aparecem no catálogo do frontend Fênix 2.19.1 e seguem sem observação em tráfego (`observedInChrome: false`); seus campos continuam sendo pistas, não contrato multipart confirmado. Em consulta GET somente leitura pelo reverseapi em 30/10/2026, as listas e detalhes de Migração SAP e Remanejamento retornaram 200. O detalhe SAP veio em `data.migracao` e incluiu `documentos[]` com `id`, `nome`, `tipo`, `created_at` e `updated_at`; o detalhe de Remanejamento veio em `data.remanejamento` e incluiu `documentos[]` com `id`, `tipo`, `slug` e `nome`. Os IDs usados nos GETs foram obtidos das respectivas listas da mesma sessão. Os campos de dono do detalhe (`user.id` e `usuario.id`) corresponderam internamente a `detailsRequester.user.id` nos dois casos. Isso confirma leitura e associação à conta dos registros existentes, sem confirmar upload, download ou recebimento de arquivo novo.

| Contexto | Operação e rota | Campos indicados pelo catálogo |
|---|---|---|
| Projeto técnico inicial | `POST /api/v1/technicalprojectdocs` | Corpo genérico `dados`; tipo documental e multipart ainda não confirmados |
| Solicitação existente | `POST /api/v1/solicitacoes/{solicitacao_id}/documentos` | Corpo genérico `dados`; o catálogo não informa campos multipart nem lista GET geral de anexos |
| Documentos solicitados | `POST /api/v1/documentos-solicitados` | `solicitacao_id`, `documento_id`, `files` |
| Documentos de vistoria | `POST /api/v1/documentos-solicitados-vistoria` ou `POST /api/v1/documents-survey-store` | `solicitacao_id`, `documento_id`, `files` |
| Retificação em andamento | `POST /api/v1/solicitacoes/{solicitacao_id}/retificacoes/{retificacao_id}/documentos` | `files`, `tipo_documento_id` |
| Remanejamento | `POST /api/v1/remanejamentos/{remanejamento_id}/documentos` | `files`; o GET de detalhe também expõe metadados de documentos já vinculados |
| Migração SAP | Nenhum POST de anexo catalogado | A tela mostra anexo; GET de detalhe/download no catálogo não confirma envio nem lista de anexos recebidos |

As linhas acima são metadados do bundle, não contratos de rede observados no perfil logado. No reverseapi, as rotas de upload estavam `observedInChrome: false` e o MCP não aceita chamadas multipart nem transmite binários. Para uma solicitação padrão, o catálogo não oferece GET geral de anexos; um GET de `/api/v1/solicitacoes/{solicitacao_id}/log-documentos` na solicitação consultada retornou 403, e um log não substituiria a lista de arquivos recebidos. O detalhe de remanejamento pode conter documentos, mas essa hipótese segue sem leitura confirmada; também não há GET de coleção de documentos do remanejamento no catálogo.

A operação de retificação tem GET de coleção/detalhe no catálogo, mas ainda não foi observada em tráfego; o remanejamento precisa existir antes da chamada de anexos, pois criar e solicitar aparecem como operações separadas sem `files`. A Migração SAP pede anexo na interface, porém o catálogo não expõe POST de anexo. Rotas de autenticidade do usuário que aceitam `documentos: FormData` são para verificação profissional e não devem ser usadas em processos.

A integração de arquivos, quando cada contrato for confirmado, deve passar pelo backend autenticado do Painel, sem expor cookies ou tokens no navegador. Não inventar `documento_id`/`tipo_documento_id` nem tratar `2xx` como confirmação de recebimento sem consultar o processo depois.

A interface de Migração SAP também expõe anexação de documento, mas a rota e o contrato multipart não foram confirmados. Não inferir o endpoint desse fluxo pelo nome da tela.

## 6. Estado atual do Painel e gaps

- `src/ProjectDraftModal.tsx` já oferece rascunhos, validação local e as oito modalidades do Fênix. A lista dos oito tipos também foi confirmada por uma consulta GET `get_listatodostipoprojetos` no reverseapi.
- A Etapa 3 do rascunho continua com checklist estático; ainda não seleciona nem envia arquivos.
- A aba `Documentos` da ficha da edificação permite guardar arquivos primeiro no Painel, listar, baixar e remover os anexos locais. Os bytes ficam criptografados no SQLite com AES-256-GCM, vinculados à edificação e à conta autenticada. Tipos aceitos: PDF, imagens, Office, DWG e DXF; até 8 arquivos e 12 MB por operação. A tela valida a seleção antes de enviar ao backend e usa uma chave idempotente local para repetir o mesmo lote sem duplicar documentos se a resposta se perder. Isso protege apenas o armazenamento no Painel; não cria nem confirma qualquer operação no Fênix.
- Cada arquivo pode receber uma categoria local e um processo relacionado. As categorias do Painel não são IDs oficiais do Fênix. O botão `Enviar ao CBMBA` aparece separado, mas permanece desabilitado até confirmar a rota multipart, os IDs documentais e o processo de destino. Guardar no Painel nunca transmite o arquivo.
- A ficha da edificação em `src/App.tsx` também consulta e baixa documentos oficiais disponíveis. O envio de anexos à Odoo é uma integração separada.
- `POST /api/drafts/:id/submit` em `server/index.ts` chama `POST /api/v1/technicalproject` e preserva `solicitacao_id` quando ele vem na resposta. O cadastro inicial não encadeia `technicalprojectdocs` nem chama explicitamente `gerarNumeroSolicitacao`; a sincronização posterior é disparada em segundo plano e não é aguardada para confirmar a reconciliação final.
- Incremento local de 30/10 a 03/11/2026: a sincronização salva a lista de `minhas_solicitacoes` em `fenix_account_requests` sem exigir uma edificação selecionada; `GET /api/requests` alimenta a tela `Solicitações`. `Ver dados no Fênix` relê a linha pessoal e abre resumo, Dados do Projeto, Responsáveis Técnicos e Histórico. A ficha do projeto só aparece depois de validar a conta, o ID da solicitação, a edificação e os vínculos de proprietário/solicitação retornados pelo projeto. `Pagamentos` relê `GET /solicitacoes/{solicitacao_id}/daes`, confere o vínculo por solicitação e mostra metadados e valores; `Abrir DAE` só redireciona para o domínio oficial da SEFAZ-BA depois de uma nova leitura. O Painel não paga, gera ou recalcula guias. A view `Perfil` consulta dados cadastrais e metadados da verificação por conta, sem editar ou baixar documentos. A view `Vistorias` cruza `usuario_id` e `solicitacao_id` com o perfil e a lista pessoal da mesma conta antes de exibir linhas; a lista ainda não executa ações nem cobre agenda/resultado.
- Ações rápidas que o servidor ainda bloqueia — renovação, reavaliação e cancelamento — agora são apresentadas como pendentes de validação, sem abrir confirmação de envio. A ação antes chamada `Editar Projeto` está identificada como preparação de rascunho local; não atualiza o projeto no Fênix.
- O filtro oficial por pessoa e os nomes/valores exatos de todos os campos de identificador ainda precisam ser comparados com a resposta do endpoint. A tela recém-criada não cobre ainda as ações por estado observadas no Fênix.
- A lista/IDs de tipos documentais, limites oficiais, sequência para cada modalidade e resposta de recebimento ainda não estão confirmados.
- O Painel agora mostra as listas e diálogos de detalhe de Migração SAP e Remanejamento. As consultas oficiais revalidam a conta, relêem o registro na mesma sessão e retornam apenas status/números e metadados de documentos; SAP valida `id_user`/`user.id`, e Remanejamento valida `usuario.id` mais a correlação com solicitação própria. Isso não confirma a chamada de escrita nem o recebimento de novos arquivos.
- A tela de Migração SAP foi observada, mas a chamada de escrita, os tipos de anexo e a confirmação de recebimento ainda não foram capturados.

### Próximos passos para upload

1. Completar a inspeção de projeto novo, documentos solicitados, vistoria, retificação e remanejamento; a aba PTS existente é apenas uma das superfícies confirmadas.
2. Em ambiente/processo de teste autorizado, capturar o multipart, IDs, limites e resposta; consultar o processo depois para comprovar o recebimento.
3. Só então habilitar o botão de transmissão do Painel, validar duplicidade/estado por arquivo e escolher a rota compatível com cada processo.
4. Integrar também a etapa documental do rascunho de projeto quando a sequência entre cadastro e geração de solicitação estiver confirmada.
5. Nunca reenviar automaticamente quando a resposta for ambígua; consultar o estado oficial primeiro.

---

## 7. Modalidades e medidas de segurança

O reverseapi confirmou por consulta GET que a lista ativa tem oito tipos. A captura `image-1.png` mostra as cinco opções PTS; as três modalidades PT aparecem em outro grupo. O painel já lista as oito opções, incluindo os dois tipos de ocupação temporária.

As imagens `image-2.png` e `image.png` registram a interface anterior do Painel e a divergência na lista de medidas. O código agora mostra as seis medidas básicas em PTS e as 22 em PT. O mapeamento IT-14 preenche as medidas correspondentes; quando indica medidas avançadas, o enquadramento sugere PT.

| Característica | Formulário 1: "Cadastrar Projeto Téc. Completo" (`mode: 'pt'`) | Formulário 2: "Cadastrar Projeto Téc. Simplificado" (`mode: 'pts'`) |
|---|---|---|
| **Público-Alvo** | Edificações complexas, área > 750 m², > 3 pavimentos ou alto risco | Edificações simples, área <= 750 m², até 3 pavimentos e baixo/médio risco |
| **Enum Nu Permitidos** | `1` (PT), `2` (PTIOT), `3` (PTOTEP) | `4` (PTSCLCB1), `5` (PTSCLCB2), `6` (PTSAVCB), `7` (PTSAVCBPTIOT), `8` (PTSAVCBPTOTEP) |
| **BoxExemption (`isencao_id`)** | Exibido (1: Não Isento, 2: Órgão Público, 3: Entidade Filantrópica, 4: MEI) | Exibido com regras de isenção simplificadas (MEI automático) |
| **BoxTechnicalManager** | **Múltiplos Responsáveis Técnicos**: array `responsaveis_tecnicos` com CREA/CAU/CFT, CPF/CNPJ, e-mail e telefone | **Responsável Único**: dispensado no PTSCLCB1 com saída direta para a via pública (`rtOptional: true`) |
| **BoxQuestions (Questionário)** | Perguntas estruturais e histórico de projetos anteriores | Perguntas de triagem rápida: saída direta, regularização prévia |
| **BoxSpecialRisks** | Todos os 5 riscos especiais com campos detalhados de GLP e vasos | Bloqueio de riscos severos (GLP > 12.480 kg força migração para PT) |
| **BoxGlpData (8 Classes)** | Classes B a H completas e revenda de GLP | Revenda de GLP bloqueia CLCB; restrito a classes domésticas/comerciais leves |
| **Medidas de Segurança** | **Todas as 22 medidas** oficiais disponíveis para seleção | **Apenas 6 medidas básicas** permitidas; 16 medidas avançadas forçadas a `0` |
| **Bloqueio Inverso** | Se imóvel qualificar para PTS, emite warning de bloqueio `bloqueioCadastroPTSviaCardPT` | Se exceder 750 m² ou 3 pavimentos, bloqueia envio e orienta PT |

### 7.1 As 22 medidas de segurança mapeadas (`BoxSecurityMeasures`)

O componente `BoxSecurityMeasures` do Fênix CBMBA controla a visibilidade com a propriedade `hideToProjectType: [4, 5, 6, 7, 8]`:

| Chave Oficial no Payload | Nome Oficial no Fênix | Permitida em PTS? | Comportamento no PTS |
|---|---|---|---|
| `iluminacao_emerg` | Iluminação de Emergência | ✅ Sim (`ptsAllowed: true`) | Selecionável |
| `brigada_incendio` | Brigada de Incêndio | ✅ Sim (`ptsAllowed: true`) | Selecionável |
| `sinal_emerg` | Sinalização de Emergência | ✅ Sim (`ptsAllowed: true`) | Selecionável |
| `extintores` | Extintores de Incêndio | ✅ Sim (`ptsAllowed: true`) | Selecionável |
| `saidas_emerg` | Saídas de Emergência | ✅ Sim (`ptsAllowed: true`) | Selecionável |
| `control_mat_acab` | Controle de Materiais de Acabamento | ✅ Sim (`ptsAllowed: true`) | Selecionável |
| `acesso_viatura` | Acesso de Viatura do Corpo de Bombeiros | ❌ Não (Oculta em PTS) | Forçada para `0` |
| `comp_horizontal` | Compartimentação Horizontal | ❌ Não (Oculta em PTS) | Forçada para `0` |
| `comp_vertical` | Compartimentação Vertical | ❌ Não (Oculta em PTS) | Forçada para `0` |
| `separacao_edific` | Separação entre Edificações | ❌ Não (Oculta em PTS) | Forçada para `0` |
| `resfriamento` | Resfriamento | ❌ Não (Oculta em PTS) | Forçada para `0` |
| `hidrante_mangot` | Hidrantes e Mangotinhos | ❌ Não (Oculta em PTS) | Forçada para `0` |
| `deteccao_incendio` | Detecção de Incêndio | ❌ Não (Oculta em PTS) | Forçada para `0` |
| `chuveiros_auto` | Chuveiros Automáticos (Sprinklers) | ❌ Não (Oculta em PTS) | Forçada para `0` |
| `elevador_emerg` | Elevador de Emergência | ❌ Não (Oculta em PTS) | Forçada para `0` |
| `seguranca_estrutural` | Segurança Estrutural contra Incêndio | ❌ Não (Oculta em PTS) | Forçada para `0` |
| `control_fumaca` | Controle de Fumaça | ❌ Não (Oculta em PTS) | Forçada para `0` |
| `espuma` | Espuma para Extinção | ❌ Não (Oculta em PTS) | Forçada para `0` |
| `plano_emerg_incendio` | Plano de Emergência contra Incêndio | ❌ Não (Oculta em PTS) | Forçada para `0` |
| `sis_fixo_gases` | Sistema Fixo de Gases Limpos / CO2 | ❌ Não (Oculta em PTS) | Forçada para `0` |
| `alarme_incendio` | Alarme de Incêndio | ❌ Não (Oculta em PTS) | Forçada para `0` |
| `sis_prot_cont_desc_elet` | SPDA (Proteção contra Descargas Atmosféricas) | ❌ Não (Oculta em PTS) | Forçada para `0` |

### 7.2 Regras de evento temporário implementadas no Painel (tipos 2, 3, 7 e 8)
- **PTS Temporário (`PTSAVCBPTIOT` ID 7 e `PTSAVCBPTOTEP` ID 8)**:
  - Duração máxima estrita: **180 dias (6 meses)** entre `data_inicio` e `data_fim`. Se ultrapassar, a validação rejeita o envio.
- **PT Temporário (`PTIOT` ID 2 e `PTOTEP` ID 3)**:
  - Antecedência mínima: A data de início deve ter no mínimo **15 dias de antecedência** da data de submissão. O backend emite warning oficial orientando o projetista sobre o prazo de análise do CBMBA.

### 7.3 Campo `registration_zip_code`

O Painel monta a chave no formato `"${registration || ''}-${zip_code}"`. Sem inscrição municipal, fica `"-<CEP>"`; não enviar a string `"null-<CEP>"`.

## 8. Escopo desta auditoria

Este guia e o plano atual cobrem apenas o perfil profissional/solicitante autenticado no Fênix. A navegação observada inclui projetos completos e simplificados, lista de solicitações, vistorias, migração SAP, remanejamentos, perfil e dados do solicitante. As telas internas de servidor ficam fora deste escopo.

Cada função do perfil solicitante precisa ser associada à sua tela, ao processo/etapa e aos identificadores oficiais. O Painel deve usar a sessão dessa conta, sem marcar cadastro, edição ou upload como concluído antes da confirmação por leitura posterior do Fênix. O inventário e as prioridades de implementação ficam em [ROADMAP-V1-A-V2.md](ROADMAP-V1-A-V2.md).
