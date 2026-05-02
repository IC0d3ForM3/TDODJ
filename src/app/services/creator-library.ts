import { Injectable, signal } from '@angular/core';
import { Monster, Tresher } from '../interfaces/game';

export interface TresherLibraryItem extends Tresher {
  userguid: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MonsterLibraryItem extends Monster {
  userguid: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LibImageItem {
  id: number; name: string; path: string; isPublic: boolean; isActive: boolean;
  createdAt: string; updatedAt: string; userguid: string;
}

export interface LibSoundItem {
  id: number; name: string; path: string; isPublic: boolean; isActive: boolean;
  createdAt: string; updatedAt: string; userguid: string;
}

export interface LibSpellItem {
  id: number; name: string; description: string; range: number; effectOn: string;
  effectOn2: string; lastFor: number; effectAmount: number; effectAmount2: number;
  value: number; sp: number; successTestValue: number; magicCost: number;
  costToLearn: number; imageId: number | null; soundId: number | null;
  isPublic: boolean; numberOfTargets?: number; effectType?: string; effectColor?: string; createdAt: string; updatedAt: string;
}

export type CreatorTabId = 'dungons' | 'treshers' | 'monsters' | 'images' | 'sounds' | 'spells' | 'potions' | 'items' | 'curses';

@Injectable({ providedIn: 'root' })
export class CreatorLibraryService {

  // ── Tab state ────────────────────────────────────────────────────────────
  readonly activeCreatorTab = signal<CreatorTabId>('dungons');

  // ── Tresher / monster library ────────────────────────────────────────────
  readonly tresherLibrary = signal<TresherLibraryItem[]>([]);
  readonly isLoadingTresherLibrary = signal(false);
  readonly tresherLibraryError = signal<string | null>(null);

  readonly monsterLibrary = signal<MonsterLibraryItem[]>([]);
  readonly isLoadingMonsterLibrary = signal(false);
  readonly monsterLibraryError = signal<string | null>(null);

  // ── Spell / image / sound option lists ──────────────────────────────────
  readonly libSpells = signal<{ id: number; name: string }[]>([]);
  readonly libImageOptions = signal<{ id: number; name: string; path: string }[]>([]);
  readonly libSoundOptions = signal<{ id: number; name: string; path: string }[]>([]);

  // ── User image library ───────────────────────────────────────────────────
  readonly libUserImages = signal<LibImageItem[]>([]);
  readonly isLoadingLibImages = signal(false);
  readonly libImagesError = signal<string | null>(null);
  readonly isSavingLibImage = signal(false);
  readonly editingLibImageId = signal<number | null>(null);
  readonly libImageSaveMessage = signal<string | null>(null);
  readonly isLibImageSectionVisible = signal(true);
  readonly selectedLibImageFile = signal<File | null>(null);

  // ── User sound library ───────────────────────────────────────────────────
  readonly libUserSounds = signal<LibSoundItem[]>([]);
  readonly isLoadingLibSounds = signal(false);
  readonly libSoundsError = signal<string | null>(null);
  readonly isSavingLibSound = signal(false);
  readonly editingLibSoundId = signal<number | null>(null);
  readonly libSoundSaveMessage = signal<string | null>(null);
  readonly isLibSoundSectionVisible = signal(true);
  readonly selectedLibSoundFile = signal<File | null>(null);

  // ── User spell library ───────────────────────────────────────────────────
  readonly libUserSpells = signal<LibSpellItem[]>([]);
  readonly isLoadingLibSpells = signal(false);
  readonly libSpellsError = signal<string | null>(null);
  readonly isSavingLibSpell = signal(false);
  readonly editingLibSpellId = signal<number | null>(null);
  readonly libSpellSaveMessage = signal<string | null>(null);
  readonly isLibSpellSectionVisible = signal(true);

  readonly libSpellEffectToOptions = [
    'HP', 'Defense', 'Stamina', 'Mind', 'Magic', 'Sight', 'ROS', 'AE', 'Action Economy', '# of Attacks',
  ] as const;
}
