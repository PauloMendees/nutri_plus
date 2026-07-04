import { render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Text, Pressable } from 'react-native';

const mockApiFetch = jest.fn();
jest.mock('../api', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

import { useOutsideHome } from './outside-home';

beforeEach(() => mockApiFetch.mockReset().mockResolvedValue({ suggestion: 'Peça grelhado.' }));

function Probe() {
  const m = useOutsideHome();
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => m.mutate({ message: 'hamburgueria' })}>
        <Text>go</Text>
      </Pressable>
      <Text>{m.data?.suggestion ?? '-'}</Text>
    </>
  );
}

describe('useOutsideHome', () => {
  it('POSTs /me/outside-home and returns the suggestion', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    await render(<Probe />, { wrapper });
    await fireEvent.press(screen.getByRole('button', { name: 'go' }));
    expect(await screen.findByText('Peça grelhado.')).toBeTruthy();
    expect(mockApiFetch).toHaveBeenCalledWith('/me/outside-home', { method: 'POST', body: { message: 'hamburgueria' } });
  });
});
