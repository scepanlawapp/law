import { Component } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: "app-header",
  standalone: true,
  templateUrl: "./header.component.html",
  styleUrl: "./header.component.scss",
  imports: [MatIconModule],
})
export class HeaderComponent {}
