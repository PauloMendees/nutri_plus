import {
  Users,
  Apple,
  Briefcase,
  Calendar,
  Settings,
  Landmark,
  GraduationCap,
  type LucideIcon,
} from 'lucide-react';
import { UserRole } from '@nutri-plus/shared-types';
import { canManageEmployees, canManageSettings, canBrowseFoods } from '@/lib/auth/access';

export type NavChild = {
  label: string;
  href: string;
};

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  children?: NavChild[];
  canAccess?: (role: UserRole) => boolean;
  /**
   * Pré-carrega a rota quando o link aparece na tela. Desligado por padrão:
   * a barra lateral inteira fica visível em toda página, e pré-carregar ~13
   * rotas dinâmicas a cada carga disparava 503 intermitentes (cold start).
   */
  prefetch?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { label: 'Pacientes', href: '/patients', icon: Users, prefetch: true },
  { label: 'Alimentos', href: '/alimentos', icon: Apple, canAccess: canBrowseFoods },
  {
    label: 'Agenda',
    href: '/agenda',
    icon: Calendar,
    children: [
      { label: 'Agenda', href: '/agenda' },
      { label: 'Categorias', href: '/agenda/categorias' },
    ],
  },
  { label: 'Funcionários', href: '/employees', icon: Briefcase, canAccess: canManageEmployees },
  {
    label: 'Contabilidade',
    href: '/contabilidade',
    icon: Landmark,
    children: [
      { label: 'Extrato', href: '/contabilidade' },
      { label: 'Categorias', href: '/contabilidade/categorias' },
    ],
  },
  { label: 'Tutoriais', href: '/primeiros-passos', icon: GraduationCap },
  { label: 'Configurações', href: '/configuracoes', icon: Settings, canAccess: canManageSettings },
];
