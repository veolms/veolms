import { useEffect } from "react";
import { useNavigate } from "react-router";
import { LoginView } from "../auth/LoginView";
import { getAuthRouteMeta, productName } from "../routing/routeDescriptors";
import { useCurrentUser } from "../services/auth";
import { useAuthStore } from "../store/auth.store";

export function meta() {
  return Object.entries(
    getAuthRouteMeta(
      "Log in",
      `Log in to ${productName} with a secure one-time code.`,
    ),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
}

export default function LoginRoute() {
  const { data: user, isSuccess } = useCurrentUser();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated || (isSuccess && user)) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, isSuccess, user, navigate]);

  if (isAuthenticated || (isSuccess && user)) {
    return (
      <section
        aria-label="Redirecting"
        className="auth-card"
        style={{ minHeight: "220px", display: "grid", placeItems: "center" }}
      >
        <div
          className="auth-mfa-setup__spinner"
          style={{
            width: "28px",
            height: "28px",
            border: "2px solid var(--auth-line)",
            borderTopColor: "var(--accent)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
      </section>
    );
  }

  return <LoginView />;
}
