import { RevenueCombination, RevenueScope } from "@law/api-interfaces";
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
import { HlmSwitch } from "@spartan-ng/helm/switch";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { RevenueSelectComponent } from "./revenue-select.component";
import type { RevenueSharingComponent } from "./revenue-sharing.component";

const SCOPES_WITHOUT_ID: readonly string[] = [
  RevenueScope.FIRM,
  RevenueScope.MEMBER,
];

export interface RevenueRuleDialogContext {
  editor: RevenueSharingComponent;
}

@Component({
  selector: "law-revenue-rule-dialog",
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
    HlmSwitch,
    TranslatePipe,
    RevenueSelectComponent,
  ],
  template: `
    <hlm-dialog-header>
      <h2 hlmDialogTitle>{{ "revenue.specialRule" | translate }}</h2>
      <p hlmDialogDescription>
        {{ "revenue.ruleDialogDescription" | translate }}
      </p>
    </hlm-dialog-header>

    @if (editor.historicalRule()) {
      <p class="text-sm text-muted-foreground">
        {{ "revenue.historicalRuleHelp" | translate }}
      </p>
    }
    @if (editor.error()) {
      <p role="alert" class="text-sm text-destructive">
        {{ editor.error() | translate }}
      </p>
    }

    <div class="grid gap-4 py-4 sm:grid-cols-2">
      <law-revenue-select
        id="rule-member"
        label="revenue.memberId"
        [control]="editor.ruleEditor.controls.memberId"
        [options]="editor.memberOptions()"
      />
      <law-revenue-select
        id="rule-scope"
        label="revenue.scopeType"
        [control]="editor.ruleEditor.controls.scopeType"
        [options]="editor.scopeTypes"
      />
      @if (
        !scopesWithoutId.includes(editor.ruleEditor.controls.scopeType.value)
      ) {
        <law-revenue-select
          id="rule-scope-id"
          label="revenue.scopeId"
          [control]="editor.ruleEditor.controls.scopeId"
          [options]="editor.scopeOptions()"
        />
      }
      <law-revenue-select
        id="rule-category"
        label="revenue.earningType"
        [control]="editor.ruleEditor.controls.earningType"
        [options]="editor.categories"
      />
      <law-revenue-select
        id="rule-origin"
        label="revenue.clientOrigin"
        [control]="editor.ruleEditor.controls.clientOrigin"
        [options]="editor.originOrAny"
      />
      <div>
        <label hlmLabel for="rule-percent">
          {{ "revenue.percentage" | translate }}
        </label>
        <input
          hlmInput
          id="rule-percent"
          type="text"
          class="mt-2 w-full"
          [formControl]="editor.ruleEditor.controls.percentage"
        />
      </div>
      <law-revenue-select
        id="rule-basis"
        label="revenue.revenueBasis"
        [control]="editor.ruleEditor.controls.revenueBasis"
        [options]="editor.bases"
      />
      <law-revenue-select
        id="rule-combination"
        label="revenue.combinationMode"
        [control]="editor.ruleEditor.controls.combinationMode"
        [options]="editor.combinations"
      />
      @if (
        editor.ruleEditor.controls.combinationMode.value ===
        RevenueCombination.EXCLUSIVE_SPLIT
      ) {
        <div>
          <label hlmLabel for="rule-pool">
            {{ "revenue.poolId" | translate }}
          </label>
          <input
            hlmInput
            id="rule-pool"
            type="text"
            class="mt-2 w-full"
            [formControl]="editor.ruleEditor.controls.poolId"
          />
        </div>
      }
      <div>
        <label hlmLabel for="rule-from">
          {{ "revenue.effectiveFrom" | translate }}
        </label>
        <input
          hlmInput
          id="rule-from"
          type="date"
          class="mt-2 w-full"
          [formControl]="editor.ruleEditor.controls.effectiveFrom"
        />
      </div>
      <div>
        <label hlmLabel for="rule-to">
          {{ "revenue.effectiveTo" | translate }}
        </label>
        <input
          hlmInput
          id="rule-to"
          type="date"
          class="mt-2 w-full"
          [formControl]="editor.ruleEditor.controls.effectiveTo"
        />
      </div>
    </div>

    <div class="flex items-center gap-3">
      <hlm-switch
        inputId="rule-active"
        [formControl]="editor.ruleEditor.controls.active"
      />
      <label hlmLabel for="rule-active">
        {{ "revenue.active" | translate }}
      </label>
    </div>
    <div class="mt-4">
      <label hlmLabel for="rule-description">
        {{ "revenue.description" | translate }}
      </label>
      <input
        hlmInput
        id="rule-description"
        type="text"
        class="mt-2 w-full"
        [formControl]="editor.ruleEditor.controls.description"
      />
    </div>
    @if (
      editor.ruleEditor.controls.scopeType.value === RevenueScope.WORK_EVENT
    ) {
      <p class="mt-4 text-sm text-muted-foreground">
        {{ "revenue.eventScopeHelp" | translate }}
      </p>
    }

    <hlm-dialog-footer class="mt-5">
      <button hlmBtn variant="outline" type="button" (click)="cancel()">
        {{ "common.cancel" | translate }}
      </button>
      <button hlmBtn type="button" (click)="apply()">
        {{ "revenue.applyDraft" | translate }}
      </button>
    </hlm-dialog-footer>
  `,
})
export class RevenueRuleDialogComponent {
  readonly RevenueCombination = RevenueCombination;
  readonly RevenueScope = RevenueScope;
  readonly scopesWithoutId = SCOPES_WITHOUT_ID;
  readonly editor = injectBrnDialogContext<RevenueRuleDialogContext>().editor;
  readonly dialogRef = inject<BrnDialogRef<boolean | undefined>>(BrnDialogRef);

  apply(): void {
    this.editor.stageRule();
    if (!this.editor.ruleEditor.invalid) this.dialogRef.close(true);
  }

  async cancel(): Promise<void> {
    if (await this.editor.cancelEditor()) this.dialogRef.close(undefined);
  }
}
