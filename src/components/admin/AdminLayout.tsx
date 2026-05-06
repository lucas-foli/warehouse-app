// src/components/admin/AdminLayout.tsx
import { Navigate, Outlet } from "react-router-dom";
import { usePlatformAdmin } from "../../context/PlatformAdminContext";

const AdminLayout = () => {
  const { isPlatformAdmin, loading } = usePlatformAdmin();
  if (loading) return null;
  if (!isPlatformAdmin) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 px-6 py-4">
        <h1 className="text-sm font-semibold uppercase tracking-[0.3em]">Platform admin</h1>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
