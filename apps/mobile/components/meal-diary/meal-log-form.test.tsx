import { render, screen, fireEvent } from '@testing-library/react-native';
import { MealLogForm } from './meal-log-form';

describe('MealLogForm', () => {
  it('disables Do meu plano when there is no visible plan', async () => {
    await render(
      <MealLogForm plans={[]} plan={null} submitting={false} onSubmit={jest.fn()} />,
    );
    expect(screen.getByText(/nenhum plano disponível. descreva a refeição/i)).toBeTruthy();
    expect(screen.getByLabelText(/descrição/i)).toBeTruthy();
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
    await fireEvent.changeText(screen.getByLabelText(/descrição/i), 'Pizza');
    await fireEvent.press(screen.getByRole('button', { name: /salvar/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'FREE_TEXT',
        freeText: 'Pizza',
      }),
    );
  });

  it('shows an error when Salvar is pressed with empty descrição', async () => {
    const onSubmit = jest.fn();
    await render(<MealLogForm plans={[]} plan={null} submitting={false} onSubmit={onSubmit} />);
    await fireEvent.press(screen.getByRole('button', { name: /salvar/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Preencha a descrição.')).toBeTruthy();
  });

  it('shows an error when PLAN has no option selected', async () => {
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
    await fireEvent.press(screen.getByRole('button', { name: /salvar/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Selecione uma opção do plano.')).toBeTruthy();
  });

  it('shows an error when date is invalid', async () => {
    const onSubmit = jest.fn();
    await render(<MealLogForm plans={[]} plan={null} submitting={false} onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByLabelText(/hora/i), 'xx');
    await fireEvent.changeText(screen.getByLabelText(/descrição/i), 'Pizza');
    await fireEvent.press(screen.getByRole('button', { name: /salvar/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Preencha a data e a hora.')).toBeTruthy();
  });

  it('renders options directly under the selected meal, not after the full list', async () => {
    const plan = {
      id: 'pl',
      meals: [
        {
          id: 'm1',
          name: 'Almoço',
          timeLabel: '12:00',
          order: 0,
          options: [
            {
              id: 'opt-a',
              label: 'Opção 1',
              order: 0,
              items: [{ id: 'i', foodName: 'Arroz', quantity: '100g' }],
            },
          ],
        },
        {
          id: 'm2',
          name: 'Jantar',
          timeLabel: '20:00',
          order: 1,
          options: [
            {
              id: 'opt-b',
              label: 'Opção Jantar',
              order: 0,
              items: [{ id: 'j', foodName: 'Sopa', quantity: '200g' }],
            },
          ],
        },
      ],
    } as any;
    await render(
      <MealLogForm plans={[{ id: 'pl' } as any]} plan={plan} submitting={false} onSubmit={jest.fn()} />,
    );
    await fireEvent.press(screen.getByText(/almoço/i));
    expect(screen.getByTestId('meal-m1-options')).toBeTruthy();
    expect(screen.queryByTestId('meal-m2-options')).toBeNull();
    expect(screen.getByText(/opção 1/i)).toBeTruthy();
    expect(screen.queryByText(/opção jantar/i)).toBeNull();
  });

  it('forces FREE_TEXT when a PLAN log is edited with no visible plan', async () => {
    const onSubmit = jest.fn();
    await render(
      <MealLogForm
        plans={[]}
        plan={null}
        submitting={false}
        onSubmit={onSubmit}
        initialValues={{ source: 'PLAN', mealOptionId: 'opt-a', freeText: '' }}
      />,
    );
    expect(screen.getByLabelText(/descrição/i)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(/descrição/i), 'Pizza');
    await fireEvent.press(screen.getByRole('button', { name: /salvar/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'FREE_TEXT',
        freeText: 'Pizza',
      }),
    );
    expect(onSubmit).not.toHaveBeenCalledWith(expect.objectContaining({ source: 'PLAN' }));
  });
});
