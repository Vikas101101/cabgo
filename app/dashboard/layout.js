import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({ children }) {
  return (
    <div className="flex min-h-[80vh] flex-col bg-gray-100 text-gray-900 md:flex-row">
      <Sidebar />
      <div className="flex-1 p-6">{children}</div>
    </div>
  );
}