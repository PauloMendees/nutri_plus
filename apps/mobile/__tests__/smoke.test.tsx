import { render, screen } from '@testing-library/react-native';
import Index from '../app/index';

describe('scaffold smoke', () => {
  it('renders the index screen', async () => {
    await render(<Index />);
    expect(screen.getByText('iNutri')).toBeTruthy();
  });
});
