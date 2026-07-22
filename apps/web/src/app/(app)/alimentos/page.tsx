import { FoodsBrowse } from '@/components/foods/foods-browse';
import { Unauthorized } from '@/components/auth/unauthorized';
import { getCurrentUser } from '@/lib/auth/current-user';
import { canBrowseFoods } from '@/lib/auth/access';

export default async function AlimentosPage() {
  const me = await getCurrentUser();
  if (!me || !canBrowseFoods(me.role)) {
    return <Unauthorized />;
  }
  return <FoodsBrowse />;
}
