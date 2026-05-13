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
  isquest: boolean;
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
  isquest: boolean;
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
        next: (items) => this.items.set(items.map((item) => this.normalizeTresherItem(item))),
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
        next: (items) => this.tresherOptions.set(items.map((item) => this.normalizeTresherItem(item))),
        error: () => {
          this.tresherOptions.set([]);
          this.optionsError.set('Failed to load tresher options.');
        },
      });
  }

  private normalizeTresherItem(item: UserTresherListItem): UserTresherListItem {
    const toIntOrNull = (value: unknown): number | null => {
      if (value === null || value === undefined || value === '') {
        return null;
      }
      const parsed =
        typeof value === 'number'
          ? value
          : typeof value === 'string'
          ? Number.parseInt(value.trim(), 10)
          : Number.NaN;
      return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
    };

    const toInt = (value: unknown, fallback: number = 0): number => {
      const parsed = toIntOrNull(value);
      return parsed === null ? fallback : parsed;
    };

    const source = item as UserTresherListItem & Record<string, unknown>;
    return {
      ...item,
      id: toInt(source['id']),
      gold: toInt(source['gold']),
      silver: toInt(source['silver']),
      copper: toInt(source['copper']),
      zinc: toInt(source['zinc']),
      item1Id: toIntOrNull(source['item1Id'] ?? source['item1id']),
      item2Id: toIntOrNull(source['item2Id'] ?? source['item2id']),
      item3Id: toIntOrNull(source['item3Id'] ?? source['item3id']),
      item4Id: toIntOrNull(source['item4Id'] ?? source['item4id']),
      spell1Id: toIntOrNull(source['spell1Id'] ?? source['spell1id']),
      spell2Id: toIntOrNull(source['spell2Id'] ?? source['spell2id']),
      spell3Id: toIntOrNull(source['spell3Id'] ?? source['spell3id']),
      spell4Id: toIntOrNull(source['spell4Id'] ?? source['spell4id']),
      curse1Id: toIntOrNull(source['curse1Id'] ?? source['curse1id']),
      curse2Id: toIntOrNull(source['curse2Id'] ?? source['curse2id']),
      spReward: toInt(source['spReward'] ?? source['spreward']),
      imageId: toIntOrNull(source['imageId'] ?? source['imageid']),
      soundId: toIntOrNull(source['soundId'] ?? source['soundid']),
      potion1Id: toIntOrNull(source['potion1Id'] ?? source['potion1id']),
      potion2Id: toIntOrNull(source['potion2Id'] ?? source['potion2id']),
      potion3Id: toIntOrNull(source['potion3Id'] ?? source['potion3id']),
    };
  }

  createTresher(userkey: string, tresher: UserTresherWritePayload): Observable<TresherResponse> {
    return this.http.post<TresherResponse>(`${API_BASE_URL}/treshers`, { userkey, tresher });
  }

  updateTresher(id: number, userkey: string, tresher: UserTresherWritePayload): Observable<TresherResponse> {
    return this.http.put<TresherResponse>(`${API_BASE_URL}/treshers/${id}`, { userkey, tresher });
  }
}
