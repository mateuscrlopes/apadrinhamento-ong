# Campanha de Apadrinhamento — ONG

Vitrine pública independente, destinada a ser incorporada ao site institucional da ONG no Wix.

## Situação atual

- **Prévia visual criada** em `index.html`, com seis perfis completamente fictícios.
- Filtros e indicadores funcionam localmente.
- Formulário de interesse **desativado**: nenhum dado é coletado ou enviado.
- **Supabase ainda não conectado.** Não publicar perfis reais nem divulgar para apadrinhamentos antes da homologação.
- GitHub Pages configurado no repositório; endereço esperado: https://mateuscrlopes.github.io/apadrinhamento-ong/

## Próximas etapas

1. Conectar o projeto Supabase pertencente à ONG.
2. Criar tabelas de perfis e solicitações, autenticação administrativa, permissões RLS e armazenamento autorizado de imagens.
3. Implementar reserva atômica no servidor para impedir solicitações concorrentes do mesmo perfil; proteção antiabuso.
4. Integrar a vitrine ao banco e ativar o formulário apenas após testes.
5. Criar a página administrativa, restrita à equipe, para cadastrar perfis, acompanhar solicitações e confirmar/liberar reservas.
6. Validar autorização de imagem, aviso de privacidade, acessibilidade, comunicação por e-mail e visual no celular.
7. Incorporar a URL HTTPS da vitrine na página Wix da campanha e homologar no site publicado.

## Segurança

- O código deste repositório é **público**. Nunca armazenar senhas, chave secreta/service-role, tokens ou dados pessoais.
- No frontend usar somente a chave publicável do Supabase, com RLS e funções servidoras de acesso mínimo.
- Informações dos padrinhos devem permanecer privadas e acessíveis apenas a pessoas autorizadas da ONG.
- Somente divulgar informações e fotos de menores mediante as autorizações adequadas e revisão da ONG.
