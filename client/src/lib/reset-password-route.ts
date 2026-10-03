export function readResetRoute(hash: string): {
  isResetRoute: boolean;
  token: string | null;
} {
  const [route, query = ""] = hash.split("?");
  if (route !== "#reset-password") return { isResetRoute: false, token: null };
  const params = new URLSearchParams(query);
  const token = params.get("token");
  return {
    isResetRoute: true,
    token:
      token &&
      params.getAll("token").length === 1 &&
      /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(token)
        ? token
        : null,
  };
}
