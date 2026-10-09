import { inject } from "@angular/core";
import { CanActivateFn, CanDeactivateFn, Router } from "@angular/router";
import { AuthState } from "@law/security";
import type { RevenueSharingComponent } from "./revenue-sharing.component";
export const revenueSettingsGuard: CanActivateFn = () => {
  const role = inject(AuthState).activeWorkspace()?.role;
  return role === "OWNER" || role === "ADMIN"
    ? true
    : inject(Router).createUrlTree(["/finance"]);
};
export const revenueUnsavedGuard: CanDeactivateFn<RevenueSharingComponent> = (
  component,
) => component.confirmLeave();
