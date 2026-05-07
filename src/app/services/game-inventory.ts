import { Injectable, inject, signal } from '@angular/core';
import { DungeonJsonService } from './dungeon-json';
import { DungeonStateService } from './dungeon-state';
import {
  CheaterInventory,
  ItemPlacement,
  SpellPlacement,
  PotionPlacement,
  Tresher,
} from '../interfaces/game';
import { Key } from '../interfaces/key';

export interface PcTresherSpellData {
  id: number;
  name: string;
  description: string;
  soundId?: number | null;
  soundPath?: string | null;
  range: number;
  effectOn: string;
  effectOn2?: string;
  effectAmount: number;
  effectAmount2?: number;
  successTestValue: number;
  sp: number;
  lastFor: number;
  numberOfTargets: number;
  magicCost?: number;
  effectType?: string;
  effectColor?: string;
  effectOnPc1?: boolean;
  effectOnPc2?: boolean;
  range1?: number;
  range2?: number;
  lastFor1?: number;
  lastFor2?: number;
}

/** Item as stored in the PC's tresher lookup map — effectValue may be null from the server. */
export type PcTresherItemData = {
  id: number;
  name: string;
  description: string;
  type: string;
  effectValue: number | null;
  damage: number;
  range: number;
  armorSlot: string | null;
  effectOn: string | null;
  effectToPc?: string | null;
  effectToPcValue?: number;
  weaponEffectType?: string;
  weaponEffectColor?: string;
  isTwoHanded: boolean;
};

/** Item as stored in floor/collected item signals — effectValue is always a number. */
export type FloorItemData = {
  id: number;
  name: string;
  description: string;
  type: string;
  imageId?: number | null;
  effectValue: number;
  damage: number;
  range: number;
  armorSlot: string | null;
  effectOn: string | null;
  effectToPc?: string | null;
  effectToPcValue?: number;
  weaponEffectType?: string;
  weaponEffectColor?: string;
  isTwoHanded: boolean;
};

type PcTresherPotionData = {
  id: number;
  name: string;
  description: string;
  effectTo: string;
  effectAmount: number;
  lastFor: number;
};

const DEFAULT_CHEATER = {
  name: 'Bob',
  rangeOfSight: 5,
  facingDir: 'right' as const,
  inventory: { keys: [], treshers: [] },
};

/**
 * Holds all PC inventory state and pure inventory helpers for the Game component.
 */
@Injectable({ providedIn: 'root' })
export class GameInventoryService {
  private readonly dungeonState = inject(DungeonStateService);
  private readonly dungeonJsonService = inject(DungeonJsonService);

  // ── Equip state (ephemeral — not serialized to dungeon JSON) ─────────────
  readonly equippedTresherIndexesByDungon = signal<Record<number, number[]>>({});
  readonly equippedItemIdsByDungon = signal<Record<number, number[]>>({});
  readonly equippedSpellIdsByDungon = signal<Record<number, number[]>>({});

  // ── Initialization guard ─────────────────────────────────────────────────
  readonly pcInventoryInitializedByDungon = signal<Record<number, boolean>>({});

  // ── PC lookup maps (populated from session payload) ──────────────────────
  readonly pcTresherItemsById = signal<Map<number, PcTresherItemData>>(new Map());
  readonly pcTresherPotionsById = signal<Map<number, PcTresherPotionData>>(new Map());
  readonly pcTresherSpellsById = signal<Map<number, PcTresherSpellData>>(new Map());

  // ── Floor inventory ──────────────────────────────────────────────────────
  readonly floorItemPlacementsByDungon = signal<Record<number, ItemPlacement[]>>({});
  readonly floorPotionPlacementsByDungon = signal<Record<number, PotionPlacement[]>>({});
  readonly floorSpellPlacementsByDungon = signal<Record<number, SpellPlacement[]>>({});
  readonly floorItemListByDungon = signal<Record<number, FloorItemData[]>>({});
  readonly floorPotionListByDungon = signal<Record<number, PcTresherPotionData[]>>({});
  readonly floorSpellListByDungon = signal<Record<number, PcTresherSpellData[]>>({});
  readonly collectedFloorItemsByDungon = signal<Record<number, FloorItemData[]>>({});
  readonly collectedFloorPotionsByDungon = signal<Record<number, PcTresherPotionData[]>>({});
  readonly collectedFloorSpellsByDungon = signal<Record<number, PcTresherSpellData[]>>({});

  // ── Pure predicates / formatters ─────────────────────────────────────────

  isTresherEquipable(tresher: Tresher): boolean {
    const type = tresher.type ?? 'OtherTresher';
    return type === 'Weapon' || type === 'Armor';
  }

  isItemEquipable(type: string): boolean {
    return type === 'weapon' || type === 'armor' || type === 'ring' || type === 'necklace';
  }

  getInventoryTresherMeta(tresher: Tresher): string {
    const parts: string[] = [];
    if (tresher.gold > 0) parts.push(`Gold: ${tresher.gold}`);
    if (tresher.silver > 0) parts.push(`Silver: ${tresher.silver}`);
    if (tresher.copper > 0) parts.push(`Copper: ${tresher.copper}`);
    if (tresher.zinc > 0) parts.push(`Zinc: ${tresher.zinc}`);
    return parts.join(' | ');
  }

  getHandsRequiredForEquip(tresher: Tresher): number {
    return (tresher.type ?? 'OtherTresher') === 'Weapon' ? 1 : 0;
  }

  normalizeCheaterInventory(inventory: CheaterInventory | null | undefined): CheaterInventory {
    return {
      keys: Array.isArray(inventory?.keys)
        ? inventory.keys.map((key) => ({ ...key }))
        : [],
      treshers: Array.isArray(inventory?.treshers)
        ? inventory.treshers.map((tresher) => ({ ...tresher }))
        : [],
    };
  }

  // ── Tresher inner content resolvers ──────────────────────────────────────

  getTresherInnerItems(tresher: Tresher): Array<PcTresherItemData> {
    const itemsMap = this.pcTresherItemsById();
    const result: PcTresherItemData[] = [];
    for (const itemId of [tresher.item1Id, tresher.item2Id, tresher.item3Id, tresher.item4Id]) {
      if (itemId != null) {
        const item = itemsMap.get(itemId);
        if (item) result.push(item);
      }
    }
    return result;
  }

  getTresherInnerPotions(tresher: Tresher): Array<PcTresherPotionData> {
    const potionsMap = this.pcTresherPotionsById();
    const result: PcTresherPotionData[] = [];
    for (const potionId of [tresher.potion1Id, tresher.potion2Id, tresher.potion3Id]) {
      if (potionId != null) {
        const potion = potionsMap.get(potionId);
        if (potion) result.push(potion);
      }
    }
    return result;
  }

  getTresherInnerSpells(tresher: Tresher): PcTresherSpellData[] {
    const spellsMap = this.pcTresherSpellsById();
    const result: PcTresherSpellData[] = [];
    for (const spellId of [tresher.spell1Id, tresher.spell2Id, tresher.spell3Id, tresher.spell4Id]) {
      if (spellId != null) {
        const spell = spellsMap.get(spellId);
        if (spell) result.push(spell);
      }
    }
    return result;
  }

  // ── Equip index helpers ───────────────────────────────────────────────────

  getEquippedTresherIndexesForDungon(dungonId: number, itemCount: number): number[] {
    const seen = new Set<number>();
    const equippedIndexes = this.equippedTresherIndexesByDungon()[dungonId] ?? [];
    const sanitizedIndexes: number[] = [];

    for (const rawIndex of equippedIndexes) {
      if (!Number.isInteger(rawIndex)) continue;
      if (rawIndex < 0 || rawIndex >= itemCount || seen.has(rawIndex)) continue;
      seen.add(rawIndex);
      sanitizedIndexes.push(rawIndex);
    }

    return sanitizedIndexes;
  }

  setEquippedTresherIndexesForDungon(dungonId: number, indexes: number[]): void {
    this.equippedTresherIndexesByDungon.update((allIndexes) => ({
      ...allIndexes,
      [dungonId]: indexes,
    }));
  }

  // ── Initialization flag ───────────────────────────────────────────────────

  setPcInventoryInitialized(dungonId: number, isInitialized: boolean): void {
    this.pcInventoryInitializedByDungon.update((allStates) => ({
      ...allStates,
      [dungonId]: isInitialized,
    }));
  }

  // ── Cheater inventory mutation helpers ───────────────────────────────────

  addItemsToCheaterInventory(dungonId: number, keys: Key[], treshers: Tresher[]): void {
    const existingCheater = this.dungeonState.cheaterByDungon()[dungonId] ?? { ...DEFAULT_CHEATER };
    const existingInventory = this.normalizeCheaterInventory(existingCheater.inventory);

    const inventoryKeys = keys.map((key) => ({
      ...key,
      rownId: null,
      columnId: null,
    }));

    this.dungeonState.cheaterByDungon.update((allCheaters) => ({
      ...allCheaters,
      [dungonId]: {
        ...existingCheater,
        inventory: {
          keys: [...existingInventory.keys, ...inventoryKeys],
          treshers: [...existingInventory.treshers, ...treshers.map((tresher) => ({ ...tresher }))],
        },
      },
    }));

    this.setPcInventoryInitialized(dungonId, true);
  }

  seedPcTreshersIntoInventory(dungonId: number, rawPcTreshers: unknown[] | undefined): void {
    if (this.pcInventoryInitializedByDungon()[dungonId]) {
      return;
    }

    if (!Array.isArray(rawPcTreshers) || rawPcTreshers.length === 0) {
      this.setPcInventoryInitialized(dungonId, true);
      return;
    }

    const existingCheater = this.dungeonState.cheaterByDungon()[dungonId] ?? { ...DEFAULT_CHEATER };
    const existingInventory = this.normalizeCheaterInventory(existingCheater.inventory);
    const existingIds = new Set(existingInventory.treshers.map((t) => t.id));

    const newTreshers = rawPcTreshers
      .map((item) => this.dungeonJsonService.parseTresherItem(item))
      .filter((item): item is Tresher => item !== null && !existingIds.has(item.id));

    if (newTreshers.length === 0) {
      this.setPcInventoryInitialized(dungonId, true);
      return;
    }

    this.dungeonState.cheaterByDungon.update((allCheaters) => ({
      ...allCheaters,
      [dungonId]: {
        ...existingCheater,
        inventory: {
          keys: existingInventory.keys,
          treshers: [...newTreshers, ...existingInventory.treshers],
        },
      },
    }));

    this.setPcInventoryInitialized(dungonId, true);
  }

  removeInnerPotionSlotFromInventoryTresher(
    dungonId: number,
    tresherIndex: number,
    potionId: number
  ): void {
    const existingCheater =
      this.dungeonState.cheaterByDungon()[dungonId] ?? { ...DEFAULT_CHEATER };
    const existingInventory = this.normalizeCheaterInventory(existingCheater.inventory);
    if (tresherIndex < 0 || tresherIndex >= existingInventory.treshers.length) return;

    const tresher = existingInventory.treshers[tresherIndex];
    const updatedTresher: Tresher = {
      ...tresher,
      potion1Id: tresher.potion1Id === potionId ? null : tresher.potion1Id,
      potion2Id: tresher.potion2Id === potionId ? null : tresher.potion2Id,
      potion3Id: tresher.potion3Id === potionId ? null : tresher.potion3Id,
    };

    const updatedTreshers = existingInventory.treshers.map((t, i) =>
      i === tresherIndex ? updatedTresher : t
    );

    this.dungeonState.cheaterByDungon.update((allCheaters) => ({
      ...allCheaters,
      [dungonId]: {
        ...existingCheater,
        inventory: {
          keys: existingInventory.keys,
          treshers: updatedTreshers,
        },
      },
    }));
  }

  removeInventoryTresherAtIndex(dungonId: number, index: number): void {
    const existingCheater =
      this.dungeonState.cheaterByDungon()[dungonId] ?? { ...DEFAULT_CHEATER };
    const existingInventory = this.normalizeCheaterInventory(existingCheater.inventory);
    if (index < 0 || index >= existingInventory.treshers.length) return;

    const updatedTreshers = existingInventory.treshers.filter((_, i) => i !== index);
    const updatedEquippedIndexes = this.getEquippedTresherIndexesForDungon(
      dungonId,
      existingInventory.treshers.length
    )
      .filter((equippedIndex) => equippedIndex !== index)
      .map((equippedIndex) => (equippedIndex > index ? equippedIndex - 1 : equippedIndex));

    this.dungeonState.cheaterByDungon.update((allCheaters) => ({
      ...allCheaters,
      [dungonId]: {
        ...existingCheater,
        inventory: {
          keys: existingInventory.keys,
          treshers: updatedTreshers,
        },
      },
    }));

    this.setEquippedTresherIndexesForDungon(dungonId, updatedEquippedIndexes);
    this.setPcInventoryInitialized(dungonId, true);
  }
}
