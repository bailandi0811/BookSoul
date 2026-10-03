import { BookOpen, Sparkle } from "lucide-react";
import { cn } from "@/lib/utils";

export function BookSoulMark({
  active = false,
  className,
}: {
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "booksoul-mark inline-flex",
        active && "booksoul-mark-active",
        className,
      )}
    >
      <BookOpen strokeWidth={1.4} />
      <Sparkle className="booksoul-mark-spark" strokeWidth={1.4} />
    </span>
  );
}
