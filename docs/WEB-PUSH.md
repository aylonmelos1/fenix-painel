# Notificações em segundo plano

O painel usa Web Push: o servidor envia um aviso ao serviço de notificações do navegador, que acorda o service worker e mostra a notificação mesmo sem uma aba aberta. O servidor continua precisando estar ativo para sincronizar o Fênix e enviar os avisos.

## Configuração do servidor

Gere um par VAPID uma única vez:

```sh
npx web-push generate-vapid-keys
```

Configure no ambiente do servidor:

```dotenv
WEB_PUSH_VAPID_PUBLIC_KEY=<chave pública gerada>
WEB_PUSH_VAPID_PRIVATE_KEY=<chave privada gerada>
WEB_PUSH_VAPID_SUBJECT=mailto:suporte@seudominio.com.br
```

Guarde a chave privada como segredo e preserve o mesmo par em todos os deploys. Se as chaves forem trocadas, os navegadores precisam autorizar uma nova inscrição. O site deve estar publicado por HTTPS.

## Ativação no navegador

Cada usuário ativa os avisos na campainha de notificações. O navegador pede permissão e cria uma inscrição vinculada àquela conta e àquele navegador. A assinatura é armazenada criptografada no banco local do servidor. Desativar remove a inscrição desse navegador; isso não altera os demais dispositivos.

As notificações antigas não são enviadas ao ativar o recurso. Cada mudança nova é adicionada a uma fila persistente e tentada novamente em falhas temporárias. Inscrições expiradas são removidas automaticamente.
