import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { FoodsService } from './foods.service';

describe('FoodsService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: FoodsService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new FoodsService(prisma);
  });

  describe('search', () => {
    it('returns [] without hitting prisma when q is empty', async () => {
      const result = await service.search('');

      expect(result).toEqual([]);
      expect(prisma.food.findMany).not.toHaveBeenCalled();
    });

    it('returns [] without hitting prisma when q is shorter than 2 chars', async () => {
      const result = await service.search('a');

      expect(result).toEqual([]);
      expect(prisma.food.findMany).not.toHaveBeenCalled();
    });

    it('normalizes accents/case and queries by searchName, returning the prisma result', async () => {
      const foods = [{ id: 'f1', name: 'Açúcar refinado' }];
      prisma.food.findMany.mockResolvedValue(foods as any);

      const result = await service.search('açúcar', 10);

      expect(prisma.food.findMany).toHaveBeenCalledWith({
        where: { searchName: { contains: 'acucar' } },
        orderBy: { name: 'asc' },
        take: 10,
      });
      expect(result).toBe(foods);
    });

    it('clamps limit to a maximum of 50', async () => {
      prisma.food.findMany.mockResolvedValue([]);

      await service.search('arroz', 999);

      expect(prisma.food.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });

    it('defaults limit to 20 when not provided', async () => {
      prisma.food.findMany.mockResolvedValue([]);

      await service.search('arroz');

      expect(prisma.food.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20 }),
      );
    });

    it('defaults limit to 20 when given a non-positive number', async () => {
      prisma.food.findMany.mockResolvedValue([]);

      await service.search('arroz', 0);

      expect(prisma.food.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20 }),
      );
    });

    it('trims surrounding whitespace before checking length and normalizing', async () => {
      prisma.food.findMany.mockResolvedValue([]);

      await service.search('  ar  ');

      expect(prisma.food.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { searchName: { contains: 'ar' } },
        }),
      );
    });
  });
});
