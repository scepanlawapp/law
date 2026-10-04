import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AuthState } from "@law/security";
import { canManageBilling } from "../../../shared/billing";

/** Profitability is for OWNER/ADMIN; everyone else lands on the reports page. */
export const profitabilityGuard: CanActivateFn = () =>
  canManageBilling(inject(AuthState).activeWorkspace()?.role)
    ? true
    : inject(Router).createUrlTree(["/reports"]);
