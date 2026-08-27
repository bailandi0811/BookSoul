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
      activeRequestId: null,
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

  it('openEntrance returns an authenticated login flow to character selection', () => {
    useChatStore.setState({ view: 'dialogue', currentCharacter: 'qiaofeng' });

    useChatStore.getState().openEntrance();

    expect(useChatStore.getState()).toMatchObject({
      view: 'entrance',
      currentCharacter: 'qiaofeng',
    });
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

  it('ignores completion from an older streaming request', () => {
    const activeController = new AbortController();
    useChatStore.setState({
      activeRequestId: 'new-request',
      abortController: activeController,
      isLoading: true,
      messages: [
        {
          role: 'assistant',
          content: 'new answer',
          isStreaming: true,
        },
      ],
    });

    useChatStore.getState().finishStreaming('old-request');

    expect(useChatStore.getState()).toMatchObject({
      activeRequestId: 'new-request',
      abortController: activeController,
      isLoading: true,
    });
    expect(useChatStore.getState().messages[0].isStreaming).toBe(true);
  });
});
