// Configuração pública da campanha. Não armazenar credenciais ou dados pessoais aqui.
// O endpoint só deve ser ativado depois de implantado com validação, proteção antiabuso,
// regras de autorização e reserva atômica no Supabase institucional.
window.CAMPANHA_CONFIG = Object.freeze({
  projectId: 'wsixoeonopxejapfxjms',
  publicEndpoint: 'https://wsixoeonopxejapfxjms.supabase.co/functions/v1/campanha-publica',
  publicEndpointEnabled: true, // lista somente perfis autorizados da API
  submissionsEnabled: true, // formulário disponível somente para perfis publicados; em homologação
  supabaseUrl: 'https://wsixoeonopxejapfxjms.supabase.co',
  supabasePublishableKey: 'sb_publishable_wXhJrU-1STQJnHEmkQLZ_g_q-Fg6WEF', // chave PUBLICÁVEL (não é segredo)
  adminEndpoint: 'https://wsixoeonopxejapfxjms.supabase.co/functions/v1/campanha-admin',
  turnstileSiteKey: '0x4AAAAAAFcQmJOTIKLHUCeB', // site key pública da Cloudflare; segredo fica no Supabase
});
