const fixtures = new Map<string, () => void>();

export function registerFixture(id: string, run: () => void): () => void {
  fixtures.set(id, run);
  return () => {
    if (fixtures.get(id) === run) fixtures.delete(id);
  };
}

export function runFixture(id: string): void {
  fixtures.get(id)?.();
}
