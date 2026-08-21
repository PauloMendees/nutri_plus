import { useEffect, useState, type ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Android keyboard height; 0 on iOS (KeyboardAvoidingView handles that). */
function useAndroidKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setInset(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setInset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return inset;
}

type ScreenProps = {
  children: ReactNode;
  /**
   * Optional fixed bar rendered at the top (within the safe-area top inset),
   * above the scroll area — e.g. the brand header. Content scrolls beneath it.
   */
  header?: ReactNode;
  /**
   * Classes for the scroll content container. Default `grow` lets short
   * content fill the viewport (so `justify-center` works) while taller
   * content — or content pushed up by the keyboard — scrolls.
   */
  contentContainerClassName?: string;
  /** Pull-to-refresh. When omitted, the scroll view has no refresh control. */
  onRefresh?: () => void | Promise<unknown>;
  refreshing?: boolean;
};

/**
 * App-wide screen wrapper. Keeps a focused input visible above the keyboard
 * instead of letting the keyboard cover it.
 *
 * Uses only built-in RN primitives so it works in Expo Go (no native module
 * like react-native-keyboard-controller, which would require a dev build):
 *  - iOS: KeyboardAvoidingView `padding` lifts the content over the keyboard.
 *    No `keyboardVerticalOffset` — every screen hides its navigation header.
 *  - Android: Expo 54 edge-to-edge means `adjustResize` no longer shrinks the
 *    window, and KeyboardAvoidingView padding is unreliable there. We pad the
 *    screen by the keyboard height from Keyboard events instead.
 */
export function Screen({
  children,
  header,
  contentContainerClassName = 'grow',
  onRefresh,
  refreshing: refreshingProp,
}: ScreenProps) {
  // Screens hide their navigation header (headerShown: false), so without this
  // the top content would sit under the status bar / iOS notch / Dynamic
  // Island. Pad the container by the top inset; the tab bar handles the bottom.
  const insets = useSafeAreaInsets();
  const androidKeyboard = useAndroidKeyboardInset();
  const [internalRefreshing, setInternalRefreshing] = useState(false);
  const refreshing = refreshingProp ?? internalRefreshing;

  async function handleRefresh() {
    if (!onRefresh) return;
    if (refreshingProp === undefined) setInternalRefreshing(true);
    try {
      await onRefresh();
    } finally {
      if (refreshingProp === undefined) setInternalRefreshing(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {header}
      <View testID="screen-keyboard-avoid" style={{ flex: 1, paddingBottom: androidKeyboard }}>
        <ScrollView
          testID="screen-scroll"
          className="flex-1"
          contentContainerClassName={contentContainerClassName}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void handleRefresh()}
                tintColor="#14bfa6"
                colors={['#14bfa6']}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
