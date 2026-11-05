import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { FoodsService } from './foods.service';
import { normalizeSearch } from './normalize';

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

    const food = (name: string) => ({ id: name, name, searchName: normalizeSearch(name) });
    const names = (foods: { name: string }[]) => foods.map((f) => f.name);

    it('normalizes accents/case and queries every match by searchName', async () => {
      prisma.food.findMany.mockResolvedValue([food('Açúcar refinado')] as any);

      const result = await service.search('açúcar', 10);

      // Sem `take` nem `orderBy`: o corte só vem depois do ranking, senão um
      // match exato no fim do alfabeto nem chega a ser ranqueado.
      expect(prisma.food.findMany).toHaveBeenCalledWith({
        where: { searchName: { contains: 'acucar' } },
        omit: { createdAt: true },
      });
      expect(result).toEqual([{ id: 'Açúcar refinado', name: 'Açúcar refinado' }]);
    });

    it('ranks start of name > start of a word > substring, then alphabetical', async () => {
      prisma.food.findMany.mockResolvedValue([
        food('Macarrão, trigo, cru, com ovos'),
        food('Maionese, tradicional com ovos'),
        food('Ovo, de galinha, inteiro, cozido'),
        food('Ovo, de codorna, inteiro, cru'),
        food('Biscoito, polvilho doce'),
      ] as any);

      const result = await service.search('ovo');

      expect(names(result)).toEqual([
        'Ovo, de codorna, inteiro, cru',
        'Ovo, de galinha, inteiro, cozido',
        'Macarrão, trigo, cru, com ovos',
        'Maionese, tradicional com ovos',
        'Biscoito, polvilho doce',
      ]);
    });

    it('ignores accents and case when ranking', async () => {
      prisma.food.findMany.mockResolvedValue([
        food('Doce, de abóbora, com açúcar'),
        food('Açúcar, mascavo'),
        food('Açaí, polpa, com xarope de guaraná e açúcar'),
        food('Açúcar, cristal'),
      ] as any);

      expect(names(await service.search('ACUCAR'))).toEqual([
        'Açúcar, cristal',
        'Açúcar, mascavo',
        'Açaí, polpa, com xarope de guaraná e açúcar',
        'Doce, de abóbora, com açúcar',
      ]);
    });

    it('cuts to the limit only after ranking', async () => {
      const filler = Array.from({ length: 30 }, (_, i) =>
        food(`Alimento ${String(i).padStart(2, '0')} com ovo`),
      );
      prisma.food.findMany.mockResolvedValue([...filler, food('Ovo, de galinha, inteiro, cru')] as any);

      const result = await service.search('ovo', 5);

      expect(result).toHaveLength(5);
      expect(result[0].name).toBe('Ovo, de galinha, inteiro, cru');
    });

    it('clamps limit to a maximum of 50', async () => {
      prisma.food.findMany.mockResolvedValue(Array.from({ length: 80 }, (_, i) => food(`Arroz ${i}`)) as any);

      expect(await service.search('arroz', 999)).toHaveLength(50);
    });

    it('defaults limit to 20 when not provided or non-positive', async () => {
      prisma.food.findMany.mockResolvedValue(Array.from({ length: 30 }, (_, i) => food(`Arroz ${i}`)) as any);

      expect(await service.search('arroz')).toHaveLength(20);
      expect(await service.search('arroz', 0)).toHaveLength(20);
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
