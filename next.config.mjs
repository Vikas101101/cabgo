// Headers sent with every response. They tell the browser to be strict.
const securityHeaders = [
  // Don't guess a file's type from its content (stops some content-sniffing tricks)
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Nobody may put our pages inside a frame on another site (stops clickjacking)
  { key: "X-Frame-Options", value: "DENY" },
  // When linking out, share only our site name, not full addresses
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Turn off browser features we don't use. Location stays allowed for drivers.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  // Once someone has visited over HTTPS, always use HTTPS (ignored on http://localhost)
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */

  // Don't announce that this is a Next.js app
  poweredByHeader: false,

  // This is how Tailwind CSS is connected to the build. Do not remove it.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Personal data must never be stored by a shared cache
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;