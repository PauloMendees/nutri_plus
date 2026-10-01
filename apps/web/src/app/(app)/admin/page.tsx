import { notFound } from 'next/navigation';
import { AdminView } from '@/components/admin/admin-view';
import { getCurrentUser } from '@/lib/auth/current-user';

// Painel oculto: nenhum link aponta para cá. Quem não é admin vê o 404 normal,
// sem pista de que a página existe; a API também responde 404 para essas rotas.
export default async function AdminPage() {
  const me = await getCurrentUser();
  if (!me?.isAdmin) notFound();
  return <AdminView />;
}
