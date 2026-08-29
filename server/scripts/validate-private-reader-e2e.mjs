import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apiBase = 'http://127.0.0.1:3000';
const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const email = `client-e2e-${runId}@booksoul.local`;
const password = 'Reader-Test-2026';
let accessToken = '';
let userId = '';
let bookId = '';
let secondaryUserId = '';

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(`${apiBase}${path}`, { ...options, headers });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `${options.method ?? 'GET'} ${path} failed: ${response.status} ${detail}`,
    );
  }
  return response;
}

async function data(path, options) {
  const response = await request(path, options);
  return (await response.json()).data;
}

async function waitForReady() {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const book = await data(`/api/books/${bookId}`);
    if (book.status === 'READY') return book;
    if (book.status === 'FAILED') {
      throw new Error(
        `Ingestion failed: ${book.failureCode} ${book.failureMessage}`,
      );
    }
    await wait(1_500);
  }
  throw new Error('Timed out waiting for the uploaded book');
}

async function chat(sessionId, message, spoilerOverride = false) {
  const response = await request('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message, spoilerOverride }),
  });
  const raw = await response.text();
  const events = raw
    .split('\n\n')
    .map((line) => line.replace(/^data: /, '').trim())
    .filter((line) => line && line !== '[DONE]')
    .map((line) => JSON.parse(line));
  return {
    answer: events.map((event) => event.content ?? '').join(''),
    references: events.flatMap((event) => event.references ?? []),
    memoryUpdates: events.flatMap((event) =>
      event.memoryUpdate ? [event.memoryUpdate] : [],
    ),
  };
}

async function waitForDeletion() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const exists = await prisma.book.count({ where: { id: bookId } });
    if (exists === 0) return true;
    await wait(1_000);
  }
  return false;
}

try {
  const registration = await data('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: '端到端读者' }),
  });
  accessToken = registration.accessToken;
  userId = registration.user.id;

  const novel = `第一章 雨夜来信
雨落在青石路上，林岚在旧邮局收到一封没有署名的信。信纸上只写着暗号“青灯未灭”。她把信藏进蓝色封套，决定天亮前不告诉任何人。

第二章 渡口晨光
清晨的渡口停着一艘白船。周野带来另一封信，纸上写着完全不同的句子。林岚仍没有说出雨夜的暗号，只把蓝色封套收进背包。`;
  const form = new FormData();
  form.append(
    'file',
    new Blob([novel], { type: 'text/plain' }),
    '雨夜来信.txt',
  );
  const uploaded = await data('/api/books', { method: 'POST', body: form });
  bookId = uploaded.id;
  const readyBook = await waitForReady();

  const sections = await data(`/api/books/${bookId}/sections`);
  if (sections.length !== 2)
    throw new Error(`Expected 2 sections, got ${sections.length}`);
  const initialProgress = await data(`/api/books/${bookId}/reading-progress`);
  if (initialProgress.spoilerCeiling !== 1) {
    throw new Error(
      `Unexpected initial spoiler ceiling ${initialProgress.spoilerCeiling}`,
    );
  }
  const progress = await data(`/api/books/${bookId}/reading-progress`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'IN_PROGRESS', currentSectionOrder: 1 }),
  });
  const assistant = await data(`/api/books/${bookId}/assistant`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '雨夜阅读助手',
      responseDepth: 'DEEP',
      tone: 'ANALYTICAL',
    }),
  });
  const session = await data(`/api/books/${bookId}/sessions`, {
    method: 'POST',
  });
  const firstChat = await chat(
    session.sessionId,
    '第一章信纸上的暗号是什么？请引用依据。 ',
  );
  if (!firstChat.answer.trim())
    throw new Error('Chat returned an empty answer');
  if (!firstChat.references.length)
    throw new Error('Chat returned no references');
  if (firstChat.references.some((reference) => reference.sectionOrder > 1)) {
    throw new Error('A reference crossed the reading-progress boundary');
  }

  const blockedChat = await chat(
    session.sessionId,
    '第二章的渡口停着什么颜色的船？',
  );
  if (blockedChat.references.some((reference) => reference.sectionOrder > 1)) {
    throw new Error('Default chat crossed the reading-progress boundary');
  }
  const overrideChat = await chat(
    session.sessionId,
    '仅本次查看全书：第二章的渡口停着什么颜色的船？',
    true,
  );
  if (
    !overrideChat.references.some((reference) => reference.sectionOrder === 2)
  ) {
    throw new Error(
      'One-time full-book override did not cite the second section',
    );
  }
  const progressAfterOverride = await data(
    `/api/books/${bookId}/reading-progress`,
  );
  if (progressAfterOverride.spoilerCeiling !== 1) {
    throw new Error('One-time spoiler override changed persistent progress');
  }

  const secondaryRegistration = await data('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `client-e2e-secondary-${runId}@booksoul.local`,
      password,
      name: '隔离验收读者',
    }),
  });
  secondaryUserId = secondaryRegistration.user.id;
  for (const path of [
    `/api/books/${bookId}`,
    `/api/books/${bookId}/sessions`,
    `/api/chat/history/${session.sessionId}`,
  ]) {
    const response = await fetch(`${apiBase}${path}`, {
      headers: {
        Authorization: `Bearer ${secondaryRegistration.accessToken}`,
      },
    });
    if (response.status !== 404) {
      throw new Error(
        `Cross-user isolation failed for ${path}: ${response.status}`,
      );
    }
  }

  await chat(session.sessionId, '请记住这本书里我怀疑没有署名的信来自周野');
  const bookMemoryCount = await prisma.memoryRecord.count({
    where: { ownerId: userId, bookId },
  });
  if (bookMemoryCount !== 1) {
    throw new Error(`Expected one book memory, got ${bookMemoryCount}`);
  }

  const history = await data(`/api/chat/history/${session.sessionId}`);
  if (history.length !== 8)
    throw new Error(`Expected 8 history messages, got ${history.length}`);

  await request(`/api/books/${bookId}`, { method: 'DELETE' });
  if (!(await waitForDeletion()))
    throw new Error('Book deletion did not finish');

  console.log(
    JSON.stringify({
      readyStatus: readyBook.status,
      sections: sections.length,
      spoilerCeiling: progress.spoilerCeiling,
      assistantName: assistant.name,
      references: firstChat.references.map(
        (reference) => reference.sectionOrder,
      ),
      overrideReferences: overrideChat.references.map(
        (reference) => reference.sectionOrder,
      ),
      crossUserIsolation: true,
      historyMessages: history.length,
      bookMemories: bookMemoryCount,
      deletionComplete: true,
    }),
  );
} finally {
  if (bookId && accessToken) {
    const exists = await prisma.book.count({ where: { id: bookId } });
    if (exists) {
      await fetch(`${apiBase}/api/books/${bookId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => undefined);
      await waitForDeletion().catch(() => false);
    }
  }
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  if (secondaryUserId) {
    await prisma.user.deleteMany({ where: { id: secondaryUserId } });
  }
  await prisma.$disconnect();
}
