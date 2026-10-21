// True when the two email settings are present
export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

// Sends one email through Resend. It never throws, and it always returns
// { ok: true } or { ok: false, code, status, detail }.
export async function sendEmail({ to, subject, html, text }) {
  if (!emailConfigured()) return { ok: false, code: "not_configured" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `CabGo <${process.env.EMAIL_FROM}>`,
        to: [to],
        subject,
        html,
        text,
      }),
      signal: AbortSignal.timeout(5000), // give up after 5 seconds
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      // Log the reason for us. The key is never logged.
      console.warn("Email send failed:", res.status, data?.message);
      return { ok: false, code: "delivery_failed", status: res.status, detail: data?.message ?? null };
    }

    return { ok: true, id: data.id };
  } catch (err) {
    console.warn("Email send error:", err.message);
    return { ok: false, code: "delivery_failed", status: 0, detail: err.message };
  }
}