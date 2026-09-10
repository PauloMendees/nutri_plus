import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

async function uploadAndEditMapping() {
  await userEvent.upload(screen.getByLabelText(/planilha/i), xlsxFile());
  await screen.findByRole('button', { name: 'Importar 2 pacientes' });
  await userEvent.click(screen.getByRole('button', { name: 'Editar mapeamento' }));
}

describe('PatientImportWizard', () => {
  it('explains the flow and keeps mapping collapsed until Editar mapeamento', async () => {
    render(<PatientImportWizard />);
    expect(screen.getByText('Como funciona')).toBeInTheDocument();
    expect(screen.getByText(/editar o mapeamento/i)).toBeInTheDocument();
    await userEvent.upload(screen.getByLabelText(/planilha/i), xlsxFile());
    expect(await screen.findByText('Ana')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar 2 pacientes' })).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Nome')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Editar mapeamento' }));
    expect(await screen.findByDisplayValue('Nome')).toBeTruthy();
    expect(screen.queryByText(/convidar agora/i)).not.toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('button', { name: 'Editar mapeamento' }));
    await userEvent.selectOptions(screen.getByDisplayValue('Ignorar'), 'email');
    await userEvent.click(screen.getByRole('button', { name: 'Importar 2 pacientes' }));
    expect(commit).toHaveBeenCalledWith({
      file,
      mapping: { Nome: 'name', CPF: 'email' },
    });
    expect(await screen.findByText(/2 pacientes/i)).toBeInTheDocument();
    expect(screen.getByText(/Nome obrigatório/)).toBeInTheDocument();
  });

  it('accepts a dropped spreadsheet', async () => {
    render(<PatientImportWizard />);
    const zone = screen.getByText(/solte a planilha aqui/i).closest('label');
    expect(zone).toBeTruthy();
    fireEvent.drop(zone!, { dataTransfer: { files: [xlsxFile()] } });
    expect(await screen.findByRole('button', { name: 'Importar 2 pacientes' })).toBeInTheDocument();
    expect(preview).toHaveBeenCalledTimes(1);
  });

  it('offers Baixar planilha modelo and a voltar link', () => {
    render(<PatientImportWizard />);
    expect(screen.getByRole('button', { name: 'Baixar planilha modelo' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /voltar/i })[0]).toHaveAttribute('href', '/patients');
  });

  it('disables Importar when two columns map to the same field', async () => {
    preview.mockResolvedValue({
      headers: ['Nome', 'Paciente'],
      suggestedMapping: { Nome: 'name', Paciente: 'ignore' },
      mappedBy: { Nome: 'template', Paciente: 'unmapped' },
      rowCount: 2,
      previewRows: [{ line: 2, values: { Nome: 'Ana', Paciente: 'Bia' } }],
    });
    render(<PatientImportWizard />);
    await uploadAndEditMapping();
    const btn = screen.getByRole('button', { name: 'Importar 2 pacientes' });
    expect(btn).toBeEnabled();
    await userEvent.selectOptions(screen.getByDisplayValue('Ignorar'), 'name');
    expect(screen.getByRole('button', { name: 'Importar 2 pacientes' })).toBeDisabled();
    expect(screen.getByText(/campo Nome mapeado duas vezes/i)).toBeInTheDocument();
    expect(commit).not.toHaveBeenCalled();
  });

  it('does not commit twice while the first commit is pending', async () => {
    commit.mockImplementation(() => new Promise(() => {}));
    render(<PatientImportWizard />);
    await userEvent.upload(screen.getByLabelText(/planilha/i), xlsxFile());
    const btn = await screen.findByRole('button', { name: 'Importar 2 pacientes' });
    await userEvent.click(btn);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /importando/i })).toBeDisabled();
  });

  it('clears mapping so a second file cannot commit with the previous mapping', async () => {
    preview.mockResolvedValueOnce(PREVIEW);
    preview.mockImplementationOnce(() => new Promise(() => {}));
    render(<PatientImportWizard />);
    await userEvent.upload(screen.getByLabelText(/planilha/i), xlsxFile());
    expect(await screen.findByRole('button', { name: 'Importar 2 pacientes' })).toBeInTheDocument();

    const fileB = new File(['y'], 'b.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await userEvent.upload(screen.getByLabelText(/planilha/i), fileB);
    expect(screen.queryByRole('button', { name: 'Importar 2 pacientes' })).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Nome')).not.toBeInTheDocument();
    expect(commit).not.toHaveBeenCalled();
  });
});
