import crypto from "node:crypto";
import { supabase } from "@/lib/supabase";
import { fail } from "@/lib/http";

// Compares two texts without leaking, through timing, how much of them matched
const same = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// GET /api/health → runs a few light database queries, so the free Supabase project never
// sits idle. Vercel's daily cron job calls it with "Authorization: Bearer <CRON_SECRET>",
// and strangers get a 401.
export async function GET(request) {
  try {
    const secret = process.env.CRON_SECRET;
    const header = request.headers.get("authorization") ?? "";

    if (!secret || !same(header, `Bearer ${secret}`)) {
      return Response.json({ error: "Not allowed" }, { status: 401 });
    }

    // Three tiny counts. "head: true" means no rows are downloaded.
    for (const table of ["users", "rides", "payments"]) {
      const { error } = await supabase.from(table).select("id", { count: "exact", head: true });
      if (error) throw error;
    }

    return Response.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}