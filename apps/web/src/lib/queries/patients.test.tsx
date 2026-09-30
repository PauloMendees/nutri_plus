import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api/patients', () => ({ deletePatient: vi.fn().mockResolvedValue(undefined) }));

import { useDeletePatient } from './patients';

describe('useDeletePatient', () => {
  it('refreshes the agenda and the AI jobs, which lose the purged rows', async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useDeletePatient(), { wrapper });

    await act(() => result.current.mutateAsync({ id: 'p1', confirmName: 'Maria Silva' }));

    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toEqual(expect.arrayContaining([['patients'], ['appointments'], ['ai-jobs']]));
  });
});
