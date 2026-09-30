import { BooleanInput } from "@angular/cdk/coercion";
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideChevronDown } from "@ng-icons/lucide";
import {
  BrnComboboxAnchor,
  BrnComboboxPopoverTrigger,
  BrnComboboxTrigger,
} from "@spartan-ng/brain/combobox";
import { BrnFieldControlDescribedBy } from "@spartan-ng/brain/field";
import { hlm } from "@spartan-ng/helm/utils";
import type { ClassValue } from "clsx";

@Component({
  selector: "hlm-combobox-trigger",
  imports: [
    NgIcon,
    BrnComboboxAnchor,
    BrnComboboxTrigger,
    BrnComboboxPopoverTrigger,
    BrnFieldControlDescribedBy,
  ],
  providers: [provideIcons({ lucideChevronDown })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      brnComboboxTrigger
      brnComboboxAnchor
      brnComboboxPopoverTrigger
      brnFieldControlDescribedBy
      data-slot="combobox-trigger"
      [id]="buttonId()"
      [class]="_computedClass()"
      [forceInvalid]="forceInvalid()"
    >
      <ng-content />
      <ng-icon
        name="lucideChevronDown"
        class="text-muted-foreground text-[length:--spacing(4)] ms-auto"
      />
    </button>
  `,
})
export class HlmComboboxTrigger {
  private static _id = 0;

  public readonly userClass = input<ClassValue>("", {
    alias: "class",
  });
  protected readonly _computedClass = computed(() =>
    hlm(
      "border-border-interactive data-placeholder:text-muted-foreground bg-surface-field hover:bg-surface-field-hover hover:text-primary hover:[&_ng-icon]:text-primary focus-visible:border-ring focus-visible:ring-ring/40 data-[matches-spartan-invalid=true]:ring-destructive/25 data-[matches-spartan-invalid=true]:border-destructive gap-1.5 rounded-lg border py-2 ps-3 pe-2 text-sm text-foreground transition-colors focus-visible:ring-3 data-[matches-spartan-invalid=true]:ring-2 *:data-[slot=combobox-value]:gap-1.5 flex h-9 w-full min-w-0 max-w-full cursor-pointer items-center justify-between whitespace-nowrap outline-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:hover:text-muted-foreground disabled:[&_ng-icon]:text-muted-foreground *:data-[slot=combobox-value]:line-clamp-1 *:data-[slot=combobox-value]:min-w-0 *:data-[slot=combobox-value]:flex-1 *:data-[slot=combobox-value]:overflow-hidden *:data-[slot=combobox-value]:text-ellipsis *:data-[slot=combobox-value]:flex *:data-[slot=combobox-value]:items-center [&_ng-icon]:pointer-events-none [&_ng-icon]:shrink-0",
      this.userClass(),
    ),
  );

  public readonly buttonId = input<string>(
    `hlm-combobox-trigger-${HlmComboboxTrigger._id++}`,
  );

  public readonly forceInvalid = input<boolean, BooleanInput>(false, {
    transform: booleanAttribute,
  });
}
