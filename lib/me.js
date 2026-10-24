let pending = null; // the request that's in flight right now, if any

// Asks the server who is logged in. If several components ask at the same moment,
// they share ONE request. Nothing is remembered after it finishes, so a different
// account logging in on the same tab can never see the previous person's details.
export function getMe() {
  if (!pending) {
    pending = fetch("/api/users/me")
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Could not load your account");
        return json.user;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}