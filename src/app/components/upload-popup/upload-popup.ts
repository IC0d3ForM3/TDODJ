import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { finalize } from 'rxjs';
import { Account } from '../../services/account';
import { API_BASE_URL } from '../../api-config';

export interface UploadedMediaItem {
  id: number;
  name: string;
  path: string;
}

@Component({
  selector: 'app-upload-popup',
  imports: [],
  templateUrl: './upload-popup.html',
  styleUrl: './upload-popup.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UploadPopup {
  private readonly http = inject(HttpClient);
  private readonly account = inject(Account);

  readonly mediaType = input<'image' | 'sound'>('image');
  readonly mediaUploaded = output<UploadedMediaItem>();

  readonly isOpen = signal(false);
  readonly isUploading = signal(false);
  readonly uploadName = signal('');
  readonly selectedFile = signal<File | null>(null);
  readonly errorMessage = signal<string | null>(null);

  open(): void {
    this.isOpen.set(true);
    this.errorMessage.set(null);
    this.uploadName.set('');
    this.selectedFile.set(null);
  }

  close(): void {
    if (this.isUploading()) return;
    this.isOpen.set(false);
  }

  onFileSelected(event: Event): void {
    const el = event.target as HTMLInputElement | null;
    const file = el?.files?.[0] ?? null;
    this.selectedFile.set(file);
    if (file && !this.uploadName().trim()) {
      this.uploadName.set(file.name.replace(/\.[^/.]+$/, ''));
    }
  }

  onNameInput(event: Event): void {
    this.uploadName.set((event.target as HTMLInputElement).value);
  }

  upload(): void {
    if (this.isUploading()) return;
    const userkey = this.account.getKey();
    if (!userkey) { this.errorMessage.set('Please log in.'); return; }
    const file = this.selectedFile();
    if (!file) { this.errorMessage.set('Please select a file.'); return; }

    const name = this.uploadName().trim() || (this.mediaType() === 'image' ? 'Uploaded Image' : 'Uploaded Sound');
    const fd = new FormData();
    fd.append('userkey', userkey);
    fd.append('name', name);
    fd.append('isPublic', 'false');
    fd.append('isActive', 'true');
    fd.append(this.mediaType(), file);

    const url = `${API_BASE_URL}/${this.mediaType() === 'image' ? 'images' : 'sounds'}`;
    this.isUploading.set(true);
    this.errorMessage.set(null);

    if (this.mediaType() === 'image') {
      this.http
        .post<{ result: number; error?: string; image?: UploadedMediaItem }>(url, fd)
        .pipe(finalize(() => this.isUploading.set(false)))
        .subscribe({
          next: (r) => {
            if (r.result !== 1 || !r.image) { this.errorMessage.set(r.error || 'Upload failed.'); return; }
            this.mediaUploaded.emit(r.image);
            this.isOpen.set(false);
          },
          error: () => this.errorMessage.set('Upload failed.'),
        });
    } else {
      this.http
        .post<{ result: number; error?: string; sound?: UploadedMediaItem }>(url, fd)
        .pipe(finalize(() => this.isUploading.set(false)))
        .subscribe({
          next: (r) => {
            if (r.result !== 1 || !r.sound) { this.errorMessage.set(r.error || 'Upload failed.'); return; }
            this.mediaUploaded.emit(r.sound);
            this.isOpen.set(false);
          },
          error: () => this.errorMessage.set('Upload failed.'),
        });
    }
  }
}
