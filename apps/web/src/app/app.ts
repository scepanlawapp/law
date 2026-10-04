import { Component } from "@angular/core";
import { RouterModule } from "@angular/router";
import { HlmToaster } from "@spartan-ng/helm/sonner";
import { CompletionPromptComponent } from "./features/time/completion-prompt/completion-prompt.component";

@Component({
  imports: [RouterModule, HlmToaster, CompletionPromptComponent],
  selector: "law-root",
  templateUrl: "./app.html",
})
export class App {
  protected title = "LegalAI";
}
