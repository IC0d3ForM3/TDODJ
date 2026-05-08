import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Account } from '../../services/account';
import { User } from '../../interfaces/user';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { TacModal } from '../tac-modal/tac-modal';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterLink, TacModal],
  templateUrl: './signup.html',
  styleUrl: './signup.css',
})
export class Signup {
  username = '';
  email = '';
  password = '';
  confirmPassword = '';
  result: number | null = null;
  error: string | null = null;
  showSuccess = false;
  isSubmitting = false;
  agreedToTac = false;
  showTac = false;

  constructor(private account: Account, private router: Router) {}

  isEmailValid(email: string): boolean {
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  }

  isStrongPassword(password: string): boolean {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/.test(password);
  }

  canSave(): boolean {
    return (
      !!this.username.trim() &&
      !!this.email.trim() &&
      !!this.password &&
      !!this.confirmPassword &&
      this.isEmailValid(this.email) &&
      this.isStrongPassword(this.password) &&
      this.password === this.confirmPassword &&
      this.agreedToTac
    );
  }

  onSubmit() {
    if (this.isSubmitting || !this.canSave()) return;
    this.isSubmitting = true;
    const user: User = {
      username: this.username,
      email: this.email,
      password: this.password,
    };
    this.account.signup(user).pipe(finalize(() => {
      this.isSubmitting = false;
    })).subscribe({
      next: (res) => {
        this.result = res.result;
        this.error = null;
        if (res.result === 1) {
          this.showSuccess = true;
          setTimeout(() => this.router.navigate(['/login']), 2500);
        }
      },
      error: () => {
        this.result = -1;
        this.error = 'Signup failed';
      }
    });
  }
}
