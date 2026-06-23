import { Users, Briefcase, Calendar, type LucideIcon } from 'lucide-react';

export type NavChild = {
  label: string;
  href: string;
};

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  children?: NavChild[];
};

export const NAV_ITEMS: NavItem[] = [
  { label: 'Pacientes', href: '/patients', icon: Users },
  { label: 'Funcionários', href: '/employees', icon: Briefcase },
  {
    label: 'Agenda',
    href: '/agenda',
    icon: Calendar,
    children: [
      { label: 'Agenda', href: '/agenda' },
      { label: 'Categorias', href: '/agenda/categorias' },
    ],
  },
];
