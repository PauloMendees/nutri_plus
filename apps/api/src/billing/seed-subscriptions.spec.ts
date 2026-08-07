import { seedCourtesySubscriptions } from './seed-subscriptions';

it('cria assinatura de cortesia só para nutris sem assinatura; marca comp por e-mail', async () => {
  const prisma = {
    nutritionistProfile: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'n1', subscription: null, user: { email: 'a@x.com' } },
        { id: 'n2', subscription: { id: 's2' }, user: { email: 'b@x.com' } }, // já tem → pula
        { id: 'n3', subscription: null, user: { email: 'founder@x.com' } },
      ]),
    },
    subscription: { create: jest.fn().mockResolvedValue({}) },
  } as any;
  const out = await seedCourtesySubscriptions(prisma, ['founder@x.com'], 30);
  expect(out).toEqual({ created: 2, comped: 1 });
  expect(prisma.subscription.create).toHaveBeenCalledTimes(2);
  const comped = prisma.subscription.create.mock.calls.find((c: any) => c[0].data.nutritionistId === 'n3')[0].data;
  expect(comped.isComp).toBe(true);
});
