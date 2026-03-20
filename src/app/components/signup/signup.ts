import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Account } from '../../services/account';
import { User } from '../../interfaces/user';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [FormsModule, CommonModule],
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

  constructor(private account: Account) {}

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
      this.password === this.confirmPassword
    );
  }

  onSubmit() {
    if (!this.canSave()) return;
    const user: User = {
      username: this.username,
      email: this.email,
      password: this.password,
    };
    this.account.signup(user).subscribe({
      next: (res) => {
        this.result = res.result;
        this.error = null;
      },
      error: (err) => {
        this.result = -1;
        this.error = 'Signup failed';
      }
    });
  }
}
