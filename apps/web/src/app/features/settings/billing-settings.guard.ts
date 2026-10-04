import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AuthState } from "@law/security";
import { canManageBilling } from "../../shared/billing";

/** Billing settings are for OWNER/ADMIN; everyone else lands on profile settings. */
export const billingSettingsGuard: CanActivateFn = () =>
  canManageBilling(inject(AuthState).activeWorkspace()?.role)
    ? true
    : inject(Router).createUrlTree(["/settings/profile"]);
