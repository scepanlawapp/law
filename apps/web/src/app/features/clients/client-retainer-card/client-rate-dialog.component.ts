import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { BillingSetupApiClient } from "@law/api-clients";
import type { ClientBillingProfile } from "@law/api-interfaces";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from "@spartan-ng/helm/dialog";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { LocalizationService } from "../../../core/localization/localization.service";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import {
  MONEY_INPUT_PATTERN,
  normalizeMoney,
  positiveMoneyValidator,
} from "../../../shared/billing";
import {
  CURRENCY_OPTIONS,
  createCurrencyItemToString,
} from "../../../shared/currency";
import { ToastService } from "../../../shared/ui/toast/toast.service";

export interface ClientRateDialogInput {
  clientId: string;
  profile: ClientBillingProfile | null;
}

/** Edits the client's own hourly rate (`ClientBillingProfile`); empty clears it. */
@Component({
  selector: "law-client-rate-dialog",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmField,
    HlmFieldLabel,
    HlmInput,
    HlmSelectImports,
    HlmSpinner,
    TranslatePipe,
  ],
  template: `
    <form
      [formGroup]="form"
      (submit)="$event.preventDefault(); submit()"
      novalidate
    >
      <hlm-dialog-header>
        <h2 hlmDialogTitle>{{ "retainers.clientRate.title" | translate }}</h2>
        <p hlmDialogDescription>
          {{ "retainers.clientRate.description" | translate }}
        </p>
      </hlm-dialog-header>

      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <div hlmField>
          <label hlmFieldLabel for="client-rate-value">
            {{ "retainers.clientRate.amount" | translate }}
          </label>
          <input
            hlmInput
            id="client-rate-value"
            inputmode="decimal"
            formControlName="hourlyRate"
            [attr.aria-invalid]="
              form.controls.hourlyRate.touched &&
              form.controls.hourlyRate.invalid
            "
          />
          @if (
            form.controls.hourlyRate.touched && form.controls.hourlyRate.invalid
          ) {
            <p class="text-destructive text-sm" role="alert">
              {{ "billing.invalidAmount" | translate }}
            </p>
          }
        </div>
        <div hlmField>
          <label hlmFieldLabel for="client-rate-currency">
            {{ "retainers.form.currency" | translate }}
          </label>
          <hlm-select
            formControlName="currency"
            [itemToString]="currencyItemToString"
          >
            <hlm-select-trigger buttonId="client-rate-currency" class="w-full">
              <hlm-select-value />
            </hlm-select-trigger>
            <hlm-select-content *hlmSelectPortal width="content">
              <hlm-select-group>
                @for (option of currencyOptions; track option.value) {
                  <hlm-select-item [value]="option.value">
                    {{ option.label | translate }}
                  </hlm-select-item>
                }
              </hlm-select-group>
            </hlm-select-content>
          </hlm-select>
        </div>
      </div>

      <hlm-dialog-footer class="mt-4">
        <button
          hlmBtn
          type="button"
          variant="outline"
          [disabled]="saving()"
          (click)="dialogRef.close(undefined)"
        >
          {{ "common.cancel" | translate }}
        </button>
        <button hlmBtn type="submit" [disabled]="saving()">
          @if (saving()) {
            <hlm-spinner />
          }
          {{ "common.save" | translate }}
        </button>
      </hlm-dialog-footer>
    </form>
  `,
})
export class ClientRateDialogComponent {
  private readonly api = inject(BillingSetupApiClient);
  private readonly toast = inject(ToastService);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly context = injectBrnDialogContext<ClientRateDialogInput>();
  readonly dialogRef =
    inject<BrnDialogRef<ClientBillingProfile | undefined>>(BrnDialogRef);

  readonly currencyOptions = CURRENCY_OPTIONS;
  readonly currencyItemToString = createCurrencyItemToString((key) =>
    this.localization.translate(key),
  );
  readonly saving = signal(false);
  readonly form = new FormGroup({
    hourlyRate: new FormControl(this.context.profile?.hourlyRate ?? "", {
      nonNullable: true,
      validators: [
        Validators.pattern(MONEY_INPUT_PATTERN),
        positiveMoneyValidator,
      ],
    }),
    currency: new FormControl(this.context.profile?.currency ?? "RSD", {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.api
      .upsertProfile(this.context.clientId, {
        hourlyRate: normalizeMoney(value.hourlyRate),
        currency: value.currency,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile) => {
          this.saving.set(false);
          this.dialogRef.close(profile);
        },
        error: () => {
          this.saving.set(false);
          this.toast.error(
            this.localization.translate("retainers.clientRate.saveError"),
          );
        },
      });
  }
}
