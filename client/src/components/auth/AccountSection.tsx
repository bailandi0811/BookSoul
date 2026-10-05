import { ChevronDown, ShieldCheck } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useUserProfileStore } from "@/store/useUserProfileStore";
import { ProfileAvatar } from "./ProfileAvatar";

export function AccountSection() {
  const user = useAuthStore((state) => state.user);
  const profile = useUserProfileStore((state) => state.profile);
  if (!user) return null;
  return (
    <div className="account-capsule">
      <ProfileAvatar name={profile?.user.name ?? user.name} media={profile?.avatar ?? null} />
      <button
        type="button"
        className="account-entry-button"
        aria-label="账号设置"
        onClick={() => {
          window.location.hash = "account";
        }}
      >
        <span className="account-name">{profile?.user.name ?? user.name}</span>
        {user.emailVerifiedAt && (
          <ShieldCheck size={13} aria-label="邮箱已验证" />
        )}
        <ChevronDown size={12} />
      </button>
    </div>
  );
}
