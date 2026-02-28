import { useEffect, useState, type ReactNode } from "react";
import type { AuthService } from "./authService";

interface AuthGuardProps {
  authService: AuthService;
  redirectTo?: string;
  fallback?: ReactNode;
  children: ReactNode;
}

export function AuthGuard({
  authService,
  redirectTo = "/login",
  fallback = <div>Checking session...</div>,
  children
}: AuthGuardProps) {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    authService
      .isAuthenticated()
      .then((ok) => {
        if (!mounted) return;
        if (!ok) {
          const next = encodeURIComponent(window.location.pathname || "/");
          window.location.href = `${redirectTo}?next=${next}`;
          return;
        }
        setAllowed(true);
      })
      .catch(() => {
        if (!mounted) return;
        window.location.href = redirectTo;
      });

    return () => {
      mounted = false;
    };
  }, [authService, redirectTo]);

  if (allowed !== true) return <>{fallback}</>;
  return <>{children}</>;
}
