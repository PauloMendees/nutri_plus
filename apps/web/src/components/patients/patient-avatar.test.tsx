import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PatientAvatar } from './patient-avatar';

describe('PatientAvatar', () => {
  it('shows the photo when a URL is given', () => {
    render(<PatientAvatar name="Ana Paula" photoUrl="https://cdn/p.png" className="size-9" />);
    const img = screen.getByRole('img', { name: 'Ana Paula' });
    expect(img).toHaveAttribute('src', 'https://cdn/p.png');
  });

  it('falls back to initials when there is no photo', () => {
    render(<PatientAvatar name="Ana Paula" photoUrl={null} className="size-9" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('AP')).toBeInTheDocument();
  });
});
