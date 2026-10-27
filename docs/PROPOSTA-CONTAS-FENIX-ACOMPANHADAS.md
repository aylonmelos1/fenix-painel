# Proposta — Contas Fênix acompanhadas

**Status:** implementado e implantado no Dedicated

**Implementação:** release `5b4f434` publicado; validação com conta Fênix autorizada ainda pendente

**Data:** 27/10/2026

## Resumo

Permitir que uma pessoa já autenticada no Fênix Painel conecte uma ou mais contas Fênix de clientes, escolha quais edificações quer acompanhar e veja esses dados junto das edificações atuais. Cada registro deve indicar claramente de qual conexão veio.

O acesso principal ao Painel continua sendo a conta Fênix da empresa. As contas dos clientes são conexões adicionais, com sessões e sincronizações próprias. O Painel continua consultando dados em modo somente leitura.

### Recomendação principal de produto

- Chamar a ação de **Acompanhar edificações**, não **Importar edificações**. “Importar” sugere cópia ou mudança de titularidade; aqui o Painel consulta e guarda uma visão local dos dados da conta conectada.
- Tratar cada conta conectada como uma **conexão Fênix**, com um nome interno escolhido pela equipe, como “Fênix XPTO” ou “Cliente Alfa”.
- Manter as edificações numa lista integrada, com selo da conexão de origem e filtro por conta.
- Fazer login, seleção e confirmação no mesmo modal, em etapas curtas e recuperáveis.
- Separar a sessão da conta principal das sessões dos clientes. Conectar ou reautenticar uma conta adicional nunca deve trocar o acesso principal ao Painel.

## Contexto e problema

Alguns clientes iniciam por conta própria os processos de vistoria ou análise no Fênix. Depois contratam uma empresa especializada, que passa a preparar e enviar documentos pelo processo já aberto pelo cliente. A equipe consegue consultar esse processo no Fênix do cliente, mas hoje o Fênix Painel só acompanha as edificações da conta usada para entrar no Painel.

O trabalho acaba dividido entre contas e portais. A proposta é dar à equipe um só lugar para acompanhar as edificações autorizadas dos clientes, mantendo visível a conta responsável por cada dado.

## Objetivos

- Conectar uma conta Fênix adicional sem encerrar nem substituir a sessão principal.
- Consultar as edificações disponíveis naquela conta e permitir uma seleção explícita.
- Acompanhar apenas as edificações escolhidas, mantendo a origem visível em tabelas, fichas e exportações.
- Permitir renomear, reautenticar, pausar e remover cada conexão.
- Isolar dados, sincronizações, falhas e notificações por conexão.
- Preservar o caráter somente leitura do Fênix Painel.

## Fora do escopo desta proposta

- Criar ou editar edificações, projetos, solicitações, vistorias ou documentos no Fênix.
- Unir automaticamente edificações que pareçam duplicadas em contas diferentes.
- Compartilhar uma conexão com outros painéis ou organizações.
- Definir agora o modelo final de permissões para futuras contas individuais de operadores.

## Conceitos

| Termo | Significado |
|---|---|
| Conta principal | Conta Fênix usada para autenticar a pessoa/empresa no Fênix Painel. |
| Conexão Fênix | Sessão adicional de uma conta de cliente, guardada para consultas futuras. |
| Nome da conexão | Rótulo interno editável, por exemplo “Fênix XPTO”. Não altera nome ou dados oficiais no Fênix. |
| Edificação acompanhada | Edificação selecionada para entrar nas listas e receber consultas periódicas daquela conexão. |
| Origem | Conexão Fênix à qual pertencem a edificação e seus processos. |

## Fluxo proposto

### 1. Início em Consultas

Na área **Consultas**, mostrar as conexões e o estado de cada sincronização. Incluir o botão **+ Conta Fênix**. A mesma ação pode aparecer em Configurações, na seção **Contas Fênix acompanhadas**.

O botão abre um modal grande no desktop e em tela cheia no celular. Um indicador de etapas apresenta **Conectar → Selecionar → Acompanhar**. A transição horizontal entre etapas pode preservar a ideia visual inicial, com movimento reduzido se a pessoa tiver essa preferência de acessibilidade.

### 2. Conectar

- Explicar que se trata da conta Fênix do cliente e que a conta principal do Painel permanecerá conectada.
- Pedir usuário, senha e hCaptcha usando o fluxo oficial do Fênix.
- Não guardar a senha depois da autenticação. A conexão persistente precisa usar a sessão autenticada, protegida no armazenamento local.
- Informar de forma breve que a equipe deve ter autorização para acompanhar a conta do cliente.
- Se o acesso falhar, manter o modal aberto, explicar o erro de forma segura e permitir nova tentativa.

### 3. Carregar e selecionar edificações

Após autenticar, buscar a lista de edificações daquela conta. Mostrar skeletons durante o carregamento e um erro recuperável caso a consulta falhe.

Cada item deve trazer os dados suficientes para a equipe reconhecer o imóvel, por exemplo nome/referência e município. Endereço completo ou outros dados pessoais só devem aparecer se forem necessários para distinguir edificações.

- Usar controles de alternância acessíveis para marcar/desmarcar, em vez de depender apenas de um slider visual.
- Mostrar quantas edificações estão selecionadas e oferecer busca na lista.
- Exibir claramente seleções que já estavam salvas ao reabrir a gestão da conta.
- Indicar se uma edificação já aparece por outra conexão; nunca mesclar registros silenciosamente.
- Se a autenticação funcionar, mas a consulta do catálogo falhar, manter a etapa aberta e permitir repetir a consulta sem pedir senha ou hCaptcha outra vez.
- Se a conta não tiver edificações disponíveis, explicar o estado e permitir voltar, tentar novamente ou cancelar.

No rodapé fixo do modal, mostrar o total selecionado e o botão **Acompanhar X edificações**. O botão fica desabilitado se nada estiver selecionado, a menos que o usuário esteja salvando uma mudança para remover todas as seleções.

### 4. Confirmar e concluir

Ao confirmar, mostrar um estado de processamento visível, bloquear alterações na seleção e anunciar o progresso para leitores de tela. Não deixar uma tela cinza sem mensagem ou sem indicação de que o pedido está avançando.

Quando terminar:

- Fechar o modal e atualizar as listas sem exigir recarregamento manual.
- Mostrar uma confirmação como **“3 edificações de Fênix XPTO agora estão em acompanhamento.”**
- Exibir o selo **Fênix XPTO** nas edificações e nos detalhes dos processos.
- Se algumas edificações falharem durante a sincronização inicial, manter as que tiveram sucesso e informar quais precisam de nova tentativa.

O nome inicial sugerido para a conexão pode ser **Conta Fênix 2**. A pessoa pode alterá-lo antes de confirmar ou depois em Configurações. Evitar usar e-mail ou identificador de login como selo visível.

## Onde a origem deve aparecer

O selo de origem precisa estar visível onde os dados são usados, não apenas na lista de edificações:

- Tabela/lista de edificações e ficha da edificação.
- Processos, solicitações, vistorias, histórico e documentos da ficha.
- Resultados de busca e filtros por conta de origem.
- Exportações, para que uma planilha mantenha a coluna **Conta Fênix**.
- Notificações e entregas externas habilitadas para aquela conexão.
- Respostas da IA que usem contexto de mais de uma conta, identificando a origem dos dados.

As visões e os totais podem ser integrados por padrão. O filtro por conexão permite isolar um cliente quando a equipe precisar trabalhar numa conta específica.

## Gestão em Configurações

Criar uma seção **Contas Fênix acompanhadas** com um cartão por conexão. Cada cartão mostra:

- Nome escolhido pela equipe.
- Estado: **Ativa**, **Precisa reconectar**, **Pausada** ou **Falha na última consulta**.
- Quantidade de edificações selecionadas.
- Data da última sincronização bem-sucedida e resumo da última falha, sem detalhes de autenticação.
- Ações: **Renomear**, **Gerenciar edificações**, **Reconectar**, **Pausar/Retomar** e **Remover**.

Renomear altera o selo e os filtros no Painel, sem modificar dados do Fênix. Reconectar deve conferir que o login voltou à mesma identidade Fênix da conexão; se for outra conta, pedir confirmação para criar uma conexão separada, sem substituir a existente.

## Regras de funcionamento recomendadas

### Conexão e sincronização

- A conta principal continua responsável pelo login no Painel. Cada conexão adicional tem sessão, estado e histórico de sincronização próprios.
- Uma falha, expiração de sessão ou hCaptcha de uma conta não interrompe a sincronização das demais.
- Sessão expirada muda o estado para **Precisa reconectar**; as seleções permanecem salvas e a interface identifica os dados como desatualizados.
- A frequência segue a configuração de atualização do Painel, mas cada conexão tem registro de execução e erro separado.
- Respeitar limites do Fênix e evitar que adicionar contas cause consultas concorrentes ou volume excessivo.

### Seleção e remoção de edificações

- Selecionar uma edificação inicia sua sincronização e a inclui nas visões do Painel.
- Desmarcar significa **parar de acompanhar**: interrompe consultas futuras e remove a edificação das listas ativas, totais, exportações e novos envios. O snapshot local fica disponível para reativação.
- Pausar uma conexão interrompe as consultas automáticas dela, mantém os dados visíveis como desatualizados e identifica as edificações com o selo “pausada”.
- **Remover conexão** revoga a sessão guardada e, após confirmação, exclui edificações, processos, históricos, notificações, conversas e logs locais de webhook daquela origem. Para manter os dados sem consultar, a equipe pode pausar a conexão.

### Integrações e notificações

- Dados de conexões adicionais podem alimentar as visões combinadas e as notificações internas do Painel.
- O webhook tem uma opção por conexão, desligada por padrão ao conectar uma conta. A equipe habilita explicitamente o envio dos dados do cliente à integração externa.
- Se a IA receber dados de múltiplas conexões, cada fonte deve ser identificada. A preferência atual de acesso à IA continua sendo respeitada.
- Desmarcar ou pausar uma origem impede novos eventos após a atualização da seleção. O log conserva entregas já registradas; remover a conexão apaga os logs locais dela.

## Decisões técnicas aplicadas

Cada conexão adicional recebe uma partição local própria. Seu cookie Fênix é criptografado no backend, nunca entra na tabela de sessões de login do Painel e nunca substitui a conta principal. A senha e o token hCaptcha só são usados no login. A etapa intermediária de autenticação fica em memória por até 15 minutos.

Os IDs locais de edificações e processos incluem a conexão de origem, para que IDs remotos iguais em contas diferentes não colidam. Edificações desmarcadas deixam as consultas e listas ativas, mas permanecem no snapshot local para uma possível reativação. Pausar uma conexão mantém os dados visíveis, identifica a origem como pausada e interrompe a sincronização automática. Remover uma conexão apaga sessão e dados locais relacionados, após confirmação.

O aviso de possível duplicidade compara ID remoto e, quando disponível, referência e município normalizados. Ele só sinaliza candidatos; não altera nem mescla registros. A atualização do histórico verifica novamente se a conexão e a edificação continuam ativas antes de gravar a resposta do Fênix.

A equipe pode conectar várias contas pela identidade compartilhada do Painel. Não foi introduzida uma camada de permissões individuais: quem consegue entrar nessa identidade também consegue administrar as conexões. Cada conta começa com um rótulo derivado do nome retornado pelo Fênix, quando disponível, e esse rótulo pode ser alterado.

As conexões adicionais entram nas visões combinadas, nos filtros por conta, nas exportações, nas notificações e no contexto da IA, respeitando as preferências existentes. O webhook fica desligado por padrão e é habilitado individualmente por conexão. As consultas continuam somente leitura.

## Critérios de aceite para a primeira versão

- É possível conectar uma conta de cliente sem trocar ou encerrar a conta principal do Painel.
- Usuário, senha e hCaptcha inválidos não criam uma conexão ativa nem aparecem nos logs.
- A lista da conta pode ser carregada, pesquisada e selecionada; a confirmação informa o total escolhido.
- Uma falha temporária no catálogo permite nova tentativa sem repetir o login.
- Somente as edificações selecionadas entram no acompanhamento ativo e recebem o selo da origem.
- Uma edificação de outra conta com ID remoto igual não sobrescreve dados nem processos locais.
- Possíveis duplicidades por ID remoto ou referência e município são sinalizadas para revisão, sem união automática.
- Atualizações manuais e automáticas consultam a sessão correta e mantêm histórico por conexão.
- Falhas e sessões expiradas de uma conexão não bloqueiam as demais.
- Renomear a conexão atualiza selo, filtros e exportações sem alterar dados oficiais.
- A equipe consegue pausar, retomar, reautenticar e remover uma conexão com o efeito sobre seus dados explicado antes da confirmação.
- Busca, indicadores, visões de processos, detalhes, Excel, notificações e IA preservam a origem dos dados.
- O Painel não cria nem altera dados no Fênix durante o fluxo de acompanhamento.

## Validação e próximos passos

- `npm run typecheck`, `npm test` (8/8) e `npm run build` passaram localmente e no Dedicated com Node.js 22.23.2.
- O teste integrado cobre isolamento de sessões/dados, conta principal, catálogo recuperável, duplicidades, seleção, sincronização, renomeação, reconexão, pausa durante consulta de histórico e remoção. O upstream e o hCaptcha são sintéticos nessa validação.
- A migração foi aplicada primeiro em uma cópia do banco de produção; depois do deploy, o banco ativo passou no `quick_check` e contém as tabelas e colunas novas.
- O serviço `fenix-painel` está ativo; a API pública respondeu e o navegador recebeu o bundle `index-D2Oq445P.js` com a interface de contas Fênix.
- Ainda falta entrar com uma conta Fênix de teste/autorizada, completar o hCaptcha e conferir login, catálogo, seleção, sincronização e reconexão contra o serviço real.
- `git diff --check` passou.

## Referências internas

- [Direção do produto](design/README.md)
- [Roadmap do Fênix Painel](ROADMAP-V1-A-V2.md)
