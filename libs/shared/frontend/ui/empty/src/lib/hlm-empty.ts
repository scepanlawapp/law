import { Directive } from "@angular/core";
import { classes } from "@spartan-ng/helm/utils";

@Directive({
  selector: "[hlmEmpty],hlm-empty",
  host: { "data-slot": "empty" },
})
export class HlmEmpty {
  constructor() {
    classes(
      () =>
        "border-border-subtle bg-surface-section text-muted-foreground flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed p-6 text-center text-balance",
    );
  }
}
