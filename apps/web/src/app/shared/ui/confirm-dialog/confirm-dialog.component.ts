import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from "@spartan-ng/helm/dialog";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideCircleAlert, lucideTriangleAlert } from "@ng-icons/lucide";
import type { ConfirmDialogData } from "./confirm-dialog.service";

@Component({
  selector: "app-confirm-dialog",
  standalone: true,
  imports: [
    HlmButton,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmDialogHeader,
    HlmDialogTitle,
    NgIcon,
  ],
  providers: [provideIcons({ lucideCircleAlert, lucideTriangleAlert })],
  templateUrl: "./confirm-dialog.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent {
  readonly data = injectBrnDialogContext<ConfirmDialogData>();
  private readonly dialogRef = inject(BrnDialogRef<boolean>);

  cancel(): void {
    this.dialogRef.close(false);
  }

  confirm(): void {
    this.dialogRef.close(true);
  }
}
