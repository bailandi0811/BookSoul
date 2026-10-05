import { create } from "zustand";
import * as api from "@/lib/user-profile-api";
import { useAuthStore } from "./useAuthStore";
import { useAppearanceStore } from "./useAppearanceStore";
import type { ApiUploadProgress } from "@/lib/api";

export type UploadStage = "signing" | "uploading" | "validating";
type UploadOptions = { signal?: AbortSignal; onStage?: (stage: UploadStage) => void; onProgress?: (progress: ApiUploadProgress) => void; onTicket?: (ticket: api.UploadTicket) => void };
interface ProfileState {
  userId: string | null; generation: number; profile: api.ProfileSnapshot | null;
  loading: boolean; saving: boolean; error: string | null;
  loadProfile: () => Promise<void>;
  updateProfile: (input: Omit<api.UpdateProfileInput, "expectedRevision">) => Promise<void>;
  deleteWallpaper: (assetId: string) => Promise<void>;
  uploadMedia: (file: File, purpose: api.MediaPurpose, options?: UploadOptions) => Promise<api.ProfileSnapshot>;
  commitMedia: (assetId: string, signal?: AbortSignal) => Promise<api.ProfileSnapshot>;
}
const operations = new Set<AbortController>();
let sequence = 0, appliedSequence = 0, loadingSequence = 0;
function identityScope(): string | null {
  const auth = useAuthStore.getState();
  return auth.user && auth.isAuthenticated ? `user:${auth.user.id}:generation:${auth.authGeneration}` : null;
}
function operation(parent?: AbortSignal) {
  const scope = identityScope();
  if (!scope) throw new Error("请先登录");
  parent?.throwIfAborted();
  const controller = new AbortController();
  operations.add(controller);
  const cancel = () => controller.abort(parent?.reason);
  parent?.addEventListener("abort", cancel, { once: true });
  return { signal: controller.signal, sequence: ++sequence,
    assert: () => {
      controller.signal.throwIfAborted();
      if (scope !== identityScope()) throw new DOMException("会话已变化", "AbortError");
    },
    close: () => { operations.delete(controller); parent?.removeEventListener("abort", cancel); } };
}
function apply(profile: api.ProfileSnapshot, requestSequence: number) {
  const state = useUserProfileStore.getState();
  if (profile.user.id !== state.userId) throw new Error("资料身份不匹配，请重新登录");
  if (state.profile && (profile.revision < state.profile.revision ||
    (profile.revision === state.profile.revision && requestSequence < appliedSequence))) return;
  appliedSequence = requestSequence;
  useUserProfileStore.setState({ profile, error: null });
  useAppearanceStore.getState().applyProfile(profile);
  useAuthStore.getState().updateCurrentUser(profile.user);
}
async function mutate(run: (revision: number, signal: AbortSignal) => Promise<api.ProfileSnapshot>, parent?: AbortSignal): Promise<api.ProfileSnapshot> {
  const state = useUserProfileStore.getState();
  if (!state.profile) throw new Error("请先加载个人资料");
  if (state.saving) throw new Error("资料正在保存，请稍候");
  const request = operation(parent);
  useUserProfileStore.setState({ saving: true });
  try {
    const profile = await run(state.profile.revision, request.signal);
    request.assert(); apply(profile, request.sequence); return profile;
  } catch (error) {
    request.assert();
    if (error instanceof api.ProfileApiError && error.code === "PROFILE_REVISION_CONFLICT") await useUserProfileStore.getState().loadProfile();
    request.assert(); throw error;
  } finally {
    request.close();
    if (state.userId === useUserProfileStore.getState().userId && state.generation === useUserProfileStore.getState().generation) useUserProfileStore.setState({ saving: false });
  }
}
export const useUserProfileStore = create<ProfileState>(() => ({
  userId: null, generation: -1, profile: null, loading: false, saving: false, error: null,
  loadProfile: async () => {
    if (!identityScope()) return;
    const request = operation(); loadingSequence = request.sequence;
    useUserProfileStore.setState({ loading: true, error: null });
    try { const profile = await api.fetchProfile(request.signal); request.assert(); apply(profile, request.sequence); }
    catch (error) {
      if (!request.signal.aborted && request.sequence === loadingSequence && request.sequence >= appliedSequence) useUserProfileStore.setState({ error: error instanceof Error ? error.message : "资料加载失败，请重试" });
    } finally {
      request.close();
      if (!request.signal.aborted && request.sequence === loadingSequence) useUserProfileStore.setState({ loading: false });
    }
  },
  updateProfile: async input => { await mutate((revision, signal) => api.updateProfile({ ...input, expectedRevision: revision }, signal)); },
  deleteWallpaper: async assetId => { await mutate((revision, signal) => api.deleteWallpaper(assetId, revision, signal)); },
  commitMedia: (assetId, parent) => mutate(async (revision, signal) => (await api.commitMediaUpload(assetId, revision, signal)).profile, parent),
  uploadMedia: (file, purpose, options = {}) => mutate(async (revision, signal) => {
    const invalid = api.validateMediaFile(file, purpose);
    if (invalid) throw new Error(invalid);
    options.onStage?.("signing");
    const ticket = await api.createMediaUpload({ purpose, contentType: file.type, byteSize: file.size }, signal);
    signal.throwIfAborted(); options.onTicket?.(ticket); options.onStage?.("uploading");
    await api.uploadDirect(ticket, file, { signal, onProgress: options.onProgress });
    signal.throwIfAborted(); options.onStage?.("validating");
    return (await api.commitMediaUpload(ticket.assetId, revision, signal)).profile;
  }, options.signal),
}));

function synchronizeIdentity() {
  const auth = useAuthStore.getState(), state = useUserProfileStore.getState();
  const userId = auth.isAuthenticated ? auth.user?.id ?? null : null;
  if (state.userId === userId && state.generation === auth.authGeneration) return;
  for (const controller of operations) controller.abort();
  operations.clear(); appliedSequence = 0;
  useUserProfileStore.setState({ userId, generation: auth.authGeneration, profile: null, loading: false, saving: false, error: null });
  useAppearanceStore.getState().prepareProfile(identityScope());
}
// Clear private data in the auth transition itself, before React's next render.
useAuthStore.subscribe(synchronizeIdentity);
synchronizeIdentity();
