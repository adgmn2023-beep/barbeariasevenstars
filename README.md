# Seven Stars Barbershop

Sistema de agendamento para **um barbeiro e uma agenda**, em português do Brasil. Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth/Postgres/Realtime, Recharts e Web Push. Sem pagamentos online, múltiplos barbeiros, WhatsApp automático ou publicação em lojas.

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

O teste de navegador inicia o servidor de produção e cobre desktop e celular, navegação pública, proteção do painel, manifesto, ícones e tela offline. As consultas públicas ao banco são interceptadas por fixtures, sem alterar dados reais. Sem variáveis Supabase, verifica também o estado de configuração inicial e pula apenas o cenário de seleção de horário e retorno do login. Com URL/chave pública, esse cenário verifica a reserva de 80 minutos, almoço e preservação da seleção. Os testes de regras/SQL são independentes das contas externas.

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
3. Abra o SQL Editor e execute os arquivos de `supabase/migrations/` em ordem numérica, uma única vez cada. Alternativamente use a CLI Supabase autenticada: `supabase link --project-ref SEU_PROJECT_REF` e `supabase db push`.
4. Confirme que `appointments` e `blocked_slots` estão na publicação `supabase_realtime`. A migração já as adiciona.
5. Cadastre o dono pela interface e execute `supabase/scripts/promote_admin.sql`, substituindo o e-mail. Ninguém vira admin por metadados de cadastro nem pela interface.

Serviços iniciais têm **40 minutos e R$ 0,00**, conforme o pedido. Antes de divulgar o site, ajuste preços, durações, expediente, almoço e regras em `/painelinterno`. Valores anteriores permanecem nos snapshots dos agendamentos.

## 2. Configurar autenticação e e-mails

Em Authentication → URL Configuration:

- Site URL: seu domínio de produção, por exemplo `https://seven-stars.vercel.app`.
- Redirect URLs: `http://localhost:3000/auth/callback`, `https://SEU_DOMINIO/auth/callback` e os mesmos caminhos com parâmetros de retorno, conforme a configuração de padrões aceita pelo Supabase. Para desenvolvimento, pode usar `http://localhost:3000/**`; para produção, restrinja ao domínio da aplicação.

Ative Email/Password e confirmação de e-mail. Em Email Templates, substitua o HTML pelos arquivos em `supabase/templates` e os assuntos por:

- Confirm signup: **Confirme seu cadastro · Seven Stars Barbershop**.
- Reset password: **Redefina sua senha · Seven Stars Barbershop**.
- Change email address: **Confirme seu novo e-mail · Seven Stars Barbershop**.

Os templates usam `{{ .ConfirmationURL }}` e o fluxo PKCE do Supabase SSR. Abra o link no mesmo navegador que iniciou o cadastro/recuperação. O link expirado retorna ao login. Para entregar e-mails a clientes reais, configure SMTP próprio no Supabase: o remetente padrão é limitado e não deve ser tratado como serviço de produção. Escolha um provedor com cota gratuita e revise seus limites atuais.

Para Google:

1. Configure a tela de consentimento no Google Cloud e crie credenciais OAuth do tipo aplicativo Web.
2. Adicione a URL de callback mostrada pelo Supabase, normalmente `https://SEU_PROJECT_REF.supabase.co/auth/v1/callback`, aos URIs autorizados do Google.
3. Em Authentication → Providers → Google, salve client ID e client secret e habilite o provedor.
4. Adicione usuários de teste se o aplicativo Google ainda estiver em modo de teste; publique a tela de consentimento quando estiver pronto.
5. O primeiro acesso exige nome, telefone, nascimento e aceite da política antes de agendar. O Google não concede privilégios administrativos.

## 3. Variáveis de ambiente

| Variável                        | Uso                                                 |
| ------------------------------- | --------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL do projeto Supabase                             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública anon, protegida por RLS               |
| `SUPABASE_SERVICE_ROLE_KEY`     | Segredo do servidor para status, push e exclusão    |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`  | Chave pública de Web Push                           |
| `VAPID_PRIVATE_KEY`             | Chave privada de Web Push, apenas servidor          |
| `VAPID_SUBJECT`                 | Contato real, como `mailto:contato@seudominio.com`  |
| `NEXT_PUBLIC_SITE_URL`          | Origem pública do aplicativo, com HTTPS em produção |

Não versionar `.env.local`. Variáveis `NEXT_PUBLIC_*` entram no build: alterá-las exige novo deploy.

## 4. Push e alertas do painel

Gere as chaves uma única vez:

```bash
npm run vapid
```

Configure as três variáveis VAPID no ambiente local e na Vercel. Cada usuário ativa notificações no perfil. O admin usa o mesmo perfil para receber novos pedidos. HTTPS é obrigatório em produção; localhost funciona para desenvolvimento.

O painel exige o clique em **Ativar alertas sonoros** a cada abertura. O clique libera Web Audio e voz. A fila nativa de `speechSynthesis` evita sobreposição; IDs anunciados e lembretes ficam em `sessionStorage` para não repetir na reconexão. A voz é pt-BR quando disponível no sistema operacional.

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
- Pendentes seguram horário. Cancelamento com motivo de no mínimo três caracteres libera a reserva. Transições: pendente → confirmado/cancelado; confirmado → concluído/faltou apenas após `end_at`. Confirmados não podem ser cancelados, conforme a regra solicitada.
- RLS em todas as tabelas, leitura pública sem dados pessoais apenas para serviços/configuração e RPC de intervalos. Clientes leem os próprios agendamentos/perfil; role e identidade não são editáveis pelo cliente.
- Snapshot de nome, valor e duração preserva o histórico; receita soma somente concluídos.
- Exclusão de conta é transacional no banco. Apaga usuário Auth, perfil, assinaturas e reservas não concluídas; os concluídos perdem o vínculo pessoal. A anonimização não remove backups históricos já realizados pelo provedor, sujeitos à retenção dele.

## Testes e verificação manual

`npm test` executa regras de horários/status e PostgreSQL real via PGlite com `btree_gist`. O ambiente local simula papéis e `auth.uid()` para testar SQL e RLS; ele não substitui um teste integrado no Supabase hospedado, nem um teste de concorrência com múltiplas conexões.

- [ ] Cadastro com consentimento, confirmação por e-mail, login, saída, recuperação de senha e Google.
- [ ] Google sem telefone/nascimento direciona a completar cadastro e retorna à reserva.
- [ ] Reserva preservada ao ir de login para cadastro; nunca confirma automaticamente após autenticação.
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
