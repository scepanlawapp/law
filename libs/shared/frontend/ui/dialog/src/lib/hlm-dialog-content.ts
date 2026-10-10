import type { BooleanInput } from "@angular/cdk/coercion";
import type { ComponentType } from "@angular/cdk/portal";
import { NgComponentOutlet } from "@angular/common";
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideX } from "@ng-icons/lucide";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import { HlmButton } from "@spartan-ng/helm/button";

import { classes } from "@spartan-ng/helm/utils";
import { HlmDialogClose } from "./hlm-dialog-close";

type HlmDialogContentContext = {
  $component?: ComponentType<unknown>;
  $dynamicComponentClass?: string;
  $showCloseButton?: boolean;
};

@Component({
  selector: "hlm-dialog-content",
  imports: [NgComponentOutlet, HlmButton, HlmDialogClose, NgIcon],
  providers: [provideIcons({ lucideX })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: flex !important;
      flex-direction: column;
      max-height: 95dvh !important;
      overflow: hidden !important;
    }

    :host
      ::ng-deep
      :is(div, form, section):has(> [data-slot="dialog-header"]):has(
        > [data-slot="dialog-footer"]
      ) {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
    }

    :host
      ::ng-deep
      :is(div, form, section):has(> [data-slot="dialog-header"]):has(
        > [data-slot="dialog-footer"]
      )
      > :not([data-slot="dialog-header"]):not([data-slot="dialog-footer"]),
    :host
      > :not([data-slot="dialog-header"]):not([data-slot="dialog-footer"]):not(
        [data-slot="dialog-component-wrapper"]
      ):not(button) {
      min-height: 0;
      flex: 1 1 auto;
      overflow-y: auto;
    }
  `,
  host: {
    "data-slot": "dialog-content",
    "[attr.data-state]": "state()",
  },
  template: `
    @if (component) {
      <div
        data-slot="dialog-component-wrapper"
        class="flex min-h-0 flex-1 flex-col overflow-hidden
         [&>*]:flex [&>*]:min-h-0 [&>*]:flex-1
         [&>*]:flex-col [&>*]:gap-6"
      >
        <ng-container [ngComponentOutlet]="component" />
      </div>
    } @else {
      <ng-content />
    }

    @if (showCloseButton()) {
      <button
        hlmBtn
        variant="ghost"
        size="icon-sm"
        class="absolute end-2 top-2"
        hlmDialogClose
      >
        <span class="sr-only">close</span>
        <ng-icon name="lucideX" />
      </button>
    }
  `,
})
export class HlmDialogContent {
  private readonly _dialogRef = inject(BrnDialogRef);
  private readonly _dialogContext =
    injectBrnDialogContext<HlmDialogContentContext | null>({ optional: true });

  public readonly showCloseButton = input<boolean, BooleanInput>(
    this._dialogContext?.$showCloseButton ?? true,
    {
      transform: booleanAttribute,
    },
  );

  public readonly state = computed(() => this._dialogRef?.state() ?? "closed");

  public readonly component = this._dialogContext?.$component;
  private readonly _dynamicComponentClass =
    this._dialogContext?.$dynamicComponentClass;

  constructor() {
    classes(() => [
      "bg-popover text-popover-foreground data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 ring-foreground/10 grid max-w-[calc(100%-2rem)] gap-4 rounded-xl p-4 text-sm ring-1 duration-100 sm:max-w-sm relative mx-auto w-full outline-none sm:mx-0",
      this._dynamicComponentClass,
    ]);
  }
}
