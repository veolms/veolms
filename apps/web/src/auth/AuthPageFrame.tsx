import type { ReactNode } from "react";
import { SiteName } from "../site/SiteNameText";
import {
  loginCardColumnClasses,
  loginCardFrameClasses,
} from "./LoginCardParts";

export function AuthPageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <div className={`auth-page__container ${loginCardFrameClasses}`}>
        <div className={`auth-page__form-column ${loginCardColumnClasses}`}>
          {children}
        </div>
      </div>

      <p className="auth-page__footer">
        <span>
          &copy; 2026 <SiteName />. All rights reserved.
        </span>
      </p>
    </div>
  );
}
