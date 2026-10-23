# Operação e suporte — v1.0.0 LTS

## Política da linha 1.x

- A linha 1.x preserva a estrutura de dados do usuário e a semântica das telas de edificações/processos.
- Atualizações 1.x devem ser compatíveis com os dados existentes. Mudanças que exijam alteração incompatível de comportamento ou estrutura ficam para uma nova versão principal.
- O estado é local por instalação. Backup, proteção do computador e disponibilidade da sessão Fênix são responsabilidades da operação local.
- A referência de runtime validada nesta release é Node.js 22.23.2; o mínimo declarado é Node.js 20.

## Instalação e início

```bash
npm ci
npm run typecheck
npm test
npm run build
NODE_ENV=production npm start
```

O servidor inicia em `127.0.0.1:3001`; `PORT` escolhe outra porta local. Não exponha esta porta à rede. O health check é `GET /api/health` e retorna `ok`, nome do serviço, versão e horário. Ele não verifica a disponibilidade externa do Fênix ou da OpenAI.

## Proxy upstream Cloudflare opcional

Use `FENIX_BASE_URL` e `FENIX_PROXY_TOKEN` no ambiente do servidor para rotear as chamadas do Fênix pelo Worker. `FENIX_BASE_URL` deve ser a origem HTTPS do domínio cuja rota `/api/v1/*` está vinculada ao Worker. `FENIX_PROXY_TOKEN` deve corresponder ao segredo de mesmo nome no Worker. O painel carrega `.env` no servidor em desenvolvimento e produção. Não versionar `.env`.

O Worker existente em `~/fenix-mcp/cloudflare/fenix-upstream-proxy` encaminha somente `/api/v1/*` para o host oficial e reescreve `Origin`/`Referer`. O cookie jar do painel fica associado à origem do proxy; o segredo é enviado somente ao Worker. A configuração local `wrangler.jsonc` ainda traz `fenix.example.com`/`example.com`, então essa rota de exemplo não pode ser usada em produção. Configure e valide um domínio real sob controle da conta Cloudflare; o health check local não valida a rota nem a autenticação upstream.

## Indicadores e listas

- `Edificações acompanhadas` conta registros de edificação.
- `Processos em análise`, `Processos aguardando ação` e `Processos com vistoria` contam linhas de processo sincronizadas, inclusive mais de um processo da mesma edificação.
- As três métricas de processo abrem listas em nível de processo usando os mesmos campos e predicados que geram os números.
- A tabela de edificações mostra uma linha por edificação e indica separadamente quantos processos estão vinculados.

## Backup e restauração

O utilitário `npm run data:backup -- <destino>` usa a API de backup do SQLite, valida `quick_check`, grava um resumo SHA-256 do banco e copia `data/.local-key`. A pasta é criada com permissão `0700`; banco, chave e manifesto ficam com `0600`. O destino deve existir fora de `data/`.

Restauração:

1. Pare a instância local do Fênix Painel.
2. Rode `npm run data:restore -- <backup> --confirm-stopped --replace-existing`.
3. O script valida o banco e a chave antes da troca. A pasta atual é renomeada para `data.pre-restore-<timestamp>` e preservada.
4. Inicie o painel; confirme o health check, a sessão do Fênix e a abertura do dashboard.
5. Só remova a cópia pré-restauração depois de verificar o acesso aos dados.

O restore automatizado não deve ser usado com o servidor ativo. O conjunto de testes exercita o backup e restore em diretórios temporários e valida também a preservação do diretório anterior.

## Diagnóstico

- Erros de sincronização aparecem em **Consultas**, com horário e mensagem segura para o usuário; falhas não são tratadas como sincronização bem-sucedida.
- Erros de metadados de documentos aparecem junto ao arquivo e oferecem nova consulta quando a falha é transitória. `404` é mostrado como documento não retornado. DAE manual e anexo sem rota de download validada não recebem um botão de download ativo.
- Logs registram eventos operacionais e status/código de erro, sem registrar chave OpenAI, senha Fênix, cookie de sessão ou conteúdo de perguntas.
- `GET /api/health` confirma somente que o processo HTTP está respondendo. Para diagnosticar Fênix, consulte o estado e o histórico dentro do painel.
- A sincronização automática verifica contas autenticadas em intervalos de até 30 minutos enquanto o servidor local está ativo. A campainha guarda mudanças para consulta posterior; avisos do sistema operacional exigem permissão do navegador e que o painel esteja aberto.
- Históricos são consultados pelo backend e persistidos no SQLite; o navegador só lê o estado e o progresso locais. As chamadas ao Fênix compartilham uma janela deslizante persistida no SQLite, limitada a 45 requisições por minuto para manter margem abaixo do limite upstream conhecido de 60/min. Se o Fênix ainda responder `429`, a rotina respeita `Retry-After` como proteção adicional.

## Integrações e limitações conhecidas

- As consultas e downloads upstream do Fênix permanecem em rotas de leitura. O formulário da SEFAZ-BA para DAE não é submetido pelo painel.
- O Fênix pode negar anexos de retificação ou não retornar metadados/arquivos. A interface expõe a limitação por documento e não afirma que arquivo ausente foi validado.
- A IA é sob demanda e pode gerar custos na conta OpenAI configurada. Cada pergunta envia contexto de processo sanitizado e até seis trocas recentes; o texto livre digitado pelo usuário é enviado como pergunta.
- Integração de webhook é opcional e compartilhada pela conta da empresa. A URL fica cifrada no SQLite; cada nova notificação dispara um POST JSON com `before`, `after` e `changes`. Em produção, só HTTPS com destino público é aceito, redirecionamentos não são seguidos e a requisição expira em cinco segundos. Falhas não interrompem a sincronização, mas não há fila persistente nem retentativa automática; monitore os logs de entrega.
- Não há serviço de atualização remota, execução fora do computador local, integração de suporte remoto ou envio externo de backup nesta versão.
