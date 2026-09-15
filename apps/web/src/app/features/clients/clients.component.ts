import { Component } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";

@Component({
  selector: "app-clients",
  standalone: true,
  templateUrl: "./clients.component.html",
  imports: [ReactiveFormsModule],
})
export class ClientsComponent {}
