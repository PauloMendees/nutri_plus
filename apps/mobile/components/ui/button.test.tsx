import { render, screen } from '@testing-library/react-native';
import { Button } from './button';

describe('Button variants', () => {
  it('keeps the filled primary look by default', async () => {
    await render(<Button label="Registrar medição" />);
    const btn = screen.getByRole('button', { name: /registrar medição/i });
    expect(btn.props.className).toContain('bg-primary');
    expect(btn.props.className).not.toContain('bg-transparent');
  });

  it('outline uses a primary border instead of a filled background', async () => {
    await render(<Button label="Exportar PDF" variant="outline" />);
    const btn = screen.getByRole('button', { name: /exportar pdf/i });
    expect(btn.props.className).toContain('border-primary');
    expect(btn.props.className).toContain('bg-transparent');
    expect(btn.props.className).not.toMatch(/(?:^| )bg-primary(?: |$)/);
  });
});
