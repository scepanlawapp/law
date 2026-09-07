import { Component, inject } from "@angular/core";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { Router } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { AuthState } from "@law/security";

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
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
  ],
  templateUrl: "./login.component.html",
  styleUrl: "./login.component.scss",
})
export class LoginComponent {
  private readonly auth = inject(AuthState);
  private readonly router = inject(Router);

  readonly features: FeatureItem[] = [
    {
      title: "AI Assistant",
      description: "Get instant answers, analyze documents, and get legal insights.",
      icon: "smart_toy",
    },
    {
      title: "Case Management",
      description: "Keep track of your cases, deadlines, and court hearings.",
      icon: "folder_open",
    },
    {
      title: "Document Intelligence",
      description: "Extract key information and analyze documents with AI.",
      icon: "description",
    },
    {
      title: "Stay Organized",
      description: "Manage tasks, calendar and never miss an important deadline.",
      icon: "event",
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
      error: () => {
        this.error = "Unable to sign in with those credentials.";
        this.submitting = false;
      },
      complete: () => {
        this.submitting = false;
      },
    });
  }
}
