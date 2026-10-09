import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideCheck } from "@ng-icons/lucide";
import { TranslatePipe } from "../../../core/localization/translate.pipe";

/** "Select all" row for the top of a multi-select combobox list. */
@Component({
  selector: "law-combobox-select-all",
  standalone: true,
  imports: [NgIcon, TranslatePipe],
  providers: [provideIcons({ lucideCheck })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
  template: `
    <button
      type="button"
      data-testid="combobox-select-all"
      class="hover:bg-surface-row-hover hover:text-primary focus-visible:bg-surface-row-hover relative flex min-h-9 w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm font-medium outline-hidden select-none disabled:pointer-events-none disabled:opacity-50"
      [disabled]="!values().length"
      [attr.aria-pressed]="allSelected()"
      (click)="toggle()"
    >
      {{
        (allSelected() ? "common.clearSelection" : "common.selectAll")
          | translate
      }}
      @if (allSelected()) {
        <ng-icon
          name="lucideCheck"
          class="pointer-events-none absolute end-2 text-[length:--spacing(4)]"
          aria-hidden="true"
        />
      }
    </button>
    <div class="bg-border -mx-1 my-1 h-px" aria-hidden="true"></div>
  `,
})
export class ComboboxSelectAllComponent {
  /** Every option the list offers: values, or objects with an `id` or `value`. */
  readonly options = input.required<readonly unknown[]>();
  readonly selected = input.required<readonly string[]>();
  readonly selectedChange = output<string[]>();

  protected readonly values = computed(() =>
    this.options().map((option) =>
      typeof option === "string"
        ? option
        : String(
            (option as { id?: string; value?: string }).id ??
              (option as { value?: string }).value,
          ),
    ),
  );

  readonly allSelected = computed(() => {
    const selected = new Set(this.selected());
    const values = this.values();
    return values.length > 0 && values.every((value) => selected.has(value));
  });

  toggle(): void {
    const values = new Set(this.values());
    this.selectedChange.emit(
      this.allSelected()
        ? this.selected().filter((value) => !values.has(value))
        : [...new Set([...this.selected(), ...values])],
    );
  }
}
