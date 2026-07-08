import { render, screen } from '@testing-library/react-native';
import { LineChart, labelOf } from './line-chart';

describe('labelOf', () => {
  it('shows integers as-is', () => {
    expect(labelOf(72)).toBe('72');
    expect(labelOf(20)).toBe('20');
  });

  it('shows decimals with a pt-BR comma and one place', () => {
    expect(labelOf(72.4)).toBe('72,4');
    expect(labelOf(71.15)).toBe('71,2');
  });
});

describe('LineChart', () => {
  it('renders a path, an end dot, and one value label per point for 2+ points', async () => {
    await render(<LineChart data={[{ x: 0, y: 10 }, { x: 1, y: 20 }, { x: 2, y: 15 }]} />);
    expect(screen.getByTestId('line-chart-path')).toBeTruthy();
    expect(screen.getByTestId('line-chart-dot')).toBeTruthy();
    expect(screen.getAllByTestId('line-chart-label')).toHaveLength(3);
  });

  it('renders a single dot, its value label, and no path for 1 point', async () => {
    await render(<LineChart data={[{ x: 0, y: 10 }]} />);
    expect(screen.queryByTestId('line-chart-path')).toBeNull();
    expect(screen.getByTestId('line-chart-dot')).toBeTruthy();
    expect(screen.getAllByTestId('line-chart-label')).toHaveLength(1);
  });

  it('renders neither path, dot, nor labels for 0 points', async () => {
    await render(<LineChart data={[]} />);
    expect(screen.queryByTestId('line-chart-path')).toBeNull();
    expect(screen.queryByTestId('line-chart-dot')).toBeNull();
    expect(screen.queryAllByTestId('line-chart-label')).toHaveLength(0);
  });
});
