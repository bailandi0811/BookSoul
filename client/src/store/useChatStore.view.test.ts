import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from './useChatStore';

describe('chat view & character switch', () => {
  beforeEach(() => {
    localStorage.clear();
    useChatStore.setState({
      view: 'entrance',
      messages: [],
      currentCharacter: 'assistant',
      draftInput: '',
      lastStopNotice: null,
      sessionId: 'session_test',
      isLoading: false,
      abortController: null,
      hasChosenCharacter: false,
    });
  });

  it('enterDialogue sets view and character', () => {
    useChatStore.getState().enterDialogue('qiaofeng');
    const s = useChatStore.getState();
    expect(s.view).toBe('dialogue');
    expect(s.currentCharacter).toBe('qiaofeng');
    expect(localStorage.getItem('booksoul_has_chosen')).toBe('1');
    expect(localStorage.getItem('booksoul_character')).toBe('qiaofeng');
  });

  it('switchCharacter clears messages and rotates sessionId', () => {
    useChatStore.setState({
      view: 'dialogue',
      messages: [{ role: 'user', content: 'hi', createdAt: 1 }],
      sessionId: 'session_old',
      isLoading: true,
    });
    useChatStore.getState().switchCharacter('duanyu');
    const s = useChatStore.getState();
    expect(s.currentCharacter).toBe('duanyu');
    expect(s.messages).toEqual([]);
    expect(s.sessionId).not.toBe('session_old');
    expect(s.isLoading).toBe(false);
    expect(localStorage.getItem('booksoul_character')).toBe('duanyu');
  });

  it('clearMessages aborts in-flight generation', () => {
    const abort = vi.fn();
    useChatStore.setState({
      isLoading: true,
      abortController: { abort } as unknown as AbortController,
      messages: [{ role: 'user', content: 'hi', createdAt: 1 }],
    });
    useChatStore.getState().clearMessages();
    expect(abort).toHaveBeenCalled();
    expect(useChatStore.getState().isLoading).toBe(false);
    expect(useChatStore.getState().messages).toEqual([]);
  });

  it('addMessage stamps characterId from currentCharacter', () => {
    useChatStore.setState({ currentCharacter: 'wangyuyan' });
    useChatStore.getState().addMessage({ role: 'assistant', content: '你好' });
    const msg = useChatStore.getState().messages[0];
    expect(msg.characterId).toBe('wangyuyan');
  });
});
