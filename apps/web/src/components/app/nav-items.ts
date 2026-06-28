import { Users, Briefcase, Calendar, Settings, type LucideIcon } from 'lucide-react';
import { UserRole } from '@nutri-plus/shared-types';
import { canManageEmployees, canManageSettings } from '@/lib/auth/access';

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
};

export const NAV_ITEMS: NavItem[] = [
  { label: 'Pacientes', href: '/patients', icon: Users },
  { label: 'Funcionários', href: '/employees', icon: Briefcase, canAccess: canManageEmployees },
  {
    label: 'Agenda',
    href: '/agenda',
    icon: Calendar,
    children: [
      { label: 'Agenda', href: '/agenda' },
      { label: 'Categorias', href: '/agenda/categorias' },
    ],
  },
  { label: 'Configurações', href: '/configuracoes', icon: Settings, canAccess: canManageSettings },
];
