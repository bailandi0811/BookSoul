import { useEffect, useState } from "react";
import { getCommunityAvatar } from "@/lib/community-api";
import { useAuthStore } from "@/store/useAuthStore";
import { useCommunityStore } from "@/store/useCommunityStore";

export function CommunityAvatar({
  memberId,
  name,
}: {
  memberId: string;
  name: string;
}) {
  const generation = useAuthStore((s) => s.authGeneration);
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const consent = useCommunityStore((s) => s.membership?.consentVersion);
  const [image, setImage] = useState<{ key: string; url: string } | null>(null);
  const key = `${generation}:${memberId}:${consent}`;
  useEffect(() => {
    if (!authenticated) return;
    let url: string | null = null;
    let request: AbortController | null = null;
    const load = async () => {
      if (document.visibilityState === "hidden") return;
      request?.abort();
      request = new AbortController();
      const controller = request;
      try {
        const blob = await getCommunityAvatar(memberId, controller.signal);
        if (controller.signal.aborted) return;
        const next = URL.createObjectURL(blob);
        if (url) URL.revokeObjectURL(url);
        url = next;
        setImage({ key, url: next });
      } catch {
        if (controller.signal.aborted) return;
        if (url) URL.revokeObjectURL(url);
        url = null;
        setImage(null);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 60000);
    const visible = () => void load();
    document.addEventListener("visibilitychange", visible);
    return () => {
      request?.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      if (url) URL.revokeObjectURL(url);
    };
  }, [memberId, generation, consent, key, authenticated]);
  return (
    <span className="community-avatar" aria-hidden="true">
      {image?.key === key ? (
        <img src={image.url} alt="" onError={() => setImage(null)} />
      ) : (
        Array.from(name)[0] || "书"
      )}
    </span>
  );
}
