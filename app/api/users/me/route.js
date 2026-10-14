import { getCurrentUser } from "@/lib/getCurrentUser";

// GET /api/users/me  →  returns the logged-in user's profile
export async function GET() {
  try {
    const user = await getCurrentUser();

    // Nobody is logged in
    if (!user) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }

    return Response.json({ user });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}