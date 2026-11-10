# Reversa Ao Vivo — Relatório Final Consolidado (2026-11-10)

Fonte viva: captura de 10/11/2026 — índice ao vivo `https://fenix.cbm.ba.gov.br/` servindo
bundle `/tmp/fenix-capture/js/app.05d2a1c1.js` (~1,47 MB, Vue), `rede-cdp.json`,
mapas (`mapa-app-remanejamentos.json`), amostras (`detalhe-solicitacao.json`,
`pagina-app-request/survey`) + bundle JS. Segunda confirmação aplicada onde indicado.
Base: prior result 1 (fluxos painel x captura), prior result 2 (docs), prior result 3 (bundle JS).

---

## 1) O que o ao vivo prova, por fluxo

### 1.1 Leitura — GETs de lista (CONFIRMADO na captura viva)
`rede-cdp.json` prova, todos HTTP 200:
- `GET survey?tipo_lista=vistoria_revistoria`
- `GET request?tipo_lista=solicitacoes`
- `GET technicalproject`
- 2x `GET unity`
- 2x `GET getAllCountys`
- 2x `GET occupation_group`

Contradição interna resolvida: `rede.json` (`requests=[]`) e
`resultado.md` / `telas.md` / `manifesto.json` ("navegação bloqueada") estão
superados por `rede-cdp.json` + amostras + mapas + bundle JS, que prevalecem.

### 1.2 Leitura pré-ação — POSTs de permissão (CONFIRMADO na captura, AUSENTE no painel)
- `POST /api/v1/getSolicitacoesPermitidas` em `/app/request` → 200.
- `POST /api/v1/getRetificacoesPermitidas` em `/app/request` → 200.
- Painel: grep com zero ocorrências; leitura pré-ação usa `minhas_solicitacoes`.

### 1.3 Tooltips Solicitar Vistoria / Revistoria (AUSENTE na captura, CONFIRMADO no painel)
- Captura (`pagina-app-request/survey`, `detalhe-solicitacao.json`): só ícones
  `transfer_within_a_station / visibility / cloud_download / autorenew`; bundle tem
  vocabulário `Vistoria/Revistoria/Notificado`, mas não o tooltip literal.
- Painel: `server/fenix.ts` `computeFenixProcessActions` tem `Solicitar Vistoria`
  (`:1072-1080`), `Solicitar Revistoria` (`:1030-1039`), `Solicitar Reanálise`
  (`:1041-1050`); `src/App.tsx:1710-1730` espelha a heurística.

### 1.4 Remanejamentos Pendente → visibility (CONFIRMADO nos dois)
- Captura `mapa-app-remanejamentos.json`: 5 linhas `Pendente de Documentação` com
  `icons: ['visibility']`, TOTAL 47.
- Painel `server/index.ts:2442 / :2484` preserva `status/status_slug` (lista de paths
  inclui `status_slug`) e metadados de documentos (`:2399-2419`), endpoints
  `/api/fenix/remanejamentos/:recordId`.

### 1.5 Amostras mascaradas (CONFIRMADO na captura; PARCIAL num caso)
Seis campos: `status / status_slug / spt_id / solicitacao_id / tipo_solicitacao_slug / renovacao`.
- `request` e `survey`: têm os 6.
- `technicalproject`: PARCIAL — tem `status_slug` e `solicitacao_id`, mas NÃO tem
  `spt_id / tipo_solicitacao_slug / renovacao`.
- Painel: `extractFenixMeta` (`server/fenix.ts:881-889`) lê `solicitacao_id, spt_id,
  status_slug, tipo_solicitacao_slug, renovacao`; `server/index.ts:2576-2581` usa
  `status.status / status_slug`.

### 1.6 Regras de ação — `computeFenixProcessActions` (CONFIRMADO no painel)
`server/fenix.ts:939-1163`:
- `reavaliacao_renovacao`, `solicitar_revistoria`, `solicitar_reanalise`,
  `editar_projeto` (rascunho local), `solicitar_vistoria` (homologado + análise PT sem
  `sptDataFinal`), `solicitar_renovacao` (só validade ≤ 90d), `cancelar_*` em
  pendente-doc/pagamento, downloads notificação/certificado/protocolo com blocklist.

### 1.7 Escrita guardada — `fenix-action` + bloqueios 409 (CONFIRMADO no painel)
- `POST /api/buildings/:buildingId/processes/:processId/fenix-action`
  (`server/index.ts:3763`), `confirmed:true` obrigatório (`:3769`).
- 409 em: conexão pausada (`:3786`), sem vínculo único (`:3864`), ID divergente
  (`:3871`), projeto (`:3880/:3883`), edificação (`:3888`), ações bloqueadas
  reavaliação/renovação/cancelar (`:3900`), estado oficial (`:3938`), ação
  indisponível (`:3961`), IDs não confiáveis (`:3968`), operação equivalente (`:4028`).

### 1.8 Upload bloqueado por desenho (CONFIRMADO no painel)
- `BuildingUploadDocuments.tsx:163` botão `Enviar ao CBMBA` disabled com
  `title 'Envio bloqueado até confirmar... rota multipart e ID do tipo documental'`;
  `:153` mesma nota; `:100-101` `Arquivos guardados no Painel. Nenhum arquivo foi
  enviado ao CBMBA`; envio local com `Idempotency-Key`.

### 1.9 Inventário do bundle ao vivo (prior 3, segunda confirmação)
Bundle `/tmp/fenix-capture/js/app.05d2a1c1.js`:
- `baseURL`: `r.a.defaults.baseURL="api/v1"` + `baseURL="api/v1",r.a.defaults.withCredentials`
  + `VUE_APP_API_ENDPOINT:"api/v1"` — 3 ocorrências independentes; todo relativo resolve sob `api/v1`.
- Service layer: `V["a"].request("POST","<relativo>",...)` etc.; contagem no bundle:
  273x POST, 54x GET, 5x PUT, 5x DELETE.
- Top relativos POST: `solicitacoes/` (88x), `migracoes-sap/`, `remanejamentos/`,
  `autenticidade-usuarios/`, `projetos-tecnicos/`, `technicalprojectdocs`,
  `documents-survey-store`, `definirStatusV2`, `gerarNumeroSolicitacao`, `verify-request`,
  `getRequest`, `zipDocs`, `files` (=linkDocs). GET: `solicitacoes/`, `projetos-tecnicos/`,
  `remanejamentos/`, `edifications`, `tipoProjetoTecnico`, `listar-tipos-solicitacoes`.
- `PUT-solicitacoes = 0` re-checado. PUT-total = 5 (`edifications/{id}`,
  `occupation-division/`, `parametros-tax/`, `parametros-internos/cnaes/`, `transferRequests`).
  Edição de solicitação = POST `definirStatusV2` + navegação `editPT` (`technicalProjects-form`);
  conflito 409 → dialog slug `request-modified` → `request-list`; upload com 409
  `messages.requestAlreadyModified` ou 203 `e.data.msg` como erro parcial.
- Sufixos `solicitacoes/{id|rid|doc}` inventariados: `certificados/protocolo|aprovacao(+reemitir)`,
  `retificacoes[/{rid}[/diff|/documentos|/certificado|/encaminhar|/devolver|/cancelar|/homologar|/validar]]`,
  `fluxo/contexto-devolucao/com-designacao|sem-designacao`, `autorizacao-solicitante`,
  `log-documentos`, `documentos`, `daes/gerar|recalculados`, `alterar-comprovacao|declaracao-isencao`,
  `autorizar-solicitante`, `fluxo/{avcb|acp|pts-avcb[/analise|/vistoria]|pts-clcb}/*`,
  `fluxo/correcao-protocolo/iniciar|finalizar`, `fluxo/arquivar|desarquivar`;
  DELETE `solicitacoes/{id}/documentos/{doc}` e `.../retificacoes/{rid}/documentos/{doc}`.
- `definirStatusV2`: `{solicitacao_id, spt_id|projeto_tecnico_id, status_slug, action,
  justificativa, dados}`; actions: `cancelar-solicitacao`, `edit-renovacao`,
  `edit-reavaliacao-renovacao`, `iniciar-renovacao`, `iniciar-reavaliacao-renovacao`,
  `iniciar|finalizar-correcao-protocolo`, `arquivar-processo|arquivar-solicitacao|desarquivar`,
  `confirmar-solicitacao-sap`; legado `definirStatus` → POST `/setProjectStatus`
  (+`/setProjectStatusInBatch`); `cancelar-processo` via
  `definirStatus({projeto_tecnico_id, solicitacao_id, spt_id, status_slug:"cancelado",
  tipo_requisicao:"cancelar-processo"})`.
- `tipo_solicitacao_slug`: `vistoria, revistoria, analise, reanalise, ptsavcb-analise,
  ptsavcb-reanalise, ptsclcb-analise` (+`renovacao` em lista); includes
  `["analise","reanalise"]`, `["vistoria","revistoria"]`,
  `["vistoria","revistoria","ptsavcb-analise","ptsavcb-reanalise"]`,
  `["ptsclcb-analise","ptsavcb-analise"]`.
- `status_slug` inventariados: `pendente-de-documentacao[-sap]`, `pendente-de-pagamento`,
  `pendente-de-validacao[-retificacao|-vistoria]`, `pendente-de-aprovacao[-vistoria]`,
  `pendente-de-confirmacao`, `pendente-de-encaminhamento`, `pendente-de-homologacao[-retificacao]`,
  `em-analise[-retificacao]`, `em-vistoria[-pendente-de-documentacao]`, `em-retificacao`,
  `em-correcao-protocolo`, `em-correcao-sap`, `em-processo-de-analise|correcao`, `notificado`,
  `notificado-vistoria`, `protocolado`, `homologado`, `homologado-sap`, `projeto-encaminhado`,
  `devolvido`, `indeferido`, `deferido`, `arquivado`, `cancelado`, `rejeitado`,
  `pagamento-confirmado`, `edit-renovacao`, `edit-reavaliacao-renovacao`, `retificacao-certificado`.
- Regras `show*` (2 ocorrências — lista + detalhe — onde aplicável):
  `showCancelarSolicitacao` (vistoria ou pts-análise com renovacao, só pendente-doc/pagamento +
  regra de dono protocolista/autorizo vs currentUser),
  `showCancelarSolicitacaoProtocolada` (chefe-da-secao/coordenador-de-vistoria + vistoria + protocolado),
  `showCancelarProcesso` (solicitante, sem renovacao, pendente-doc/pagamento, tipo 3/4 excluídos),
  `showSolicitarReanalise` (lista: tipo 6/8 + `notificado-vistoria`; autenticidade: `indeferido` +
  solicitante + isAtivo → POST `autenticidade-usuarios/{id}/solicitar-reanalise`),
  `showSolicitarVistoria` (2 variantes; homologado/homologado-sap + tipo; `setNomeBotaoVistoria`:
  homologado → `Solicitar Revistoria`, senão `Solicitar Vistoria`; fire = `gerarSolicitacao` →
  POST `gerarNumeroSolicitacao`, exceto homologado-sap que abre solicitação existente),
  `showSolicitarRenovacao` (protocolista/solicitante, homologado|edit-renovacao|edit-reavaliacao-renovacao,
  não-analise, ativo S, data_validade − 3 meses → `definirStatusV2("edit-renovacao")` ou editPT;
  reavaliação: notificado|notificado-vistoria|edit-reavaliacao-renovacao + renovacao + ativo S;
  detalhe: edit-renovacao → `iniciar-renovacao`, senão `iniciar-reavaliacao-renovacao`).
- Upload técnico: `enviarDocs` = POST `technicalprojectdocs`; callers em `save` e vistoria
  (`technical_documents` vs `saveSurvey`); survey = POST `documents-survey-store`;
  FormData `Rh.parseToForm(docs,{fieldName:"projeto_tecnico_id",id},"technical_documents")` →
  `projeto_tecnico_id[i]`, `tipo_documento[i]`, `descricao[i]`, `technical_documents[i]`,
  + `solicitacao_id`, `spt_id?`, `usuario_id?`; vistoria `solicitacao_id[i]` + `survey_documents[i]`;
  nenhum `Content-Type: multipart` literal (FormData default).
- Uploads solicitação/retificação/remanejamento: `enviarDocumento` = POST
  `solicitacoes/{id}/documentos`; `salvarDocumentos` = POST `.../retificacoes/{rid}/documentos`;
  GET mesmas rotas (+`/download`); remanejamento POST `remanejamentos/{id}/documentos`
  (`documentos[i][tipo|nome|arquivo]`); auxiliares POST `zipDocs`, `files` (=linkDocs),
  `documents-survey-download|destroy`, `validate-mandatory-documents`,
  `documentos-solicitados[-vistoria]`.
- `gerarNumeroSolicitacao`: service `genarateNumberRequest (sic)` = POST
  `gerarNumeroSolicitacao`; 3 call sites; FormData `projeto_tecnico_id`,
  `status_slug="pendente-de-documentacao"` (variante SAP `pendente-de-documentacao-sap`),
  `status_slug_old`, `responsavel_id`, `tipo_solicitacao_id`, `solicitacao_id`; variante
  migração-SAP com objeto `{skip_responsavel_anterior, responsavel_anterior_id,
  responsavel_id_finalisar_status, type}`; sucesso 201 → toast +
  `resumoProjetoTecnico(id)` / `router.replace({name:"jumper",params:{solicitacao_id}})`;
  erros `data.regra="prazoVencido|prazoExpirado"`.

---

## 2) Delta vs docs e vs código

### 2.1 Vs docs (`FENIX-CADASTRO-EDIFICACAO-E-PROJETO.md` ~547 linhas v2.19.1 03/11/2026; `ROADMAP-V1-A-V2.md` 326 linhas; `OPERATIONS-LTS.md` 64 linhas)
- **Bundle trocou**: catálogo documentado aponta `/js/app.204b8f23.js` (captura 20/10/2026,
  `frontend-endpoints.json: source.appBundle`, citado no guia §1); índice ao vivo em
  10/11/2026 contém **apenas `app.05d2a1c1.js`**. `server/fenix.ts:23` ainda fixa
  `FRONTEND_VERSION='2.19.1'`.
- **Catálogo 20/10 já contém os 4**: `GET /api/v1/survey` (get_survey, observed),
  `GET /api/v1/request` (get_request, observed), `POST /api/v1/getSolicitacoesPermitidas`
  (observed), `POST /api/v1/getRetificacoesPermitidas` (observed); extras próximos:
  POST `/api/v1/getRequest` (bundle only), POST `/api/v1/gerarNumeroSolicitacao` (bundle only).
- **Docs cobrem com leitura live**: `GET /api/v1/request?tipo_lista=minhas_solicitacoes`
  (readback, salva em `fenix_account_requests`) e `GET /api/v1/survey` 200 em 03/11 com regra
  de duplo vínculo (`usuario_id`+`solicitacao_id`); registram que não há GET genérico
  `/request/{id}` nem `/solicitacoes/{id}`.
- **Gap**: zero ocorrências de `getSolicitacoesPermitidas / getRetificacoesPermitidas /
  POST getRequest` em `docs/` e zero uso no painel (grep em `server/ src/ scripts/` vazio);
  painel só implementa `GET request` (`listFenixRequesterRequests`) e `GET survey`
  (`listFenixSurveys`) em `server/fenix.ts:722-730`.
- **Contagem explicada nos próprios docs**: 200 operações reverseapi (56 GET / 139 POST /
  5 DELETE, 11 observadas) vs 313 templates / 41 serviços do snapshot 20/10 são escopos
  diferentes, não comparáveis (`ROADMAP` l.50-51).
- **Sequência pendente registrada**: ordem entre `technicalprojectdocs` e
  `gerarNumeroSolicitacao` não confirmada; submit inicial não encadeia
  `gerarNumeroSolicitacao` (guia §4.2/§6).

### 2.2 Vs código do painel
| Ponto | Captura viva | Painel | Delta |
|---|---|---|---|
| GETs lista (survey/request/technicalproject/unity/getAllCountys/occupation_group) | 200 observados | só `request(minhas_solicitacoes)` + `survey` sem filtro + sync request+technicalproject | painel não consome `unity / getAllCountys / occupation_group` (só campo de payload) |
| POSTs permissão | 200 em `/app/request` | inexistentes | painel decide ação por heurística local, sem pré-checagem oficial |
| Tooltip Vistoria/Revistoria | ausente (só ícones) | heurística `computeFenixProcessActions` + `App.tsx` | painel "adivinha" ação que o Fenix só mostra após POST permissão |
| `technicalproject` amostra | sem `spt_id/tipo_solicitacao_slug/renovacao` | `extractFenixMeta` espera os 6 | risco de `undefined` em projeto puro |
| Escrita | POST `gerarNumeroSolicitacao` + `definirStatusV2` + `technicalprojectdocs` | `gerarNumeroSolicitacao` (form-data) + `fenix-action` com 409 | painel adiciona camada de guarda própria; escrita direta Fenix só via `gerarNumeroSolicitacao` |
| PUT `solicitacoes` | 0 | 0 (correto) | sem divergência — edição é POST status |
| Upload | FormData sem `Content-Type` literal | botão desabilitado por desenho + `Idempotency-Key` local | painel mais conservador que o Fenix; correto até mapear `tipo_documento` |
| Sync | — | `server/fenix.ts:1227-1228` request+technicalproject | cobre o essencial; faltam unity/municípios/grupos |

---

## 3) Onde a confiança do painel quebra e o que fazer

1. **Ação "disponível" sem POST permissão (quebra alta).**
   Tooltips do painel (`Solicitar Vistoria/Revistoria/Reanálise`) derivam de
   `status_slug + tipo + validade`, mas o Fenix decide via
   `getSolicitacoesPermitidas / getRetificacoesPermitidas`.
   *Fazer:* implementar leitura pré-ação (POSTs espelhando `/app/request`) antes de
   exibir/habilitar os botões; até lá, marcar ações como `heurística não confirmada`
   e manter os 409 de `fenix-action` como rede de segurança.
2. **`unity / getAllCountys / occupation_group` não consumidos (quebra média).**
   Painel ignora 3 dos 7 GETs provados ao vivo.
   *Fazer:* estender sync (`server/fenix.ts:1227-1228`) para esses 3; `occupation_group`
   hoje é só campo — virar entidade/listagem.
3. **`technicalproject` parcial (quebra média).**
   `extractFenixMeta` (`:881-889`) assume 6 campos; projeto puro não traz 3.
   *Fazer:* fallback `spt_id ← solicitacao_id`, `tipo_solicitacao_slug ← inclui/lista`,
   `renovacao ← false` + log de degradação; teste com amostra real de projeto.
4. **Versão do frontend desatualizada (quebra média-baixa).**
   `FRONTEND_VERSION='2.19.1'` (`fenix.ts:23`) vs bundle vivo `05d2a1c1`
   (documentado era `204b8f23`).
   *Fazer:* atualizar constante + inventariar `05d2a1c1` (313 templates ainda válidos?);
   loader vivo não tem marcador de versão — confirmar via hash/conteúdo.
5. **Sequência de escrita não confirmada (quebra média).**
   Ordem `technicalprojectdocs` × `gerarNumeroSolicitacao` indefinida; submit inicial não
   encadeia; contrato de `gerarNumeroSolicitacao` + `technicalprojectdocs` pendente de
   homologação; nenhum PUT/POST de edição executado.
   *Fazer:* testar em homologação a sequência completa; só então liberar `Enviar ao CBMBA`
   (`BuildingUploadDocuments.tsx:163`).
6. **Upload sem `Content-Type` literal (quebra baixa).**
   Bundle usa FormData default; painel bloqueia por falta de `tipo_documento`.
   *Fazer:* captura de rede do `technicalprojectdocs` real para fixar cabeçalho/campos
   antes de desbloquear.

---

## 4) Pendências

- [ ] Inventariar novo bundle `app.05d2a1c1.js`: versão segue 2.19.1? 313 templates válidos?
      (loader ao vivo sem marcador — comparar hash/conteúdo).
- [ ] Evidência live de `getSolicitacoesPermitidas`, `getRetificacoesPermitidas` e
      `POST getRequest` no perfil solicitante (flag `observed` é de 20/10; docs sem registro).
- [ ] Contrato de escrita `gerarNumeroSolicitacao` + sequência com `technicalprojectdocs`
      em homologação; nenhum PUT/POST de edição executado.
- [ ] Enumeração exaustiva dos ~88 sufixos POST `solicitacoes/*`: famílias mapeadas
      (certificados, documentos, retificações, daes, autorização, fluxo
      avcb/acp/pts-avcb/pts-clcb, correção-protocolo, arquivar/desarquivar); sufixo raro
      pode faltar — padrão usado: `.request("(GET|POST|PUT|DELETE)","solicitacoes/` + `.concat`.
- [ ] Paths com barra inicial (`/cancelar`, `/logout`, `/solicitar`…) são rotas Vue-Router,
      não endpoints `api/v1` — excluídos como API (não reclassificar).
- [ ] Cabeçalho multipart do `technicalprojectdocs` exige captura de rede (ausente no bundle).
