warning: in the working copy of 'next.config.mjs', LF will be replaced by CRLF the next time Git touches it
[1mdiff --git a/next.config.mjs b/next.config.mjs[m
[1mindex 6c86a91..ac7bb21 100644[m
[1m--- a/next.config.mjs[m
[1m+++ b/next.config.mjs[m
[36m@@ -1,14 +1,28 @@[m
[32m+[m[32m// Headers sent with every response. They tell the browser to be strict.[m
[32m+[m[32mconst securityHeaders = [[m
[32m+[m[32m  // Don't guess a file's type from its content (stops some content-sniffing tricks)[m
[32m+[m[32m  { key: "X-Content-Type-Options", value: "nosniff" },[m
[32m+[m[32m  // Nobody may put our pages inside a frame on another site (stops clickjacking)[m
[32m+[m[32m  { key: "X-Frame-Options", value: "DENY" },[m
[32m+[m[32m  // When linking out, share only our site name, not full addresses[m
[32m+[m[32m  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },[m
[32m+[m[32m  // Turn off browser features we don't use. Location stays allowed for drivers.[m
[32m+[m[32m  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },[m
[32m+[m[32m  // Once someone has visited over HTTPS, always use HTTPS (ignored on http://localhost)[m
[32m+[m[32m  { key: "Strict-Transport-Security", value: "max-age=63072000" },[m
[32m+[m[32m];[m
[32m+[m
 /** @type {import('next').NextConfig} */[m
 const nextConfig = {[m
[31m-  /* config options here */[m
[31m-  turbopack: {[m
[31m-    rules: {[m
[31m-      "*.css": {[m
[31m-        loaders: ["@tailwindcss/turbopack"],[m
[31m-        as: "*.css",[m
[31m-      },[m
[31m-    },[m
[32m+[m[32m  poweredByHeader: false, // don't announce that this is a Next.js app[m
[32m+[m
[32m+[m[32m  async headers() {[m
[32m+[m[32m    return [[m
[32m+[m[32m      { source: "/:path*", headers: securityHeaders },[m
[32m+[m[32m      // Personal data must never be stored by a shared cache[m
[32m+[m[32m      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },[m
[32m+[m[32m    ];[m
   },[m
 };[m
 [m
[31m-export default nextConfig;[m
[32m+[m[32mexport default nextConfig;[m
\ No newline at end of file[m
