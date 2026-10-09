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
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { LocalizationService } from "../../../core/localization/localization.service";
import { createSelectItemToString, SelectOption } from "../../../shared/utils";
@Component({
  selector: "law-report-select",
  standalone: true,
  host: { class: "block min-w-0" },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, HlmSelectImports, HlmLabel, TranslatePipe],
  template: `
    <label hlmLabel [for]="controlId()">{{ label() | translate }}</label>
    <hlm-select
      [formControl]="control()"
      [itemToString]="display()"
      class="mt-2 min-w-0"
    >
      <hlm-select-trigger [buttonId]="controlId()" class="w-full min-w-0">
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
export class ReportSelectComponent {
  readonly controlId = input.required<string>();
  readonly label = input.required<string>();
  readonly control = input.required<FormControl<string>>();
  readonly options = input.required<ReadonlyArray<SelectOption>>();
  readonly localization = inject(LocalizationService);
  readonly display = computed(() =>
    (() => {
      const options = this.options();
      const display = createSelectItemToString(options, (key) =>
        this.localization.translate(key),
      );
      return (value: string | null | undefined) =>
        options.some((option) => option.value === value)
          ? display(value)
          : this.localization.translate("report.unavailable");
    })(),
  );
}
