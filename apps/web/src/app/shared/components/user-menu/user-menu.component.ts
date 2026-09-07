import { Component, computed, input, output, signal } from "@angular/core";
import { AuthUser } from "@law/api-interfaces";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { RouterLink } from "@angular/router";

@Component({
  selector: "app-user-menu",
  standalone: true,
  imports: [MatIconModule, MatMenuModule, RouterLink],
  templateUrl: "./user-menu.component.html",
  styleUrl: "./user-menu.component.scss",
})
export class UserMenuComponent {
  readonly user = input.required<AuthUser>();
  readonly logoutRequested = output<void>();
  readonly menuOpen = signal(false);

  readonly displayName = computed(() => {
    const user = this.user();
    if (user.name?.trim()) return user.name.trim();

    return (user.email.split("@", 1)[0] || "user")
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(" ");
  });

  readonly initials = computed(() => {
    const parts = this.displayName().split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }

    return this.displayName().slice(0, 2).toUpperCase();
  });
}
