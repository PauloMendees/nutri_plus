import { render, screen } from '@testing-library/react-native';
import { LogoHorizontal, LOGO_TONES } from './logo-horizontal';

describe('LogoHorizontal tones', () => {
  it('keeps brand teal + green for the color tone', () => {
    expect(LOGO_TONES.color).toEqual({ teal: '#14BFA6', green: '#0A5C45' });
  });

  it('lifts the green parts to light on the dark tone', () => {
    expect(LOGO_TONES.dark).toEqual({ teal: '#14BFA6', green: '#E7ECE9' });
  });

  it('is solid white on the reverse tone', () => {
    expect(LOGO_TONES.reverse).toEqual({ teal: '#FFFFFF', green: '#FFFFFF' });
  });
});

describe('LogoHorizontal', () => {
  it('renders the iNutri mark', async () => {
    await render(<LogoHorizontal />);
    expect(screen.getByLabelText('iNutri')).toBeTruthy();
  });
});
