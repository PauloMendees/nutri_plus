'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { SidebarMenuButton, useSidebar } from '@/components/ui/sidebar';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { isMobile, setOpenMobile } = useSidebar();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Until mounted, render the light-mode affordance so server and first client
  // render match (the resolved theme is unknown on the server).
  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <SidebarMenuButton
      className="cursor-pointer"
      onClick={() => {
        setTheme(isDark ? 'light' : 'dark');
        if (isMobile) setOpenMobile(false);
      }}
    >
      {isDark ? <Sun /> : <Moon />}
      <span>{isDark ? 'Tema claro' : 'Tema escuro'}</span>
    </SidebarMenuButton>
  );
}
