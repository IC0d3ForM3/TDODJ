import { Injectable } from '@angular/core';

export interface CreatorTestPcProfile {
  id: string;
  name: string;
  species: string;
  type: string;
  maxHP: number;
  currentHP: number;
  ac: number;
  actionEconomy: number;
  mind: number;
  stamina: number;
  strength: number;
  magicPower: number;
  numberOfAttacks: number;
  numberOfDefends: number;
  rangeOfView: number;
  items: unknown[];
  spells: unknown[];
  potions: unknown[];
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class CreatorTestPcService {
  private readonly keyPrefix = 'tdodj_creator_test_pcs_v1';

  getProfiles(userKey: string, dungonId: number): CreatorTestPcProfile[] {
    const key = this.storageKey(userKey, dungonId);
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((entry) => this.isValidProfile(entry));
    } catch {
      return [];
    }
  }

  getProfile(userKey: string, dungonId: number, profileId: string): CreatorTestPcProfile | null {
    return this.getProfiles(userKey, dungonId).find((profile) => profile.id === profileId) ?? null;
  }

  saveProfile(userKey: string, dungonId: number, profile: Omit<CreatorTestPcProfile, 'id' | 'updatedAt'> & { id?: string }): CreatorTestPcProfile {
    const existing = this.getProfiles(userKey, dungonId);
    const saved: CreatorTestPcProfile = {
      ...profile,
      id: profile.id && profile.id.trim() ? profile.id : this.newId(),
      updatedAt: new Date().toISOString(),
    };

    const next = existing.filter((entry) => entry.id !== saved.id);
    next.unshift(saved);
    this.writeProfiles(userKey, dungonId, next);
    return saved;
  }

  removeProfile(userKey: string, dungonId: number, profileId: string): void {
    const existing = this.getProfiles(userKey, dungonId);
    const next = existing.filter((entry) => entry.id !== profileId);
    this.writeProfiles(userKey, dungonId, next);
  }

  private writeProfiles(userKey: string, dungonId: number, profiles: CreatorTestPcProfile[]): void {
    const key = this.storageKey(userKey, dungonId);
    localStorage.setItem(key, JSON.stringify(profiles));
  }

  private storageKey(userKey: string, dungonId: number): string {
    return `${this.keyPrefix}:${userKey}:${dungonId}`;
  }

  private newId(): string {
    const random = Math.random().toString(36).slice(2, 10);
    return `testpc_${Date.now()}_${random}`;
  }

  private isValidProfile(entry: unknown): entry is CreatorTestPcProfile {
    if (!entry || typeof entry !== 'object') return false;
    const value = entry as Record<string, unknown>;
    return (
      typeof value['id'] === 'string' &&
      typeof value['name'] === 'string' &&
      typeof value['species'] === 'string' &&
      typeof value['type'] === 'string' &&
      typeof value['maxHP'] === 'number' &&
      typeof value['currentHP'] === 'number' &&
      typeof value['ac'] === 'number' &&
      typeof value['actionEconomy'] === 'number' &&
      typeof value['mind'] === 'number' &&
      typeof value['stamina'] === 'number' &&
      typeof value['strength'] === 'number' &&
      typeof value['magicPower'] === 'number' &&
      typeof value['numberOfAttacks'] === 'number' &&
      typeof value['numberOfDefends'] === 'number' &&
      typeof value['rangeOfView'] === 'number' &&
      Array.isArray(value['items']) &&
      Array.isArray(value['spells']) &&
      Array.isArray(value['potions']) &&
      typeof value['updatedAt'] === 'string'
    );
  }
}
