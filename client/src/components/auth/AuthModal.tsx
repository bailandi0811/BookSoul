import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { authenticate, claimCurrentGuest } from '@/lib/auth-api';
import { useChatStore } from '@/store/useChatStore';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

export function AuthModal({ open, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const sessionId = useChatStore((state) => state.sessionId);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('请填写邮箱和密码');
      return;
    }
    if (mode === 'register' && !name.trim()) {
      setError('请填写名称');
      return;
    }
    setSubmitting(true);
    try {
      await authenticate(mode, {
        email: email.trim().toLowerCase(),
        password,
        ...(mode === 'register' ? { name: name.trim() } : {}),
      });
      onClose();
      await claimCurrentGuest(sessionId);
      await useChatStore.getState().fetchSessions();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '认证失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-foreground/20 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-[420px] rounded-2xl border border-border bg-card p-6 shadow-[0_24px_80px_-32px_rgb(var(--foreground)/0.35)]"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 id="auth-title" className="text-xl font-semibold tracking-tight">
                  {mode === 'login' ? '登录 BookSoul' : '创建账号'}
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  登录后可保留当前对话和记忆。
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="tap-spring rounded-xl p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-5 grid grid-cols-2 rounded-xl bg-secondary p-1">
              {(['login', 'register'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setMode(item);
                    setError(null);
                  }}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    mode === item
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {item === 'login' ? '登录' : '注册'}
                </button>
              ))}
            </div>

            <form className="space-y-4" onSubmit={submit}>
              {mode === 'register' && (
                <label className="block space-y-2 text-sm font-medium">
                  <span>名称</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={50}
                    autoComplete="name"
                    className="w-full rounded-xl border border-input bg-background px-3.5 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary"
                    placeholder="你的称呼"
                  />
                </label>
              )}
              <label className="block space-y-2 text-sm font-medium">
                <span>邮箱</span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  className="w-full rounded-xl border border-input bg-background px-3.5 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary"
                  placeholder="reader@example.com"
                />
              </label>
              <label className="block space-y-2 text-sm font-medium">
                <span>密码</span>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={mode === 'register' ? 8 : 1}
                  maxLength={72}
                  className="w-full rounded-xl border border-input bg-background px-3.5 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary"
                  placeholder={mode === 'register' ? '至少 8 个字符' : '输入密码'}
                />
              </label>
              {error && (
                <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="tap-spring w-full whitespace-nowrap rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? '请稍候' : mode === 'login' ? '登录' : '创建账号'}
              </button>
            </form>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
