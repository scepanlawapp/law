import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { WorkspaceRole } from "@law/api-interfaces";
import { AuthState } from "@law/security";

/** Team time is for OWNER/ADMIN; everyone else lands on their own time. */
export const teamTimeGuard: CanActivateFn = () => {
  const role = inject(AuthState).activeWorkspace()?.role;
  return role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN
    ? true
    : inject(Router).createUrlTree(["/work/time"]);
};
