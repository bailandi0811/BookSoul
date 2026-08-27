import { useChatStore } from '@/store/useChatStore';
import { useMemoryStore } from '@/store/useMemoryStore';
import { lazy, Suspense, useEffect, useState } from 'react';
import { restoreAuthentication } from '@/lib/auth-api';

const BookChat = lazy(() => import('@/components/BookChat'));
const Entrance = lazy(() =>
  import('@/components/Entrance').then((module) => ({
    default: module.Entrance,
  })),
);

function App() {
  const view = useChatStore((s) => s.view);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const clearPrivateCaches = () => {
      useChatStore.getState().clearMessages();
      useChatStore.setState({ sessions: [] });
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
    let active = true;
    void restoreAuthentication().finally(() => {
      if (active) setAuthReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!authReady) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background text-sm text-muted-foreground">
        正在恢复会话…
      </div>
    );
  }

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
