import { Component } from "@angular/core";
import { CasesListComponent } from "./cases-list/cases-list.component";

@Component({
  selector: "app-cases",
  standalone: true,
  templateUrl: "./cases.component.html",
  imports: [CasesListComponent],
})
export class CasesComponent {}
