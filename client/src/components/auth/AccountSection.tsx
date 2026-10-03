import { ChevronDown, ShieldCheck, UserRound } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";

export function AccountSection() {
  const user = useAuthStore((state) => state.user);
  if (!user) return null;
  return (
    <button
      type="button"
      className="account-capsule"
      aria-label="账号设置"
      onClick={() => {
        window.location.hash = "account";
      }}
    >
      <span className="account-avatar">
        {Array.from(user.name)[0] || <UserRound size={15} />}
      </span>
      <span className="account-name">{user.name}</span>
      {user.emailVerifiedAt && (
        <ShieldCheck size={13} aria-label="邮箱已验证" />
      )}
      <ChevronDown size={12} />
    </button>
  );
}
