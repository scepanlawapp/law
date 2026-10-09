import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmLabel } from "@spartan-ng/helm/label";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { LocalizationService } from "../../core/localization/localization.service";
import { createSelectItemToString, SelectOption } from "../../shared/utils";
@Component({
  selector: "law-revenue-select",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, HlmSelectImports, HlmLabel, TranslatePipe],
  template: `
    <label hlmLabel [for]="id()">{{ label() | translate }}</label>
    <hlm-select
      [formControl]="control()"
      [itemToString]="itemToString()"
      class="mt-2 min-w-0"
    >
      <hlm-select-trigger [buttonId]="id()" class="w-full min-w-0 max-w-full">
        <hlm-select-value />
      </hlm-select-trigger>
      <hlm-select-content *hlmSelectPortal>
        @for (option of options(); track option.value) {
          <hlm-select-item [value]="option.value">
            {{ option.label | translate }}
          </hlm-select-item>
        }
      </hlm-select-content>
    </hlm-select>
  `,
})
export class RevenueSelectComponent {
  readonly control = input.required<FormControl<string>>();
  readonly options = input.required<ReadonlyArray<SelectOption>>();
  readonly label = input.required<string>();
  readonly id = input.required<string>();
  private readonly localization = inject(LocalizationService);
  readonly itemToString = computed(() => {
    const options = this.options();
    const display = createSelectItemToString(options, (key) =>
      this.localization.translate(key),
    );
    return (value: string | null | undefined) =>
      options.some((option) => option.value === value)
        ? display(value)
        : this.localization.translate("revenue.unavailable");
  });
}
export function revenueOptions(values: readonly string[]): SelectOption[] {
  return values.map((value) => ({ value, label: `revenue.enum.${value}` }));
}
