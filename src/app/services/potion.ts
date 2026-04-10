import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { finalize, Observable } from 'rxjs';
import { API_BASE_URL } from '../api-config';

export interface UserPotionListItem {
  id: number;
  userguid: string;
  name: string;
  description: string;
  effectTo: string;
  effectTo2: string | null;
  lastFor: number;
  effectAmount: number;
  effectAmount2: number;
  value: number;
  imageId: number | null;
  soundId: number | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserPotionWritePayload {
  name: string;
  description: string;
  effectTo: string;
  effectTo2: string | null;
  lastFor: number;
  effectAmount: number;
  effectAmount2: number;
  value: number;
  imageId: number | null;
  soundId: number | null;
  isPublic: boolean;
}

export interface PotionResponse {
  result: number;
  error?: string;
  potion?: UserPotionListItem;
}

@Injectable({ providedIn: 'root' })
export class PotionService {
  private readonly http = inject(HttpClient);

  readonly items = signal<UserPotionListItem[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  loadPotions(userkey: string): void {
    this.isLoading.set(true);
    this.error.set(null);
    this.http
      .get<UserPotionListItem[]>(`${API_BASE_URL}/potions`, { params: { userkey } })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (items) => this.items.set(items),
        error: () => {
          this.items.set([]);
          this.error.set('Failed to load potions.');
        },
      });
  }

  createPotion(userkey: string, potion: UserPotionWritePayload): Observable<PotionResponse> {
    return this.http.post<PotionResponse>(`${API_BASE_URL}/potions`, { userkey, potion });
  }

  updatePotion(id: number, userkey: string, potion: UserPotionWritePayload): Observable<PotionResponse> {
    return this.http.put<PotionResponse>(`${API_BASE_URL}/potions/${id}`, { userkey, potion });
  }
}
