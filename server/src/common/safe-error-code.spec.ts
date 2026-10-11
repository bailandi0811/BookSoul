import { safeErrorCode } from './safe-error-code';

describe('safeErrorCode', () => {
  it('preserves database codes without exposing messages or metadata', () => {
    expect(
      safeErrorCode({ code: 'P2021', message: 'private data', meta: {} }),
    ).toBe('P2021');
  });

  it.each([
    null,
    undefined,
    new Error('private data'),
    { code: 'secret' },
    { code: 'P2021\nprivate data' },
    { code: 2021 },
  ])('does not log unrecognized error data', (error: unknown) => {
    expect(safeErrorCode(error)).toBe('UNKNOWN');
  });
});
