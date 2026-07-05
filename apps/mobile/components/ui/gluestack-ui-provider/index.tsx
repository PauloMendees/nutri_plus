import React, { useEffect } from 'react';
import { config, resolveScheme } from './config';
import { View, ViewProps, useColorScheme as useDeviceColorScheme } from 'react-native';
import { OverlayProvider } from '@gluestack-ui/core/overlay/creator';
import { ToastProvider } from '@gluestack-ui/core/toast/creator';
import { useColorScheme } from 'nativewind';

export type ModeType = 'light' | 'dark' | 'system';

export function GluestackUIProvider({
  mode = 'light',
  ...props
}: {
  mode?: ModeType;
  children?: React.ReactNode;
  style?: ViewProps['style'];
}) {
  const { setColorScheme } = useColorScheme();
  const deviceScheme = useDeviceColorScheme();

  // Keep nativewind's scheme in sync (native chrome / any dark: variants), but
  // drive the applied palette from a scheme we resolve ourselves so it switches
  // deterministically instead of via the Appearance round-trip (which needs
  // userInterfaceStyle:'automatic' and doesn't reliably propagate at runtime).
  useEffect(() => {
    setColorScheme(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const scheme = resolveScheme(mode, deviceScheme);

  return (
    <View
      style={[
        config[scheme],
        { flex: 1, height: '100%', width: '100%' },
        props.style,
      ]}
    >
      <OverlayProvider>
        <ToastProvider>{props.children}</ToastProvider>
      </OverlayProvider>
    </View>
  );
}
