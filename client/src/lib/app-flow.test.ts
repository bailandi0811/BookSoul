import { describe, expect, it } from 'vitest';
import { resolveAppScreen } from './app-flow';

describe('app authentication flow', () => {
  it('waits for session restoration before choosing a screen', () => {
    expect(
      resolveAppScreen({
        authReady: false,
        isAuthenticated: true,
        view: 'dialogue',
      }),
    ).toBe('loading');
  });

  it('always gates an unauthenticated user, even with a saved dialogue view', () => {
    expect(
      resolveAppScreen({
        authReady: true,
        isAuthenticated: false,
        view: 'dialogue',
      }),
    ).toBe('auth');
  });

  it('sends a newly authenticated user to character selection', () => {
    expect(
      resolveAppScreen({
        authReady: true,
        isAuthenticated: true,
        view: 'entrance',
      }),
    ).toBe('entrance');
  });

  it('keeps an established authenticated dialogue open', () => {
    expect(
      resolveAppScreen({
        authReady: true,
        isAuthenticated: true,
        view: 'dialogue',
      }),
    ).toBe('dialogue');
  });
});
