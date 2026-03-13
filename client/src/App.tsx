import { ChatInterface } from "@/components/chat-interface"

function App() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-4xl grid md:grid-cols-[250px_1fr] gap-6 items-start">
        
        {/* Sidebar */}
        <div className="hidden md:flex flex-col gap-4">
            <div className="font-bold text-xl px-2 text-slate-800">📚 书架</div>
            <div className="flex flex-col gap-2">
                <button className="text-left px-4 py-3 rounded-lg bg-white border shadow-sm font-medium text-primary ring-1 ring-primary/20">
                    天龙八部
                </button>
                <button className="text-left px-4 py-3 rounded-lg bg-slate-100 text-slate-500 hover:bg-white hover:shadow-sm transition-all">
                    笑傲江湖 (Coming Soon)
                </button>
            </div>
            
            <div className="mt-8 px-4 text-xs text-slate-400">
                <p>BookSoul v0.1.0</p>
                <p>Powered by RAG</p>
            </div>
        </div>

        {/* Main Chat Area */}
        <main className="w-full">
            <ChatInterface />
        </main>
      </div>
    </div>
  )
}

export default App
