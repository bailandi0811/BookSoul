export function normalizeBookText(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t \u3000]+$/g, ''))
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

export function titleFromFileName(fileName: string): string {
  const withoutExtension = fileName
    .replace(/^.*[\\/]/, '')
    .replace(/\.[^.]+$/, '');
  const clean = withoutExtension
    .split('')
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('')
    .trim();
  return clean.slice(0, 200) || '未命名小说';
}
