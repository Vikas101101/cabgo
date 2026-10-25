// Builds the Content-Security-Policy text.
// It lives in its own file so a test can read it, and so next.config.mjs stays short.
//
// Every address your app talks to is listed here. When you add a new service,
// add its address to the right directive.
export function buildCsp({ dev = false } = {}) {
  const directives = {
    // Anything not listed below may only come from our own site
    "default-src": ["'self'"],

    // Scripts. 'unsafe-inline' is needed by Next.js and Clerk (see the Day 12 notes).
    // 'unsafe-eval' is needed only while developing.
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(dev ? ["'unsafe-eval'"] : []),
      "https://*.clerk.accounts.dev", // Clerk's login code (development keys)
      "https://challenges.cloudflare.com", // Clerk's bot check
      "https://*.protect.clerk.com",
      "https://checkout.razorpay.com", // the payment pop-up
    ],

    "style-src": ["'self'", "'unsafe-inline'"], // Clerk and Leaflet style things at runtime

    "img-src": [
      "'self'",
      "data:",
      "blob:",
      "https://img.clerk.com", // profile pictures
      "https://tile.openstreetmap.org", // the map
      "https://*.razorpay.com",
    ],

    "font-src": ["'self'", "data:"],

    // Where the browser may send requests from our pages
    "connect-src": [
      "'self'",
      ...(dev ? ["ws://localhost:*"] : []), // hot reloading while developing
      "https://*.clerk.accounts.dev",
      "https://clerk-telemetry.com",
      "https://*.clerk-telemetry.com",
      "https://*.protect.clerk.com:*", // Clerk's bot protection uses other ports too
      "https://*.supabase.co", // live updates
      "wss://*.supabase.co",
      "https://photon.komoot.io", // address search
      "https://api.razorpay.com", // payments
      "https://lumberjack.razorpay.com",
    ],

    // Which sites we may show inside our pages
    "frame-src": [
      "'self'",
      "https://challenges.cloudflare.com",
      "https://*.protect.clerk.com",
      "https://api.razorpay.com",
      "https://checkout.razorpay.com",
    ],

    "worker-src": ["'self'", "blob:"],

    // Never allow plugins, a changed base address, forms sent elsewhere, or framing by other sites
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}