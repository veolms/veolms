import { Outlet } from "react-router";
import { AuthBrandPanel } from "../auth/AuthBrandPanel";
import { useAuthAppearance } from "../auth/useAuthAppearance";
import { productName } from "../routing/routeDescriptors";
import "../auth/auth.css";
import "../auth/mfa-setup.css";

export default function AuthLayout() {
  useAuthAppearance();

  return (
    <div className="auth-page">
      <div className="auth-page__container">
        <div className="auth-page__form-column">
          <Outlet />
        </div>

        <div className="auth-page__brand-column">
          <AuthBrandPanel />
        </div>
      </div>

      <p className="auth-page__footer">
        <span>&copy; 2026 {productName}. All rights reserved.</span>
        <span aria-hidden="true" className="auth-page__footer-divider">
          |
        </span>
        <span className="auth-page__footer-tagline">Learn. Build. Grow.</span>
      </p>
    </div>
  );
}
