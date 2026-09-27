import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideExternalLink, lucideScale } from "@ng-icons/lucide";
import { LegalCitationResponse } from "@law/api-interfaces";
import { TranslatePipe } from "../../../../core/localization/translate.pipe";
import { isArticleNumber, matchPercent } from "../citation-list/citation-label";

/** Floating preview of one cited source, opened from a `[n]` marker in an assistant reply. */
@Component({
  selector: "law-citation-preview",
  standalone: true,
  imports: [NgIcon, TranslatePipe],
  templateUrl: "./citation-preview.html",
  styleUrl: "./citation-preview.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideExternalLink, lucideScale })],
})
export class CitationPreviewComponent {
  readonly citation = input.required<LegalCitationResponse>();
  readonly previewId = input.required<string>();

  protected readonly isArticleNumber = isArticleNumber;
  protected readonly matchPercent = matchPercent;
}
