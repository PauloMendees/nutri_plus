import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Logo } from './logo';

describe('Logo', () => {
  it('renders an svg with an accessible label', () => {
    const { getByRole } = render(<Logo variant="full" />);
    expect(getByRole('img', { name: /inutri/i })).toBeInTheDocument();
  });

  it('renders all marks white when tone is reverse', () => {
    const { container } = render(<Logo variant="full" tone="reverse" />);
    const colored = container.querySelectorAll(
      '[stroke="#14BFA6"], [fill="#14BFA6"], [stroke="#0A5C45"], [fill="#0A5C45"]',
    );
    expect(colored.length).toBe(0);
  });
});
