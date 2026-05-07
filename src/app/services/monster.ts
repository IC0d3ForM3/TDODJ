import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { finalize, Observable } from 'rxjs';
import { API_BASE_URL } from '../api-config';

export interface UserMonsterAttackListItem {
  type: string;
  description: string;
  damage: number;
  plusToHit: number;
  weaponItemId: number | null;
  spellId: number | null;
  curseId: number | null;
}

export interface UserMonsterListItem {
  id: number;
  userguid: string;
  imageId: number | null;
  soundId: number | null;
  tresherIds: number[];
  name: string;
  type: string;
  description: string;
  hp: number;
  movementEconomy: number;
  ac: number;
  runAt: number;
  numberOfAttacks: number;
  attacks: UserMonsterAttackListItem[];
  magic: number;
  spReward: number;
  isPublic: boolean;
  callsReinforcements: boolean;
  toHitPlusNeeded: number;
  npcGreeting: string | null;
  npcInfo1: string | null;
  npcInfo2: string | null;
  npcInfo3: string | null;
  npcOnlyAttackWhenAttacked: boolean;
  npcGivesInfoAfterDamaged: boolean;
  npcAttacksAfterInfo: boolean;
  npcCanTrade: boolean;
  awareness: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserMonsterAttackEditorValue {
  type: string;
  description: string;
  damage: number;
  plusToHit: number;
  weaponItemId: number | null;
  spellId: number | null;
  curseId: number | null;
}

export interface UserMonsterWritePayload {
  imageId: number | null;
  soundId: number | null;
  tresherIds: number[];
  name: string;
  type: string;
  description: string;
  hp: number;
  movementEconomy: number;
  ac: number;
  runAt: number;
  numberOfAttacks: number;
  attacks: UserMonsterAttackEditorValue[];
  magic: number;
  spReward: number;
  isPublic: boolean;
  callsReinforcements: boolean;
  toHitPlusNeeded: number;
  npcGreeting: string | null;
  npcInfo1: string | null;
  npcInfo2: string | null;
  npcInfo3: string | null;
  npcOnlyAttackWhenAttacked: boolean;
  npcGivesInfoAfterDamaged: boolean;
  npcAttacksAfterInfo: boolean;
  npcCanTrade: boolean;
  awareness: number;
}

export interface MonsterResponse {
  result: number;
  error?: string;
  monster?: UserMonsterListItem;
}

@Injectable({ providedIn: 'root' })
export class MonsterService {
  private readonly http = inject(HttpClient);

  readonly items = signal<UserMonsterListItem[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  loadMonsters(userkey: string): void {
    this.isLoading.set(true);
    this.error.set(null);
    this.http
      .get<UserMonsterListItem[]>(`${API_BASE_URL}/monsters`, { params: { userkey } })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (items) => {
          this.items.set(
            items.map((item) => ({
              ...item,
              imageId: this.normalizeNullableNumber(item.imageId),
              soundId: this.normalizeNullableNumber(item.soundId),
              tresherIds: this.normalizeIdList(item.tresherIds),
              magic: this.normalizeNumber(item.magic, 0),
              spReward: this.normalizeNumber(item.spReward, 0),
              callsReinforcements: item.callsReinforcements === true,
              toHitPlusNeeded: this.normalizeNumber(item.toHitPlusNeeded, 0),
              npcGreeting: typeof item.npcGreeting === 'string' ? item.npcGreeting : null,
              npcInfo1: typeof item.npcInfo1 === 'string' ? item.npcInfo1 : null,
              npcInfo2: typeof item.npcInfo2 === 'string' ? item.npcInfo2 : null,
              npcInfo3: typeof item.npcInfo3 === 'string' ? item.npcInfo3 : null,
              npcOnlyAttackWhenAttacked: item.npcOnlyAttackWhenAttacked === true,
              npcGivesInfoAfterDamaged: item.npcGivesInfoAfterDamaged === true,
              npcAttacksAfterInfo: item.npcAttacksAfterInfo === true,
              npcCanTrade: item.npcCanTrade === true,
              attacks: Array.isArray(item.attacks)
                ? item.attacks.map((attack) => ({
                    type: attack.type || 'Bite',
                    description: attack.description || '',
                    damage: this.normalizeNumber(attack.damage, 0),
                    plusToHit: this.normalizeNumber(attack.plusToHit, 0),
                    weaponItemId: this.normalizeNullableNumber(attack.weaponItemId),
                    spellId: this.normalizeNullableNumber(attack.spellId),
                    curseId: this.normalizeNullableNumber(attack.curseId),
                  }))
                : [],
            }))
          );
        },
        error: () => {
          this.items.set([]);
          this.error.set('Failed to load your monsters.');
        },
      });
  }

  createMonster(userkey: string, monster: UserMonsterWritePayload): Observable<MonsterResponse> {
    return this.http.post<MonsterResponse>(`${API_BASE_URL}/monsters`, { userkey, monster });
  }

  updateMonster(id: number, userkey: string, monster: UserMonsterWritePayload): Observable<MonsterResponse> {
    return this.http.put<MonsterResponse>(`${API_BASE_URL}/monsters/${id}`, { userkey, monster });
  }

  private normalizeNumber(value: number | null, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.trunc(value);
  }

  private normalizeNullableNumber(value: number | null): number | null {
    if (value === null || typeof value !== 'number' || !Number.isFinite(value)) return null;
    return Math.trunc(value);
  }

  private normalizeIdList(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return Array.from(
      new Set(
        value
          .map((entry) => this.normalizeNullableNumber(entry as number | null))
          .filter((entry): entry is number => entry !== null && entry > 0)
      )
    );
  }
}
