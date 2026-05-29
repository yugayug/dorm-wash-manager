import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
  beforeLoad: async () => {
    // Client-side auth check - the middleware handles server-side
  },
});

function AuthenticatedLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    throw redirect({ to: "/login" });
  }

  return <Outlet />;
}
