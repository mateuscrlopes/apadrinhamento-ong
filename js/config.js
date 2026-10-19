// Configuração pública da campanha. Não armazenar credenciais ou dados pessoais aqui.
// O endpoint só deve ser ativado depois de implantado com validação, proteção antiabuso,
// regras de autorização e reserva atômica no Supabase institucional.
window.CAMPANHA_CONFIG = Object.freeze({
  projectId: 'wsixoeonopxejapfxjms',
  publicEndpoint: 'https://wsixoeonopxejapfxjms.supabase.co/functions/v1/campanha-publica',
  publicEndpointEnabled: false, // só habilitar após instalar e homologar a API
  turnstileSiteKey: null, // site key pública da Cloudflare; segredo fica no Supabase
});
