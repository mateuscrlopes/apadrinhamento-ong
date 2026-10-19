# Campanha de Apadrinhamento — ONG

Sistema de apadrinhamento desenvolvido para uso real pela ONG. A vitrine ficará hospedada no GitHub Pages e incorporada à página institucional no Wix. Os registros e operações de apadrinhamento serão gerenciados pelo Supabase da ONG.

## Situação atual

- Página pública definitiva implementada em `index.html`, com visual responsivo, filtros e formulário de interesse.
- A interface **não exibe perfis fictícios**. Os cartões serão alimentados exclusivamente por dados reais publicados de forma autorizada.
- Integração com o Supabase da ONG **pendente de habilitação e teste do servidor**; a página apresenta um estado de preparação e não aceita pedidos até a integração estar segura.
- Projeto Supabase informado: `wsixoeonopxejapfxjms`, pertencente à conta institucional da ONG; a conexão atual do ChatGPT ainda não tem permissão.
- A configuração da função pública fica em `js/config.js`; `publicEndpointEnabled` só deve passar para `true` **depois** de implantar e testar o servidor.
- Endereço do GitHub Pages: https://mateuscrlopes.github.io/apadrinhamento-ong/

## Contrato de integração esperado

`GET /functions/v1/campanha-publica` retorna `{ "perfis": [...] }`, com campos públicos estritamente necessários: `id`, `codigo`, `nome_exibicao`, `idade`, `tamanho_roupa`, `tamanho_calcado`, `foto_url` e `situacao` (`disponivel`, `em_contato`, `confirmado`). Dados pessoais privados nunca devem integrar essa resposta.

`POST /functions/v1/campanha-publica` recebe `{ "acao": "solicitar", "crianca_id": "...", "nome": "...", "telefone": "...", "email": "...", "autorizou_contato": true }` e responde `{ "sucesso": true }` **somente após** persistência segura e reserva atômica. Implementar validação, política de retenção, proteção antirrobô e limitação de tentativas antes de ativar.

## Próximas etapas

1. Autorizar a conexão do projeto corporativo do Supabase para implantação.
2. Definir o banco de perfis e solicitações, RLS, papéis administrativos e fotos autorizadas.
3. Criar função de reserva atômica e proteção antiabuso; testar concorrência entre duas solicitações.
4. Criar painel administrativo protegido, confirmação/liberação de reservas e histórico.
5. Validar privacidade (inclusive consentimentos), acessibilidade, notificações e uso em celular.
6. Ativar a API e homologar no endereço GitHub Pages, depois incorporar no Wix.

## Segurança

- Repositório público: **nunca** incluir senhas, tokens privilegiados, chaves secretas ou dados pessoais de padrinhos.
- Chaves publicáveis, caso usadas no navegador, exigem permissões adequadas no banco. Chaves secretas permanecem no servidor.
- A ONG deve validar expressamente autorização para publicação de imagens e informações de menores, além do aviso de privacidade.
- Não ativar solicitações sem proteção contra acesso indevido, fraude e duplo apadrinhamento.
