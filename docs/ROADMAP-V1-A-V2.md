# Roadmap do Fênix Painel: V1 até V2

**Status:** proposta de sequência de produto

**Atualizado em:** 26/10/2026
**Regra de planejamento:** as versões indicam escopo e critérios de aceite, não datas prometidas.

## Direção do produto

O Fênix Painel começou como uma camada de acompanhamento sobre os dados do Fênix. A V1 deve continuar previsível, correta e confiável para a operação diária, e conectar os dados do Fênix aos sistemas usados pela empresa. A evolução seguinte amplia a personalização das listas. A V2 muda o papel do produto: além de consultar e integrar, o usuário poderá preparar e enviar cadastros ao Fênix.

O Fênix continua sendo a fonte oficial dos dados e dos protocolos. O painel só deve confirmar uma operação de cadastro depois de verificar o resultado no próprio Fênix.

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

## V2.0 — Cadastro pelo painel

**Objetivo:** permitir iniciar cadastros pelo Fênix Painel e concluir o envio no Fênix com retorno verificável.

O escopo final depende de mapear as telas, validações, autenticação, anexos e respostas reais do Fênix. A primeira entrega deve cobrir um fluxo completo e suportado antes de ampliar para todos os tipos de processo.

### Fase 0 — Descoberta do fluxo oficial

- Mapear pelo Chrome os passos para cadastrar uma edificação e iniciar os processos escolhidos pela equipe.
- Identificar campos obrigatórios, dependências entre telas, validações, documentos e estados de erro.
- Confirmar quais operações são permitidas pela sessão oficial e como o Fênix confirma um cadastro concluído.
- Selecionar uma conta e dados de teste apropriados, sem enviar cadastros reais durante o mapeamento.
- Documentar o contrato observado e separar fatos confirmados de hipóteses sobre chamadas internas.

**Gate:** só implementar envio depois de comprovar como evitar duplicidade e como recuperar o resultado de uma resposta interrompida.

### Fase 1 — Rascunho e validação

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

### Fase 3 — Envio confirmado e reconciliação

- Exigir ação explícita do usuário com resumo dos dados e anexos que serão enviados.
- Associar cada tentativa a uma chave de idempotência ou a um mecanismo equivalente validado no fluxo oficial.
- Mostrar resultado retornado pelo Fênix e o protocolo criado.
- Após o envio, sincronizar o Fênix e conferir que o novo processo aparece na edificação correta.
- Se a conexão cair durante o envio, consultar o estado no Fênix antes de permitir uma nova tentativa.
- Registrar autor, horário, operação, resultado e identificador do Fênix em uma trilha de auditoria sem guardar senha ou tokens.

### Expansão posterior da V2

Depois do primeiro cadastro completo e reconciliado, ampliar por etapas para PT, PTS, AVCB, CLCB, solicitações e vistorias, conforme os fluxos reais permitirem. Edição, retificação, renovação e cancelamento devem ser tratados como operações separadas, cada uma com validação e recuperação próprias.

### Critérios de aceite da V2.0

- Um cadastro pode ser iniciado, salvo como rascunho, validado, enviado e localizado novamente no Fênix.
- Repetir uma tentativa após timeout não cria um processo duplicado.
- Os anexos exibem confirmação de recebimento do Fênix antes de serem tratados como enviados.
- Erros deixam o rascunho preservado e indicam o próximo passo possível.
- O histórico de auditoria permite responder quem iniciou e concluiu o envio e qual protocolo foi criado.
- Os dados e permissões continuam isolados conforme a política da conta da empresa.

## Sequência de releases

| Release | Resultado esperado | Pré-requisito para avançar |
|---|---|---|
| V1.0 | Acompanhamento, sincronização, IA, notificações, renovações e exportação em produção | Uso da equipe e registro de problemas reais |
| V1.1 | Dados mais confiáveis, filtros guiados, notificações operáveis, integração Odoo piloto e recuperação validada | Critérios de aceite da V1.1 concluídos |
| V1.2 | Visões personalizadas criadas pela equipe | Segurança, consistência e restauração dos menus padrão validadas |
| V2.0 | Primeiro fluxo de cadastro enviado e confirmado no Fênix | Fluxo oficial mapeado, idempotência e reconciliação demonstradas |
| V2.x | Expansão para outros tipos de cadastro e operações | Cada novo fluxo passa por gate próprio de validação e recuperação |

## Decisões a tomar antes da V2

- Quais tipos de cadastro entram no primeiro fluxo completo.
- Se qualquer usuário autenticado pode enviar ou se a empresa precisa de uma permissão específica para escrita.
- Quais dados de rascunho ficam no banco e por quanto tempo.
- Limites e formatos aceitos para anexos.
- Como lidar com etapas de autenticação humana ou validações adicionais do Fênix.
- Qual ambiente ou conjunto de dados pode ser usado para validar o envio sem afetar processos reais.

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
