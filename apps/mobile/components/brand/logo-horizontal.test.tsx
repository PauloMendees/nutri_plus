import { render, screen } from '@testing-library/react-native';
import { LogoHorizontal } from './logo-horizontal';

describe('LogoHorizontal', () => {
  it('renders the iNutri mark', async () => {
    await render(<LogoHorizontal />);
    expect(screen.getByLabelText('iNutri')).toBeTruthy();
  });
});
