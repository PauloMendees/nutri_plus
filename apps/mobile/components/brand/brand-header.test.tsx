import { render, screen } from '@testing-library/react-native';

let mockScheme: 'light' | 'dark' = 'dark';
jest.mock('../../lib/theme', () => ({ useTheme: () => ({ scheme: mockScheme }) }));

// Must be `mock`-prefixed to be referenced inside a jest.mock factory.
let mockTone: string | undefined;
jest.mock('./logo-horizontal', () => ({
  LogoHorizontal: (props: { tone?: string }) => {
    mockTone = props.tone;
    return null;
  },
}));

import { BrandHeader } from './brand-header';

beforeEach(() => {
  mockTone = undefined;
});

describe('BrandHeader', () => {
  it("uses the 'dark' tone on the dark scheme", async () => {
    mockScheme = 'dark';
    await render(<BrandHeader />);
    expect(mockTone).toBe('dark');
  });

  it("uses the 'color' tone on the light scheme", async () => {
    mockScheme = 'light';
    await render(<BrandHeader />);
    expect(mockTone).toBe('color');
  });
});
