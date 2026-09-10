import { Component, inject } from "@angular/core";
import { HttpErrorResponse } from "@angular/common/http";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideMail,
  lucideLock,
  lucideEye,
  lucideEyeOff,
  lucideArrowRight,
} from "@ng-icons/lucide";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { AuthState } from "@law/security";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ToastService } from "../../shared/ui/toast/toast.service";

interface FeatureItem {
  title: string;
  description: string;
  icon: string;
}

@Component({
  selector: "app-login",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmField,
    HlmFieldLabel,
    HlmInput,
    NgIcon,
    TranslatePipe,
    RouterLink,
  ],
  templateUrl: "./login.component.html",
  providers: [
    provideIcons({
      lucideMail,
      lucideLock,
      lucideEye,
      lucideEyeOff,
      lucideArrowRight,
    }),
  ],
})
export class LoginComponent {
  private readonly auth = inject(AuthState);
  private readonly router = inject(Router);
  private readonly localization = inject(LocalizationService);
  private readonly toast = inject(ToastService);

  readonly features: FeatureItem[] = [
    {
      title: "AI Assistant",
      description:
        "Get instant answers, analyze documents, and get legal insights.",
      icon: "lucideBot",
    },
    {
      title: "Case Management",
      description: "Keep track of your cases, deadlines, and court hearings.",
      icon: "lucideFolderOpen",
    },
    {
      title: "Document Intelligence",
      description: "Extract key information and analyze documents with AI.",
      icon: "lucideFileText",
    },
    {
      title: "Stay Organized",
      description:
        "Manage tasks, calendar and never miss an important deadline.",
      icon: "lucideCalendar",
    },
  ];

  readonly loginForm = new FormGroup({
    email: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  error = "";
  submitting = false;
  showPassword = false;

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  login(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      this.error = "Email and password are required.";
      return;
    }

    const { email, password } = this.loginForm.getRawValue();
    this.submitting = true;
    this.error = "";

    this.auth.login(email, password).subscribe({
      next: () => {
        void this.router.navigate(["/"]);
      },
      error: (error: HttpErrorResponse) => {
        if (error.status === 401) {
          this.error = "";
          this.toast.error(
            this.localization.translate("auth.invalidCredentials"),
          );
        } else {
          this.error = "Unable to sign in with those credentials.";
        }
        this.submitting = false;
      },
      complete: () => {
        this.submitting = false;
      },
    });
  }
}
