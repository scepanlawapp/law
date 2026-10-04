import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from "@angular/forms";
import { BillingSetupApiClient } from "@law/api-clients";
import type {
  RetainerAgreement,
  RetainerRule,
  ServiceCategory,
  UpsertRetainerAgreementRequest,
} from "@law/api-interfaces";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmComboboxContent,
  HlmComboboxEmpty,
  HlmComboboxInput,
  HlmComboboxItem,
  HlmComboboxList,
  HlmComboboxMultiple,
  HlmComboboxPortal,
  HlmComboboxTrigger,
} from "@spartan-ng/helm/combobox";
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
  isForbidden,
  normalizeMoney,
  positiveMoneyValidator,
} from "../../../shared/billing";
import {
  CURRENCY_OPTIONS,
  createCurrencyItemToString,
} from "../../../shared/currency";
import { ToastService } from "../../../shared/ui/toast/toast.service";
import { createSelectItemToString, SelectOption } from "../../../shared/utils";
import { officeToday } from "../../time/time-utils";

export interface RetainerAgreementDialogInput {
  clientId: string;
  /** The agreement being edited; `null` creates a new one. */
  agreement: RetainerAgreement | null;
}

const RULE_OPTIONS: ReadonlyArray<SelectOption<RetainerRule>> = [
  { value: "HOURLY", label: "retainers.rule.HOURLY" },
  { value: "AT", label: "retainers.rule.AT" },
  { value: "ABSORBED", label: "retainers.rule.ABSORBED" },
];

/** `validTo` is optional but, when present, must not precede `validFrom`. */
function validRangeValidator(group: AbstractControl): ValidationErrors | null {
  const from = group.get("validFrom")?.value as string | null;
  const to = group.get("validTo")?.value as string | null;
  return from && to && to < from ? { range: true } : null;
}

/** Creates or edits a retainer agreement; closes with the saved agreement. */
@Component({
  selector: "law-retainer-agreement-dialog",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmComboboxContent,
    HlmComboboxEmpty,
    HlmComboboxInput,
    HlmComboboxItem,
    HlmComboboxList,
    HlmComboboxMultiple,
    HlmComboboxPortal,
    HlmComboboxTrigger,
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
  templateUrl: "./retainer-agreement-dialog.component.html",
})
export class RetainerAgreementDialogComponent {
  private readonly api = inject(BillingSetupApiClient);
  private readonly toast = inject(ToastService);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly context =
    injectBrnDialogContext<RetainerAgreementDialogInput>();
  readonly dialogRef =
    inject<BrnDialogRef<RetainerAgreement | undefined>>(BrnDialogRef);

  private readonly existing = this.context.agreement;
  readonly isEdit = this.existing !== null;

  readonly ruleOptions = RULE_OPTIONS;
  readonly ruleItemToString = createSelectItemToString(RULE_OPTIONS, (key) =>
    this.localization.translate(key),
  );
  readonly currencyOptions = CURRENCY_OPTIONS;
  readonly currencyItemToString = createCurrencyItemToString((key) =>
    this.localization.translate(key),
  );

  readonly form = new FormGroup(
    {
      title: new FormControl(this.existing?.title ?? "", {
        nonNullable: true,
        validators: [Validators.required, Validators.pattern(/\S/)],
      }),
      monthlyFee: new FormControl(this.existing?.monthlyFee ?? "", {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.pattern(MONEY_INPUT_PATTERN),
        ],
      }),
      currency: new FormControl(this.existing?.currency ?? "RSD", {
        nonNullable: true,
        validators: [Validators.required],
      }),
      validFrom: new FormControl(this.existing?.validFrom ?? officeToday(), {
        nonNullable: true,
        validators: [Validators.required],
      }),
      validTo: new FormControl(this.existing?.validTo ?? "", {
        nonNullable: true,
      }),
      includedHours: new FormControl<number | null>(
        this.existing?.includedMinutes != null
          ? this.existing.includedMinutes / 60
          : null,
        { validators: [Validators.min(0)] },
      ),
      coveredCategoryIds: new FormControl<string[]>(
        this.existing?.coveredCategoryIds ?? [],
        { nonNullable: true },
      ),
      overageRule: new FormControl<RetainerRule>(
        this.existing?.overageRule ?? "ABSORBED",
        { nonNullable: true },
      ),
      overageHourlyRate: new FormControl(
        this.existing?.overageHourlyRate ?? "",
        { nonNullable: true },
      ),
      outOfScopeRule: new FormControl<RetainerRule>(
        this.existing?.outOfScopeRule ?? "HOURLY",
        { nonNullable: true },
      ),
      outOfScopeHourlyRate: new FormControl(
        this.existing?.outOfScopeHourlyRate ?? "",
        { nonNullable: true },
      ),
    },
    { validators: [validRangeValidator] },
  );

  readonly categories = signal<ServiceCategory[]>([]);
  readonly categoriesForbidden = signal(false);
  readonly coveredIds = signal<string[]>(
    this.existing?.coveredCategoryIds ?? [],
  );
  readonly saving = signal(false);
  readonly overlap = signal(false);

  /** Active categories, plus any inactive one the agreement already covers. */
  readonly categoryOptions = computed(() =>
    this.categories().filter(
      (category) => category.active || this.coveredIds().includes(category.id),
    ),
  );
  readonly categoryItemToString = (value: string | null | undefined): string =>
    value
      ? (this.categories().find((category) => category.id === value)?.name ??
        value)
      : "";
  readonly coveredLabel = computed(() =>
    this.coveredIds().map(this.categoryItemToString).join(", "),
  );

  constructor() {
    // A rate is required, and must be positive, only while its rule is HOURLY.
    this.bindRateRule("overageRule", "overageHourlyRate");
    this.bindRateRule("outOfScopeRule", "outOfScopeHourlyRate");

    this.api
      .listCategories()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => this.categories.set(items),
        error: (error) => {
          if (isForbidden(error)) this.categoriesForbidden.set(true);
        },
      });
  }

  private bindRateRule(
    ruleName: "overageRule" | "outOfScopeRule",
    rateName: "overageHourlyRate" | "outOfScopeHourlyRate",
  ): void {
    const rule = this.form.controls[ruleName];
    const rate = this.form.controls[rateName];
    const apply = (value: RetainerRule): void => {
      if (value === "HOURLY") {
        rate.setValidators([
          Validators.required,
          Validators.pattern(MONEY_INPUT_PATTERN),
          positiveMoneyValidator,
        ]);
        rate.enable({ emitEvent: false });
      } else {
        rate.clearValidators();
        rate.disable({ emitEvent: false });
      }
      rate.updateValueAndValidity({ emitEvent: false });
    };
    apply(rule.value);
    rule.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => apply(value));
  }

  setCovered(ids: string[]): void {
    this.coveredIds.set(ids);
    this.form.controls.coveredCategoryIds.setValue(ids);
    this.form.controls.coveredCategoryIds.markAsDirty();
  }

  hasError(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.touched && control.invalid;
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  submit(): void {
    this.overlap.set(false);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const body: UpsertRetainerAgreementRequest = {
      title: value.title.trim(),
      monthlyFee: normalizeMoney(value.monthlyFee) ?? "0",
      currency: value.currency,
      validFrom: value.validFrom,
      validTo: value.validTo || null,
      includedMinutes:
        value.includedHours === null
          ? null
          : Math.round(value.includedHours * 60),
      coveredCategoryIds: value.coveredCategoryIds,
      overageRule: value.overageRule,
      overageHourlyRate:
        value.overageRule === "HOURLY"
          ? normalizeMoney(value.overageHourlyRate)
          : null,
      outOfScopeRule: value.outOfScopeRule,
      outOfScopeHourlyRate:
        value.outOfScopeRule === "HOURLY"
          ? normalizeMoney(value.outOfScopeHourlyRate)
          : null,
    };
    this.saving.set(true);
    const request = this.existing
      ? this.api.updateRetainer(this.existing.id, body)
      : this.api.createRetainer(this.context.clientId, body);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.dialogRef.close(saved);
      },
      error: (error) => {
        this.saving.set(false);
        if ((error as { status?: number } | null)?.status === 409) {
          this.overlap.set(true);
        } else {
          this.toast.error(
            this.localization.translate("retainers.form.saveError"),
          );
        }
      },
    });
  }
}
