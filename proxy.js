import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// A list of address patterns that need a login.
// "(.*)" means "and anything after it", so /dashboard/profile is covered too.
const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  // If the visitor is opening a protected page, make sure they're logged in.
  // If not, Clerk sends them to the sign-in page automatically.
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Run on all pages, but skip Next.js internal files and images/fonts/etc.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run on API routes
    "/(api|trpc)(.*)",
  ],
};