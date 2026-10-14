import { Component, computed, inject, input } from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { LocalizationService } from "../../core/localization/localization.service";
import { createSelectItemToString } from "../../shared/utils";
@Component({
  selector: "law-payment-select",
  standalone: true,
  imports: [ReactiveFormsModule, HlmSelectImports],
  template: `
    <label class="mb-1 block text-sm" [for]="controlId()">{{ label() }}</label>
    <hlm-select [formControl]="control()" [itemToString]="display()">
      <hlm-select-trigger
        [buttonId]="controlId()"
        class="w-full min-w-0 max-w-full"
      >
        <hlm-select-value [placeholder]="translate(emptyLabel())" />
      </hlm-select-trigger>
      <hlm-select-content *hlmSelectPortal>
        <hlm-select-group>
          @for (option of options(); track option.value) {
            <hlm-select-item [value]="option.value">
              {{ translate(option.label) }}
            </hlm-select-item>
          }
        </hlm-select-group>
      </hlm-select-content>
    </hlm-select>
  `,
})
export class PaymentSelectComponent {
  private readonly localization = inject(LocalizationService);
  readonly control = input.required<FormControl<string>>();
  readonly controlId = input.required<string>();
  readonly label = input.required<string>();
  readonly options =
    input.required<ReadonlyArray<{ value: string; label: string }>>();
  readonly translate = (key: string) => this.localization.translate(key);
  readonly emptyLabel = computed(
    () => this.options().find((o) => o.value === "")?.label ?? "Izaberite",
  );
  readonly display = computed(() =>
    createSelectItemToString(this.options(), this.translate),
  );
}
