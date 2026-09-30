import { Directive } from "@angular/core";
import { BrnFieldControlDescribedBy } from "@spartan-ng/brain/field";
import { BrnTextarea } from "@spartan-ng/brain/textarea";
import { classes } from "@spartan-ng/helm/utils";

@Directive({
  selector: "[hlmTextarea]",
  hostDirectives: [
    { directive: BrnTextarea, inputs: ["id", "forceInvalid"] },
    BrnFieldControlDescribedBy,
  ],
  host: { "data-slot": "textarea" },
})
export class HlmTextarea {
  constructor() {
    classes(
      () =>
        "border-border-interactive bg-surface-field hover:bg-surface-field-hover focus-visible:border-ring focus-visible:ring-ring/40 data-[matches-spartan-invalid=true]:ring-destructive/25 data-[matches-spartan-invalid=true]:border-destructive disabled:border-border-subtle disabled:bg-muted disabled:text-muted-foreground rounded-lg border px-3 py-2 text-base text-foreground transition-colors focus-visible:ring-3 data-[matches-spartan-invalid=true]:ring-2 md:text-sm placeholder:text-muted-foreground flex field-sizing-content min-h-20 w-full outline-none disabled:cursor-not-allowed disabled:opacity-70",
    );
  }
}
