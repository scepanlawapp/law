import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideExternalLink, lucideScale } from "@ng-icons/lucide";
import { LegalCitationResponse } from "@law/api-interfaces";
import { TranslatePipe } from "../../../../core/localization/translate.pipe";

@Component({
  selector: "app-citation-list",
  standalone: true,
  imports: [NgIcon, TranslatePipe],
  templateUrl: "./citation-list.html",
  styleUrl: "./citation-list.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideExternalLink, lucideScale })],
})
export class CitationListComponent {
  readonly citations = input<LegalCitationResponse[]>([]);
  /** Prefixes anchor ids so a draft and a chat message can list the same marker without colliding. */
  readonly idPrefix = input("citation");

  protected anchorId(marker: number): string {
    return `${this.idPrefix()}-${marker}`;
  }

  protected matchPercent(score: number): number {
    return Math.round(Math.max(0, Math.min(1, score)) * 100);
  }
}
