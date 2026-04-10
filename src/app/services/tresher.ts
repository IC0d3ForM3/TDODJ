import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { finalize, Observable } from 'rxjs';
import { API_BASE_URL } from '../api-config';

export interface UserTresherListItem {
  id: number;
  userguid: string;
  type: string;
  name: string;
  description: string;
  gold: number;
  silver: number;
  copper: number;
  zinc: number;
  item1Id: number | null;
  item2Id: number | null;
  item3Id: number | null;
  item4Id: number | null;
  spell1Id: number | null;
  spell2Id: number | null;
  spell3Id: number | null;
  spell4Id: number | null;
  curse1Id: number | null;
  curse2Id: number | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  spReward: number;
  imageId: number | null;
  soundId: number | null;
  potion1Id: number | null;
  potion2Id: number | null;
  potion3Id: number | null;
}

export interface UserTresherWritePayload {
  type: string;
  name: string;
  description: string;
  gold: number;
  silver: number;
  copper: number;
  zinc: number;
  item1Id: number | null;
  item2Id: number | null;
  item3Id: number | null;
  item4Id: number | null;
  spell1Id: number | null;
  spell2Id: number | null;
  spell3Id: number | null;
  spell4Id: number | null;
  curse1Id: number | null;
  curse2Id: number | null;
  isPublic: boolean;
  imageId: number | null;
  soundId: number | null;
  spReward: number;
  potion1Id: number | null;
  potion2Id: number | null;
  potion3Id: number | null;
}

export interface TresherResponse {
  result: number;
  error?: string;
  tresher?: UserTresherListItem;
}

@Injectable({ providedIn: 'root' })
export class TresherService {
  private readonly http = inject(HttpClient);

  readonly items = signal<UserTresherListItem[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  readonly tresherOptions = signal<UserTresherListItem[]>([]);
  readonly isLoadingOptions = signal(false);
  readonly optionsError = signal<string | null>(null);

  loadTreshers(userkey: string): void {
    this.isLoading.set(true);
    this.error.set(null);
    this.http
      .get<UserTresherListItem[]>(`${API_BASE_URL}/treshers`, { params: { userkey } })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (items) => this.items.set(items),
        error: () => {
          this.items.set([]);
          this.error.set('Failed to load your treshers.');
        },
      });
  }

  loadTresherOptions(userkey: string): void {
    this.isLoadingOptions.set(true);
    this.optionsError.set(null);
    this.http
      .get<UserTresherListItem[]>(`${API_BASE_URL}/treshers`, {
        params: { userkey, scope: 'library' },
      })
      .pipe(finalize(() => this.isLoadingOptions.set(false)))
      .subscribe({
        next: (items) => this.tresherOptions.set(items),
        error: () => {
          this.tresherOptions.set([]);
          this.optionsError.set('Failed to load tresher options.');
        },
      });
  }

  createTresher(userkey: string, tresher: UserTresherWritePayload): Observable<TresherResponse> {
    return this.http.post<TresherResponse>(`${API_BASE_URL}/treshers`, { userkey, tresher });
  }

  updateTresher(id: number, userkey: string, tresher: UserTresherWritePayload): Observable<TresherResponse> {
    return this.http.put<TresherResponse>(`${API_BASE_URL}/treshers/${id}`, { userkey, tresher });
  }
}
