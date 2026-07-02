import { render, screen } from '@testing-library/react-native';
import Index from '../app/index';

describe('themed index', () => {
  it('renders the branded title with NativeWind classes', async () => {
    await render(<Index />);
    expect(screen.getByText('iNutri')).toBeTruthy();
  });
});
