import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AuthLayout } from './auth-layout';

describe('AuthLayout', () => {
  it('renders the brand logo (panel + form) and the form slot children', () => {
    const { getAllByRole, getByTestId } = render(
      <AuthLayout>
        <div data-testid="slot">form</div>
      </AuthLayout>,
    );
    // Two iNutri marks: the reverse logo on the brand panel + the colored
    // logo above the form.
    expect(getAllByRole('img', { name: /inutri/i })).toHaveLength(2);
    expect(getByTestId('slot')).toHaveTextContent('form');
  });
});
