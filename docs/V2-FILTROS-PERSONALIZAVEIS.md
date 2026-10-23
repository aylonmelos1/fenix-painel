# V2 — Menus e filtros de processos configuráveis

## Objetivo

Permitir que a equipe adapte os menus de acompanhamento sem alterar código: criar, renomear, reordenar, desativar e remover filtros como **Em Análise**, **Notificados** e **Parados**, definindo quais processos entram em cada lista.

Esta proposta é para a V2. A V1 mantém os menus e critérios atuais, com valores coerentes entre os cartões, as tabelas e os indicadores.

## Modelo de uso

- A configuração pertence à conta da empresa e é compartilhada por todos os usuários daquela conta.
- Cada menu salvo representa uma visão da mesma base sincronizada; não cria uma nova cópia de processos.
- O usuário pode criar um menu, escolher nome e ícone, definir critérios, ordenar a navegação e habilitar ou desabilitar a visão.
- Menus inativos podem ser reativados. A remoção exige confirmação e não remove processos nem histórico.
- As telas padrão da V1 podem ser restauradas como um conjunto inicial editável.

## Critérios permitidos

As condições devem ser escolhidas em uma interface estruturada, sem aceitar JavaScript, SQL ou expressões livres. A primeira versão da V2 deve permitir:

- Campo: situação atual, etapa, tipo de processo, categoria do certificado, tipo de projeto, município e existência de pendência.
- Operadores: é, não é, contém e não contém; categorias permitem seleção múltipla.
- Grupos explícitos de condições: todas (AND) ou qualquer uma (OR), com limite de profundidade e quantidade de regras.
- Valores de status provenientes dos dados sincronizados, mantendo o valor original e uma forma normalizada para comparação sem diferença de caixa ou acentuação.
- Critérios opcionais de data para a entrada na etapa ou última movimentação oficial. Não usar `updated_at` da sincronização como substituto de uma data oficial ausente.

## Semântica e consistência

- A definição do menu é a única fonte da regra de inclusão. Contagem, tabela, filtros por data e cartões derivados devem usar o mesmo resultado.
- Um processo que atende a dois menus pode aparecer nos dois; cada menu exibe processos deduplicados pela mesma chave de edificação e protocolo adotada pelo painel.
- Se o histórico oficial não estiver disponível, o item continua visível quando atender aos critérios de situação, mas a data fica indisponível e não participa de filtros temporais.
- Salvar uma configuração deve atualizar as contagens e a tabela na mesma resposta visual, sem exigir uma nova consulta ao Fênix.
- Alterações de configuração nunca modificam status, etapas, notificações ou dados oficiais sincronizados.

## Experiência proposta

1. Um botão **Personalizar menus** abre um editor com lista reordenável e prévia da quantidade de resultados.
2. **Novo menu** inicia com nome, ícone e condições vazias; a prévia explica que nenhum item entra até adicionar regras.
3. Cada regra mostra campo, operador e valor com rótulos da interface, por exemplo: `Etapa atual` / `é` / `Pendente de Documentação`.
4. A prévia exibe uma amostra e o total, com atalho para abrir a lista antes de salvar.
5. Salvar valida regras, atualiza a navegação e mantém filtros temporais e de busca dentro do menu escolhido.
6. O menu ativo fica destacado; menus desativados não aparecem na barra lateral, mas continuam disponíveis no editor.

## Dados e migração

- Guardar menus e regras em tabelas versionadas, vinculadas à identidade compartilhada da conta Fênix.
- Usar identificadores estáveis para menus; rotas não devem depender do texto editável do rótulo.
- Migrar os menus V1 para definições padrão equivalentes, preservando os nomes conhecidos e as regras atuais.
- Validar a migração com cópia do banco, rollback e conferência de totais antes de ativar a V2.
- Não armazenar regras como código executável. Interpretar um esquema JSON validado no servidor com campos e operadores permitidos.

## Permissões, segurança e auditoria

- Todas as condições são avaliadas no backend sobre dados da própria conta autenticada.
- Limitar tamanho, profundidade e quantidade de regras para manter consultas previsíveis.
- Validar novamente cada campo, operador e valor no servidor; o cliente não determina a consulta SQL.
- Registrar quem alterou a configuração, quando e qual versão foi salva, sem copiar dados pessoais ou conteúdo de processos para os logs.
- Definir antes da implementação se qualquer usuário da conta pode editar ou se haverá papel de administrador; a regra deve ser consistente para todos os colaboradores.

## Plano de entrega

1. Inventariar as categorias/status reais e confirmar a identidade compartilhada usada pelas sessões da empresa.
2. Aprovar o modelo de dados, permissões e comportamento de menus removidos que ainda estejam em uso por favoritos ou links salvos.
3. Implementar migração com os menus padrão e API validada no servidor.
4. Criar editor, prévia, ordenação e atualização da sidebar.
5. Comparar, para cada menu padrão, contagem e itens da V1 com os resultados da regra migrada.
6. Liberar primeiro para uma conta de teste, observar desempenho e permitir restaurar os padrões.

## Critérios de aceite

- Um usuário autorizado cria, edita, reordena, desativa, reativa e remove um menu sem perder dados de processos.
- As regras são validadas no servidor e não permitem consultas arbitrárias.
- A contagem do menu coincide com as linhas únicas exibidas na tabela, inclusive após sincronização.
- Critérios temporais usam datas do histórico oficial e tratam histórico ausente como indisponível.
- Todos os usuários da conta veem a mesma configuração depois de atualizar a página ou entrar novamente.
- A migração preserva os menus existentes e permite rollback comprovado em cópia de banco.
