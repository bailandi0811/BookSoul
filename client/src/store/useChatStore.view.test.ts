import { beforeEach, describe, expect, it } from 'vitest';
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
    });
  });

  it('enterDialogue sets view and character', () => {
    useChatStore.getState().enterDialogue('qiaofeng');
    const s = useChatStore.getState();
    expect(s.view).toBe('dialogue');
    expect(s.currentCharacter).toBe('qiaofeng');
  });

  it('switchCharacter clears messages and rotates sessionId', () => {
    useChatStore.setState({
      view: 'dialogue',
      messages: [{ role: 'user', content: 'hi', createdAt: 1 }],
      sessionId: 'session_old',
    });
    useChatStore.getState().switchCharacter('duanyu');
    const s = useChatStore.getState();
    expect(s.currentCharacter).toBe('duanyu');
    expect(s.messages).toEqual([]);
    expect(s.sessionId).not.toBe('session_old');
  });
});
