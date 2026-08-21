import { render, screen, fireEvent } from '@testing-library/react-native';
import { MealLogForm } from './meal-log-form';

describe('MealLogForm', () => {
  it('disables Do meu plano when there is no visible plan', async () => {
    await render(
      <MealLogForm plans={[]} plan={null} submitting={false} onSubmit={jest.fn()} />,
    );
    expect(screen.getByText(/nenhum plano disponível. descreva a refeição/i)).toBeTruthy();
  });

  it('submits PLAN with selected option and note', async () => {
    const onSubmit = jest.fn();
    const plan = {
      id: 'pl',
      meals: [
        {
          id: 'm1',
          name: 'Almoço',
          timeLabel: '12h',
          order: 0,
          options: [
            {
              id: 'opt-a',
              label: 'Opção A',
              order: 0,
              items: [{ id: 'i', foodName: 'Arroz', quantity: '100g' }],
            },
          ],
        },
      ],
    } as any;
    await render(
      <MealLogForm plans={[{ id: 'pl' } as any]} plan={plan} submitting={false} onSubmit={onSubmit} />,
    );
    await fireEvent.press(screen.getByText(/almoço/i));
    await fireEvent.press(screen.getByText(/opção a/i));
    await fireEvent.changeText(screen.getByLabelText(/^nota$/i), 'sem pão');
    await fireEvent.press(screen.getByRole('button', { name: /salvar/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'PLAN',
        mealOptionId: 'opt-a',
        note: 'sem pão',
      }),
    );
  });

  it('submits FREE_TEXT', async () => {
    const onSubmit = jest.fn();
    await render(<MealLogForm plans={[]} plan={null} submitting={false} onSubmit={onSubmit} />);
    await fireEvent.press(screen.getByText(/outra refeição/i));
    await fireEvent.changeText(screen.getByLabelText(/descrição/i), 'Pizza');
    await fireEvent.press(screen.getByRole('button', { name: /salvar/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'FREE_TEXT',
        freeText: 'Pizza',
      }),
    );
  });
});
