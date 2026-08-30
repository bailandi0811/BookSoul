import { type ExternalReference } from "@/store/useChatStore";
import { ChevronDown, ChevronUp, ExternalLink, Globe2 } from "lucide-react";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface ExternalReferenceCardProps {
  references: ExternalReference[];
}

function safeExternalUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

export const ExternalReferenceCard = ({
  references,
}: ExternalReferenceCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const safeReferences = references
    .map((reference) => ({
      reference,
      url: safeExternalUrl(reference.url),
    }))
    .filter(
      (item): item is { reference: ExternalReference; url: URL } =>
        item.url !== null,
    );

  if (safeReferences.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="w-full"
    >
      <motion.button
        type="button"
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsExpanded(!isExpanded)}
        className={`warm-inset flex w-full items-center gap-2 rounded-[14px] px-3.5 py-2.5 text-left text-xs font-medium transition-colors ${
          isExpanded
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Globe2 className="h-3.5 w-3.5" />
        <span>联网来源 {safeReferences.length} 条</span>
        <div className="ml-auto shrink-0">
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>
      </motion.button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 8 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="grid gap-2">
              {safeReferences.map(({ reference, url }) => (
                <a
                  key={url.toString()}
                  href={url.toString()}
                  target="_blank"
                  rel="noreferrer"
                  className="warm-inset block rounded-[14px] p-3.5 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs font-semibold text-foreground">
                        {reference.title}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-primary/80">
                        {url.hostname}
                      </p>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </div>
                  <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-foreground/70">
                    {reference.snippet}
                  </p>
                </a>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
