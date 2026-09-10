import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { DraftResultResponse, DocumentScript } from "@law/api-interfaces";
import { TranslatePipe } from "../../../../core/localization/translate.pipe";

@Component({
  selector: "app-draft-review-panel",
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: "./draft-review-panel.html",
  styleUrl: "./draft-review-panel.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DraftReviewPanelComponent {
  @Input({ required: true }) draft!: DraftResultResponse;
  @Input({ required: true }) text = "";
  @Input({ required: true }) script: DocumentScript = "latin";
  @Input() note = "";

  @Output() textChange = new EventEmitter<string>();
  @Output() noteChange = new EventEmitter<string>();
  @Output() scriptChange = new EventEmitter<DocumentScript>();
  @Output() save = new EventEmitter<void>();
  @Output() approve = new EventEmitter<void>();
  @Output() reject = new EventEmitter<void>();
  @Output() requestChanges = new EventEmitter<void>();

  protected readonly scripts: DocumentScript[] = ["latin", "cyrillic"];
}
