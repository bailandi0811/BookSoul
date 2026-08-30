import { apiFetch, readApiError } from "@/lib/api";

export interface ConfirmedEmailDraft {
  to: string;
  subject: string;
  text: string;
}

export async function sendConfirmedEmail(
  draft: ConfirmedEmailDraft,
): Promise<void> {
  const response = await apiFetch("/api/tools/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...draft,
      confirmed: true,
    }),
  });
  if (!response.ok) throw new Error(await readApiError(response));
}
