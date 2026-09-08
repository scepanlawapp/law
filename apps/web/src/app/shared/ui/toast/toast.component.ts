import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import {
  MAT_SNACK_BAR_DATA,
  MatSnackBarModule,
  MatSnackBarRef,
} from "@angular/material/snack-bar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { ToastData } from "./toast.service";

@Component({
  selector: "app-toast",
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatSnackBarModule],
  templateUrl: "./toast.component.html",
  styleUrl: "./toast.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastComponent {
  readonly data = inject<ToastData>(MAT_SNACK_BAR_DATA);
  private readonly snackBarRef = inject(MatSnackBarRef<ToastComponent>);

  dismiss(): void {
    this.snackBarRef.dismissWithAction();
  }
}
