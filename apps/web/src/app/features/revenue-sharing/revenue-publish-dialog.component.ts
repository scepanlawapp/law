import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from "@angular/forms";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from "@spartan-ng/helm/dialog";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmLabel } from "@spartan-ng/helm/label";
import { TranslatePipe } from "../../core/localization/translate.pipe";

export interface RevenuePublishDialogContext {
  version: number;
  effectiveFrom: string;
  minimumDate: string;
  reason: string;
  summary: { label: string; oldValue: string; newValue: string }[];
}

export interface RevenuePublishDialogResult {
  effectiveFrom: string;
  reason: string;
}

const notBefore =
  (minimumDate: string): ValidatorFn =>
  (control: AbstractControl): ValidationErrors | null =>
    control.value && control.value < minimumDate ? { minimumDate: true } : null;

@Component({
  selector: "law-revenue-publish-dialog",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmInput,
    HlmLabel,
    TranslatePipe,
  ],
  host: { class: "flex h-full min-h-0 max-h-full flex-col" },
  template: `
    <form
      [formGroup]="form"
      (submit)="$event.preventDefault(); publish()"
      class="flex min-h-0 flex-1 flex-col overflow-hidden"
      novalidate
    >
      <hlm-dialog-header class="shrink-0">
        <h2 hlmDialogTitle>{{ "revenue.publishDialogTitle" | translate }}</h2>
        <p hlmDialogDescription>
          {{ "revenue.publishDialogDescription" | translate }}
        </p>
      </hlm-dialog-header>

      <div class="min-h-0 flex-1 space-y-5 overflow-y-auto py-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label hlmLabel for="revenue-publish-date">
              {{ "revenue.effectiveFrom" | translate }}
            </label>
            <input
              hlmInput
              id="revenue-publish-date"
              type="date"
              formControlName="effectiveFrom"
              [attr.min]="context.minimumDate"
              class="mt-2 w-full"
              [attr.aria-invalid]="
                form.controls.effectiveFrom.touched &&
                form.controls.effectiveFrom.invalid
              "
            />
            @if (
              form.controls.effectiveFrom.touched &&
              form.controls.effectiveFrom.hasError("minimumDate")
            ) {
              <p class="mt-1 text-sm text-destructive" role="alert">
                {{ "revenue.publicationDateError" | translate }}
              </p>
            }
          </div>
          <div>
            <label hlmLabel for="revenue-publish-version">
              {{ "revenue.nextVersion" | translate }}
            </label>
            <input
              hlmInput
              id="revenue-publish-version"
              class="mt-2 w-full"
              [value]="context.version"
              readonly
            />
          </div>
        </div>

        <div>
          <label hlmLabel for="revenue-publish-reason">
            {{ "revenue.reason" | translate }}
          </label>
          <textarea
            hlmInput
            id="revenue-publish-reason"
            formControlName="reason"
            rows="3"
            class="mt-2 w-full"
            [attr.aria-invalid]="
              form.controls.reason.touched && form.controls.reason.invalid
            "
          ></textarea>
          @if (form.controls.reason.touched && form.controls.reason.invalid) {
            <p class="mt-1 text-sm text-destructive" role="alert">
              {{ "revenue.reasonRequired" | translate }}
            </p>
          }
        </div>

        <section class="space-y-2 rounded-md border bg-card p-4">
          <h3 class="font-medium">
            {{ "revenue.publishSummary" | translate }}
          </h3>
          @for (change of context.summary; track $index) {
            <div
              class="grid gap-1 border-t py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <p class="font-medium">{{ change.label }}</p>
              <p class="text-sm text-muted-foreground">
                <span>{{ change.oldValue }}</span>
                <span aria-hidden="true">→</span>
                <span class="text-foreground">{{ change.newValue }}</span>
              </p>
            </div>
          } @empty {
            <p class="text-sm text-muted-foreground">
              {{ "revenue.noValueChanges" | translate }}
            </p>
          }
        </section>

        <p class="text-sm text-muted-foreground">
          {{ "revenue.immutablePublicationHelp" | translate }}
        </p>
      </div>

      <hlm-dialog-footer class="shrink-0 pt-4">
        <button
          hlmBtn
          type="button"
          variant="outline"
          (click)="dialogRef.close(undefined)"
        >
          {{ "common.cancel" | translate }}
        </button>
        <button hlmBtn type="submit">
          {{ "revenue.publish" | translate }}
        </button>
      </hlm-dialog-footer>
    </form>
  `,
})
export class RevenuePublishDialogComponent {
  readonly context = injectBrnDialogContext<RevenuePublishDialogContext>();
  readonly dialogRef =
    inject<BrnDialogRef<RevenuePublishDialogResult | undefined>>(BrnDialogRef);
  readonly form = new FormGroup({
    effectiveFrom: new FormControl(this.context.effectiveFrom, {
      nonNullable: true,
      validators: [Validators.required, notBefore(this.context.minimumDate)],
    }),
    reason: new FormControl(this.context.reason, {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  publish(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.dialogRef.close(this.form.getRawValue());
  }
}
