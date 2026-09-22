import type { ComponentType } from "@angular/cdk/portal";
import { DIALOG_DATA } from "@angular/cdk/dialog";
import { NgComponentOutlet } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { BrnDialogRef } from "@spartan-ng/brain/dialog";
import { HlmDialogContent } from "@spartan-ng/helm/dialog";

/**
 * Renders a Hlm dialog component inline (no CDK overlay) by faking the
 * BrnDialogRef/DIALOG_DATA that the dialog component normally receives from
 * HlmDialogService. Used to show "edit" dialogs as an inline side panel
 * instead of a modal when there is enough room on screen.
 */
@Component({
  selector: "law-dialog-panel",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `
    <ng-container
      [ngComponentOutlet]="hostComponent"
      [ngComponentOutletInjector]="injector()"
    />
  `,
})
export class DialogPanelComponent {
  readonly component = input.required<ComponentType<unknown>>();
  readonly context = input.required<object>();

  readonly closed = output<unknown>();

  readonly hostComponent = HlmDialogContent;

  private readonly parentInjector = inject(Injector);

  readonly injector = computed(() => {
    const context = this.context();
    const component = this.component();
    const fakeDialogRef = {
      close: (result?: unknown) => this.closed.emit(result),
      state: () => "open",
    } as unknown as BrnDialogRef;

    return Injector.create({
      parent: this.parentInjector,
      providers: [
        { provide: BrnDialogRef, useValue: fakeDialogRef },
        {
          provide: DIALOG_DATA,
          useValue: {
            ...context,
            $component: component,
            $dynamicComponentClass:
              "flex h-full min-h-0 flex-col overflow-hidden",
          },
        },
      ],
    });
  });
}
