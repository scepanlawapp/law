import { Component } from "@angular/core";
import {
  HlmEmpty,
  HlmEmptyDescription,
  HlmEmptyHeader,
  HlmEmptyTitle,
} from "@spartan-ng/helm/empty";
import { TranslatePipe } from "../../core/localization/translate.pipe";

@Component({
  selector: "law-reports",
  standalone: true,
  templateUrl: "./reports.component.html",
  imports: [
    HlmEmpty,
    HlmEmptyDescription,
    HlmEmptyHeader,
    HlmEmptyTitle,
    TranslatePipe,
  ],
})
export class ReportsComponent {}
