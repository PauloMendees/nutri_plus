'use client';

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronLeft, FileSpreadsheet } from 'lucide-react';
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
import { cn } from '@/lib/utils';

const ACCEPT =
  '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';

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

function duplicateMappedField(headers: string[], mapping: Record<string, string>): string | null {
  const seen = new Set<string>();
  for (const header of headers) {
    const field = mapping[header] ?? 'ignore';
    if (field === 'ignore') continue;
    if (seen.has(field)) return field;
    seen.add(field);
  }
  return null;
}

function fieldLabel(key: string): string {
  return IMPORT_FIELD_OPTIONS.find((field) => field.key === key)?.label ?? key;
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
  const [mappingOpen, setMappingOpen] = useState(false);
  const commitInFlight = useRef(false);
  const previewGen = useRef(0);

  async function loadFile(next: File) {
    const gen = ++previewGen.current;
    setFile(next);
    setResult(null);
    setFormError(null);
    setPreview(null);
    setMapping({});
    setMappingOpen(false);
    try {
      const data = await previewMut.mutateAsync(next);
      if (gen !== previewGen.current) return;
      setPreview(data);
      setMapping({ ...data.suggestedMapping });
    } catch (err) {
      if (gen !== previewGen.current) return;
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
    if (commitInFlight.current || committing || commitMut.isPending) return;
    if (!file || !preview) return;
    if (duplicateMappedField(preview.headers, mapping)) {
      setMappingOpen(true);
      return;
    }
    commitInFlight.current = true;
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
      commitInFlight.current = false;
      setCommitting(false);
    }
  }

  const duplicateKey = preview ? duplicateMappedField(preview.headers, mapping) : null;
  const duplicateLabel = duplicateKey ? fieldLabel(duplicateKey) : null;

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
          <HowItWorksCard />
          <FileDropzone
            file={file}
            disabled={committing}
            pending={previewMut.isPending}
            onFile={(next) => void loadFile(next)}
          />

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          {preview && (
            <MappingStep
              preview={preview}
              mapping={mapping}
              mappingOpen={mappingOpen}
              duplicateLabel={duplicateLabel}
              committing={committing}
              onToggleMapping={() => setMappingOpen((open) => !open)}
              onMappingChange={(header, key) =>
                setMapping((prev) => ({ ...prev, [header]: key }))
              }
              onCommit={() => void onCommit()}
            />
          )}
        </div>
      )}
    </div>
  );
}

function HowItWorksCard() {
  return (
    <section
      data-tour="patients.import.howto"
      className="rounded-xl border bg-card p-5"
    >
      <h2 className="font-heading text-sm font-semibold text-secondary-foreground">
        Como funciona
      </h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
        <li>
          Envie qualquer planilha Excel ou CSV, ou baixe o modelo iNutri.
        </li>
        <li>
          As colunas são reconhecidas pelo nome (Nome, Telefone, E-mail…). Se
          alguma não bater, a IA sugere o destino. Você pode{' '}
          <strong className="font-medium text-foreground">editar o mapeamento</strong>{' '}
          antes de importar.
        </li>
        <li>
          A importação grava as fichas. O convite do app não é enviado.
        </li>
      </ul>
    </section>
  );
}

function FileDropzone({
  file,
  disabled,
  pending,
  onFile,
}: {
  file: File | null;
  disabled: boolean;
  pending: boolean;
  onFile: (file: File) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function takeFile(list: FileList | null) {
    const next = list?.[0];
    if (!next) return;
    onFile(next);
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    takeFile(event.target.files);
    event.target.value = '';
  }

  function onDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (!disabled) setDragOver(true);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragOver(false);
    if (disabled) return;
    takeFile(event.dataTransfer.files);
  }

  return (
    <label
      htmlFor="patient-import-file"
      data-tour="patients.import.dropzone"
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={cn(
        'flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors',
        dragOver
          ? 'border-primary bg-primary/5'
          : 'border-muted-foreground/30 bg-card hover:border-primary/40',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <input
        ref={inputRef}
        id="patient-import-file"
        type="file"
        accept={ACCEPT}
        className="sr-only"
        aria-label="Planilha"
        disabled={disabled}
        onChange={onInputChange}
      />
      <FileSpreadsheet className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <span className="text-sm font-medium">
        {pending
          ? 'Lendo a planilha…'
          : file
            ? file.name
            : 'Solte a planilha aqui ou clique para escolher'}
      </span>
      <span className="text-sm text-muted-foreground">Arquivo .xlsx ou .csv</span>
    </label>
  );
}

function MappingStep({
  preview,
  mapping,
  mappingOpen,
  duplicateLabel,
  committing,
  onToggleMapping,
  onMappingChange,
  onCommit,
}: {
  preview: ImportPreviewResponse;
  mapping: Record<string, string>;
  mappingOpen: boolean;
  duplicateLabel: string | null;
  committing: boolean;
  onToggleMapping: () => void;
  onMappingChange: (header: string, key: string) => void;
  onCommit: () => void;
}) {
  return (
    <>
      {preview.previewRows.length > 0 && (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-1 font-heading text-sm font-semibold text-secondary-foreground">
            Prévia
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {preview.rowCount} {preview.rowCount === 1 ? 'linha' : 'linhas'} na planilha.
          </p>
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

      <section className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-sm font-semibold text-secondary-foreground">
              Mapeamento das colunas
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ajuste só se alguma coluna tiver ido para o destino errado.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={onToggleMapping}
            aria-expanded={mappingOpen}
          >
            {mappingOpen ? 'Ocultar mapeamento' : 'Editar mapeamento'}
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', mappingOpen && 'rotate-180')}
              aria-hidden="true"
            />
          </Button>
        </div>

        {mappingOpen && (
          <div className="mt-4 overflow-x-auto">
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
                        disabled={committing}
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
        )}
      </section>

      {duplicateLabel && (
        <p className="text-sm text-destructive">campo {duplicateLabel} mapeado duas vezes</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" className="rounded-full" asChild>
          <Link href="/patients">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Voltar
          </Link>
        </Button>
        <Button
          className="rounded-full"
          onClick={onCommit}
          disabled={Boolean(duplicateLabel) || committing}
        >
          {committing ? 'Importando...' : `Importar ${preview.rowCount} pacientes`}
        </Button>
      </div>
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
