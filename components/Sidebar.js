"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Skeleton } from "@/components/Skeleton";

// "label" is shown in the sidebar, "short" on the phone's bottom bar.
// "also" lists other addresses that should keep this link highlighted.
const RIDER_LINKS = [
  { href: "/dashboard", label: "Overview", short: "Home", icon: "🏠" },
  { href: "/dashboard/book", label: "Book a ride", short: "Book", icon: "📍" },
  { href: "/dashboard/driver", label: "Drive with us", short: "Drive", icon: "🚗" },
  { href: "/dashboard/history", label: "History", short: "History", icon: "🕘", also: ["/dashboard/receipts"] },
  { href: "/dashboard/profile", label: "Profile", short: "Profile", icon: "👤" },
];

const DRIVER_LINKS = [
  { href: "/dashboard", label: "Overview", short: "Home", icon: "🏠" },
  { href: "/dashboard/driver", label: "Driver", short: "Drive", icon: "🚗" },
  { href: "/dashboard/history", label: "History", short: "History", icon: "🕘" },
  { href: "/dashboard/earnings", label: "Earnings", short: "Earnings", icon: "💰" },
  { href: "/dashboard/profile", label: "Profile", short: "Profile", icon: "👤" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [role, setRole] = useState(null); // null means "we don't know yet"

  // Ask who the user is, to decide which links to show
  useEffect(() => {
    let cancelled = false;
    fetch("/api/users/me")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setRole(data.user?.role ?? "rider");
      })
      .catch(() => {
        if (!cancelled) setRole("rider");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Is this link the page we're on? The overview must match exactly,
  // and the others also match their sub-pages (like /dashboard/history/...).
  function isActive(link) {
    return [link.href, ...(link.also ?? [])].some((path) =>
      path === "/dashboard"
        ? pathname === path
        : pathname === path || pathname.startsWith(path + "/")
    );
  }

  const links = role === null ? null : role === "driver" ? DRIVER_LINKS : RIDER_LINKS;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-white md:static md:inset-auto md:w-56 md:shrink-0 md:border-r md:border-t-0"
    >
      <ul className="flex md:flex-col md:gap-1 md:p-4">
        {/* While we don't know the role yet, show grey placeholders instead of links that may change */}
        {links === null &&
          [0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="flex-1 p-3 md:flex-none md:p-0">
              <Skeleton className="h-8 w-full md:h-11" />
            </li>
          ))}

        {links?.map((link) => {
          const active = isActive(link);
          return (
            <li key={link.href} className="flex-1 md:flex-none">
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 border-t-2 px-1 py-2 text-xs font-medium md:min-h-11 md:flex-row md:justify-start md:gap-3 md:rounded md:border-t-0 md:px-4 md:text-sm ${
                  active
                    ? "border-black text-black md:bg-black md:text-white"
                    : "border-transparent text-gray-500 hover:text-black md:hover:bg-gray-100"
                }`}
              >
                <span aria-hidden="true" className="text-xl leading-none md:text-base">
                  {link.icon}
                </span>
                <span className="md:hidden">{link.short}</span>
                <span className="hidden md:inline">{link.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}