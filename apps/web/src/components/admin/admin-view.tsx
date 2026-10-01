'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NutritionistsTab } from './nutritionists-tab';
import { PatientsTab } from './patients-tab';

type AdminTab = 'nutricionistas' | 'pacientes';

export function AdminView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: AdminTab = searchParams.get('tab') === 'pacientes' ? 'pacientes' : 'nutricionistas';

  return (
    <div className="space-y-5">
      <h1 className="font-heading text-2xl font-bold">Painel de administração</h1>
      <Tabs value={tab} onValueChange={(v) => router.replace(`/admin?tab=${v}`)}>
        <TabsList>
          <TabsTrigger value="nutricionistas">Nutricionistas</TabsTrigger>
          <TabsTrigger value="pacientes">Pacientes</TabsTrigger>
        </TabsList>
        <TabsContent value="nutricionistas">
          <NutritionistsTab />
        </TabsContent>
        <TabsContent value="pacientes">
          <PatientsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
