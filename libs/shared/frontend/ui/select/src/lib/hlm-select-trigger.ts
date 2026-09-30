import type { BooleanInput } from "@angular/cdk/coercion";
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideChevronDown } from "@ng-icons/lucide";
import { BrnFieldControlDescribedBy } from "@spartan-ng/brain/field";
import { BrnSelectTrigger } from "@spartan-ng/brain/select";
import { hlm } from "@spartan-ng/helm/utils";
import type { ClassValue } from "clsx";

@Component({
  selector: "hlm-select-trigger",
  imports: [NgIcon, BrnSelectTrigger, BrnFieldControlDescribedBy],
  providers: [provideIcons({ lucideChevronDown })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      brnSelectTrigger
      brnFieldControlDescribedBy
      [forceInvalid]="forceInvalid()"
      [id]="buttonId()"
      [class]="_computedClass()"
      [attr.data-size]="size()"
      data-slot="select-trigger"
    >
      <ng-content />
      <ng-icon
        name="lucideChevronDown"
        class="text-muted-foreground text-[length:--spacing(4)] ms-auto"
      />
    </button>
  `,
})
export class HlmSelectTrigger {
  private static _id = 0;

  public readonly userClass = input<ClassValue>("", { alias: "class" });
  protected readonly _computedClass = computed(() =>
    hlm(
      "border-border-interactive data-placeholder:text-muted-foreground bg-surface-field hover:bg-surface-field-hover hover:text-primary hover:[&_ng-icon]:text-primary focus-visible:border-ring focus-visible:ring-ring/40 data-[matches-spartan-invalid=true]:ring-destructive/25 data-[matches-spartan-invalid=true]:border-destructive gap-1.5 rounded-lg border py-2 ps-3 pe-2 text-sm text-foreground transition-colors focus-visible:ring-3 data-[matches-spartan-invalid=true]:ring-2 data-[size=default]:h-9 data-[size=sm]:h-8 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:gap-1.5 flex w-full min-w-0 max-w-full cursor-pointer items-center justify-between whitespace-nowrap outline-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:hover:text-muted-foreground disabled:[&_ng-icon]:text-muted-foreground *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:flex-1 *:data-[slot=select-value]:overflow-hidden *:data-[slot=select-value]:text-ellipsis *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center [&_ng-icon]:pointer-events-none [&_ng-icon]:shrink-0",
      this.userClass(),
    ),
  );

  public readonly buttonId = input<string>(
    `hlm-select-trigger-${HlmSelectTrigger._id++}`,
  );

  public readonly size = input<"default" | "sm">("default");

  /** Whether to force the trigger into an invalid state. */
  public readonly forceInvalid = input<boolean, BooleanInput>(false, {
    transform: booleanAttribute,
  });
}
