import { useState, type RefObject } from "react";
import { Type, List, ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { useReaderStore } from "@/store/useReaderStore";
import { useReadingPreferencesStore } from "@/store/useReadingPreferencesStore";
export function ReaderChapterNavigation() {
  const sections = useReaderStore(s => s.sections), sectionId = useReaderStore(s => s.sectionId);
  const index = sections.findIndex(s => s.id === sectionId);
  const move = (target: number) => { const section = sections[target]; if (section) void useReaderStore.getState().goToSection(section.id); };
  return <div className="reader-chapter-navigation" aria-label="章节导航"><button type="button" aria-label="上一章" disabled={index <= 0} onClick={() => move(index - 1)}><ChevronLeft size={17} /></button><span>{index >= 0 ? `第 ${index + 1} 章` : "正在打开"}<small> / {sections.length}</small></span><button type="button" aria-label="下一章" disabled={index < 0 || index >= sections.length - 1} onClick={() => move(index + 1)}><ChevronRight size={17} /></button></div>;
}
export function ReaderToolbar({ onContents, contentsOpen, onAssistant, assistantOpen, contentsButton, assistantButton }: { onContents: () => void; contentsOpen: boolean; onAssistant: () => void; assistantOpen: boolean; contentsButton: RefObject<HTMLButtonElement | null>; assistantButton: RefObject<HTMLButtonElement | null> }) {
  const [format, setFormat] = useState(false);
  const fontSizePx = useReadingPreferencesStore(s => s.fontSizePx), lineHeight = useReadingPreferencesStore(s => s.lineHeight), widthPx = useReadingPreferencesStore(s => s.widthPx);
  return <>
    <nav className="reader-tools" aria-label="阅读工具">
      <button type="button" ref={contentsButton} aria-expanded={contentsOpen} onClick={onContents}><List size={20} strokeWidth={1.5} /><span>目录</span></button>
      <button type="button" aria-expanded={format} onClick={event => { event.currentTarget.focus(); setFormat(true); }}><Type size={21} strokeWidth={1.5} /><span>排版</span></button>
      <button type="button" ref={assistantButton} className="reader-assistant-toggle" aria-expanded={assistantOpen} onClick={onAssistant}><MessageSquare size={20} strokeWidth={1.5} /><span>阅读助手</span></button>
    </nav>
    <Dialog title="阅读排版" open={format} onClose={() => setFormat(false)} className="reader-format-dialog">
      <p className="dialog-intro">找到适合你的阅读节奏。</p>
      <div className="reader-format-preview font-reading" aria-label="排版预览" style={{ fontSize: fontSizePx, lineHeight }}>潮声渐远，故事继续。</div>
      <div className="reader-format-fields">{([
        { name: "fontSizePx", label: "字号", value: fontSizePx, min: 16, max: 28, step: 1, unit: "px" },
        { name: "lineHeight", label: "行距", value: lineHeight, min: 1.6, max: 2.2, step: 0.1, unit: "" },
        { name: "widthPx", label: "正文宽度", value: widthPx, min: 480, max: 800, step: 20, unit: "px" },
      ] as const).map(field => <label key={field.name}><span>{field.label}<output>{field.value}{field.unit}</output></span><input type="range" aria-label={field.label} min={field.min} max={field.max} step={field.step} value={field.value} onChange={event => useReadingPreferencesStore.getState().setPreference(field.name, Number(event.target.value))} /></label>)}</div>
    </Dialog>
  </>;
}
