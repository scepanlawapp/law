import { Component, inject, input, output } from "@angular/core";
import { ObligationItem } from "../../../features/dashboard/dashboard.models";
import { LocalizationService } from "../../../core/localization/localization.service";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { WORK_RECORD_TYPE_LABELS } from "../../models";

/**
 * Compact, presentation-only preview of Task/Deadline/Event obligations.
 * Selection is delegated to the caller so it can open the right inspect/edit dialog.
 */
@Component({
  selector: "law-obligation-list",
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: "./obligation-list.component.html",
})
export class ObligationListComponent {
  private readonly localization = inject(LocalizationService);

  readonly items = input.required<ObligationItem[]>();
  readonly itemSelected = output<ObligationItem>();
  readonly recordTypeLabels = WORK_RECORD_TYPE_LABELS;

  when(item: ObligationItem): string {
    const locale = this.localization.locale();
    if (item.startsAt) {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(item.startsAt));
    }
    if (item.date) {
      return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
        new Date(`${item.date}T00:00:00`),
      );
    }
    return this.localization.translate("work.noDueDate");
  }
}
