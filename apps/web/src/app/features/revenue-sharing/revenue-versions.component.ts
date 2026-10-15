import { ChangeDetectionStrategy, Component, viewChild } from "@angular/core";
import { RevenueSharingComponent } from "./revenue-sharing.component";

@Component({
  selector: "law-revenue-versions",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevenueSharingComponent],
  templateUrl: "./revenue-versions.component.html",
})
export class RevenueVersionsComponent {
  private readonly editor = viewChild(RevenueSharingComponent);
  async confirmLeave() {
    return this.editor()?.confirmLeave() ?? true;
  }
}
