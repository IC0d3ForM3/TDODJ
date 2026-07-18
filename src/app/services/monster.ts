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
  magicResistance: number;
  castPlus: number;
  spReward: number;
  isPublic: boolean;
  callsReinforcements: boolean;
  reinforcementCount: number;
  reinforcementMonsterName: string | null;
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
  magicResistance: number;
  castPlus: number;
  spReward: number;
  isPublic: boolean;
  callsReinforcements: boolean;
  reinforcementCount: number;
  reinforcementMonsterName: string | null;
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

type UnknownAttackShape = {
  type?: unknown;
  description?: unknown;
  damage?: unknown;
  plusToHit?: unknown;
  weaponItemId?: unknown;
  spellId?: unknown;
  curseId?: unknown;
};

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
              magicResistance: this.normalizeNumber((item as { magicResistance?: unknown; magicresistance?: unknown }).magicResistance ?? (item as { magicresistance?: unknown }).magicresistance, 0),
              castPlus: this.normalizeNumber((item as { castPlus?: unknown; castplus?: unknown }).castPlus ?? (item as { castplus?: unknown }).castplus, 0),
              spReward: this.normalizeNumber(item.spReward, 0),
              callsReinforcements: item.callsReinforcements === true,
              reinforcementCount: Math.max(0, this.normalizeNumber(item.reinforcementCount, 0)),
              reinforcementMonsterName:
                typeof item.reinforcementMonsterName === 'string' && item.reinforcementMonsterName.trim()
                  ? item.reinforcementMonsterName.trim()
                  : null,
              toHitPlusNeeded: this.normalizeNumber(item.toHitPlusNeeded, 0),
              npcGreeting: typeof item.npcGreeting === 'string' ? item.npcGreeting : null,
              npcInfo1: typeof item.npcInfo1 === 'string' ? item.npcInfo1 : null,
              npcInfo2: typeof item.npcInfo2 === 'string' ? item.npcInfo2 : null,
              npcInfo3: typeof item.npcInfo3 === 'string' ? item.npcInfo3 : null,
              npcOnlyAttackWhenAttacked: item.npcOnlyAttackWhenAttacked === true,
              npcGivesInfoAfterDamaged: item.npcGivesInfoAfterDamaged === true,
              npcAttacksAfterInfo: item.npcAttacksAfterInfo === true,
              npcCanTrade: item.npcCanTrade === true,
              attacks: this.normalizeAttackList(item.attacks).map((attack) => ({
                    type: typeof attack.type === 'string' && attack.type.trim() ? attack.type : 'Bite',
                    description: typeof attack.description === 'string' ? attack.description : '',
                    damage: this.normalizeNumber(attack.damage, 0),
                    plusToHit: this.normalizeNumber(attack.plusToHit, 0),
                    weaponItemId: this.normalizeNullableNumber(attack.weaponItemId),
                    spellId: this.normalizeNullableNumber(attack.spellId),
                    curseId: this.normalizeNullableNumber(attack.curseId),
                  })),
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

  private normalizeNumber(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return Math.trunc(parsed);
    }
    return fallback;
  }

  private normalizeNullableNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return Math.trunc(parsed);
    }
    return null;
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

  private normalizeAttackList(value: unknown): UnknownAttackShape[] {
    if (Array.isArray(value)) {
      return value.filter((entry): entry is UnknownAttackShape => !!entry && typeof entry === 'object');
    }

    if (typeof value === 'string' && value.trim() !== '') {
      try {
        const parsed = JSON.parse(value) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.filter((entry): entry is UnknownAttackShape => !!entry && typeof entry === 'object');
        }
      } catch {
        return [];
      }
    }

    return [];
  }
}
