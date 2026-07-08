import { StreamableFile } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { MealPlansController } from './meal-plans.controller';
import { MealPlansService } from './meal-plans.service';
import { MealPlanPdfService } from './meal-plan-pdf.service';
import { AuthContext } from '../auth/types/auth-context';

const ctx = { user: { id: 'u', role: 'NUTRITIONIST' } } as unknown as AuthContext;

describe('MealPlansController (pdf)', () => {
  let mealPlans: DeepMockProxy<MealPlansService>;
  let pdf: DeepMockProxy<MealPlanPdfService>;
  let controller: MealPlansController;

  beforeEach(() => {
    mealPlans = mockDeep<MealPlansService>();
    pdf = mockDeep<MealPlanPdfService>();
    controller = new MealPlansController(mealPlans, pdf);
  });

  it('returns a StreamableFile as an application/pdf attachment', async () => {
    pdf.generate.mockResolvedValue(Buffer.from('%PDF-FAKE'));

    const result = await controller.pdf(ctx, 'mp1');

    expect(pdf.generate).toHaveBeenCalledWith(ctx, 'mp1');
    expect(result).toBeInstanceOf(StreamableFile);
    expect(result.options.type).toBe('application/pdf');
    expect(result.options.disposition).toContain('attachment');
    expect(result.options.disposition).toContain('plano-alimentar.pdf');
  });
});
