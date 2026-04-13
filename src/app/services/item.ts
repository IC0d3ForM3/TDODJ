import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { finalize, Observable } from 'rxjs';
import { API_BASE_URL } from '../api-config';

export type ItemType = 'weapon' | 'armor' | 'pick' | 'light' | 'ring' | 'necklace' | 'other';

export interface UserItemListItem {
  id: number;
  userguid: string;
  name: string;
  description: string;
  type: ItemType;
  range: number;
  value: number;
  weight: number;
  curseId: number | null;
  effectValue: number;
  damage: number;
  armorSlot: string | null;
  effectOn: string | null;
  imageId: number | null;
  soundId: number | null;
  isPublic: boolean;
  isTwoHanded: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserItemWritePayload {
  name: string;
  description: string;
  type: ItemType;
  range: number;
  value: number;
  weight: number;
  curseId: number | null;
  effectValue: number;
  damage: number;
  armorSlot: string | null;
  effectOn: string | null;
  imageId: number | null;
  soundId: number | null;
  isPublic: boolean;
  isTwoHanded: boolean;
}

export interface ItemResponse {
  result: number;
  error?: string;
  item?: UserItemListItem;
}

@Injectable({ providedIn: 'root' })
export class ItemService {
  private readonly http = inject(HttpClient);

  readonly items = signal<UserItemListItem[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  loadItems(userkey: string): void {
    this.isLoading.set(true);
    this.error.set(null);
    this.http
      .get<UserItemListItem[]>(`${API_BASE_URL}/items`, { params: { userkey } })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (items) => this.items.set(items),
        error: () => {
          this.items.set([]);
          this.error.set('Failed to load items.');
        },
      });
  }

  createItem(userkey: string, item: UserItemWritePayload): Observable<ItemResponse> {
    return this.http.post<ItemResponse>(`${API_BASE_URL}/items`, { userkey, item });
  }

  updateItem(id: number, userkey: string, item: UserItemWritePayload): Observable<ItemResponse> {
    return this.http.put<ItemResponse>(`${API_BASE_URL}/items/${id}`, { userkey, item });
  }
}
