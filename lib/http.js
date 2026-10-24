// An error we raise ON PURPOSE, with a message that is safe to show people.
export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}

// Turns any caught error into a JSON response.
//  - Errors made with httpError() keep their message and status.
//  - Everything else (database errors, bugs, other libraries) is written to the
//    server log and shown to the user as a generic message, so internals never leak.
export function fail(err) {
  if (err?.expose === true && Number.isInteger(err.status) && err.status >= 400 && err.status < 600) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error("API error:", err);
  return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

const MAX_BODY_BYTES = 10_000; // 10 KB is far more than any of our requests need

// Reads a JSON request body safely. It throws an httpError for anything wrong:
//   415 if it isn't sent as JSON, 413 if it's too big,
//   400 if it isn't valid JSON, or isn't an object like { ... }.
export async function readJson(request) {
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!type.startsWith("application/json")) {
    throw httpError(415, "Send JSON with a Content-Type of application/json");
  }

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw httpError(413, "Request is too large");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    throw httpError(413, "Request is too large");
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw httpError(400, "Invalid JSON");
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw httpError(400, "Request body must be a JSON object");
  }
  return body;
}