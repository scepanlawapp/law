import {
  ChangeDetectionStrategy,
  Component,
  inject,
  viewChild,
} from "@angular/core";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import {
  HlmDialogHeader,
  HlmDialogTitle,
  HlmDialogDescription,
  HlmDialogFooter,
} from "@spartan-ng/helm/dialog";
import { HlmButton } from "@spartan-ng/helm/button";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { RevenueSharingComponent } from "./revenue-sharing.component";

@Component({
  selector: "law-revenue-version-dialog",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HlmDialogHeader,
    HlmDialogTitle,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmButton,
    TranslatePipe,
    RevenueSharingComponent,
  ],
  host: { class: "flex min-h-0 flex-col" },
  template: `
    <hlm-dialog-header>
      <h2 hlmDialogTitle>{{ "revenue.createVersion" | translate }}</h2>
      <p hlmDialogDescription>{{ "revenue.pageDescription" | translate }}</p>
    </hlm-dialog-header>
    <div class="min-h-0 flex-1 overflow-y-auto">
      <law-revenue-sharing (published)="saved()" />
    </div>
    <hlm-dialog-footer class="pt-4">
      <button
        hlmBtn
        variant="outline"
        type="button"
        [disabled]="editor()?.saving()"
        (click)="cancel()"
      >
        {{ "common.cancel" | translate }}
      </button>
    </hlm-dialog-footer>
  `,
})
export class RevenueVersionDialogComponent {
  private readonly ref = inject<BrnDialogRef<boolean>>(BrnDialogRef);
  readonly editor = viewChild(RevenueSharingComponent);
  constructor() {
    injectBrnDialogContext<{
      register: (dialog: RevenueVersionDialogComponent) => void;
    }>().register(this);
  }
  close() {
    this.ref.close();
  }
  saved() {
    this.ref.close(true);
  }
  async cancel() {
    if (await this.editor()?.confirmLeave()) this.ref.close();
  }
  confirmLeave() {
    return this.editor()?.confirmLeave() ?? Promise.resolve(true);
  }
}
