import type { ImportCommitResponse, ImportPreviewResponse } from '@nutri-plus/shared-types';
import { browserApiDownload, browserApiUpload } from '@/lib/api/browser';

const XLSX_ACCEPT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function previewPatientImport(file: File): Promise<ImportPreviewResponse> {
  const formData = new FormData();
  formData.append('file', file);
  return browserApiUpload<ImportPreviewResponse>('/patients/import/preview', formData);
}

export function commitPatientImport(
  file: File,
  mapping: Record<string, string>,
): Promise<ImportCommitResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('mapping', JSON.stringify(mapping));
  return browserApiUpload<ImportCommitResponse>('/patients/import', formData);
}

export async function downloadImportTemplate(): Promise<void> {
  const blob = await browserApiDownload('/patients/import/template', { accept: XLSX_ACCEPT });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'inutri-pacientes.xlsx';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
