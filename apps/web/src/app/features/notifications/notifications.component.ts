import { Component } from "@angular/core";
import { TranslatePipe } from "../../core/localization/translate.pipe";

@Component({
  selector: "law-notifications",
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: "./notifications.component.html",
})
export class NotificationsComponent {}
