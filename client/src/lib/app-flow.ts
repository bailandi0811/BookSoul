import type { ChatView } from '@/store/useChatStore';

export type AppScreen = 'loading' | 'auth' | ChatView;

interface AppFlowState {
  authReady: boolean;
  isAuthenticated: boolean;
  view: ChatView;
}

export function resolveAppScreen({
  authReady,
  isAuthenticated,
  view,
}: AppFlowState): AppScreen {
  if (!authReady) return 'loading';
  if (!isAuthenticated) return 'auth';
  return view;
}
