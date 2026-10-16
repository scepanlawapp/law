import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmLabel } from "@spartan-ng/helm/label";
import { HlmRadioGroupImports } from "@spartan-ng/helm/radio-group";
import { HlmSheetImports } from "@spartan-ng/helm/sheet";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { LocalizationService } from "../../core/localization/localization.service";
import { REVENUE_ENUM_LABELS, labelOf } from "../../shared/models";

const RoleCompensationType = {
  FIXED: "FIXED",
  PERCENTAGE: "PERCENTAGE",
  COMBINED: "COMBINED",
} as const;
type RoleCompensationType =
  (typeof RoleCompensationType)[keyof typeof RoleCompensationType];

const FIXED_AMOUNT_TYPES: readonly string[] = [
  RoleCompensationType.FIXED,
  RoleCompensationType.COMBINED,
];
const PERCENTAGE_TYPES: readonly string[] = [
  RoleCompensationType.PERCENTAGE,
  RoleCompensationType.COMBINED,
];

const percentagePattern = /^(?:|0|[1-9]\d?|100)(?:\.\d{1,2})?$/;
const amountPattern = /^(?:|0|[1-9]\d*)(?:\.\d{1,2})?$/;

@Component({
  selector: "law-revenue-role-model-sheet",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmInput,
    HlmLabel,
    HlmRadioGroupImports,
    HlmSheetImports,
    TranslatePipe,
  ],
  template: `
    <hlm-sheet
      side="right"
      [state]="sheetState()"
      (stateChanged)="onStateChanged($event)"
    >
      <hlm-sheet-content
        *hlmSheetPortal
        class="w-full overflow-hidden p-5 sm:max-w-xl"
        [showCloseButton]="false"
      >
        @if (role(); as currentRole) {
          <hlm-sheet-header class="shrink-0">
            <h2 hlmSheetTitle>
              {{ roleLabel(currentRole) }}
            </h2>
            <p hlmSheetDescription>
              {{ "revenue.roleModelSheetDescription" | translate }}
            </p>
          </hlm-sheet-header>

          <div class="min-h-0 flex-1 space-y-5 overflow-y-auto py-2">
            <section class="rounded-md border bg-card p-4">
              <h3 class="font-medium">
                {{ "revenue.currentRoleModel" | translate }}
              </h3>
              <p class="mt-2 text-sm text-muted-foreground">
                {{ "revenue.roleDefaultUnavailable" | translate }}
              </p>
              <p class="mt-2 text-sm text-muted-foreground">
                {{ "revenue.roleSharedRulesClarification" | translate }}
              </p>
            </section>

            <form [formGroup]="form" class="space-y-5" novalidate>
              <fieldset>
                <legend class="mb-3 text-sm font-medium">
                  {{ "revenue.compensationModel" | translate }}
                </legend>
                <hlm-radio-group
                  formControlName="compensationType"
                  class="grid gap-3 sm:grid-cols-3"
                  [attr.aria-label]="'revenue.compensationModel' | translate"
                >
                  @for (model of modelOptions; track model.value) {
                    <label
                      class="flex min-h-20 cursor-pointer items-start gap-3 rounded-md border bg-card p-3 text-left transition-colors hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring data-[checked=true]:border-primary data-[checked=true]:bg-accent"
                      [for]="'role-model-' + model.value"
                    >
                      <hlm-radio
                        [value]="model.value"
                        [inputId]="'role-model-' + model.value"
                      >
                        <hlm-radio-indicator indicator />
                      </hlm-radio>
                      <span class="min-w-0">
                        <span class="block font-medium">
                          {{ model.label | translate }}
                        </span>
                        <span class="mt-1 block text-sm text-muted-foreground">
                          {{ model.description | translate }}
                        </span>
                      </span>
                    </label>
                  }
                </hlm-radio-group>
              </fieldset>

              @if (showsFixedAmount()) {
                <section class="space-y-3 rounded-md border bg-card p-4">
                  <h3 class="font-medium">
                    {{ "revenue.fixedMonthlyPay" | translate }}
                  </h3>
                  <div>
                    <label hlmLabel for="role-monthly-amount">
                      {{ "revenue.monthlyAmountNoCurrency" | translate }}
                    </label>
                    <input
                      hlmInput
                      id="role-monthly-amount"
                      type="text"
                      inputmode="decimal"
                      class="mt-2 w-full"
                      formControlName="monthlyAmount"
                      [attr.aria-invalid]="
                        form.controls.monthlyAmount.invalid &&
                        form.controls.monthlyAmount.touched
                      "
                    />
                    @if (
                      form.controls.monthlyAmount.invalid &&
                      form.controls.monthlyAmount.touched
                    ) {
                      <p class="mt-1 text-sm text-destructive" role="alert">
                        {{ "revenue.invalidAmount" | translate }}
                      </p>
                    }
                  </div>
                </section>
              }

              @if (showsPercentages()) {
                <section class="space-y-4 rounded-md border bg-card p-4">
                  <h3 class="font-medium">
                    {{ "revenue.workShare" | translate }}
                  </h3>
                  <div class="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label hlmLabel for="role-work-own">
                        {{ "revenue.workOwnClientPercent" | translate }}
                      </label>
                      <input
                        hlmInput
                        id="role-work-own"
                        type="text"
                        inputmode="decimal"
                        class="mt-2 w-full"
                        formControlName="workOwnClient"
                      />
                      @if (
                        form.controls.workOwnClient.invalid &&
                        form.controls.workOwnClient.touched
                      ) {
                        <p class="mt-1 text-sm text-destructive" role="alert">
                          {{ "revenue.error.INVALID_INPUT" | translate }}
                        </p>
                      }
                    </div>
                    <div>
                      <label hlmLabel for="role-work-other">
                        {{ "revenue.workOtherClientPercent" | translate }}
                      </label>
                      <input
                        hlmInput
                        id="role-work-other"
                        type="text"
                        inputmode="decimal"
                        class="mt-2 w-full"
                        formControlName="workOtherClient"
                      />
                      @if (
                        form.controls.workOtherClient.invalid &&
                        form.controls.workOtherClient.touched
                      ) {
                        <p class="mt-1 text-sm text-destructive" role="alert">
                          {{ "revenue.error.INVALID_INPUT" | translate }}
                        </p>
                      }
                    </div>
                  </div>
                  <p class="text-sm text-muted-foreground">
                    {{ "revenue.rolePercentagesNotAdded" | translate }}
                  </p>
                </section>

                <section class="space-y-3 rounded-md border bg-card p-4">
                  <h3 class="font-medium">
                    {{ "revenue.originationRate" | translate }}
                  </h3>
                  <div>
                    <label hlmLabel for="role-origination-bonus">
                      {{ "revenue.originationPercent" | translate }}
                    </label>
                    <input
                      hlmInput
                      id="role-origination-bonus"
                      type="text"
                      inputmode="decimal"
                      class="mt-2 w-full"
                      formControlName="originationBonus"
                    />
                    @if (
                      form.controls.originationBonus.invalid &&
                      form.controls.originationBonus.touched
                    ) {
                      <p class="mt-1 text-sm text-destructive" role="alert">
                        {{ "revenue.error.INVALID_INPUT" | translate }}
                      </p>
                    }
                  </div>
                  <p class="text-sm text-muted-foreground">
                    {{ "revenue.originationSeparateFromWork" | translate }}
                  </p>
                </section>
              }

              <p
                class="rounded-md border border-dashed p-4 text-sm text-muted-foreground"
                role="note"
              >
                {{ "revenue.roleModelNotPersisted" | translate }}
              </p>
            </form>
          </div>

          <hlm-sheet-footer class="shrink-0 border-t pt-4">
            <button
              hlmBtn
              variant="outline"
              type="button"
              (click)="requestClose()"
            >
              {{ "common.cancel" | translate }}
            </button>
            <button
              hlmBtn
              type="button"
              disabled
              [attr.aria-describedby]="'role-model-save-help'"
            >
              {{ "revenue.applyDraft" | translate }}
            </button>
          </hlm-sheet-footer>
          <p
            id="role-model-save-help"
            class="shrink-0 text-sm text-muted-foreground"
          >
            {{ "revenue.roleModelSaveUnavailable" | translate }}
          </p>
        }
      </hlm-sheet-content>
    </hlm-sheet>
  `,
})
export class RevenueRoleModelSheetComponent {
  // TODO(revenue-sharing): Requires role-keyed default compensation fields in the versioned API. Purpose: save per-role compensation models. Needed: role identifier, model type, work/origination percentages and fixed monthly amount in the publication contract.
  readonly role = input<string | null>(null);
  readonly closed = output<void>();
  readonly sheetState = signal<"open" | "closed">("closed");
  readonly modelOptions = [
    {
      value: RoleCompensationType.FIXED,
      label: "revenue.fixedCompensation",
      description: "revenue.monthlyCompensationDescription",
    },
    {
      value: RoleCompensationType.PERCENTAGE,
      label: "revenue.percentageCompensation",
      description: "revenue.transactionCompensationDescription",
    },
    {
      value: RoleCompensationType.COMBINED,
      label: "revenue.combinedCompensation",
      description: "revenue.combinedCompensationDescription",
    },
  ] as const;
  readonly form = new FormGroup({
    compensationType: new FormControl<RoleCompensationType | "">("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    monthlyAmount: new FormControl("", {
      nonNullable: true,
      validators: [Validators.pattern(amountPattern)],
    }),
    workOwnClient: new FormControl("", {
      nonNullable: true,
      validators: [Validators.pattern(percentagePattern), Validators.max(100)],
    }),
    workOtherClient: new FormControl("", {
      nonNullable: true,
      validators: [Validators.pattern(percentagePattern), Validators.max(100)],
    }),
    originationBonus: new FormControl("", {
      nonNullable: true,
      validators: [Validators.pattern(percentagePattern), Validators.max(100)],
    }),
  });
  private readonly confirm = inject(ConfirmDialogService);
  private readonly localization = inject(LocalizationService);

  constructor() {
    effect(() => {
      if (this.role()) {
        this.form.reset({
          compensationType: "",
          monthlyAmount: "",
          workOwnClient: "",
          workOtherClient: "",
          originationBonus: "",
        });
        this.sheetState.set("open");
      } else {
        this.sheetState.set("closed");
      }
    });
  }

  roleLabel(role: string): string {
    return labelOf(REVENUE_ENUM_LABELS, role, (key) =>
      this.localization.translate(key),
    );
  }

  showsFixedAmount() {
    return FIXED_AMOUNT_TYPES.includes(
      this.form.controls.compensationType.value,
    );
  }

  showsPercentages() {
    return PERCENTAGE_TYPES.includes(this.form.controls.compensationType.value);
  }

  onStateChanged(state: "open" | "closed") {
    if (state === "open") {
      this.sheetState.set("open");
      return;
    }
    if (this.role()) void this.requestClose();
  }

  async requestClose() {
    if (this.form.dirty) {
      const accepted = await firstValueFrom(
        this.confirm.confirm({
          title: "revenue.confirmTitle",
          message: "revenue.roleModelDiscard",
          confirmText: "common.confirm",
          cancelText: "common.cancel",
        }),
      );
      if (!accepted) {
        this.sheetState.set("open");
        return;
      }
    }
    this.form.reset();
    this.sheetState.set("closed");
    this.closed.emit();
  }
}
