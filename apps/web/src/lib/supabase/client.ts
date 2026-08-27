import { createBrowserClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

function env() {
  return [
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ] as const;
}

/**
 * Client padrão do browser: sessão em cookies, legível pelo servidor.
 * Usa flowType 'pkce' (forçado pelo @supabase/ssr) — o que é correto para
 * login e reset de senha, onde o fluxo começa e termina no mesmo navegador.
 */
export function createClient() {
  return createBrowserClient(...env());
}

/**
 * Client exclusivo do CADASTRO, com flowType 'implicit'.
 *
 * O link de confirmação é aberto num navegador imprevisível: a maior parte dos
 * leads chega pelo Instagram, cadastra na webview do app e clica no link no
 * Chrome — cookie jars diferentes.
 *
 * Com 'pkce', o signUp registra um code_challenge e o Supabase emite um token
 * prefixado `pkce_`, que só pode ser trocado com o code_verifier guardado no
 * navegador de origem. Verificado: enviar esse token ao /verify sem o verifier
 * devolve 403 otp_expired. Com 'implicit' o signUp não manda challenge (ver o
 * gate `if (this.flowType === 'pkce')` no signUp do auth-js), o token sai sem
 * prefixo e o /auth/callback o verifica via verifyOtp sem estado nenhum.
 *
 * NÃO trocar por createBrowserClient: ele sobrescreve flowType para 'pkce'
 * depois de espalhar as opções, então `auth: { flowType }` é ignorado em
 * silêncio. Coberto por client.test.ts.
 *
 * Inerte de propósito (persistSession/detectSessionInUrl desligados): o cadastro
 * não emite sessão — a confirmação de e-mail é obrigatória — e este client não
 * deve competir com os cookies do client padrão.
 */
export function createSignupClient() {
  const [url, key] = env();
  return createSupabaseClient(url, key, {
    auth: {
      flowType: 'implicit',
      persistSession: false,
      detectSessionInUrl: false,
      autoRefreshToken: false,
    },
  });
}
