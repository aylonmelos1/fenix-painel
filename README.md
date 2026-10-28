# Fênix Painel v1.0.0 LTS

Painel local para acompanhar edificações e os processos de aprovação de segurança contra incêndio no CBMBA. O acesso usa a conta existente do Fênix; o produto não é CRM e não cria um cadastro paralelo.

O board de `docs/design/board-padrao.png` é a referência visual oficial.

## Roadmap

Veja [o roadmap da V1 até a V2](docs/ROADMAP-V1-A-V2.md) e a [proposta de menus personalizados da V1.2](docs/V1.2-MENUS-PERSONALIZAVEIS.md).

## Requisitos e comandos

- Node.js 20.12 ou superior. A release foi preparada e validada com Node.js 22.23.2.
- `npm ci` instala as dependências a partir do lockfile.
- `npm run typecheck`, `npm test` e `npm run build` validam os tipos, regras críticas e os artefatos de release.
- `npm start` inicia o servidor local em `127.0.0.1:3001`. Use `PORT` para escolher outra porta.

Para iniciar em modo de produção local:

```bash
npm ci
npm run typecheck
npm test
npm run build
NODE_ENV=production npm start
```

O painel só escuta no loopback. `/api/health` informa estado e versão; não contém credenciais.

### Proxy Cloudflare opcional

O servidor pode enviar as chamadas upstream do Fênix pelo Worker da Cloudflare. Copie `.env.example` para `.env`, configure `FENIX_BASE_URL` com a origem HTTPS que tem a rota `/api/v1/*` ligada ao Worker e configure `FENIX_PROXY_TOKEN` com o mesmo segredo armazenado no Worker. Reinicie o servidor após alterar essas variáveis. O segredo fica somente no processo servidor; o Worker encaminha cookies/XSRF ao host oficial do Fênix e remove o segredo antes do encaminhamento. Sem essas variáveis, o painel continua conectando diretamente ao Fênix.

O código do Worker está em `/home/aylons1/fenix-mcp/cloudflare/fenix-upstream-proxy`. A rota versionada nesse projeto usa um domínio de exemplo; configure uma rota para um domínio que você controla antes de usar o proxy. Não coloque o segredo no frontend nem em arquivos versionados.

## Áreas do painel

- Visão geral e edificações: uma linha por edificação, com o processo mais recente resumido.
- Projetos técnicos, solicitações/vistorias e indicadores: uma linha por processo Fênix. Os indicadores de processos abrem listas na mesma unidade e aplicam o mesmo critério de status.
- Documentos: abre a ficha da edificação e consulta os arquivos oficiais sob demanda. Cada item mostra disponibilidade, limitação conhecida ou falha consultável novamente.
- Consultas: estado da conexão e histórico local das sincronizações. A sincronização roda no servidor a cada 30 minutos para contas com sessão ativa; mudanças em processos geram notificações locais.
- Assistente Fênix: conversa contextual sob demanda, com perguntas e respostas preservadas enquanto o painel estiver aberto e fontes do processo.

## Dados, credenciais e integrações

O SQLite, as sessões do Fênix e as configurações e chaves OpenAI/Odoo ficam em `data/`. As chaves OpenAI e Odoo e a sessão Fênix são criptografadas com AES-256-GCM usando `data/.local-key`; as permissões são restritas ao usuário local. Não copie as chaves para o frontend, logs, capturas de tela ou repositórios.

A sincronização consulta as rotas GET mapeadas no `fenix-mcp`. O painel não envia alterações ao Fênix. Certificados e comprovantes são baixados quando o Fênix oferece o arquivo. A emissão do DAE pode exigir etapa manual na SEFAZ-BA. Alguns anexos de retificação podem não ser autorizados pela sessão atual; a interface identifica essa limitação.

### Integração Odoo

Configure a URL da instância, o banco (quando necessário) e a chave da API JSON-2 em **Configurações → Integração Odoo**. A chave é criptografada no armazenamento local e nunca é devolvida ao navegador. Na aba Odoo, sugestões de projetos são ordenadas pela semelhança entre o cliente e o nome da edificação; tanto uma sugestão quanto a consulta por ID abrem uma prévia e só são vinculadas após confirmação. O painel lê o projeto, tarefas, atividades e Chatter; notas internas, atividades e documentos do Fênix são enviados somente após ação do usuário. Use uma chave de usuário técnico com acesso mínimo aos projetos que a equipe deve consultar e faça a rotação conforme a política do Odoo.

As respostas da OpenAI só são solicitadas quando o usuário pergunta. Cada envio inclui os dados selecionados e até seis trocas recentes da conversa. O contexto de processo remove CPF, CNPJ, endereço completo e contatos; o texto digitado pelo usuário é enviado para responder à pergunta.

## Backup e restauração local

Crie um backup SQLite consistente, incluindo a chave local:

```bash
npm run data:backup -- /caminho-protegido/fenix-painel-AAAA-MM-DD
```

Guarde a pasta do backup em local protegido: ela contém o banco e a chave que descriptografa sessões e configurações OpenAI e Odoo.

Para restaurar, pare o painel e rode:

```bash
npm run data:restore -- /caminho-protegido/fenix-painel-AAAA-MM-DD --confirm-stopped --replace-existing
```

A pasta de dados atual é preservada ao lado como `data.pre-restore-<data>`. Depois, inicie o painel e confira `/api/health`, a sessão Fênix e a lista de edificações. O teste automatizado verifica backup e restauração em dados temporários, sem abrir o banco real do usuário.

Mais detalhes operacionais, critérios de release e limitações estão em [docs/OPERATIONS-LTS.md](docs/OPERATIONS-LTS.md).
