import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { API_BASE_URL } from '../../api-config';

@Component({
  selector: 'app-contact',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './contact.html',
  styleUrl: './contact.css',
})
export class Contact {
  private readonly http = inject(HttpClient);

  name = '';
  email = '';
  problem = 'Report Bug';
  username = '';
  message = '';

  readonly problemOptions = ['Report Bug', 'Other'];

  readonly isSubmitting = signal(false);
  readonly successMsg = signal<string | null>(null);
  readonly errorMsg = signal<string | null>(null);

  submit(): void {
    if (!this.name || !this.email || !this.message) return;
    this.isSubmitting.set(true);
    this.successMsg.set(null);
    this.errorMsg.set(null);

    const body: Record<string, string> = {
      name: this.name,
      email: this.email,
      problem: this.problem,
      message: this.message,
    };
    if (this.username) body['username'] = this.username;

    this.http.post(`${API_BASE_URL}/contact`, body).subscribe({
      next: () => {
        this.successMsg.set('Your message has been sent! We will get back to you soon.');
        this.name = '';
        this.email = '';
        this.problem = 'Report Bug';
        this.username = '';
        this.message = '';
        this.isSubmitting.set(false);
      },
      error: () => {
        this.errorMsg.set('Something went wrong. Please try again.');
        this.isSubmitting.set(false);
      },
    });
  }
}
