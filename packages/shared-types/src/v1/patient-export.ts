// Nome do arquivo de dados do paciente (anexo do e-mail de exclusão e download
// no web): "dados-{nome sem acentos}-{AAAA-MM-DD}.json", dia de São Paulo.
export function patientExportFileName(patientName: string, date: Date = new Date()): string {
  const slug = patientName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return `dados-${slug || 'paciente'}-${day}.json`;
}
