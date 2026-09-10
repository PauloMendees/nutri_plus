import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const preview = vi.fn();
const commit = vi.fn();
const downloadImportTemplate = vi.fn();

vi.mock('@/lib/queries/patient-import', () => ({
  usePreviewPatientImport: () => ({ mutateAsync: preview, isPending: false }),
  useCommitPatientImport: () => ({ mutateAsync: commit, isPending: false }),
}));
vi.mock('@/lib/api/patient-import', () => ({
  downloadImportTemplate: (...args: unknown[]) => downloadImportTemplate(...args),
}));

import { PatientImportWizard } from './patient-import-wizard';

const PREVIEW = {
  headers: ['Nome', 'CPF'],
  suggestedMapping: { Nome: 'name', CPF: 'ignore' },
  mappedBy: { Nome: 'template' as const, CPF: 'unmapped' as const },
  rowCount: 2,
  previewRows: [{ line: 2, values: { Nome: 'Ana', CPF: '1' } }],
};

function xlsxFile() {
  return new File(['x'], 'a.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

beforeEach(() => {
  preview.mockReset().mockResolvedValue(PREVIEW);
  commit.mockReset().mockResolvedValue({
    created: 2,
    skipped: 1,
    errors: [{ line: 3, name: null, message: 'Nome obrigatório' }],
  });
  downloadImportTemplate.mockReset().mockResolvedValue(undefined);
});

describe('PatientImportWizard', () => {
  it('shows mapping dropdowns from preview and has no convite checkbox', async () => {
    preview.mockResolvedValue({
      headers: ['Nome', 'CPF'],
      suggestedMapping: { Nome: 'name', CPF: 'ignore' },
      mappedBy: { Nome: 'template', CPF: 'unmapped' },
      rowCount: 2,
      previewRows: [{ line: 2, values: { Nome: 'Ana', CPF: '1' } }],
    });
    render(<PatientImportWizard />);
    const file = new File(['x'], 'a.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await userEvent.upload(screen.getByLabelText(/planilha/i), file);
    expect(await screen.findByDisplayValue('Nome')).toBeTruthy();
    expect(screen.queryByText(/convidar/i)).not.toBeInTheDocument();
    expect(screen.getByText('Modelo')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('commits with the edited mapping and shows created count', async () => {
    commit.mockResolvedValue({
      created: 2,
      skipped: 1,
      errors: [{ line: 3, name: null, message: 'Nome obrigatório' }],
    });
    render(<PatientImportWizard />);
    const file = xlsxFile();
    await userEvent.upload(screen.getByLabelText(/planilha/i), file);
    await screen.findByRole('button', { name: 'Importar 2 pacientes' });
    await userEvent.selectOptions(screen.getByDisplayValue('Ignorar'), 'email');
    await userEvent.click(screen.getByRole('button', { name: 'Importar 2 pacientes' }));
    expect(commit).toHaveBeenCalledWith({
      file,
      mapping: { Nome: 'name', CPF: 'email' },
    });
    expect(await screen.findByText(/2 pacientes/i)).toBeInTheDocument();
    expect(screen.getByText(/Nome obrigatório/)).toBeInTheDocument();
  });

  it('offers Baixar planilha modelo and a voltar link', () => {
    render(<PatientImportWizard />);
    expect(screen.getByRole('button', { name: 'Baixar planilha modelo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /voltar/i })).toHaveAttribute('href', '/patients');
  });
});
