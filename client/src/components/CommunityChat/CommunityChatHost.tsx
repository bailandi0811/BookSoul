import { useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useCommunityStore } from "@/store/useCommunityStore";
export function CommunityChatHost() {
  const identity = useAuthStore((s) => s.user?.id);
  const generation = useAuthStore((s) => s.authGeneration);
  useEffect(() => {
    void useCommunityStore.getState().connect();
    const visible = () =>
      void useCommunityStore.getState().markVisibleTailRead();
    document.addEventListener("visibilitychange", visible);
    return () => {
      document.removeEventListener("visibilitychange", visible);
      useCommunityStore.getState().disconnect();
    };
  }, [identity, generation]);
  return null;
}
