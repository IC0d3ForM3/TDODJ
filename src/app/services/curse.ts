import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { finalize, Observable } from 'rxjs';
import { API_BASE_URL } from '../api-config';

export function normalizeCurseEffectTarget(value: string | null | undefined): string {
  const normalized = (value ?? '').trim().toLowerCase();
  switch (normalized) {
    case 'hp':
      return 'HP';
    case 'defense':
      return 'Defense';
    case 'stamina':
      return 'Stamina';
    case 'mind':
      return 'Mind';
    case 'magic':
      return 'Magic';
    case 'sight':
    case 'range of sight':
    case 'ros':
      return 'ROS';
    case 'ae':
    case 'action economy':
    case 'action econame':
      return 'AE';
    case '# of attacks':
    case '# of attacks #oa':
    case 'noa':
      return '# of Attacks';
    case 'boost dice':
      return 'Boost Dice';
    default:
      return 'HP';
  }
}

export interface UserCurseListItem {
  id: number;
  userguid: string;
  name: string;
  description: string;
  effectTo: string;
  effectTo2: string | null;
  damage: number;
  damage2: number;
  lastFor: number;
  imageId: number | null;
  soundId: number | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserCurseWritePayload {
  name: string;
  description: string;
  effectTo: string;
  effectTo2: string | null;
  damage: number;
  damage2: number;
  lastFor: number;
  imageId: number | null;
  soundId: number | null;
  isPublic: boolean;
}

export interface CurseResponse {
  result: number;
  error?: string;
  curse?: UserCurseListItem;
}

@Injectable({ providedIn: 'root' })
export class CurseService {
  private readonly http = inject(HttpClient);

  readonly items = signal<UserCurseListItem[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  loadCurses(userkey: string): void {
    this.isLoading.set(true);
    this.error.set(null);
    this.http
      .get<UserCurseListItem[]>(`${API_BASE_URL}/curses`, { params: { userkey } })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (items) =>
          this.items.set(
            items.map((item) => ({
              ...item,
              effectTo: normalizeCurseEffectTarget(item.effectTo),
              effectTo2: item.effectTo2 ? normalizeCurseEffectTarget(item.effectTo2) : null,
            }))
          ),
        error: () => {
          this.items.set([]);
          this.error.set('Failed to load curses.');
        },
      });
  }

  createCurse(userkey: string, curse: UserCurseWritePayload): Observable<CurseResponse> {
    return this.http.post<CurseResponse>(`${API_BASE_URL}/curses`, { userkey, curse });
  }

  updateCurse(id: number, userkey: string, curse: UserCurseWritePayload): Observable<CurseResponse> {
    return this.http.put<CurseResponse>(`${API_BASE_URL}/curses/${id}`, { userkey, curse });
  }
}
