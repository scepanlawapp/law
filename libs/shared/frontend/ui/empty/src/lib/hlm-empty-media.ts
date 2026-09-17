import { Directive, input } from "@angular/core";
import { classes } from "@spartan-ng/helm/utils";
import { cva, type VariantProps } from "class-variance-authority";

const emptyMediaVariants = cva(
  "mb-2 flex shrink-0 items-center justify-center [&_ng-icon]:pointer-events-none [&_ng-icon]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground [&_ng-icon:not([class*='text-'])]:text-[length:--spacing(4)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type EmptyMediaVariants = VariantProps<typeof emptyMediaVariants>;

@Directive({
  selector: "[hlmEmptyMedia],hlm-empty-media",
  host: {
    "data-slot": "empty-media",
    "[attr.data-variant]": "variant()",
  },
})
export class HlmEmptyMedia {
  readonly variant = input<EmptyMediaVariants["variant"]>();

  constructor() {
    classes(() => emptyMediaVariants({ variant: this.variant() }));
  }
}