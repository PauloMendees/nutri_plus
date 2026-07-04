import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

const mockApiFetch = jest.fn();
jest.mock('../api', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const mockGetSession = jest.fn();
jest.mock('../supabase', () => ({ supabase: { auth: { getSession: () => mockGetSession() } } }));

const mockDownloadAsync = jest.fn();
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/', downloadAsync: (...a: unknown[]) => mockDownloadAsync(...a) }));
const mockIsAvailable = jest.fn();
const mockShareAsync = jest.fn();
jest.mock('expo-sharing', () => ({ isAvailableAsync: () => mockIsAvailable(), shareAsync: (...a: unknown[]) => mockShareAsync(...a) }));

import { useMyMealPlans, downloadMealPlanPdf } from './meal-plans';

beforeEach(() => {
  mockApiFetch.mockReset().mockResolvedValue([{ id: 'm1', title: 'Plano A' }]);
  mockGetSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  mockDownloadAsync.mockReset().mockResolvedValue({ uri: 'file:///cache/plano-alimentar.pdf' });
  mockIsAvailable.mockReset().mockResolvedValue(true);
  mockShareAsync.mockReset().mockResolvedValue(undefined);
});

function Probe() {
  const q = useMyMealPlans();
  return <Text>{q.isSuccess ? `n:${q.data.length}` : 'loading'}</Text>;
}

describe('meal-plans data layer', () => {
  it('useMyMealPlans loads /me/meal-plans', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    await render(<Probe />, { wrapper });
    expect(await screen.findByText('n:1')).toBeTruthy();
    expect(mockApiFetch).toHaveBeenCalledWith('/me/meal-plans');
  });

  it('downloadMealPlanPdf downloads with the bearer token then shares', async () => {
    await downloadMealPlanPdf('m1');
    expect(mockDownloadAsync).toHaveBeenCalledWith(
      expect.stringContaining('/v1/me/meal-plans/m1/pdf'),
      'file:///cache/plano-alimentar.pdf',
      { headers: { Authorization: 'Bearer tok' } },
    );
    expect(mockShareAsync).toHaveBeenCalledWith(
      'file:///cache/plano-alimentar.pdf',
      expect.objectContaining({ mimeType: 'application/pdf' }),
    );
  });
});
