import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

const mockApiFetch = jest.fn();
jest.mock('../api', () => ({ apiFetch: (...args: unknown[]) => mockApiFetch(...args) }));

import { getMyEvolution, useMyEvolution } from './assessments';

const envelope = { name: 'Ana', height: 170, assessments: [] };

beforeEach(() => {
  mockApiFetch.mockReset().mockResolvedValue(envelope);
});

describe('getMyEvolution', () => {
  it('GETs /me/assessments and returns the envelope', async () => {
    const result = await getMyEvolution();
    expect(mockApiFetch).toHaveBeenCalledWith('/me/assessments');
    expect(result).toEqual(envelope);
  });
});

// Exercise the hook through a probe component rendered with a QueryClient
// configured so no gc timer lingers (which would keep jest from exiting).
function Probe() {
  const query = useMyEvolution();
  return <Text>{query.isSuccess ? `name:${query.data.name}` : 'loading'}</Text>;
}

describe('useMyEvolution', () => {
  it('loads the evolution via the [me, assessments] key', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    await render(<Probe />, { wrapper });

    expect(await screen.findByText('name:Ana')).toBeTruthy();
    expect(mockApiFetch).toHaveBeenCalledWith('/me/assessments');
  });
});
