import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/sonner";
import { WashingMachine, LayoutDashboard, History, Settings, LogOut, LogIn, UserPlus, Menu, X } from "lucide-react";
import { useState } from "react";

function AppHeader() {
  const { user, isAuthenticated, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    await signOut();
    router.invalidate();
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <WashingMachine className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold tracking-tight">LaundryMS</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 md:flex">
          {isAuthenticated ? (
            <>
              <Link to="/" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&.active]:text-foreground">
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
              <Link to="/history" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&.active]:text-foreground">
                <History className="h-4 w-4" />
                History
              </Link>
              <Link to="/admin" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&.active]:text-foreground">
                <Settings className="h-4 w-4" />
                Admin
              </Link>
              <div className="flex items-center gap-3 pl-4 border-l border-border">
                <span className="text-sm text-muted-foreground">{user?.email}</span>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                to="/login"
                className="flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <LogIn className="h-4 w-4" />
                Login
              </Link>
              <Link
                to="/signup"
                className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <UserPlus className="h-4 w-4" />
                Sign Up
              </Link>
            </div>
          )}
        </nav>

        {/* Mobile menu button */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-md p-2 text-muted-foreground hover:bg-muted md:hidden"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="border-t border-border px-4 py-4 md:hidden">
          <div className="flex flex-col gap-2">
            {isAuthenticated ? (
              <>
                <Link to="/" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted">
                  <LayoutDashboard className="h-4 w-4" /> Dashboard
                </Link>
                <Link to="/history" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted">
                  <History className="h-4 w-4" /> History
                </Link>
                <Link to="/admin" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted">
                  <Settings className="h-4 w-4" /> Admin
                </Link>
                <button onClick={() => { handleLogout(); setMobileOpen(false); }} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10">
                  <LogOut className="h-4 w-4" /> Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted">
                  <LogIn className="h-4 w-4" /> Login
                </Link>
                <Link to="/signup" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted">
                  <UserPlus className="h-4 w-4" /> Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Laundry Management System" },
      { name: "description", content: "College Hostel Laundry Management System" },
      { property: "og:title", content: "Laundry Management System" },
      { property: "og:description", content: "College Hostel Laundry Management System" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "/src/styles.css?url",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen flex-col bg-background">
        <AppHeader />
        <main className="flex-1">
          <Outlet />
        </main>
        <Toaster position="top-right" />
      </div>
    </QueryClientProvider>
  );
}
