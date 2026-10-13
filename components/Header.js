"use client";

import Link from "next/link";
import { useUser, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

export default function Header() {
  // Ask Clerk: has it finished loading, and is someone logged in?
  const { isLoaded, isSignedIn } = useUser();

  return (
    <header className="flex items-center justify-between bg-black px-6 py-4 text-white">
      {/* Logo / app name. Clicking it goes to the home page */}
      <Link href="/" className="text-xl font-bold">
        🚕 CabGo
      </Link>

      <div className="flex items-center gap-3">
        {/* Show these buttons only when logged OUT */}
        {isLoaded && !isSignedIn && (
          <>
            <SignInButton mode="modal">
              <button className="rounded px-4 py-2 hover:bg-gray-800">
                Log in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="rounded bg-white px-4 py-2 text-black hover:bg-gray-200">
                Sign up
              </button>
            </SignUpButton>
          </>
        )}

        {/* Show the profile picture only when logged IN */}
        {isLoaded && isSignedIn && <UserButton />}
      </div>
    </header>
  );
}