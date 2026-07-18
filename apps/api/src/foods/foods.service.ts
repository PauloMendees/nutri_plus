import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeSearch } from './normalize';

@Injectable()
export class FoodsService {
  constructor(private readonly prisma: PrismaService) {}

  search(q: string, limit?: number) {
    const term = (q ?? '').trim();
    if (term.length < 2) return Promise.resolve([]);
    const take = Math.min(limit && limit > 0 ? limit : 20, 50);
    return this.prisma.food.findMany({
      where: { searchName: { contains: normalizeSearch(term) } },
      orderBy: { name: 'asc' },
      take,
    });
  }
}
