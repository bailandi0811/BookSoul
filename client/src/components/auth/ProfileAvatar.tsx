import { useState } from "react";
import { RotateCw, UserRound } from "lucide-react";
import type { ReadableMedia } from "@/lib/user-profile-api";
import { useUserProfileStore } from "@/store/useUserProfileStore";

export function ProfileAvatar({ name, media, size = 32 }: { name: string; media: ReadableMedia | null; size?: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = media?.url ?? null;
  const unavailable = Boolean(media && (!src || failed === src));
  return (
    <span className="profile-avatar" style={{ width: size, height: size }}>
      {src && failed !== src ? (
        <img src={src} alt="头像" width={size} height={size} referrerPolicy="no-referrer" onError={() => setFailed(src)} />
      ) : <span aria-hidden="true">{Array.from(name)[0] || <UserRound size={Math.min(size / 2, 22)} />}</span>}
      {unavailable && <button type="button" className="profile-avatar-retry" aria-label="重试头像" title="重试头像" onClick={(event) => {
        event.stopPropagation();
        const identity = useUserProfileStore.getState();
        void identity.loadProfile().then(() => {
          const current = useUserProfileStore.getState();
          if (current.userId === identity.userId && current.generation === identity.generation && !current.error) setFailed(null);
        });
      }}><RotateCw size={12} /></button>}
    </span>
  );
}
