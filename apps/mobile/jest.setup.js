// Screens use useSafeAreaInsets() (top status-bar/notch inset). RNTL renders
// screens in isolation without a <SafeAreaProvider>, where the real hook would
// throw, so mock the context to return zero insets in tests.
jest.mock('@react-native-community/datetimepicker', () => {
  const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ value, onChange, testID }) => (
      <Pressable
        testID={testID ?? 'date-time-picker'}
        accessibilityRole="button"
        accessibilityLabel="Confirmar data"
        onPress={() => onChange({ type: 'set' }, value)}
      >
        <Text>date-time-picker</Text>
      </Pressable>
    ),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  return {
    SafeAreaProvider: ({ children }) => children,
    SafeAreaConsumer: ({ children }) => children(inset),
    SafeAreaView: ({ children }) => children,
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => frame,
    SafeAreaInsetsContext: React.createContext(inset),
    initialWindowMetrics: { insets: inset, frame },
  };
});
