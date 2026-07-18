import { Users, Apple, Briefcase, Calendar, Settings, Landmark, type LucideIcon } from 'lucide-react';
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
  { label: 'Alimentos', href: '/alimentos', icon: Apple },
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
  { label: 'Configurações', href: '/configuracoes', icon: Settings, canAccess: canManageSettings },
];
