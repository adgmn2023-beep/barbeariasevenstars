# Seven Stars Barbershop

Sistema de agendamento para uma barbearia com **múltiplos barbeiros e agendas individuais**, em português do Brasil. Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth/Postgres/Realtime, Recharts e Web Push. Sem pagamentos online, WhatsApp automático ou publicação em lojas.

## Atualização 006: ação manual necessária

Se as migrations 001–005 já estão aplicadas, execute **somente** [`supabase/migrations/202610100006_multi_services_phone_auth.sql`](supabase/migrations/202610100006_multi_services_phone_auth.sql) no SQL Editor do mesmo projeto Supabase, uma única vez. As migrations anteriores foram preservadas. A 006 cria os snapshots de serviços, preenche o histórico existente, acrescenta as funções de telefone/rate limit e atualiza a reserva para aceitar vários serviços. Não apaga reservas nem exige recadastrar clientes.

Esta entrega contém commits locais por etapa, sem `git push` e sem aplicação remota da migration. Para disponibilizar em produção, publique esses commits/deploy quando desejar, **após aplicar a 006**, mantendo `SUPABASE_SERVICE_ROLE_KEY` somente no ambiente do servidor. Não há nova variável obrigatória.

## Fluxo do cliente

- Marque um ou mais serviços; preço e duração são somados. Todas as validações de disponibilidade usam a duração total.
- Com apenas um barbeiro ativo, ele é selecionado automaticamente. Com dois ou mais, aparece a escolha, incluindo “Sem preferência”.
- O desktop mostra o resumo lateral. No celular, a barra fixa exibe quantidade, preço e duração durante o fluxo e abre o detalhe em um painel inferior.
- Ao confirmar sem sessão, “Seus dados” pede apenas nome, telefone com DDD, senha de no mínimo 8 caracteres e consentimento. O servidor cria a conta, inicia a sessão e agenda a seleção preservada. O popup direciona a “Ver meus agendamentos”.
- Telefone já cadastrado abre o login inline com a mensagem “Esse telefone já tem conta. Entre com sua senha.”. Se o horário for ocupado durante o cadastro, a conta e a sessão permanecem; basta alterar o horário.
- Clientes entram por telefone e senha; a equipe continua com e-mail e senha. Recuperação do cliente: procurar a barbearia. Admin/master usam **Clientes → Redefinir senha**; a senha provisória aparece uma única vez e deve ser alterada no próximo acesso.

O telefone é normalizado para DDD+número e convertido internamente em `55{telefone}@clientes.sevenstars.invalid`. Esse identificador não recebe e-mails. A conta é criada no servidor por `auth.admin.createUser`, com `email_confirm: true`; isso não verifica a posse do telefone por SMS. Clientes legados com e-mail real também podem entrar pelo telefone já existente. Se houver mais de um perfil legado com o mesmo telefone, a equipe precisa corrigir essa duplicidade antes do login. Telefones de contas técnicas não podem ser alterados pelo próprio cliente.

Senhas são enviadas exclusivamente às operações do Supabase Auth; a aplicação não as persiste em tabelas, metadados, auditoria, logs, localStorage ou sessionStorage. Apenas o hash fica no Auth. `profiles.must_change_password` é uma flag booleana. A senha provisória fica somente na resposta sem cache e na memória do diálogo até ser fechado.

O limite persistente é de 5 tentativas de cadastro e 15 de login por IP a cada 15 minutos. `auth_rate_limits` guarda somente contadores e HMAC do IP, com limpeza de registros vencidos nas próximas tentativas. Em Vercel, usamos o [`x-forwarded-for` substituído pela plataforma](https://vercel.com/docs/headers/request-headers). Fora da Vercel, não confiamos em cabeçalhos enviados pelo cliente: há um limite compartilhado conservador; adapte a identificação ao proxy confiável caso hospede em outra infraestrutura. Não registre corpos de requisições de autenticação em ferramentas externas de monitoramento.

## Executar localmente

Requer Node.js 22.12+ (recomendado: Node 24 LTS) e npm. Use **npm e package-lock.json** como referência para as dependências.

```bash
npm ci
cp .env.example .env.local
npm run icons
npm run dev
```

No PowerShell, use `Copy-Item .env.example .env.local`. Preencha as variáveis antes de testar autenticação. Abra http://localhost:3000. Sem Supabase configurado, a página inicial exibe os serviços iniciais como apresentação, com reservas desativadas e aviso de configuração; não inventa disponibilidade.

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

Para testar as páginas públicas no navegador, com Chrome instalado:

```bash
npm run build
npm run test:browser
```

O Playwright inicia o build de produção na porta 3100 (`PLAYWRIGHT_PORT` permite alterar), sem reutilizar o servidor de desenvolvimento. Usa Chrome em desktop e celular e intercepta consultas públicas e APIs de cadastro/login/reserva, sem criar contas ou reservas reais. Execute com URL/chave pública Supabase no build. Cobre múltiplos serviços, duração combinada de 80 minutos, almoço/fechamento, resumo móvel, barbeiro único, cadastro inline, senha visível/oculta, seleção preservada, telefone duplicado e popup final, além de painel protegido e PWA. Os testes de regras/SQL e de handlers são independentes de contas externas; a integração final do Auth hospedado deve ser verificada após aplicar a 006.

Na verificação desta entrega, `npm audit --omit=dev` retornou zero vulnerabilidades. A auditoria completa ainda indicou cinco alertas na cadeia de desenvolvimento do ESLint (`braces`/`micromatch`/`fast-glob`/plugin Next). A correção sugerida pelo npm era fazer downgrade do eslint-config-next; não foi aplicada por incompatibilidade com a versão do framework. Reavalie as atualizações dessas ferramentas periodicamente.

## Estrutura

- `src/app`: páginas, autenticação e route handlers.
- `src/components`: fluxo de reserva, perfil, painel, gráficos e alertas.
- `src/lib`: Supabase, validação Zod, horários, status e push.
- `src/proxy.ts`: renovação de sessão e proteção de rotas; Proxy é o nome do middleware no Next.js 16.
- `supabase/migrations`: schema, RLS, funções e privilégios.
- `supabase/templates`: e-mails em português para colar no Supabase.
- `tests`: testes de disponibilidade, status, SQL e RLS.
- `public`: logo, ícones, manifest, service worker e página offline.

## 1. Criar o projeto Supabase

1. Crie um projeto no plano Free e guarde a senha do banco.
2. Em Project Settings → API, copie a URL e a chave pública `anon`. A chave `service_role` vai **somente** em `SUPABASE_SERVICE_ROLE_KEY`, no servidor. Nunca adicione prefixo `NEXT_PUBLIC_` a ela.
3. Em projeto novo, execute os arquivos de `supabase/migrations/` em ordem numérica até `202610100006_multi_services_phone_auth.sql`, uma única vez cada. Em projeto existente com 001–005 aplicadas, execute somente 006. Não edite nem reaplique migrations já aplicadas.
4. Confirme que `appointments` e `blocked_slots` estão na publicação `supabase_realtime`. A migração já as adiciona.
5. Se ainda não há master, crie a conta inicial com e-mail real em Supabase → Authentication → Users, usando somente o Auth para definir sua senha. Edite `supabase/scripts/promote_admin.sql` com esse e-mail e execute uma única vez no SQL Editor para promover a conta a `master`. Entre pela opção “Sou da equipe” e complete nome, telefone e consentimento no perfil. Em Painel interno → Configurações → Equipe, o master cria o dono como `admin`; a senha provisória aparece uma única vez e exige troca no primeiro login. Depois, admin cria contas `barber`. Cadastro público nunca cria papel de equipe.

Serviços iniciais têm **40 minutos e R$ 0,00**, conforme o pedido. Antes de divulgar o site, ajuste preços, durações, expediente, almoço e regras em `/painelinterno`. Valores anteriores permanecem nos snapshots dos agendamentos.

## 2. Configurar autenticação e e-mails

Em Authentication → URL Configuration:

- Site URL: seu domínio de produção, por exemplo `https://seven-stars.vercel.app`.
- Redirect URLs: `http://localhost:3000/auth/callback`, `https://SEU_DOMINIO/auth/callback` e os mesmos caminhos com parâmetros de retorno, conforme a configuração de padrões aceita pelo Supabase. Para desenvolvimento, pode usar `http://localhost:3000/**`; para produção, restrinja ao domínio da aplicação.

Ative Email/Password e confirmação de e-mail. Em Email Templates, substitua o HTML pelos arquivos em `supabase/templates` e os assuntos por:

- Confirm signup: **Confirme seu cadastro · Seven Stars Barbershop**.
- Reset password: **Redefina sua senha · Seven Stars Barbershop**.
- Change email address: **Confirme seu novo e-mail · Seven Stars Barbershop**.

O cadastro rápido de clientes não envia confirmação por e-mail e não usa Google. Os templates permanecem disponíveis para contas com e-mail real, especialmente recuperação da equipe. Eles usam `{{ .ConfirmationURL }}` e PKCE do Supabase SSR; abra o link no mesmo navegador que iniciou a recuperação. Configure SMTP próprio para entrega em produção. Clientes com identidade técnica recuperam o acesso pela barbearia.

## 3. Variáveis de ambiente

| Variável                        | Uso                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL do projeto Supabase                                                            |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública anon, protegida por RLS                                              |
| `SUPABASE_SERVICE_ROLE_KEY`     | Segredo do servidor para cadastro Auth, reset, rate limit, status, push e exclusão |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`  | Chave pública de Web Push                                                          |
| `VAPID_PRIVATE_KEY`             | Chave privada de Web Push, apenas servidor                                         |
| `VAPID_SUBJECT`                 | Contato real, como `mailto:contato@seudominio.com`                                 |
| `NEXT_PUBLIC_SITE_URL`          | Origem pública do aplicativo, com HTTPS em produção                                |

Não versionar `.env.local`. Variáveis `NEXT_PUBLIC_*` entram no build: alterá-las exige novo deploy.

## 4. Push e alertas do painel

Gere as chaves uma única vez:

```bash
npm run vapid
```

Configure as três variáveis VAPID no ambiente local e na Vercel. Cada usuário ativa notificações no perfil. Admin/master e barbeiros podem ativar push no perfil; novo pedido notifica o responsável e admin/master. HTTPS é obrigatório em produção; localhost funciona para desenvolvimento.

O painel exige o clique em **Ativar alertas sonoros** a cada abertura. O clique libera Web Audio e voz. A fila nativa de `speechSynthesis` evita sobreposição; IDs anunciados e lembretes ficam em `sessionStorage` para não repetir na reconexão. A voz é pt-BR quando disponível no sistema operacional. Barbeiros veem e ouvem apenas os agendamentos atribuídos à própria agenda; admin/master podem filtrar Agenda e Dashboard por barbeiro. Push de novo agendamento é enviado ao barbeiro responsável e aos admins/master.

O intervalo de lembretes é definido em um só lugar: `PENDING_REMINDER_MS` em `src/lib/notification-config.ts` (10 minutos). A checagem ocorre a cada 30 segundos, calcula os ciclos desde `created_at` e continua enquanto houver pendências. Realtime reconecta pelo SDK; polling de 30 s cobre interrupções. Wake Lock é solicitado e readquirido quando a aba volta a ficar visível, com aviso quando indisponível. Navegadores podem suspender timers e áudio em segundo plano; mantenha o painel aberto e use push como complemento.

Os handlers autenticam o administrador antes de usar service role. Falhas de push são registradas nos logs do servidor sem tokens; assinaturas com 404/410 são removidas. Quando um envio falha, o painel informa que o status foi salvo, mas o push não foi entregue. Não há fila persistente de reenvio: o status no aplicativo é a referência. O endpoint de criação notifica admins; chamadas diretas à RPC continuam seguras e aparecem no Realtime/polling, mas não acionam esse bônus de push.

## 5. PWA e identidade visual

`public/logo.png` foi fornecida e é usada no header, login e geração de ícones. Rode `npm run icons` após substituir a logo. Gera 192, 512, maskable, Apple Touch e favicon. Se a logo faltar, o gerador produz placeholder em texto; adicione a logo antes de publicar (header/login esperam o arquivo).

Inter e Oswald são carregadas via `next/font` e hospedadas pelo próprio build. O primeiro build precisa acessar Google Fonts. Manifest e service worker permitem instalação; o cache contém apenas a página offline e imagens públicas. **Nenhuma página autenticada, resposta de API ou informação pessoal é armazenada em cache pelo service worker.** Não é possível agendar offline.

- O app do cliente usa `/manifest.webmanifest`, com início e escopo em `/`.
- O painel tem manifest próprio em `/painelinterno/manifest.webmanifest`, com início e escopo em `/painelinterno`. No Android/Chrome, use **Instalar painel** dentro do painel.
- No iPhone/iPad, abra o painel no Safari e use Compartilhar → Adicionar à Tela de Início. Push no iOS requer 16.4+ e abertura pelo ícone instalado.
- O service worker em `/sw.js` tem escopo `/` e atende as duas instalações. Admins ativam push em Meu perfil; novos agendamentos abrem `/painelinterno` pela notificação.

## 6. Deploy na Vercel e GitHub

1. Envie os commits ao repositório GitHub configurado em `origin`.
2. Na Vercel, importe o repositório como Next.js. Use Node 24, instalação `npm ci` e build `npm run build`.
3. Cadastre as variáveis da tabela acima em Production; use outro projeto Supabase para previews quando possível.
4. Publique, copie o domínio HTTPS e ajuste `NEXT_PUBLIC_SITE_URL`, Site URL e Redirect URLs do Supabase. Faça novo deploy.
5. Configure domínio próprio se desejar e execute o checklist abaixo antes de divulgar.

Não há configuração de contas externas, segredos ou publicação automática embutida no código. Revise os limites e termos atuais dos planos gratuitos de Supabase, Vercel e SMTP para o seu uso comercial.

## Regras de segurança e agenda

- Horários armazenados como `timestamptz`, com `booking_date` local de `America/Sao_Paulo`. A grade usa o offset atual de Brasília (-03:00); se regras nacionais de fuso mudarem, revise a conversão no cliente.
- Criação exclusivamente pela RPC `create_appointment`, com usuário autenticado e cadastro completo; INSERT direto negado.
- Lock transacional único serializa reservas, bloqueios e mudanças de regras. Constraint de exclusão impede sobreposição de pendente, confirmado e concluído. Índice único parcial limita a um agendamento por cliente/dia nesses status.
- Pendentes seguram horário. Cancelamento com motivo de no mínimo três caracteres libera a reserva. Transições: pendente → confirmado/cancelado; confirmado → cancelado com motivo ou concluído/faltou após `end_at`.
- RLS em todas as tabelas, leitura pública sem dados pessoais apenas para serviços/configuração, barbeiros ativos e RPCs de disponibilidade. Clientes leem os próprios agendamentos/perfil; barbeiros leem e atualizam somente os próprios agendamentos e perfis dos clientes que atendem; admin/master gerenciam tudo. Barbeiro desativado perde acesso pelo Auth, painel e `current_barber_id()` mesmo com sessão antiga. O papel e a identidade não são editáveis pelo cliente.
- Papéis: `client`, `barber`, `admin` e `master`. O primeiro master é promovido uma única vez pelo script `supabase/scripts/promote_admin.sql`; o master cria o dono como admin na tela Equipe. Admin comum cria barbeiros; master cria admin ou barbeiro. Usuários da equipe recebem senha provisória e precisam trocá-la no primeiro login.
- `appointment_services` guarda nome, preço e duração de cada serviço no momento da reserva, com RLS herdada da leitura do agendamento. `appointments.price` e `duration_minutes` guardam os totais; `end_at` usa a duração somada. A RPC nova recebe `p_service_ids uuid[]`; a assinatura antiga `p_service_id uuid` continua funcionando. Alterações no catálogo não afetam o histórico. Dashboard soma os snapshots de reservas concluídas e conta cada serviço individualmente em “Serviços mais agendados”.
- Exclusão de conta é transacional no banco. Apaga usuário Auth, perfil, assinaturas e reservas não concluídas; os concluídos perdem o vínculo pessoal. A anonimização não remove backups históricos já realizados pelo provedor, sujeitos à retenção dele.

## Testes e verificação manual

`npm test` executa regras de horários/status e PostgreSQL real via PGlite com `btree_gist`. O ambiente local simula papéis e `auth.uid()` para testar SQL e RLS; ele não substitui um teste integrado no Supabase hospedado, nem um teste de concorrência com múltiplas conexões.

- [ ] Após aplicar 006, cadastro rápido com consentimento cria Auth, perfil pelo trigger, sessão e agendamento sem repetir a seleção. CPF/nascimento não são exigidos.
- [ ] Telefone duplicado abre login; entrar conclui a seleção. “Esqueci minha senha” orienta falar com a barbearia; recuperação da equipe continua por e-mail.
- [ ] Admin/master redefine senha de cliente; senha aparece uma vez, troca é obrigatória, nova senha funciona e exclusão da conta permanece disponível. Senha ausente em profiles/audit/logs.
- [ ] Um barbeiro ativo pula a escolha; dois ativos exibem escolha. Resumo lateral no desktop e barra/painel inferior no celular em todas as etapas.
- [ ] Preços/durações reais configurados; serviço de 80 min não invade almoço, fechamento, bloqueio ou outra reserva.
- [ ] Duas contas confirmam simultaneamente o mesmo horário: somente uma reserva deve ser criada.
- [ ] Segundo agendamento no mesmo dia retorna a mensagem correta; cancelado permite remarcar.
- [ ] Cliente não acessa `/painelinterno`, dados de outra pessoa, role, INSERT direto nem mudança de status via REST.
- [ ] Admin confirma/cancela com motivo e finaliza/marca falta somente após o atendimento.
- [ ] Dashboard ignora pendentes, cancelados e faltas na receita; edição de serviço não muda o passado.
- [ ] Ative alertas; faça uma reserva em outra sessão; confira som, voz, card e ações. Aguarde dez minutos e confira lembrete. Reconecte sem duplicação de anúncio.
- [ ] Desligue a conexão temporariamente; confira reconexão, indicador e polling de fallback.
- [ ] Push em dois dispositivos reais, incluindo app instalado no iPhone. Confira logs de erro e limpeza de subscription expirada.
- [ ] Instale a PWA; abra offline e confira a tela apropriada, sem dados pessoais em Cache Storage.
- [ ] Exclua uma conta de teste; confira remoção em Auth e anonimização dos concluídos.
- [ ] Revise o texto de privacidade, contato do responsável, retenção e remetente de e-mail antes da operação real.

## Referências técnicas

- [Next.js: Proxy](https://nextjs.org/docs/app/getting-started/proxy)
- [Supabase: autenticação com SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)

As etapas foram versionadas separadamente. A configuração externa e a verificação em dispositivos reais dependem do acesso do proprietário às contas e equipamentos.
