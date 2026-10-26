import { getCurrentUser } from "@/lib/getCurrentUser";
import { fail, readJson } from "@/lib/http";
import { supabase } from "@/lib/supabase";
import { isValidPoint } from "@/lib/route";
import { checkRateLimit } from "@/lib/rateLimit";

// GET /api/driver → the logged-in user's role, and driver details if they are a driver
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }

    // Riders have no driver details
    if (user.role !== "driver") {
      return Response.json({ role: user.role, driver: null });
    }

    const { data, error } = await supabase
      .from("drivers")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;

    return Response.json({ role: user.role, driver: data });
  } catch (err) {
    return fail(err);
  }
}

// POST /api/driver → register the logged-in user as a driver
export async function POST(request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }
    if (user.role === "driver") {
      return Response.json({ error: "You are already a driver" }, { status: 409 });
    }

    // Read and tidy up the vehicle details
    const body = await readJson(request);
    const vehicleModel = String(body.vehicle_model ?? "").trim();
    const vehicleNumber = String(body.vehicle_number ?? "").trim().toUpperCase();

    if (vehicleModel.length < 2 || vehicleModel.length > 60) {
      return Response.json({ error: "Enter your vehicle model" }, { status: 400 });
    }
    if (!/^[A-Z0-9 -]{4,15}$/.test(vehicleNumber)) {
      return Response.json({ error: "Enter a valid vehicle number" }, { status: 400 });
    }

    // A rider with an unfinished ride can't switch roles
    const { data: active, error: activeError } = await supabase
      .from("rides")
      .select("id")
      .eq("rider_id", user.id)
      .in("status", ["requested", "accepted", "in_progress"])
      .limit(1);
    if (activeError) throw activeError;
    if (active.length > 0) {
      return Response.json(
        { error: "Finish or cancel your active ride before becoming a driver." },
        { status: 409 }
      );
    }

    // 1. Create the driver details row (or update it if one already exists)
    const { error: driverError } = await supabase
      .from("drivers")
      .upsert(
        {
          user_id: user.id,
          vehicle_model: vehicleModel,
          vehicle_number: vehicleNumber,
          is_online: false,
        },
        { onConflict: "user_id" }
      );
    if (driverError) throw driverError;

    // 2. Switch the account's role to driver
    const { error: roleError } = await supabase
      .from("users")
      .update({ role: "driver" })
      .eq("id", user.id);
    if (roleError) throw roleError;

    return Response.json({ ok: true }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}

// PATCH /api/driver → go online or offline, and/or update the driver's location
export async function PATCH(request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }
    if (user.role !== "driver") {
      return Response.json({ error: "Only drivers can do this" }, { status: 403 });
    }

    const limited = await checkRateLimit(`driver:${user.id}`, 30, 60);
      if (limited) return limited;

    const body = await readJson(request);

    if (typeof body.is_online !== "boolean") {
      return Response.json({ error: "is_online must be true or false" }, { status: 400 });
    }

    // Did the browser send a location?
    const hasLocation =
      body.lat !== undefined && body.lat !== null &&
      body.lng !== undefined && body.lng !== null;

    if (hasLocation && !isValidPoint({ lat: body.lat, lng: body.lng })) {
      return Response.json({ error: "Invalid location" }, { status: 400 });
    }

    // A driver can't be online without a known location
    if (body.is_online && !hasLocation) {
      return Response.json({ error: "Set your location first" }, { status: 400 });
    }

    // Only these fields can change here
    const changes = { is_online: body.is_online, last_seen_at: new Date().toISOString() };
    if (hasLocation) {
      changes.current_lat = body.lat;
      changes.current_lng = body.lng;
    }

    const { data, error } = await supabase
      .from("drivers")
      .update(changes)
      .eq("user_id", user.id)
      .select()
      .single();
    if (error) throw error;

    return Response.json({ driver: data });
  } catch (err) {
    return fail(err);
  }
}