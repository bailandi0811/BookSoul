import { MemoryService } from '../src/memory/memory.service';

// Test-only construction override. Production memory settings and behavior are
// unchanged; every use of the legacy private constant is redirected together.
export function createIsolatedDeepReadingMemory(
  collection: string,
  ...dependencies: ConstructorParameters<typeof MemoryService>
): MemoryService {
  if (!/^test_[a-z0-9_]+$/.test(collection))
    throw new Error('Memory test collection must be explicit and isolated');
  const memory = new MemoryService(...dependencies);
  Object.defineProperty(memory, 'COLLECTION_NAME', {
    value: collection,
    writable: false,
    configurable: false,
  });
  return memory;
}
