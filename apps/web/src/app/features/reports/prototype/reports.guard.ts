import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AuthState } from "@law/security";
import { canManageBilling } from "../../../shared/billing";
export const companyReportsGuard: CanActivateFn = () =>
  canManageBilling(inject(AuthState).activeWorkspace()?.role) ||
  inject(Router).createUrlTree(["/reports/my-earnings"]);
