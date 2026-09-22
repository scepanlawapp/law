import { CdkMenuTrigger } from "@angular/cdk/menu";
import {
  computed,
  Directive,
  effect,
  ElementRef,
  forwardRef,
  inject,
  input,
} from "@angular/core";
import {
  createMenuPosition,
  MENU_SIDE,
  type MenuAlign,
  type MenuSide,
} from "@spartan-ng/brain/core";
import {
  HLM_DROPDOWN_MENU_TRIGGER,
  injectHlmDropdownMenuConfig,
} from "./hlm-dropdown-menu-token";

@Directive({
  selector: "[hlmDropdownMenuTrigger]",
  providers: [
    {
      provide: MENU_SIDE,
      useExisting: forwardRef(() => HlmDropdownMenuTrigger),
    },
    {
      provide: HLM_DROPDOWN_MENU_TRIGGER,
      useExisting: forwardRef(() => HlmDropdownMenuTrigger),
    },
  ],
  hostDirectives: [
    {
      directive: CdkMenuTrigger,
      inputs: [
        "cdkMenuTriggerFor: hlmDropdownMenuTrigger",
        "cdkMenuTriggerData: hlmDropdownMenuTriggerData",
      ],
      outputs: [
        "cdkMenuOpened: hlmDropdownMenuOpened",
        "cdkMenuClosed: hlmDropdownMenuClosed",
      ],
    },
  ],
  host: { "data-slot": "dropdown-menu-trigger" },
})
export class HlmDropdownMenuTrigger {
  private readonly _cdkTrigger = inject(CdkMenuTrigger, { host: true });
  private readonly _config = injectHlmDropdownMenuConfig();
  private readonly _elementRef = inject(ElementRef<HTMLElement>);

  public readonly align = input<MenuAlign>(this._config.align);
  public readonly side = input<MenuSide>(this._config.side);

  private readonly _menuPosition = computed(() =>
    createMenuPosition(this.align(), this.side()),
  );

  public triggerWidth(): number {
    return this._elementRef.nativeElement.getBoundingClientRect().width;
  }

  constructor() {
    // CDK sets transform-origin on the menu content from the resolved position; the content reads it to
    // animate from the anchored corner and to derive its data-side. Cast tolerates @angular/cdk < 21.2
    // (we still support >=21.0), where the property is absent and the assignment is a harmless no-op.
    (
      this._cdkTrigger as { transformOriginSelector?: string }
    ).transformOriginSelector = '[data-slot="dropdown-menu"]';

    effect(() => {
      this._cdkTrigger.menuPosition = this._menuPosition();
    });
  }
}
