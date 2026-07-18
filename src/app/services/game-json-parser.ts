import { Injectable, inject } from '@angular/core';
import { Door } from '../interfaces/door';
import {
  Cheater,
  DungonExit,
  ExitDestinationType,
  ExitTransitionType,
  FacingDirection,
  FloorTrapPlacement,
  ItemPlacement,
  Monster,
  MonsterAttack,
  MonsterPlacement,
  normalizeSquareTextWallSide,
  ObstaclePlacement,
  PortalPlacement,
  PotionPlacement,
  SpellPlacement,
  SquareSide,
  SquareText,
  StartPoint,
  Trap,
  Tresher,
  TresherPlacement,
} from '../interfaces/game';
import { Key } from '../interfaces/key';
import { Square } from '../interfaces/square';
import { Wall } from '../interfaces/wall';
import { TurnPhase } from './game-combat';
import { DungeonJsonService } from './dungeon-json';
import { PcTresherSpellData } from './game-inventory';

type RangerFavoredTypeBonuses = Record<string, number>;

interface ParserSideRule {
  side: SquareSide;
  neighborRowOffset: number;
  neighborColumnOffset: number;
  oppositeSide: SquareSide;
}

export interface ParsedPcTresherCurseData {
  id: number;
  name: string;
  description: string;
  effectTo: string;
  effectTo2: string | null;
  damage: number;
  damage2: number;
  lastFor: number;
}

export interface ParsedFloorItemRecord {
  id: number;
  name: string;
  description: string;
  type: string;
  imageId?: number | null;
  soundId?: number | null;
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
  uses?: number | null;
}

export interface ParsedFloorPotionRecord {
  id: number;
  name: string;
  description: string;
  effectTo: string;
  effectAmount: number;
  lastFor: number;
}

export interface ParsedDungonJsonPayload {
  filledSquares: Record<string, true>;
  squares: Record<string, Square>;
  keyList: Key[];
  cheater: Cheater;
  startpoint: StartPoint | null;
  tresherList: Tresher[];
  tresherPlacements: TresherPlacement[];
  monsterList: Monster[];
  monsterPlacements: MonsterPlacement[];
  squareTexts: SquareText[];
  exits: DungonExit[];
  portalPlacements: PortalPlacement[];
  floorTrapPlacements: FloorTrapPlacement[];
  obstaclePlacements: ObstaclePlacement[];
  itemPlacements: ItemPlacement[];
  potionPlacements: PotionPlacement[];
  spellPlacements: SpellPlacement[];
  floorItemList: ParsedFloorItemRecord[];
  floorPotionList: ParsedFloorPotionRecord[];
  floorSpellList: PcTresherSpellData[];
  collectedFloorItems: ParsedFloorItemRecord[];
  collectedFloorPotions: ParsedFloorPotionRecord[];
  collectedFloorSpells: PcTresherSpellData[];
  learnedFloorSpellIds: number[];
  equippedSpellIds: number[];
  rangerRangedHitBonus: number;
  rangerFavoredTypeDamageBonuses: RangerFavoredTypeBonuses;
  pcInventoryInitialized: boolean;
  savedPlayerHp: number | null;
  savedPlayerAE: number | null;
  savedTurnPhase: TurnPhase | null;
  savedPlayerRow: number | null;
  savedPlayerColumn: number | null;
  npcTradesPurchased: number[];
  cheaterByPcId: Record<number, Cheater>;
}

@Injectable({ providedIn: 'root' })
export class GameJsonParserService {
  private readonly dungeonJsonService = inject(DungeonJsonService);

  resolvePlayerMaxHp(value: unknown): number {
    const parsedValue = this.toFiniteNumber(value);
    if (parsedValue === null) {
      return 20;
    }

    return Math.max(1, Math.floor(parsedValue));
  }

  resolvePlayerCurrentHp(value: unknown, maxHp: number): number {
    const parsedValue = this.toFiniteNumber(value);
    if (parsedValue === null) {
      return maxHp;
    }

    return Math.max(0, Math.min(Math.floor(parsedValue), maxHp));
  }

  normalizeSpellRecord(raw: unknown): PcTresherSpellData | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const source = raw as Record<string, unknown>;
    const id = this.toFiniteNumber(source['id']);
    if (id === null) {
      return null;
    }

    const effectType = source['effectType'] === 'Fire' || source['effectType'] === 'Ice' || source['effectType'] === 'Lightning' || source['effectType'] === 'Splah' || source['effectType'] === 'Other'
      ? source['effectType'] as string
      : source['effecttype'] === 'Fire' || source['effecttype'] === 'Ice' || source['effecttype'] === 'Lightning' || source['effecttype'] === 'Splah' || source['effecttype'] === 'Other'
        ? source['effecttype'] as string
        : 'Other';
    const effectColorSource = source['effectColor'] ?? source['effectcolor'];
    const effectColor = typeof effectColorSource === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(effectColorSource.trim())
      ? effectColorSource.trim().toLowerCase()
      : undefined;
    const targetType = source['targetType'] === 'monster' || source['targetType'] === 'trap' || source['targetType'] === 'pc' || source['targetType'] === 'auto'
      ? source['targetType'] as 'auto' | 'monster' | 'trap' | 'pc'
      : source['targettype'] === 'monster' || source['targettype'] === 'trap' || source['targettype'] === 'pc' || source['targettype'] === 'auto'
        ? source['targettype'] as 'auto' | 'monster' | 'trap' | 'pc'
        : 'auto';
    const soundPath = typeof source['soundPath'] === 'string'
      ? source['soundPath'].trim()
      : typeof source['path'] === 'string'
        ? source['path'].trim()
        : '';

    return {
      id: Math.floor(id),
      name: typeof source['name'] === 'string' && source['name'].trim() ? source['name'].trim() : 'Unnamed Spell',
      description: typeof source['description'] === 'string' ? source['description'] : '',
      soundId: this.normalizeNullableNumber(this.toFiniteNumber(source['soundId'] ?? source['soundid'])),
      soundPath: soundPath || null,
      range: Math.max(1, this.normalizeNumber(this.toFiniteNumber(source['range']), 1)),
      effectOn: typeof source['effectOn'] === 'string'
        ? source['effectOn']
        : (typeof source['effecton'] === 'string' ? source['effecton'] : 'HP'),
      effectOn2: typeof source['effectOn2'] === 'string'
        ? source['effectOn2']
        : (typeof source['effecton2'] === 'string' ? source['effecton2'] : ''),
      effectAmount: this.normalizeNumber(this.toFiniteNumber(source['effectAmount'] ?? source['damage']), 0),
      effectAmount2: this.normalizeNumber(this.toFiniteNumber(source['effectAmount2'] ?? source['effectamount2']), 0),
      successTestValue: this.normalizeNumber(this.toFiniteNumber(source['successTestValue'] ?? source['successtestvalue']), 10),
      sp: Math.max(1, this.normalizeNumber(this.toFiniteNumber(source['sp']), 1)),
      targetType,
      lastFor: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source['lastFor'] ?? source['lastfor']), 0)),
      numberOfTargets: Math.max(1, this.normalizeNumber(this.toFiniteNumber(source['numberOfTargets'] ?? source['numberoftargets']), 1)),
      magicCost: Math.max(1, this.normalizeNumber(this.toFiniteNumber(source['magicCost'] ?? source['magiccost']), 1)),
      effectType,
      effectColor,
      effectOnPc1: source['effectOnPc1'] === true || source['effectonpc1'] === true,
      effectOnPc2: source['effectOnPc2'] === true || source['effectonpc2'] === true,
      range1: this.normalizeNumber(this.toFiniteNumber(source['range1']), 0),
      range2: this.normalizeNumber(this.toFiniteNumber(source['range2']), 0),
      lastFor1: this.normalizeNumber(this.toFiniteNumber(source['lastFor1'] ?? source['lastfor1']), 0),
      lastFor2: this.normalizeNumber(this.toFiniteNumber(source['lastFor2'] ?? source['lastfor2']), 0),
      effectDiceCount: this.toFiniteNumber(source['effectDiceCount'] ?? source['effectdicecount']) ?? undefined,
      effectDiceSides: this.toFiniteNumber(source['effectDiceSides'] ?? source['effectdicesides']) ?? undefined,
      effectAmount2DiceCount: this.toFiniteNumber(source['effectAmount2DiceCount'] ?? source['effectamount2dicecount']) ?? undefined,
      effectAmount2DiceSides: this.toFiniteNumber(source['effectAmount2DiceSides'] ?? source['effectamount2dicesides']) ?? undefined,
    };
  }

  normalizeCurseRecord(raw: unknown): ParsedPcTresherCurseData | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const source = raw as Record<string, unknown>;
    const id = this.toFiniteNumber(source['id']);
    if (id === null) {
      return null;
    }

    const effectTo = typeof source['effectTo'] === 'string'
      ? source['effectTo']
      : (typeof source['effectto'] === 'string' ? source['effectto'] : 'HP');
    const effectTo2 = typeof source['effectTo2'] === 'string'
      ? source['effectTo2']
      : (typeof source['effectto2'] === 'string' ? source['effectto2'] : null);

    return {
      id: Math.floor(id),
      name: typeof source['name'] === 'string' && source['name'].trim() ? source['name'].trim() : 'Unnamed Curse',
      description: typeof source['description'] === 'string' ? source['description'] : '',
      effectTo,
      effectTo2: effectTo2 && effectTo2.trim() ? effectTo2 : null,
      damage: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source['damage']), 0)),
      damage2: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source['damage2'] ?? source['effectAmount2']), 0)),
      lastFor: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source['lastFor'] ?? source['lastfor']), 0)),
    };
  }

  parsePcTresherItemMap(rawItems: unknown[] | undefined): Map<number, ParsedFloorItemRecord> {
    const itemMap = new Map<number, ParsedFloorItemRecord>();
    if (!Array.isArray(rawItems)) {
      return itemMap;
    }

    for (const raw of rawItems) {
      const item = this.parseInventoryItemRecord(raw);
      if (item !== null) {
        itemMap.set(item.id, item);
      }
    }

    return itemMap;
  }

  parsePcTresherPotionMap(rawPotions: unknown[] | undefined): Map<number, ParsedFloorPotionRecord> {
    const potionMap = new Map<number, ParsedFloorPotionRecord>();
    if (!Array.isArray(rawPotions)) {
      return potionMap;
    }

    for (const raw of rawPotions) {
      const potion = this.parsePotionRecord(raw);
      if (potion !== null) {
        potionMap.set(potion.id, potion);
      }
    }

    return potionMap;
  }

  parsePcTresherSpellMap(rawSpells: unknown[] | undefined): Map<number, PcTresherSpellData> {
    const spellMap = new Map<number, PcTresherSpellData>();
    if (!Array.isArray(rawSpells)) {
      return spellMap;
    }

    for (const raw of rawSpells) {
      const spell = this.normalizeSpellRecord(raw);
      if (spell !== null) {
        spellMap.set(spell.id, spell);
      }
    }

    return spellMap;
  }

  parsePcTresherCurseMap(rawCurses: unknown[] | undefined): Map<number, ParsedPcTresherCurseData> {
    const curseMap = new Map<number, ParsedPcTresherCurseData>();
    if (!Array.isArray(rawCurses)) {
      return curseMap;
    }

    for (const raw of rawCurses) {
      const curse = this.normalizeCurseRecord(raw);
      if (curse !== null) {
        curseMap.set(curse.id, curse);
      }
    }

    return curseMap;
  }

  parseDungonJsonPayload(rawDungonJson: unknown): ParsedDungonJsonPayload {
    if (!rawDungonJson || typeof rawDungonJson !== 'object') {
      return {
        filledSquares: {},
        squares: {},
        keyList: [],
        cheater: { ...DEFAULT_CHEATER },
        startpoint: null,
        tresherList: [],
        tresherPlacements: [],
        monsterList: [],
        monsterPlacements: [],
        squareTexts: [],
        exits: [],
        portalPlacements: [],
        floorTrapPlacements: [],
        obstaclePlacements: [],
        itemPlacements: [],
        potionPlacements: [],
        spellPlacements: [],
        floorItemList: [],
        floorPotionList: [],
        floorSpellList: [],
        collectedFloorItems: [],
        collectedFloorPotions: [],
        collectedFloorSpells: [],
        learnedFloorSpellIds: [],
        equippedSpellIds: [],
        rangerRangedHitBonus: 2,
        rangerFavoredTypeDamageBonuses: { Beast: 2 },
        pcInventoryInitialized: false,
        savedPlayerHp: null,
        savedPlayerAE: null,
        savedTurnPhase: null,
        savedPlayerRow: null,
        savedPlayerColumn: null,
        npcTradesPurchased: [],
        cheaterByPcId: {},
      };
    }

    const source = rawDungonJson as Record<string, unknown>;

    const filledSquaresSource =
      source['filledSquares'] && typeof source['filledSquares'] === 'object'
        ? (source['filledSquares'] as Record<string, unknown>)
        : {};
    const filledSquares = Object.keys(filledSquaresSource).reduce<Record<string, true>>(
      (accumulator, key) => {
        if (Boolean(filledSquaresSource[key])) {
          accumulator[key] = true;
        }

        return accumulator;
      },
      {}
    );

    const rawSquares =
      source['squares'] && typeof source['squares'] === 'object'
        ? (source['squares'] as Record<string, Square>)
        : {};
    const squares = this.synchronizeDoorConnections(rawSquares);

    const keyList = Array.isArray(source['keyList'])
      ? source['keyList']
          .map((item) => {
            if (!item || typeof item !== 'object') {
              return null;
            }

            const sourceKey = item as Partial<Key>;
            if (typeof sourceKey.id !== 'number') {
              return null;
            }

            return {
              id: sourceKey.id,
              name: typeof sourceKey.name === 'string' ? sourceKey.name : '',
              description: typeof sourceKey.description === 'string' ? sourceKey.description : '',
              doorId: typeof sourceKey.doorId === 'number' ? sourceKey.doorId : null,
              rownId: typeof sourceKey.rownId === 'number' ? sourceKey.rownId : null,
              columnId: typeof sourceKey.columnId === 'number' ? sourceKey.columnId : null,
            } as Key;
          })
          .filter((item): item is Key => item !== null)
      : [];

    const sourceCheater =
      source['cheater'] && typeof source['cheater'] === 'object'
        ? (source['cheater'] as Partial<Cheater> & {
            inventory?: unknown;
            inventoryKeys?: unknown[];
            inventoryTreshers?: unknown[];
          })
        : {};

    const inventory = this.dungeonJsonService.parseCheaterInventory(sourceCheater);
    const cheater: Cheater = {
      name: typeof sourceCheater.name === 'string' && sourceCheater.name.trim() ? sourceCheater.name : DEFAULT_CHEATER.name,
      rangeOfSight:
        typeof sourceCheater.rangeOfSight === 'number' && Number.isFinite(sourceCheater.rangeOfSight)
          ? sourceCheater.rangeOfSight
          : DEFAULT_CHEATER.rangeOfSight,
      facingDir: this.normalizeFacingDirection(sourceCheater.facingDir),
      inventory,
    };

    const sourceStartPointRaw =
      source['startpoint'] && typeof source['startpoint'] === 'object'
        ? source['startpoint']
        : source['startPoint'] && typeof source['startPoint'] === 'object'
          ? source['startPoint']
          : null;

    let startpoint: StartPoint | null = null;
    if (sourceStartPointRaw) {
      const sourceStartPoint = sourceStartPointRaw as Partial<StartPoint>;
      const parsedRow = typeof sourceStartPoint.row === 'number' && Number.isFinite(sourceStartPoint.row) ? Math.floor(sourceStartPoint.row) : null;
      const parsedCol = typeof sourceStartPoint.col === 'number' && Number.isFinite(sourceStartPoint.col) ? Math.floor(sourceStartPoint.col) : null;

      if (parsedRow !== null && parsedCol !== null) {
        startpoint = {
          row: parsedRow,
          col: parsedCol,
          description: typeof sourceStartPoint.description === 'string' ? sourceStartPoint.description : '',
          playerSees: typeof sourceStartPoint.playerSees === 'string' ? sourceStartPoint.playerSees : '',
        };
      }
    }

    const sourceTresherList = Array.isArray(source['tresherList'])
      ? source['tresherList']
      : Array.isArray(source['trasherList'])
        ? source['trasherList']
        : Array.isArray(source['tresher'])
          ? source['tresher']
          : [];

    const tresherList = sourceTresherList
      .map((item) => this.dungeonJsonService.parseTresherItem(item))
      .filter((item): item is Tresher => item !== null);

    const sourceTresherPlacements = Array.isArray(source['tresherPlacements'])
      ? source['tresherPlacements']
      : Array.isArray(source['tresherPlacementList'])
        ? source['tresherPlacementList']
        : Array.isArray(source['trasherPlacements'])
          ? source['trasherPlacements']
          : [];

    const validTresherIds = new Set(tresherList.map((tresher) => tresher.id));
    const tresherPlacements = sourceTresherPlacements
      .map((item) => this.dungeonJsonService.parseTresherPlacementItem(item))
      .filter((item): item is TresherPlacement => item !== null && validTresherIds.has(item.tresherId));

    const sourceMonsterList = Array.isArray(source['monsterList'])
      ? source['monsterList']
      : Array.isArray(source['monsters'])
        ? source['monsters']
        : [];

    const monsterList = sourceMonsterList
      .map((item) => this.parseMonsterItem(item))
      .filter((item): item is Monster => item !== null);

    const sourceMonsterPlacements = Array.isArray(source['monsterPlacements'])
      ? source['monsterPlacements']
      : Array.isArray(source['monsterPlacementList'])
        ? source['monsterPlacementList']
        : [];

    const validMonsterIds = new Set(monsterList.map((monster) => monster.id));
    const monsterPlacements = sourceMonsterPlacements
      .map((item) => this.parseMonsterPlacementItem(item))
      .filter((item): item is MonsterPlacement => item !== null && validMonsterIds.has(item.monsterId));

    const savedPlayerHpRaw = this.toFiniteNumber(source['playerHp']);
    const savedPlayerAERaw = this.toFiniteNumber(source['playerAE']);
    const savedTurnPhaseRaw = source['turnPhase'];
    const savedTurnPhase: TurnPhase | null =
      savedTurnPhaseRaw === 'player' || savedTurnPhaseRaw === 'monsters' || savedTurnPhaseRaw === 'gameover'
        ? savedTurnPhaseRaw
        : null;

    const savedPlayerRow = this.toFiniteNumber(source['playerRow']);
    const savedPlayerColumn = this.toFiniteNumber(source['playerColumn']);
    const pcInventoryInitialized =
      source['pcInventoryInitialized'] === true ||
      savedPlayerHpRaw !== null ||
      savedPlayerAERaw !== null ||
      savedTurnPhase !== null ||
      savedPlayerRow !== null ||
      savedPlayerColumn !== null;

    const squareTexts: SquareText[] = Array.isArray(source['squareTexts'])
      ? source['squareTexts']
          .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
          .map((item) => ({
            id: Math.max(0, Math.floor(Number(item['id']) || 0)),
            row: Math.max(0, Math.floor(Number(item['row']) || 0)),
            column: Math.max(0, Math.floor(Number(item['column']) || 0)),
            text: typeof item['text'] === 'string' ? item['text'] : '',
            wallSide: normalizeSquareTextWallSide(item['wallSide']),
          }))
          .filter((st) => st.text.trim().length > 0)
      : [];

    const sourceExits = Array.isArray(source['exits'])
      ? source['exits']
      : Array.isArray(source['exitList'])
        ? source['exitList']
        : [];
    const exits: DungonExit[] = sourceExits
      .map((item) => this.parseExitItem(item))
      .filter((item): item is DungonExit => item !== null);

    const floorTrapPlacements = this.dungeonJsonService.parseFloorTrapPlacements(source['floorTrapPlacements']);
    const obstaclePlacements = this.dungeonJsonService.parseObstaclePlacements(source['obstaclePlacements']);

    const itemPlacements: ItemPlacement[] = Array.isArray(source['itemPlacements'])
      ? source['itemPlacements']
          .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
          .map((x) => {
            const itemId = typeof x['itemId'] === 'number' ? x['itemId'] : null;
            const row = typeof x['row'] === 'number' ? Math.floor(x['row']) : null;
            const column = typeof x['column'] === 'number' ? Math.floor(x['column']) : null;
            if (itemId === null || row === null || column === null) return null;
            return { itemId, row, column } as ItemPlacement;
          })
          .filter((x): x is ItemPlacement => x !== null)
      : [];

    const potionPlacements: PotionPlacement[] = Array.isArray(source['potionPlacements'])
      ? source['potionPlacements']
          .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
          .map((x) => {
            const potionId = typeof x['potionId'] === 'number' ? x['potionId'] : null;
            const row = typeof x['row'] === 'number' ? Math.floor(x['row']) : null;
            const column = typeof x['column'] === 'number' ? Math.floor(x['column']) : null;
            if (potionId === null || row === null || column === null) return null;
            return { potionId, row, column } as PotionPlacement;
          })
          .filter((x): x is PotionPlacement => x !== null)
      : [];

    const spellPlacements: SpellPlacement[] = Array.isArray(source['spellPlacements'])
      ? source['spellPlacements']
          .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
          .map((x) => {
            const spellId = typeof x['spellId'] === 'number' ? x['spellId'] : null;
            const row = typeof x['row'] === 'number' ? Math.floor(x['row']) : null;
            const column = typeof x['column'] === 'number' ? Math.floor(x['column']) : null;
            if (spellId === null || row === null || column === null) return null;
            return { spellId, row, column } as SpellPlacement;
          })
          .filter((x): x is SpellPlacement => x !== null)
      : [];

    const floorItemList = Array.isArray(source['floorItemList']) ? this.parseItemArray(source['floorItemList']) : [];
    const floorPotionList = Array.isArray(source['floorPotionList']) ? this.parsePotionArray(source['floorPotionList']) : [];

    const npcTradesPurchased: number[] = Array.isArray(source['npcTradesPurchased'])
      ? source['npcTradesPurchased'].filter((x): x is number => typeof x === 'number')
      : [];

    const floorSpellList: PcTresherSpellData[] = Array.isArray(source['floorSpellList'])
      ? this.parseSpellArray(source['floorSpellList'])
      : Array.isArray(source['spellList'])
        ? this.parseSpellArray(source['spellList'])
        : Array.isArray(source['spells'])
          ? this.parseSpellArray(source['spells'])
          : [];

    const collectedFloorItems = Array.isArray(source['collectedFloorItems']) ? this.parseItemArray(source['collectedFloorItems']) : [];
    const collectedFloorPotions = Array.isArray(source['collectedFloorPotions']) ? this.parsePotionArray(source['collectedFloorPotions']) : [];
    const collectedFloorSpells = Array.isArray(source['collectedFloorSpells']) ? this.parseSpellArray(source['collectedFloorSpells']) : [];
    const learnedFloorSpellIds = Array.isArray(source['learnedFloorSpellIds'])
      ? source['learnedFloorSpellIds']
          .map((x) => this.toFiniteNumber(x))
          .filter((x): x is number => x !== null)
          .map((x) => Math.max(0, Math.floor(x)))
      : [];
    const equippedSpellIds = Array.isArray(source['equippedSpellIds'])
      ? source['equippedSpellIds']
          .map((x) => this.toFiniteNumber(x))
          .filter((x): x is number => x !== null)
          .map((x) => Math.max(0, Math.floor(x)))
      : [];

    const rangerRangedHitBonus =
      typeof source['rangerRangedHitBonus'] === 'number' && Number.isFinite(source['rangerRangedHitBonus'])
        ? Math.max(2, Math.floor(source['rangerRangedHitBonus']))
        : 2;
    const rangerFavoredTypeDamageBonuses: RangerFavoredTypeBonuses = { Beast: 2 };
    if (source['rangerFavoredTypeDamageBonuses'] && typeof source['rangerFavoredTypeDamageBonuses'] === 'object') {
      for (const [rawType, rawBonus] of Object.entries(source['rangerFavoredTypeDamageBonuses'] as Record<string, unknown>)) {
        const type = this.normalizeMonsterTypeLabel(rawType);
        if (!type || typeof rawBonus !== 'number' || !Number.isFinite(rawBonus)) {
          continue;
        }
        rangerFavoredTypeDamageBonuses[type] = Math.max(2, Math.floor(rawBonus));
      }
    }

    const cheaterByPcId: Record<number, Cheater> = {};
    if (source['cheaterByPcId'] && typeof source['cheaterByPcId'] === 'object') {
      for (const [key, val] of Object.entries(source['cheaterByPcId'] as Record<string, unknown>)) {
        const pcId = Number(key);
        if (!Number.isInteger(pcId) || pcId <= 0 || !val || typeof val !== 'object') continue;
        const raw = val as Partial<Cheater> & { inventory?: unknown };
        cheaterByPcId[pcId] = {
          name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : DEFAULT_CHEATER.name,
          rangeOfSight: typeof raw.rangeOfSight === 'number' && Number.isFinite(raw.rangeOfSight) ? raw.rangeOfSight : DEFAULT_CHEATER.rangeOfSight,
          facingDir: this.normalizeFacingDirection(raw.facingDir),
          inventory: this.dungeonJsonService.parseCheaterInventory(raw),
        };
      }
    }

    const portalPlacements: PortalPlacement[] = Array.isArray(source['portalPlacements'])
      ? source['portalPlacements']
          .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
          .map((x): PortalPlacement | null => {
            const id = typeof x['id'] === 'number' ? Math.floor(x['id']) : 0;
            const toNullableInt = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : null;
            const look = x['look'] === 'starDown' ? 'starDown' : x['look'] === 'magicDoor' ? 'magicDoor' : 'starUp';
            return {
              id,
              name: typeof x['name'] === 'string' ? x['name'] : '',
              description: typeof x['description'] === 'string' ? x['description'] : '',
              look,
              isTwoWay: x['isTwoWay'] !== false,
              startRow: toNullableInt(x['startRow']),
              startColumn: toNullableInt(x['startColumn']),
              endRow: toNullableInt(x['endRow']),
              endColumn: toNullableInt(x['endColumn']),
            };
          })
          .filter((x): x is PortalPlacement => x !== null)
      : [];

    return {
      filledSquares,
      squares,
      keyList,
      cheater,
      startpoint,
      tresherList,
      tresherPlacements,
      monsterList,
      monsterPlacements,
      squareTexts,
      exits,
      portalPlacements,
      floorTrapPlacements,
      obstaclePlacements,
      itemPlacements,
      potionPlacements,
      spellPlacements,
      floorItemList,
      floorPotionList,
      floorSpellList,
      collectedFloorItems,
      collectedFloorPotions,
      collectedFloorSpells,
      learnedFloorSpellIds,
      equippedSpellIds,
      rangerRangedHitBonus,
      rangerFavoredTypeDamageBonuses,
      pcInventoryInitialized,
      savedPlayerHp: savedPlayerHpRaw,
      savedPlayerAE: savedPlayerAERaw,
      savedTurnPhase,
      savedPlayerRow: savedPlayerRow !== null ? Math.floor(savedPlayerRow) : null,
      savedPlayerColumn: savedPlayerColumn !== null ? Math.floor(savedPlayerColumn) : null,
      npcTradesPurchased,
      cheaterByPcId,
    };
  }

  private parseInventoryItemRecord(raw: unknown): ParsedFloorItemRecord | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const item = raw as Record<string, unknown>;
    const id = this.toFiniteNumber(item['id']);
    if (id === null) {
      return null;
    }

    return {
      id: Math.floor(id),
      name: typeof item['name'] === 'string' ? item['name'] : '',
      description: typeof item['description'] === 'string' ? item['description'] : '',
      type: typeof item['type'] === 'string' ? item['type'] : 'other',
      imageId: typeof item['imageId'] === 'number' ? item['imageId'] : (typeof item['imageid'] === 'number' ? item['imageid'] : null),
      soundId: typeof item['soundId'] === 'number' ? item['soundId'] : (typeof item['soundid'] === 'number' ? item['soundid'] : null),
      effectValue: typeof item['effectValue'] === 'number' ? item['effectValue'] : (typeof item['effectvalue'] === 'number' ? item['effectvalue'] : 0),
      damage: typeof item['damage'] === 'number' ? item['damage'] : 6,
      range: typeof item['range'] === 'number' ? Math.max(1, item['range']) : 1,
      armorSlot: typeof item['armorSlot'] === 'string' ? item['armorSlot'] : (typeof item['armorslot'] === 'string' ? item['armorslot'] : null),
      effectOn: typeof item['effectOn'] === 'string' ? item['effectOn'] : (typeof item['effecton'] === 'string' ? item['effecton'] : null),
      effectToPc: typeof item['effectToPc'] === 'string' ? item['effectToPc'] : (typeof item['effecttopc'] === 'string' ? item['effecttopc'] : null),
      effectToPcValue: typeof item['effectToPcValue'] === 'number' ? item['effectToPcValue'] : (typeof item['effecttopcvalue'] === 'number' ? item['effecttopcvalue'] : 0),
      weaponEffectType: typeof item['weaponEffectType'] === 'string' ? item['weaponEffectType'] : 'Blood',
      weaponEffectColor: typeof item['weaponEffectColor'] === 'string' ? item['weaponEffectColor'] : '#cc0000',
      isTwoHanded: item['isTwoHanded'] === true || item['istwohanded'] === true,
      uses: typeof item['uses'] === 'number' ? item['uses'] : null,
    };
  }

  private parsePotionRecord(raw: unknown): ParsedFloorPotionRecord | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const potion = raw as Record<string, unknown>;
    const id = this.toFiniteNumber(potion['id']);
    if (id === null) {
      return null;
    }

    return {
      id: Math.floor(id),
      name: typeof potion['name'] === 'string' ? potion['name'] : '',
      description: typeof potion['description'] === 'string' ? potion['description'] : '',
      effectTo: typeof potion['effectTo'] === 'string' ? potion['effectTo'] : 'HP',
      effectAmount: typeof potion['effectAmount'] === 'number' ? potion['effectAmount'] : 0,
      lastFor: typeof potion['lastFor'] === 'number' ? Math.max(0, potion['lastFor']) : 0,
    };
  }

  private parseItemArray(raw: unknown[]): ParsedFloorItemRecord[] {
    return raw
      .map((item) => this.parseInventoryItemRecord(item))
      .filter((item): item is ParsedFloorItemRecord => item !== null);
  }

  private parsePotionArray(raw: unknown[]): ParsedFloorPotionRecord[] {
    return raw
      .map((item) => this.parsePotionRecord(item))
      .filter((item): item is ParsedFloorPotionRecord => item !== null);
  }

  private parseSpellArray(raw: unknown[]): PcTresherSpellData[] {
    return raw
      .map((item) => this.normalizeSpellRecord(item))
      .filter((item): item is PcTresherSpellData => item !== null);
  }

  private parseMonsterItem(item: unknown): Monster | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const source = item as Partial<Monster> & {
      movement_economy?: unknown;
      run_at?: unknown;
      number_of_attacks?: unknown;
    };

    const parsedId = this.toFiniteNumber(source.id);
    if (parsedId === null) {
      return null;
    }

    return {
      id: Math.max(0, Math.floor(parsedId)),
      monsterDbId: typeof (source as Record<string, unknown>)['monsterDbId'] === 'number' ? (source as Record<string, unknown>)['monsterDbId'] as number : undefined,
      imageId: typeof source.imageId === 'number' ? source.imageId : null,
      tresherIds: Array.isArray(source.tresherIds) ? source.tresherIds.map((val) => this.toFiniteNumber(val)).filter((val): val is number => val !== null) : [],
      keyIds: Array.isArray(source.keyIds) ? source.keyIds.map((val) => this.toFiniteNumber(val)).filter((val): val is number => val !== null) : [],
      name: typeof source.name === 'string' && source.name.trim() ? source.name : 'Unnamed Monster',
      type: typeof source.type === 'string' ? source.type : 'Unknown',
      description: typeof source.description === 'string' ? source.description : '',
      hp: Math.max(1, this.normalizeNumber(this.toFiniteNumber(source.hp), 1)),
      movementEconomy: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.movementEconomy ?? source.movement_economy), 0)),
      ac: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.ac), 10)),
      runAt: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.runAt ?? source.run_at), 0)),
      numberOfAttacks: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.numberOfAttacks ?? source.number_of_attacks), 1)),
      attacks: this.normalizeMonsterAttacks(source.attacks),
      spReward: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.spReward), 0)),
      soundId: typeof source.soundId === 'number' ? source.soundId : null,
      magic: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.magic), 0)),
      magicResistance: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.magicResistance), 0)),
      castPlus: Math.max(
        0,
        this.normalizeNumber(
          this.toFiniteNumber((source as Record<string, unknown>)['castPlus'] ?? (source as Record<string, unknown>)['castplus']),
          0
        )
      ),
      callsReinforcements: (source as Record<string, unknown>)['callsReinforcements'] === true,
      reinforcementCount: Math.max(0, this.normalizeNumber(this.toFiniteNumber((source as Record<string, unknown>)['reinforcementCount']), 0)),
      reinforcementMonsterName:
        typeof (source as Record<string, unknown>)['reinforcementMonsterName'] === 'string' &&
        String((source as Record<string, unknown>)['reinforcementMonsterName']).trim()
          ? String((source as Record<string, unknown>)['reinforcementMonsterName']).trim()
          : null,
      toHitPlusNeeded: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.toHitPlusNeeded), 0)),
      npcGreeting: typeof source.npcGreeting === 'string' && source.npcGreeting.trim() ? source.npcGreeting : null,
      npcInfo1: typeof source.npcInfo1 === 'string' && source.npcInfo1.trim() ? source.npcInfo1 : null,
      npcInfo2: typeof source.npcInfo2 === 'string' && source.npcInfo2.trim() ? source.npcInfo2 : null,
      npcInfo3: typeof source.npcInfo3 === 'string' && source.npcInfo3.trim() ? source.npcInfo3 : null,
      npcOnlyAttackWhenAttacked: (source as Record<string, unknown>)['npcOnlyAttackWhenAttacked'] === true,
      npcGivesInfoAfterDamaged: (source as Record<string, unknown>)['npcGivesInfoAfterDamaged'] === true,
      npcAttacksAfterInfo: (source as Record<string, unknown>)['npcAttacksAfterInfo'] === true,
      npcCanTrade: (source as Record<string, unknown>)['npcCanTrade'] === true,
      awareness: typeof (source as Record<string, unknown>)['awareness'] === 'number' ? (source as Record<string, unknown>)['awareness'] as number : 5,
    };
  }

  private parseMonsterPlacementItem(item: unknown): MonsterPlacement | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const source = item as Partial<MonsterPlacement> & {
      monsterID?: unknown;
      monster_id?: unknown;
      rownId?: unknown;
      columnId?: unknown;
      col?: unknown;
      isRoaming?: unknown;
      rome?: unknown;
      tresherIds?: unknown;
      keyIds?: unknown;
    };

    const monsterIdRaw = source.monsterId !== undefined ? source.monsterId : source.monsterID !== undefined ? source.monsterID : source.monster_id;
    const rowRaw = source.row !== undefined ? source.row : source.rownId;
    const columnRaw = source.column !== undefined ? source.column : source.columnId !== undefined ? source.columnId : source.col;
    const roamRaw = source.roam !== undefined ? source.roam : source.isRoaming !== undefined ? source.isRoaming : source.rome;

    const monsterId = this.toFiniteNumber(monsterIdRaw);
    const row = this.toFiniteNumber(rowRaw);
    const column = this.toFiniteNumber(columnRaw);
    if (monsterId === null || row === null || column === null) {
      return null;
    }

    const result: MonsterPlacement = {
      monsterId: Math.max(0, Math.floor(monsterId)),
      row: Math.floor(row),
      column: Math.floor(column),
      roam: roamRaw === true,
    };

    if (source.isDead === true) {
      result.isDead = true;
    }
    const savedHp = this.toFiniteNumber(source.currentHp);
    if (savedHp !== null) {
      result.currentHp = savedHp;
    }
    const savedMagic = this.toFiniteNumber((source as Record<string, unknown>)['currentMagic']);
    if (savedMagic !== null) {
      result.currentMagic = savedMagic;
    }
    const rawPermanentMods = (source as Record<string, unknown>)['permanentStatModifiers'];
    if (rawPermanentMods && typeof rawPermanentMods === 'object' && !Array.isArray(rawPermanentMods)) {
      const normalized: Record<string, number> = {};
      for (const [rawKey, rawValue] of Object.entries(rawPermanentMods as Record<string, unknown>)) {
        const key = typeof rawKey === 'string' ? rawKey.trim() : '';
        const value = this.toFiniteNumber(rawValue);
        if (!key || value === null || !Number.isFinite(value) || value === 0) continue;
        normalized[key] = value;
      }
      if (Object.keys(normalized).length > 0) {
        result.permanentStatModifiers = normalized;
      }
    }
    if (Array.isArray(source.tresherIds)) {
      result.tresherIds = source.tresherIds.map((v) => this.toFiniteNumber(v)).filter((v): v is number => v !== null).map((v) => Math.max(0, Math.floor(v)));
    }
    if (Array.isArray(source.keyIds)) {
      result.keyIds = source.keyIds.map((v) => this.toFiniteNumber(v)).filter((v): v is number => v !== null).map((v) => Math.max(0, Math.floor(v)));
    }
    const rawItemIds = (source as Record<string, unknown>)['itemIds'];
    if (Array.isArray(rawItemIds)) {
      result.itemIds = rawItemIds.map((v) => this.toFiniteNumber(v)).filter((v): v is number => v !== null).map((v) => Math.max(0, Math.floor(v)));
    }
    const rawSpellIds = (source as Record<string, unknown>)['spellIds'];
    if (Array.isArray(rawSpellIds)) {
      result.spellIds = rawSpellIds.map((v) => this.toFiniteNumber(v)).filter((v): v is number => v !== null).map((v) => Math.max(0, Math.floor(v)));
    }
    const rawPotionIds = (source as Record<string, unknown>)['potionIds'];
    if (Array.isArray(rawPotionIds)) {
      result.potionIds = rawPotionIds.map((v) => this.toFiniteNumber(v)).filter((v): v is number => v !== null).map((v) => Math.max(0, Math.floor(v)));
    }
    const gold = this.toFiniteNumber((source as Record<string, unknown>)['gold']);
    if (gold !== null && gold > 0) result.gold = Math.max(0, Math.floor(gold));
    const silver = this.toFiniteNumber((source as Record<string, unknown>)['silver']);
    if (silver !== null && silver > 0) result.silver = Math.max(0, Math.floor(silver));
    const copper = this.toFiniteNumber((source as Record<string, unknown>)['copper']);
    if (copper !== null && copper > 0) result.copper = Math.max(0, Math.floor(copper));
    const zinc = this.toFiniteNumber((source as Record<string, unknown>)['zinc']);
    if (zinc !== null && zinc > 0) result.zinc = Math.max(0, Math.floor(zinc));
    const weaponItemId = this.toFiniteNumber((source as Record<string, unknown>)['weaponItemId']);
    if (weaponItemId !== null) result.weaponItemId = Math.max(0, Math.floor(weaponItemId));
    if (source.isDormant === true) {
      result.isDormant = true;
    }
    const guardRow = this.toFiniteNumber((source as Record<string, unknown>)['guardRow']);
    if (guardRow !== null) {
      result.guardRow = Math.floor(guardRow);
    }
    const guardColRaw = this.toFiniteNumber((source as Record<string, unknown>)['guardColumn']);
    if (guardColRaw !== null) {
      result.guardColumn = Math.floor(guardColRaw);
    }
    if ((source as Record<string, unknown>)['isStationary'] === true) {
      result.isStationary = true;
    }
    const stationaryTriggerRow = this.toFiniteNumber((source as Record<string, unknown>)['stationaryTriggerRow']);
    if (stationaryTriggerRow !== null) {
      result.stationaryTriggerRow = Math.floor(stationaryTriggerRow);
    }
    const stationaryTriggerCol = this.toFiniteNumber((source as Record<string, unknown>)['stationaryTriggerCol']);
    if (stationaryTriggerCol !== null) {
      result.stationaryTriggerCol = Math.floor(stationaryTriggerCol);
    }
    if ((source as Record<string, unknown>)['noAttackUnlessAttacked'] === true) {
      result.noAttackUnlessAttacked = true;
    }

    return result;
  }

  private normalizeMonsterAttacks(value: unknown): MonsterAttack[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const source = item as Partial<MonsterAttack> & { plus_to_hit?: unknown };
        return {
          type: typeof source.type === 'string' ? source.type : 'Weapon',
          description: typeof source.description === 'string' ? source.description : '',
          damage: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.damage), 0)),
          plusToHit: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.plusToHit ?? source.plus_to_hit), 0)),
          range: Math.max(1, this.normalizeNumber(this.toFiniteNumber(source.range), 1)),
          weaponItemId: typeof source.weaponItemId === 'number' ? source.weaponItemId : null,
          spellId: typeof source.spellId === 'number' ? source.spellId : null,
          curseId: typeof source.curseId === 'number' ? source.curseId : null,
        };
      })
      .filter((item): item is MonsterAttack => item !== null);
  }

  private parseExitItem(item: unknown): DungonExit | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const source = item as Partial<DungonExit> & {
      col?: unknown;
      destinationDungonID?: unknown;
      exitType?: unknown;
    };

    const parsedId = this.toFiniteNumber(source.id);
    const row = this.toFiniteNumber(source.row);
    const column = this.toFiniteNumber(source.column ?? source.col);
    if (parsedId === null || row === null || column === null) {
      return null;
    }

    const destinationType: ExitDestinationType = source.destinationType === 'dungon' ? 'dungon' : 'outside';
    const destinationRaw = source.destinationDungonId !== undefined ? source.destinationDungonId : (source as unknown as Record<string, unknown>)['destinationDungonID'];
    const parsedDestination = this.normalizeNullableNumber(this.toFiniteNumber(destinationRaw));
    const transitionSource = source.transitionType ?? source.exitType;
    const transitionType: ExitTransitionType = transitionSource === 'stairsUp' || transitionSource === 'stairsDown' || transitionSource === 'open' ? transitionSource : 'open';

    return {
      id: Math.max(0, Math.floor(parsedId)),
      row: Math.floor(row),
      column: Math.floor(column),
      destinationType,
      destinationDungonId: destinationType === 'dungon' ? parsedDestination : null,
      transitionType,
      itemRequirement: this.parseExitItemRequirement((source as unknown as Record<string, unknown>)['itemRequirement']),
    };
  }

  private parseExitItemRequirement(raw: unknown): { itemId: number; itemName: string; consume: boolean } | null {
    if (!raw || typeof raw !== 'object') return null;
    const src = raw as Partial<Record<string, unknown>>;
    const itemId = typeof src['itemId'] === 'number' ? src['itemId'] : null;
    if (itemId === null) return null;
    return {
      itemId,
      itemName: typeof src['itemName'] === 'string' ? src['itemName'] : '',
      consume: src['consume'] === true,
    };
  }

  private normalizeFacingDirection(direction: unknown): FacingDirection {
    return direction === 'up' || direction === 'right' || direction === 'down' || direction === 'left'
      ? direction
      : DEFAULT_CHEATER.facingDir;
  }

  private synchronizeDoorConnections(squares: Record<string, Square>): Record<string, Square> {
    const synchronizedSquares = Object.entries(squares).reduce<Record<string, Square>>((accumulator, [squareKey, square]) => {
      accumulator[squareKey] = { ...square };
      return accumulator;
    }, {});

    for (const squareKey of Object.keys(synchronizedSquares)) {
      const square = synchronizedSquares[squareKey];

      for (const sideRule of SIDE_RULES) {
        if (sideRule.side === 'toTop' || sideRule.side === 'toLeft') {
          continue;
        }

        const neighborRow = square.row + sideRule.neighborRowOffset;
        const neighborColumn = square.column + sideRule.neighborColumnOffset;
        const neighborKey = this.getSquareKey(neighborRow, neighborColumn);
        const neighborSquare = synchronizedSquares[neighborKey];
        if (!neighborSquare) {
          continue;
        }

        const currentConnection = synchronizedSquares[squareKey][sideRule.side];
        const neighborConnection = neighborSquare[sideRule.oppositeSide];
        const currentDoor = this.isDoorConnection(currentConnection) ? currentConnection : null;
        const neighborDoor = this.isDoorConnection(neighborConnection) ? neighborConnection : null;
        if (!currentDoor && !neighborDoor) {
          continue;
        }

        const sharedDoor = currentDoor ?? neighborDoor;
        if (!sharedDoor) {
          continue;
        }

        if (synchronizedSquares[squareKey][sideRule.side] !== sharedDoor) {
          synchronizedSquares[squareKey] = this.withSquareSide(synchronizedSquares[squareKey], sideRule.side, sharedDoor);
        }

        if (synchronizedSquares[neighborKey][sideRule.oppositeSide] !== sharedDoor) {
          synchronizedSquares[neighborKey] = this.withSquareSide(synchronizedSquares[neighborKey], sideRule.oppositeSide, sharedDoor);
        }
      }
    }

    return synchronizedSquares;
  }

  private withSquareSide(square: Square, side: SquareSide, value: Door | Wall | null): Square {
    return {
      ...square,
      [side]: value,
    };
  }

  private isWallConnection(connection: Door | Wall | null): connection is Wall {
    return connection !== null && !('keyLock' in connection);
  }

  private isDoorConnection(connection: Door | Wall | null): connection is Door {
    return connection !== null && 'keyLock' in connection;
  }

  private getSquareKey(row: number, column: number): string {
    return `${row}:${column}`;
  }

  private normalizeMonsterTypeLabel(value: string | null | undefined): string {
    return typeof value === 'string' ? value.trim() : '';
  }

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
}

const DEFAULT_CHEATER: Cheater = {
  name: 'Bob',
  rangeOfSight: 5,
  facingDir: 'right',
  inventory: {
    keys: [],
    treshers: [],
  },
};

const SIDE_RULES: ParserSideRule[] = [
  { side: 'toTop', oppositeSide: 'toBottom', neighborRowOffset: -1, neighborColumnOffset: 0 },
  { side: 'toRight', oppositeSide: 'toLeft', neighborRowOffset: 0, neighborColumnOffset: 1 },
  { side: 'toBottom', oppositeSide: 'toTop', neighborRowOffset: 1, neighborColumnOffset: 0 },
  { side: 'toLeft', oppositeSide: 'toRight', neighborRowOffset: 0, neighborColumnOffset: -1 },
];