import { Component } from "@angular/core";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmEmpty,
  HlmEmptyContent,
  HlmEmptyDescription,
  HlmEmptyHeader,
  HlmEmptyTitle,
} from "@spartan-ng/helm/empty";
import { TranslatePipe } from "../../core/localization/translate.pipe";

@Component({
  selector: "law-finance-client-statement",
  standalone: true,
  templateUrl: "./finance-client-statement.component.html",
  imports: [
    HlmButton,
    HlmEmpty,
    HlmEmptyContent,
    HlmEmptyDescription,
    HlmEmptyHeader,
    HlmEmptyTitle,
    TranslatePipe,
  ],
})
export class FinanceClientStatementComponent {}
