import { useState } from "react";
import { RotateCcw, Save, X } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useUserProfileStore } from "@/store/useUserProfileStore";
import { ProfileApiError, type ProfileSnapshot } from "@/lib/user-profile-api";
import { ProfileAvatar } from "./ProfileAvatar";
import { UserMediaUpload } from "../UserMediaUpload";

export function AccountProfileForm() {
  const profile = useUserProfileStore(state => state.profile);
  const generation = useUserProfileStore(state => state.generation);
  const loading = useUserProfileStore(state => state.loading);
  const error = useUserProfileStore(state => state.error);
  const user = useAuthStore(state => state.user);
  if (!user) return null;
  if (!profile) return <div className="profile-load" role={error ? "alert" : "status"}>
    {loading ? "正在加载个人资料…" : error ?? "个人资料尚未加载"}
    {!loading && <button type="button" className="account-text-button" onClick={() => void useUserProfileStore.getState().loadProfile()}>重试加载</button>}
  </div>;
  return <ProfileEditor key={`${user.id}:${generation}`} profile={profile} />;
}
function ProfileEditor({ profile }: { profile: ProfileSnapshot }) {
  const [name, setName] = useState(profile.user.name);
  const [sourceName, setSourceName] = useState(profile.user.name);
  const [error, setError] = useState<string | null>(null);
  const saving = useUserProfileStore(state => state.saving);
  if (sourceName !== profile.user.name) {
    setSourceName(profile.user.name);
    if (name === sourceName) setName(profile.user.name);
  }
  async function save(input: { name?: string; resetAvatar?: true }) {
    setError(null);
    try {
      await useUserProfileStore.getState().updateProfile(input);
      if (input.name !== undefined) setName(input.name);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setError(error instanceof ProfileApiError && error.code === "PROFILE_REVISION_CONFLICT"
        ? "资料已在其他设备修改；已重新加载，请核对后再次保存。"
        : error instanceof Error ? error.message : "保存失败，请重试");
    }
  }
  return <>
    <div className="account-profile">
      <ProfileAvatar name={profile.user.name} media={profile.avatar} size={48} />
      <div><strong className="font-display">{profile.user.name}</strong><p>你的私人阅读空间</p></div>
    </div>
    <form className="profile-name-form" onSubmit={event => {
      event.preventDefault();
      const trimmed = name.trim();
      if (/[\p{Cc}]/u.test(trimmed) || Array.from(trimmed).length < 1 || Array.from(trimmed).length > 50) {
        setError("名称须为 1 至 50 个字符，不能包含控制字符"); return;
      }
      if (!saving) void save({ name: trimmed });
    }}>
      <label htmlFor="profile-name">名称</label>
      <input id="profile-name" aria-label="名称" value={name} disabled={saving} onChange={event => { setName(event.target.value); setError(null); }} />
      <div className="profile-actions">
        <button type="submit" aria-label="保存名称" className="account-text-button" disabled={saving || name === profile.user.name}><Save size={14} />{saving ? "正在保存…" : "保存名称"}</button>
        <button type="button" aria-label="取消名称修改" className="account-text-button" disabled={saving || name === profile.user.name} onClick={() => { setName(profile.user.name); setError(null); }}><X size={14} />取消</button>
      </div>
    </form>
    {error && <p role="alert" className="profile-error">{error}</p>}
    <div className="profile-avatar-actions">
      <UserMediaUpload purpose="AVATAR" onCommitted={() => setError(null)} />
      {profile.avatar && <button type="button" className="account-text-button" disabled={saving} onClick={() => void save({ resetAvatar: true })}><RotateCcw size={14} />恢复默认头像</button>}
    </div>
  </>;
}
