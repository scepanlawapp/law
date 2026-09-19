import { Component, inject, input, output } from "@angular/core";
import { ObligationItem } from "../../../features/dashboard/dashboard.models";
import { LocalizationService } from "../../../core/localization/localization.service";
import { TranslatePipe } from "../../../core/localization/translate.pipe";

/**
 * Compact, presentation-only preview of Task/Deadline/Event obligations.
 * Selection is delegated to the caller so it can open the right inspect/edit dialog.
 */
@Component({
  selector: "app-obligation-list",
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: "./obligation-list.component.html",
})
export class ObligationListComponent {
  private readonly localization = inject(LocalizationService);

  readonly items = input.required<ObligationItem[]>();
  readonly itemSelected = output<ObligationItem>();

  when(item: ObligationItem): string {
    const locale = this.localization.language() === "EN" ? "en-US" : "sr-RS";
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
