import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class CreatorLayout {
  readonly isHeaderCollapsed = signal(false);

  toggleHeader(): void {
    this.isHeaderCollapsed.update((value) => !value);
  }
}
