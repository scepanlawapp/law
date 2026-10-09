import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { RevenueRate } from "@law/api-interfaces";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmLabel } from "@spartan-ng/helm/label";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import {
  RevenueSelectComponent,
  revenueOptions,
} from "./revenue-select.component";
export const makeRateForm = (inherit = false) =>
  new FormGroup(
    {
      state: new FormControl<string>(inherit ? "INHERIT" : "UNCONFIGURED", {
        nonNullable: true,
      }),
      percentage: new FormControl("", { nonNullable: true }),
    },
    {
      validators: (group) => {
        const state = group.get("state")?.value;
        const percentage = group.get("percentage")?.value;
        return state !== "PERCENTAGE" ||
          (/^(?:0|[1-9]\d?|100)(?:\.\d{1,2})?$/.test(percentage) &&
            Number(percentage) <= 100)
          ? null
          : { percentage: true };
      },
    },
  );
export type RevenueRateForm = ReturnType<typeof makeRateForm>;
export function readRate(form: RevenueRateForm): RevenueRate {
  const value = form.getRawValue();
  return {
    state: value.state as RevenueRate["state"],
    percentage: value.state === "PERCENTAGE" ? value.percentage : null,
  };
}
export function writeRate(form: RevenueRateForm, rate: RevenueRate) {
  form.setValue({ state: rate.state, percentage: rate.percentage ?? "" });
}
@Component({
  selector: "law-revenue-rate",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RevenueSelectComponent,
    HlmInput,
    HlmLabel,
    TranslatePipe,
  ],
  template: `
    <div class="grid gap-3 sm:grid-cols-2">
      <law-revenue-select
        [id]="id() + '-state'"
        [label]="label()"
        [control]="form().controls.state"
        [options]="inherit() ? individualStates : defaultStates"
      />
      @if (form().controls.state.value === "PERCENTAGE") {
        <div>
          <label hlmLabel [for]="id() + '-percentage'">
            {{ "revenue.percentage" | translate }}
          </label>
          <input
            hlmInput
            class="mt-2 w-full"
            [id]="id() + '-percentage'"
            inputmode="decimal"
            [formControl]="form().controls.percentage"
            [attr.aria-describedby]="id() + '-help'"
          />
          <p class="text-sm text-muted-foreground mt-1" [id]="id() + '-help'">
            {{ "revenue.percentageHelp" | translate }}
          </p>
          @if (
            form().invalid ||
            (form().controls.percentage.touched &&
              !form().controls.percentage.value)
          ) {
            <p class="text-sm text-destructive">
              {{ "revenue.error.INVALID_INPUT" | translate }}
            </p>
          }
        </div>
      }
    </div>
  `,
})
export class RevenueRateComponent {
  readonly form = input.required<RevenueRateForm>();
  readonly label = input.required<string>();
  readonly id = input.required<string>();
  readonly inherit = input(false);
  readonly defaultStates = revenueOptions([
    "UNCONFIGURED",
    "EXCLUDED",
    "PERCENTAGE",
  ]);
  readonly individualStates = revenueOptions([
    "INHERIT",
    "UNCONFIGURED",
    "EXCLUDED",
    "PERCENTAGE",
  ]);
}
