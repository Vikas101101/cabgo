"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname();
  const [role, setRole] = useState(null); // null until we know

  // Ask who the user is, to decide which links to show
  useEffect(() => {
    fetch("/api/users/me")
      .then((res) => res.json())
      .then((data) => setRole(data.user?.role ?? null))
      .catch(() => {});
  }, []);

  const links = [
    { href: "/dashboard", label: "Overview" },
    // Only riders (and users whose role isn't known yet) get "Book a ride"
    ...(role !== "driver" ? [{ href: "/dashboard/book", label: "Book a ride" }] : []),
    { href: "/dashboard/driver", label: role === "driver" ? "Driver" : "Drive with us" },
    // Only drivers have earnings
    ...(role === "driver" ? [{ href: "/dashboard/earnings", label: "Earnings" }] : []),
    { href: "/dashboard/profile", label: "Profile" },
  ];

  return (
    <nav className="flex gap-2 overflow-x-auto border-b bg-white p-4 md:w-56 md:flex-col md:border-b-0 md:border-r">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`whitespace-nowrap rounded px-4 py-2 text-sm font-medium ${
            pathname === link.href
              ? "bg-black text-white"
              : "text-gray-700 hover:bg-gray-100"
          }`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}