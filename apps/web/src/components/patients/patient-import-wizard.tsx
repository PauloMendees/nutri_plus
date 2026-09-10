'use client';

import { useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import {
  IMPORT_FIELD_OPTIONS,
  type ImportCommitResponse,
  type ImportPreviewResponse,
} from '@nutri-plus/shared-types';
import { ApiError } from '@/lib/api/client';
import { downloadImportTemplate } from '@/lib/api/patient-import';
import { useCommitPatientImport, usePreviewPatientImport } from '@/lib/queries/patient-import';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MAPPED_BY_HINT: Record<ImportPreviewResponse['mappedBy'][string], string> = {
  template: 'Modelo',
  alias: 'Alias',
  ai: 'IA',
  unmapped: '—',
};

const SELECT_OPTIONS = [
  ...IMPORT_FIELD_OPTIONS.filter((field) => field.key === 'ignore'),
  ...IMPORT_FIELD_OPTIONS.filter((field) => field.key !== 'ignore'),
];

function apiMessage(body: unknown): string | null {
  if (typeof body === 'string' && body.trim()) return body;
  if (body && typeof body === 'object' && 'message' in body) {
    const msg = (body as { message: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    if (Array.isArray(msg) && typeof msg[0] === 'string') return msg[0];
  }
  return null;
}

function mapImportError(err: unknown): string {
  if (err instanceof ApiError) {
    const fromApi = apiMessage(err.body);
    if (fromApi) return fromApi;
  }
  return 'Não foi possível importar a planilha. Tente novamente.';
}

export function PatientImportWizard() {
  const previewMut = usePreviewPatientImport();
  const commitMut = useCommitPatientImport();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportCommitResponse | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0];
    if (!next) return;
    setFile(next);
    setResult(null);
    setFormError(null);
    try {
      const data = await previewMut.mutateAsync(next);
      setPreview(data);
      setMapping({ ...data.suggestedMapping });
    } catch (err) {
      setPreview(null);
      setMapping({});
      const message = mapImportError(err);
      setFormError(message);
      toast.error(message);
    }
  }

  async function onDownloadTemplate() {
    try {
      await downloadImportTemplate();
    } catch (err) {
      const message = mapImportError(err);
      toast.error(message);
    }
  }

  async function onCommit() {
    if (!file || !preview) return;
    setFormError(null);
    setCommitting(true);
    try {
      const data = await commitMut.mutateAsync({ file, mapping });
      setResult(data);
    } catch (err) {
      const message = mapImportError(err);
      setFormError(message);
      toast.error(message);
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/patients"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Voltar para pacientes
      </Link>

      <div className="mt-2 mb-5 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold">Importar pacientes</h1>
        <Button variant="outline" className="rounded-full" onClick={() => void onDownloadTemplate()}>
          Baixar planilha modelo
        </Button>
      </div>

      {result ? (
        <ImportResult result={result} />
      ) : (
        <div className="space-y-5">
          <section className="rounded-xl border bg-card p-5">
            <Label htmlFor="patient-import-file">Planilha</Label>
            <p className="mt-1 mb-3 text-sm text-muted-foreground">Arquivo .xlsx ou .csv.</p>
            <Input
              id="patient-import-file"
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(event) => void onFileChange(event)}
              disabled={previewMut.isPending || committing}
            />
          </section>

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          {preview && !committing && (
            <MappingStep
              preview={preview}
              mapping={mapping}
              onMappingChange={(header, key) =>
                setMapping((prev) => ({ ...prev, [header]: key }))
              }
              onCommit={() => void onCommit()}
            />
          )}

          {committing && (
            <p className="text-sm text-muted-foreground">Importando pacientes…</p>
          )}
        </div>
      )}
    </div>
  );
}

function MappingStep({
  preview,
  mapping,
  onMappingChange,
  onCommit,
}: {
  preview: ImportPreviewResponse;
  mapping: Record<string, string>;
  onMappingChange: (header: string, key: string) => void;
  onCommit: () => void;
}) {
  return (
    <>
      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-1 font-heading text-sm font-semibold text-secondary-foreground">
          Mapeamento das colunas
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {preview.rowCount} {preview.rowCount === 1 ? 'linha' : 'linhas'} na planilha. Ajuste o
          destino de cada coluna.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Coluna</th>
                <th className="py-2 pr-4 font-medium">Destino</th>
                <th className="py-2 font-medium">Origem</th>
              </tr>
            </thead>
            <tbody>
              {preview.headers.map((header) => (
                <tr key={header} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium">{header}</td>
                  <td className="py-2 pr-4">
                    <select
                      className="h-10 w-full min-w-48 rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      aria-label={`Destino de ${header}`}
                      value={mapping[header] ?? 'ignore'}
                      onChange={(event) => onMappingChange(header, event.target.value)}
                    >
                      {SELECT_OPTIONS.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {MAPPED_BY_HINT[preview.mappedBy[header] ?? 'unmapped']}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {preview.previewRows.length > 0 && (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 font-heading text-sm font-semibold text-secondary-foreground">
            Prévia
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Linha</th>
                  {preview.headers.map((header) => (
                    <th key={header} className="py-2 pr-4 font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.previewRows.map((row) => (
                  <tr key={row.line} className="border-b last:border-0">
                    <td className="py-2 pr-4 text-muted-foreground">{row.line}</td>
                    {preview.headers.map((header) => (
                      <td key={header} className="py-2 pr-4">
                        {row.values[header] || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Button className="rounded-full" onClick={onCommit}>
        Importar {preview.rowCount} pacientes
      </Button>
    </>
  );
}

function ImportResult({ result }: { result: ImportCommitResponse }) {
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <h2 className="font-heading text-lg font-semibold">Importação concluída</h2>
      <p>
        {result.created} {result.created === 1 ? 'paciente criado' : 'pacientes criados'}
        {', '}
        {result.skipped} {result.skipped === 1 ? 'pulado' : 'pulados'}.
      </p>
      {result.errors.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {result.errors.map((err) => (
            <li key={`${err.line}-${err.message}`}>
              Linha {err.line}
              {err.name ? ` (${err.name})` : ''}: {err.message}
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" className="rounded-full" asChild>
        <Link href="/patients">Voltar para pacientes</Link>
      </Button>
    </section>
  );
}
