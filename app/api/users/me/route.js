import { clerkClient } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { fail, readJson } from "@/lib/http";
import { supabase } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rateLimit";

// GET /api/users/me → returns the logged-in user's profile
export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }

    return Response.json({ user });
  } catch (err) {
    return fail(err);
  }
}

// PATCH /api/users/me → updates the logged-in user's name and phone
export async function PATCH(request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }

    const limited = await checkRateLimit(`profile:${user.id}`, 10, 60);
    if (limited) return limited;
    
    // Read what the browser sent, and tidy it up
    const body = await readJson(request);
    const name = (body.name ?? "").trim();
    const phone = (body.phone ?? "").trim();

    // Validate the name
    if (!name) {
      return Response.json({ error: "Name is required" }, { status: 400 });
    }
    if (name.length > 100) {
      return Response.json({ error: "Name is too long" }, { status: 400 });
    }

    // Validate the phone (optional, but if given it must look like a phone number)
    if (phone) {
      const digits = phone.replace(/\D/g, ""); // keep only the digits
      const looksValid = /^[0-9+\-\s()]+$/.test(phone);
      if (!looksValid || digits.length < 7 || digits.length > 15) {
        return Response.json({ error: "Enter a valid phone number" }, { status: 400 });
      }
    }

    // 1. Save to our database. Only name and phone can be changed here.
    const { data, error } = await supabase
      .from("users")
      .update({ name, phone: phone || null })
      .eq("id", user.id)
      .select()
      .single();

    if (error) throw error;

    // 2. Copy the name to Clerk so the header and Clerk stay in sync
    const [firstName, ...rest] = name.split(/\s+/);
    const client = await clerkClient();
    await client.users.updateUser(user.clerk_id, {
      firstName,
      lastName: rest.join(" "),
    });

    return Response.json({ user: data });
  } catch (err) {
    return fail(err);
  }
}