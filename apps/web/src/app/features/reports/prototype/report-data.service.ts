import { Injectable, inject } from "@angular/core";
import { AuthState } from "@law/security";
import { canManageBilling } from "../../../shared/billing";
import { demoDataset } from "./report-fixtures";
import { ReportDataset } from "./report-model";
import { scopePersonal } from "./report-selectors";
/** Replace this frontend-only mock boundary with permission-scoped API projections in a later delivery. */
@Injectable({ providedIn: "root" })
export class ReportDataService {
  private readonly auth = inject(AuthState);
  company(): ReportDataset {
    const user = this.auth.session()?.user;
    return user && canManageBilling(this.auth.activeWorkspace()?.role)
      ? demoDataset(user.id)
      : { members: [], records: [] };
  }
  personal(): ReportDataset {
    const user = this.auth.session()?.user;
    return user
      ? scopePersonal(demoDataset(user.id), user.id)
      : { members: [], records: [] };
  }
}
