import { Component } from "@angular/core";
import { RouterModule } from "@angular/router";
import { HlmToaster } from "@spartan-ng/helm/sonner";

@Component({
  imports: [RouterModule, HlmToaster],
  selector: "law-root",
  templateUrl: "./app.html",
})
export class App {
  protected title = "LegalAI";
}
