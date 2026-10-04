import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  UserRound,
} from "lucide-react";
import { AuthShell } from "./AuthShell";
import { authenticate, requestRegistrationCode } from "@/lib/auth-api";
import { validateNewPassword } from "@/lib/auth-password-policy";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { VerificationCodeField } from "./VerificationCodeField";
import { useVerificationChallenge } from "./useVerificationChallenge";

interface AuthPageProps {
  onAuthenticated: () => void;
  onBackHome: () => void;
}

type EditableField = "name" | "email" | "password";

const LOCKED_FIELDS: Record<EditableField, boolean> = {
  name: false,
  email: false,
  password: false,
};

export function AuthPage({ onAuthenticated, onBackHome }: AuthPageProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editableFields, setEditableFields] = useState(LOCKED_FIELDS);
  const [forgot, setForgot] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const challenge = useVerificationChallenge(
    mode === "register" ? email.trim().toLowerCase() : "",
    requestRegistrationCode,
  );

  const unlockField = (field: EditableField) => {
    setEditableFields((current) =>
      current[field] ? current : { ...current, [field]: true },
    );
  };

  const changeMode = (nextMode: "login" | "register") => {
    if (nextMode === mode) return;
    challenge.clear();
    controller.current?.abort();
    setSubmitting(false);
    setMode(nextMode);
    setName("");
    setEmail("");
    setPassword("");
    setEditableFields(LOCKED_FIELDS);
    setError(null);
    setShowPassword(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    if (!email.trim() || !password) {
      setError("请填写邮箱和密码");
      return;
    }
    if (mode === "register" && !name.trim()) {
      setError("请填写名称");
      return;
    }
    if (mode === "register") {
      const policy = validateNewPassword(password);
      if (policy) {
        setError(policy);
        return;
      }
      if (!challenge.receipt || !/^[0-9]{6}$/.test(challenge.code)) {
        setError("请先申请并输入 6 位邮箱验证码");
        return;
      }
    }

    setSubmitting(true);
    const pending = new AbortController();
    controller.current = pending;
    try {
      const input = { email: email.trim().toLowerCase(), password };
      if (mode === "register" && challenge.receipt)
        await authenticate(
          "register",
          {
            ...input,
            name: name.trim(),
            verificationId: challenge.receipt.verificationId,
            code: challenge.code,
          },
          { signal: pending.signal },
        );
      else await authenticate("login", input, { signal: pending.signal });

      // authenticate checks cancellation before committing the session.
      // That commit may unmount this page and abort the completed request.
      onAuthenticated();
    } catch (cause) {
      if (!pending.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "认证失败，请稍后重试",
        );
    } finally {
      if (!pending.signal.aborted) setSubmitting(false);
    }
  };

  return (
    <AuthShell
      action={
        <button
          type="button"
          className="header-action"
          onClick={() => {
            setForgot(false);
            changeMode(mode === "login" ? "register" : "login");
          }}
        >
          {mode === "login" ? "注册" : "登录"}
        </button>
      }
    >
      {forgot ? (
        <ForgotPasswordForm
          initialEmail={email}
          onBack={() => setForgot(false)}
        />
      ) : (
        <>
          <button type="button" className="account-return" onClick={onBackHome}>
            <ArrowLeft size={16} />
            返回首页
          </button>
          <div className="mb-6">
            <h2 id="auth-title" className="font-display auth-title">
              {mode === "login" ? "回到你的书房" : "开启你的书房"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {mode === "login"
                ? "你的书签与对话，都在这里等你。"
                : "为你的书籍，留一处安静的地方。"}
            </p>
          </div>

          <div className="auth-tabs">
            {(["login", "register"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => changeMode(item)}
                className={mode === item ? "active" : ""}
                aria-pressed={mode === item}
              >
                {item === "login" ? "登录" : "注册"}
              </button>
            ))}
          </div>

          <form className="space-y-4" autoComplete="off" onSubmit={submit}>
            {mode === "register" && (
              <label className="form-field">
                <span>名称</span>
                <span className="field-control">
                  <UserRound size={16} />
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
                </span>
              </label>
            )}
            <label className="form-field">
              <span>邮箱</span>
              <span className="field-control">
                <Mail size={16} />
                <input
                  value={email}
                  onChange={(event) => {
                    controller.current?.abort();
                    setSubmitting(false);
                    challenge.clear();
                    setEmail(event.target.value);
                    setError(null);
                  }}
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
              </span>
            </label>
            <label className="form-field">
              <span>密码</span>
              <span className="field-control">
                <LockKeyhole size={16} />
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onFocus={() => unlockField("password")}
                  onPointerDown={() => unlockField("password")}
                  name="booksoul-account-secret"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={mode === "register" ? 8 : 1}
                  maxLength={72}
                  readOnly={!editableFields.password}
                  data-1p-ignore
                  data-lpignore="true"
                  className="w-full rounded-xl border border-input bg-background px-3.5 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary"
                  placeholder={
                    mode === "register" ? "至少 8 个字符" : "输入密码"
                  }
                />
                <button
                  type="button"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </label>
            {mode === "register" && (
              <>
                <VerificationCodeField
                  code={challenge.code}
                  onCodeChange={challenge.onCodeChange}
                  sending={challenge.sending}
                  resendAfterSeconds={challenge.resendAfterSeconds}
                  onRequestCode={() => {
                    setError(null);
                    void challenge.requestCode();
                  }}
                />
                {challenge.receipt && (
                  <p role="status" className="text-xs text-muted-foreground">
                    申请已受理，请查收邮件；验证码 10 分钟内有效。
                  </p>
                )}
                {(challenge.error || challenge.expired) && (
                  <p role="alert" className="text-sm text-destructive">
                    {challenge.error || "验证码已过期，请重新申请"}
                  </p>
                )}
              </>
            )}
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
              className="auth-submit tap-spring"
            >
              {submitting
                ? "请稍候"
                : mode === "login"
                  ? "登录并继续"
                  : "创建账号并继续"}
              {!submitting && <ArrowRight size={15} />}
            </button>
          </form>
          {mode === "login" && (
            <button
              type="button"
              onClick={() => {
                controller.current?.abort();
                setSubmitting(false);
                setForgot(true);
              }}
              className="mt-4 text-sm text-primary"
            >
              忘记密码
            </button>
          )}
        </>
      )}
      {!forgot && (
        <div className="auth-bottom">每本书，拥有一个独立的私人助手。</div>
      )}
    </AuthShell>
  );
}
