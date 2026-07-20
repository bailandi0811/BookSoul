import BookChat from '@/components/BookChat';
import { Entrance } from '@/components/Entrance';
import { useChatStore } from '@/store/useChatStore';

function App() {
  const view = useChatStore((s) => s.view);
  return (
    <div className="h-screen w-full">
      {view === 'entrance' ? <Entrance /> : <BookChat />}
    </div>
  );
}

export default App;
