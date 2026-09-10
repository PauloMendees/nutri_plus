import { describe, it, expect, vi, beforeEach } from 'vitest';

const browserApiUpload = vi.fn();
const browserApiDownload = vi.fn();
vi.mock('@/lib/api/browser', () => ({
  browserApiUpload: (...args: unknown[]) => browserApiUpload(...args),
  browserApiDownload: (...args: unknown[]) => browserApiDownload(...args),
}));

import { commitPatientImport, downloadImportTemplate, previewPatientImport } from './patient-import';

beforeEach(() => {
  browserApiUpload.mockReset().mockResolvedValue(undefined);
  browserApiDownload.mockReset().mockResolvedValue(new Blob());
});

describe('patient import API', () => {
  it('previews via POST multipart file', async () => {
    const file = new File(['x'], 'a.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await previewPatientImport(file);
    expect(browserApiUpload).toHaveBeenCalledTimes(1);
    const [path, fd] = browserApiUpload.mock.calls[0];
    expect(path).toBe('/patients/import/preview');
    expect(fd).toBeInstanceOf(FormData);
    expect((fd as FormData).get('file')).toBe(file);
  });

  it('commits with file + mapping JSON', async () => {
    const file = new File(['x'], 'a.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await commitPatientImport(file, { Nome: 'name' });
    const [path, fd] = browserApiUpload.mock.calls[0];
    expect(path).toBe('/patients/import');
    expect((fd as FormData).get('file')).toBe(file);
    expect((fd as FormData).get('mapping')).toBe(JSON.stringify({ Nome: 'name' }));
  });
});

describe('downloadImportTemplate', () => {
  it('fetches the xlsx blob with spreadsheet Accept and triggers a download', async () => {
    const blob = new Blob(['xlsx']);
    browserApiDownload.mockReset().mockResolvedValue(blob);
    const createObjectURL = vi.fn().mockReturnValue('blob:url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL } as unknown as typeof URL);
    const click = vi.fn();
    const anchor = { href: '', download: '', click, remove: vi.fn() } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);

    await downloadImportTemplate();

    expect(browserApiDownload).toHaveBeenCalledWith('/patients/import/template', {
      accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(anchor.download).toBe('inutri-pacientes.xlsx');
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:url');
  });
});
