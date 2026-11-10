# Roadmap do Fênix Painel: V1 até V2

**Status:** roadmap vivo; estado revisto em 03/11/2026

**Atualizado em:** 03/11/2026
**Regra de planejamento:** as versões indicam escopo e critérios de aceite, não datas prometidas.

## Direção do produto

O Fênix Painel combina acompanhamento dos dados do Fênix, integrações da equipe e preparação de novos projetos técnicos. A criação pelo painel já começou, mas o fluxo de protocolo e documentos ainda não está completo.

O Fênix continua sendo a fonte oficial dos dados e protocolos. O painel só deve marcar uma operação como concluída depois de consultar novamente o Fênix e confirmar o resultado.

## Auditoria de paridade com o Fênix CBMBA — 30/10/2026

**Objetivo desta auditoria e do plano:** paridade funcional completa com o Fênix para o perfil profissional/solicitante conectado. O escopo inclui todas as telas e ações disponíveis nesse perfil: conta, edificações, projetos, solicitações, vistorias, documentos, pagamentos e resultados. Telas internas de servidor ficam fora deste plano.

**Regra de integração:** a conta autenticada do Fênix define o que o Painel pode consultar ou executar. O Fênix continua sendo a fonte oficial; escrita só será oferecida depois de confirmar elegibilidade, contrato e vínculo do registro, e será marcada como concluída depois de uma consulta posterior confirmar o resultado.

## Prioridade acordada em 03/11/2026

O foco imediato é alcançar paridade nas operações mais usadas pelo profissional/solicitante:

1. **Editar uma edificação existente no Fênix.** Carregar os dados oficiais, permitir revisão/alteração no Painel e atualizar o mesmo ID oficial; confirmar o resultado por nova leitura.
2. **Editar um Projeto Técnico (PT/PTS) existente.** Preservar seus vínculos com edificação e solicitação, atualizar o projeto existente e confirmar por nova leitura, sem criar uma cópia como se fosse edição.
3. **Enviar documentos por contexto.** Guardar primeiro no Painel; depois oferecer ação explícita de envio ao CBMBA dentro da edificação e do processo correspondente. Cada contexto precisa usar seus próprios tipos documentais, IDs, regras de etapa e confirmação de recebimento.

**Escopo final:** a meta continua sendo paridade funcional completa no perfil solicitante. Migração SAP, Remanejamento e funções financeiras continuam no inventário, mas ficam depois dessas três prioridades. Telas internas de servidor seguem fora do escopo.

**Navegação acordada em 03/11/2026:** ocultar temporariamente `Solicitações`, `Vistorias`, `Migrações SAP` e `Remanejamentos` do menu lateral; manter Perfil acessível pelo cartão do usuário, com os dados do solicitante e as contas Fênix vinculadas; colocar o log do webhook em `Configurações → Integrações`. A decisão simplifica o menu atual e não retira Solicitações, Vistorias, SAP ou Remanejamentos da meta de paridade final.

**Condição de segurança para avançar:** enquanto o reverseapi ou a navegação oficial não confirmar o contrato de escrita/upload, preparar rascunho local e armazenamento local é permitido; enviar uma mutação ao Fênix continua bloqueado. Uma rota listada no catálogo, por si só, não autoriza concluir que atualiza o registro correto nem que o arquivo foi recebido.

### Já presente no código

- O formulário do Painel lista as oito modalidades retornadas pelo GET `get_listatodostipoprojetos`, incluindo PTIOT, PTOTEP, PTSAVCBPTIOT e PTSAVCBPTOTEP. A captura que mostra cinco opções é apenas o grupo PTS.
- O cadastro local tem rascunho, validação e envio de Projeto Técnico ao Fênix.
- O mapeamento IT-14 pode preencher medidas de segurança no formulário.
- A ficha da edificação lista processos sincronizados, histórico e documentos oficiais disponíveis; existem ações para alguns estados, como solicitar vistoria, revistoria/reanálise e baixar documentos. Vistoria/revistoria/reanálise agora exigem nova linha confirmada por leitura; renovação e cancelamentos permanecem bloqueados até validar contrato e permissão.
- A aba `Documentos` da ficha guarda arquivos no Painel, com download e remoção. A seleção valida extensões, arquivos vazios e os limites locais de 8 arquivos/12 MB; o backend criptografa os bytes e aceita `Idempotency-Key` para repetir o mesmo lote sem duplicidade local. O botão de transmissão ao CBMBA permanece bloqueado enquanto faltarem multipart, IDs oficiais e leitura de recebimento confirmados.
- A ação de projeto cria um rascunho local com intenção e IDs de origem guardados em metadados protegidos do rascunho. O backend recusa o envio desse tipo de rascunho; ainda não existe atualização oficial validada do Projeto Técnico nem edição de cadastro da edificação. Rascunhos legados sem esses metadados não são classificados automaticamente pelo nome ou pelo modo da edificação, pois isso confundiria edições antigas com cadastros legítimos.

### Ainda falta para completar cadastro e documentação

- O envio de um rascunho chama `POST /api/v1/technicalproject` e aguarda `GET /api/v1/projetos-tecnicos/{id}` antes de marcar o projeto como confirmado. O Painel compara ID, número e vínculos de edificação/solicitação quando esses campos são conhecidos; resultados ambíguos mantêm o rascunho bloqueado para nova submissão. O fluxo ainda não inclui anexos nem executa uma etapa explícita de geração da solicitação/protocolo inicial.
- A etapa documental do formulário é um checklist sem seleção de arquivos. A ficha da edificação consulta e baixa documentos oficiais, mas ainda não envia arquivos ao Fênix.
- O painel agora apresenta as seis medidas básicas em PTS e as 22 medidas em PT. A IT-14 preenche as medidas mapeadas; medidas avançadas indicadas em um PTS exigem revisar o enquadramento.
- A ficha de uma solicitação PTS existente no Fênix tem aba `Uploads de Documentos`, com seletor de tipo, botão para anexar e categorias de RT, Anexo D, planta baixa e outros documentos. A interface foi observada sem escolher tipo, anexar arquivo ou confirmar uma operação.
- Também foram observadas a aba genérica de documentos em uma solicitação de vistoria e uma etapa própria de remanejamento em `Pendente de Documentação`, que exige “Documento Comprobatório do Vínculo com o Processo” em PDF até 5 MB. Nenhum arquivo foi anexado nessas telas.
- O reverseapi catalogava 200 operações nesta consulta (56 GET, 139 POST e 5 DELETE); apenas 11 estavam marcadas como observadas no Chrome. A marcação de acesso é heurística e a presença de uma rota não comprova que exista tela correspondente.
- Outro snapshot local do bundle 2.19.1, consultado em 20/10, registra 313 templates em 41 serviços e 11 observados no Chrome. Os totais de 200 e 313 vêm de consultas/escopos diferentes; não são contagens comparáveis de cobertura. Ver [inventário do bundle](../../fenix-mcp/docs/frontend-endpoints.md).
- As rotas candidatas indicam vínculos diferentes: solicitação/documento, solicitação/vistoria, solicitação/retificação/documento e remanejamento/documento. As chamadas multipart, IDs, restrições por etapa e confirmação de recebimento seguem sem captura. A sequência entre salvar projeto, gerar solicitação e enviar documentos iniciais também está pendente.
- A lista oficial de solicitações filtra por serviço, status, renovação, evento, datas, número da solicitação, protocolo, notificação, ACP, AVCB e DAE. As opções de serviço observadas são Análise, Reanálise, Vistoria, Revistoria, Análise Simplificada e Reanálise Simplificada.
- As listas de projeto filtram por responsável técnico (nome e CREA/CAU), ocupação/divisão e risco; filtros da edificação incluem altura, área, unidade, município, servidor e nome de referência.
- No formulário de atualização do perfil, o Fênix permite alterar telefone, e-mail e senha; a alteração dos demais dados pede nova verificação de autenticidade da conta.
- A área de Migração SAP permite abrir solicitação, anexar documento, informar município e justificativa opcional. A orientação exige o protocolo completo do ACP no padrão `UUUU-NNNN/AAAA`; se o solicitante não for o responsável técnico/proprietário, pede procuração ou documento de representação. A tela de vistoria orienta migrar projeto legado aprovado no SAP antes de pedir vistoria de renovação.
- Na inspeção autenticada de 30/10/2026, o menu também mostrou rotas distintas para Projetos Técnicos Completos e Simplificados, Lista de Solicitações, Vistorias, Migrações SAP, Remanejamentos, Perfil e Dados do Usuário. As telas de projeto têm filtros separados para projeto e edificação; o cadastro de edificação apresenta uma etapa própria de endereço e características.
- Os cartões de serviço explicam que o PT cobre edificações acima de 750 m² ou três pavimentos e inclui PTIOT/PTOTEP; o PTS lista o limite de 750 m², até três pavimentos e regras para subsolo e lotação de locais de reunião de público. O Painel precisa manter essas regras na experiência guiada e apontar para as ITs vigentes, sem assumir que um cadastro apenas salvo já foi enquadrado pelo Fênix.
- A lista de solicitações expõe ordenação por prioridade ou coluna e ações por registro, incluindo Visualizar, baixar Notificação/Protocolo e, conforme a situação, solicitar Reanálise ou Revistoria. A ficha aberta por Visualizar tem abas Dados do Projeto, Pagamentos, Responsáveis Técnicos, Uploads de Documentos e Histórico; Pagamentos mostra situação de DAE e visualização de QR PIX, e Histórico tem ações para visualizar/baixar certificado. A lista própria de vistorias também oferece Solicitar Vistoria ou Revistoria por registro; não foi feita nenhuma dessas ações durante a inspeção.
- O formulário de nova Migração SAP mostra o anexo como parte do pedido, protocolo completo do ACP e município obrigatórios e justificativa opcional. O formulário de Remanejamento apresenta busca de projeto, justificativa obrigatória e upload de comprovante de vínculo ao processo em PDF até 5 MB quando a solicitação está pendente de documentação. Nenhum arquivo foi selecionado ou transmitido.
- O formulário de Perfil permite atualizar telefone, e-mail e senha. A tela de Dados do Usuário apresenta os dados cadastrais e orienta solicitar nova verificação de autenticidade para alterar os demais dados; o fluxo de verificação ainda não foi percorrido.
- A sincronização usada pelas cinco visões de processo continua restringindo `minhas_solicitacoes` às edificações selecionadas. A tela `Solicitações` usa uma projeção de conta separada e mostra pedidos fora dessa seleção. A consulta real confirmou números de solicitação e protocolo distintos; `tipoPessoa` existe como filtro da API, mas não aparece nos itens consultados, portanto o filtro por pessoa continua pendente.
- O Painel constrói algumas ações pelo status/tipo normalizados e abre uma cópia local para edição de projeto. O envio atual continua usando `POST /technicalproject`; a atualização oficial do projeto existente não está comprovada.
- Auditoria das escritas atuais: o cadastro de Projeto Técnico confirma o registro por GET direto. Pedidos de vistoria/revistoria/reanálise agora capturam a lista antes, registram tentativa persistente e só confirmam após uma nova linha ser encontrada por projeto e tipo; resultado incerto fica pendente e uma nova chamada apenas consulta, sem repetir o POST. `definirStatusV2` e `setProjectStatus` continuam bloqueados no servidor até confirmar rota, permissão do perfil solicitante e estado oficial que deve ser lido após cada ação. A sincronização em segundo plano não vale como confirmação.

O inventário e os contratos candidatos estão em [FENIX-CADASTRO-EDIFICACAO-E-PROJETO.md](FENIX-CADASTRO-EDIFICACAO-E-PROJETO.md).

### Leituras observadas via reverseapi

- `GET /api/v1/request?tipo_lista=minhas_solicitacoes` retornou IDs separados para projeto e solicitação, `edificacao_id`, números da solicitação e do protocolo, `spt_id`, tipo, status, datas e dados de migração/retificação. A lista paginada é a fonte de readback para as ações de solicitação; filtros do catálogo são capacidades da rota, não atributos garantidos por registro.
- O campo `usuario_id` de um item foi comparado internamente com `detailsRequester.user.id` e correspondeu à sessão. O catálogo não tem GET genérico `/api/v1/request/{id}` ou `/api/v1/solicitacoes/{id}`; existem somente a lista e subrecursos. Na interface, `Visualizar` abre uma ficha com Dados do Projeto, Pagamentos, Responsáveis Técnicos, Uploads de Documentos e Histórico. A lista não basta para afirmar que as abas estejam disponíveis por uma rota geral de detalhe no reverseapi.
- Leitura adicional em 30/10: para uma linha da lista e a edificação indicada por ela, `technical_project.solicitacao_atual` foi comparado internamente com `solicitacao_id` e o vínculo coincidiu. Isso confirma a associação entre aqueles registros da mesma conta, mas não substitui nem comprova uma ficha completa de solicitação por GET.
- Em 03/11, `GET /api/v1/edifications/{id}` e `GET /api/v1/projetos-tecnicos/{id}` retornaram 200 com IDs obtidos pela cadeia da solicitação pessoal. O dono do projeto e `solicitacao_atual.id` corresponderam ao perfil e à linha pessoal. O detalhe fornece dados do projeto/edificação, responsáveis técnicos, status e histórico; não retornou uma coleção geral de documentos. O Painel agora cruza esses vínculos antes de exibir os campos permitidos.
- Em 03/11, `GET /api/v1/detailsRequester` respondeu 200 e retornou `data.requester`, `data.user` e a estrutura `user.current_verification`. Usando somente o ID de verificação retornado na mesma sessão, `GET /api/v1/autenticidade-usuarios/{id}` também respondeu 200 e retornou status/metadados da solicitação. Nenhum valor pessoal nem arquivo foi reproduzido ou aberto; as rotas de edição/envio continuam sem teste.
- `GET /api/v1/solicitacoes/{solicitacao_id}/daes` respondeu 200 para o ID de solicitação obtido da lista pessoal. O wrapper `data.daes[]` contém `solicitacao_id` e `projetos_tecnicos_id`, dados de taxa, vencimento, valores devido/pago e status, além de código de barras e URL do DAE. A lista pessoal não traz ID de projeto técnico comparável; por isso, o vínculo da guia é confirmado por `solicitacao_id`, sem tratar `spt_id` como ID de projeto. O Painel mostra metadados e oferece `Abrir DAE`, que relê o item e só redireciona para HTTPS em `servicos.sefaz.ba.gov.br`; o URL continua fora da resposta JSON. Nenhum pagamento, geração ou recálculo foi realizado.
- `GET /api/v1/isencao` respondeu 200 com regras de isenção. `GET /api/v1/parametros-tax?model=Taxas` respondeu 403 nesta sessão e não foi repetido.
- Em 03/11, `GET /api/v1/survey` respondeu 200. Na amostra, `usuario_id` coincidiu com `detailsRequester.user.id` e `solicitacao_id` correspondeu a uma solicitação pessoal. O catálogo não oferece filtro por usuário/solicitação, então o painel precisa limitar a lista por ambos os vínculos dentro de cada conta; a amostra não prova que todos os resultados pertençam ao solicitante nem confirma uma vistoria recém-pedida. Os campos observados incluem status, datas, tipo e endereço.
- `GET /api/v1/migracoes-sap` retornou ID, IDs de projeto/solicitação, status, protocolo SAP e números relacionados. Com o ID vindo dessa lista, `GET /api/v1/migracoes-sap/{id}` retornou 200 em `data.migracao`, incluindo `documentos[]` com ID, nome, tipo e datas. A linha da lista (`id_user`) e o dono do detalhe (`user.id`) foram comparados internamente e ambos correspondem a `detailsRequester.user.id` da mesma sessão.
- `GET /api/v1/remanejamentos` retornou ID, números de solicitação/protocolo, referência, município, área e status, sem ID de projeto/solicitação ou dono na linha observada. Com o ID vindo dessa lista, `GET /api/v1/remanejamentos/{id}` retornou 200 em `data.remanejamento` e incluiu metadados de documentos (`id`, `nome`, `tipo`, `slug`) e um objeto `usuario`. O dono do detalhe (`usuario.id`) também foi comparado internamente e corresponde à identidade retornada por `detailsRequester` na sessão; no Painel, a consulta ainda exige a correlação anterior do número com `minhas_solicitacoes` da mesma conta.
- As rotas GET de detalhe de SAP e Remanejamento agora têm resposta live confirmada, mas isso não valida criação, alteração, multipart, permissão de upload nem recebimento de um arquivo novo. Não foi feito download nem mutação.

**Cobertura implementada após a leitura:** o Painel oferece listas somente leitura para Migrações SAP e Remanejamentos, com busca/status, paginação, aviso de resultado parcial e botão `Ver detalhes` separado da ficha local do processo. Antes de consultar, valida a identidade da sessão e relê a lista da mesma conta; SAP exige `id_user` correto, ID único e dono (`user.id`) igual ao perfil autenticado. Remanejamento exige correlação única com uma solicitação própria, ID exato e dono (`usuario.id`) igual ao perfil autenticado. Os diálogos exibem apenas estado, números e metadados dos documentos, sem URLs, identidade, justificativa livre ou payload bruto. Criação, upload e alteração continuam sem formulário habilitado.

### Primeiro incremento local — solicitações da conta

- A sincronização passa a salvar os registros retornados por `GET /api/v1/request?tipo_lista=minhas_solicitacoes` em `fenix_account_requests`, sem exigir `building_id` nem limitar a consulta às edificações selecionadas.
- A nova tela `Solicitações` consulta apenas esse snapshot local por `GET /api/requests`; oferece filtros por tipo de serviço, status, renovação, evento, período, solicitação, notificação, ACP, AVCB, DAE e conta, além de busca e exportação.
- A ação `Ver dados no Fênix` relê a lista pessoal pela sessão da conta, confirma identidade, ID e números disponíveis, e abre abas de resumo, projeto, responsáveis técnicos e histórico. A aba do projeto usa IDs da linha pessoal, valida a edificação e exige que o dono e a solicitação atual do projeto coincidam com a conta e o pedido. Não há GET geral de detalhe da solicitação nem lista geral de anexos.
- A ação `Pagamentos` relê os DAEs pelo `solicitacao_id` oficial da linha; cada item só aparece quando o `solicitacao_id` do próprio DAE coincide. A lista de solicitação não traz ID de projeto técnico comparável, então o painel não usa `spt_id` para inventar esse vínculo. A UI mostra número, taxa, status, vencimento e valores/datas. `Abrir DAE` encaminha a guia à SEFAZ-BA após validar domínio e vínculo; o Painel não paga, gera ou recalcula guias.
- A nova view `Perfil` consulta nome, e-mail, telefone e metadados da verificação por conta conectada. A leitura da autenticidade revalida o dono do detalhe; documentos aparecem apenas como contagem. Atualização de perfil e download de comprovantes ainda não estão implementados.
- A nova view `Vistorias` consulta a lista oficial e inclui somente linhas cujo `usuario_id` bate com a sessão e cujo `solicitacao_id` pertence unicamente à lista pessoal da mesma conta. Oferece busca, status, conta e período; ações de solicitar/revistoriar, agenda, resultado e anexos continuam pendentes.
- Quando a solicitação corresponde a uma edificação acompanhada, a linha abre a ficha local existente. Para uma edificação fora da seleção, o registro fica visível e oferece o caminho para revisar a seleção; não há GET geral da ficha de solicitação nem readback completo das abas de documentos.
- Ações rápidas bloqueadas no servidor (renovação, reavaliação e cancelamento) são sinalizadas como pendentes de validação, sem confirmação clicável. A ação de edição explicita que cria um rascunho local. Vistoria, revistoria e reanálise só podem prosseguir após reler uma solicitação pessoal única, confirmar os vínculos com projeto/edificação e validar o status oficial atual.
- O reverseapi GET confirmou números separados (`n_solicitacao` e `n_protocolo_format`) e campos reais de vínculo (`solicitacao_id`, `id`, `edificacao_id`, `num_projeto`, `spt_id`, tipo e status). O tipo de pessoa não aparece nos itens amostrados; o filtro por pessoa não deve ser inferido. Este incremento de projeção continua somente leitura.
- Validação local em 03/11 desta fatia: `npm run typecheck`, `npm run build` e `git diff --check` concluídos; nenhum teste foi executado. O build mantém o aviso de chunk principal acima de 500 kB.

### Inventário de paridade do perfil profissional/solicitante

| Módulo do Fênix | Evidência observada no perfil conectado | Cobertura atual do Painel | Lacuna para paridade |
|---|---|---|---|
| Perfil e autenticidade da conta | Tela de dados cadastrais e atualização de telefone, e-mail e senha; demais dados dependem de nova verificação de autenticidade. O GET autenticado também retorna `current_verification`; um GET pelo ID dessa verificação respondeu 200. | Login, sessão, reconexão; nova view de perfil consulta nome, e-mail, telefone e metadados da verificação por conta conectada, sem baixar arquivos. | Implementar edição permitida de dados, autenticar atualização e mapear documentos/estados completos da validação. |
| Edificações | Criar começa por endereço/características e segue para projeto; listas têm entrada `Editar`. | Lista sincronizada e rascunho de novo projeto com seleção de edificação existente. | Cobrir cadastro e edição oficial e confirmar reconciliação de IDs sem criar duplicatas. |
| Projetos completos e simplificados | Listas separadas, filtros de responsável técnico, CREA/CAU, ocupação/divisão, risco e edificação; entrada para novo projeto; formulários PT/PTS. | Rascunho, validação local, dados IT-14 e envio de Projeto Técnico; leitura vinculada de dados, responsáveis técnicos e histórico na ficha da solicitação. | Paridade dos filtros/listas, anexos do projeto inicial, protocolo e confirmação do ciclo completo. A edição aberta pelo Painel ainda prepara um rascunho local e não atualiza o projeto oficial. |
| Solicitações | Lista da conta com filtros por pessoa, serviço, status, renovação, evento, datas e números de solicitação/protocolo/notificação/ACP/AVCB/DAE; ordenação por prioridade ou coluna; ações variam por estado, incluindo visualizar, reanalisar, revistoriar e baixar notificação/protocolo. | Lista e filtros locais; `Ver dados no Fênix` abre resumo, Dados do Projeto, Responsáveis Técnicos e Histórico após confirmar a cadeia conta → solicitação → edificação → projeto. Vistoria/revistoria/reanálise têm confirmação por readback. Renovação, reavaliação e cancelamento aparecem como pendentes de validação, sem botão de envio. | Cobrir uploads e demais abas, filtro por pessoa e ordenação; substituir elegibilidade inferida por situação oficial confirmada e habilitar as ações restantes após validar contratos/permissões. |
| Vistorias | Serviço e lista próprios, com solicitação e protocolo, tipo, data, edificação/endereço, área e status; há ações por registro para solicitar vistoria ou revistoria. A ficha também expõe área de upload. Projeto legado SAP pode depender de migração prévia. | Pedidos de vistoria/revistoria/reanálise são reconciliados por leitura da lista de solicitações; a nova lista própria filtra cada item pelo usuário autenticado e pela solicitação pessoal da mesma conta. | Regras de elegibilidade e ações por estado, anexos, agenda/resultado e reconciliação da solicitação. |
| Migração SAP | Lista com filtro por status e protocolo SAP; formulário de nova solicitação exige protocolo completo do ACP e município, aceita justificativa opcional e inclui anexo. A tela orienta comprovar legitimidade/representação quando aplicável. | Lista somente leitura com status, projeto, solicitação, protocolo SAP, datas, busca, paginação e conta; filtra por identidade da sessão e `id_user`. | Implementar formulário, criação, anexos, detalhe, estado e notificações após validar contrato de escrita e readback do vínculo com o projeto legado. |
| Remanejamento | Busca de projeto, lista filtrável por status e acompanhamento de pedidos; etapa de documentação exige justificativa e comprovante de vínculo em PDF até 5 MB. | Lista somente leitura com números, referência, município, área, status, busca, paginação e conta; só inclui linhas ligadas por número a uma solicitação da mesma conta. | Implementar busca elegível, justificativa/documento, detalhe, submissão, acompanhamento e resultado; confirmar por ID/protocolo e vínculo oficial. |
| Documentos | Uploads aparecem em solicitação PTS, vistoria, migração SAP e remanejamento; cada contexto tem tipo, etapa e vínculo próprios. Rotas de projeto inicial/retificação ainda são candidatas. | Armazenamento local criptografado na ficha da edificação; o envio ao Fênix permanece desabilitado. | Confirmar cada contrato multipart e IDs; adicionar seleção do contexto/tipo, ação explícita `Enviar ao CBMBA`, estado por arquivo e leitura posterior para confirmar recebimento. |
| Retificação, reanálise e renovação | Tipos e ações aparecem na lista conforme estado; a tela própria de retificação ainda não foi percorrida. | Reanálise e algumas ações de renovação disponíveis em condições inferidas do processo. | Mapear formulários, documentos, IDs, regras por status e resultado; cobrir edição/retificação e renovação completa. |
| DAE e pagamentos | A lista pessoal de DAEs por solicitação respondeu 200 e expõe número/tipo/status, vencimento e valores pagos/devidos. A aba Pagamentos do Fênix mostra QR para DAE pendente, mas não foi aberta; não houve pagamento. | Ação `Pagamentos` relê DAEs vinculados à solicitação e mostra valores/datas permitidos. `Abrir DAE` valida o vínculo e redireciona para o portal SEFAZ-BA; o Painel não processa pagamento. | Confirmar liquidação/compensação, geração/recalculo, isenção, comprovante, QR e efeitos nas próximas etapas. |
| Notificações, protocolos e certificados | A lista permite baixar notificação e protocolo; documentos variam por processo. | Consulta de histórico e download de protocolo, notificação e certificado quando disponibilizados. | Comparar formatos, disponibilidade, vínculo por solicitação/projeto, mensagens de falha e demais documentos oficiais. |
| Inexigibilidade e outros serviços | O catálogo do reverseapi sugere operações; nenhuma tela correspondente foi confirmada na navegação deste perfil. | Não há fluxo específico identificado. | Conferir serviços e opções disponíveis na conta antes de incluir ou descartar o módulo. |

Uma função só será marcada como completa quando a tela, os campos, o estado elegível, os identificadores e o vínculo com edificação/projeto/solicitação estiverem mapeados. Escritas devem ter contrato validado, confirmação explícita e leitura posterior. A presença de endpoint ou botão não comprova paridade.

## Estado atual — V1.0

A V1.0 está em produção e já oferece:

- Visão geral, edificações e listas de processos de análise, notificados, parados, certificados e projetos.
- Critérios editáveis por termos nos cinco menus de processo atuais, compartilhados pela conta da empresa.
- Busca, filtros de período, paginação, exportação Excel e abertura da ficha da edificação.
- Sincronização e atualização de históricos executadas no backend, com horário da última sincronização e notificações no painel.
- Configuração do intervalo de sincronização, integração por webhook e acompanhamento de renovações.
- Assistente de IA contextual, sessões de conversa e preferências de contexto.
- Backup e restauração local documentados.

Os critérios dos cinco menus atuais aceitam termos de tipo e situação/etapa, com combinação por todos ou qualquer grupo. A proposta para evoluir esses filtros está em [V1.2-MENUS-PERSONALIZAVEIS.md](V1.2-MENUS-PERSONALIZAVEIS.md).

## V1.1 — Confiabilidade e acabamento operacional

**Objetivo:** tornar os resultados mais fáceis de confiar e as rotinas mais simples de operar, sem transformar a V1 em um sistema de cadastro.

### Escopo sugerido

1. **Filtros configuráveis mais claros**
   - Trocar termos digitados livremente por seletores com valores reais de tipo, status e etapa sincronizados do Fênix.
   - Mostrar uma prévia de contagem e amostra antes de salvar.
   - Explicar quando um critério não encontra resultados e oferecer restauração dos critérios padrão.
   - Definir quem pode alterar configurações compartilhadas pela empresa.

2. **Consistência dos dados nas tabelas**
   - Revisar deduplicação em cada visão e manter a chave de processo usada entre cartões, tabelas, histórico e exportações.
   - Preservar as datas oficiais de entrada em análise, notificação e movimentação; nunca substituir essas datas pelo horário de sincronização.
   - Exibir claramente quando uma data ou histórico ainda não foi retornado pelo Fênix.
   - Uniformizar paginação e escolha da quantidade de linhas nas listas.

3. **Notificações e webhook operáveis**
   - Registrar a entrega e a resposta de cada webhook em uma fila persistente.
   - Repetir falhas transitórias com limite e intervalo controlados, sem bloquear a sincronização.
   - Exibir estado de entrega, última tentativa e ação de reenvio.
   - Validar deduplicação das notificações do painel e deixar explícito quais mudanças geram um evento.

4. **Sincronização observável**
   - Mostrar progresso, etapa, duração e resultado parcial ou falho da atualização.
   - Diferenciar dados sincronizados de históricos ainda em consulta.
   - Tornar o limite de requisições e o estado da fila diagnosticáveis sem expor credenciais.

5. **Integração sistêmica — piloto com Odoo**
   - Descobrir a versão, hospedagem, módulos e interface de integração disponíveis na instância Odoo da empresa.
   - Escolher o primeiro fluxo com a equipe. Candidato recomendado para avaliação: enviar mudanças de processo e oportunidades de renovação do Fênix Painel para criar ou atualizar a atividade comercial correspondente no Odoo.
   - Definir sistema de origem para cada campo: Fênix para protocolo, etapa e validade oficial; Odoo para responsável comercial, atividade e andamento de atendimento.
   - Começar com fluxo unidirecional Fênix Painel → Odoo, com serviço de integração dedicado, privilégio mínimo, credenciais guardadas no backend, chave idempotente e referência cruzada entre os registros.
   - Usar fila persistente, retries limitados, log de entrega e reenvio manual, para uma indisponibilidade do Odoo não perder eventos nem afetar a sincronização do Fênix.
   - Validar primeiro em ambiente de teste e começar por uma amostra controlada antes de habilitar todos os clientes.

6. **Proteção e recuperação dos dados**
   - Definir rotina de backup da produção, retenção e teste periódico de restauração.
   - Criar procedimento de rollback de release e validar a compatibilidade do banco antes de reiniciar o serviço.
   - Cobrir as regras de filtros, sincronização e webhook com testes automatizados focados.

### Critérios de aceite da V1.1

- Para cada menu, o total do cartão, o total da tabela e as linhas exportadas usam o mesmo conjunto de processos.
- O mesmo processo não aparece duplicado dentro da mesma lista, mesmo quando o Fênix o retorna por fontes diferentes.
- Datas ausentes são apresentadas como indisponíveis; datas oficiais não são confundidas com a data de sincronização.
- Uma falha de webhook não perde o evento e não interrompe a atualização do painel.
- A integração Odoo atualiza o mesmo registro em reenvios, deixa a origem de cada campo clara e permite localizar e reenviar falhas.
- Uma restauração de backup é demonstrada em ambiente isolado antes de considerar o plano de recuperação válido.
- A equipe consegue configurar os filtros sem conhecer termos internos ou escrever expressões livres.

## V1.2 — Menus e visões da equipe

**Objetivo:** permitir que a empresa crie suas próprias listas de acompanhamento a partir dos processos sincronizados.

### Escopo sugerido

- Criar, nomear, renomear, reordenar, ativar, desativar e remover visões personalizadas.
- Escolher ícone e critérios em uma interface estruturada.
- Usar situação, etapa, tipo de processo, categoria de certificado, tipo de projeto, município, pendência e datas oficiais disponíveis.
- Combinar regras com grupos explícitos de “todas” (AND) e “qualquer” (OR), com limites para manter as consultas previsíveis.
- Mostrar total e amostra dos resultados antes de salvar.
- Restaurar os cinco menus padrão sem apagar processos, históricos ou configurações de outros menus.

### Regras de produto e segurança

- Menus e regras são compartilhados pela conta da empresa; rotas usam identificadores estáveis, não nomes editáveis.
- O painel interpreta um esquema validado de campos e operadores. Não aceita SQL, JavaScript, regex ou código arbitrário.
- Critérios temporais usam datas oficiais sincronizadas. Se o histórico não trouxer uma data, o processo continua podendo aparecer pelos outros critérios, mas não entra em recortes por data.
- A remoção de um menu só remove sua definição. Não apaga processos, notificações ou histórico.

### Critérios de aceite da V1.2

- Uma visão personalizada pode ser criada, editada, reordenada, desativada, reativada e removida sem afetar os dados oficiais.
- Os mesmos resultados alimentam navegação, indicadores, filtros de período e Excel.
- Todos os usuários autorizados da empresa veem a mesma configuração após atualizar a página ou iniciar uma nova sessão.
- Os menus V1 podem ser restaurados e os totais comparados com os critérios padrão conhecidos.

## V2.0 — Primeiro fluxo completo de cadastro, protocolo e documentos

**Objetivo da entrega V2.0:** permitir preparar o cadastro, enviar documentos nos pontos aceitos pelo Fênix e concluir um fluxo ponta a ponta com protocolo e confirmação verificáveis. Essa primeira entrega não representa paridade total; a meta é cobrir todos os módulos disponíveis ao perfil profissional/solicitante, módulo por módulo.

**Estado:** parcial. O Painel salva e valida rascunhos, lista os oito tipos e envia `technicalproject`; antes de concluir, consulta o detalhe do projeto pelo ID retornado e compara número e relações conhecidas. Se o envio ou a leitura tiver resultado ambíguo, bloqueia nova submissão e oferece uma consulta GET de reconciliação. O fluxo ainda para antes dos anexos e da geração explícita da solicitação/protocolo inicial. Para uma edificação nova, o vínculo ainda depende dos campos que o detalhe oficial retorna; IDs e contratos documentais seguem pendentes.

### Fase 0 — Descoberta do fluxo oficial (parcial)

- Completar o inventário das telas do perfil conectado: perfil/autenticidade, edificações, PT/PTS, solicitações, vistorias, migração SAP, remanejamento, documentos, DAE e demais serviços disponíveis.
- Para cada fluxo, registrar campos, validações, dependências entre telas, IDs, tipos documentais, limites, estados de erro e confirmação de sucesso.
- Comparar a nova lista de solicitações da conta com as cinco visões de processo atuais do Painel, incluindo filtros, tipos de serviço e ações por estado.
- Capturar contratos de leitura e escrita apenas em fluxo autorizado; separar fatos observados de hipóteses do reverseapi.
- Usar processo/conta de teste apropriados para validar mutações e respostas sem afetar cadastros de clientes.
- Documentar como consultar o estado oficial após timeout antes de permitir reenvio ou criar duplicidade.

**Gates pendentes:** confirmar uploads por contexto, geração do protocolo inicial e reconciliação do cadastro. As telas de migração SAP e remanejamento já foram localizadas, mas seus contratos de escrita e recebimento seguem sem validação.

### Fase 1 — Rascunho e validação (implementada parcialmente)

- Criar um fluxo guiado para os dados de uma nova edificação e do primeiro tipo de processo aprovado no escopo.
- Validar campos localmente e mostrar pendências antes do envio.
- Salvar rascunhos para retomar depois, sem afirmar que já existem no Fênix.
- Detectar possíveis edificações ou processos duplicados e explicar a correspondência encontrada.
- Revisar endereço, município, áreas, ocupação, tipo de projeto e dados técnicos conforme o formulário oficial exigir.

### Fase 2 — Anexos

- Permitir selecionar e revisar documentos antes do envio.
- Validar formato, tamanho e campos exigidos pelo Fênix.
- Mostrar estado por arquivo: selecionado, enviando, recebido, rejeitado ou falha recuperável.
- Permitir retomar falhas sem reenviar arquivos já confirmados.

**Estado atual do Painel:** nenhum upload ao Fênix está disponível. A interface oficial tem upload de documentos em uma solicitação PTS existente. Auditoria adicional do catálogo reverseapi em 30/10 confirmou apenas contratos candidatos estáticos: solicitação genérica (`POST /api/v1/solicitacoes/{solicitacao_id}/documentos`) e projeto inicial (`POST /api/v1/technicalprojectdocs`) descrevem o corpo como objeto genérico; vistoria lista `POST /documentos-solicitados`, `/documentos-solicitados-vistoria` e `/documents-survey-{destroy,download,load,store}` com `FormData`, sem confirmar qual rota pertence ao solicitante, IDs documentais, limites ou resposta; retificação é mais específica (`files` + `tipo_documento_id`, com GET de coleção/detalhe), mas continua somente bundle-only; remanejamento lista `POST /api/v1/remanejamentos/{id}/documentos` com `files`, depois de criar/solicitar o registro; Migração SAP não tem POST de anexo catalogado. Nenhuma dessas rotas de upload foi observada em tráfego autenticado.

O MCP reverseapi não envia multipart nem binários. Não há GET de inventário geral dos anexos de uma solicitação no catálogo; um GET de log de documentos na solicitação consultada retornou 403 e, mesmo se disponível, o log não comprovaria a lista de arquivos recebidos. Os detalhes de SAP e Remanejamento retornam metadados dos documentos já vinculados, mas ainda não foi provado que essa leitura confirma um upload recém-enviado. Portanto, o botão externo continua bloqueado até validar endpoint por contexto/etapa, campos multipart, IDs e limites, autorização do perfil e leitura posterior que devolva o documento recebido. As rotas de autenticidade profissional que recebem `documentos: FormData` são outro fluxo e não servem como contrato de anexos de processo.

### Fase 3 — Envio confirmado e reconciliação

- Exigir ação explícita do usuário com resumo dos dados e anexos que serão enviados.
- Associar cada tentativa a uma chave de idempotência ou a um mecanismo equivalente validado no fluxo oficial.
- Mostrar resultado retornado pelo Fênix e o protocolo criado.
- Após o envio, sincronizar o Fênix e conferir que o novo processo aparece na edificação correta.
- Se a conexão cair durante o envio, consultar o estado no Fênix antes de permitir uma nova tentativa.
- Registrar autor, horário, operação, resultado e identificador do Fênix em uma trilha de auditoria sem guardar senha ou tokens.

**Estado atual:** incompleta. O projeto agora é confirmado por leitura direta do detalhe, e uma edificação existente é comparada ao ID informado no envio. A rota ainda não executa explicitamente `gerarNumeroSolicitacao` para o cadastro inicial, não envia documentos e não reconcilia um vínculo de edificação nova quando o detalhe não traz um ID verificável.

### Expansão posterior da V2

A meta continua sendo todos os módulos do perfil profissional/solicitante. Esta é a ordem de execução acordada, com edição e documentos por contexto à frente dos módulos menos usados:

| Prioridade | Entrega | Critério de conclusão | Dependência principal |
|---|---|---|---|
| **P0.1 — Edição da edificação** | Editar cadastro existente preservando o ID oficial. | Abrir dados oficiais; separar campos editáveis dos bloqueados; salvar no Fênix; reler o mesmo ID e comparar os campos alterados. Até confirmar contrato/permissão, manter edição em rascunho local. | Método/rota, payload, campos obrigatórios e regras de elegibilidade confirmados via reverseapi e Fênix. |
| **P0.2 — Edição do projeto** | Editar PT/PTS existente sem duplicá-lo nem perder vínculos. | Carregar projeto e edificação relacionados; revisar dados técnicos, ocupações, RTs e medidas; atualizar o mesmo ID; confirmar por leitura posterior e preservar solicitação/protocolo. | Contrato de update, campos aceitos e estados que permitem edição confirmados. |
| **P0.3 — Documentos por contexto** | Guardar arquivos localmente e depois enviá-los com uma ação explícita por processo. | Selecionar o contexto exato (edificação, projeto, solicitação ou vistoria); mostrar tipos e limites oficiais daquele contexto; acompanhar cada arquivo; confirmar o recebimento por leitura posterior. SAP e Remanejamento entram nesta fase de documentos depois dos contextos centrais. | Contratos multipart, IDs dos tipos, IDs do alvo, etapa elegível, limites e leitura que comprove recebimento. |
| **P1 — Novo cadastro e protocolo** | Concluir o fluxo iniciado pelo Painel. | Criar projeto, relacionar/cadastrar edificação, gerar solicitação/protocolo, localizar cada ID oficial e reconciliar timeout antes de aceitar reenvio. | Sequência oficial das etapas e resposta de cada gravação confirmadas. |
| **P2 — Solicitações, vistorias e resultados** | Cobrir as demais operações comuns do ciclo do processo. | Filtros e detalhes, reanálise/revistoria, nova vistoria, notificação, protocolo, certificado e ações elegíveis por estado. | Relação projeto/solicitação/vistoria e elegibilidade oficial confirmadas. |
| **P3 — Conta, financeiro e serviços específicos** | Completar recursos restantes do perfil solicitante. | Perfil e autenticidade, DAE/pagamentos, Migração SAP, Remanejamento e demais serviços que o inventário confirmar. | Contratos, permissões, formulários e consequências oficiais documentadas; para pagamento, fluxo seguro e handoff do usuário. |
| **P4 — Fechar paridade** | Verificar o inventário inteiro em cenários autorizados. | Cada função marcada como verificada, não aplicável com justificativa, bloqueada por dependência externa ou pendente, com tratamento de erro, sessão, timeout, duplicidade e reconciliação. | Todos os blocos anteriores e evidência de leitura posterior para cada escrita. |

SAP, Remanejamento e finanças não foram removidos do objetivo final; apenas ficam depois de edição de edificação/projeto e documentos por contexto.

### Critérios de aceite da V2.0

- Um cadastro pode ser iniciado, salvo como rascunho, validado, enviado e localizado novamente no Fênix.
- Repetir uma tentativa após timeout não cria um processo duplicado.
- Os anexos exibem confirmação de recebimento do Fênix antes de serem tratados como enviados.
- Erros deixam o rascunho preservado e indicam o próximo passo possível.
- O histórico de auditoria permite responder quem iniciou e concluiu o envio e qual protocolo foi criado.
- Os dados e permissões continuam isolados conforme a política da conta da empresa.
- A entrega V2.0 pode ser considerada concluída sem afirmar paridade total; a paridade só será declarada depois que o inventário por papel não tiver funções pendentes e cada linha tiver evidência de verificação.

### Critério de aceite da meta de paridade total

- Todas as telas e ações disponíveis ao perfil profissional/solicitante estão no inventário, com estado no Painel: implementada e verificada, não aplicável com justificativa, bloqueada por dependência externa identificada ou pendente.
- Nenhum módulo do menu do Fênix fica omitido; itens descobertos no catálogo mas sem tela confirmada ficam explicitamente como não verificados.
- Criações, edições, anexos, pagamentos e cancelamentos respeitam a conta e o processo selecionados no Fênix.
- Toda mutação é confirmada por leitura posterior do Fênix e registra resultado, usuário, entidade relacionada e protocolo/identificador retornado.
- A sequência completa pode ser retomada após falha e não cria duplicidade quando a resposta da primeira tentativa for ambígua.

## Sequência de releases

| Release | Resultado esperado | Pré-requisito para avançar |
|---|---|---|
| V1.0 | Acompanhamento, sincronização, IA, notificações, renovações e exportação em produção | Uso da equipe e registro de problemas reais |
| V1.1 | Dados mais confiáveis, filtros guiados, notificações operáveis, integração Odoo piloto e recuperação validada | Critérios de aceite da V1.1 concluídos |
| V1.2 | Visões personalizadas criadas pela equipe | Segurança, consistência e restauração dos menus padrão validadas |
| V2.0 | Primeiro fluxo de cadastro enviado e confirmado no Fênix | Fluxo oficial mapeado, idempotência e reconciliação demonstradas |
| V2.x | Expansão para todos os fluxos inventariados do profissional/solicitante | Cada módulo passa por gate próprio de validação, recuperação e conferência oficial; paridade total só ao zerar pendências |

## Decisões a tomar antes da V2

- Quais tipos de cadastro entram no primeiro fluxo completo.
- Se qualquer usuário autenticado pode enviar ou se a empresa precisa de uma permissão específica para escrita.
- Quais dados de rascunho ficam no banco e por quanto tempo.
- Limites e formatos aceitos para anexos.
- Como lidar com etapas de autenticação humana ou validações adicionais do Fênix.
- Qual ambiente ou conjunto de dados pode ser usado para validar o envio sem afetar processos reais.
- Qual é o processo autorizado de teste para cada escrita do perfil solicitante, especialmente upload, protocolo, pagamento, cancelamento e atualização de dados.
- Quais serviços sugeridos pelo catálogo do reverseapi realmente aparecem para esta conta e quais ficam indisponíveis por elegibilidade ou situação do processo.

## Decisões para o piloto Odoo

- Qual evento de negócio deve chegar primeiro ao Odoo: mudança de etapa, homologação, vencimento próximo ou todos esses eventos.
- Qual objeto do Odoo deve receber a informação: atividade, oportunidade, projeto ou outro modelo já adotado pela equipe.
- Como localizar e relacionar o parceiro/cliente sem criar contatos duplicados.
- Qual instância de teste, usuário técnico e escopo de acesso estão disponíveis.
- Quem monitora a fila de integração e resolve conflitos de dados.

O Odoo MCP pode ajudar em descoberta e operações assistidas, mas a integração automática do painel deve usar uma interface de serviço apropriada à instância e ter credenciais, retries e auditoria próprios. O contrato exato depende da versão, hospedagem e módulos habilitados no Odoo da empresa.

## Fora do escopo até os respectivos gates

- Não tratar o painel como fonte oficial nem marcar um cadastro como concluído apenas porque o formulário foi enviado.
- Não automatizar escrita com base em chamadas presumidas; cada operação deve ser observada e validada no Fênix.
- Não agrupar criação, edição, renovação e cancelamento em um único fluxo genérico.
- Não prometer datas de entrega antes de confirmar o contrato de escrita e o comportamento de recuperação do Fênix.
