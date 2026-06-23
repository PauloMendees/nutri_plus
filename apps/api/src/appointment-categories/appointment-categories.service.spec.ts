import { NotFoundException } from '@nestjs/common';
import { AppointmentCategoriesService } from './appointment-categories.service';

const NUTRITIONIST_CTX = {
  user: { role: 'NUTRITIONIST', nutritionistProfile: { id: 'nut-1' } },
} as never;

function makePrisma() {
  const category = {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  };
  const prisma: any = {
    appointmentCategory: category,
    $transaction: jest.fn(async (cb: (tx: unknown) => unknown): Promise<any> => cb(prisma)),
  };
  return { prisma, category };
}

describe('AppointmentCategoriesService', () => {
  it('creates a category scoped to the nutritionist', async () => {
    const { prisma, category } = makePrisma();
    category.create.mockResolvedValue({ id: 'c1' });
    const service = new AppointmentCategoriesService(prisma as never);

    await service.create(NUTRITIONIST_CTX, { name: 'Consulta', color: '#14BFA6' });

    expect(category.create).toHaveBeenCalledWith({
      data: { nutritionistId: 'nut-1', name: 'Consulta', color: '#14BFA6', isDefault: false },
    });
  });

  it('unsets other defaults when creating a default category', async () => {
    const { prisma, category } = makePrisma();
    category.create.mockResolvedValue({ id: 'c1' });
    const service = new AppointmentCategoriesService(prisma as never);

    await service.create(NUTRITIONIST_CTX, { name: 'Retorno', isDefault: true });

    expect(category.updateMany).toHaveBeenCalledWith({
      where: { nutritionistId: 'nut-1', isDefault: true },
      data: { isDefault: false },
    });
    expect(category.create).toHaveBeenCalledWith({
      data: { nutritionistId: 'nut-1', name: 'Retorno', color: null, isDefault: true },
    });
  });

  it('lists the nutritionist categories, default first then name', async () => {
    const { prisma, category } = makePrisma();
    category.findMany.mockResolvedValue([]);
    const service = new AppointmentCategoriesService(prisma as never);

    await service.list(NUTRITIONIST_CTX);

    expect(category.findMany).toHaveBeenCalledWith({
      where: { nutritionistId: 'nut-1' },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  });

  it('throws NotFound when getting a category the nutritionist does not own', async () => {
    const { prisma, category } = makePrisma();
    category.findFirst.mockResolvedValue(null);
    const service = new AppointmentCategoriesService(prisma as never);

    await expect(service.getOne(NUTRITIONIST_CTX, 'x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFound when updating a category the nutritionist does not own', async () => {
    const { prisma, category } = makePrisma();
    category.findFirst.mockResolvedValue(null);
    const service = new AppointmentCategoriesService(prisma as never);

    await expect(service.update(NUTRITIONIST_CTX, 'x', { name: 'Z' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('unsets other defaults when updating a category to default', async () => {
    const { prisma, category } = makePrisma();
    category.findFirst.mockResolvedValue({ id: 'c1' });
    category.update.mockResolvedValue({ id: 'c1' });
    const service = new AppointmentCategoriesService(prisma as never);

    await service.update(NUTRITIONIST_CTX, 'c1', { isDefault: true });

    expect(category.updateMany).toHaveBeenCalledWith({
      where: { nutritionistId: 'nut-1', isDefault: true, id: { not: 'c1' } },
      data: { isDefault: false },
    });
    expect(category.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { name: undefined, color: undefined, isDefault: true },
    });
  });

  it('removes a category the nutritionist owns', async () => {
    const { prisma, category } = makePrisma();
    category.findFirst.mockResolvedValue({ id: 'c1' });
    const service = new AppointmentCategoriesService(prisma as never);

    await service.remove(NUTRITIONIST_CTX, 'c1');

    expect(category.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });
});
