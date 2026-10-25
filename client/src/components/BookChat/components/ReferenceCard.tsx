import { BookOpen, ChevronRight } from "lucide-react";
import type { Reference } from "@/store/useChatStore";

interface ReferenceCardProps {
  references: Reference[];
  active?: boolean;
  onOpen?: () => void;
}

export const ReferenceCard = ({
  references,
  active = false,
  onOpen,
}: ReferenceCardProps) => {
  if (!references.length) return null;
  return (
    <button
      type="button"
      className="reference-trigger"
      aria-label={`查看 ${references.length} 处原文依据`}
      aria-pressed={active}
      onClick={onOpen}
    >
      <BookOpen size={15} strokeWidth={1.6} />
      <span>{references.length} 处原文依据</span>
      <ChevronRight size={14} strokeWidth={1.6} />
    </button>
  );
};
