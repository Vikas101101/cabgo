import { clerkMiddleware } from "@clerk/nextjs/server";

// Runs on every request and gives Clerk the user's login info.
// It doesn't block any page yet. Later we'll use it to protect pages.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Run on all pages, but skip Next.js internal files and images/fonts/etc.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run on API routes
    "/(api|trpc)(.*)",
  ],
};