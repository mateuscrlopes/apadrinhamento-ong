# Campanha de Apadrinhamento — ONG

Sistema real de apadrinhamento que será incorporado ao site Wix da ONG, com vitrine independente no GitHub Pages e banco Supabase institucional.

**Situação: EM IMPLANTAÇÃO — não receber dados reais até a homologação.**
A página pública não apresenta perfis fictícios; os cadastros de menores precisam de autorização para publicação.

## Endereços

- Código: https://github.com/mateuscrlopes/apadrinhamento-ong
- Vitrine (GitHub Pages): https://mateuscrlopes.github.io/apadrinhamento-ong/
- Projeto Supabase da ONG: `wsixoeonopxejapfxjms` (usar o projeto corporativo, nunca LifeOS/Nordestrip).

## Arquivos

- `index.html`: interface pública responsiva, filtros, estatísticas e formulário protegido com Turnstile.
- `js/config.js`: endereço da API, controle da ativação e chave pública Turnstile.
- `database/instalacao.sql`: tabelas, RLS, revogação de acesso público e rotinas atômicas de reserva/confirmação/cancelamento.
- `supabase/functions/campanha-publica/index.ts`: consulta apenas perfis publicados e recebe solicitações verificadas.
- `supabase/config.toml`: configura que a função pública não exige JWT de visitante (proteção é realizada por validação + Turnstile no servidor).

## Plano de implantação (não executado ainda)

1. Obter permissão para gerenciar o projeto Supabase corporativo neste ChatGPT.
2. **Revisar e executar** `database/instalacao.sql` no SQL Editor do projeto correto.
3. Criar widget gratuito Cloudflare Turnstile com hostname `mateuscrlopes.github.io`.
4. Em Supabase > Edge Functions > Secrets, configurar `CLOUDFLARE_TURNSTILE_SECRET_KEY` com a **chave secreta** Turnstile, exclusivamente no servidor. Nunca gravá-la no GitHub.
5. Publicar `campanha-publica` no Supabase com `verify_jwt = false`. Essa função atende visitantes sem autenticação, mas exige a validação Turnstile no POST.
6. Em `js/config.js`, preencher `turnstileSiteKey` com **chave pública** do Turnstile; somente após homologar o backend alterar `publicEndpointEnabled: true`.
7. Confirmar que GET retorna somente perfis ativos com publicação autorizada e não revela nome/telefone/e-mail dos padrinhos.
8. Testar reservas simultâneas, formulários inválidos, bloqueio de envios automatizados, consentimento e tratamento de erros.
9. Implementar e homologar o **painel administrativo privado** e acesso da equipe; não inserir dados reais antes dele estar pronto.
10. Obter as autorizações e revisar aviso de privacidade, fotos, retenção de contatos e responsividade antes de incorporar no Wix.

## Contrato da função

GET `/functions/v1/campanha-publica` → `{"perfis":[{"id":"UUID","codigo":"P001","nome_exibicao":"...","idade":7,"tamanho_roupa":"8","tamanho_calcado":"29","foto_url":null,"situacao":"disponivel"}]}`.
Exibe somente perfis autorizados pela ONG.

POST `/functions/v1/campanha-publica` →
`{"acao":"solicitar","crianca_id":"UUID","nome":"...","telefone":"...","email":"...","autorizou_contato":true,"turnstile_token":"...","website":""}`
→ `{"sucesso":true}` apenas quando o interesse for registrado de maneira atômica.

## Regras de segurança

- Código público: nenhuma chave secreta, senha, token de administração ou dado pessoal neste repositório.
- O banco não concede acesso direto a tabelas a visitantes; RLS habilitado.
- Funções SQL privilegiadas possuem `search_path = ''` e execução permitida apenas ao `service_role`.
- As rotinas de gravação dependem de validação de dados + Turnstile no servidor; a API ainda está desligada no cliente.
- Adicionar proteção contra abuso/limites de requisições se o volume de campanha exigir.
- A ONG deve aprovar divulgação de imagens e informações dos menores e definir um aviso de privacidade válido.

## Monitoramento futuro

Configurar monitoramento depois dos testes. Não prometer que consultas agendadas impeçam qualquer pausa do plano gratuito.
