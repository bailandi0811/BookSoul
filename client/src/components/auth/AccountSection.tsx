import { useState } from 'react';
import { LogOut, RefreshCw, UserRound } from 'lucide-react';
import { claimCurrentGuest, logoutCurrentDevice } from '@/lib/auth-api';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';

export function AccountSection() {
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const user = useAuthStore((state) => state.user);
  const claimState = useAuthStore((state) => state.claimState);
  const claimMessage = useAuthStore((state) => state.claimMessage);
  const sessionId = useChatStore((state) => state.sessionId);

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UserRound className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            setLoggingOut(true);
            setLogoutError(null);
            try {
              await logoutCurrentDevice();
            } catch {
              setLogoutError('退出失败，请检查网络后重试');
            } finally {
              setLoggingOut(false);
            }
          }}
          disabled={loggingOut}
          className="tap-spring rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label="退出登录"
          title="退出登录"
        >
          {loggingOut ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
        </button>
      </div>
      {logoutError && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {logoutError}
        </p>
      )}
      {(claimState === 'partial' || claimState === 'failed') && (
        <div className="rounded-xl bg-primary/10 p-3 text-xs leading-5 text-foreground">
          <p>{claimMessage ?? '访客数据尚未完整迁移'}</p>
          <button
            type="button"
            onClick={() => claimCurrentGuest(sessionId)}
            className="mt-2 inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            重试认领
          </button>
        </div>
      )}
    </div>
  );
}
