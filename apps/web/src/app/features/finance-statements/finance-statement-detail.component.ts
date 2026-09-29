import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";
import { HlmButton } from "@spartan-ng/helm/button";
import { TranslatePipe } from "../../core/localization/translate.pipe";

@Component({
  selector: "law-finance-statement-detail",
  standalone: true,
  templateUrl: "./finance-statement-detail.component.html",
  imports: [RouterLink, HlmButton, TranslatePipe],
})
export class FinanceStatementDetailComponent {}
