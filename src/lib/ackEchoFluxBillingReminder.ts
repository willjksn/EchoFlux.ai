import { auth } from "../../firebaseConfig";
import { resolveApiUrl } from "./resolveApiUrl";

export async function ackEchoFluxBillingReminder(params: {
  kind: "period" | "card";
  anchor: string;
  day: 7 | 3 | 1;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const token = await user.getIdToken();
    await fetch(resolveApiUrl("/api/ackEchoFluxBillingReminder"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    });
  } catch {
    /* non-fatal */
  }
}
