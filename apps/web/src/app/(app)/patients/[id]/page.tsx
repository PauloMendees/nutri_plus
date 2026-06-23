import { PatientDetail } from '@/components/patients/patient-detail';

export default async function PatientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  return <PatientDetail id={id} created={created === '1'} />;
}
