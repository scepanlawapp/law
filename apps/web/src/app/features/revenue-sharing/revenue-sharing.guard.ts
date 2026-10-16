import { inject } from "@angular/core";
import { CanActivateFn, CanDeactivateFn, Router } from "@angular/router";
import { AuthState } from "@law/security";
import { WorkspaceRole } from "@law/api-interfaces";
import type { RevenueVersionsComponent } from "./revenue-versions.component";
export const revenueSettingsGuard: CanActivateFn = () => {
  const role = inject(AuthState).activeWorkspace()?.role;
  return role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN
    ? true
    : inject(Router).createUrlTree(["/finance"]);
};
export const revenueUnsavedGuard: CanDeactivateFn<RevenueVersionsComponent> = (
  component,
) => component.confirmLeave();
