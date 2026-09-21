import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideChevronDown } from "@ng-icons/lucide";
import {
  HlmCollapsible,
  HlmCollapsibleContent,
  HlmCollapsibleTrigger,
} from "@spartan-ng/helm/collapsible";

let nextSectionId = 0;

@Component({
  selector: "law-collapsible-section",
  standalone: true,
  imports: [HlmCollapsible, HlmCollapsibleTrigger, HlmCollapsibleContent, NgIcon],
  providers: [provideIcons({ lucideChevronDown })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./collapsible-section.component.html",
})
export class CollapsibleSectionComponent {
  readonly title = input.required<string>();
  readonly expanded = input(false);
  readonly expandedChange = output<boolean>();

  protected readonly contentId = `collapsible-section-${nextSectionId++}`;

  protected toggle(next: boolean): void {
    this.expandedChange.emit(next);
  }
}
