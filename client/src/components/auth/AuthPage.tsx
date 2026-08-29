import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { BookOpenText } from "lucide-react";
import { authenticate } from "@/lib/auth-api";

interface AuthPageProps {
  onAuthenticated: () => void;
}

type EditableField = "name" | "email" | "password";

const LOCKED_FIELDS: Record<EditableField, boolean> = {
  name: false,
  email: false,
  password: false,
};

export function AuthPage({ onAuthenticated }: AuthPageProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editableFields, setEditableFields] = useState(LOCKED_FIELDS);

  const unlockField = (field: EditableField) => {
    setEditableFields((current) =>
      current[field] ? current : { ...current, [field]: true },
    );
  };

  const changeMode = (nextMode: "login" | "register") => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setName("");
    setEmail("");
    setPassword("");
    setEditableFields(LOCKED_FIELDS);
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("请填写邮箱和密码");
      return;
    }
    if (mode === "register" && !name.trim()) {
      setError("请填写名称");
      return;
    }

    setSubmitting(true);
    try {
      await authenticate(mode, {
        email: email.trim().toLowerCase(),
        password,
        ...(mode === "register" ? { name: name.trim() } : {}),
      });

      onAuthenticated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "认证失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="paper-bg relative grid min-h-[100dvh] place-items-center overflow-hidden bg-background px-5 py-10 text-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 top-[-7rem] h-80 w-80 rounded-full bg-primary/[0.08] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-amber-500/[0.07] blur-3xl"
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
        className="relative z-10 w-full max-w-[430px]"
      >
        <header className="mb-7 text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-card text-primary shadow-sm">
            <BookOpenText className="h-5 w-5" />
          </span>
          <h1 className="text-3xl font-bold tracking-tight">BookSoul</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            登录后进入你的私人书架
          </p>
        </header>

        <section
          aria-labelledby="auth-title"
          className="rounded-3xl border border-border/80 bg-card/95 p-6 shadow-[0_28px_90px_-42px_rgb(var(--foreground)/0.45)] backdrop-blur sm:p-7"
        >
          <div className="mb-6">
            <h2
              id="auth-title"
              className="text-xl font-semibold tracking-tight"
            >
              {mode === "login" ? "登录账号" : "创建账号"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              对话、记忆和阅读轨迹将安全保存在你的账号下。
            </p>
          </div>

          <div className="mb-5 grid grid-cols-2 rounded-xl bg-secondary p-1">
            {(["login", "register"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => changeMode(item)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  mode === item
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item === "login" ? "登录" : "注册"}
              </button>
            ))}
          </div>

          <form className="space-y-4" autoComplete="off" onSubmit={submit}>
            {mode === "register" && (
              <label className="block space-y-2 text-sm font-medium">
                <span>名称</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onFocus={() => unlockField("name")}
                  onPointerDown={() => unlockField("name")}
                  name="booksoul-display-name"
                  maxLength={50}
                  autoComplete="off"
                  readOnly={!editableFields.name}
                  data-1p-ignore
                  data-lpignore="true"
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
                onFocus={() => unlockField("email")}
                onPointerDown={() => unlockField("email")}
                name="booksoul-account-email"
                type="email"
                autoComplete="off"
                maxLength={254}
                readOnly={!editableFields.email}
                data-1p-ignore
                data-lpignore="true"
                className="w-full rounded-xl border border-input bg-background px-3.5 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary"
                placeholder="reader@example.com"
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>密码</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onFocus={() => unlockField("password")}
                onPointerDown={() => unlockField("password")}
                name="booksoul-account-secret"
                type="password"
                autoComplete="new-password"
                minLength={mode === "register" ? 8 : 1}
                maxLength={72}
                readOnly={!editableFields.password}
                data-1p-ignore
                data-lpignore="true"
                className="w-full rounded-xl border border-input bg-background px-3.5 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary"
                placeholder={mode === "register" ? "至少 8 个字符" : "输入密码"}
              />
            </label>
            {error && (
              <p
                role="alert"
                className="rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="tap-spring w-full whitespace-nowrap rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting
                ? "请稍候"
                : mode === "login"
                  ? "登录并继续"
                  : "创建账号并继续"}
            </button>
          </form>
        </section>
      </motion.div>
    </main>
  );
}
