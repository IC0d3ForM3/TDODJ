import { Injectable, signal } from '@angular/core';
import { Door } from '../interfaces/door';
import { Monster, SquareSide, Trap } from '../interfaces/game';
import { GameMonsterInstance } from './game-combat';

export type InfoPanelTab = 'nearby' | 'inventory';

export interface NearbyDoorInfo {
  door: Door;
  squareKey: string;
  side: SquareSide;
  neighborSquareKey: string;
  neighborSide: SquareSide;
  direction: string;
  canOpen: boolean;
  canUnlock: boolean;
  canPick: boolean;
  matchingKeyIndex: number | null;
  canPassWithItem: boolean;
}

export interface StashItem {
  id: number;
  name: string;
  description: string;
  type: string;
  gold: number;
  silver: number;
  copper: number;
  zinc: number;
  spReward: number;
  imageId: number | null;
  soundId: number | null;
  isquest: boolean;
}

@Injectable({ providedIn: 'root' })
export class GameInteractionService {
  // Info panel tab (nearby / inventory)
  readonly activeInfoPanelTab = signal<InfoPanelTab>('nearby');

  // Contextual action message shown above the preview grid
  readonly previewActionMessage = signal<string | null>(null);

  // Trap discovered (door search, tresher, or floor)
  readonly foundTrap = signal<{
    trap: Trap;
    source: 'door' | 'tresher' | 'floor' | 'obstacle';
    doorInfo?: NearbyDoorInfo;
    tresherIndex?: number;
    floorTrapId?: number;
    obstacleId?: number;
    adjacentRow?: number;
    adjacentColumn?: number;
  } | null>(null);

  // NPC dialog
  readonly npcDialog = signal<{ instance: GameMonsterInstance; template: Monster; creativeGreeting?: string } | null>(null);
  readonly npcTradesPurchased = signal<number[]>([]);

  // Stash (items available to pick up at the dungeon exit)
  readonly stashItems = signal<StashItem[]>([]);

  // Dungeon completion
  readonly dungonSpReward = signal<number>(0);
  readonly dungonWon = signal<boolean>(false);
  readonly showTavernModal = signal<boolean>(false);
}
