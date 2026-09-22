import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

@Component({
  selector: "law-auth-layout",
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: "./auth-layout.component.html",
  host: {
    class: "block h-dvh w-full min-h-0",
  },
})
export class AuthLayoutComponent {}
