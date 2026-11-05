import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeSearch } from './normalize';

// Relevância: começo do nome > começo de uma palavra > qualquer trecho.
// "ovo" põe "Ovo, de galinha" antes de "Macarrão, ... com ovos".
function relevance(searchName: string, term: string): number {
  if (searchName.startsWith(term)) return 0;
  if (new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}`).test(searchName)) return 1;
  return 2;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class FoodsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(q: string, limit?: number) {
    const term = (q ?? '').trim();
    if (term.length < 2) return [];
    const take = Math.min(limit && limit > 0 ? limit : 20, 50);
    const normalized = normalizeSearch(term);
    // A tabela é a TACO (~600 alimentos): trazer todos os matches e ranquear em
    // memória é barato. Cortar no banco antes de ranquear perderia o match
    // exato que cai no fim da ordem alfabética.
    const matches = await this.prisma.food.findMany({
      where: { searchName: { contains: normalized } },
      omit: { createdAt: true },
    });
    return matches
      .map((food) => ({ food, rank: relevance(food.searchName, normalized) }))
      .sort((a, b) => a.rank - b.rank || a.food.name.localeCompare(b.food.name, 'pt-BR'))
      .slice(0, take)
      .map(({ food: { searchName: _searchName, ...food } }) => food);
  }
}
