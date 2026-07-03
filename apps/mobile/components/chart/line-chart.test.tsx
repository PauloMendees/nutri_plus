import { render, screen } from '@testing-library/react-native';
import { LineChart } from './line-chart';

describe('LineChart', () => {
  it('renders a path and an end dot for 2+ points', async () => {
    await render(<LineChart data={[{ x: 0, y: 10 }, { x: 1, y: 20 }, { x: 2, y: 15 }]} />);
    expect(screen.getByTestId('line-chart-path')).toBeTruthy();
    expect(screen.getByTestId('line-chart-dot')).toBeTruthy();
  });

  it('renders a single dot and no path for 1 point', async () => {
    await render(<LineChart data={[{ x: 0, y: 10 }]} />);
    expect(screen.queryByTestId('line-chart-path')).toBeNull();
    expect(screen.getByTestId('line-chart-dot')).toBeTruthy();
  });

  it('renders neither path nor dot for 0 points', async () => {
    await render(<LineChart data={[]} />);
    expect(screen.queryByTestId('line-chart-path')).toBeNull();
    expect(screen.queryByTestId('line-chart-dot')).toBeNull();
  });
});
