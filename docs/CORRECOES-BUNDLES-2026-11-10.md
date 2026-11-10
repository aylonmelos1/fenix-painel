# Correções — bundles 2026-11-10

Data: 2026-11-10. Base: working tree vs HEAD (19 arquivos alterados + 6 novos; `git diff --stat`: 4471 inserções, 886 remoções). Foco: paridade perfil solicitante, elegibilidade de ações, solicitações da conta, documentos/uploads locais, sessão com expiração, detecção de versão do frontend, docs com privacidade.

## Escopos e mudanças

### 1. Elegibilidade e ações de processo (Fênix ao vivo)
- `computeFenixProcessActions` passa a aplicar permissão oficial quando injetada e marca mutações sem permissão como `heuristica-nao-confirmada`; sem permissão, nada é confirmado como permitido.
- Cancelamento: gate exato por `tipoSolicitacaoSlug` (vistoria / pts-analise+renovação → `cancelar_solicitacao`; demais → `cancelar_processo` com exceção de ids 3/4 e revistoria); fallback heurístico só sem slug.
- Renovação: inclui `edit-reavaliacao-renovacao`, exige tipo fora de analise/reanalise, `evento !== S`, ativo OK e janela ~90 dias sobre validade.
- Revistoria: `homologado` + vistoria + sem `sptDataFinal`.
- Arquivos: `server/fenix.ts`, `server/fenix-eligibility.ts` (novo, 365 linhas: chaves de filtro solicitação/projeto/edificação + `parseFenixListQuery` puro), `server/fenix-eligibility.test.ts` (novo), `server/index.ts` (`/api/fenix/list-filter-schema`), `server/fenix-request-actions.test.ts`, `server/fenix.ts` (`fenixWriteRegraOf`).

### 2. Versão do frontend e rotas API
- Detecção anônima do bundle vivo (`js/app.<hash>.js` → `info.version`); fallback `2.19.2` (antes `2.19.1` fixo); cache 6h; `loginFenix` usa versão detectada (override em teste).
- `normalizeFenixApiPath`: aceita forma do bundle (`api/v1/...`, relativos nus) e absolutas sob a origem; fora de `/api/v1` lança `FenixError`.
- `FenixError` agora carrega `data` (corpo upstream) em GET/POST/PUT/FormData.
- Arquivos: `server/fenix.ts`, `server/fenix-frontend-version.test.ts` (novo, 86 linhas).

### 3. Solicitações da conta, perfil, vistorias, SAP, remanejamentos (somente leitura)
- Sync salva `fenix_account_requests` (tabela nova em `server/store.ts` + migração) sem exigir `building_id` nem limitar a edificações selecionadas; `syncFenixUser` retorna também `requests`.
- Leitura: `listFenixRequesterRequests`, `listFenixSurveys`, `listFenixSapMigrations`, `listFenixRemanejamentos` + detalhes com validação de identidade (`verifyFenixRequesterIdentity` vs `detailsRequester`).
- DAE por solicitação: `getFenixRequestDaeUrl` relê `/solicitacoes/{id}/daes`, exige item único com `solicitacao_id` igual e URL `https://servicos.sefaz.ba.gov.br`; sem gerar/pagar guia.
- Rotas novas em `server/index.ts`: `/api/requests`, `/official-summary`, `/payments`, `/payments/:daeId/open`, `/project-details`, `/api/fenix/requester-profile/:key`, `/api/fenix/vistorias`, `/api/fenix/migracoes-sap[/:key/:id]`, `/api/fenix/remanejamentos[/:key/:id]`, `/api/auth/session/refresh`.
- Frontend em `src/App.tsx` (+783 linhas): workspaces Solicitações, Perfil, Vistorias, SAP/Remanejamentos, resumo/projeto/pagamentos com revalidação; `src/types.ts` (+117 linhas).
- Paginação `allRecords`: remove teto silencioso; >100 páginas ou total incompleto lança erro preservando dados; `records()` passa a ler `survey(s)`.

### 4. Documentos locais + plano de upload (envio ao Fênix bloqueado)
- Novo `server/fenix-uploads.ts` (251 linhas): 5 contextos (`technicalprojectdocs`, `documents-survey-store`, `solicitacoes/{id}/documentos`, `retificacoes/{rid}/documentos`, `remanejamentos/{rid}/documentos`) com endpoint/campos/IDs/limites/evidência; `homologated: false`; `FENIX_UPLOAD_SEND_ENABLED=1` só libera após homologação.
- Backend: tabelas `building_documents` (bytes criptografados `sealBuffer/unsealBuffer`) + `building_document_upload_operations` (idempotência); rotas `documents`, `download`, `DELETE`, `send-plan`, `send` (bloqueado por padrão), `/api/fenix/uploads/contexts`.
- Frontend novo `src/BuildingUploadDocuments.tsx` (256 linhas): categorias RT/Anexo D/planta/outros, validação (8 arquivos/12 MB, extensões, vazio), download/remoção, plano por contexto.
- Upload Odoo: decodifica `filename*=UTF-8` e latin1→utf8.
- Arquivos: `server/index.ts`, `server/store.ts`, `src/BuildingUploadDocuments.tsx`, `server/fenix-uploads.test.ts` (novo).

### 5. Sessão com expiração
- `sessions.expires_at` (TTL 48h, `SESSION_TTL_MS`); migração preenche legados e limpa expiradas; `resolveSession` exige `expires_at > now`; cookies `httpOnly/sameSite/secure` com set/clear; `refreshSession`.
- Atenção: 2 testes de integração criam sessão sem `expires_at` e falham (ver Pendências).
- Arquivos: `server/store.ts`, `server/index.ts`.

### 6. Edição de projeto técnico / edificação
- Payload de update preserva IDs oficiais e usa contrato `PUT /technicalproject/{id}`; recusa IDs inválidos; resolve IDs oficiais em chaves locais da conta primária; erro `requestAlreadyModified` vira reconciliação.
- Arquivos: `server/fenix-project-edit.ts`, `server/fenix-project-edit.test.ts`, `server/index.ts`, `server/project-drafts.ts` (metadados de intenção), `src/ProjectDraftModal.tsx`, `src/types.ts`.

### 7. Rascunhos: fim de defaults sintéticos
- `server/project-drafts.ts`: `zip_code` padrão `''` (antes CEP real) e `municipio_id` `null` (antes 22); evita dado fictício em rascunho legado.
- `server/project-drafts.test.ts` atualizado.

### 8. Docs e privacidade
- `.gitignore`: passa a ignorar `docs/` (sem newline final — checar se intencional).
- `README.md`: roadmap/paridade, áreas (solicitações com resumo/projeto/RT/histórico/DAEs; perfil/vistorias/SAP/remanejos), sync 30 min, ações explícitas, sem envio de anexos/protocolo inicial.
- `docs/FENIX-CADASTRO-EDIFICACAO-E-PROJETO.md`: reescrito como referência técnica, exemplos sintéticos, auditoria PUT `technicalproject` vs `edifications`, fluxo editForm.
- `docs/ROADMAP-V1-A-V2.md`: roadmap vivo 03/11/2026, prioridades (editar edificação, editar PT/PTS, documentos por contexto), inventário e leituras reverseapi.
- `docs/PROPOSTA-CONTAS-FENIX-ACOMPANHADAS.md`, `docs/V1.2-MENUS-PERSONALIZAVEIS.md`: ajustes (+12/+2).

## Arquivos (completo)
- Alterados (19): `.gitignore`, `README.md`, `docs/FENIX-CADASTRO-EDIFICACAO-E-PROJETO.md`, `docs/PROPOSTA-CONTAS-FENIX-ACOMPANHADAS.md`, `docs/ROADMAP-V1-A-V2.md`, `docs/V1.2-MENUS-PERSONALIZAVEIS.md`, `server/fenix-project-edit.test.ts`, `server/fenix-project-edit.ts`, `server/fenix-request-actions.test.ts`, `server/fenix.ts`, `server/index.ts`, `server/project-drafts.test.ts`, `server/project-drafts.ts`, `server/store.ts`, `src/App.tsx`, `src/ProjectDraftModal.tsx`, `src/draftAiHelper.ts`, `src/styles.css`, `src/types.ts`.
- Novos (6, untracked): `server/fenix-eligibility.ts`, `server/fenix-eligibility.test.ts`, `server/fenix-frontend-version.test.ts`, `server/fenix-uploads.ts`, `server/fenix-uploads.test.ts`, `src/BuildingUploadDocuments.tsx` (+ `.claude/tmp/codex-fenix-captura.md`, só instrução de captura somente-leitura).

## Testes
- `npm run typecheck`: OK (server + web, saída limpa).
- `npm test` (`node --import tsx --test server/*.test.ts`): 103 testes — 101 passaram, 2 falharam.
- Falhas (mesma causa, `SQLITE_CONSTRAINT_NOTNULL: sessions.expires_at`):
  - `fenix-connections.integration.test.ts`: "linked Fenix accounts complete the isolated connection lifecycle against a local upstream fixture".
  - `fenix-primary-reauth.test.ts`: "fenix primary account reauthentication lifecycle (same account OK, different account 409)".
- Causa provável: fixtures inserem em `sessions` sem `expires_at` após a coluna virar `NOT NULL`. Corrigir fixtures/migração de teste para incluir `expires_at`.
- Verificação final em 2026-11-10 (ver Apêndice de verificação): suite zerada — 103/103, typecheck OK.

## Pendências
1. Corrigir os 2 testes de sessão (`expires_at` nas fixtures) e repetir `npm test` até 103/103.
2. Uploads: envio real ao Fênix segue bloqueado; falta homologação de multipart, IDs oficiais e leitura de recebimento por contexto.
3. Edição: `PUT /technicalproject/{id}` confirmada por bundle+catálogo, sem PUT real capturado; sem escrita em homologação, não marcar como concluída.
4. Renovação/cancelamentos: bloqueados até validar contrato e permissão do perfil solicitante.
5. `.gitignore` com `docs/` ignora a própria pasta de docs versionada e está sem newline final — confirmar intenção.
6. `GET /api/v1/parametros-tax?model=Taxas` deu 403 em uma sessão e não foi repetido.

## Apêndice de verificação — 2026-11-10

### Suite zerada
- `npm test` (`node --import tsx --test server/*.test.ts`): **103 testes — 103 passaram, 0 falharam** (`# pass 103, # fail 0`, saída observada em 2026-11-10).
- `npm run typecheck` (`tsc --noEmit` em `tsconfig.server.json` + `tsconfig.web.json`): **OK, saída limpa**.
- Correção que zerou a suite: fixtures dos 2 testes de integração passaram a inserir `expires_at` em `sessions` (TTL 48h, `new Date(Date.now() + 48*60*60*1000).toISOString()`):
  - `server/fenix-connections.integration.test.ts`: `INSERT INTO sessions (token_hash,user_id,created_at,expires_at)`.
  - `server/fenix-primary-reauth.test.ts`: `INSERT INTO sessions (token_hash,user_id,created_at,expires_at)`.
- Com isso, a pendência 1 deste relatório está **resolvida** (103/103 confirmado nesta verificação).

### Rotas exercitadas com respostas
- Via HTTP em testes (fixture upstream local + `rawApi`, respostas 2xx/4xx/409 assertadas):
  - `POST /api/fenix-connections/login`, `GET /api/fenix-connections/pending/:id/buildings` (inclui 403 de outro dono), `POST /api/fenix-connections` (inclui 400 com `selectedBuildingIds` inválido), `POST /api/fenix-connections/:id/sync` (conta pausada), `POST /api/fenix-connections/:id/reauthenticate` (mesma conta OK, conta diferente 409) — cobertas por `fenix-connections.integration.test.ts` e `fenix-primary-reauth.test.ts`.
- Via unidade (funções puras, sem HTTP):
  - Elegibilidade/ações (`fenix-eligibility.test.ts`, `fenix-request-actions.test.ts`), detecção de versão do frontend (`fenix-frontend-version.test.ts`), plano/contextos de upload + flag `FENIX_UPLOAD_SEND_ENABLED` (`fenix-uploads.test.ts`), edição de projeto (`fenix-project-edit.test.ts`), rascunhos (`project-drafts.test.ts`), dashboard/sync/backup/odoo (`dashboard`, `sync-changes`, `local-data-backup`, `odoo-*`).
- Rotas novas **sem exercício HTTP automatizado** (cobertura só via código + frontend; sem resposta observada em teste):
  - `GET /api/requests`, `/api/requests/:id/official-summary`, `/payments`, `/payments/:daeId/open`, `/project-details`, `GET /api/fenix/requester-profile/:key`, `/api/fenix/vistorias`, `/api/fenix/migracoes-sap[/:key/:id]`, `/api/fenix/remanejamentos[/:key/:id]`, `GET /api/fenix/list-filter-schema`, `POST /api/auth/session/refresh`, documentos (`GET/POST /api/buildings/:id/documents`, `send-plan`, `send` bloqueado, `/api/fenix/uploads/contexts`).
  - Recomendação: validar essas rotas contra o upstream em ambiente de homologação antes de marcar paridade como concluída (pendências 2–4 e 6 seguem abertas).
