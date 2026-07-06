import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

const mockApiFetch = jest.fn();
jest.mock('../api', () => ({ apiFetch: (...args: unknown[]) => mockApiFetch(...args) }));

import { useMyNutritionist } from './nutritionist';

beforeEach(() => {
  mockApiFetch.mockReset();
});

function Probe() {
  const query = useMyNutritionist();
  if (!query.isSuccess) return <Text>loading</Text>;
  return <Text>{query.data ? `name:${query.data.name}` : 'none'}</Text>;
}

async function renderProbe() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return await render(<Probe />, { wrapper });
}

describe('useMyNutritionist', () => {
  it('GETs /me/nutritionist and exposes the contact', async () => {
    mockApiFetch.mockResolvedValue({
      name: 'Beatriz',
      displayName: 'Dra. Bia',
      email: 'bia@x.com',
      crn: 'CRN-123',
      logoUrl: null,
    });
    await renderProbe();
    expect(await screen.findByText('name:Beatriz')).toBeTruthy();
    expect(mockApiFetch).toHaveBeenCalledWith('/me/nutritionist');
  });

  it('handles a null contact (no nutritionist)', async () => {
    mockApiFetch.mockResolvedValue(null);
    await renderProbe();
    expect(await screen.findByText('none')).toBeTruthy();
  });
});
