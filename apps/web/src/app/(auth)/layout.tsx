import { AuthLayout } from '@/components/auth/auth-layout';

/**
 * SEM MetaPixel aqui de propósito.
 *
 * Este grupo mistura funil de aquisição (`/signup`, `/verify-email`) com rotas
 * que o PACIENTE percorre: `/accept-invite` (destino do convite disparado por
 * PatientsService.createPatient), `/download-app` (para onde `(app)` redireciona
 * todo PATIENT), `/login` e `/reset-password`.
 *
 * Com o pixel no layout, todo paciente convidado gerava PageView e recebia o
 * cookie `_fbp` — contaminando retargeting e lookalike com gente que nunca vai
 * comprar software para nutricionista. O pixel agora entra por página, só onde
 * exclusivamente nutricionista chega.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AuthLayout>{children}</AuthLayout>;
}
