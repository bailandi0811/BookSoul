import { useChatStore } from '@/store/useChatStore';
import { useMemoryStore } from '@/store/useMemoryStore';
import { lazy, Suspense, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';

const BookChat = lazy(() => import('@/components/BookChat'));
const Entrance = lazy(() =>
  import('@/components/Entrance').then((module) => ({
    default: module.Entrance,
  })),
);

function App() {
  const view = useChatStore((s) => s.view);
  useEffect(() => {
    const clearPrivateCaches = () => {
      useChatStore.getState().clearMessages();
      useChatStore.setState({ sessions: [], userId: 'anonymous' });
      useMemoryStore.setState({
        profile: null,
        memories: [],
        selectedMemory: null,
        isExpanded: false,
      });
    };
    window.addEventListener('booksoul:auth-invalidated', clearPrivateCaches);
    return () =>
      window.removeEventListener('booksoul:auth-invalidated', clearPrivateCaches);
  }, []);

  useEffect(() => {
    if (!useAuthStore.getState().isAuthenticated) return;
    void apiFetch('/api/auth/me').then((response) => {
      if (!response.ok && response.status !== 401) {
        console.warn('Unable to validate the restored account session');
      }
    });
  }, []);
  return (
    <div className="min-h-[100dvh] w-full">
      <Suspense
        fallback={
          <div className="grid min-h-[100dvh] place-items-center bg-background text-sm text-muted-foreground">
            正在翻开书页…
          </div>
        }
      >
        {view === 'entrance' ? <Entrance /> : <BookChat />}
      </Suspense>
    </div>
  );
}

export default App;
