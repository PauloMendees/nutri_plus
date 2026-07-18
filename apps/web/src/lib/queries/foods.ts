import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { searchFoods } from '@/lib/api/foods';

export function useFoodSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: ['foods', term],
    queryFn: () => searchFoods(term),
    enabled: term.length >= 2,
    placeholderData: keepPreviousData,
  });
}
