'use client';

import type { Food } from '@nutri-plus/shared-types';
import { FoodSearch } from '@/components/foods/food-search';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function FoodPickerDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (food: Food) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buscar alimento</DialogTitle>
        </DialogHeader>
        <FoodSearch
          onSelect={(food) => {
            onPick(food);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
