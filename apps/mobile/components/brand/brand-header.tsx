import { View } from 'react-native';
import { useTheme } from '../../lib/theme';
import { LogoHorizontal } from './logo-horizontal';

// Thin, fixed brand bar for the main tab screens. On the near-black app
// background the mark uses the 'dark' tone (teal + light wordmark); on the
// light theme it uses the full-color 'color' tone.
export function BrandHeader() {
  const { scheme } = useTheme();
  return (
    <View className="items-center border-b border-border bg-background py-3">
      <LogoHorizontal height={20} tone={scheme === 'light' ? 'color' : 'dark'} />
    </View>
  );
}
