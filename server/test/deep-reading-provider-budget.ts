export interface DeepReadingProviderUsage {
  chatCalls: number;
  embeddingTexts: number;
  providerAttempts: number;
}
export function createDeepReadingBudgetedFetch(
  originalFetch: typeof fetch,
  providerUrl: string,
  limits: { maxChatCalls: number; maxEmbeddingTexts: number },
  record: (usage: DeepReadingProviderUsage) => void,
): typeof fetch {
  const provider = new URL(providerUrl);
  const usage: DeepReadingProviderUsage = {
    chatCalls: 0,
    embeddingTexts: 0,
    providerAttempts: 0,
  };
  if (
    !['http:', 'https:'].includes(provider.protocol) ||
    provider.username ||
    provider.password ||
    provider.search ||
    provider.hash
  )
    throw new Error('Invalid provider target');
  return async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    const base = provider.pathname.replace(/\/$/, '');
    if (
      url.origin !== provider.origin ||
      ![`${base}/chat/completions`, `${base}/embeddings`].includes(
        url.pathname,
      ) ||
      url.search ||
      url.hash
    )
      throw new Error('Unapproved provider destination');
    const raw =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as unknown)
        : undefined;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new Error('Uninspectable provider request');
    const body = raw as Record<string, unknown>;
    if (url.pathname.endsWith('/embeddings')) {
      const texts = typeof body.input === 'string' ? [body.input] : body.input;
      if (
        !Array.isArray(texts) ||
        !texts.every((text) => typeof text === 'string')
      )
        throw new Error('Unsupported embedding input');
      if (usage.embeddingTexts + texts.length > limits.maxEmbeddingTexts)
        throw new Error('Embedding budget exhausted');
      usage.embeddingTexts += texts.length;
    } else {
      if (usage.chatCalls >= limits.maxChatCalls)
        throw new Error('Chat budget exhausted');
      usage.chatCalls++;
    }
    usage.providerAttempts++;
    record({ ...usage });
    return originalFetch(input, init);
  };
}
