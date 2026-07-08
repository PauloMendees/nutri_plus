import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
};

/**
 * App-wide screen wrapper. Keeps a focused input visible above the keyboard
 * instead of letting the keyboard cover it.
 *
 * Uses only built-in RN primitives so it works in Expo Go (no native module
 * like react-native-keyboard-controller, which would require a dev build):
 *  - iOS: KeyboardAvoidingView `padding` lifts the content over the keyboard.
 *    No `keyboardVerticalOffset` is needed because every screen hides its
 *    navigation header (headerShown: false).
 *  - Android: the app's default soft-input mode is `adjustResize`, which
 *    already shrinks the window, so the ScrollView reveals the focused input —
 *    KeyboardAvoidingView would double-adjust, so it stays inert there.
 */
export function Screen({ children, header, contentContainerClassName = 'grow' }: ScreenProps) {
  // Screens hide their navigation header (headerShown: false), so without this
  // the top content would sit under the status bar / iOS notch / Dynamic
  // Island. Pad the container by the top inset; the tab bar handles the bottom.
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {header}
      <ScrollView
        className="flex-1"
        contentContainerClassName={contentContainerClassName}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
