import { Injectable, signal } from '@angular/core';
import { ObstaclePlacement, Tresher } from '../interfaces/game';
import { PcTresherSpellData } from './game-inventory';

export interface ShopCatalogEntry {
  id: number;
  name: string;
  description: string;
  price: number;
}

export type ShopSlotKey =
  | 'item1Id' | 'item2Id' | 'item3Id' | 'item4Id'
  | 'spell1Id' | 'spell2Id' | 'spell3Id' | 'spell4Id'
  | 'potion1Id' | 'potion2Id' | 'potion3Id';

export interface ShopSellEntry {
  tresherIndex: number;
  slotKey: ShopSlotKey;
  sourceId: number;
  name: string;
  sellPrice: number;
}

@Injectable({ providedIn: 'root' })
export class GameShopService {
  readonly showYeOldMagiceShopModal = signal(false);
  readonly dismissedYeOldMagiceShopPrompts = signal<Record<string, true>>(this.loadDismissedYeOldMagiceShopPrompts());
  readonly yeOldMagiceShopView = signal<'main' | 'buyItems' | 'sellItems' | 'buySpells' | 'sellSpells' | 'buyPotions' | 'sellPotions' | 'info' | 'upgrades'>('main');
  readonly yeOldMagiceShopMessage = signal<string | null>(null);
  readonly yeOldMagiceShopInfoUnlocked = signal(false);
  readonly yeOldMagiceShopDrinkPurchased = signal(false);
  readonly yeOldMagiceShopImage = signal<'taren1' | 'taren2'>('taren1');
  readonly yeOldMagiceShopKeeperInfo = signal('');
  readonly activeYeOldMagiceShopDungonId = signal<number | null>(null);
  readonly activeYeOldMagiceShopObstacleId = signal<number | null>(null);

  readonly shopBuyItemCost = 24;
  readonly shopBuySpellCost = 30;
  readonly shopBuyPotionCost = 18;
  readonly shopDrinkCost = 6;
  readonly shopHealingCost = 10;
  readonly shopCurseClearCost = 22;

  private readonly yeOldMagiceShopPromptDismissStorageKey = 'tdodj.yeOldMagiceShopPrompt.dismissed';

  isYeOldMagiceShopObstacle(obstacle: ObstaclePlacement): boolean {
    return (obstacle.name ?? '').trim().toLowerCase() === 'ye old magice shop';
  }

  openYeOldMagiceShop(dungonId: number, obstacleId: number, keeperInfo: string): void {
    this.activeYeOldMagiceShopDungonId.set(dungonId);
    this.activeYeOldMagiceShopObstacleId.set(obstacleId);
    this.yeOldMagiceShopKeeperInfo.set(keeperInfo);
    this.yeOldMagiceShopView.set('main');
    this.yeOldMagiceShopMessage.set(null);
    this.yeOldMagiceShopInfoUnlocked.set(false);
    this.yeOldMagiceShopDrinkPurchased.set(false);
    this.yeOldMagiceShopImage.set(Math.random() < 0.5 ? 'taren1' : 'taren2');
    this.showYeOldMagiceShopModal.set(true);
  }

  closeYeOldMagiceShop(): void {
    this.showYeOldMagiceShopModal.set(false);
    this.yeOldMagiceShopView.set('main');
    this.yeOldMagiceShopMessage.set(null);
    this.activeYeOldMagiceShopDungonId.set(null);
    this.activeYeOldMagiceShopObstacleId.set(null);
  }

  setYeOldMagiceShopView(
    view: 'main' | 'buyItems' | 'sellItems' | 'buySpells' | 'sellSpells' | 'buyPotions' | 'sellPotions' | 'info' | 'upgrades'
  ): void {
    this.yeOldMagiceShopView.set(view);
    this.yeOldMagiceShopMessage.set(null);
  }

  resolveKeeperInfo(rawNote: string | null | undefined): string {
    let keeperKnows = 'The keeper squints. "I have rumors, but ale loosens the tongue."';
    try {
      const cfg = JSON.parse(rawNote ?? '{}') as { keeperKnows?: unknown };
      if (typeof cfg.keeperKnows === 'string' && cfg.keeperKnows.trim()) {
        keeperKnows = cfg.keeperKnows.trim();
      }
    } catch {
      // Fall back to default keeper text.
    }
    return keeperKnows;
  }

  getYeOldMagiceShopPromptDismissKey(gameId: number, dungonId: number, obstacleId: number): string {
    return `${gameId}:${dungonId}:${obstacleId}`;
  }

  isYeOldMagiceShopPromptDismissed(gameId: number, dungonId: number, obstacleId: number): boolean {
    const key = this.getYeOldMagiceShopPromptDismissKey(gameId, dungonId, obstacleId);
    return this.dismissedYeOldMagiceShopPrompts()[key] === true;
  }

  dismissYeOldMagiceShopPrompt(gameId: number, dungonId: number, obstacleId: number): void {
    const dismissKey = this.getYeOldMagiceShopPromptDismissKey(gameId, dungonId, obstacleId);
    this.dismissedYeOldMagiceShopPrompts.update((all) => {
      if (all[dismissKey]) {
        return all;
      }

      const next: Record<string, true> = { ...all, [dismissKey]: true };
      this.persistDismissedYeOldMagiceShopPrompts(next);
      return next;
    });
  }

  getBuyableItems(
    obstaclePlacements: Record<number, ObstaclePlacement[]>,
    activeDungonId: number | null,
    activeObstacleId: number | null,
    itemMap: Map<number, { id: number; name: string; description: string }>
  ): ShopCatalogEntry[] {
    return this.getBuyableCatalogEntries('item', obstaclePlacements, activeDungonId, activeObstacleId, itemMap);
  }

  getBuyableSpells(
    obstaclePlacements: Record<number, ObstaclePlacement[]>,
    activeDungonId: number | null,
    activeObstacleId: number | null,
    spellMap: Map<number, PcTresherSpellData>
  ): ShopCatalogEntry[] {
    return this.getBuyableCatalogEntries('spell', obstaclePlacements, activeDungonId, activeObstacleId, spellMap);
  }

  getBuyablePotions(
    obstaclePlacements: Record<number, ObstaclePlacement[]>,
    activeDungonId: number | null,
    activeObstacleId: number | null,
    potionMap: Map<number, { id: number; name: string; description: string }>
  ): ShopCatalogEntry[] {
    return this.getBuyableCatalogEntries('potion', obstaclePlacements, activeDungonId, activeObstacleId, potionMap);
  }

  buildShopPurchaseTresher(
    name: string,
    description: string,
    payload: { itemId?: number; spellId?: number; potionId?: number },
    existingTreshers: Tresher[]
  ): Tresher {
    const nextId = existingTreshers.reduce((max, tresher) => Math.max(max, tresher.id), 0) + 1;
    return {
      id: nextId,
      name,
      description,
      type: 'Shop',
      gold: 0,
      silver: 0,
      copper: 0,
      zinc: 0,
      item1Id: payload.itemId ?? null,
      item2Id: null,
      item3Id: null,
      item4Id: null,
      spell1Id: payload.spellId ?? null,
      spell2Id: null,
      spell3Id: null,
      spell4Id: null,
      curse1Id: null,
      curse2Id: null,
      potion1Id: payload.potionId ?? null,
      potion2Id: null,
      potion3Id: null,
      imageId: null,
      soundId: null,
      spReward: 0,
      trap: null,
      isquest: false,
    };
  }

  getSellEntries(
    kind: 'item' | 'spell' | 'potion',
    inventoryTreshers: Tresher[],
    itemMap: Map<number, { name: string }>,
    spellMap: Map<number, { name: string }>,
    potionMap: Map<number, { name: string }>
  ): ShopSellEntry[] {
    const slotsByKind: Record<'item' | 'spell' | 'potion', ShopSlotKey[]> = {
      item: ['item1Id', 'item2Id', 'item3Id', 'item4Id'],
      spell: ['spell1Id', 'spell2Id', 'spell3Id', 'spell4Id'],
      potion: ['potion1Id', 'potion2Id', 'potion3Id'],
    };

    const baseCost = kind === 'spell'
      ? this.shopBuySpellCost
      : kind === 'potion'
        ? this.shopBuyPotionCost
        : this.shopBuyItemCost;

    const entries: ShopSellEntry[] = [];
    for (let tresherIndex = 0; tresherIndex < inventoryTreshers.length; tresherIndex += 1) {
      const tresher = inventoryTreshers[tresherIndex];
      for (const slotKey of slotsByKind[kind]) {
        const value = tresher[slotKey];
        if (typeof value !== 'number') continue;

        let name = 'Unknown';
        if (kind === 'item') name = itemMap.get(value)?.name ?? `Item ${value}`;
        if (kind === 'spell') name = spellMap.get(value)?.name ?? `Spell ${value}`;
        if (kind === 'potion') name = potionMap.get(value)?.name ?? `Potion ${value}`;

        entries.push({
          tresherIndex,
          slotKey,
          sourceId: value,
          name,
          sellPrice: Math.max(2, Math.floor(baseCost / 2)),
        });
      }
    }

    return entries;
  }

  private getBuyableCatalogEntries<T extends { id: number; name: string; description: string }>(
    kind: 'item' | 'spell' | 'potion',
    obstaclePlacements: Record<number, ObstaclePlacement[]>,
    activeDungonId: number | null,
    activeObstacleId: number | null,
    sourceMap: Map<number, T>
  ): ShopCatalogEntry[] {
    if (activeDungonId == null || activeObstacleId == null) return [];

    const obstacle = (obstaclePlacements[activeDungonId] ?? []).find((entry) => entry.id === activeObstacleId);
    if (!obstacle) return [];

    const idsByKind = this.readShopNoteIds(obstacle.note);
    const ids = kind === 'item'
      ? idsByKind.itemIds
      : kind === 'spell'
        ? idsByKind.spellIds
        : idsByKind.potionIds;

    const price = kind === 'item'
      ? this.shopBuyItemCost
      : kind === 'spell'
        ? this.shopBuySpellCost
        : this.shopBuyPotionCost;

    return ids
      .map((id) => sourceMap.get(id))
      .filter((entry): entry is T => entry != null)
      .map((entry) => ({ id: entry.id, name: entry.name, description: entry.description, price }));
  }

  private readShopNoteIds(rawNote: string | null | undefined): {
    itemIds: number[];
    spellIds: number[];
    potionIds: number[];
  } {
    try {
      const parsed = JSON.parse(rawNote ?? '{}') as {
        itemIds?: unknown;
        spellIds?: unknown;
        potionIds?: unknown;
      };

      const normalizeIds = (value: unknown): number[] =>
        Array.isArray(value)
          ? value.filter((id): id is number => typeof id === 'number' && Number.isFinite(id))
          : [];

      return {
        itemIds: normalizeIds(parsed.itemIds),
        spellIds: normalizeIds(parsed.spellIds),
        potionIds: normalizeIds(parsed.potionIds),
      };
    } catch {
      return { itemIds: [], spellIds: [], potionIds: [] };
    }
  }

  private loadDismissedYeOldMagiceShopPrompts(): Record<string, true> {
    try {
      const raw = sessionStorage.getItem(this.yeOldMagiceShopPromptDismissStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};

      const normalized: Record<string, true> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (value === true) {
          normalized[key] = true;
        }
      }
      return normalized;
    } catch {
      return {};
    }
  }

  private persistDismissedYeOldMagiceShopPrompts(value: Record<string, true>): void {
    try {
      sessionStorage.setItem(this.yeOldMagiceShopPromptDismissStorageKey, JSON.stringify(value));
    } catch {
      // Ignore storage failures; prompt dismissal still works for this runtime instance.
    }
  }
}
