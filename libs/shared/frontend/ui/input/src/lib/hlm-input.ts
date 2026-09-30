import { Directive } from "@angular/core";
import { BrnFieldControlDescribedBy } from "@spartan-ng/brain/field";
import { BrnInput } from "@spartan-ng/brain/input";
import { classes } from "@spartan-ng/helm/utils";

@Directive({
  selector: "[hlmInput]",
  hostDirectives: [
    { directive: BrnInput, inputs: ["id", "forceInvalid"] },
    BrnFieldControlDescribedBy,
  ],
  host: { "data-slot": "input" },
})
export class HlmInput {
  constructor() {
    classes(
      () =>
        "border-border-interactive bg-surface-field hover:bg-surface-field-hover focus-visible:border-ring focus-visible:ring-ring/40 data-[matches-spartan-invalid=true]:ring-destructive/25 data-[matches-spartan-invalid=true]:border-destructive disabled:border-border-subtle disabled:bg-muted disabled:text-muted-foreground h-9 rounded-lg border px-3 py-1 text-base text-foreground transition-colors file:h-6 file:text-sm file:font-medium focus-visible:ring-3 data-[matches-spartan-invalid=true]:ring-2 md:text-sm file:text-foreground placeholder:text-muted-foreground w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-70",
    );
  }
}
