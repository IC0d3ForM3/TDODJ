import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Account } from '../../services/account';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  username = '';
  password = '';
  error: string | null = null;
  isSubmitting = false;

  constructor(private account: Account, private router: Router) {}

  onSubmit() {
    if (this.isSubmitting || !this.username.trim() || !this.password) return;
    this.isSubmitting = true;
    this.account.login(this.username, this.password).pipe(finalize(() => {
      this.isSubmitting = false;
    })).subscribe({
      next: (res) => {
        this.account.setKey(res.key, res.isAdmin, res.isCreator, res.username, res.isMasterAdmin);
        this.error = null;
        this.router.navigate(['/dashboard']);
      },
      error: () => {
        this.error = 'Invalid credentials or user not active.';
      }
    });
  }
}
