"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

// If the login ends while a dashboard page is open (for example you signed out in another
// tab), go to the sign-in page, instead of leaving the person on a page full of errors.
export default function SessionGuard() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace("/sign-in");
  }, [isLoaded, isSignedIn, router]);

  return null; // it shows nothing, it only watches
}