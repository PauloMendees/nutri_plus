import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { mapTacoRow, TacoRow } from '../src/foods/taco-mapper';

const SOURCE = 'https://raw.githubusercontent.com/marcelosanto/tabela_taco/main/TACO.json';

async function main() {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const rows = (await res.json()) as TacoRow[];
  const foods = rows.map(mapTacoRow);
  if (foods.length < 500) throw new Error(`expected >= 500 foods, got ${foods.length}`);
  const dir = join(__dirname, '..', 'prisma', 'data');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'taco.json'), JSON.stringify(foods, null, 0));
  console.log(`wrote ${foods.length} foods`);
}
main();
