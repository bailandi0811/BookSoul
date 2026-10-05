import { useId, useState } from "react";
import { ImageOff, RotateCw, Trash2 } from "lucide-react";
import { BACKGROUNDS, backgroundUrl, useAppearanceStore } from "@/store/useAppearanceStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useUserProfileStore } from "@/store/useUserProfileStore";
import { ProfileApiError, WALLPAPER_LIMIT, type ReadableMedia, type WallpaperSelection } from "@/lib/user-profile-api";
import { UserMediaUpload } from "./UserMediaUpload";

export function WallpaperLibrary({ onSelected }: { onSelected?: () => void }) {
  const userId = useAuthStore(state => state.user?.id);
  const generation = useAuthStore(state => state.authGeneration);
  return <Library key={`${userId ?? "guest"}:${generation}`} onSelected={onSelected} />;
}
function Library({ onSelected }: { onSelected?: () => void }) {
  const profile = useUserProfileStore(state => state.profile);
  const profileError = useUserProfileStore(state => state.error);
  const loading = useUserProfileStore(state => state.loading);
  const saving = useUserProfileStore(state => state.saving);
  const user = useAuthStore(state => state.user);
  const selection = useAppearanceStore(state => state.selection);
  const wallpaper = useAppearanceStore(state => state.wallpaper);
  const [error, setError] = useState<string | null>(null);
  const radioName = useId();
  const disabled = Boolean(user && (!profile || saving));
  async function save(value: WallpaperSelection, close = true) {
    setError(null);
    try {
      if (user) await useUserProfileStore.getState().updateProfile({ wallpaper: value });
      else if (value.mode === "RANDOM") useAppearanceStore.getState().setGuestMode("RANDOM");
      else if (value.kind === "SYSTEM") {
        const scene = BACKGROUNDS.find(item => item.id === value.id);
        if (scene) useAppearanceStore.getState().setBackground(scene.id);
      }
      if (close) onSelected?.();
    } catch (error) { showError(error); }
  }
  function showError(error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    setError(error instanceof ProfileApiError && error.code === "PROFILE_REVISION_CONFLICT"
      ? "资料已在其他设备修改，请核对后再次选择。" : error instanceof Error ? error.message : "壁纸保存失败，请重试");
  }
  const fixed = wallpaper.mode === "FIXED";
  return <div className="wallpaper-library">
    <div className="theme-segment wallpaper-mode" role="group" aria-label="壁纸模式">
      <button type="button" aria-label="随机壁纸" aria-pressed={!fixed} disabled={disabled} onClick={() => { if (fixed) void save({ mode: "RANDOM" }, false); }}>随机</button>
      <button type="button" aria-label="固定壁纸" aria-pressed={fixed} disabled={disabled} onClick={() => { if (!fixed) void save({ mode: "FIXED", kind: selection?.kind ?? "SYSTEM", id: selection?.id ?? "none" }, false); }}>固定</button>
    </div>
    {user && !profile && <div className="profile-load" role={profileError ? "alert" : "status"}>{loading ? "正在加载壁纸…" : profileError ?? "壁纸尚未加载"}
      {!loading && <button type="button" className="account-text-button" onClick={() => void useUserProfileStore.getState().loadProfile()}>重试加载</button>}
    </div>}
    <fieldset className="scene-accordion" disabled={disabled}>
      <legend className="sr-only">选择书房背景</legend>
      {BACKGROUNDS.map(scene => {
        const selected = selection?.kind === "SYSTEM" && selection.id === scene.id;
        return <label className={`scene-panel ${selected ? "is-open" : ""}`} key={scene.id}>
          <input type="radio" name={radioName} value={scene.id} checked={selected}
            onClick={() => { if (!fixed && selected) void save({ mode: "FIXED", kind: "SYSTEM", id: scene.id }); }}
            onChange={() => void save({ mode: "FIXED", kind: "SYSTEM", id: scene.id })} />
          <span className={`scene-panel-media ${scene.image ? "" : "scene-panel-plain"}`}>
            {scene.image && <img src={backgroundUrl(scene.image)} alt="" loading="lazy" />}
          </span>
          <span className="scene-panel-name">{scene.name}</span>
        </label>;
      })}
    </fieldset>
    {profile && <>
      <h3 className="wallpaper-library-heading">我的壁纸 <span>{profile.wallpapers.length}/{WALLPAPER_LIMIT}</span></h3>
      {profile.wallpapers.length > 0 && <fieldset className="scene-accordion scene-accordion-own" disabled={disabled}>
        <legend className="sr-only">选择我的壁纸</legend>
        {profile.wallpapers.map((item, index) => {
          const selected = selection?.kind === "USER" && selection.id === item.id;
          return <label className={`scene-panel ${selected ? "is-open" : ""}`} key={item.id}>
            <input type="radio" name={radioName} value={item.id} disabled={disabled} checked={selected}
              onClick={() => { if (!fixed && selected) void save({ mode: "FIXED", kind: "USER", id: item.id }); }}
              onChange={() => void save({ mode: "FIXED", kind: "USER", id: item.id })} />
            <WallpaperThumbnail media={item} />
            <span className="scene-panel-name">壁纸 {index + 1}</span>
            <button type="button" className="wallpaper-delete" disabled={disabled} aria-label={`删除壁纸 ${index + 1}`} title={`删除壁纸 ${index + 1}`} onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              setError(null);
              void useUserProfileStore.getState().deleteWallpaper(item.id).catch(showError);
            }}><Trash2 size={13} /></button>
          </label>;
        })}
      </fieldset>}
      <UserMediaUpload purpose="WALLPAPER" onCommitted={() => setError(null)} />
    </>}
    {(profileError || profile?.mediaReadError) && profile && <p role="alert" className="profile-error">{profileError ?? "私人图片暂时无法读取"}
      <button type="button" className="account-text-button" disabled={loading} onClick={() => void useUserProfileStore.getState().loadProfile()}><RotateCw size={13} />重试读取</button>
    </p>}
    {error && <p role="alert" className="profile-error">{error}</p>}
  </div>;
}
function WallpaperThumbnail({ media }: { media: ReadableMedia }) {
  const [failed, setFailed] = useState<string | null>(null);
  return <span className="scene-panel-media">
    {media.url && failed !== media.url ? <img src={media.url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(media.url)} /> : <ImageOff size={20} aria-label="壁纸暂不可用" />}
    {failed && <button type="button" className="wallpaper-image-retry" aria-label="重试壁纸图片" title="重试壁纸图片" onClick={event => {
      event.preventDefault(); setFailed(null); void useUserProfileStore.getState().loadProfile();
    }}><RotateCw size={13} /></button>}
  </span>;
}
