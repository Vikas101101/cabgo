import SessionGuard from "@/components/SessionGuard";
import Sidebar from "@/components/Sidebar";
import Notifications from "@/components/Notifications";

export const metadata = { title: "Dashboard" };

export default function DashboardLayout({ children }) {
  return (
    <div className="flex min-h-[80vh] flex-col bg-gray-100 text-gray-900 md:flex-row">
      {/* Invisible until a keyboard user tabs to it */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-black focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <SessionGuard />
      <Notifications />
      <Sidebar />

      {/* min-w-0 lets this area shrink, so a long address can't push the page wider than the screen.
          pb-24 leaves room for the bottom tab bar on phones. */}
      <main
        id="main-content"
        tabIndex={-1}
        className="min-w-0 flex-1 p-4 pb-24 focus:outline-none md:p-6 md:pb-6"
      >
        {children}
      </main>
    </div>
  );
}