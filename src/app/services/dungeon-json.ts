import { Injectable } from '@angular/core';
import {
  Cheater,
  CheaterInventory,
  FloorTrapPlacement,
  ObstaclePlacement,
  Trap,
  Tresher,
  TresherPlacement,
} from '../interfaces/game';
import { Key } from '../interfaces/key';

@Injectable({ providedIn: 'root' })
export class DungeonJsonService {

  // --- Private primitive helpers ---

  private toFiniteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private normalizeNumber(value: number | null, fallback: number): number {
    return value === null ? fallback : value;
  }

  private normalizeNullableNumber(value: number | null): number | null {
    if (value === null) {
      return null;
    }
    return Math.floor(value);
  }

  private parseNullableId(primary: unknown, secondary?: unknown): number | null {
    const candidate = primary ?? secondary;
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return Math.floor(candidate);
    }
    if (typeof candidate === 'string' && candidate.trim()) {
      const parsed = Number.parseInt(candidate, 10);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  // --- Public parsing methods ---

  parseTrapObject(raw: unknown): Trap | null {
    if (!raw || typeof raw !== 'object') return null;
    const src = raw as Partial<Record<string, unknown>>;
    const trapType =
      src['trapType'] === 'Pit' ? 'Pit'
      : src['trapType'] === 'Spiked Pit' ? 'Spiked Pit'
      : src['trapType'] === 'Ceiling Spikes' ? 'Ceiling Spikes'
      : src['trapType'] === 'Floor Glue' ? 'Floor Glue'
      : src['trapType'] === 'Drop Net' ? 'Drop Net'
      : src['trapType'] === 'Dart' ? 'Dart'
      : src['trapType'] === 'Gas Cloud' ? 'Gas Cloud'
      : src['trapType'] === 'Wall Spikes' ? 'Wall Spikes'
      : 'Pit';
    const sourceObjectType =
      src['sourceObjectType'] === 'floor' ? 'floor'
      : src['sourceObjectType'] === 'wall' ? 'wall'
      : src['sourceObjectType'] === 'door' ? 'door'
      : src['sourceObjectType'] === 'item' ? 'item'
      : src['sourceObjectType'] === 'tresher' ? 'tresher'
      : src['sourceObjectType'] === 'obstacle' ? 'obstacle'
      : 'floor';
    const sourceSide =
      src['sourceSide'] === 'north' ? 'north'
      : src['sourceSide'] === 'east' ? 'east'
      : src['sourceSide'] === 'south' ? 'south'
      : src['sourceSide'] === 'west' ? 'west'
      : 'north';
    const secondaryEffectTo =
      src['secondaryEffectTo'] === 'Stamina' ? 'Stamina'
      : src['secondaryEffectTo'] === 'Mind' ? 'Mind'
      : src['secondaryEffectTo'] === 'AE' ? 'AE'
      : src['secondaryEffectTo'] === 'ROS' ? 'ROS'
      : null;
    const crossingRequirements = Array.isArray(src['crossingRequirements'])
      ? (src['crossingRequirements'] as unknown[])
          .filter((entry) => !!entry && typeof entry === 'object')
          .map((entry) => {
            const req = entry as Partial<Record<string, unknown>>;
            const idRaw = req['itemId'] ?? req['itemid'] ?? req['itemID'];
            const id =
              typeof idRaw === 'number'
                ? Math.floor(idRaw)
                : typeof idRaw === 'string' && idRaw.trim()
                  ? Number.parseInt(idRaw, 10)
                  : NaN;
            if (!Number.isFinite(id) || id < 0) {
              return null;
            }
            const itemNameRaw = req['itemName'] ?? req['itemname'] ?? req['name'];
            return {
              itemId: id,
              itemName: typeof itemNameRaw === 'string' ? itemNameRaw : `Item ${id}`,
            };
          })
          .filter((entry): entry is { itemId: number; itemName: string } => entry !== null)
      : [];
    const damageTo = src['damageTo'] === 'Stamina' ? 'Stamina'
      : src['damageTo'] === 'Mind' ? 'Mind'
      : src['damageTo'] === 'AE' ? 'AE'
      : src['damageTo'] === 'ROS' ? 'ROS'
      : 'HP';
    return {
      name: typeof src['name'] === 'string' ? src['name'] : '',
      description: typeof src['description'] === 'string' ? src['description'] : '',
      damage: typeof src['damage'] === 'number' ? Math.max(0, src['damage']) : 0,
      damageTo: damageTo as 'HP' | 'Stamina' | 'Mind' | 'AE' | 'ROS',
      curseId: typeof src['curseId'] === 'number' ? src['curseId'] : null,
      toDetect: typeof src['toDetect'] === 'number' ? Math.max(0, src['toDetect']) : 10,
      toDisarm: typeof src['toDisarm'] === 'number' ? Math.max(0, src['toDisarm']) : 10,
      trapType,
      isHiddenUntilFoundOrTriggered: src['isHiddenUntilFoundOrTriggered'] === true,
      crossingRequirements,
      sourceObjectType,
      sourceSide,
      secondaryEffectTo,
      secondaryEffectAmount: typeof src['secondaryEffectAmount'] === 'number' ? Math.max(0, src['secondaryEffectAmount']) : 0,
      secondaryEffectDuration: typeof src['secondaryEffectDuration'] === 'number' ? Math.max(0, src['secondaryEffectDuration']) : 0,
    };
  }

  parseTresherItem(item: unknown): Tresher | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const source = item as Partial<Record<string, unknown>>;
    const parsedId = this.toFiniteNumber(source['id']);
    if (parsedId === null) {
      return null;
    }

    return {
      id: Math.max(0, Math.floor(parsedId)),
      type: typeof source['type'] === 'string' && (source['type'] as string).trim() ? (source['type'] as string).trim() : 'OtherTresher',
      name: typeof source['name'] === 'string' && (source['name'] as string).trim() ? source['name'] as string : 'Unnamed Tresher',
      description: typeof source['description'] === 'string' ? source['description'] as string : '',
      gold: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source['gold']), 0)),
      silver: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source['silver']), 0)),
      copper: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source['copper']), 0)),
      zinc: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source['zinc']), 0)),
      item1Id: this.normalizeNullableNumber(this.toFiniteNumber(source['item1Id'])),
      item2Id: this.normalizeNullableNumber(this.toFiniteNumber(source['item2Id'])),
      item3Id: this.normalizeNullableNumber(this.toFiniteNumber(source['item3Id'])),
      item4Id: this.normalizeNullableNumber(this.toFiniteNumber(source['item4Id'])),
      spell1Id: this.normalizeNullableNumber(this.toFiniteNumber(source['spell1Id'])),
      spell2Id: this.normalizeNullableNumber(this.toFiniteNumber(source['spell2Id'])),
      spell3Id: this.normalizeNullableNumber(this.toFiniteNumber(source['spell3Id'])),
      spell4Id: this.normalizeNullableNumber(this.toFiniteNumber(source['spell4Id'])),
      curse1Id: this.normalizeNullableNumber(this.toFiniteNumber(source['curse1Id'])),
      curse2Id: this.normalizeNullableNumber(this.toFiniteNumber(source['curse2Id'])),
      potion1Id: this.normalizeNullableNumber(this.toFiniteNumber(source['potion1Id'])),
      potion2Id: this.normalizeNullableNumber(this.toFiniteNumber(source['potion2Id'])),
      potion3Id: this.normalizeNullableNumber(this.toFiniteNumber(source['potion3Id'])),
      imageId: this.normalizeNullableNumber(this.parseNullableId(source['imageId'], source['imageid'])),
      soundId: this.normalizeNullableNumber(this.parseNullableId(source['soundId'], source['soundid'])),
      spReward: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source['spReward']), 0)),
      trap: this.parseTrapObject(source['trap']),
    };
  }

  parseTresherPlacementItem(item: unknown): TresherPlacement | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const source = item as Partial<TresherPlacement> & {
      trasherId?: unknown;
      tresherID?: unknown;
      rownId?: unknown;
      columnId?: unknown;
      col?: unknown;
    };

    const tresherIdRaw =
      source.tresherId !== undefined
        ? source.tresherId
        : source.tresherID !== undefined
          ? source.tresherID
          : source.trasherId;
    const rowRaw = source.row !== undefined ? source.row : source.rownId;
    const columnRaw =
      source.column !== undefined
        ? source.column
        : source.columnId !== undefined
          ? source.columnId
          : source.col;

    const tresherId = this.toFiniteNumber(tresherIdRaw);
    const row = this.toFiniteNumber(rowRaw);
    const column = this.toFiniteNumber(columnRaw);
    if (tresherId === null || row === null || column === null) {
      return null;
    }

    return {
      tresherId: Math.max(0, Math.floor(tresherId)),
      row: Math.floor(row),
      column: Math.floor(column),
    };
  }

  parseInventoryKeyItem(item: unknown): Key | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const sourceKey = item as Partial<Key> & {
      row?: unknown;
      column?: unknown;
    };
    const parsedId = this.toFiniteNumber(sourceKey.id);
    if (parsedId === null) {
      return null;
    }

    const rowValue = sourceKey.rownId !== undefined ? sourceKey.rownId : sourceKey.row;
    const columnValue = sourceKey.columnId !== undefined ? sourceKey.columnId : sourceKey.column;

    return {
      id: Math.max(0, Math.floor(parsedId)),
      name: typeof sourceKey.name === 'string' ? sourceKey.name : '',
      description: typeof sourceKey.description === 'string' ? sourceKey.description : '',
      doorId: this.normalizeNullableNumber(this.toFiniteNumber(sourceKey.doorId)),
      rownId: this.normalizeNullableNumber(this.toFiniteNumber(rowValue)),
      columnId: this.normalizeNullableNumber(this.toFiniteNumber(columnValue)),
    };
  }

  parseCheaterInventory(
    sourceCheater: Partial<Cheater> & {
      inventory?: unknown;
      inventoryKeys?: unknown[];
      inventoryTreshers?: unknown[];
    }
  ): CheaterInventory {
    const sourceInventory =
      sourceCheater.inventory && typeof sourceCheater.inventory === 'object'
        ? (sourceCheater.inventory as Partial<CheaterInventory> & {
            tresherList?: unknown[];
            tresherInventory?: unknown[];
          })
        : null;

    const sourceInventoryKeys = Array.isArray(sourceInventory?.keys)
      ? sourceInventory.keys
      : Array.isArray(sourceCheater.inventoryKeys)
        ? sourceCheater.inventoryKeys
        : [];

    const sourceInventoryTreshers = Array.isArray(sourceInventory?.treshers)
      ? sourceInventory.treshers
      : Array.isArray(sourceInventory?.tresherList)
        ? sourceInventory.tresherList
        : Array.isArray(sourceInventory?.tresherInventory)
          ? sourceInventory.tresherInventory
          : Array.isArray(sourceCheater.inventoryTreshers)
            ? sourceCheater.inventoryTreshers
            : [];

    const keys = sourceInventoryKeys
      .map((item) => this.parseInventoryKeyItem(item))
      .filter((item): item is Key => item !== null);

    const treshers = sourceInventoryTreshers
      .map((item) => this.parseTresherItem(item))
      .filter((item): item is Tresher => item !== null);

    return {
      keys,
      treshers,
    };
  }

  parseFloorTrapPlacements(raw: unknown): FloorTrapPlacement[] {
    if (!Array.isArray(raw)) return [];
    const result: FloorTrapPlacement[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const src = item as Partial<Record<string, unknown>>;
      const trap = this.parseTrapObject(src['trap']);
      if (!trap) continue;
      const id = typeof src['id'] === 'number' ? src['id'] : 0;
      const row = typeof src['row'] === 'number' ? src['row'] : -1;
      const column = typeof src['column'] === 'number' ? src['column'] : -1;
      if (row < 0 || column < 0) continue;
      result.push({
        id,
        row,
        column,
        trap,
        isTriggered: src['isTriggered'] === true,
        isDisarmed: src['isDisarmed'] === true,
        isDetected: src['isDetected'] === true,
      });
    }
    return result;
  }

  parseObstaclePlacements(raw: unknown): ObstaclePlacement[] {
    if (!Array.isArray(raw)) return [];
    const result: ObstaclePlacement[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const src = item as Partial<Record<string, unknown>>;
      const id = typeof src['id'] === 'number' ? src['id'] : 0;
      const row = typeof src['row'] === 'number' ? src['row'] : -1;
      const column = typeof src['column'] === 'number' ? src['column'] : -1;
      if (row < 0 || column < 0) continue;
      const hp = typeof src['hp'] === 'number' ? Math.max(1, src['hp']) : 10;
      const currentHp = typeof src['currentHp'] === 'number' ? Math.max(0, src['currentHp']) : hp;
      const heightPercent = typeof src['heightPercent'] === 'number' ? Math.max(1, Math.min(100, src['heightPercent'])) : 100;
      const heightAnchor: 'floor' | 'ceiling' = src['heightAnchor'] === 'ceiling' ? 'ceiling' : 'floor';
      const widthPercent = typeof src['widthPercent'] === 'number' ? Math.max(1, Math.min(100, src['widthPercent'])) : 100;
      const widthAnchor: 'center' | 'east' | 'west' = src['widthAnchor'] === 'east' ? 'east' : src['widthAnchor'] === 'west' ? 'west' : 'center';
      const color = typeof src['color'] === 'string' && src['color'] ? src['color'] : null;
      const shape: 'circle' | 'square' = src['shape'] === 'square' ? 'square' : 'circle';
      result.push({
        id,
        row,
        column,
        name: typeof src['name'] === 'string' ? src['name'] : 'Obstacle',
        note: typeof src['note'] === 'string' ? src['note'] : '',
        imageId: typeof src['imageId'] === 'number'
          ? src['imageId']
          : typeof src['imageid'] === 'number'
            ? src['imageid']
            : typeof src['imageId'] === 'string' && src['imageId']
              ? (parseInt(src['imageId'], 10) || null)
              : typeof src['imageid'] === 'string' && src['imageid']
                ? (parseInt(src['imageid'], 10) || null)
                : null,
        textImageId: typeof src['textImageId'] === 'number'
          ? src['textImageId']
          : typeof src['textimageid'] === 'number'
            ? src['textimageid']
            : typeof src['textImageId'] === 'string' && src['textImageId']
              ? (parseInt(src['textImageId'], 10) || null)
              : typeof src['textimageid'] === 'string' && src['textimageid']
                ? (parseInt(src['textimageid'], 10) || null)
                : null,
        hp,
        isIndestructible: src['isIndestructible'] === true,
        containsItemId: typeof src['containsItemId'] === 'number'
          ? src['containsItemId']
          : typeof src['containsitemid'] === 'number'
            ? src['containsitemid']
            : typeof src['containsItemId'] === 'string' && src['containsItemId']
              ? (parseInt(src['containsItemId'], 10) || null)
              : typeof src['containsitemid'] === 'string' && src['containsitemid']
                ? (parseInt(src['containsitemid'], 10) || null)
                : null,
        itemPlacement: src['itemPlacement'] === 'on' ? 'on' : 'in',
        requiredKeyId: typeof src['requiredKeyId'] === 'number'
          ? src['requiredKeyId']
          : typeof src['requiredkeyid'] === 'number'
            ? src['requiredkeyid']
            : typeof src['requiredKeyId'] === 'string' && src['requiredKeyId']
              ? (parseInt(src['requiredKeyId'], 10) || null)
              : typeof src['requiredkeyid'] === 'string' && src['requiredkeyid']
                ? (parseInt(src['requiredkeyid'], 10) || null)
                : null,
        trap: this.parseTrapObject(src['trap']),
        shape,
        heightPercent,
        heightAnchor,
        widthPercent,
        widthAnchor,
        color,
        currentHp,
        isUnlocked:
          src['isUnlocked'] === true ||
          src['isunlocked'] === true ||
          src['isOpened'] === true ||
          src['isDestroyed'] === true,
        isDestroyed: src['isDestroyed'] === true,
        isOpened: src['isOpened'] === true,
        itemTaken: src['itemTaken'] === true,
        isTrapDetected: src['isTrapDetected'] === true,
        isTrapDisarmed: src['isTrapDisarmed'] === true,
      });
    }
    return result;
  }
}
