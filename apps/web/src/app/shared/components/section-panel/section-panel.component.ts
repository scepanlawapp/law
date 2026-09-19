import { Component, input, output } from "@angular/core";
import { RouterLink } from "@angular/router";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { TranslatePipe } from "../../../core/localization/translate.pipe";

/**
 * Generic dashboard section shell: title, optional header action/link, and
 * shared loading/empty/error/unavailable state handling around projected content.
 */
@Component({
  selector: "app-section-panel",
  standalone: true,
  imports: [RouterLink, HlmButton, HlmSpinner, TranslatePipe],
  templateUrl: "./section-panel.component.html",
})
export class SectionPanelComponent {
  readonly titleKey = input.required<string>();
  readonly descriptionKey = input<string | undefined>(undefined);
  readonly actionLabelKey = input<string | undefined>(undefined);
  readonly actionLink = input<string | undefined>(undefined);

  readonly loading = input<boolean>(false);
  readonly error = input<boolean>(false);
  readonly empty = input<boolean>(false);
  readonly unavailable = input<boolean>(false);
  readonly emptyKey = input<string>("work.empty");
  readonly unavailableKey = input<string>("common.notAvailableYet");

  readonly retry = output<void>();
}
