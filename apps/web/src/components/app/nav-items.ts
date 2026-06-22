import { Users, Briefcase, Calendar, type LucideIcon } from 'lucide-react';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { label: 'Pacientes', href: '/patients', icon: Users },
  { label: 'Funcionários', href: '/employees', icon: Briefcase },
  { label: 'Agenda', href: '/agenda', icon: Calendar },
];
