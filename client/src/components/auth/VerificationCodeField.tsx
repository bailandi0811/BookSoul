export function VerificationCodeField({
  code,
  onCodeChange,
  sending,
  resendAfterSeconds,
  onRequestCode,
}: {
  code: string;
  onCodeChange: (code: string) => void;
  sending: boolean;
  resendAfterSeconds: number;
  onRequestCode: () => void;
}) {
  return (
    <div className="verification-field">
      <label
        htmlFor="verification-code"
        className="block mb-2 text-xs font-medium"
      >
        邮箱验证码
      </label>
      <div className="code-row">
        <input
          id="verification-code"
          name="verification-code"
          value={code}
          onChange={(event) =>
            onCodeChange(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))
          }
          type="text"
          inputMode="numeric"
          autoComplete="off"
          data-1p-ignore
          maxLength={6}
          placeholder="6 位验证码"
          className="w-full rounded-xl border border-input bg-background px-3.5 py-3"
        />
        <button
          type="button"
          disabled={sending || resendAfterSeconds > 0}
          onClick={onRequestCode}
          className="code-send disabled:opacity-50"
        >
          {sending
            ? "正在申请…"
            : resendAfterSeconds > 0
              ? `${resendAfterSeconds} 秒后重发`
              : "发送验证码"}
        </button>
      </div>
    </div>
  );
}
