# Campanha de Apadrinhamento — ONG

Sistema independente da campanha de apadrinhamento, hospedado pelo GitHub Pages e preparado para incorporação no Wix da ONG. **Projeto real, ainda em configuração:** não divulgar para interessados até concluir a homologação.

## Onde acessar

- [Vitrine pública](https://mateuscrlopes.github.io/apadrinhamento-ong/)
- [Área de gestão](https://mateuscrlopes.github.io/apadrinhamento-ong/admin.html)
- [Projeto Supabase institucional](https://supabase.com/dashboard/project/wsixoeonopxejapfxjms)
- [Verificações da API no GitHub Actions](https://github.com/mateuscrlopes/apadrinhamento-ong/actions)

## O que está instalado

- [x] Banco `criancas`, `solicitacoes` e `equipe_ong`, com RLS habilitado e acesso público às tabelas revogado.
- [x] Reserva atômica, evitando interesse duplicado pelo mesmo perfil.
- [x] Função `campanha-publica` publicada, com leitura de perfis autorizados e validação do Turnstile no registro de interesse.
- [x] Função `campanha-admin` publicada, com validação de JWT e lista de autorizados em `equipe_ong`.
- [x] Vitrine e formulário em `index.html`.
- [x] Painel `admin.html`: login, inclusão e alteração de perfis, consulta e confirmação/cancelamento de solicitações.
- [x] Teste automatizado de consulta pública e negação de acesso administrativo sem autenticação.
- [ ] Cadastrar primeiro usuário autorizado em Supabase Auth e autorizar seu acesso administrativo.
- [ ] Configurar Cloudflare Turnstile (chave pública no frontend e segredo exclusivamente no Supabase).
- [ ] Homologar fluxo completo pelo navegador: login, cadastro, apadrinhamento, confirmação e liberação.
- [x] Destinatário configurável e protegido no Supabase (o e-mail de teste não está no GitHub).
- [x] Fila privada por solicitação e integração da função pública com o serviço de envio Resend.
- [ ] Validar o primeiro e-mail usando o botão **Enviar e-mail de teste** no painel da ONG. O segredo `RESEND_API_KEY` é configurado pelo usuário diretamente no Supabase e não pode ser lido pelo código público.
- [ ] Configurar remetente em domínio verificado, tratar retenção de dados e escolher o destinatário oficial da ONG.
- [ ] Testar falhas, reenvio de notificações pendentes e relatórios no painel antes da abertura pública.
- [x] Implantar envio de fotos diretamente pelo painel para um bucket PRIVADO no Supabase, com validação de tipo e limite de 4 MB.
- [ ] Testar upload real com a conta administrativa e verificar exibição privada/publicação autorizada.
- [ ] Aprovar aviso de privacidade, dados e fotografias; inserir somente perfis reais autorizados.
- [ ] Incorporar a vitrine ao Wix e testar dispositivos móveis.

## Como cadastrar o primeiro administrador

A autorização para acessar o dashboard precisa existir em **duas camadas**: usuário em Supabase Auth e vínculo ativo na tabela `equipe_ong`.

1. Entre no [Supabase institucional](https://supabase.com/dashboard/project/wsixoeonopxejapfxjms).
2. Em **Authentication → Users**, use **Add user / Invite user** para cadastrar o e-mail institucional autorizado. Não crie contas com senhas compartilhadas.
3. Após o usuário aparecer em Authentication, abra **SQL Editor** neste MESMO projeto e execute o SQL abaixo, substituindo o endereço pelo e-mail cadastrado:

```sql
insert into public.equipe_ong (usuario_id, papel, ativo)
select id, 'administrador', true
from auth.users
where lower(email) = lower('EMAIL_DA_PESSOA_AUTORIZADA@ONG.ORG')
on conflict (usuario_id) do update
  set papel = excluded.papel, ativo = true;
```

4. No SQL Editor, confirme o registro com:

```sql
select e.usuario_id, e.papel, e.ativo
from public.equipe_ong e;
```

5. A pessoa já convidada pode abrir o [painel administrativo](https://mateuscrlopes.github.io/apadrinhamento-ong/admin.html) e entrar com e-mail e senha do Supabase Auth.
6. **Importante:** acesso de administrador autoriza cadastrar perfis com dados sensíveis. A ONG deve revisar quem possui essa autorização.

## Ativar o apadrinhamento público

A vitrine consulta a API e exibe apenas `ativo=true` e `publicacao_autorizada=true`. O recebimento de solicitações está intencionalmente **desligado** em `js/config.js` (`submissionsEnabled:false`).

Antes de ligar:

1. Criar o widget Cloudflare Turnstile para `mateuscrlopes.github.io` (action `apadrinhar`).
2. Configurar o **secret** `CLOUDFLARE_TURNSTILE_SECRET_KEY` em Supabase → Edge Functions → Secrets. Jamais incluí-lo no GitHub.
3. Preencher `turnstileSiteKey` com **chave pública** no `js/config.js`.
4. Testar que uma solicitação é criada e bloqueia o perfil, e que a segunda falha (HTTP 409), além dos casos de erro de captcha.
5. Só depois definir `submissionsEnabled:true` em `js/config.js`.

## Estrutura

- `index.html`: vitrine.
- `admin.html`: gestão protegida.
- `js/config.js`: configuração **pública**.
- `database/instalacao.sql`: estrutura inicial (já executada neste projeto; não reexecutar em outros bancos).
- `database/fotos-privadas.sql`: migração do armazenamento privado (já aplicada; validação de caminho corrigida em migração adicional).
- `database/notificacoes-email.sql`: fila e configuração privada de notificações.
- `supabase/functions/campanha-publica/index.ts`: API pública, Turnstile e reserva atômica.
- `supabase/functions/campanha-admin/index.ts`: API protegida para gestão.
- `supabase/config.toml`: declara verificação de JWT feita no próprio serviço.
- `.github/workflows/verificar-api.yml`: testes de consulta pública e bloqueio de acesso administrativo.

## Segurança e privacidade

- O GitHub é **público**. Não gravar dados pessoais, senhas, tokens ou chaves privilegiadas nele.
- A chave de API **publicável** do Supabase no frontend não é segredo; segurança depende das regras RLS e das checagens de autorização no servidor.
- A lista de interessados, seus contatos e os perfis não publicados não são acessíveis sem login de membro da equipe.
- As fotos ficam no bucket privado `fotos-criancas-ame`; somente perfis publicados recebem URLs assinadas válidas por dez minutos.
- Perfis em teste devem permanecer com `publicacao_autorizada=false` até a revisão e autorização da ONG.
- Não incluir sobrenomes completos, endereços, instituições de ensino ou fotografias sem autorização apropriada.
- A ONG precisa definir aviso de privacidade, conservação e exclusão de dados e colaboradores com acesso.

## Testar o envio sem cadastrar um apadrinhamento

1. Entre no [painel administrativo](https://mateuscrlopes.github.io/apadrinhamento-ong/admin.html).
2. Clique em **Enviar e-mail de teste** (somente administradores).
3. O servidor verifica o papel administrativo, consulta o endereço na tabela privada e chama o Resend. A função responde apenas se o Resend aceitou o envio; **entrega na caixa postal deve ser confirmada pelo destinatário**.
4. Só é permitida uma tentativa a cada dois minutos; essa limitação é registrada no banco e não no navegador.
5. O teste não cria crianças, não publica perfis e não registra apadrinhamentos.

## E-mail de notificação (em preparação)

O endereço de destino foi salvo diretamente na tabela privada `public.configuracoes_email`, na linha de `id=1`. **Não divulgar esse endereço no GitHub.** Para trocá-lo na fase de operação, editar o campo `destinatario` no SQL Editor do projeto institucional, com autorização da ONG.

Toda nova solicitação cria automaticamente uma linha na tabela privada `public.notificacoes_email`. A função `campanha-publica` só tenta entregar quando houver uma chave `RESEND_API_KEY` configurada nas Edge Function Secrets. Sem chave, o aviso fica `pendente`; falha de envio não cancela a reserva.

Configuração para o primeiro teste:

1. Criar uma conta em https://resend.com com o mesmo endereço de e-mail usado como destinatário de teste.
2. Criar chave em https://resend.com/api-keys com permissão de envio.
3. No [Supabase institucional](https://supabase.com/dashboard/project/wsixoeonopxejapfxjms/settings/functions), salvar `RESEND_API_KEY` em **Edge Functions → Secrets**. **Não enviar a chave pelo chat ou GitHub.**
4. Para o ambiente de testes, o remetente padrão é `Campanha de Apadrinhamento <onboarding@resend.dev>`. Ele só entrega para o e-mail que é proprietário da conta Resend. Se for necessário enviar para outro endereço, é obrigatório verificar um domínio no Resend.
5. Depois de testar o recebimento, configurar `RESEND_FROM_EMAIL` com endereço de domínio de remetente verificado e trocar o destinatário pelo endereço oficial da ONG.
6. Não ativar o envio de dados de menores reais antes de aprovação da ONG e do aviso de privacidade. O e-mail deve ser acessado apenas por colaborador autorizado.

**Importante:** a solicitação de apadrinhamento é salva mesmo que o serviço de e-mail falhe. A situação do envio fica registrada em `notificacoes_email`. O reenvio manual de pendências ainda precisa ser implementado/homologado.
