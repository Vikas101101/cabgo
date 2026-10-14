"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The menu items. To add a page later, just add a line here.
const links = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/profile", label: "Profile" },
];

export default function Sidebar() {
  // usePathname tells us which page we're on, e.g. "/dashboard/profile"
  const pathname = usePathname();

  return (
    <nav className="flex gap-2 border-b bg-white p-4 md:w-56 md:flex-col md:border-b-0 md:border-r">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`rounded px-4 py-2 text-sm font-medium ${
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