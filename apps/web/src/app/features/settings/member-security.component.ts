import { DatePipe } from "@angular/common";
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { finalize } from "rxjs";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmSwitch } from "@spartan-ng/helm/switch";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { AuthApiClient } from "@law/api-clients";
import { MemberSecuritySummary, WorkspaceRole } from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { canManageBilling } from "../../shared/billing";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { PasswordConfirmDialogService } from "./password-confirm-dialog.service";

/**
 * Office-wide 2FA policy and per-member status with reset. Visible to
 * OWNER and ADMIN only (the API enforces the same). Both writes ask for the
 * admin's current password; wrong passwords and failures stay inline in the
 * password dialog.
 */
@Component({
  selector: "law-member-security",
  standalone: true,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    HlmButton,
    HlmSpinner,
    HlmSwitch,
    HlmTableImports,
    TranslatePipe,
  ],
  templateUrl: "./member-security.component.html",
  host: { class: "block min-w-0" },
})
export class MemberSecurityComponent implements OnInit {
  private readonly api = inject(AuthApiClient);
  private readonly authState = inject(AuthState);
  private readonly passwordDialog = inject(PasswordConfirmDialogService);
  private readonly localization = inject(LocalizationService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly role = computed(
    () => this.authState.activeWorkspace()?.role,
  );
  readonly canManage = computed(() => canManageBilling(this.role()));
  readonly currentUserId = computed(() => this.authState.session()?.user.id);

  readonly policyControl = new FormControl(false, { nonNullable: true });
  readonly members = signal<MemberSecuritySummary[]>([]);
  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly savingPolicy = signal(false);

  ngOnInit(): void {
    if (!this.canManage()) return;
    this.api
      .getMfaPolicy()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (policy) =>
          this.policyControl.setValue(policy.mfaRequired, { emitEvent: false }),
        error: () => this.loadFailed.set(true),
      });
    this.loadMembers();
  }

  /** The reset button follows the API: not for yourself, not ADMIN on OWNER. */
  canReset(member: MemberSecuritySummary): boolean {
    if (!member.mfaEnabled) return false;
    if (member.userId === this.currentUserId()) return false;
    return !(
      this.role() === WorkspaceRole.ADMIN && member.role === WorkspaceRole.OWNER
    );
  }

  onPolicyToggle(required: boolean): void {
    // Back to the saved value until the admin confirms with the password;
    // the switch already flipped itself.
    this.policyControl.setValue(!required, { emitEvent: false });
    this.savingPolicy.set(true);
    this.passwordDialog
      .open({
        ...(required
          ? {
              title: "security.policyConfirmTitle",
              description: "security.policyConfirmMessage",
              confirmText: "security.policyConfirm",
            }
          : {
              title: "security.policyOffTitle",
              description: "security.policyOffMessage",
              confirmText: "security.policyOffConfirm",
            }),
        run: (currentPassword) =>
          this.api.setMfaPolicy({ mfaRequired: required, currentPassword }),
      })
      .pipe(
        finalize(() => this.savingPolicy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((policy) => {
        this.policyControl.setValue(policy.mfaRequired, { emitEvent: false });
        this.toast.success(
          this.localization.translate(
            policy.mfaRequired
              ? "security.policyEnabled"
              : "security.policyDisabled",
          ),
        );
      });
  }

  reset(member: MemberSecuritySummary): void {
    this.passwordDialog
      .open({
        title: "security.resetConfirmTitle",
        description: "security.resetConfirmMessage",
        confirmText: "security.reset",
        destructive: true,
        run: (currentPassword) =>
          this.api.resetMemberMfa(member.userId, currentPassword),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.toast.success(this.localization.translate("security.resetDone"));
        this.loadMembers();
      });
  }

  private loadMembers(): void {
    this.api
      .memberSecurity()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (members) => {
          this.members.set(members);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.loadFailed.set(true);
        },
      });
  }
}
