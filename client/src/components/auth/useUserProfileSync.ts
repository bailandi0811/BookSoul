import { useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useUserProfileStore } from "@/store/useUserProfileStore";

export function useUserProfileSync(ready: boolean) {
  const userId = useAuthStore(state => state.user?.id);
  const generation = useAuthStore(state => state.authGeneration);
  useEffect(() => {
    if (!ready || !userId) return;
    const store = useUserProfileStore.getState();
    if (!store.loading && !store.profile) void store.loadProfile();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempted = "";
    const refreshIfNeeded = () => {
      if (document.visibilityState !== "visible") return;
      const state = useUserProfileStore.getState();
      const media = state.profile ? [state.profile.avatar, ...state.profile.wallpapers].filter(item => item?.expiresAt) : [];
      const key = media.map(item => `${item!.id}:${item!.expiresAt}`).sort().join("|");
      if (!state.loading && key && key !== attempted && media.some(item => Date.parse(item!.expiresAt!) <= Date.now() + 60000)) {
        attempted = key;
        void state.loadProfile();
      }
    };
    const schedule = () => {
      clearTimeout(timer);
      const profile = useUserProfileStore.getState().profile;
      if (!profile) return;
      const expires = [profile.avatar, ...profile.wallpapers].flatMap(item => item?.expiresAt ? [Date.parse(item.expiresAt) - 60000] : []);
      if (expires.length) {
        const next = Math.min(...expires) - Date.now();
        if (next > 0) timer = setTimeout(refreshIfNeeded, next);
      }
    };
    schedule();
    const unsubscribe = useUserProfileStore.subscribe((state, previous) => {
      if (state.profile !== previous.profile) schedule();
    });
    document.addEventListener("visibilitychange", refreshIfNeeded);
    return () => { clearTimeout(timer); unsubscribe(); document.removeEventListener("visibilitychange", refreshIfNeeded); };
  }, [ready, userId, generation]);
}
