import { useEffect, useRef, useState } from "react";
import { X, ArrowUpRight } from "lucide-react";
import { ensureBookChat } from "@/lib/book-workspace-navigation";
import { useBooksStore } from "@/store/useBooksStore";
import { useChatStore } from "@/store/useChatStore";
import { InputArea } from "@/components/BookChat/components/InputArea";
import { MessageBubble } from "@/components/BookChat/components/MessageBubble";
import { EmailComposerDialog } from "@/components/BookChat/components/EmailComposerDialog";
import { Dialog } from "@/components/ui/Dialog";
export default function ReaderAssistantPanel({ bookId, onClose }: { bookId: string; onClose: () => void }) {
  const [ready, setReady] = useState(false), [error, setError] = useState<string | null>(null);
  const [mobile, setMobile] = useState(() => !window.matchMedia("(min-width: 1024px)").matches);
  const messages = useChatStore(s => s.messages), currentBookId = useChatStore(s => s.currentBookId);
  const draft = useChatStore(s => s.pendingEmailDraft);
  const ceiling = useBooksStore(s => s.readingProgress?.spoilerCeiling ?? 1);
  const scroller = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    let active = true;
    void ensureBookChat(bookId).then(() => { if (active) setReady(true); }).catch(error => { if (active) setError(error instanceof Error ? error.message : "助手暂不可用"); });
    return () => { active = false; useChatStore.getState().stopGenerating(); };
  }, [bookId]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const changed = () => setMobile(!media.matches); media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [messages]);
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !ready || currentBookId !== bookId) return;
    let width = 0, frame = 0;
    const resizeInput = () => {
      const nextWidth = panel.getBoundingClientRect().width;
      if (nextWidth <= 0 || nextWidth === width) return;
      width = nextWidth;
      cancelAnimationFrame(frame);
      // The shared composer measures draft changes; a reader panel can also change width.
      frame = requestAnimationFrame(() => {
        const input = panel.querySelector<HTMLTextAreaElement>(".chat-composer textarea");
        if (!input) return;
        input.style.height = "auto";
        input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
      });
    };
    resizeInput();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resizeInput);
    observer?.observe(panel);
    return () => { observer?.disconnect(); cancelAnimationFrame(frame); };
  }, [ready, bookId, currentBookId, mobile]);
  const content = <aside ref={panelRef} className="reader-assistant-panel" aria-label="阅读助手">
    <div className="reader-panel-heading"><h2 className="font-reading">阅读助手</h2><div><button onClick={() => { onClose(); void useBooksStore.getState().switchBookView("workspace"); }}>聊天页 <ArrowUpRight size={13} className="inline" /></button><button aria-label="关闭阅读助手" onClick={onClose}><X size={17} className="inline" /></button></div></div>
    <p className="reader-panel-scope">讨论至第 {ceiling} 节 · 续读位置独立保存</p>
    <div className="reader-panel-messages" ref={scroller}>
      {error && <p role="alert">{error}</p>}
      {!ready && <p role="status">正在准备本书助手…</p>}
      {ready && currentBookId === bookId && (messages.length ? messages.map((message, index) => <MessageBubble key={index} message={message} />) : <p className="reader-panel-empty">哪一段让你停了下来？<br />可以聊聊人物、情节，或刚刚读到的细节。</p>)}
    </div>
    {ready && currentBookId === bookId && <InputArea />}
    <EmailComposerDialog draft={currentBookId === bookId ? draft : null} onClose={() => useChatStore.getState().closeEmailDraft()} />
  </aside>;
  return mobile ? <Dialog title="阅读助手" className="reader-mobile-dialog" onClose={onClose}>{content}</Dialog> : content;
}
