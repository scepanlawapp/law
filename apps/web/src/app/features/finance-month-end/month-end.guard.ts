import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AuthState } from "@law/security";
import { canRunMonthEnd } from "../../shared/billing";

/** The month-end run is OWNER only; everyone else lands on the statements. */
export const monthEndGuard: CanActivateFn = () =>
  canRunMonthEnd(inject(AuthState).activeWorkspace()?.role)
    ? true
    : inject(Router).createUrlTree(["/finance/statements"]);
