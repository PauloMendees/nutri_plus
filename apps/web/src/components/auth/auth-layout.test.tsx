import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AuthLayout } from './auth-layout';

describe('AuthLayout', () => {
  it('renders the brand logo and the form slot children', () => {
    const { getByRole, getByTestId } = render(
      <AuthLayout>
        <div data-testid="slot">form</div>
      </AuthLayout>,
    );
    expect(getByRole('img', { name: /inutri/i })).toBeInTheDocument();
    expect(getByTestId('slot')).toHaveTextContent('form');
  });
});
