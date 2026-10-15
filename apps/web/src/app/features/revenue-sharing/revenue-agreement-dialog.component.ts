import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from "@spartan-ng/helm/dialog";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmLabel } from "@spartan-ng/helm/label";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { RevenueRateComponent } from "./revenue-rate.component";
import { RevenueSelectComponent } from "./revenue-select.component";
import type { RevenueSharingComponent } from "./revenue-sharing.component";

export interface RevenueAgreementDialogContext {
  editor: RevenueSharingComponent;
}

@Component({
  selector: "law-revenue-agreement-dialog",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmInput,
    HlmLabel,
    TranslatePipe,
    RevenueRateComponent,
    RevenueSelectComponent,
  ],
  host: { class: "flex min-h-0 max-h-full flex-col" },
  template: `
    <hlm-dialog-header class="shrink-0">
      <h2 hlmDialogTitle>
        {{ editor.memberName(editor.agreementEditor.controls.memberId.value) }}
      </h2>
      <p hlmDialogDescription>
        {{
          editor.memberRoleName(editor.agreementEditor.controls.memberId.value)
        }}
        · {{ "revenue.agreementDialogDescription" | translate }}
      </p>
    </hlm-dialog-header>

    @if (editor.historicalAgreement()) {
      <p class="rounded-md bg-muted p-3 text-sm text-muted-foreground">
        {{ "revenue.historicalHelp" | translate }}
      </p>
    }
    @if (editor.error()) {
      <p role="alert" class="text-sm text-destructive">
        {{ editor.error() | translate }}
      </p>
    }

    <div class="min-h-0 flex-1 space-y-5 overflow-y-auto py-4">
      <law-revenue-select
        id="agreement-type"
        label="revenue.agreementType"
        [control]="editor.agreementEditor.controls.agreementType"
        [options]="editor.agreementTypes"
      />
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label hlmLabel for="agreement-from">
            {{ "revenue.effectiveFrom" | translate }}
          </label>
          <input
            hlmInput
            id="agreement-from"
            type="date"
            class="mt-2 w-full"
            [formControl]="editor.agreementEditor.controls.effectiveFrom"
          />
        </div>
        <div>
          <label hlmLabel for="agreement-to">
            {{ "revenue.effectiveTo" | translate }}
          </label>
          <input
            hlmInput
            id="agreement-to"
            type="date"
            class="mt-2 w-full"
            [formControl]="editor.agreementEditor.controls.effectiveTo"
          />
        </div>
      </div>

      @if (
        editor.agreementEditor.controls.agreementType.value === "INDIVIDUAL"
      ) {
        <section class="space-y-4 rounded-md border bg-card p-4">
          <h3 class="font-medium">
            {{ "revenue.individualRates" | translate }}
          </h3>
          @for (origin of editor.origins; track origin) {
            <law-revenue-rate
              [id]="'agreement-' + origin"
              [label]="'revenue.enum.' + origin"
              [form]="editor.agreementEditor.controls.rates.controls[origin]"
              [inherit]="true"
            />
          }
          <law-revenue-rate
            id="agreement-bonus"
            label="revenue.originationRate"
            [form]="editor.agreementEditor.controls.originationRate"
            [inherit]="true"
          />
          <law-revenue-select
            id="agreement-self"
            label="revenue.selfOrigination"
            [control]="editor.agreementEditor.controls.selfOrigination"
            [options]="editor.selfOptions"
          />
          <p class="text-sm text-muted-foreground">
            {{ "revenue.inheritanceHelp" | translate }}
          </p>
        </section>
      }

      <section class="space-y-4 rounded-md border bg-card p-4">
        <h3 class="font-medium">{{ "revenue.departurePolicy" | translate }}</h3>
        <law-revenue-select
          id="agreement-departure"
          label="revenue.departurePolicy"
          [control]="editor.agreementEditor.controls.departurePolicy"
          [options]="editor.departurePolicies"
        />
        <div>
          <label hlmLabel for="agreement-cutoff">
            {{ "revenue.departureCutoffDate" | translate }}
          </label>
          <input
            hlmInput
            id="agreement-cutoff"
            type="date"
            class="mt-2 w-full"
            [formControl]="editor.agreementEditor.controls.departureCutoffDate"
          />
        </div>
        <div>
          <label hlmLabel for="agreement-description">
            {{ "revenue.description" | translate }}
          </label>
          <input
            hlmInput
            id="agreement-description"
            type="text"
            class="mt-2 w-full"
            [formControl]="editor.agreementEditor.controls.description"
          />
        </div>
      </section>
    </div>

    <hlm-dialog-footer class="shrink-0 border-t pt-4">
      <button hlmBtn variant="outline" type="button" (click)="cancel()">
        {{ "common.cancel" | translate }}
      </button>
      <button hlmBtn type="button" (click)="apply()">
        {{ "revenue.applyDraft" | translate }}
      </button>
    </hlm-dialog-footer>
  `,
})
export class RevenueAgreementDialogComponent {
  readonly editor =
    injectBrnDialogContext<RevenueAgreementDialogContext>().editor;
  readonly dialogRef = inject<BrnDialogRef<boolean | undefined>>(BrnDialogRef);

  apply(): void {
    if (this.editor.stageAgreement()) this.dialogRef.close(true);
  }

  async cancel(): Promise<void> {
    if (await this.editor.cancelEditor()) this.dialogRef.close(undefined);
  }
}
