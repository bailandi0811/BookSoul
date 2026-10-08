import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const prettier = createRequire(new URL('../server/package.json', import.meta.url))('prettier');
const root = new URL('../', import.meta.url);
const deck = JSON.parse(await readFile(new URL('shared/tarot/deck.json', root), 'utf8'));
if (deck.length !== 78 || new Set(deck.map(card => card.id)).size !== 78) throw new Error('Invalid tarot deck');
const source = '// Generated from shared/tarot/deck.json by scripts/sync-tarot-deck.mjs.\nexport interface TarotCardData { id: string; name: string; arcana: string; suit: string | null; image: string; upright: string; reversed: string; sourceTitle: string }\nexport const TAROT_DECK: readonly TarotCardData[] = ' + JSON.stringify(deck, null, 2) + ';\n';
for (const path of ['server/src/tarot/tarot-deck.generated.ts', 'client/src/lib/tarot-deck.generated.ts']) {
  const url = new URL(path, root);
  await mkdir(new URL('./', url), { recursive: true });
  await writeFile(url, await prettier.format(source, { parser: 'typescript', singleQuote: true, trailingComma: 'all' }));
}

