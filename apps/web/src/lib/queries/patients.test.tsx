import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getPatient = vi.fn();
vi.mock('@/lib/api/patients', () => ({
  deletePatient: vi.fn().mockResolvedValue(undefined),
  getPatient: (id: string) => getPatient(id),
}));

import { useDeletePatient, usePatient } from './patients';

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

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('usePatient', () => {
  // Paciente excluído (ou de outra nutricionista) responde 404: repetir a busca
  // só deixava a ficha ~10s num esqueleto antes de "não encontrado".
  it('does not retry a 404', async () => {
    getPatient.mockReset().mockRejectedValue(new ApiError(404, {}));
    const { result } = renderHook(() => usePatient('gone'), { wrapper: wrapperFor(new QueryClient()) });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getPatient).toHaveBeenCalledTimes(1);
  });
});

describe('useDeletePatient cache', () => {
  // A ficha ainda está montada quando a exclusão termina: tirar o paciente do
  // cache ali fazia ela buscar de novo o que acabou de ser apagado.
  it('does not drop the open patient detail from the cache', async () => {
    const client = new QueryClient();
    client.setQueryData(['patient', 'p1'], { id: 'p1' });
    const { result } = renderHook(() => useDeletePatient(), { wrapper: wrapperFor(client) });
    await act(() => result.current.mutateAsync({ id: 'p1', confirmName: 'Maria Silva' }));
    expect(client.getQueryData(['patient', 'p1'])).toEqual({ id: 'p1' });
  });
});
