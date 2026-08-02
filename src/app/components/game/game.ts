import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { Account } from '../../services/account';
import { GameDrawingAssetsService } from '../../services/game-drawing-assets';
import { DungeonStateService } from '../../services/dungeon-state';
import { GameJsonParserService, ParsedPcTresherCurseData as PcTresherCurseData } from '../../services/game-json-parser';
import { GameShopService, ShopCatalogEntry, ShopSellEntry } from '../../services/game-shop';
import { GameSoundService } from '../../services/game-sound';
import { GameInventoryService, PcTresherSpellData } from '../../services/game-inventory';
import { GameCombatService, TurnPhase, GameMonsterInstance, CombatLogEntry, ActiveEffect } from '../../services/game-combat';
import { GameMovementService } from '../../services/game-movement';
import { GameInteractionService, InfoPanelTab, NearbyDoorInfo, StashItem } from '../../services/game-interaction';
import { DungeonFirstPersonComponent } from '../dungeon-first-person/dungeon-first-person';
import { DungeonPreviewGridComponent } from '../dungeon-preview-grid/dungeon-preview-grid';
import { TavernModalComponent, TavernStat } from '../tavern-modal/tavern-modal';
import { AdInterstitialComponent } from '../ad-interstitial/ad-interstitial';
import { AdService } from '../../services/ad.service';
import { Door } from '../../interfaces/door';
import { Square } from '../../interfaces/square';
import { Wall } from '../../interfaces/wall';
import { Key } from '../../interfaces/key';
import { API_BASE_URL } from '../../api-config';
import { rollNotation, maxNotation } from '../../utils/dice';
import { getMonsterTypeCombatModifiers } from '../../utils/monster-type-modifiers';
import {
  AdjacentConnectionInfo,
  Cheater,
  CheaterInventory,
  DungonExit,
  ExitDestinationType,
  ExitTransitionType,
  FacingDirection,
  FirstPersonBlock,
  FirstPersonStep,
  FirstPersonView,
  GridPreviewContext,
  Monster,
  MonsterAttack,
  MonsterPlacement,
  NearbyDiscoveryItem,
  PathBlockType,
  SideRule,
  SquareSide,
  SquareText,
  normalizeSquareTextWallSide,
  StartPoint,
  Tresher,
  TresherPlacement,
  Trap,
  FloorTrapPlacement,
  ItemPlacement,
  SpellPlacement,
  PotionPlacement,
  ObstaclePlacement,
  PortalPlacement,
  PortalLook,
} from '../../interfaces/game';

interface GameSessionPayload {
  id: number;
  dungonid: number;
  name: string;
  dungenJson: unknown;
  lastupdated: string;
  pcTreshers?: unknown[];
  pcTresherItems?: unknown[];
  pcTresherPotions?: unknown[];
  pcTresherSpells?: unknown[];
  pcTresherCurses?: unknown[];
  pcCurrentHP?: number | null;
  pcMaxHP?: number | null;
  pcSp?: number | null;
  pcMind?: number | null;
  pcStamina?: number | null;
  pcAc?: number | null;
  pcStrength?: number | null;
  pcMagicPower?: number | null;
  pcDexterity?: number | null;
  pcAwareness?: number | null;
  pcNumberOfAttacks?: number | null;
  pcNumberOfDefends?: number | null;
  pcType?: string | null;
  pcSpecies?: string | null;
  pcName?: string | null;
  pcImagePath?: string | null;
  currentPcId?: number | null;
  isMainGame?: boolean;
  resettablePerPc?: boolean;
  dungonSpReward?: number;
  monsterImages?: { id: number; path: string }[];
  lootImages?: { id: number; path: string }[];
  obstacleImages?: { id: number; path: string }[];
  soundPaths?: { id: number; path: string }[];
  dungonCoverImagePath?: string | null;
}

interface CreatorTestAssetRecord {
  id: number;
  name: string;
  description?: string;
  [key: string]: unknown;
}

interface CreatorTestPcProfilePayload {
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
  items: CreatorTestAssetRecord[];
  spells: CreatorTestAssetRecord[];
  potions: CreatorTestAssetRecord[];
  updatedAt: string;
}

interface ImageRecordPayload {
  id: number;
  path: string;
}

const CREATOR_TEST_PC_KEY_PREFIX = 'tdodj_creator_test_pcs_v1';

type MonsterImpactKind = 'blood' | 'fire' | 'ice' | 'lightning' | 'arcane' | 'mind' | 'splah' | 'rangedTarget';
type MonsterImpactProjectile = 'arrow' | 'knife';
type MonsterImpactState = { kind: MonsterImpactKind; color?: string | null; projectile?: MonsterImpactProjectile | null; startedAt: number; expiresAt: number };
type DiagonalFacingDirection = 'upRight' | 'downRight' | 'downLeft' | 'upLeft';
type DisplayFacingDirection = FacingDirection | DiagonalFacingDirection;
type DirectionPadDirection = DisplayFacingDirection | 'center';

interface DirectionPadButton {
  direction: DirectionPadDirection;
  label: string;
  ariaLabel: string;
}

interface NearbyObstacleInfo {
  obstacle: ObstaclePlacement;
  direction: string;
  canOpen: boolean;
  canUseKey: boolean;
  canPick: boolean;
  canTakeItem: boolean;
  hasMatchingKey: boolean;
  canSmash: boolean;
  canClose: boolean;
}

interface BackpackItemEntry {
  id: number;
  name: string;
  description: string;
  type: string;
  effectValue: number | null;
  armorSlot: string | null;
  damage: number;
  range: number;
  effectOn: string | null;
  effectToPc?: string | null;
  effectToPcValue?: number;
  uses?: number | null;
  imageId?: number | null;
  source: 'tresher' | 'collected';
  tresherIdx?: number;
}

interface InventoryDetailsModalData {
  title: string;
  lines: string[];
}

interface PendingTrapCrossingPrompt {
  dungonId: number;
  fromRow: number;
  fromColumn: number;
  rowOffset: number;
  columnOffset: number;
  trapId: number;
  trapName: string;
  requiredItems: Array<{
    itemId: number;
    itemName: string;
    owned: boolean;
  }>;
}

type RangerFavoredTypeBonuses = Record<string, number>;

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [DungeonFirstPersonComponent, DungeonPreviewGridComponent, TavernModalComponent, AdInterstitialComponent],
  templateUrl: './game.html',
  styleUrl: './game.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Game implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly account = inject(Account);
  private readonly adService = inject(AdService);
  private readonly drawingAssets = inject(GameDrawingAssetsService);
  private readonly dungeonState = inject(DungeonStateService);
  private readonly gameJsonParserService = inject(GameJsonParserService);
  private readonly gameShopService = inject(GameShopService);
  private readonly gameSoundService = inject(GameSoundService);
  readonly inventoryService = inject(GameInventoryService);
  readonly combatService = inject(GameCombatService);
  readonly movementService = inject(GameMovementService);
  readonly interactionService = inject(GameInteractionService);

  private previewGridCanvasRef: ElementRef<HTMLCanvasElement> | null = null;
  private firstPersonCanvasRef: ElementRef<HTMLCanvasElement> | null = null;

  @ViewChild('previewGridCanvas')
  set previewGridCanvas(value: ElementRef<HTMLCanvasElement> | undefined) {
    this.previewGridCanvasRef = value ?? null;
    this.drawPreviewGridCanvas();
  }

  @ViewChild('firstPersonCanvas')
  set firstPersonCanvas(value: ElementRef<HTMLCanvasElement> | undefined) {
    this.firstPersonCanvasRef = value ?? null;
    this.drawFirstPersonViewCanvas();
  }

  readonly isLoadingGame = signal(false);
  readonly isPreloadingAssets = signal(false);
  readonly dungonCoverImageUrl = signal<string | null>(null);
  readonly gameLoadError = signal<string | null>(null);
  readonly gameName = signal('Game');
  readonly gameLastUpdated = signal<string | null>(null);
  readonly playerPortraitUrl = signal<string | null>(null);

  // ─── Ad overlay ──────────────────────────────────────────────────────────
  readonly showAdOverlay = signal(false);
  readonly adOverlayMessage = signal('');
  private _adOnContinue: (() => void) | null = null;

  /** Show ad interstitial if ads are enabled; otherwise run onContinue immediately. */
  private showAdThen(message: string, onContinue: () => void): void {
    if (!this.adService.showAds()) {
      onContinue();
      return;
    }
    this.adOverlayMessage.set(message);
    this._adOnContinue = onContinue;
    this.showAdOverlay.set(true);
  }

  continueAfterAd(): void {
    this.showAdOverlay.set(false);
    const cb = this._adOnContinue;
    this._adOnContinue = null;
    cb?.();
  }
  get previewActionMessage() { return this.interactionService.previewActionMessage; }

  readonly playerDeadName = computed(() => {
    if (this.turnPhase() !== 'gameover') return null;
    const currentPcName = this.playerName();
    if (currentPcName && currentPcName.trim().length > 0) {
      return currentPcName;
    }
    const preview = this.gridPreviewContext();
    if (!preview) return null;
    return this.cheaterByDungon()[preview.dungonId]?.name ?? null;
  });
  get playerDeathCause() { return this.combatService.playerDeathCause; }
  get visualFacingByDungon() { return this.movementService.visualFacingByDungon; }
  get activeInfoPanelTab() { return this.interactionService.activeInfoPanelTab; }
  get equippedTresherIndexesByDungon() { return this.inventoryService.equippedTresherIndexesByDungon; }
  get equippedItemIdsByDungon() { return this.inventoryService.equippedItemIdsByDungon; }
  get equippedSpellIdsByDungon() { return this.inventoryService.equippedSpellIdsByDungon; }

  get gridPreviewContext() { return this.movementService.gridPreviewContext; }
  get cheaterByDungon() { return this.dungeonState.cheaterByDungon; }
  get startPointByDungon() { return this.dungeonState.startPointByDungon; }
  get tresherListByDungon() { return this.dungeonState.tresherListByDungon; }
  get tresherPlacementsByDungon() { return this.dungeonState.tresherPlacementsByDungon; }
  get monsterListByDungon() { return this.dungeonState.monsterListByDungon; }
  get monsterPlacementsByDungon() { return this.dungeonState.monsterPlacementsByDungon; }
  get filledSquaresByDungon() { return this.dungeonState.filledSquaresByDungon; }
  get squaresByDungon() { return this.dungeonState.squaresByDungon; }
  get squareTextsByDungon() { return this.dungeonState.squareTextsByDungon; };

  private readonly monsterImageCache = this.drawingAssets.monsterImageCache;
  private readonly monsterImageCacheVersion = this.drawingAssets.monsterImageCacheVersion;
  private readonly obstacleImageCache = this.drawingAssets.obstacleImageCache;
  private readonly obstacleImageCacheVersion = this.drawingAssets.obstacleImageCacheVersion;
  readonly examinedObstacleResults = signal<Map<number, string>>(new Map());
  private readonly lootImageCache = this.drawingAssets.lootImageCache;
  private readonly lootImageCacheVersion = this.drawingAssets.lootImageCacheVersion;
  private readonly spellCatalogById = signal<Map<number, PcTresherSpellData>>(new Map());
  private readonly pcTresherCursesById = signal<Map<number, PcTresherCurseData>>(new Map());
  private readonly soundPathById = this.gameSoundService.soundPathById;
  private readonly learnedFloorSpellIdsByDungon = signal<Record<number, number[]>>({});
  private readonly doorImageCache = this.drawingAssets.doorImageCache;
  private readonly defaultSpellSoundPath = this.gameSoundService.defaultSpellSoundPath;
  readonly monsterImpactEffects = signal<Record<string, MonsterImpactState>>({});
  readonly monsterImpactPulse = signal(0);
  private monsterImpactPulseTimer: ReturnType<typeof setInterval> | null = null;
  readonly rangerRangedHitBonus = signal(2);
  readonly rangerFavoredTypeDamageBonuses = signal<RangerFavoredTypeBonuses>({ Beast: 2 });
  readonly selectedRangerFavoredTypeToBuy = signal<string | null>(null);
  readonly rangerFavoredTypeEntries = computed(() =>
    Object.entries(this.rangerFavoredTypeDamageBonuses())
      .map(([type, bonus]) => ({ type, bonus }))
      .sort((left, right) => left.type.localeCompare(right.type))
  );
  readonly rangerAvailableFavoredTypeOptions = computed(() => {
    const preview = this.gridPreviewContext();
    const typesFromCurrentDungon = preview
      ? (this.monsterListByDungon()[preview.dungonId] ?? [])
          .map((monster) => this.normalizeMonsterTypeLabel(monster.type))
          .filter((type) => type.length > 0)
      : [];
    const catalog = [
      'Aberration',
      'Beast',
      'Celestial',
      'Construct',
      'Dragon',
      'Demon',
      'Elemental',
      'Fey',
      'Fiend',
      'Giant',
      'Humanoid',
      'Monstrosity',
      'Ooze',
      'Plant',
      'Specter',
      'Swarm of Tiny Beasts',
      'Undead',
    ];
    const ownedTypeKeys = new Set(
      Object.keys(this.rangerFavoredTypeDamageBonuses()).map((type) => this.normalizeMonsterTypeKey(type))
    );
    const merged = [...typesFromCurrentDungon, ...catalog];
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const type of merged) {
      const normalizedKey = this.normalizeMonsterTypeKey(type);
      if (!normalizedKey || ownedTypeKeys.has(normalizedKey) || seen.has(normalizedKey)) {
        continue;
      }
      seen.add(normalizedKey);
      unique.push(this.normalizeMonsterTypeLabel(type));
    }
    return unique.sort((left, right) => left.localeCompare(right));
  });
  readonly healerFreeHealUsedThisRound = signal(false);
  readonly playerSneekRoundsRemaining = signal(0);
  readonly mageOvercastEnabled = signal(false);
  readonly playerSneekUsedThisRound = signal(false);
  readonly playerSneekStable = signal(false); // true = no per-AE re-check (Thieph/Shorties)

  get turnPhase() { return this.combatService.turnPhase; }
  get playerAE() { return this.combatService.playerAE; }
  get playerMaxAE() { return this.combatService.playerMaxAE; }
  get playerNOA() { return this.combatService.playerNOA; }
  get playerAttacksThisTurn() { return this.combatService.playerAttacksThisTurn; }
  get playerNOD() { return this.combatService.playerNOD; }
  get playerDefendsThisTurn() { return this.combatService.playerDefendsThisTurn; }
  get playerDefendStacks() { return this.combatService.playerDefendStacks; }
  get playerBoostAttackACPenalty() { return this.combatService.playerBoostAttackACPenalty; }
  get playerType() { return this.combatService.playerType; }
  get playerSpecies() { return this.combatService.playerSpecies; }
  get playerName() { return this.combatService.playerName; }
  get playerSearchesThisTurn() { return this.combatService.playerSearchesThisTurn; }
  get playerHp() { return this.combatService.playerHp; }
  get playerMaxHp() { return this.combatService.playerMaxHp; }
  get playerBaseAC() { return this.combatService.playerBaseAC; }
  get monsterInstances() { return this.combatService.monsterInstances; }
  get combatLog() { return this.combatService.combatLog; }
  readonly currentGameId = signal<number | null>(null);
  readonly isSampleMode = signal(false);
  get pcInventoryInitializedByDungon() { return this.inventoryService.pcInventoryInitializedByDungon; }
  get pcTresherItemsById() { return this.inventoryService.pcTresherItemsById; }
  get pcTresherPotionsById() { return this.inventoryService.pcTresherPotionsById; }
  get exitsByDungon() { return this.dungeonState.exitsByDungon; }
  readonly portalPlacementsByDungon = signal<Record<number, PortalPlacement[]>>({});
  get playerSp() { return this.combatService.playerSp; }
  get playerMind() { return this.combatService.playerMind; }
  get playerStamina() { return this.combatService.playerStamina; }
  get playerStrength() { return this.combatService.playerStrength; }
  get playerMagicPower() { return this.combatService.playerMagicPower; }
  get playerMp() { return this.combatService.playerMp; }
  get playerDexterity() { return this.combatService.playerDexterity; }
  get playerAwareness() { return this.combatService.playerAwareness; }
  get playerRoundsSinceLastAction() { return this.combatService.playerRoundsSinceLastAction; }
  get playerWasHitThisRound() { return this.combatService.playerWasHitThisRound; }

  readonly playerLevel = computed(() => {
    const wStr = this.playerStrength() * 2;
    const wSta = this.playerStamina() * 2;
    const wMind = this.playerMind() * 2;

    // Count Magic Source gems in all inventory treshers
    const itemsMap = this.pcTresherItemsById();
    let magicSourceCount = 0;
    for (const t of this.inventoryTreshersForPreview()) {
      for (const itemId of [t.item1Id, t.item2Id, t.item3Id, t.item4Id]) {
        if (itemId != null) {
          const item = itemsMap.get(itemId);
          if (item && item.type === 'gem' && item.name.includes('Magic Source')) {
            magicSourceCount++;
          }
        }
      }
    }
    const wMP = this.playerMagicPower() * 2.5 + magicSourceCount;
    return this.computePlayerLevel([wStr, wSta, wMind, wMP]);
  });

  private computePlayerLevel(weightedStats: number[]): number {
    let level = 0;
    const above10 = weightedStats.filter(s => s > 10).length;
    if (above10 >= 2) level = 1;
    if (above10 >= 4) level = 2;
    if (weightedStats.filter(s => s >= 15).length >= 2) level = Math.max(level, 3);
    for (let n = 4; n <= 50; n++) {
      const t4 = 15 + (n - 4) * 5;
      const t2 = 15 + (n - 3) * 5;
      const c4 = weightedStats.filter(s => s >= t4).length;
      const c2 = weightedStats.filter(s => s >= t2).length;
      if (c4 >= 4 || c2 >= 2) {
        level = Math.max(level, n);
      } else {
        break;
      }
    }
    return level;
  }
  get pcTresherSpellsById() { return this.inventoryService.pcTresherSpellsById; }
  get selectedSpellId() { return this.combatService.selectedSpellId; }
  get selectedCombatTarget() { return this.combatService.selectedCombatTarget; }
  get outOfRangeTarget() { return this.combatService.outOfRangeTarget; }
  private get comboTracker() { return this.combatService.comboTracker; }
  get playerActiveEffects() { return this.combatService.playerActiveEffects; }
  get floorTrapPlacementsByDungon() { return this.dungeonState.floorTrapPlacementsByDungon; }
  get floorItemPlacementsByDungon() { return this.inventoryService.floorItemPlacementsByDungon; }
  get floorPotionPlacementsByDungon() { return this.inventoryService.floorPotionPlacementsByDungon; }
  get floorSpellPlacementsByDungon() { return this.inventoryService.floorSpellPlacementsByDungon; }
  get obstaclePlacementsByDungon() { return this.dungeonState.obstaclePlacementsByDungon; }
  get floorItemListByDungon() { return this.inventoryService.floorItemListByDungon; }
  get floorPotionListByDungon() { return this.inventoryService.floorPotionListByDungon; }
  get floorSpellListByDungon() { return this.inventoryService.floorSpellListByDungon; }
  get collectedFloorItemsByDungon() { return this.inventoryService.collectedFloorItemsByDungon; }
  get collectedFloorPotionsByDungon() { return this.inventoryService.collectedFloorPotionsByDungon; }
  get collectedFloorSpellsByDungon() { return this.inventoryService.collectedFloorSpellsByDungon; }
  get foundTrap() { return this.interactionService.foundTrap; }
  get bloodSplatter() { return this.combatService.bloodSplatter; }
  get playerHitFlash() { return this.combatService.playerHitFlash; }
  get spellTargetMode() { return this.combatService.spellTargetMode; }
  get spellBeamEffects() { return this.combatService.spellBeamEffects; }
  get monsterGlowKeys() { return this.combatService.monsterGlowKeys; }
  get playerYellowHitFlash() { return this.combatService.playerYellowHitFlash; }
  get spellHitFlash() { return this.combatService.spellHitFlash; }
  get spellHitFlashColor() { return this.combatService.spellHitFlashColor; }
  readonly currentPcId_ = signal<number | null>(null);
  get dungonSpReward() { return this.interactionService.dungonSpReward; }
  get dungonWon() { return this.interactionService.dungonWon; }
  get showTavernModal() { return this.interactionService.showTavernModal; }
  get showYeOldMagiceShopModal() { return this.gameShopService.showYeOldMagiceShopModal; }
  get dismissedYeOldMagiceShopPrompts() { return this.gameShopService.dismissedYeOldMagiceShopPrompts; }
  get yeOldMagiceShopView() { return this.gameShopService.yeOldMagiceShopView; }
  get yeOldMagiceShopMessage() { return this.gameShopService.yeOldMagiceShopMessage; }
  get yeOldMagiceShopInfoUnlocked() { return this.gameShopService.yeOldMagiceShopInfoUnlocked; }
  get yeOldMagiceShopDrinkPurchased() { return this.gameShopService.yeOldMagiceShopDrinkPurchased; }
  get yeOldMagiceShopImage() { return this.gameShopService.yeOldMagiceShopImage; }
  get yeOldMagiceShopKeeperInfo() { return this.gameShopService.yeOldMagiceShopKeeperInfo; }
  get activeYeOldMagiceShopDungonId() { return this.gameShopService.activeYeOldMagiceShopDungonId; }
  get activeYeOldMagiceShopObstacleId() { return this.gameShopService.activeYeOldMagiceShopObstacleId; }
  get shopBuyItemCost() { return this.gameShopService.shopBuyItemCost; }
  get shopBuySpellCost() { return this.gameShopService.shopBuySpellCost; }
  get shopBuyPotionCost() { return this.gameShopService.shopBuyPotionCost; }
  get shopDrinkCost() { return this.gameShopService.shopDrinkCost; }
  get shopHealingCost() { return this.gameShopService.shopHealingCost; }
  get shopCurseClearCost() { return this.gameShopService.shopCurseClearCost; }
  readonly soundMuted = signal<boolean>((() => {
    const stored = localStorage.getItem('soundMuted');
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    return true;
  })());
  readonly musicMuted = signal<boolean>((() => {
    const stored = localStorage.getItem('musicMuted');
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    const soundStored = localStorage.getItem('soundMuted');
    return soundStored !== 'false';
  })());
  readonly showSoundPreferenceModal = signal<boolean>(false);
  readonly showSettingsModal = signal<boolean>(false);
  readonly showReportBugModal = signal<boolean>(false);
  readonly bugReportUsername = signal<string>('');
  readonly bugReportMessage = signal<string>('');
  readonly bugReportSubmitting = signal<boolean>(false);
  readonly bugReportSuccess = signal<boolean>(false);
  readonly bugReportError = signal<string | null>(null);
  readonly npcResponseDraft = signal<string>('');
  readonly itemNoteModal = signal<{ itemName: string; note: string; canRead: boolean; minMindToRead: number } | null>(null);
  readonly inventoryDetailsModal = signal<InventoryDetailsModalData | null>(null);
  readonly pendingTrapCrossingPrompt = signal<PendingTrapCrossingPrompt | null>(null);
  readonly showBackpackInventoryModal = signal(false);
  readonly showDrinkPotionModal = signal(false);
  readonly showControlsHelpModal = signal(false);
  readonly showReadableNowModal = signal(false);
  readonly readableTextsNow = computed<NearbyDiscoveryItem[]>(() => {
    const unique = new Map<string, NearbyDiscoveryItem>();
    for (const item of this.nearbyItemsForPreview()) {
      if (item.kind !== 'Text') {
        continue;
      }
      const note = (item.description ?? '').trim();
      if (!note) {
        continue;
      }
      const key = `${item.row}:${item.column}:${item.name}:${note}`;
      if (!unique.has(key)) {
        unique.set(key, {
          ...item,
          description: note,
        });
      }
    }

    return Array.from(unique.values());
  });
  readonly defaultSpellIdByDungon = signal<Record<number, number | null>>({});
  readonly pendingExitAwardsInnReward = signal(true);
  readonly pendingExitMissingItemName = signal<string | null>(null);
  readonly lastExitGrantedInnReward = signal(true);
  private readonly portalTraverseSoundPath = this.gameSoundService.portalTraverseSoundPath;

  get questItemsForTavern(): Tresher[] {
    const result: Tresher[] = [];
    for (const cheater of Object.values(this.cheaterByDungon())) {
      for (const t of cheater.inventory.treshers) {
        if (t.isquest) result.push(t);
      }
    }
    return result;
  }
  get npcDialog() { return this.interactionService.npcDialog; }
  get npcTradesPurchased() { return this.interactionService.npcTradesPurchased; }
  get monsterDialogueModal() { return this.interactionService.monsterDialogueModal; }
  readonly isMainGame = signal<boolean>(false);
  readonly resettablePerPc = signal<boolean>(false);
  get stashItems() { return this.interactionService.stashItems; }
  readonly cheaterByPcId_ = signal<Record<number, Cheater>>({});
  readonly saveStatus = signal<'saving' | 'saved' | 'error' | 'lost' | null>(null);
  private saveStatusTimer: ReturnType<typeof setTimeout> | null = null;
  private isSaveInFlight = false;
  private pendingSavePayload: { gameId: number; dungonId: number; userKey: string } | null = null;
  get winStairsImageIndex() { return this.movementService.winStairsImageIndex; }
  get pendingExitTransitionType() { return this.movementService.pendingExitTransitionType; }

  readonly gridCellSize = 20;
  readonly gridColumnCount = 50;
  readonly gridRowCount = 50;
  readonly previewGridCellSize = 18;
  readonly previewGridDimension = 10;
  readonly previewGridCanvasWidth = this.previewGridCellSize * this.previewGridDimension;
  readonly previewGridCanvasHeight = this.previewGridCellSize * this.previewGridDimension;
  readonly firstPersonCanvasWidth = 330;
  readonly firstPersonCanvasHeight = 220;
  readonly firstPersonMaxDepth = 8;
  readonly maxEquippableHands = 2;
  readonly directionPadButtons: DirectionPadButton[] = [
    { direction: 'upLeft', label: '↖', ariaLabel: 'Face up-left' },
    { direction: 'up', label: '↑', ariaLabel: 'Face up' },
    { direction: 'upRight', label: '↗', ariaLabel: 'Face up-right' },
    { direction: 'left', label: '←', ariaLabel: 'Face left' },
    { direction: 'center', label: 'F', ariaLabel: 'Move forward' },
    { direction: 'right', label: '→', ariaLabel: 'Face right' },
    { direction: 'downLeft', label: '↙', ariaLabel: 'Face down-left' },
    { direction: 'down', label: '↓', ariaLabel: 'Face down' },
    { direction: 'downRight', label: '↘', ariaLabel: 'Face down-right' },
  ];

  keyList: Key[] = [];

  readonly frontFacingYeOldMagiceShop = computed(() => this.getFrontFacingYeOldMagiceShop());
  readonly frontFacingYeOldMagiceShopPrompt = computed(() => {
    const shop = this.getFrontFacingYeOldMagiceShop();
    if (!shop) return null;

    const preview = this.gridPreviewContext();
    if (!preview) return null;

    if (this.gameShopService.isYeOldMagiceShopPromptDismissed(this.currentGameId() ?? 0, preview.dungonId, shop.id)) {
      return null;
    }

    return shop;
  });

  readonly yeOldMagiceShopBuyableItems = computed<ShopCatalogEntry[]>(() => {
    return this.gameShopService.getBuyableItems(
      this.obstaclePlacementsByDungon(),
      this.activeYeOldMagiceShopDungonId(),
      this.activeYeOldMagiceShopObstacleId(),
      this.pcTresherItemsById()
    );
  });

  readonly yeOldMagiceShopBuyableSpells = computed<ShopCatalogEntry[]>(() => {
    return this.gameShopService.getBuyableSpells(
      this.obstaclePlacementsByDungon(),
      this.activeYeOldMagiceShopDungonId(),
      this.activeYeOldMagiceShopObstacleId(),
      this.pcTresherSpellsById()
    );
  });

  readonly yeOldMagiceShopBuyablePotions = computed<ShopCatalogEntry[]>(() => {
    return this.gameShopService.getBuyablePotions(
      this.obstaclePlacementsByDungon(),
      this.activeYeOldMagiceShopDungonId(),
      this.activeYeOldMagiceShopObstacleId(),
      this.pcTresherPotionsById()
    );
  });

  private savedCombatState: {
    playerHp: number | null;
    playerAE: number | null;
    turnPhase: TurnPhase | null;
    playerRow: number | null;
    playerColumn: number | null;
  } = { playerHp: null, playerAE: null, turnPhase: null, playerRow: null, playerColumn: null };
  private playerStartingHp = 20;

  ngOnInit(): void {
    this.drawingAssets.setRedrawCallbacks(
      () => this.drawPreviewGridCanvas(),
      () => this.drawFirstPersonViewCanvas()
    );
    if (localStorage.getItem('soundMuted') === null) {
      this.showSoundPreferenceModal.set(true);
    }
    this.loadGame();
    this.loadDoorImages();
  }

  chooseSoundPreference(enableSound: boolean): void {
    const muted = !enableSound;
    this.soundMuted.set(muted);
    localStorage.setItem('soundMuted', muted ? 'true' : 'false');
    this.musicMuted.set(muted);
    localStorage.setItem('musicMuted', muted ? 'true' : 'false');
    this.showSoundPreferenceModal.set(false);
    if (muted) {
      this.stopTavernMusic();
    } else if (this.showTavernModal() || this.npcDialog() || this.showYeOldMagiceShopModal()) {
      this.startTavernMusic();
    }
  }

  closeSoundPreferenceModal(): void {
    this.showSoundPreferenceModal.set(false);
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(event: KeyboardEvent): void {
    if (!this.gridPreviewContext()) {
      return;
    }

    if (this.showAdOverlay()) {
      return;
    }

    if (this.turnPhase() === 'gameover' || this.turnPhase() === 'monsters') {
      return;
    }

    if (event.key.toLowerCase() === 'a') {
      this.tryPlayerAttack();
      event.preventDefault();
      return;
    }

    if (event.key.toLowerCase() === 'd') {
      this.tryPlayerDefend();
      event.preventDefault();
      return;
    }

    if (event.key.toLowerCase() === 'e') {
      this.endPlayerTurnEarly();
      event.preventDefault();
      return;
    }

    if (event.key.toLowerCase() === 's') {
      this.lookForTrapsAtCurrentSquare();
      event.preventDefault();
      return;
    }

    if (event.key.toLowerCase() === 'o') {
      const doors = this.nearbyDoorsForPreview();
      const openable = doors.find((d) => d.canOpen);
      const closeable = doors.find((d) => d.door.state === 'open');
      if (openable) this.openAdjacentDoor(openable);
      else if (closeable) this.closeAdjacentDoor(closeable);
      event.preventDefault();
      return;
    }

    if (event.key.toLowerCase() === 'k') {
      const door = this.nearbyDoorsForPreview().find((d) => d.canUnlock);
      if (door) this.unlockAdjacentDoor(door);
      event.preventDefault();
      return;
    }

    if (this.isSpaceKey(event.key)) {
      this.tryMoveCheaterForward();
      event.preventDefault();
      return;
    }

    if (this.isBackwardMoveKey(event.key)) {
      this.tryMoveCheaterBackward();
      event.preventDefault();
      return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const preview = this.gridPreviewContext();
      if (!preview) return;
      const current = (this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER).facingDir;
      const next = this.turnFacing(current, event.key === 'ArrowLeft' ? 'left' : 'right');
      this.applyCardinalFacingDirection(next);
      event.preventDefault();
      return;
    }

    const nextDirection = this.getFacingDirectionFromKey(event.key);
    if (!nextDirection) {
      return;
    }

    this.applyCardinalFacingDirection(nextDirection);
    event.preventDefault();
  }

  setFacingDirectionFromPad(direction: DirectionPadDirection): void {
    if (direction === 'center') {
      this.tryMoveCheaterByDisplayedFacingStep(1);
      return;
    }

    if (direction === 'up' || direction === 'right' || direction === 'down' || direction === 'left') {
      // If already facing this direction, move forward instead of just re-setting facing.
      if (this.isFacingDirectionActive(direction)) {
        this.tryMoveCheaterByDisplayedFacingStep(1);
        return;
      }
      this.applyCardinalFacingDirection(direction);
      return;
    }

    const preview = this.gridPreviewContext();
    if (!preview) {
      return;
    }

    this.setVisualFacingDirection(preview.dungonId, direction);
    this.drawPreviewGridCanvas();
  }

  isFacingDirectionActive(direction: DirectionPadDirection): boolean {
    if (direction === 'center') {
      return false;
    }

    const preview = this.gridPreviewContext();
    if (!preview) {
      return false;
    }

    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    return this.getDisplayedFacingDirection(preview.dungonId, cheater.facingDir) === direction;
  }

  setActiveInfoPanelTab(tab: InfoPanelTab): void {
    this.activeInfoPanelTab.set(tab);
  }

  previewCheaterForView(): Cheater {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return DEFAULT_CHEATER;
    }

    return this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
  }

  previewSquaresForView(): Record<string, Square> {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return {};
    }

    return this.squaresByDungon()[preview.dungonId] ?? {};
  }

  previewFilledSquaresForView(): Record<string, true> {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return {};
    }

    return this.filledSquaresByDungon()[preview.dungonId] ?? {};
  }

  previewTresherPlacementsForView(): TresherPlacement[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    return this.tresherPlacementsByDungon()[preview.dungonId] ?? [];
  }

  previewBagImagesBySquareForView(): Map<string, HTMLImageElement | null> {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return new Map<string, HTMLImageElement | null>();
    }

    this.lootImageCacheVersion();
    const treshersById = new Map<number, Tresher>(
      (this.tresherListByDungon()[preview.dungonId] ?? []).map((tresher) => [tresher.id, tresher])
    );
    const floorItemsById = new Map<number, { imageId?: number | null }>(
      (this.floorItemListByDungon()[preview.dungonId] ?? []).map((item) => [item.id, item])
    );
    for (const item of this.pcTresherItemsById().values()) {
      if (!floorItemsById.has(item.id)) {
        floorItemsById.set(item.id, item);
      }
    }

    const imageBySquare = new Map<string, HTMLImageElement | null>();
    for (const placement of this.tresherPlacementsByDungon()[preview.dungonId] ?? []) {
      const squareKey = this.getSquareKey(placement.row, placement.column);
      if (!imageBySquare.has(squareKey)) {
        const tresher = treshersById.get(placement.tresherId);
        const displayImageId = this.resolveTresherDisplayImageId(tresher, floorItemsById);
        const tresherImage = typeof displayImageId === 'number' && displayImageId > 0
          ? (this.lootImageCache.get(displayImageId) ?? null)
          : null;
        imageBySquare.set(squareKey, tresherImage);
      }
    }
    for (const placement of this.floorItemPlacementsByDungon()[preview.dungonId] ?? []) {
      const squareKey = this.getSquareKey(placement.row, placement.column);
      if (!imageBySquare.has(squareKey)) {
        const item = (this.floorItemListByDungon()[preview.dungonId] ?? []).find((it) => it.id === placement.itemId) ?? null;
        const itemImage = item && typeof item.imageId === 'number' && item.imageId > 0
          ? (this.lootImageCache.get(item.imageId) ?? null)
          : null;
        imageBySquare.set(squareKey, itemImage);
      }
    }
    for (const placement of this.floorPotionPlacementsByDungon()[preview.dungonId] ?? []) {
      const squareKey = this.getSquareKey(placement.row, placement.column);
      if (!imageBySquare.has(squareKey)) {
        imageBySquare.set(squareKey, null);
      }
    }

    return imageBySquare;
  }

  previewItemPlacementsForView(): ItemPlacement[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    return this.floorItemPlacementsByDungon()[preview.dungonId] ?? [];
  }

  previewPotionPlacementsForView(): PotionPlacement[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    return this.floorPotionPlacementsByDungon()[preview.dungonId] ?? [];
  }


  previewSpellPlacementsForView(): SpellPlacement[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    return this.floorSpellPlacementsByDungon()[preview.dungonId] ?? [];
  }

  collectedFloorItemsForPreview(): Array<{ id: number; name: string; description: string; type: string; imageId?: number | null; effectValue: number; damage: number; range: number; armorSlot: string | null; effectOn: string | null; effectToPc?: string | null; effectToPcValue?: number; isTwoHanded: boolean; uses?: number | null }> {
    const preview = this.gridPreviewContext();
    if (!preview) return [];
    return this.collectedFloorItemsByDungon()[preview.dungonId] ?? [];
  }

  collectedFloorPotionsForPreview(): Array<{ id: number; name: string; description: string; effectTo: string; effectAmount: number; lastFor: number }> {
    const preview = this.gridPreviewContext();
    if (!preview) return [];
    return this.collectedFloorPotionsByDungon()[preview.dungonId] ?? [];
  }

  collectedFloorSpellsForPreview(): PcTresherSpellData[] {
    const preview = this.gridPreviewContext();
    if (!preview) return [];
    return this.collectedFloorSpellsByDungon()[preview.dungonId] ?? [];
  }

  nearbyMonstersForPreview(): NearbyDiscoveryItem[] {
    return this.nearbyItemsForPreview().filter((item) => item.kind === 'Monster');
  }

  currentSquarePickupItemsForPreview(): NearbyDiscoveryItem[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    const allNearby = this.nearbyItemsForPreview();
    const ownCell = allNearby.filter(
      (item) =>
        item.row === preview.centerRow &&
        item.column === preview.centerColumn &&
        this.isPickupDiscoveryKind(item.kind)
    );

    const forwardTarget = this.getForwardPickupSquareContext(
      preview.dungonId,
      preview.centerRow,
      preview.centerColumn
    );
    if (!forwardTarget) return ownCell;

    const forwardCellItems = allNearby.filter(
      (item) =>
        item.row === forwardTarget.row &&
        item.column === forwardTarget.column &&
        (item.kind === 'Item' || item.kind === 'Tresher')
    );
    const currentSquareObstacleLoot = this.getTakeableObstacleDiscoveryItemsForSquare(
      preview.dungonId,
      preview.centerRow,
      preview.centerColumn
    );
    const forwardSquareObstacleLoot = this.getTakeableObstacleDiscoveryItemsForSquare(
      preview.dungonId,
      forwardTarget.row,
      forwardTarget.column
    );

    return [...ownCell, ...forwardCellItems, ...currentSquareObstacleLoot, ...forwardSquareObstacleLoot];
  }

  otherNearbyItemsForPreview(): NearbyDiscoveryItem[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    return this.nearbyItemsForPreview().filter(
      (item) =>
        item.kind !== 'Monster' &&
        item.kind !== 'Obstacle' &&
        !(item.row === preview.centerRow && item.column === preview.centerColumn && this.isPickupDiscoveryKind(item.kind))
    );
  }

  collectedWeaponItemsForPreview(): Array<{ id: number; name: string; description: string; type: string; effectValue: number; damage: number; range: number; armorSlot: string | null; effectOn: string | null; effectToPc?: string | null; effectToPcValue?: number; isTwoHanded: boolean }> {
    return this.collectedFloorItemsForPreview().filter((item) => this.isWeaponItemType(item.type));
  }

  collectedArmorItemsForPreview(): Array<{ id: number; name: string; description: string; type: string; effectValue: number; damage: number; range: number; armorSlot: string | null; effectOn: string | null; effectToPc?: string | null; effectToPcValue?: number; isTwoHanded: boolean }> {
    return this.collectedFloorItemsForPreview().filter((item) => this.isArmorItemType(item.type, item.name) || item.armorSlot !== null);
  }

  collectedOtherItemsForPreview(): Array<{ id: number; name: string; description: string; type: string; effectValue: number; damage: number; range: number; armorSlot: string | null; effectOn: string | null; effectToPc?: string | null; effectToPcValue?: number; isTwoHanded: boolean; uses?: number | null }> {
    return this.collectedFloorItemsForPreview().filter((item) => !this.isWeaponItemType(item.type) && !this.isArmorItemType(item.type, item.name) && item.armorSlot === null);
  }

  previewDetectedFloorTrapsForView(): FloorTrapPlacement[] {
    const preview = this.gridPreviewContext();
    if (!preview) return [];
    return (this.floorTrapPlacementsByDungon()[preview.dungonId] ?? [])
      .filter(p => (p.isDetected || p.isTriggered) && !p.isDisarmed);
  }

  previewCrossableTrapIdsForView(): Set<number> {
    const preview = this.gridPreviewContext();
    if (!preview) return new Set();
    const traps = (this.floorTrapPlacementsByDungon()[preview.dungonId] ?? [])
      .filter(p => (p.isDetected || p.isTriggered) && !p.isDisarmed);
    const ids = new Set<number>();
    for (const fp of traps) {
      if (this.canBypassTrapWithCrossingItem(fp.trap)) {
        ids.add(fp.id);
      }
    }
    return ids;
  }

  previewObstaclePlacementsForView(): ObstaclePlacement[] {
    const preview = this.gridPreviewContext();
    if (!preview) return [];
    return (this.obstaclePlacementsByDungon()[preview.dungonId] ?? []).filter(o => !o.isDestroyed);
  }

  previewLiveMonsterPlacementsForView(): MonsterPlacement[] {
    return this.monsterInstances()
      .filter((instance) => this.shouldRenderMonsterInstance(instance))
      .map((instance) => ({
        monsterId: instance.monsterId,
        row: instance.row,
        column: instance.column,
        roam: instance.roam,
        isDead: instance.isDead,
        currentHp: instance.currentHp,
      }));
  }

  previewStartPointForView(): StartPoint | null {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return null;
    }

    return this.startPointByDungon()[preview.dungonId] ?? null;
  }

  previewSquareTextsForView(): SquareText[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    return this.squareTextsByDungon()[preview.dungonId] ?? [];
  }

  previewExitsForView(): DungonExit[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    return this.exitsByDungon()[preview.dungonId] ?? [];
  }

  previewPortalPlacementsForView(): PortalPlacement[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    return this.portalPlacementsByDungon()[preview.dungonId] ?? [];
  }

  previewObstacleImagesBySquareForView(): Map<string, HTMLImageElement | null> {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return new Map<string, HTMLImageElement | null>();
    }

    this.obstacleImageCacheVersion();
    const imageBySquare = new Map<string, HTMLImageElement | null>();
    for (const obs of this.obstaclePlacementsByDungon()[preview.dungonId] ?? []) {
      if (obs.isDestroyed) continue;
      const squareKey = this.getSquareKey(obs.row, obs.column);
      const image = obs.imageId !== null ? (this.obstacleImageCache.get(obs.imageId) ?? null) : null;
      imageBySquare.set(squareKey, image);
    }

    return imageBySquare;
  }

  previewMonsterImagesBySquareForView(): Map<string, HTMLImageElement | null> {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return new Map<string, HTMLImageElement | null>();
    }

    this.monsterImageCacheVersion();
    const monstersById = this.getMonstersByIdForDungon(preview.dungonId);
    const imageBySquare = new Map<string, HTMLImageElement | null>();
    for (const instance of this.monsterInstances().filter((monster) => this.shouldRenderMonsterInstance(monster))) {
      const monster = monstersById.get(instance.monsterId);
      const imageId = instance.monsterId === -666 ? -666 : (monster?.imageId ?? null);
      const image = imageId !== null ? (this.monsterImageCache.get(imageId) ?? null) : null;
      imageBySquare.set(this.getSquareKey(instance.row, instance.column), image);
    }

    return imageBySquare;
  }

  private resolveTresherDisplayImageId(
    tresher: Tresher | undefined,
    itemsById: Map<number, { imageId?: number | null }>
  ): number | null {
    if (!tresher) {
      return null;
    }

    if (typeof tresher.imageId === 'number' && tresher.imageId > 0) {
      return tresher.imageId;
    }

    const candidateItemIds = [tresher.item1Id, tresher.item2Id, tresher.item3Id, tresher.item4Id];
    for (const itemId of candidateItemIds) {
      if (typeof itemId !== 'number' || itemId <= 0) {
        continue;
      }
      const imageId = itemsById.get(itemId)?.imageId ?? null;
      if (typeof imageId === 'number' && imageId > 0) {
        return imageId;
      }
    }

    return null;
  }

  inventoryKeysForPreview(): Key[] {
    return this.getInventoryContextForPreview()?.inventory.keys ?? [];
  }

  inventoryTreshersForPreview(): Tresher[] {
    return this.getInventoryContextForPreview()?.inventory.treshers ?? [];
  }

  hasInventoryItemsForPreview(): boolean {
    const inventoryContext = this.getInventoryContextForPreview();
    if (!inventoryContext) {
      return false;
    }

    return (
      inventoryContext.inventory.keys.length > 0 ||
      inventoryContext.inventory.treshers.length > 0 ||
      (this.collectedFloorItemsByDungon()[inventoryContext.dungonId] ?? []).length > 0 ||
      (this.collectedFloorPotionsByDungon()[inventoryContext.dungonId] ?? []).length > 0
    );
  }

  backpackTresherItemCount(): number {
    return this.backpackOtherItemsUnified().length;
  }

  backpackTotalItemCount(): number {
    return (
      this.backpackWeaponsUnified().length +
      this.backpackArmorUnified().length +
      this.backpackOtherItemsUnified().length +
      this.allPotionsUnified().length +
      this.allTresherSpellsFlat().length +
      this.collectedFloorSpellsForPreview().length
    );
  }

  readonly backpackItemsUnified = computed<BackpackItemEntry[]>(() => {
    const merged = new Map<number, BackpackItemEntry>();

    for (const group of this.allTresherItemsGrouped()) {
      for (const item of group.items) {
        merged.set(item.id, {
          id: item.id,
          name: item.name,
          description: item.description,
          type: item.type,
          effectValue: item.effectValue,
          armorSlot: item.armorSlot,
          damage: item.damage,
          range: item.range,
          effectOn: item.effectOn,
          effectToPc: item.effectToPc,
          effectToPcValue: item.effectToPcValue,
          uses: item.uses,
          imageId: item.imageId,
          source: 'tresher' as const,
          tresherIdx: item.tresherIdx,
        });
      }
    }

    for (const item of this.collectedFloorItemsForPreview()) {
      merged.set(item.id, {
        id: item.id,
        name: item.name,
        description: item.description,
        type: item.type,
        effectValue: item.effectValue,
        armorSlot: item.armorSlot,
        damage: item.damage,
        range: item.range,
        effectOn: item.effectOn,
        effectToPc: item.effectToPc,
        effectToPcValue: item.effectToPcValue,
        uses: item.uses,
        imageId: item.imageId ?? null,
        source: 'collected' as const,
      });
    }

    return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly backpackWeaponsUnified = computed(() =>
    this.backpackItemsUnified().filter((item) => this.isWeaponItemType(item.type))
  );

  readonly backpackArmorUnified = computed(() =>
    this.backpackItemsUnified().filter((item) => this.isArmorItemType(item.type, item.name) || item.armorSlot !== null)
  );

  readonly backpackOtherItemsUnified = computed(() =>
    this.backpackItemsUnified().filter(
      (item) => !this.isWeaponItemType(item.type) && !this.isArmorItemType(item.type, item.name) && item.armorSlot === null
    )
  );

  isTresherEquipable(tresher: Tresher): boolean {
    return this.inventoryService.isTresherEquipable(tresher);
  }

  hasWeaponEquipped(): boolean {
    const preview = this.gridPreviewContext();
    if (!preview) return false;
    const equippedItemIds = this.equippedItemIdsByDungon()[preview.dungonId] ?? [];
    const itemsMap = this.pcTresherItemsById();
    return equippedItemIds.some((id) => itemsMap.get(id)?.type === 'weapon');
  }

  canAttackUnarmed(): boolean {
    if (this.turnPhase() !== 'player' || this.playerAE() < 1) return false;
    const preview = this.gridPreviewContext();
    if (!preview) return false;
    return this.findAdjacentLiveMonster(preview.centerRow, preview.centerColumn, 1, preview.dungonId) !== null;
  }

  /** Returns the current attack range for map highlighting (0 = no combat). */
  combatRangeForMap(): number {
    if (this.turnPhase() !== 'player' || this.playerHp() <= 0) return 0;
    if (!this.monsterInstances().some(m => !m.isDead)) return 0;
    const preview = this.gridPreviewContext();
    if (!preview) return 0;
    // If a spell is primed, use spell range
    const spellId = this.selectedSpellId();
    if (spellId !== null) {
      const spell = this.pcTresherSpellsById().get(spellId);
      if (spell) return Math.max(1, spell.range);
    }
    // Weapon range
    const equippedItemIds = this.equippedItemIdsByDungon()[preview.dungonId] ?? [];
    const itemsMap = this.pcTresherItemsById();
    let bestRange = 1; // unarmed baseline
    for (const itemId of equippedItemIds) {
      const item = itemsMap.get(itemId);
      if (item?.type === 'weapon' && item.range > bestRange) bestRange = item.range;
    }
    return bestRange;
  }

  /** Called when the player clicks a cell on the 10x10 mini-map. */
  onMapCellClicked(cell: { row: number; column: number }): void {
    const preview = this.gridPreviewContext();
    
    // Log square data for debugging
    if (preview) {
      const squareKey = this.getSquareKey(cell.row, cell.column);
      const squareData = this.squaresByDungon()[preview.dungonId]?.[squareKey];
      const isFilled = this.filledSquaresByDungon()[preview.dungonId]?.[squareKey] ?? false;
      const monsters = this.monsterInstances().filter(m => m.row === cell.row && m.column === cell.column);
      const startPoint = this.startPointByDungon()[preview.dungonId];
      const isStartPoint = startPoint ? startPoint.row === cell.row && startPoint.col === cell.column : false;
      const portals = this.portalPlacementsByDungon()[preview.dungonId]?.filter(p => 
        (p.startRow === cell.row && p.startColumn === cell.column) ||
        (p.endRow === cell.row && p.endColumn === cell.column)
      ) ?? [];

      const payload = {
        row: cell.row,
        column: cell.column,
        squareKey,
        isFilled,
        squareData,
        isStartPoint,
        startPoint: isStartPoint ? startPoint : null,
        monsters: monsters.length > 0 ? monsters : null,
        portals: portals.length > 0 ? portals : null,
      };
      const isLocalhost = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
      if (isLocalhost) {
        (window as any).__tdodjLastGameSquareClick = payload;
        this.previewActionMessage.set(`[debug] Clicked r${cell.row} c${cell.column} (${squareKey})`);
      }
      console.warn('[TDODJ][GameMap] Square clicked', payload);
    }
    
    if (!preview || this.turnPhase() !== 'player' || this.playerHp() <= 0) return;

    // Handle spell multi-target selection mode
    const targetMode = this.spellTargetMode();
    if (targetMode) {
      const monster = this.monsterInstances().find(m => !m.isDead && m.row === cell.row && m.column === cell.column);
      if (!monster) return;
      const spell = this.pcTresherSpellsById().get(targetMode.spellId);
      if (!spell) return;
      const dr = Math.abs(cell.row - preview.centerRow);
      const dc = Math.abs(cell.column - preview.centerColumn);
      if (Math.max(dr, dc) > spell.range || !this.hasLineOfSight(preview.dungonId, preview.centerRow, preview.centerColumn, cell.row, cell.column)) {
        const name = this.getMonstersByIdForDungon(preview.dungonId).get(monster.monsterId)?.name ?? 'monster';
        this.previewActionMessage.set(`${name} is out of spell range (${spell.range}).`);
        return;
      }
      const idx = targetMode.targets.findIndex(t => t.row === cell.row && t.column === cell.column);
      let newTargets: { row: number; column: number }[];
      if (idx >= 0) {
        newTargets = targetMode.targets.filter((_, i) => i !== idx);
        this.previewActionMessage.set(`Target removed. (${newTargets.length}/${targetMode.maxTargets} selected)`);
      } else if (targetMode.targets.length < targetMode.maxTargets) {
        newTargets = [...targetMode.targets, { row: cell.row, column: cell.column }];
        this.previewActionMessage.set(`Target added. (${newTargets.length}/${targetMode.maxTargets} selected)`);
      } else {
        this.previewActionMessage.set(`Max targets (${targetMode.maxTargets}) already selected.`);
        return;
      }
      this.spellTargetMode.set({ ...targetMode, targets: newTargets });
      this.drawPreviewGridCanvas();
      return;
    }

    const activeSpellId = this.selectedSpellId();
    if (activeSpellId !== null) {
      const activeSpell = this.pcTresherSpellsById().get(activeSpellId);
      if (activeSpell && this.getSpellTargetKind(activeSpell) === 'trap') {
        const trap = this.getActiveFloorTrapAtSquare(preview.dungonId, cell.row, cell.column);
        if (!trap) {
          this.previewActionMessage.set('Click a trap to target it.');
          return;
        }
        const dr = Math.abs(cell.row - preview.centerRow);
        const dc = Math.abs(cell.column - preview.centerColumn);
        const range = this.getSpellMaxMonsterRange(activeSpell);
        if (Math.max(dr, dc) > range || !this.hasLineOfSight(preview.dungonId, preview.centerRow, preview.centerColumn, cell.row, cell.column)) {
          this.previewActionMessage.set(`${trap.trap.name || 'Trap'} is out of spell range (${range}).`);
          return;
        }
        this.selectedCombatTarget.set({ row: cell.row, column: cell.column });
        this.previewActionMessage.set(`Target: ${trap.trap.name || 'trap'}.`);
        this.drawPreviewGridCanvas();
        return;
      }
    }

    // Allow direct click-to-enter when the clicked map cell is the front-facing shop tile.
    // Keep this out of spell targeting mode so combat targeting behavior stays unchanged.
    if (activeSpellId === null) {
      const frontShop = this.frontFacingYeOldMagiceShop();
      if (frontShop && frontShop.row === cell.row && frontShop.column === cell.column) {
        this.enterFrontYeOldMagiceShop();
        return;
      }
    }

    const monster = this.monsterInstances().find(
      m => !m.isDead && m.row === cell.row && m.column === cell.column
    );
    if (!monster) return;
    if (!this.hasLineOfSight(preview.dungonId, preview.centerRow, preview.centerColumn, cell.row, cell.column)) return;

    const name = this.getMonstersByIdForDungon(preview.dungonId).get(monster.monsterId)?.name ?? 'monster';
    const range = this.combatRangeForMap();
    const dr = Math.abs(cell.row - preview.centerRow);
    const dc = Math.abs(cell.column - preview.centerColumn);
    const chebyshevDist = Math.max(dr, dc);

    if (chebyshevDist <= range) {
      // In weapon range — normal target selection
      this.outOfRangeTarget.set(null);
      this.selectedCombatTarget.set({ row: cell.row, column: cell.column });
      this.previewActionMessage.set(`Target: ${name}.`);
    } else {
      // Out of range — highlight green and report
      this.outOfRangeTarget.set({ row: cell.row, column: cell.column });
      this.previewActionMessage.set(`${name} is ${chebyshevDist} sq away — out of range (weapon range: ${range}).`);
      this.addCombatLog(`${name} is ${chebyshevDist} sq away. Weapon range: ${range}. Move closer to attack.`);
    }
    this.drawPreviewGridCanvas();
  }

  canPickAny(): boolean {
    return (
      this.nearbyDoorsForPreview().some((d) => d.canPick) ||
      this.interactableObstaclesForActions().some((o) => o.canPick) ||
      !!this.foundTrap()
    );
  }

  canOpenAnyDoor(): boolean {
    return this.nearbyDoorsForPreview().some((d) => d.canOpen) || this.interactableObstaclesForActions().some((o) => o.canOpen);
  }

  canUnlockAnyDoor(): boolean {
    return this.nearbyDoorsForPreview().some((d) => d.canUnlock) || this.interactableObstaclesForActions().some((o) => o.canUseKey);
  }

  handlePickActionIcon(): void {
    if (!this.canPickAny()) {
      return;
    }

    if (this.foundTrap()) {
      if (this.tryPromptForFoundTrapCrossing()) {
        return;
      }
      this.tryDisarmTrap();
      return;
    }

    const obstacleInfo = this.interactableObstaclesForActions().find((entry) => entry.canPick);
    if (obstacleInfo) {
      this.pickObstacleLock(obstacleInfo.obstacle.id);
      return;
    }

    const doorInfo = this.nearbyDoorsForPreview().find((entry) => entry.canPick);
    if (doorInfo) {
      this.pickLockDoor(doorInfo);
    }
  }

  foundTrapPrimaryActionLabel(): string {
    return this.shouldPromptForFoundTrapCrossing() ? 'Use Crossing Item' : 'Disarm Trap';
  }

  private shouldPromptForFoundTrapCrossing(): boolean {
    const crossing = this.getFoundTrapCrossingContext();
    if (!crossing) {
      return false;
    }

    return (
      this.getTrapCrossingItems(crossing.trapPlacement.trap).length > 0 &&
      this.isMoveTowardFacingDirection(crossing.preview.dungonId, crossing.rowOffset, crossing.columnOffset)
    );
  }

  private tryPromptForFoundTrapCrossing(): boolean {
    const crossing = this.getFoundTrapCrossingContext();
    if (!crossing) {
      return false;
    }

    if (!this.shouldPromptForFoundTrapCrossing()) {
      return false;
    }

    this.openTrapCrossingPrompt(
      crossing.preview,
      crossing.rowOffset,
      crossing.columnOffset,
      crossing.trapPlacement
    );
    return true;
  }

  private getFoundTrapCrossingContext(): {
    preview: GridPreviewContext;
    trapPlacement: FloorTrapPlacement;
    rowOffset: number;
    columnOffset: number;
  } | null {
    const found = this.foundTrap();
    const preview = this.gridPreviewContext();
    if (
      !found ||
      !preview ||
      found.source !== 'floor' ||
      found.floorTrapId == null ||
      found.adjacentRow == null ||
      found.adjacentColumn == null
    ) {
      return null;
    }

    const trapPlacement = (this.floorTrapPlacementsByDungon()[preview.dungonId] ?? [])
      .find((p) => p.id === found.floorTrapId) ?? null;
    if (!trapPlacement) {
      return null;
    }

    return {
      preview,
      trapPlacement,
      rowOffset: found.adjacentRow - preview.centerRow,
      columnOffset: found.adjacentColumn - preview.centerColumn,
    };
  }

  handleUnlockActionIcon(): void {
    const obstacleInfo = this.interactableObstaclesForActions().find((entry) => entry.canUseKey);
    if (obstacleInfo) {
      this.unlockObstacle(obstacleInfo.obstacle.id);
      return;
    }

    const doorInfo = this.nearbyDoorsForPreview().find((entry) => entry.canUnlock);
    if (doorInfo) {
      this.unlockAdjacentDoor(doorInfo);
    }
  }

  handleOpenActionIcon(): void {
    const obstacleInfo = this.interactableObstaclesForActions().find((entry) => entry.canOpen);
    if (obstacleInfo) {
      this.openObstacle(obstacleInfo.obstacle.id);
      return;
    }

    const doorInfo = this.nearbyDoorsForPreview().find((entry) => entry.canOpen);
    if (doorInfo) {
      this.openAdjacentDoor(doorInfo);
    }
  }

  obstacleActionInfoForNearbyItem(item: NearbyDiscoveryItem): NearbyObstacleInfo | null {
    if (item.kind !== 'Obstacle') {
      return null;
    }

    return this.interactableObstaclesForActions().find(
      (entry) => entry.obstacle.row === item.row && entry.obstacle.column === item.column
    ) ?? null;
  }

  private interactableObstaclesForActions(): NearbyObstacleInfo[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    const inventoryKeys = this.inventoryKeysForPreview();
    const centerRow = preview.centerRow;
    const centerColumn = preview.centerColumn;
    const obstacles = this.obstaclePlacementsByDungon()[preview.dungonId] ?? [];
    return obstacles
      .filter((obstacle) => this.isObstacleInteractableFromPreview(preview.dungonId, centerRow, centerColumn, obstacle))
      .map((obstacle) => {
        const requiredKeyId = obstacle.requiredKeyId ?? null;
        const hasMatchingKey = requiredKeyId !== null && inventoryKeys.some((key) => key.id === requiredKeyId);
        const itemPlacement = obstacle.itemPlacement ?? 'in';
        const isLocked = this.obstacleIsLocked(obstacle);
        const canTakeItem = obstacle.containsItemId !== null && !obstacle.itemTaken && this.obstacleContainedItemIsTakeable(obstacle);
        const canOpen = !obstacle.isDestroyed && obstacle.isOpened !== true && itemPlacement !== 'on' && !isLocked && obstacle.containsItemId !== null;
        const canUseKey = !obstacle.isDestroyed && obstacle.isOpened !== true && isLocked && hasMatchingKey;
        const canPick = !obstacle.isDestroyed && obstacle.isOpened !== true && isLocked;
        const canSmash = !obstacle.isIndestructible && !obstacle.isDestroyed;
        const canClose = obstacle.isOpened === true && !obstacle.isDestroyed;

        return {
          obstacle,
          direction: 'Nearby',
          canOpen,
          canUseKey,
          canPick,
          canTakeItem,
          hasMatchingKey,
          canSmash,
          canClose,
        };
      });
  }

  turnFacingLeft(): void {
    const preview = this.gridPreviewContext();
    if (!preview) return;
    const current = (this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER).facingDir;
    this.applyCardinalFacingDirection(this.turnFacing(current, 'left'));
  }

  turnFacingRight(): void {
    const preview = this.gridPreviewContext();
    if (!preview) return;
    const current = (this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER).facingDir;
    this.applyCardinalFacingDirection(this.turnFacing(current, 'right'));
  }

  moveForward(): void {
    this.tryMoveCheaterForward();
  }

  moveBackward(): void {
    this.tryMoveCheaterBackward();
  }

  canJump(): boolean {
    if (this.turnPhase() !== 'player' || this.playerHp() <= 0 || this.playerAE() < 3) return false;
    const preview = this.gridPreviewContext();
    if (!preview) return false;

    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const moveDelta = this.getMovementDeltaForFacingDirection(cheater.facingDir);

    // Target is 2 squares away in facing direction
    const targetRow = preview.centerRow + (moveDelta.rowOffset * 2);
    const targetColumn = preview.centerColumn + (moveDelta.columnOffset * 2);

    // Check bounds
    if (targetRow < 0 || targetColumn < 0 || targetRow >= this.gridRowCount || targetColumn >= this.gridColumnCount) {
      return false;
    }

    // Check if square is filled
    const filledSquares = this.filledSquaresByDungon()[preview.dungonId] ?? {};
    if (!filledSquares[this.getSquareKey(targetRow, targetColumn)]) {
      return false;
    }

    // Check for live monster at target
    const hasMonsterAtTarget = this.monsterInstances().some(
      (m) => !m.isDead && m.row === targetRow && m.column === targetColumn
    );
    if (hasMonsterAtTarget) return false;

    // Check for obstacle at target
    const obstaclesForDungon = this.obstaclePlacementsByDungon()[preview.dungonId] ?? [];
    const hasObstacleAtTarget = obstaclesForDungon.some(
      (obs) => obs.row === targetRow && obs.column === targetColumn && this.isObstacleBlockingMovement(obs)
    );
    if (hasObstacleAtTarget) return false;

    // Check for visible trap at target
    const visibleTrap = this.getActiveFloorTrapAtSquare(preview.dungonId, targetRow, targetColumn);
    if (visibleTrap !== null && !visibleTrap.isDisarmed) {
      return false;
    }

    return true;
  }

  tryJump(): void {
    if (!this.canJump()) return;

    const preview = this.gridPreviewContext();
    if (!preview) return;

    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const moveDelta = this.getMovementDeltaForFacingDirection(cheater.facingDir);
    const targetRow = preview.centerRow + (moveDelta.rowOffset * 2);
    const targetColumn = preview.centerColumn + (moveDelta.columnOffset * 2);

    // Get jump bonuses
    let jumpBonus = 0;
    const cls = (this.playerType() ?? '').trim().toLowerCase();
    const species = (this.playerSpecies() ?? '').trim().toLowerCase();

    // +3 for Thiefs
    if (cls === 'thieph' || cls === 'theph') {
      jumpBonus += 3;
    }
    // +2 for Elves
    if (cls === 'elf' || cls === 'elve' || cls === 'elves' || species === 'elf' || species === 'elve' || species === 'elves') {
      jumpBonus += 2;
    }

    // Roll jump check (Str + 1d6 + bonus)
    const strModifier = Math.floor(this.getEffectivePlayerStrength() / 2); // Str as modifier (floor division by 2)
    const d6Roll = this.randomInt(1, 6);

    let jumpRoll = strModifier + d6Roll + jumpBonus;
    let roll2 = null;
    let adv = false;

    // Thiefs get advantage on jump
    if (cls === 'thieph' || cls === 'theph') {
      const d6Roll2 = this.randomInt(1, 6);
      roll2 = strModifier + d6Roll2 + jumpBonus;
      jumpRoll = Math.max(jumpRoll, roll2);
      adv = true;
    }

    // Determine DC - base 3 + (max possible trap damage if there's a hidden trap at destination)
    let dc = 3;
    const hiddenTrap = this.getActiveFloorTrapAtSquare(preview.dungonId, targetRow, targetColumn);
    if (hiddenTrap !== null && hiddenTrap.isTriggered) {
      // If there's a triggered trap (shouldn't be visible but might be marked triggered), still check
      const maxTrapDamage = maxNotation(hiddenTrap.trap.damage);
      if (maxTrapDamage > 0) {
        dc += maxTrapDamage;
      }
    }

    const success = jumpRoll >= dc;

    // Build log message
    let logMsg = `Jump attempt: (Str mod ${strModifier} + 1d6(${d6Roll})${jumpBonus > 0 ? ` + ${jumpBonus}` : ''} = ${jumpRoll}`;
    if (adv && roll2 !== null) {
      logMsg += ` advantage rolls: ${jumpRoll} and ${roll2})`;
    } else {
      logMsg += `)`;
    }
    logMsg += ` vs DC ${dc}: ${success ? 'SUCCESS!' : 'FAILED!'}`;
    this.addCombatLog(logMsg);

    if (success) {
      // Move player
      this.consumePlayerAE(3, preview.dungonId);
      const halfDimension = Math.floor(this.previewGridDimension / 2);
      this.gridPreviewContext.set({
        ...preview,
        centerRow: targetRow,
        centerColumn: targetColumn,
        startRow: targetRow - halfDimension,
        startColumn: targetColumn - halfDimension,
      });

      this.addCombatLog(`You leap forward safely, landing 2 squares away!`);
      this.previewActionMessage.set(`Jump successful! You land safely.`);
      this.logNearbyAfterMove();
      this.triggerNpcGreetings();
      this.playStepSound(0.22);
      this.drawPreviewGridCanvas();

      // Skip floor trap triggering for successful jump
      if (this.turnPhase() === 'player' && this.playerAE() <= 0) {
        this.startMonsterTurns();
      }
    } else {
      this.addCombatLog(`Your jump fails. You stay in place.`);
      this.previewActionMessage.set(`Jump failed! You couldn't make the distance.`);
    }
  }

  isHealingPotion(tresher: Tresher): boolean {
    return (tresher.type ?? 'OtherTresher') === 'Potion' || this.getHealingPotionAmount(tresher) > 0;
  }

  canUseHealingPotion(tresher: Tresher): boolean {
    return (
      this.isHealingPotion(tresher) &&
      this.turnPhase() === 'player' &&
      this.playerHp() > 0 &&
      this.playerHp() < this.getEffectivePlayerMaxHp()
    );
  }

  isInventoryTresherEquipped(index: number): boolean {
    const inventoryContext = this.getInventoryContextForPreview();
    if (!inventoryContext) {
      return false;
    }

    return this.getEquippedTresherIndexesForDungon(
      inventoryContext.dungonId,
      inventoryContext.inventory.treshers.length
    ).includes(index);
  }

  toggleInventoryTresherEquipped(index: number): void {
    const inventoryContext = this.getInventoryContextForPreview();
    if (!inventoryContext) {
      return;
    }

    const { dungonId, inventory } = inventoryContext;
    if (index < 0 || index >= inventory.treshers.length) {
      return;
    }

    const selectedTresher = inventory.treshers[index];
    const tresherName = selectedTresher.name.trim() || 'Tresher';
    const equippedIndexes = this.getEquippedTresherIndexesForDungon(
      dungonId,
      inventory.treshers.length
    );
    if (equippedIndexes.includes(index)) {
      this.setEquippedTresherIndexesForDungon(
        dungonId,
        equippedIndexes.filter((equippedIndex) => equippedIndex !== index)
      );
      this.addCombatLog(`${tresherName} unequipped.`);
      this.previewActionMessage.set(`${tresherName} unequipped.`);
      return;
    }

    if (!this.isTresherEquipable(selectedTresher)) {
      this.previewActionMessage.set(`${tresherName} cannot be equipped.`);
      return;
    }

    this.setEquippedTresherIndexesForDungon(dungonId, [...equippedIndexes, index]);
    this.addCombatLog(`${tresherName} equipped.`);
    this.previewActionMessage.set(`${tresherName} equipped.`);
  }

  useInventoryHealingPotion(index: number): void {
    const inventoryContext = this.getInventoryContextForPreview();
    if (!inventoryContext) {
      return;
    }

    const { dungonId, inventory } = inventoryContext;
    if (index < 0 || index >= inventory.treshers.length) {
      return;
    }

    const potion = inventory.treshers[index];
    const potionName = potion.name.trim() || 'Potion';

    if (this.turnPhase() !== 'player' || this.playerHp() <= 0) {
      this.previewActionMessage.set('Potions can only be used during your turn.');
      return;
    }

    if (this.playerAE() < 1) {
      this.previewActionMessage.set('Not enough AE to use a potion.');
      return;
    }

    if (!this.isHealingPotion(potion)) {
      this.previewActionMessage.set(`${potionName} cannot restore health.`);
      return;
    }

    const currentHp = this.playerHp();
    const maxHp = this.getEffectivePlayerMaxHp();
    if (currentHp >= maxHp) {
      this.previewActionMessage.set('Health is already full.');
      return;
    }

    const restoredHp = Math.min(this.getHealingPotionAmount(potion), maxHp - currentHp);
    if (restoredHp <= 0) {
      this.previewActionMessage.set(`${potionName} has no healing effect.`);
      return;
    }

    this.playerHp.set(currentHp + restoredHp);
    this.removeInventoryTresherAtIndex(dungonId, index);
    this.previewActionMessage.set(`${potionName} restored ${restoredHp} HP.`);
    this.addCombatLog(`You drink ${potionName} and recover ${restoredHp} HP.`);
    this.consumePlayerAE(1, dungonId);
    if (this.playerAE() <= 0) {
      this.startMonsterTurns();
    }
    this.saveGameState();
  }

  inventoryHandsUsedForPreview(): number {
    const inventoryContext = this.getInventoryContextForPreview();
    if (!inventoryContext) {
      return 0;
    }

    const equippedIndexes = this.getEquippedTresherIndexesForDungon(
      inventoryContext.dungonId,
      inventoryContext.inventory.treshers.length
    );

    const tresherHands = equippedIndexes.reduce((sum, equippedIndex) => {
      const equippedItem = inventoryContext.inventory.treshers[equippedIndex];
      if (!equippedItem) {
        return sum;
      }

      return sum + this.getHandsRequiredForEquip(equippedItem);
    }, 0);

    // Weapons occupy 1 or 2 hand slots; shield-type armor (no body slot) occupies 1 hand slot
    const equippedItemIds = this.equippedItemIdsByDungon()[inventoryContext.dungonId] ?? [];
    const itemsMap = this.pcTresherItemsById();
    const bodyArmorSlots = new Set(['head', 'body', 'left-arm', 'right-arm', 'left-leg', 'right-leg']);
    const itemHands = equippedItemIds.reduce((sum, id) => {
      const it = itemsMap.get(id);
      if (!it) return sum;
      if (it.type === 'weapon') return sum + (it.isTwoHanded ? 2 : 1);
      // Armor with no body slot (e.g. shield) occupies 1 hand
      if (it.type === 'armor' && (!it.armorSlot || !bodyArmorSlots.has(it.armorSlot))) return sum + 1;
      return sum;
    }, 0);

    return tresherHands + itemHands;
  }

  equippedArmorSummaryForPreview(): string {
    const inventoryContext = this.getInventoryContextForPreview();
    if (!inventoryContext) {
      return 'None';
    }

    const equippedIndexes = this.getEquippedTresherIndexesForDungon(
      inventoryContext.dungonId,
      inventoryContext.inventory.treshers.length
    );

    const armorNames = equippedIndexes
      .map((index) => inventoryContext.inventory.treshers[index])
      .filter((t) => t && (t.type ?? 'OtherTresher') === 'Armor')
      .map((t) => t!.name.trim() || 'Armor');

    return armorNames.length > 0 ? armorNames.join(', ') : 'None';
  }

  getInventoryTresherMeta(tresher: Tresher): string {
    return this.inventoryService.getInventoryTresherMeta(tresher);
  }

  totalInventoryCurrency(): { gold: number; silver: number; copper: number; zinc: number } {
    return this.inventoryTreshersForPreview().reduce(
      (acc, t) => ({
        gold: acc.gold + (t.gold ?? 0),
        silver: acc.silver + (t.silver ?? 0),
        copper: acc.copper + (t.copper ?? 0),
        zinc: acc.zinc + (t.zinc ?? 0),
      }),
      { gold: 0, silver: 0, copper: 0, zinc: 0 }
    );
  }

  hasCurrencyInInventory(): boolean {
    const c = this.totalInventoryCurrency();
    return c.gold > 0 || c.silver > 0 || c.copper > 0 || c.zinc > 0;
  }

  getTotalGoldInInventory(): number {
    return this.totalInventoryCurrency().gold;
  }

  private deductGoldFromInventory(amount: number): void {
    if (amount <= 0) return;
    const preview = this.gridPreviewContext();
    if (!preview) return;

    const dungonId = preview.dungonId;
    const existingCheater = this.cheaterByDungon()[dungonId] ?? { ...DEFAULT_CHEATER };
    const existingInventory = this.normalizeCheaterInventory(existingCheater.inventory);

    let remaining = amount;
    const updatedTreshers = existingInventory.treshers.map((tresher) => {
      if (remaining <= 0) return tresher;
      const currentGold = Math.max(0, tresher.gold ?? 0);
      if (currentGold <= 0) return tresher;
      const deduct = Math.min(remaining, currentGold);
      remaining -= deduct;
      return {
        ...tresher,
        gold: currentGold - deduct,
      };
    });

    this.cheaterByDungon.update((allCheaters) => ({
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

  readonly bodyPanelBgColor = computed(() => {
    const hp = this.playerHp();
    const max = this.getEffectivePlayerMaxHp();
    const pct = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 1;
    // white at 100%, increasingly red as hp drops
    const g = Math.round(pct * 255);
    const b = Math.round(pct * 255);
    return `rgb(255,${g},${b})`;
  });

  readonly equippedBodySlotsForView = computed(() => {
    const empty = {
      head: false, body: false, leftArm: false, rightArm: false,
      leftLeg: false, rightLeg: false,
      mainHand: null as { isTwoHanded: boolean; kind: 'weapon' | 'wand' | 'shield' } | null,
      offHand: null as { kind: 'weapon' | 'wand' | 'shield' } | null,
      hasRing: false, hasNecklace: false,
    };
    const preview = this.gridPreviewContext();
    if (!preview) return empty;
    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const treshers: Tresher[] = Array.isArray(cheater.inventory?.treshers) ? cheater.inventory.treshers : [];
    const itemsMap = this.pcTresherItemsById();
    const result = { ...empty };

    const bodyArmorSlots = new Set(['head', 'body', 'left-arm', 'right-arm', 'left-leg', 'right-leg']);

    const assignHandItem = (kind: 'weapon' | 'wand' | 'shield', isTwoHanded: boolean) => {
      if (isTwoHanded) {
        result.mainHand = { kind, isTwoHanded: true };
        result.offHand = null;
        return;
      }
      if (!result.mainHand) {
        result.mainHand = { kind, isTwoHanded: false };
        return;
      }
      if (!result.mainHand.isTwoHanded && !result.offHand) {
        result.offHand = { kind };
      }
    };

    const getHandItemKind = (name: string | undefined, fallback: 'weapon' | 'shield' = 'weapon'): 'weapon' | 'wand' | 'shield' => {
      const normalizedName = (name ?? '').toLowerCase();
      if (normalizedName.includes('shield') || normalizedName.includes('buckler')) {
        return 'shield';
      }
      if (normalizedName.includes('wand')) {
        return 'wand';
      }
      return fallback;
    };

    const applyItemId = (itemId: number) => {
      const item = itemsMap.get(itemId);
      if (!item) return;
      const itemType = this.normalizeItemType(item.type);
      switch (itemType) {
        case 'armor':
          if (item.armorSlot === 'head') result.head = true;
          else if (item.armorSlot === 'body') result.body = true;
          else if (item.armorSlot === 'left-arm') result.leftArm = true;
          else if (item.armorSlot === 'right-arm') result.rightArm = true;
          else if (item.armorSlot === 'left-leg') result.leftLeg = true;
          else if (item.armorSlot === 'right-leg') result.rightLeg = true;
          else if (item.armorSlot === 'shield') {
            assignHandItem('shield', false);
          } else if (!item.armorSlot || !bodyArmorSlots.has(item.armorSlot ?? '')) {
            const kind = getHandItemKind(item.name, 'shield');
            if (kind === 'shield') {
              assignHandItem('shield', false);
            }
          }
          break;
        case 'weapon':
          assignHandItem(getHandItemKind(item.name), item.isTwoHanded);
          break;
        case 'ring':
          result.hasRing = true;
          break;
        case 'necklace':
        case 'neckless':
          result.hasNecklace = true;
          break;
        default:
          if (this.isNecklaceLikeItem(itemType, item.name)) {
            result.hasNecklace = true;
          }
          break;
      }
    };

    const equippedIndexes = this.getEquippedTresherIndexesForDungon(preview.dungonId, treshers.length);
    for (const idx of equippedIndexes) {
      const t = treshers[idx];
      if (!t) continue;
      for (const itemId of [t.item1Id, t.item2Id, t.item3Id, t.item4Id]) {
        if (itemId != null) applyItemId(itemId);
      }
    }

    const equippedItemIds = this.equippedItemIdsByDungon()[preview.dungonId] ?? [];
    for (const itemId of equippedItemIds) applyItemId(itemId);

    return result;
  });

  readonly allTresherItemsGrouped = computed(() => {
    const treshers = this.inventoryTreshersForPreview();
    const itemsMap = this.pcTresherItemsById();
    type FlatItem = { id: number; name: string; description: string; type: string; effectValue: number | null; armorSlot: string | null; damage: number; range: number; effectOn: string | null; effectToPc?: string | null; effectToPcValue?: number; uses?: number | null; imageId?: number | null; tresherIdx: number };
    const flat: FlatItem[] = [];
    for (let i = 0; i < treshers.length; i++) {
      const t = treshers[i];
      for (const itemId of [t.item1Id, t.item2Id, t.item3Id, t.item4Id]) {
        if (itemId != null) {
          const item = itemsMap.get(itemId);
          if (item) flat.push({ id: item.id, name: item.name, description: item.description, type: item.type, effectValue: item.effectValue, armorSlot: item.armorSlot, damage: item.damage, range: item.range, effectOn: item.effectOn ?? null, effectToPc: item.effectToPc ?? null, effectToPcValue: item.effectToPcValue ?? 0, uses: item.uses ?? null, imageId: item.imageId ?? null, tresherIdx: i });
        }
      }
    }
    const seen = new Set<number>();
    const deduped = flat.filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true; });
    deduped.sort((a, b) => a.name.localeCompare(b.name));
    const groupMap = new Map<string, FlatItem[]>();
    for (const item of deduped) {
      const type = item.type || 'Other';
      if (!groupMap.has(type)) groupMap.set(type, []);
      groupMap.get(type)!.push(item);
    }
    return [...groupMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([type, items]) => ({ type, items }));
  });

  readonly allTresherPotionsFlat = computed(() => {
    const treshers = this.inventoryTreshersForPreview();
    const potionsMap = this.pcTresherPotionsById();
    type FlatPotion = { id: number; name: string; description: string; effectTo: string; effectAmount: number; lastFor: number; tresherIdx: number };
    const flat: FlatPotion[] = [];
    const seen = new Set<number>();
    for (let i = 0; i < treshers.length; i++) {
      const t = treshers[i];
      for (const potionId of [t.potion1Id, t.potion2Id, t.potion3Id]) {
        if (potionId != null && !seen.has(potionId)) {
          const potion = potionsMap.get(potionId);
          if (potion) { flat.push({ ...potion, tresherIdx: i }); seen.add(potionId); }
        }
      }
    }
    return flat.sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly allTresherSpellsFlat = computed(() => {
    const treshers = this.inventoryTreshersForPreview();
    const spellsMap = this.pcTresherSpellsById();
    const preview = this.gridPreviewContext();
    const learnedFloorSpellIds = new Set<number>(
      preview ? (this.learnedFloorSpellIdsByDungon()[preview.dungonId] ?? []) : []
    );
    const flat: PcTresherSpellData[] = [];
    const seen = new Set<number>();
    for (let i = 0; i < treshers.length; i++) {
      const t = treshers[i];
      for (const spellId of [t.spell1Id, t.spell2Id, t.spell3Id, t.spell4Id]) {
        if (spellId != null && !seen.has(spellId)) {
          const spell = spellsMap.get(spellId);
          if (spell) { flat.push(spell); seen.add(spellId); }
        }
      }
    }

    if (preview) {
      for (const spell of this.collectedFloorSpellsByDungon()[preview.dungonId] ?? []) {
        if (!seen.has(spell.id) && learnedFloorSpellIds.has(spell.id)) {
          flat.push(spell);
          seen.add(spell.id);
        }
      }
    }

    return flat.sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly allPotionsUnified = computed(() => {
    const fromTreshers = this.allTresherPotionsFlat().map((potion) => ({
      id: potion.id,
      name: potion.name,
      description: potion.description,
      effectTo: potion.effectTo,
      effectAmount: potion.effectAmount,
      lastFor: potion.lastFor,
      source: 'tresher' as const,
      tresherIdx: potion.tresherIdx,
    }));

    const fromCollected = this.collectedFloorPotionsForPreview().map((potion) => ({
      id: potion.id,
      name: potion.name,
      description: potion.description,
      effectTo: potion.effectTo,
      effectAmount: potion.effectAmount,
      lastFor: potion.lastFor,
      source: 'collected' as const,
    }));

    return [...fromTreshers, ...fromCollected].sort((a, b) => a.name.localeCompare(b.name));
  });

  getTresherInnerItems(tresher: Tresher): Array<{ id: number; name: string; description: string; type: string; effectValue: number | null; armorSlot: string | null; damage: number; range: number; effectToPc?: string | null; effectToPcValue?: number }> {
    return this.inventoryService.getTresherInnerItems(tresher);
  }

  getTresherInnerPotions(tresher: Tresher): Array<{ id: number; name: string; description: string; effectTo: string; effectAmount: number; lastFor: number }> {
    return this.inventoryService.getTresherInnerPotions(tresher);
  }

  isInnerPotionDrinkable(potion: { effectTo: string }): boolean {
    return this.normalizePotionEffectToPcStat(potion.effectTo) !== null;
  }

  canDrinkInnerPotion(): boolean {
    return this.turnPhase() === 'player' && this.playerHp() > 0 && this.playerAE() >= 1;
  }

  getTresherInnerSpells(tresher: Tresher): PcTresherSpellData[] {
    return this.inventoryService.getTresherInnerSpells(tresher);
  }

  getPlayerMagicResistance(): number {
    return Math.floor(this.getEffectivePlayerMind() / 2);
  }

  private getKnownSpellIdsForDungon(dungonId: number): Set<number> {
    const known = new Set<number>(this.learnedFloorSpellIdsByDungon()[dungonId] ?? []);
    for (const tresher of this.inventoryTreshersForPreview()) {
      for (const spellId of [tresher.spell1Id, tresher.spell2Id, tresher.spell3Id, tresher.spell4Id]) {
        if (spellId != null) {
          known.add(spellId);
        }
      }
    }
    return known;
  }

  isSpellLearned(spellId: number): boolean {
    const preview = this.gridPreviewContext();
    if (!preview) return false;
    return this.getKnownSpellIdsForDungon(preview.dungonId).has(spellId);
  }

  isDefaultSpell(spellId: number): boolean {
    const preview = this.gridPreviewContext();
    if (!preview) return false;
    return (this.defaultSpellIdByDungon()[preview.dungonId] ?? null) === spellId;
  }

  setDefaultSpell(spellId: number): void {
    const preview = this.gridPreviewContext();
    if (!preview) return;
    if (!this.isSpellEquippedById(spellId)) return;
    this.defaultSpellIdByDungon.update((all) => ({
      ...all,
      [preview.dungonId]: spellId,
    }));
  }

  canUseQuickCastIcon(): boolean {
    if (this.isFighterClass()) {
      return false;
    }
    const spellId = this.getDefaultSpellIdForPreview();
    if (spellId === null) {
      return false;
    }
    const spell = this.pcTresherSpellsById().get(spellId);
    return spell ? this.canCastSpell(spell) : false;
  }

  quickCastFromIcon(): void {
    if (this.isFighterClass()) {
      this.tryBoostAttack();
      return;
    }

    const spellId = this.getDefaultSpellIdForPreview();
    if (spellId === null) {
      this.previewActionMessage.set('Set a default spell first.');
      return;
    }

    this.initSpellCast(spellId);
  }

  openBackpackInventoryModal(): void {
    const preview = this.gridPreviewContext();
    if (preview) {
      this.loadLootImages(preview.dungonId);
    }
    this.showBackpackInventoryModal.set(true);
  }

  closeBackpackInventoryModal(): void {
    this.showBackpackInventoryModal.set(false);
  }

  closeInventoryDetailsModal(): void {
    this.inventoryDetailsModal.set(null);
  }

  openBackpackItemDetails(item: BackpackItemEntry): void {
    const lines: string[] = [];
    lines.push(`Type: ${item.type || 'Unknown'}`);
    if (item.damage > 0) {
      lines.push(`Damage: 1-${item.damage}`);
    }
    if (item.range > 0) {
      lines.push(`Range: ${item.range}`);
    }
    if (item.armorSlot) {
      lines.push(`Armor Slot: ${item.armorSlot}`);
    }
    for (const effectLine of this.inventoryItemEffectsForView(item)) {
      lines.push(effectLine);
    }
    if (typeof item.uses === 'number') {
      lines.push(`Uses: ${item.uses}`);
    }
    if (item.description?.trim()) {
      lines.push(`Description: ${item.description.trim()}`);
    }

    this.inventoryDetailsModal.set({
      title: item.name || 'Item',
      lines,
    });
  }

  openBackpackPotionDetails(potion: { name: string; description?: string; effectTo: string; effectAmount: number; lastFor: number }): void {
    const lines = [
      `Effect: ${potion.effectTo} ${potion.effectAmount >= 0 ? '+' : ''}${potion.effectAmount}`,
      `Duration: ${potion.lastFor} turns`,
    ];
    if (potion.description?.trim()) {
      lines.push(`Description: ${potion.description.trim()}`);
    }

    this.inventoryDetailsModal.set({
      title: potion.name || 'Potion',
      lines,
    });
  }

  openBackpackSpellDetails(spell: PcTresherSpellData): void {
    const lines = [
      `Range: ${spell.range}`,
      `Effect: ${spell.effectOn} ${spell.effectAmount >= 0 ? '+' : ''}${spell.effectAmount}`,
      `Magic Cost: ${spell.magicCost ?? 1}`,
      `Min LTSP: ${spell.minLtsp ?? spell.sp}`,
    ];
    if (spell.numberOfTargets > 1) {
      lines.push(`Targets: ${spell.numberOfTargets}`);
    }
    if (spell.description?.trim()) {
      lines.push(`Description: ${spell.description.trim()}`);
    }

    this.inventoryDetailsModal.set({
      title: spell.name || 'Spell',
      lines,
    });
  }

  backpackItemImageSrc(item: BackpackItemEntry): string | null {
    this.lootImageCacheVersion();
    const preview = this.gridPreviewContext();
    const floorFallbackImageId = preview
      ? (this.floorItemListByDungon()[preview.dungonId] ?? []).find((it) => it.id === item.id)?.imageId ?? null
      : null;
    const fallbackImageId = this.pcTresherItemsById().get(item.id)?.imageId ?? floorFallbackImageId ?? null;
    const imageId = typeof item.imageId === 'number' && item.imageId > 0
      ? item.imageId
      : typeof fallbackImageId === 'number' && fallbackImageId > 0
        ? fallbackImageId
        : null;
    if (imageId === null) {
      return null;
    }

    return this.lootImageCache.get(imageId)?.src ?? null;
  }

  drinkBackpackPotion(potion: { id: number; source: 'tresher' | 'collected'; tresherIdx?: number }): void {
    if (potion.source === 'tresher' && potion.tresherIdx !== undefined) {
      this.drinkTresherInnerPotion(potion.tresherIdx, potion.id);
      return;
    }

    this.drinkCollectedFloorPotion(potion.id);
  }

  useBackpackOtherItem(item: BackpackItemEntry): void {
    if (item.source !== 'collected') {
      this.previewActionMessage.set('This item can only be used after being collected from the floor.');
      return;
    }

    this.useCollectedOtherItem(item.id);
  }

  isScrollUsable(item: { type?: string; uses?: number | null }): boolean {
    return item.type === 'scroll' && typeof item.uses === 'number' && item.uses > 0;
  }

  useBackpackScrollItem(item: BackpackItemEntry): void {
    if (item.source !== 'collected') {
      this.previewActionMessage.set('This scroll can only be read after being collected from the floor.');
      return;
    }

    this.useScroll(item.id);
  }

  openDrinkPotionModal(): void {
    this.showDrinkPotionModal.set(true);
  }

  closeDrinkPotionModal(): void {
    this.showDrinkPotionModal.set(false);
  }

  openControlsHelpModal(): void {
    this.showControlsHelpModal.set(true);
  }

  closeControlsHelpModal(): void {
    this.showControlsHelpModal.set(false);
  }

  canOpenReadableNowModal(): boolean {
    return this.readableTextsNow().length > 0;
  }

  openReadableNowModal(): void {
    if (!this.canOpenReadableNowModal()) {
      return;
    }
    this.showReadableNowModal.set(true);
  }

  closeReadableNowModal(): void {
    this.showReadableNowModal.set(false);
  }

  readFromReadableNow(entry: NearbyDiscoveryItem): void {
    this.closeReadableNowModal();
    this.readObstacleText(entry.name, entry.description);
  }

  facingWallNoteForPreview(): { name: string; description: string; imageSrc?: string | null } | null {
    const note = this.nearbyItemsForPreview().find((item) => item.kind === 'Text' && (item.name || '').toLowerCase().includes('wall note'));
    if (!note) return null;
    return {
      name: note.name,
      description: note.description,
      imageSrc: note.imageSrc ?? null,
    };
  }

  readWallNote(note: { name: string; description: string; imageSrc?: string | null }): void {
    this.readObstacleText(note.name, note.description);
  }

  readObstacleText(itemName: string, note: string): void {
    this.itemNoteModal.set({
      itemName: itemName || 'Text',
      note: note || '',
      canRead: true,
      minMindToRead: 0,
    });
  }

  dismissItemNoteModal(): void {
    this.itemNoteModal.set(null);
  }

  onNpcResponseInput(value: string): void {
    this.npcResponseDraft.set(value ?? '');
  }

  sendNpcResponse(): void {
    const response = this.npcResponseDraft().trim();
    if (!response) return;
    this.addCombatLog(`You: ${response}`);
    this.npcResponseDraft.set('');
  }

  closeNpcDialogAndAttack(): void {
    this.dismissNpcDialog();
    if (this.turnPhase() === 'player') {
      this.tryPlayerAttack();
    }
  }

  private getDefaultSpellIdForPreview(): number | null {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return null;
    }

    const explicit = this.defaultSpellIdByDungon()[preview.dungonId] ?? null;
    if (explicit !== null && this.isSpellEquippedById(explicit)) {
      return explicit;
    }

    const firstEquipped = this.allTresherSpellsFlat().find((spell) => this.isSpellEquippedById(spell.id));
    return firstEquipped?.id ?? null;
  }

  isSpellEquippedById(spellId: number): boolean {
    const preview = this.gridPreviewContext();
    if (!preview) return false;
    return (this.equippedSpellIdsByDungon()[preview.dungonId] ?? []).includes(spellId);
  }

  equippedSpellMagicCostForPreview(): number {
    const preview = this.gridPreviewContext();
    if (!preview) return 0;
    const spellIds = this.equippedSpellIdsByDungon()[preview.dungonId] ?? [];
    const spells = this.pcTresherSpellsById();
    return spellIds.reduce((sum, spellId) => sum + Math.max(1, spells.get(spellId)?.magicCost ?? 1), 0);
  }

  toggleSpellEquipped(spellId: number): void {
    const preview = this.gridPreviewContext();
    if (!preview) return;
    if (!this.isSpellLearned(spellId)) {
      this.previewActionMessage.set('You must learn this spell first.');
      return;
    }

    const spell = this.pcTresherSpellsById().get(spellId);
    if (!spell) return;
    const equipped = this.equippedSpellIdsByDungon()[preview.dungonId] ?? [];

    if (equipped.includes(spellId)) {
      this.equippedSpellIdsByDungon.update((all) => ({
        ...all,
        [preview.dungonId]: equipped.filter((id) => id !== spellId),
      }));
      this.previewActionMessage.set(`${spell.name} unequipped.`);
      this.addCombatLog(`${spell.name} unequipped.`);
      this.saveGameState();
      return;
    }

    const currentCost = this.equippedSpellMagicCostForPreview();
    const nextCost = currentCost + Math.max(1, spell.magicCost ?? 1);
    const maxMind = Math.max(0, this.getEffectivePlayerMind());
    if (nextCost > maxMind) {
      this.previewActionMessage.set(`Cannot equip ${spell.name}: spell loadout ${nextCost}/${maxMind} exceeds Mind.`);
      return;
    }

    this.equippedSpellIdsByDungon.update((all) => ({
      ...all,
      [preview.dungonId]: [...equipped, spellId],
    }));
    this.previewActionMessage.set(`${spell.name} equipped.`);
    this.addCombatLog(`${spell.name} equipped.`);
    this.saveGameState();
  }

  canLearnCollectedSpell(spell: PcTresherSpellData): boolean {
    if (!spell) return false;
    if (this.isSpellLearned(spell.id)) return false;
    const spLearnCost = Math.max(0, spell.sp ?? 0);
    const gpLearnCost = Math.max(0, spell.learnCostGp ?? 0);
    if (this.playerSp() < spLearnCost) return false;
    if (this.getTotalGoldInInventory() < gpLearnCost) return false;
    return true;
  }

  learnCollectedFloorSpell(spellId: number): void {
    const preview = this.gridPreviewContext();
    if (!preview) return;
    const spell = this.collectedFloorSpellsByDungon()[preview.dungonId]?.find((s) => s.id === spellId);
    if (!spell) return;
    if (this.isSpellLearned(spellId)) {
      this.previewActionMessage.set(`${spell.name} is already learned.`);
      return;
    }

    const spCost = Math.max(0, spell.sp ?? 0);
    const gpCost = Math.max(0, spell.learnCostGp ?? 0);
    if (this.playerSp() < spCost) {
      this.previewActionMessage.set(`Not enough SP to learn ${spell.name}. Need ${spCost} SP.`);
      return;
    }
    if (gpCost > 0 && this.getTotalGoldInInventory() < gpCost) {
      this.previewActionMessage.set(`Not enough GP to learn ${spell.name}. Need ${gpCost} GP.`);
      return;
    }

    this.playerSp.update((sp) => Math.max(0, sp - spCost));
    if (gpCost > 0) {
      this.deductGoldFromInventory(gpCost);
    }
    const mindBonus = Math.floor(this.getEffectivePlayerMind() / 2);
    const classModifier = this.getSpellLearningClassModifier();
    const totalBonus = mindBonus + classModifier;
    const roll = this.randomInt(1, 12) + totalBonus;
    const dc = Math.max(1, spell.successTestValue);
    this.addCombatLog(`Learn ${spell.name}: rolled ${roll} (1d12${this.formatSignedModifier(totalBonus)}) vs TN ${dc}.`);

    if (roll < dc) {
      this.previewActionMessage.set(`You failed to learn ${spell.name}.`);
      this.addCombatLog(`You fail to decipher ${spell.name}.`);
      this.saveGameState();
      return;
    }

    this.learnedFloorSpellIdsByDungon.update((all) => {
      const existing = all[preview.dungonId] ?? [];
      if (existing.includes(spellId)) {
        return all;
      }
      return {
        ...all,
        [preview.dungonId]: [...existing, spellId],
      };
    });

    this.previewActionMessage.set(`You learned ${spell.name}!`);
    this.addCombatLog(`You learned ${spell.name}.`);
    this.saveGameState();
  }

  canCastSpell(spell: PcTresherSpellData): boolean {
    if (this.turnPhase() !== 'player' || this.playerHp() <= 0) return false;
    if (!this.isSpellLearned(spell.id)) return false;
    if (!this.isSpellEquippedById(spell.id)) return false;
    if (this.equippedSpellMagicCostForPreview() > Math.max(0, this.getEffectivePlayerMind())) return false;
    if (this.playerAE() < 1) return false;
    if (this.playerMp() < Math.max(1, spell.magicCost ?? 1)) return false;
    const preview = this.gridPreviewContext();
    if (!preview) return false;

    const targetKind = this.getSpellTargetKind(spell);
    if (targetKind === 'trap') {
      return this.getTargetFloorTrap(preview.dungonId, preview.centerRow, preview.centerColumn, this.getSpellMaxMonsterRange(spell)) !== null;
    }
    if (targetKind === 'monster') {
      const maxTargetRange = this.getSpellMaxMonsterRange(spell);
      if (maxTargetRange <= 0) return true;
      return this.findAdjacentLiveMonster(preview.centerRow, preview.centerColumn, maxTargetRange, preview.dungonId) !== null;
    }
    return true;
  }

  initSpellCast(spellId: number): void {
    if (this.turnPhase() !== 'player') return;
    const preview = this.gridPreviewContext();
    if (!preview) return;
    const spell = this.pcTresherSpellsById().get(spellId);
    if (!spell) return;
    if (!this.isSpellLearned(spellId) || !this.isSpellEquippedById(spellId)) {
      this.previewActionMessage.set(`${spell.name} must be learned and equipped before casting.`);
      return;
    }

    const targetKind = this.getSpellTargetKind(spell);
    if (spell.numberOfTargets > 1 && targetKind === 'monster' && this.hasMonsterTargetEffect(spell)) {
      this.spellTargetMode.set({ spellId, maxTargets: spell.numberOfTargets, targets: [], targetType: 'monster' });
      this.selectedSpellId.set(spellId);
      this.previewActionMessage.set(`${spell.name}: click up to ${spell.numberOfTargets} monsters on the map, then press Cast.`);
      this.addCombatLog(`Select up to ${spell.numberOfTargets} targets for ${spell.name}.`);
    } else {
      this.castSpell(spellId);
    }
  }

  castSpell(spellId: number): void {
    if (this.turnPhase() !== 'player') return;
    const preview = this.gridPreviewContext();
    if (!preview) return;

    const spell = this.pcTresherSpellsById().get(spellId);
    if (!spell) return;
    if (!this.isSpellLearned(spellId) || !this.isSpellEquippedById(spellId)) {
      this.addCombatLog(`${spell.name} must be learned and equipped before casting.`);
      return;
    }
    const effectSlots = this.getSpellEffectSlots(spell);
    if (effectSlots.length === 0) {
      this.addCombatLog(`${spell.name} has no configured effects.`);
      return;
    }

    const actionCost = 1;
    if (this.playerAE() < actionCost) {
      this.addCombatLog(`Not enough AE to cast ${spell.name}. Need ${actionCost} AE.`);
      return;
    }
    const targetKind = this.getSpellTargetKind(spell);
    const isMageOvercasting = this.isMageClass() && this.mageOvercastEnabled() && targetKind === 'monster' && this.hasMonsterTargetEffect(spell);
    const baseSpellMpCost = Math.max(1, spell.magicCost ?? 1);
    const spellMpCost = isMageOvercasting ? baseSpellMpCost * 2 : baseSpellMpCost;
    if (this.playerMp() < spellMpCost) {
      this.addCombatLog(`Not enough MP to cast ${spell.name}. Need ${spellMpCost} MP.`);
      return;
    }
if (targetKind === 'trap') {
      const maxTrapRange = this.getSpellMaxMonsterRange(spell);
      const targetTrap = this.getTargetFloorTrap(preview.dungonId, preview.centerRow, preview.centerColumn, maxTrapRange);
      if (!targetTrap) {
        this.addCombatLog(`No trap in range (${maxTrapRange}) for ${spell.name}.`);
        return;
      }

      this.playSpellSound(spell);
      this.selectedSpellId.set(null);
      this.consumePlayerAE(actionCost, preview.dungonId);
      this.spendSpellMpWithDoxCheck(preview.dungonId, preview.centerRow, preview.centerColumn, spellMpCost);

      const spellFlavor = this.formatSpellFlavor(spell);
      this.tryDisarmTrapTarget(targetTrap, spell, spellFlavor);
      this.drawPreviewGridCanvas();
      if (this.playerAE() <= 0) {
        this.startMonsterTurns();
      }
      return;
    }

    if (targetKind === 'pc' || !this.hasMonsterTargetEffect(spell)) {
      const spellFlavor = this.formatSpellFlavor(spell);
      this.playSpellSound(spell);
      for (const slot of effectSlots) {
        this.applySpellEffectToPlayer(spell, slot, spellFlavor);
      }
      this.consumePlayerAE(actionCost, preview.dungonId);
      this.spendSpellMpWithDoxCheck(preview.dungonId, preview.centerRow, preview.centerColumn, spellMpCost);
      if (this.playerAE() <= 0) {
        this.startMonsterTurns();
      }
      return;
    }

    const maxMonsterRange = this.getSpellMaxMonsterRange(spell);
    const target = this.getTargetMonster(preview.dungonId, preview.centerRow, preview.centerColumn, maxMonsterRange);
    if (!target) {
      const hasMonsterCureSlot = effectSlots.some((slot) => slot.targetType === 'monster' && this.normalizeEffectToPcStat(slot.effectOn) === 'RemoveCurse');
      if (hasMonsterCureSlot) {
        const spellFlavor = this.formatSpellFlavor(spell);
        for (const slot of effectSlots) {
          if (slot.targetType === 'monster' && this.normalizeEffectToPcStat(slot.effectOn) === 'RemoveCurse') {
            this.applySpellEffectToPlayer(spell, { ...slot, effectOnPc: true, range: 0 }, spellFlavor);
          }
        }
        this.consumePlayerAE(actionCost, preview.dungonId);
        this.spendSpellMpWithDoxCheck(preview.dungonId, preview.centerRow, preview.centerColumn, spellMpCost);
        if (this.playerAE() <= 0) {
          this.startMonsterTurns();
        }
        return;
      }
      this.addCombatLog(`No target in range (${maxMonsterRange}) for ${spell.name}.`);
      return;
    }

    this.playSpellSound(spell);

    const template = this.getMonstersByIdForDungon(preview.dungonId).get(target.monsterId);
    const monsterName = template?.name ?? 'monster';
    const magicResistance = template ? this.getEffectiveMonsterMagicResistance(target, template) : 0;

    this.selectedSpellId.set(null);

    const dist = this.getSquareDistance(preview.centerRow, preview.centerColumn, target.row, target.column);
    const rangerHitBonus = this.getRangerRangedHitBonusAtDistance(dist);
    const spellCastBonus = this.getEffectivePlayerMind() + this.getSpellCastingClassModifier() + rangerHitBonus;
    const roll = this.rollD12(spellCastBonus);
    const dc = spell.successTestValue + magicResistance;
    const spellFlavor = this.formatSpellFlavor(spell);
    this.addCombatLog(`Cast ${spell.name}${spellFlavor} — rolled ${roll} (1d12${this.formatSignedModifier(spellCastBonus)}) vs DC ${dc} (TN ${spell.successTestValue} + MR ${magicResistance}).`);
    if (isMageOvercasting) {
      this.addCombatLog(`Overcast! Spent ${spellMpCost} MP for up to ×2 damage.`);
    }

    if (roll >= dc) {
      const hasRangedMonsterHit = effectSlots.some((slot) => slot.targetType === 'monster' && slot.effectOn === 'HP' && slot.range > 1 && dist > 1 && dist <= slot.range);
      if (hasRangedMonsterHit) {
        this.triggerSpellBeam(preview.centerRow, preview.centerColumn, target.row, target.column, true);
      }

      for (const slot of effectSlots) {
        if (slot.targetType === 'pc') {
          this.applySpellEffectToPlayer(spell, slot, spellFlavor);
          continue;
        }
        if (slot.targetType !== 'monster') {
          continue;
        }

        if (dist > slot.range) {
          this.addCombatLog(`${spell.name}${spellFlavor} ${slot.effectOn} effect is out of range (${slot.range}).`);
          continue;
        }

        if (target.isDead) {
          break;
        }

        this.applySpellEffectToMonster(spell, slot, target, monsterName, magicResistance, spellFlavor, preview.dungonId, template ?? null, isMageOvercasting);
      }

      this.monsterInstances.update((arr) => [...arr]);
    } else {
      this.addCombatLog(`${spell.name}${spellFlavor} fizzles — ${monsterName} resists!`);
    }

    // consumePlayerAE ticks all active effects (including any just applied) once per AE point
    this.consumePlayerAE(actionCost, preview.dungonId);
    this.spendSpellMpWithDoxCheck(preview.dungonId, preview.centerRow, preview.centerColumn, spellMpCost);
    this.drawPreviewGridCanvas();

    if (this.playerAE() <= 0) {
      this.startMonsterTurns();
    }
  }

  executeMultiTargetSpell(): void {
    const targetMode = this.spellTargetMode();
    if (!targetMode || targetMode.targets.length === 0) return;
    if (this.turnPhase() !== 'player') return;
    const preview = this.gridPreviewContext();
    if (!preview) return;

    const spell = this.pcTresherSpellsById().get(targetMode.spellId);
    if (!spell) return;
    if (!this.isSpellLearned(spell.id) || !this.isSpellEquippedById(spell.id)) {
      this.addCombatLog(`${spell.name} must be learned and equipped before casting.`);
      this.cancelSpellTargetMode();
      return;
    }
    const effectSlots = this.getSpellEffectSlots(spell);
    if (effectSlots.length === 0) return;

    const actionCost = 1;
    if (this.playerAE() < actionCost) {
      this.addCombatLog(`Not enough AE to cast ${spell.name}. Need ${actionCost} AE.`);
      return;
    }
    const spellMpCost = Math.max(1, spell.magicCost ?? 1);
    if (this.playerMp() < spellMpCost) {
      this.addCombatLog(`Not enough MP to cast ${spell.name}. Need ${spellMpCost} MP.`);
      return;
    }

    this.playSpellSound(spell);

    this.spellTargetMode.set(null);
    this.selectedSpellId.set(null);
    const spellFlavor = this.formatSpellFlavor(spell);

    for (const slot of effectSlots) {
      if (slot.effectOnPc) {
        this.applySpellEffectToPlayer(spell, slot, spellFlavor);
      }
    }

    let anyHit = false;
    for (const t of targetMode.targets) {
      const instance = this.monsterInstances().find(m => !m.isDead && m.row === t.row && m.column === t.column);
      if (!instance) continue;
      const template = this.getMonstersByIdForDungon(preview.dungonId).get(instance.monsterId);
      const monsterName = template?.name ?? 'monster';
      const magicResistance = template ? this.getEffectiveMonsterMagicResistance(instance, template) : 0;
      const dist = this.getSquareDistance(preview.centerRow, preview.centerColumn, instance.row, instance.column);
      const rangerHitBonus = this.getRangerRangedHitBonusAtDistance(dist);
      const spellCastBonus = this.getEffectivePlayerMind() + this.getSpellCastingClassModifier() + rangerHitBonus;
      const roll = this.rollD12(spellCastBonus);
      const dc = spell.successTestValue + magicResistance;
      this.addCombatLog(`${spell.name}${spellFlavor} → ${monsterName}: rolled ${roll} vs DC ${dc}.`);
      if (roll >= dc) {
        anyHit = true;
        const hasRangedMonsterHit = effectSlots.some((slot) => !slot.effectOnPc && slot.effectOn === 'HP' && slot.range > 1 && dist > 1 && dist <= slot.range);
        if (hasRangedMonsterHit) {
          this.triggerSpellBeam(preview.centerRow, preview.centerColumn, instance.row, instance.column, true);
        }

        for (const slot of effectSlots) {
          if (slot.effectOnPc) continue;
          if (dist > slot.range) {
            this.addCombatLog(`${spell.name}${spellFlavor} ${slot.effectOn} effect is out of range (${slot.range}) on ${monsterName}.`);
            continue;
          }
          if (instance.isDead) {
            break;
          }
          this.applySpellEffectToMonster(spell, slot, instance, monsterName, magicResistance, spellFlavor, preview.dungonId, template ?? null);
        }
      } else {
        this.addCombatLog(`${spell.name}${spellFlavor} fizzles — ${monsterName} resists!`);
      }
    }
    if (anyHit) {
      this.selectedCombatTarget.set(null);
    }
    this.monsterInstances.update((arr) => [...arr]);
    this.consumePlayerAE(actionCost, preview.dungonId);
    this.spendSpellMpWithDoxCheck(preview.dungonId, preview.centerRow, preview.centerColumn, spellMpCost);
    this.drawPreviewGridCanvas();
    if (this.playerAE() <= 0) {
      this.startMonsterTurns();
    }
  }

  private getSpellEffectSlots(spell: PcTresherSpellData): Array<{
    effectOn: string;
    effectAmount: number;
    effectDiceCount?: number;
    effectDiceSides?: number;
    effectOnPc: boolean;
    range: number;
    lastFor: number;
    targetType: 'pc' | 'monster' | 'trap';
  }> {
    const range1 = Math.max(0, spell.range1 ?? spell.range ?? 0);
    const range2 = Math.max(0, spell.range2 ?? spell.range ?? 0);
    const lastFor1 = Math.max(0, spell.lastFor1 ?? spell.lastFor ?? 0);
    const lastFor2 = Math.max(0, spell.lastFor2 ?? spell.lastFor ?? 0);
    const effectAmount2 = typeof spell.effectAmount2 === 'number' ? spell.effectAmount2 : 0;
    const effectOn2 = (spell.effectOn2 ?? '').trim();
    const explicitTargetType = spell.targetType && spell.targetType !== 'auto' ? spell.targetType : null;

    const slots: Array<{ effectOn: string; effectAmount: number; effectDiceCount?: number; effectDiceSides?: number; effectOnPc: boolean; range: number; lastFor: number; targetType: 'pc' | 'monster' | 'trap'; }> = [];

    const effectOn1 = (spell.effectOn ?? '').trim();
    if (effectOn1) {
      const inferredTargetType = this.normalizeEffectToPcStat(effectOn1) === 'RemoveTrap'
        ? 'trap'
        : ((spell.effectOnPc1 === true) || range1 === 0 || this.normalizeEffectToPcStat(effectOn1) === 'RemoveCurse')
          ? 'pc'
          : 'monster';
      slots.push({
        effectOn: effectOn1,
        effectAmount: spell.effectAmount,
        effectDiceCount: spell.effectDiceCount,
        effectDiceSides: spell.effectDiceSides,
        effectOnPc: explicitTargetType === 'pc' || inferredTargetType === 'pc',
        range: range1,
        lastFor: lastFor1,
        targetType: explicitTargetType ?? inferredTargetType,
      });
    }

    if (effectOn2) {
      const inferredTargetType = this.normalizeEffectToPcStat(effectOn2) === 'RemoveTrap'
        ? 'trap'
        : ((spell.effectOnPc2 === true) || range2 === 0 || this.normalizeEffectToPcStat(effectOn2) === 'RemoveCurse')
          ? 'pc'
          : 'monster';
      slots.push({
        effectOn: effectOn2,
        effectAmount: effectAmount2,
        effectDiceCount: spell.effectAmount2DiceCount,
        effectDiceSides: spell.effectAmount2DiceSides,
        effectOnPc: explicitTargetType === 'pc' || inferredTargetType === 'pc',
        range: range2,
        lastFor: lastFor2,
        targetType: explicitTargetType ?? inferredTargetType,
      });
    }

    return slots;
  }

  private getSpellTargetKind(spell: PcTresherSpellData): 'self' | 'pc' | 'monster' | 'trap' {
    const slots = this.getSpellEffectSlots(spell);
    if (slots.some((slot) => slot.targetType === 'trap')) {
      return 'trap';
    }
    if (slots.some((slot) => slot.targetType === 'monster')) {
      return 'monster';
    }
    if (slots.some((slot) => slot.targetType === 'pc')) {
      return 'pc';
    }
    return 'self';
  }

  private hasMonsterTargetEffect(spell: PcTresherSpellData): boolean {
    return this.getSpellEffectSlots(spell).some((slot) => slot.targetType === 'monster');
  }

  private hasTrapTargetEffect(spell: PcTresherSpellData): boolean {
    return this.getSpellEffectSlots(spell).some((slot) => slot.targetType === 'trap');
  }

  private getSpellMaxMonsterRange(spell: PcTresherSpellData): number {
    return this.getSpellEffectSlots(spell)
      .filter((slot) => slot.targetType === 'monster' || slot.targetType === 'trap')
      .reduce((max, slot) => Math.max(max, slot.range), 0);
  }

  private spellEffectRemainingAE(lastFor: number): number {
    return Math.max(1, lastFor);
  }

  private spellEffectDurationLabel(lastFor: number): string {
    return lastFor === 0 ? 'permanently' : `for ${lastFor} rounds`;
  }

  private applyPermanentPlayerSpellEffect(effectOn: string, amount: number): void {
    const target = this.normalizeEffectToPcStat(effectOn);
    const preview = this.gridPreviewContext();
    if (target === 'RemoveCurse' && preview) {
      this.clearPlayerCursesForDungon(preview.dungonId);
      return;
    }
    if (target === 'RemoveTrap') {
      return;
    }
    if (target === 'HP') {
      const nextHp = Math.max(0, Math.min(this.playerHp() + amount, this.getEffectivePlayerMaxHp()));
      this.playerHp.set(nextHp);
      return;
    }
    if (target === 'Magic') {
      this.playerMagicPower.update((v) => Math.max(0, v + amount));
      if (amount < 0) {
        this.playerMp.set(Math.max(0, Math.min(this.playerMp() + amount, this.getEffectivePlayerMagicPower())));
      } else {
        this.playerMp.set(Math.max(0, Math.min(this.playerMp(), this.getEffectivePlayerMagicPower())));
      }
      return;
    }
    if (target === 'Mind') {
      this.playerMind.update((v) => Math.max(0, v + amount));
      return;
    }
    if (target === 'Stamina') {
      this.playerStamina.update((v) => Math.max(0, v + amount));
      return;
    }
    if (target === 'Strength') {
      this.playerStrength.update((v) => Math.max(0, v + amount));
      return;
    }
    if (target === 'AE') {
      this.playerAE.set(Math.max(0, Math.min(this.playerAE() + amount, this.getEffectivePlayerMaxAE())));
      return;
    }
    if (target === 'NOA') {
      this.playerNOA.update((v) => Math.max(1, v + amount));
      return;
    }
    if (target === 'AC') {
      this.playerBaseAC.update((v) => Math.max(0, v + amount));
      return;
    }
    if (target === 'ROS' && preview) {
      const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
      const baseRos = Number.isFinite(cheater.rangeOfSight) ? cheater.rangeOfSight : DEFAULT_CHEATER.rangeOfSight;
      this.cheaterByDungon.update((all) => ({
        ...all,
        [preview.dungonId]: {
          ...cheater,
          rangeOfSight: Math.max(0, Math.floor(baseRos + amount)),
        },
      }));
    }
    // Sneek: any negative/zero amount or 'Sneek' effectOn cancels the stealth
    const effectLower = effectOn.trim().toLowerCase();
    if (effectLower === 'sneek' || effectLower === 'sneak') {
      if (this.playerSneekRoundsRemaining() > 0) {
        this.playerSneekRoundsRemaining.set(0);
        this.addCombatLog('A spell reveals your position! Sneek cancelled.');
      }
    }
  }

  private applySpellEffectToPlayer(
    spell: PcTresherSpellData,
    slot: { effectOn: string; effectAmount: number; effectOnPc: boolean; range: number; lastFor: number },
    spellFlavor: string
  ): void {
    const amount = this.rollSpellEffectDelta(this.getSpellEffectAmountWithMagicBonus(slot.effectAmount));
    const healerBonus = (this.isHealerClass() && amount > 0) ? Math.floor(this.getEffectivePlayerMagicPower() / 2) : 0;
    if (this.normalizeEffectToPcStat(slot.effectOn) === 'RemoveCurse') {
      const preview = this.gridPreviewContext();
      const removedCount = preview ? this.clearPlayerCursesForDungon(preview.dungonId) : 0;
      this.triggerSpellHitFlash(spell.name, slot.effectOn, spell.effectType ?? '', spell.effectColor);
      this.addCombatLog(
        removedCount > 0
          ? `${spell.name}${spellFlavor} removes your curses.`
          : `${spell.name}${spellFlavor} finds no curse to remove.`
      );
      return;
    }

    if (slot.lastFor === 0) {
      const permanentAmount = amount + healerBonus;
      this.applyPermanentPlayerSpellEffect(slot.effectOn, permanentAmount);
      this.triggerSpellHitFlash(spell.name, slot.effectOn, spell.effectType ?? '', spell.effectColor);
      if (healerBonus > 0) {
        this.addCombatLog(`Healer's touch adds +${healerBonus} to the restoration!`);
      }
      this.addCombatLog(`${spell.name}${spellFlavor} permanently affects you. (${slot.effectOn} ${permanentAmount >= 0 ? '+' : ''}${permanentAmount})`);
      return;
    }

    const target = this.normalizeEffectToPcStat(slot.effectOn);
    if (target === 'HP') {
      this.playerActiveEffects.update((effects) => [
        ...effects,
        {
          effectOn: slot.effectOn,
          effectAmount: amount,
          remainingAE: this.spellEffectRemainingAE(slot.lastFor),
          sourceName: spell.name,
          behavior: 'tick',
        },
      ]);
    } else {
      const modifierAmount = amount + healerBonus;
      this.playerActiveEffects.update((effects) => [
        ...effects,
        {
          effectOn: slot.effectOn,
          effectAmount: modifierAmount,
          remainingAE: this.spellEffectRemainingAE(slot.lastFor),
          sourceName: spell.name,
          behavior: 'modifier',
        },
      ]);
      if (target === 'Magic' && modifierAmount > 0) {
        this.playerMp.set(Math.max(0, Math.min(this.playerMp() + modifierAmount, this.getEffectivePlayerMagicPower())));
      }
      if (healerBonus > 0) {
        this.addCombatLog(`Healer's touch adds +${healerBonus} to the restoration!`);
      }
    }
    this.triggerSpellHitFlash(spell.name, slot.effectOn, spell.effectType ?? '', spell.effectColor);
    this.addCombatLog(`${spell.name}${spellFlavor} affects you ${this.spellEffectDurationLabel(slot.lastFor)}. (${slot.effectOn} ${amount >= 0 ? '+' : ''}${amount})`);
  }

  private applySpellEffectToMonster(
    spell: PcTresherSpellData,
    slot: { effectOn: string; effectAmount: number; effectOnPc: boolean; range: number; lastFor: number },
    target: GameMonsterInstance,
    monsterName: string,
    magicResistance: number,
    spellFlavor: string,
    dungonId: number,
    template: Monster | null,
    overcast: boolean = false
  ): void {
    const amount = this.rollSpellEffectDelta(this.getSpellEffectAmountWithMagicBonus(slot.effectAmount));
    const detrimentalAmount = amount >= 0 ? -amount : amount;

    if (this.normalizeEffectToPcStat(slot.effectOn) === 'RemoveCurse') {
      const removedCount = this.clearMonsterCurses(target);
      this.triggerMonsterGlow(target.row, target.column, spell.name, slot.effectOn, spell.effectType ?? '');
      this.addCombatLog(
        removedCount > 0
          ? `${spell.name}${spellFlavor} removes curses from ${monsterName}.`
          : `${spell.name}${spellFlavor} finds no curse on ${monsterName}.`
      );
      return;
    }

    if (this.normalizeEffectToMonsterStat(slot.effectOn) === 'Mind' && template && getMonsterTypeCombatModifiers(template.type).mindDamageImmune) {
      this.addCombatLog(`${monsterName} is immune to mind-affecting magic! ${spell.name} has no effect.`);
      return;
    }

    if (slot.lastFor === 0 && slot.effectOn !== 'HP') {
      if ((slot.effectOn ?? '').trim().toLowerCase() === 'magic') {
        target.currentMagic = target.currentMagic + detrimentalAmount;
        this.addCombatLog(`${spell.name}${spellFlavor} permanently alters ${monsterName} magic by ${detrimentalAmount}.`);
      } else {
        const statKey = (slot.effectOn ?? '').trim() || slot.effectOn;
        if (statKey) {
          const current = target.permanentStatModifiers[statKey] ?? 0;
          const next = current + detrimentalAmount;
          if (next === 0) {
            delete target.permanentStatModifiers[statKey];
          } else {
            target.permanentStatModifiers[statKey] = next;
          }
        }
        this.addCombatLog(`${spell.name}${spellFlavor} weakens ${monsterName}: ${slot.effectOn} ${detrimentalAmount}.`);
      }
      this.triggerMonsterGlow(target.row, target.column, spell.name, slot.effectOn, spell.effectType ?? '');
      return;
    }

    if (slot.effectOn === 'HP') {
      const overcastMultiplier = overcast ? 2 : 1;
      const calc = this.calculateSpellHpDamage(Math.max(1, Math.abs(amount)) * overcastMultiplier, magicResistance);
      const rangerDamageBonus = this.getRangerFavoredTypeDamageBonus(template);
      const damagePerTick = Math.max(1, calc.damage + rangerDamageBonus);
      if (slot.lastFor === 0) {
        target.currentHp = Math.max(0, target.currentHp - damagePerTick);
      } else {
        target.activeEffects.push({
          effectOn: slot.effectOn,
          effectAmount: damagePerTick,
          remainingAE: this.spellEffectRemainingAE(slot.lastFor),
          sourceName: spell.name,
          behavior: 'tick',
        });
      }
      this.triggerSpellHitFlash(spell.name, slot.effectOn, spell.effectType ?? '', spell.effectColor);
      this.triggerMonsterGlow(target.row, target.column, spell.name, slot.effectOn, spell.effectType ?? '');
      this.addCombatLog(`${spell.name}${spellFlavor} afflicts ${monsterName} ${this.spellEffectDurationLabel(slot.lastFor)}. (${slot.effectOn} -${damagePerTick})`);
    } else {
      target.activeEffects.push({
        effectOn: slot.effectOn,
        effectAmount: detrimentalAmount,
        remainingAE: this.spellEffectRemainingAE(slot.lastFor),
        sourceName: spell.name,
        behavior: 'modifier',
      });
      this.triggerMonsterGlow(target.row, target.column, spell.name, slot.effectOn, spell.effectType ?? '');
      this.addCombatLog(`${spell.name}${spellFlavor} weakens ${monsterName} ${this.spellEffectDurationLabel(slot.lastFor)}. (${slot.effectOn} ${detrimentalAmount})`);
    }

    if (target.currentHp <= 0) {
      target.isDead = true;
      target.currentHp = 0;
      this.addCombatLog(`${monsterName} is dead!`);
      this.selectedCombatTarget.set(null);
      this.dropMonsterLoot(dungonId, target, template ?? null);
      const spGain = template?.spReward ?? 0;
      if (spGain > 0) {
        this.playerSp.update((s) => s + spGain);
        this.addCombatLog(`+${spGain} SP!`);
        this.awardSpToPC(spGain);
      }
    }
  }

  private castSpellOnSelf(spell: PcTresherSpellData, spellEffectAmount: number): void {
    void spellEffectAmount;
    const spellFlavor = this.formatSpellFlavor(spell);
    const slots = this.getSpellEffectSlots(spell);
    for (const slot of slots) {
      this.applySpellEffectToPlayer(spell, slot, spellFlavor);
    }
    this.drawPreviewGridCanvas();
  }

  cancelSpellTargetMode(): void {
    this.spellTargetMode.set(null);
    this.selectedSpellId.set(null);
    this.previewActionMessage.set(null);
    this.drawPreviewGridCanvas();
  }

  private triggerSpellBeam(fromRow: number, fromCol: number, toRow: number, toCol: number, isHP: boolean): void {
    // Beam visuals disabled by design; impact effects are used instead.
    void fromRow;
    void fromCol;
    void toRow;
    void toCol;
    void isHP;
  }

  private triggerMonsterGlow(row: number, col: number, spellName = '', effectOn = '', effectType = ''): void {
    this.triggerMonsterImpact(row, col, this.getMonsterImpactKind(spellName, effectOn, effectType), null);
  }

  private triggerWeaponMonsterImpact(
    row: number,
    col: number,
    effectType: string,
    effectColor: string | null,
    weaponName = '',
    attackDistance = 1
  ): void {
    const projectile = this.getRangedImpactProjectile(weaponName, attackDistance);
    if (projectile !== null) {
      this.triggerMonsterImpact(row, col, 'rangedTarget', effectColor, projectile);
      return;
    }
    this.triggerMonsterImpact(row, col, this.getMonsterImpactKind('', '', effectType), effectColor);
  }

  private shouldRenderMonsterInstance(instance: GameMonsterInstance): boolean {
    if (!instance.isDead) {
      return true;
    }

    const impactByKey = this.monsterImpactEffects();
    const previewKey = `${instance.row}_${instance.column}`;
    const firstPersonKey = `${instance.row}:${instance.column}`;
    return !!impactByKey[previewKey] || !!impactByKey[firstPersonKey];
  }

  private triggerMonsterImpact(
    row: number,
    col: number,
    kind: MonsterImpactKind,
    color: string | null,
    projectile: MonsterImpactProjectile | null = null
  ): void {
    const previewKey = `${row}_${col}`;
    const firstPersonKey = `${row}:${col}`;
    const now = Date.now();
    const durationMs = kind === 'rangedTarget' ? 2000 : 2100;
    this.monsterGlowKeys.update(s => { const n = new Set(s); n.add(previewKey); return n; });
    const impactState: MonsterImpactState = {
      kind,
      color: color || this.getDefaultMonsterImpactColor(kind),
      projectile,
      startedAt: now,
      expiresAt: now + durationMs,
    };
    this.monsterImpactEffects.update((all) => ({
      ...all,
      [previewKey]: impactState,
      [firstPersonKey]: impactState,
    }));
    this.ensureMonsterImpactPulseTimer();
    setTimeout(() => {
      this.monsterGlowKeys.update(s => { const n = new Set(s); n.delete(previewKey); return n; });
      this.monsterImpactEffects.update((all) => {
        if (!all[previewKey] && !all[firstPersonKey]) return all;
        const next = { ...all };
        delete next[previewKey];
        delete next[firstPersonKey];
        return next;
      });
      this.stopMonsterImpactPulseTimerIfIdle();
      this.drawPreviewGridCanvas();
    }, durationMs);
  }

  private getMonsterImpactKind(spellName: string, effectOn: string, effectType: string): MonsterImpactKind {
    const normalizedType = (effectType ?? '').toLowerCase();
    if (normalizedType.includes('blood') || normalizedType.includes('bleed')) {
      return 'blood';
    }
    if (normalizedType.includes('splah') || normalizedType.includes('splash') || normalizedType.includes('ooze') || normalizedType.includes('slime')) {
      return 'splah';
    }
    if (normalizedType.includes('fire')) {
      return 'fire';
    }
    if (normalizedType.includes('mind') || normalizedType.includes('psychic') || normalizedType.includes('psionic')) {
      return 'mind';
    }
    if (normalizedType.includes('lightning') || normalizedType.includes('shock') || normalizedType.includes('spark') || normalizedType.includes('storm')) {
      return 'lightning';
    }
    if (normalizedType.includes('ice') || normalizedType.includes('frost') || normalizedType.includes('cold')) {
      return 'ice';
    }
    const normalized = `${spellName} ${effectOn} ${effectType}`.toLowerCase();
    if (normalized.includes('blood') || normalized.includes('bleed')) {
      return 'blood';
    }
    if (normalized.includes('splah') || normalized.includes('splash') || normalized.includes('ooze') || normalized.includes('slime') || normalized.includes('bubble')) {
      return 'splah';
    }
    if (normalized.includes('fire') || normalized.includes('burn') || normalized.includes('flame')) {
      return 'fire';
    }
    if (
      normalized.includes('mind') ||
      normalized.includes('psychic') ||
      normalized.includes('psionic')
    ) {
      return 'mind';
    }
    if (
      normalized.includes('lightning') ||
      normalized.includes('shock') ||
      normalized.includes('spark') ||
      normalized.includes('storm')
    ) {
      return 'lightning';
    }
    if (
      normalized.includes('ice') ||
      normalized.includes('frost') ||
      normalized.includes('cold')
    ) {
      return 'ice';
    }
    return 'arcane';
  }

  private getDefaultMonsterImpactColor(kind: MonsterImpactKind): string {
    if (kind === 'blood') return '#c61d2d';
    if (kind === 'rangedTarget') return '#c61d2d';
    if (kind === 'fire') return '#ff5b2a';
    if (kind === 'lightning') return '#8de8ff';
    if (kind === 'ice') return '#71d6ff';
    if (kind === 'mind') return '#44dd77';
    if (kind === 'splah') return '#55dd88';
    return '#c85fff';
  }

  private ensureMonsterImpactPulseTimer(): void {
    if (this.monsterImpactPulseTimer !== null) {
      return;
    }
    this.monsterImpactPulseTimer = setInterval(() => {
      this.monsterImpactPulse.update((v) => (v + 1) % 100000);
      this.drawPreviewGridCanvas();
    }, 55);
  }

  private stopMonsterImpactPulseTimerIfIdle(): void {
    if (Object.keys(this.monsterImpactEffects()).length > 0) {
      return;
    }
    if (this.monsterImpactPulseTimer !== null) {
      clearInterval(this.monsterImpactPulseTimer);
      this.monsterImpactPulseTimer = null;
    }
  }

  private triggerPlayerYellowHitFlash(): void {
    this.playerYellowHitFlash.set(true);
    setTimeout(() => this.playerYellowHitFlash.set(false), 1500);
  }

  private triggerSpellHitFlash(spellName: string, effectOn: string, effectType: string, effectColor: string | undefined): void {
    const rawKind = this.getMonsterImpactKind(spellName, effectOn, effectType);
    const kind = rawKind === 'rangedTarget' ? 'blood' : rawKind;
    this.spellHitFlash.set(kind);
    this.spellHitFlashColor.set(kind === 'splah' ? (effectColor ?? this.getDefaultMonsterImpactColor(kind)) : null);
    setTimeout(() => {
      this.spellHitFlash.set(null);
      this.spellHitFlashColor.set(null);
    }, 1500);
  }

  getBeamFpvLine(beam: { fromRow: number; fromCol: number; toRow: number; toCol: number; isHP: boolean }): { x1: number; y1: number; x2: number; y2: number } | null {
    const preview = this.gridPreviewContext();
    if (!preview) return null;

    const viewportWidth = 330;
    const viewportHeight = 220;
    const playerOrigin = { x: viewportWidth / 2, y: viewportHeight * 0.63 };
    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const facing = cheater.facingDir;

    const firstPersonView = this.getFirstPersonView(preview, cheater);
    const maxFrameDepth = Math.max(2, Math.min(12, firstPersonView.steps.length + 0.85));
    const frameAtDepth = (depth: number): { left: number; right: number; top: number; bottom: number } => {
      const ratio = Math.min(1, depth / maxFrameDepth);
      const marginX = ratio * (viewportWidth * 0.41);
      const marginY = ratio * (viewportHeight * 0.33);
      return {
        left: marginX,
        right: viewportWidth - marginX,
        top: marginY,
        bottom: viewportHeight - marginY,
      };
    };

    const toForwardRight = (row: number, col: number): { forward: number; right: number } => {
      const dr = row - preview.centerRow;
      const dc = col - preview.centerColumn;
      switch (facing) {
        case 'up':
          return { forward: -dr, right: dc };
        case 'right':
          return { forward: dc, right: dr };
        case 'down':
          return { forward: dr, right: -dc };
        case 'left':
          return { forward: -dc, right: -dr };
      }
    };

    const projectSquareCenter = (row: number, col: number): { x: number; y: number } | null => {
      const { forward, right } = toForwardRight(row, col);
      if (forward <= 0) return null;

      const depth = Math.min(firstPersonView.steps.length + 1, Math.max(1, Math.round(forward)));
      const nearFrame = frameAtDepth(depth);
      const farFrame = frameAtDepth(depth + 1);

      const midLeft = nearFrame.left * 0.65 + farFrame.left * 0.35;
      const midRight = nearFrame.right * 0.65 + farFrame.right * 0.35;
      const midTop = nearFrame.top * 0.65 + farFrame.top * 0.35;
      const midBottom = nearFrame.bottom * 0.65 + farFrame.bottom * 0.35;
      const tileWidth = midRight - midLeft;
      const tileHeight = midBottom - midTop;

      const perspectiveOffset = right / (forward + 0.65);
      const centeredX = (midLeft + midRight) / 2 + perspectiveOffset * tileWidth * 0.82;
      const minCenterX = midLeft + tileWidth * 0.12;
      const maxCenterX = midRight - tileWidth * 0.12;
      const centerX = Math.max(minCenterX, Math.min(maxCenterX, centeredX));
      const centerY = midTop + tileHeight * 0.52;

      return { x: centerX, y: centerY };
    };

    const targetPoint = projectSquareCenter(beam.toRow, beam.toCol);
    if (!targetPoint) return null;

    const sourcePoint =
      beam.fromRow === preview.centerRow && beam.fromCol === preview.centerColumn
        ? playerOrigin
        : (projectSquareCenter(beam.fromRow, beam.fromCol) ?? playerOrigin);

    return { x1: sourcePoint.x, y1: sourcePoint.y, x2: targetPoint.x, y2: targetPoint.y };
  }

  private applyPotionEffectToPlayer(potion: { name: string; effectTo: string; effectAmount: number; lastFor: number }): boolean {
    const potionName = potion.name?.trim() || 'Potion';
    const target = this.normalizePotionEffectToPcStat(potion.effectTo);
    if (!target) {
      this.previewActionMessage.set(`${potionName} has no drinkable effect.`);
      return false;
    }

    if (target === 'RemoveCurse') {
      const preview = this.gridPreviewContext();
      if (!preview) {
        this.previewActionMessage.set(`${potionName} fizzles with no active dungeon context.`);
        return false;
      }
      const removedCount = this.clearPlayerCursesForDungon(preview.dungonId);
      this.previewActionMessage.set(removedCount > 0 ? `${potionName}: curses removed.` : `${potionName}: no curses to remove.`);
      this.addCombatLog(removedCount > 0 ? `You drink ${potionName}. Your curses are lifted.` : `You drink ${potionName}, but no curse is affecting you.`);
      return true;
    }

    const amount = potion.effectAmount;
    if (potion.lastFor > 1) {
      if (target === 'HP' || target === 'Magic') {
        const effectOn = target === 'Magic' ? 'Magic' : 'HP';
        this.playerActiveEffects.update((effects) => [
          ...effects,
          { effectOn, effectAmount: amount, remainingAE: potion.lastFor, sourceName: potionName, behavior: 'tick' },
        ]);
      } else {
        const effectOn =
          target === 'TempHP'
            ? 'HP'
            : target === 'PoisonResistance'
              ? 'Poison Resistance'
              : target;
        this.playerActiveEffects.update((effects) => [
          ...effects,
          { effectOn, effectAmount: amount, remainingAE: potion.lastFor, sourceName: potionName, behavior: 'modifier' },
        ]);

        if (target === 'TempHP') {
          const maxHp = this.getEffectivePlayerMaxHp();
          this.playerHp.set(Math.max(0, Math.min(this.playerHp() + amount, maxHp)));
        }
      }

      this.addCombatLog(`You drink ${potionName}. ${potion.effectTo} ${amount >= 0 ? '+' : ''}${amount} for ${potion.lastFor} AE.`);
      this.previewActionMessage.set(`${potionName}: ${potion.effectTo} ${amount >= 0 ? '+' : ''}${amount} for ${potion.lastFor} AE.`);
      return true;
    }

    const healerBonus = (this.isHealerClass() && amount > 0) ? Math.floor(this.getEffectivePlayerMagicPower() / 2) : 0;
    if (healerBonus > 0) {
      this.addCombatLog(`Healer's touch adds +${healerBonus} to the restoration!`);
    }
    const instantAmount = amount + healerBonus;

    if (target === 'HP' || target === 'TempHP') {
      const currentHp = this.playerHp();
      const maxHp = this.getEffectivePlayerMaxHp();
      const newHp = Math.max(0, Math.min(currentHp + instantAmount, maxHp));
      const change = newHp - currentHp;
      this.playerHp.set(newHp);
      const changeText = change >= 0 ? `restored ${change} HP` : `lost ${Math.abs(change)} HP`;
      this.previewActionMessage.set(`${potionName}: ${changeText}.`);
      this.addCombatLog(`You drink ${potionName} and ${changeText}.`);
      return true;
    }

    if (target === 'Magic') {
      const currentMp = this.playerMp();
      const maxMp = this.getEffectivePlayerMagicPower();
      const newMp = instantAmount > 0
        ? currentMp
        : Math.max(0, Math.min(currentMp + instantAmount, maxMp));
      const change = newMp - currentMp;
      this.playerMp.set(newMp);
      const changeText = instantAmount > 0
        ? 'MP recovery is only available from Rest or End Turn Early'
        : (change >= 0 ? `restored ${change} MP` : `lost ${Math.abs(change)} MP`);
      this.previewActionMessage.set(`${potionName}: ${changeText}.`);
      this.addCombatLog(`You drink ${potionName} and ${changeText}.`);
      return true;
    }

    if (target === 'PoisonResistance') {
      this.playerActiveEffects.update((effects) => [
        ...effects,
        { effectOn: 'Poison Resistance', effectAmount: instantAmount, remainingAE: 1, sourceName: potionName, behavior: 'modifier' },
      ]);
      this.previewActionMessage.set(`${potionName}: Poison Resistance ${instantAmount >= 0 ? '+' : ''}${instantAmount}.`);
      this.addCombatLog(`You drink ${potionName}. Poison Resistance ${instantAmount >= 0 ? '+' : ''}${instantAmount}.`);
      return true;
    }

    this.applyPermanentPlayerSpellEffect(target, instantAmount);
    this.previewActionMessage.set(`${potionName}: ${potion.effectTo} ${amount >= 0 ? '+' : ''}${amount}.`);
    this.addCombatLog(`You drink ${potionName}. ${potion.effectTo} ${amount >= 0 ? '+' : ''}${amount}.`);
    return true;
  }

  drinkTresherInnerPotion(tresherIndex: number, potionId: number): void {
    const inventoryContext = this.getInventoryContextForPreview();
    if (!inventoryContext) return;

    const { dungonId, inventory } = inventoryContext;
    if (tresherIndex < 0 || tresherIndex >= inventory.treshers.length) return;

    if (this.turnPhase() !== 'player' || this.playerHp() <= 0) {
      this.previewActionMessage.set('Potions can only be used during your turn.');
      return;
    }
    if (this.playerAE() < 1) {
      this.previewActionMessage.set('Not enough AE to drink potion.');
      return;
    }

    const potion = this.pcTresherPotionsById().get(potionId);
    if (!potion) return;
    if (this.normalizePotionEffectToPcStat(potion.effectTo) === null) {
      this.previewActionMessage.set(`${potion.name} has no drinkable effect.`);
      return;
    }

    this.removeInnerPotionSlotFromInventoryTresher(dungonId, tresherIndex, potionId);
    this.applyPotionEffectToPlayer(potion);
    this.consumePlayerAE(1, dungonId);
    this.saveGameState();
    if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') {
      this.startMonsterTurns();
    }
  }

  isItemEquipable(type: string, name?: string): boolean {
    return this.inventoryService.isItemEquipable(type) || this.isNecklaceLikeItem(type, name);
  }

  isItemEquippedById(itemId: number): boolean {
    const inventoryContext = this.getInventoryContextForPreview();
    if (!inventoryContext) {
      return false;
    }
    return (this.equippedItemIdsByDungon()[inventoryContext.dungonId] ?? []).includes(itemId);
  }

  toggleItemEquipped(itemId: number): void {
    const inventoryContext = this.getInventoryContextForPreview();
    if (!inventoryContext) {
      return;
    }
    if (this.turnPhase() !== 'player' || this.playerHp() <= 0) {
      this.previewActionMessage.set('You can only equip items during your turn.');
      return;
    }
    if (this.playerAE() < 1) {
      this.previewActionMessage.set('Not enough AE to equip or unequip.');
      return;
    }
    const { dungonId } = inventoryContext;
    const item = this.pcTresherItemsById().get(itemId);
    if (!item) {
      return;
    }
    const itemName = item.name || 'Item';
    const equippedIds = this.equippedItemIdsByDungon()[dungonId] ?? [];
    const prevEffectiveHpMax = this.getEffectivePlayerMaxHp();
    const prevEffectiveMpMax = this.getEffectivePlayerMagicPower();
    const prevEffectiveAEMax = this.getEffectivePlayerMaxAE();
    if (equippedIds.includes(itemId)) {
      this.equippedItemIdsByDungon.update((all) => ({ ...all, [dungonId]: equippedIds.filter((id) => id !== itemId) }));
      this.syncCurrentResourcesAfterEquipChange(prevEffectiveHpMax, prevEffectiveMpMax, prevEffectiveAEMax);
      this.addCombatLog(`${itemName} unequipped.`);
      this.previewActionMessage.set(`${itemName} unequipped.`);
    } else {
      const itemType = this.normalizeItemType(item.type);
      // Weapons use a hand slot — enforce the hand limit before equipping
      if (itemType === 'weapon') {
        const handsNeeded = item.isTwoHanded ? 2 : 1;
        if (this.inventoryHandsUsedForPreview() + handsNeeded > this.maxEquippableHands) {
          const msg = item.isTwoHanded
            ? 'A two-handed weapon requires both hands free.'
            : 'Both hands are full. Unequip a weapon or shield first.';
          this.previewActionMessage.set(msg);
          return;
        }
      }
      // Shield-type armor (no body slot) also occupies 1 hand
      if (itemType === 'armor') {
        const bodyArmorSlots = new Set(['head', 'body', 'left-arm', 'right-arm', 'left-leg', 'right-leg']);
        if (!item.armorSlot || !bodyArmorSlots.has(item.armorSlot)) {
          if (this.inventoryHandsUsedForPreview() + 1 > this.maxEquippableHands) {
            this.previewActionMessage.set('Both hands are full. Unequip a weapon or shield first.');
            return;
          }
        }
      }
      this.equippedItemIdsByDungon.update((all) => ({ ...all, [dungonId]: [...equippedIds, itemId] }));
      this.syncCurrentResourcesAfterEquipChange(prevEffectiveHpMax, prevEffectiveMpMax, prevEffectiveAEMax);
      this.addCombatLog(`${itemName} equipped.`);
      this.previewActionMessage.set(`${itemName} equipped.`);
    }
    this.consumePlayerAE(1, dungonId);
    if (this.playerAE() <= 0) {
      this.startMonsterTurns();
    }
  }

  dropInventoryInnerItem(tresherIndex: number, itemId: number): void {
    const inventoryContext = this.getInventoryContextForPreview();
    if (!inventoryContext) return;
    if (this.turnPhase() !== 'player' || this.playerHp() <= 0) {
      this.previewActionMessage.set('You can only drop items during your turn.');
      return;
    }
    if (this.playerAE() < 1) {
      this.previewActionMessage.set('Not enough AE to drop item.');
      return;
    }
    const { dungonId, inventory } = inventoryContext;
    if (tresherIndex < 0 || tresherIndex >= inventory.treshers.length) return;

    const existingCheater = this.cheaterByDungon()[dungonId] ?? { ...DEFAULT_CHEATER };
    const existingInventory = this.normalizeCheaterInventory(existingCheater.inventory);
    const tresher = existingInventory.treshers[tresherIndex];
    const updatedTresher: Tresher = {
      ...tresher,
      item1Id: tresher.item1Id === itemId ? null : tresher.item1Id,
      item2Id: tresher.item2Id === itemId ? null : tresher.item2Id,
      item3Id: tresher.item3Id === itemId ? null : tresher.item3Id,
      item4Id: tresher.item4Id === itemId ? null : tresher.item4Id,
    };
    const updatedTreshers = existingInventory.treshers.map((t, i) => i === tresherIndex ? updatedTresher : t);

    this.cheaterByDungon.update((allCheaters) => ({
      ...allCheaters,
      [dungonId]: {
        ...existingCheater,
        inventory: { keys: existingInventory.keys, treshers: updatedTreshers },
      },
    }));

    const prevEffectiveHpMax = this.getEffectivePlayerMaxHp();
    const prevEffectiveMpMax = this.getEffectivePlayerMagicPower();
    const prevEffectiveAEMax = this.getEffectivePlayerMaxAE();
    // Unequip the item if it was equipped
    this.equippedItemIdsByDungon.update((all) => ({
      ...all,
      [dungonId]: (all[dungonId] ?? []).filter((id) => id !== itemId),
    }));
    this.syncCurrentResourcesAfterEquipChange(prevEffectiveHpMax, prevEffectiveMpMax, prevEffectiveAEMax);

    const itemName = this.pcTresherItemsById().get(itemId)?.name || 'Item';
    this.previewActionMessage.set(`${itemName} dropped.`);
    this.consumePlayerAE(1, dungonId);
    this.saveGameState();
    if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') {
      this.startMonsterTurns();
    }
  }

  dropCollectedFloorItem(itemId: number): void {
    const preview = this.gridPreviewContext();
    if (!preview) return;
    if (this.turnPhase() !== 'player' || this.playerHp() <= 0) {
      this.previewActionMessage.set('You can only drop items during your turn.');
      return;
    }
    if (this.playerAE() < 1) {
      this.previewActionMessage.set('Not enough AE to drop item.');
      return;
    }
    const { dungonId } = preview;
    const items = this.collectedFloorItemsByDungon()[dungonId] ?? [];
    const item = items.find((it) => it.id === itemId);
    if (!item) return;

    // Remove from collected
    this.collectedFloorItemsByDungon.update((all) => ({
      ...all,
      [dungonId]: (all[dungonId] ?? []).filter((it) => it.id !== itemId),
    }));

    const prevEffectiveHpMax = this.getEffectivePlayerMaxHp();
    const prevEffectiveMpMax = this.getEffectivePlayerMagicPower();
    const prevEffectiveAEMax = this.getEffectivePlayerMaxAE();
    // Unequip if equipped
    this.equippedItemIdsByDungon.update((all) => ({
      ...all,
      [dungonId]: (all[dungonId] ?? []).filter((id) => id !== itemId),
    }));
    this.syncCurrentResourcesAfterEquipChange(prevEffectiveHpMax, prevEffectiveMpMax, prevEffectiveAEMax);

    // Place back on current floor square
    this.floorItemPlacementsByDungon.update((all) => ({
      ...all,
      [dungonId]: [...(all[dungonId] ?? []), { itemId, row: preview.centerRow, column: preview.centerColumn }],
    }));

    this.previewActionMessage.set(`${item.name || 'Item'} dropped on the floor.`);
    this.consumePlayerAE(1, dungonId);
    this.drawPreviewGridCanvas();
    this.saveGameState();
    if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') {
      this.startMonsterTurns();
    }
  }

  dropBackpackItem(item: BackpackItemEntry): void {
    if (item.source === 'tresher' && item.tresherIdx !== undefined) {
      this.dropInventoryInnerItem(item.tresherIdx, item.id);
    } else {
      this.dropCollectedFloorItem(item.id);
    }
  }

  drinkCollectedFloorPotion(potionId: number): void {
    const preview = this.gridPreviewContext();
    if (!preview) return;
    const { dungonId } = preview;

    if (this.turnPhase() !== 'player' || this.playerHp() <= 0) {
      this.previewActionMessage.set('Potions can only be used during your turn.');
      return;
    }
    if (this.playerAE() < 1) {
      this.previewActionMessage.set('Not enough AE to drink potion.');
      return;
    }

    const potions = this.collectedFloorPotionsByDungon()[dungonId] ?? [];
    const potion = potions.find((p) => p.id === potionId);
    if (!potion) return;
    if (this.normalizePotionEffectToPcStat(potion.effectTo) === null) {
      this.previewActionMessage.set(`${potion.name || 'Potion'} has no drinkable effect.`);
      return;
    }

    // Remove from collected (consume one)
    const potionIdx = potions.findIndex((p) => p.id === potionId);
    this.collectedFloorPotionsByDungon.update((all) => ({
      ...all,
      [dungonId]: (all[dungonId] ?? []).filter((_, i) => i !== potionIdx),
    }));

    this.applyPotionEffectToPlayer(potion);
    this.consumePlayerAE(1, dungonId);
    this.saveGameState();
    if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') {
      this.startMonsterTurns();
    }
  }

  isOtherItemUsable(item: { type?: string; uses?: number | null }): boolean {
    return item.type === 'other' && typeof item.uses === 'number' && item.uses > 0;
  }

  useCollectedOtherItem(itemId: number): void {
    const preview = this.gridPreviewContext();
    if (!preview) return;
    const { dungonId } = preview;

    if (this.turnPhase() !== 'player' || this.playerHp() <= 0) {
      this.previewActionMessage.set('Items can only be used during your turn.');
      return;
    }
    if (this.playerAE() < 1) {
      this.previewActionMessage.set('Not enough AE to use item.');
      return;
    }

    const items = this.collectedFloorItemsByDungon()[dungonId] ?? [];
    const item = items.find((it) => it.id === itemId);
    if (!item) return;

    const itemRange = Math.max(1, item.range ?? 1);
    const target = this.getTargetMonster(dungonId, preview.centerRow, preview.centerColumn, itemRange);
    if (!target) {
      this.previewActionMessage.set(`No target in range (${itemRange}) for ${item.name || 'item'}. Click a monster to target it.`);
      return;
    }

    // Consume one use or remove if last use
    if (typeof item.uses === 'number') {
      const newUses = item.uses - 1;
      this.collectedFloorItemsByDungon.update((all) => {
        const current = all[dungonId] ?? [];
        const updated = newUses <= 0
          ? current.filter((it) => it.id !== itemId)
          : current.map((it) => it.id === itemId ? { ...it, uses: newUses } : it);
        return { ...all, [dungonId]: updated };
      });
    }

    // Roll to hit: d12 + effectValue (item's +toHit bonus) + player stamina
    const itemToHit = typeof item.effectValue === 'number' ? item.effectValue : 0;
    const attackDistance = this.getSquareDistance(preview.centerRow, preview.centerColumn, target.row, target.column);
    const rangerHitBonus = this.getRangerRangedHitBonusAtDistance(attackDistance);
    const rangerDexToHitBonus = this.isRangerClass() ? Math.floor(this.getEffectivePlayerDexterity() / 2) : 0;
    const hitRoll = this.rollD12(itemToHit + this.getEffectivePlayerStamina() + rangerHitBonus + rangerDexToHitBonus);
    const template = this.getMonstersByIdForDungon(dungonId).get(target.monsterId);
    const monsterAC = template ? this.getEffectiveMonsterAC(target, template) : 10;

    if (hitRoll >= monsterAC) {
      const diceSize = Math.max(4, item.damage ?? 6);
      const rangerDamageBonus = this.getRangerFavoredTypeDamageBonus(template ?? null);
      const rangerStrDamageBonus = this.isRangerClass() ? Math.floor(this.getEffectivePlayerStrength() / 2) : 0;
      let damage = Math.max(1, this.randomInt(1, diceSize) + this.getEffectivePlayerStrength() + rangerDamageBonus + rangerStrDamageBonus);
      if (template && getMonsterTypeCombatModifiers(template.type).resistsNonMagicWeapons) {
        damage = Math.max(1, Math.floor(damage / 2));
        this.addCombatLog(`${template.name} resists non-magical damage!`);
      }
      target.currentHp -= damage;
      if (!target.npcIsHostile) target.npcIsHostile = true;
      this.triggerWeaponMonsterImpact(target.row, target.column, 'Blood', '#cc0000', item.name ?? '', attackDistance);
      this.addCombatLog(`You throw ${item.name || 'item'} at ${template?.name ?? 'monster'} for ${damage} dmg! (rolled ${hitRoll} vs AC ${monsterAC})`);
      if (target.currentHp <= 0) {
        target.isDead = true;
        target.currentHp = 0;
        this.addCombatLog(`${template?.name ?? 'Monster'} is dead!`);
        this.selectedCombatTarget.set(null);
        this.comboTracker.set(null);
        this.dropMonsterLoot(dungonId, target, template ?? null);
        const spGain = template?.spReward ?? 0;
        if (spGain > 0) {
          this.playerSp.update((s) => s + spGain);
          this.addCombatLog(`+${spGain} SP!`);
          this.awardSpToPC(spGain);
        }
      }
      this.monsterInstances.update((arr) => [...arr]);
    } else {
      this.addCombatLog(`You throw ${item.name || 'item'} at ${template?.name ?? 'monster'} but miss! (rolled ${hitRoll} vs AC ${monsterAC})`);
    }

    this.consumePlayerAE(1, dungonId);
    this.drawPreviewGridCanvas();
    this.saveGameState();
    if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') {
      this.startMonsterTurns();
    }
  }

  useScroll(itemId: number): void {
    const preview = this.gridPreviewContext();
    if (!preview) return;
    const { dungonId } = preview;

    if (this.turnPhase() !== 'player' || this.playerHp() <= 0) {
      this.previewActionMessage.set('Scrolls can only be read during your turn.');
      return;
    }
    if (this.playerAE() < 1) {
      this.previewActionMessage.set('Not enough AE to read scroll.');
      return;
    }

    const items = this.collectedFloorItemsByDungon()[dungonId] ?? [];
    const item = items.find((it) => it.id === itemId);
    if (!item) return;

    const spell = typeof item.scrollSpellId === 'number' ? this.pcTresherSpellsById().get(item.scrollSpellId) : undefined;
    if (!spell) {
      this.previewActionMessage.set(`${item.name || 'Scroll'} is inscribed with unreadable magic.`);
      return;
    }

    const minMind = item.minMindToRead ?? 0;
    if (this.getEffectivePlayerMind() < minMind) {
      this.addCombatLog(`You can't decipher ${item.name || 'the scroll'} — requires ${minMind} Mind.`);
      return;
    }

    const mpCost = Math.max(1, item.magicCost ?? spell.magicCost ?? 1);
    if (this.playerMp() < mpCost) {
      this.addCombatLog(`Not enough MP to read ${item.name || 'scroll'}. Need ${mpCost} MP.`);
      return;
    }

    const effectSlots = this.getSpellEffectSlots(spell);
    if (effectSlots.length === 0) {
      this.addCombatLog(`${spell.name} has no configured effects.`);
      return;
    }

    const targetKind = this.getSpellTargetKind(spell);
    const spellFlavor = this.formatSpellFlavor(spell);

    const consumeScroll = (): void => {
      const newUses = (item.uses ?? 1) - 1;
      this.collectedFloorItemsByDungon.update((all) => {
        const current = all[dungonId] ?? [];
        const updated = newUses <= 0
          ? current.filter((it) => it.id !== itemId)
          : current.map((it) => (it.id === itemId ? { ...it, uses: newUses } : it));
        return { ...all, [dungonId]: updated };
      });
    };

    const finishTurn = (): void => {
      this.consumePlayerAE(1, dungonId);
      this.spendSpellMpWithDoxCheck(dungonId, preview.centerRow, preview.centerColumn, mpCost);
      this.drawPreviewGridCanvas();
      this.saveGameState();
      if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') {
        this.startMonsterTurns();
      }
    };

    if (targetKind === 'trap') {
      const maxTrapRange = this.getSpellMaxMonsterRange(spell);
      const targetTrap = this.getTargetFloorTrap(dungonId, preview.centerRow, preview.centerColumn, maxTrapRange);
      if (!targetTrap) {
        this.previewActionMessage.set(`No trap in range (${maxTrapRange}) for ${item.name || 'scroll'}.`);
        return;
      }
      this.playSpellSound(spell);
      consumeScroll();
      this.addCombatLog(`You read ${item.name || spell.name}${spellFlavor}.`);
      this.tryDisarmTrapTarget(targetTrap, spell, spellFlavor);
      finishTurn();
      return;
    }

    if (targetKind === 'pc' || !this.hasMonsterTargetEffect(spell)) {
      this.playSpellSound(spell);
      consumeScroll();
      this.addCombatLog(`You read ${item.name || spell.name}${spellFlavor}.`);
      for (const slot of effectSlots) {
        this.applySpellEffectToPlayer(spell, slot, spellFlavor);
      }
      finishTurn();
      return;
    }

    const maxMonsterRange = this.getSpellMaxMonsterRange(spell);
    const target = this.getTargetMonster(dungonId, preview.centerRow, preview.centerColumn, maxMonsterRange);
    if (!target) {
      this.previewActionMessage.set(`No target in range (${maxMonsterRange}) for ${item.name || 'scroll'}. Click a monster to target it.`);
      return;
    }

    this.playSpellSound(spell);
    consumeScroll();

    const template = this.getMonstersByIdForDungon(dungonId).get(target.monsterId);
    const monsterName = template?.name ?? 'monster';
    const magicResistance = template ? this.getEffectiveMonsterMagicResistance(target, template) : 0;
    const dist = this.getSquareDistance(preview.centerRow, preview.centerColumn, target.row, target.column);
    const rangerHitBonus = this.getRangerRangedHitBonusAtDistance(dist);
    const spellCastBonus = this.getEffectivePlayerMind() + this.getSpellCastingClassModifier() + rangerHitBonus;
    const roll = this.rollD12(spellCastBonus);
    const dc = spell.successTestValue + magicResistance;
    this.addCombatLog(`Read ${item.name || spell.name}${spellFlavor} — rolled ${roll} (1d12${this.formatSignedModifier(spellCastBonus)}) vs DC ${dc} (TN ${spell.successTestValue} + MR ${magicResistance}).`);

    if (roll >= dc) {
      const hasRangedMonsterHit = effectSlots.some((slot) => slot.targetType === 'monster' && slot.effectOn === 'HP' && slot.range > 1 && dist > 1 && dist <= slot.range);
      if (hasRangedMonsterHit) {
        this.triggerSpellBeam(preview.centerRow, preview.centerColumn, target.row, target.column, true);
      }
      for (const slot of effectSlots) {
        if (slot.targetType === 'pc') {
          this.applySpellEffectToPlayer(spell, slot, spellFlavor);
          continue;
        }
        if (slot.targetType !== 'monster') continue;
        if (dist > slot.range) {
          this.addCombatLog(`${spell.name}${spellFlavor} ${slot.effectOn} effect is out of range (${slot.range}).`);
          continue;
        }
        if (target.isDead) break;
        this.applySpellEffectToMonster(spell, slot, target, monsterName, magicResistance, spellFlavor, dungonId, template ?? null, false);
      }
      this.monsterInstances.update((arr) => [...arr]);
    } else {
      this.addCombatLog(`${spell.name}${spellFlavor} fizzles — ${monsterName} resists!`);
    }

    finishTurn();
  }

  nearbyItemsForPreview(): NearbyDiscoveryItem[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    const currentRow = preview.centerRow;
    const currentColumn = preview.centerColumn;
    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const displayDirection = this.getDisplayedFacingDirection(preview.dungonId, cheater.facingDir);
    const forward = this.getMovementDeltaForDisplayFacingDirection(displayDirection);
    const targetRow = currentRow + forward.rowOffset;
    const targetColumn = currentColumn + forward.columnOffset;
    const hasValidTargetSquare =
      targetRow >= 0 &&
      targetColumn >= 0 &&
      targetRow < this.gridRowCount &&
      targetColumn < this.gridColumnCount;
    const isRelevantSquare = (row: number, column: number): boolean =>
      (row === currentRow && column === currentColumn) ||
      (hasValidTargetSquare && row === targetRow && column === targetColumn);

    const items: NearbyDiscoveryItem[] = [];

    for (const key of this.keyList) {
      if (key.rownId === null || key.columnId === null) {
        continue;
      }

      if (!isRelevantSquare(key.rownId, key.columnId)) {
        continue;
      }

      items.push({
        kind: 'Key',
        name: key.name.trim() || 'Unnamed Key',
        description: key.description.trim() || 'No description.',
        row: key.rownId,
        column: key.columnId,
      });
    }

    const treshersById = this.getTreshersByIdForDungon(preview.dungonId);
    for (const placement of this.tresherPlacementsByDungon()[preview.dungonId] ?? []) {
      if (!isRelevantSquare(placement.row, placement.column)) {
        continue;
      }

      const tresher = treshersById.get(placement.tresherId);
      if (!tresher) {
        continue;
      }

      items.push({
        kind: 'Tresher',
        name: tresher.name.trim() || 'Unnamed Tresher',
        description: tresher.description.trim() || 'No description.',
        row: placement.row,
        column: placement.column,
      });
    }

    const monstersById = this.getMonstersByIdForDungon(preview.dungonId);
    const liveInstances = this.monsterInstances().filter((m) => !m.isDead);
    const frontSquareBlocked = hasValidTargetSquare &&
      (() => {
        const conn = this.getMovementConnectionInfoBetweenAdjacentSquares(
          preview.dungonId, currentRow, currentColumn, targetRow, targetColumn
        );
        return conn.type === 'closedDoor' || conn.type === 'wall';
      })();
    for (const inst of liveInstances) {
      const isInCurrentSquare = inst.row === currentRow && inst.column === currentColumn;
      const isInFrontSquare = hasValidTargetSquare && inst.row === targetRow && inst.column === targetColumn;
      if (!isInCurrentSquare && (!isInFrontSquare || frontSquareBlocked)) {
        continue;
      }

      const monster = monstersById.get(inst.monsterId);
      if (!monster) {
        continue;
      }

      const roamText = inst.roam ? ' (roaming)' : '';
      items.push({
        kind: 'Monster',
        name: (monster.name.trim() || 'Unnamed Monster') + roamText,
        description: monster.description.trim() || 'No description.',
        row: inst.row,
        column: inst.column,
      });
    }

    const facingWallSides = this.getFacingWallSides(displayDirection);

    for (const st of this.squareTextsByDungon()[preview.dungonId] ?? []) {
      const isCurrentSquare = st.row === currentRow && st.column === currentColumn;
      const isTargetSquare = hasValidTargetSquare && st.row === targetRow && st.column === targetColumn;

      if (isCurrentSquare) {
        if (!st.wallSide) {
          // Floor text — show when standing on this square
          items.push({
            kind: 'Text',
            name: 'Message',
            description: st.text,
            row: st.row,
            column: st.column,
          });
        } else if (facingWallSides.includes(st.wallSide)) {
          // Wall note — show when facing this wall
          items.push({
            kind: 'Text',
            name: 'Wall Note',
            description: st.text,
            row: st.row,
            column: st.column,
          });
        }
      } else if (isTargetSquare && st.wallSide) {
        // Wall note on the adjacent facing square pointing back toward us
        const oppositeWall = this.oppositeWallSide(st.wallSide);
        if (facingWallSides.includes(oppositeWall)) {
          items.push({
            kind: 'Text',
            name: 'Wall Note',
            description: st.text,
            row: st.row,
            column: st.column,
          });
        }
      }
    }

    const floorItemsById = new Map(
      (this.floorItemListByDungon()[preview.dungonId] ?? []).map((it) => [it.id, it])
    );
    for (const placement of this.floorItemPlacementsByDungon()[preview.dungonId] ?? []) {
      if (!isRelevantSquare(placement.row, placement.column)) continue;
      const item = floorItemsById.get(placement.itemId);
      if (!item) continue;
      items.push({
        kind: 'Item',
        name: item.name.trim() || 'Unnamed Item',
        description: item.description.trim() || 'No description.',
        row: placement.row,
        column: placement.column,
      });
    }

    const floorPotionsById = new Map(
      (this.floorPotionListByDungon()[preview.dungonId] ?? []).map((p) => [p.id, p])
    );
    for (const placement of this.floorPotionPlacementsByDungon()[preview.dungonId] ?? []) {
      if (!isRelevantSquare(placement.row, placement.column)) continue;
      const potion = floorPotionsById.get(placement.potionId);
      if (!potion) continue;
      items.push({
        kind: 'Potion',
        name: potion.name.trim() || 'Unnamed Potion',
        description: potion.description.trim() || 'No description.',
        row: placement.row,
        column: placement.column,
      });
    }

    for (const placement of this.floorSpellPlacementsByDungon()[preview.dungonId] ?? []) {
      if (!isRelevantSquare(placement.row, placement.column)) continue;
      const spell = this.resolveSpellData(preview.dungonId, placement.spellId);
      if (!spell) continue;
      items.push({
        kind: 'Spell',
        name: spell.name.trim() || 'Unnamed Spell',
        description: spell.description.trim() || 'No description.',
        row: placement.row,
        column: placement.column,
      });
    }

    this.obstacleImageCacheVersion();
    for (const obs of this.obstaclePlacementsByDungon()[preview.dungonId] ?? []) {
      if (obs.isDestroyed) continue;
      if (!isRelevantSquare(obs.row, obs.column)) continue;
      const hpNote = obs.isIndestructible ? ' (Indestructible)' : ` (HP: ${obs.currentHp ?? obs.hp}/${obs.hp})`;
      items.push({
        kind: 'Obstacle',
        name: obs.name || 'Obstacle',
        description: hpNote,
        row: obs.row,
        column: obs.column,
      });
      // Obstacle notes are shown inside the obstacle info box — do not add a separate Text item here.
    }

    return items.sort((left, right) => {
      const leftDistance =
        Math.abs(left.row - currentRow) + Math.abs(left.column - currentColumn);
      const rightDistance =
        Math.abs(right.row - currentRow) + Math.abs(right.column - currentColumn);

      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }

      if (left.kind !== right.kind) {
        return left.kind.localeCompare(right.kind);
      }

      if (left.row !== right.row) {
        return left.row - right.row;
      }

      return left.column - right.column;
    });
  }

  nearbyDoorsForPreview(): NearbyDoorInfo[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    const row = preview.centerRow;
    const col = preview.centerColumn;
    const squares = this.squaresByDungon()[preview.dungonId] ?? {};
    const inventoryKeys = this.inventoryKeysForPreview();

    const cardinalChecks: {
      side: SquareSide;
      neighborSide: SquareSide;
      dr: number;
      dc: number;
      label: string;
    }[] = [
      { side: 'toTop', neighborSide: 'toBottom', dr: -1, dc: 0, label: 'North' },
      { side: 'toRight', neighborSide: 'toLeft', dr: 0, dc: 1, label: 'East' },
      { side: 'toBottom', neighborSide: 'toTop', dr: 1, dc: 0, label: 'South' },
      { side: 'toLeft', neighborSide: 'toRight', dr: 0, dc: -1, label: 'West' },
    ];

    const doors: NearbyDoorInfo[] = [];
    const seenDoorIds = new Set<number>();
    const squareKey = this.getSquareKey(row, col);
    const currentSquare = squares[squareKey];
    if (!currentSquare) {
      return [];
    }

    for (const check of cardinalChecks) {
      const connection = currentSquare[check.side];
      if (!this.isDoorConnection(connection)) {
        continue;
      }
      if (connection.isHidden && !connection.isFound) {
        continue;
      }
      if (seenDoorIds.has(connection.id)) {
        continue;
      }
      seenDoorIds.add(connection.id);

      const neighborKey = this.getSquareKey(row + check.dr, col + check.dc);
      const allowedSide = connection.oneWay && connection.openDirection
        ? (`to${connection.openDirection.charAt(0).toUpperCase()}${connection.openDirection.slice(1)}` as SquareSide)
        : null;
      const isOneWayBlocked = allowedSide !== null && check.side !== allowedSide;
      const canOpen = !isOneWayBlocked && !connection.isLocked && connection.state === 'closed';
      let canUnlock = false;
      let matchingKeyIndex: number | null = null;
      let canPick = false;

      if (!isOneWayBlocked && connection.isLocked && connection.state === 'closed' && connection.keyLock) {
        const keyIdx = inventoryKeys.findIndex(
          (k) => k.doorId === connection.id || k.id === connection.keyLock!.id
        );
        if (keyIdx !== -1) {
          canUnlock = true;
          matchingKeyIndex = keyIdx;
        }
      }

      if (!isOneWayBlocked && connection.isLocked && connection.state === 'closed' && !canUnlock && (connection.toPick ?? 0) > 0) {
        canPick = true;
      }

      const itemReq = connection.itemRequirement ?? null;
      const canPassWithItem = !!(itemReq && !isOneWayBlocked && connection.state === 'closed' && this.playerHasItem(itemReq.itemId));

      doors.push({
        door: connection,
        squareKey,
        side: check.side,
        neighborSquareKey: neighborKey,
        neighborSide: check.neighborSide,
        direction: check.label,
        canOpen,
        canUnlock,
        canPick,
        matchingKeyIndex,
        canPassWithItem,
        isOneWayBlocked,
      });
    }

    return doors;
  }

  openAdjacentDoor(doorInfo: NearbyDoorInfo): void {
    if (!doorInfo.canOpen) {
      return;
    }
    const preview = this.gridPreviewContext();
    if (!preview) {
      return;
    }
    if (this.turnPhase() !== 'player' || this.playerHp() <= 0 || this.playerAE() < 1) {
      this.previewActionMessage.set('Not enough AE to open door.');
      return;
    }
    this.setDoorState(preview.dungonId, doorInfo, 'open');
    this.playDoorOpenClickSound();
    this.previewActionMessage.set(`You open the ${doorInfo.door.name || 'door'} to the ${doorInfo.direction}.`);
    this.consumePlayerAE(1, preview.dungonId);
    this.drawPreviewGridCanvas();
    this.drawFirstPersonViewCanvas();
    if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') {
      this.startMonsterTurns();
    }
  }

  closeAdjacentDoor(doorInfo: NearbyDoorInfo): void {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return;
    }
    this.setDoorState(preview.dungonId, doorInfo, 'closed');
    this.previewActionMessage.set(`You close the ${doorInfo.door.name || 'door'} to the ${doorInfo.direction}.`);
    this.drawPreviewGridCanvas();
    this.drawFirstPersonViewCanvas();
  }

  useItemToOpenDoor(doorInfo: NearbyDoorInfo): void {
    if (!doorInfo.canPassWithItem) return;
    const preview = this.gridPreviewContext();
    if (!preview) return;
    if (this.turnPhase() !== 'player' || this.playerHp() <= 0 || this.playerAE() < 1) {
      this.previewActionMessage.set('Not enough AE to open door.');
      return;
    }
    const req = doorInfo.door.itemRequirement;
    if (!req) return;
    if (req.consume) {
      this.removeItemFromInventory(preview.dungonId, req.itemId);
    }
    this.setDoorState(preview.dungonId, doorInfo, 'open');
    this.playDoorOpenClickSound();
    const doorName = doorInfo.door.name || 'door';
    const consumed = req.consume ? ` You gave up the ${req.itemName}.` : '';
    this.previewActionMessage.set(`You use the ${req.itemName} to open the ${doorName}.${consumed}`);
    this.consumePlayerAE(1, preview.dungonId);
    this.drawPreviewGridCanvas();
    this.drawFirstPersonViewCanvas();
    if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') {
      this.startMonsterTurns();
    }
  }

  private playerHasItem(itemId: number): boolean {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return false;
    }

    return this.playerHasItemInDungon(preview.dungonId, itemId);
  }

  private playerHasItemInDungon(dungonId: number, itemId: number): boolean {
    const cheater = this.cheaterByDungon()[dungonId];
    const inv = this.normalizeCheaterInventory(cheater?.inventory);
    const hasInTreshers = inv.treshers.some(
      (t) => t.item1Id === itemId || t.item2Id === itemId || t.item3Id === itemId || t.item4Id === itemId
    );
    if (hasInTreshers) {
      return true;
    }

    const collectedItems = this.collectedFloorItemsByDungon()[dungonId] ?? [];
    return collectedItems.some((item) => item.id === itemId);
  }

  private removeItemFromInventory(dungonId: number, itemId: number): void {
    const existingCheater = this.cheaterByDungon()[dungonId];
    if (!existingCheater) return;
    const inv = this.normalizeCheaterInventory(existingCheater.inventory);
    let removed = false;
    const updatedTreshers = inv.treshers.map((t) => {
      if (removed) return t;
      const slot = t.item1Id === itemId ? 'item1Id'
        : t.item2Id === itemId ? 'item2Id'
        : t.item3Id === itemId ? 'item3Id'
        : t.item4Id === itemId ? 'item4Id'
        : null;
      if (!slot) return t;
      removed = true;
      return { ...t, [slot]: null };
    });
    this.cheaterByDungon.update((all) => ({
      ...all,
      [dungonId]: { ...existingCheater, inventory: { keys: inv.keys, treshers: updatedTreshers } },
    }));

    if (!removed) {
      const collected = this.collectedFloorItemsByDungon()[dungonId] ?? [];
      const collectedIndex = collected.findIndex((item) => item.id === itemId);
      if (collectedIndex >= 0) {
        this.collectedFloorItemsByDungon.update((all) => ({
          ...all,
          [dungonId]: (all[dungonId] ?? []).filter((_, index) => index !== collectedIndex),
        }));
        removed = true;
      }
    }

    if (removed && !this.playerHasItemInDungon(dungonId, itemId)) {
      this.equippedItemIdsByDungon.update((all) => ({
        ...all,
        [dungonId]: (all[dungonId] ?? []).filter((id) => id !== itemId),
      }));
    }
  }

  unlockAdjacentDoor(doorInfo: NearbyDoorInfo): void {
    if (!doorInfo.canUnlock || doorInfo.matchingKeyIndex === null) {
      return;
    }
    const preview = this.gridPreviewContext();
    if (!preview) {
      return;
    }
    if (this.turnPhase() !== 'player' || this.playerHp() <= 0 || this.playerAE() < 1) {
      this.previewActionMessage.set('Not enough AE to unlock door.');
      return;
    }

    const inventoryKeys = this.inventoryKeysForPreview();
    const key = inventoryKeys[doorInfo.matchingKeyIndex];

    this.setDoorLocked(preview.dungonId, doorInfo, false);
    this.previewActionMessage.set(
      `You use ${key.name || 'the key'} to unlock the ${doorInfo.door.name || 'door'} to the ${doorInfo.direction}.`
    );
    this.consumePlayerAE(1, preview.dungonId);
    this.drawPreviewGridCanvas();
    this.drawFirstPersonViewCanvas();
    if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') {
      this.startMonsterTurns();
    }
  }

  private setDoorState(dungonId: number, doorInfo: NearbyDoorInfo, state: Door['state']): void {
    this.squaresByDungon.update((allSquares) => {
      const squares = { ...(allSquares[dungonId] ?? {}) };

      const sq = squares[doorInfo.squareKey];
      if (sq) {
        const connection = sq[doorInfo.side];
        if (this.isDoorConnection(connection)) {
          const updatedDoor = { ...connection, state };
          squares[doorInfo.squareKey] = this.withSquareSide(sq, doorInfo.side, updatedDoor);

          const neighborSq = squares[doorInfo.neighborSquareKey];
          if (neighborSq) {
            squares[doorInfo.neighborSquareKey] = this.withSquareSide(
              neighborSq,
              doorInfo.neighborSide,
              updatedDoor
            );
          }
        }
      }

      return { ...allSquares, [dungonId]: squares };
    });
  }

  private setDoorLocked(dungonId: number, doorInfo: NearbyDoorInfo, isLocked: boolean): void {
    this.squaresByDungon.update((allSquares) => {
      const squares = { ...(allSquares[dungonId] ?? {}) };

      const sq = squares[doorInfo.squareKey];
      if (sq) {
        const connection = sq[doorInfo.side];
        if (this.isDoorConnection(connection)) {
          const updatedDoor = { ...connection, isLocked };
          squares[doorInfo.squareKey] = this.withSquareSide(sq, doorInfo.side, updatedDoor);

          const neighborSq = squares[doorInfo.neighborSquareKey];
          if (neighborSq) {
            squares[doorInfo.neighborSquareKey] = this.withSquareSide(
              neighborSq,
              doorInfo.neighborSide,
              updatedDoor
            );
          }
        }
      }

      return { ...allSquares, [dungonId]: squares };
    });
  }

  private setDoorFound(
    dungonId: number,
    squareKey: string,
    side: SquareSide,
    neighborSquareKey: string,
    neighborSide: SquareSide
  ): void {
    this.squaresByDungon.update((allSquares) => {
      const squares = { ...(allSquares[dungonId] ?? {}) };
      const sq = squares[squareKey];
      if (sq) {
        const connection = sq[side];
        if (this.isDoorConnection(connection)) {
          const updatedDoor = { ...connection, isFound: true };
          squares[squareKey] = this.withSquareSide(sq, side, updatedDoor);
          const neighborSq = squares[neighborSquareKey];
          if (neighborSq) {
            squares[neighborSquareKey] = this.withSquareSide(neighborSq, neighborSide, updatedDoor);
          }
        }
      }
      return { ...allSquares, [dungonId]: squares };
    });
  }

  hasCurrentSquarePickupItems(): boolean {
    return this.currentSquarePickupItemsForPreview().length > 0;
  }

  canTakeSomeFromCurrentSquare(): boolean {
    const current = this.getCurrentPreviewSquareContext();
    if (!current) {
      return false;
    }

    return this.getTresherPlacementsAtSquare(current.dungonId, current.row, current.column).length > 1;
  }

  pickLockDoor(doorInfo: NearbyDoorInfo): void {
    if (!doorInfo.canPick) return;
    const preview = this.gridPreviewContext();
    if (!preview) return;
    if (this.turnPhase() !== 'player' || this.playerHp() <= 0 || this.playerAE() < 1) {
      this.previewActionMessage.set('Not enough AE to pick lock.');
      return;
    }
    const dc = doorInfo.door.toPick ?? 10;
    const thiephDexBonus = this.isThiephClass() ? Math.floor(this.getEffectivePlayerDexterity() / 2) : 0;
    const roll = this.randomInt(1, 12) + this.getEffectivePlayerMind() + thiephDexBonus;
    const doorName = doorInfo.door.name || 'door';
    if (roll >= dc) {
      this.setDoorLocked(preview.dungonId, doorInfo, false);
      this.previewActionMessage.set(`You pick the lock on the ${doorName} (rolled ${roll} vs DC ${dc}). Door unlocked!`);
      this.addCombatLog(`Pick lock: rolled ${roll} vs DC ${dc}. Success.`);
    } else {
      this.previewActionMessage.set(`Failed to pick the lock on the ${doorName} (rolled ${roll} vs DC ${dc}).`);
      this.addCombatLog(`Pick lock: rolled ${roll} vs DC ${dc}. Failed.`);
      if (doorInfo.door.trap) {
        this.triggerTrap(doorInfo.door.trap);
      }
    }
    this.consumePlayerAE(1, preview.dungonId);
    this.saveGameState();
    this.drawPreviewGridCanvas();
    this.drawFirstPersonViewCanvas();
    if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') {
      this.startMonsterTurns();
    }
  }

  searchForTraps(): void {
    if (!this.canSearch()) return;
    const current = this.getCurrentPreviewSquareContext();
    if (!current) return;

    this.consumePlayerAE(1, current.dungonId);
    this.playerSearchesThisTurn.update((n) => n + 1);

    const isThieph = this.isThiephClass();
    const thiephAwarenessBonus = isThieph ? Math.floor(this.getEffectivePlayerAwareness() / 2) : 0;
    const mindBonus = this.getEffectivePlayerMind() + thiephAwarenessBonus;
    let mindRoll: number;
    if (isThieph) {
      const roll1 = this.randomInt(1, 12) + mindBonus;
      const roll2 = this.randomInt(1, 12) + mindBonus;
      mindRoll = Math.max(roll1, roll2);
      this.addCombatLog('Search (advantage, +' + thiephAwarenessBonus + ' AW): rolled ' + roll1 + ' and ' + roll2 + ', kept ' + mindRoll + '.');
    } else {
      mindRoll = this.randomInt(1, 12) + mindBonus;
      this.addCombatLog('Search — rolled ' + mindRoll + ' (1d12+' + mindBonus + ').');
    }

    // Check floor traps at current square
    const floorTraps = (this.floorTrapPlacementsByDungon()[current.dungonId] ?? [])
      .filter(p => p.row === current.row && p.column === current.column && !p.isTriggered && !p.isDisarmed);
    for (const fp of floorTraps) {
      if (mindRoll >= fp.trap.toDetect) {
        this.foundTrap.set({ trap: fp.trap, source: 'floor', floorTrapId: fp.id });
        this.previewActionMessage.set(`You find a floor trap: ${fp.trap.name || 'Unknown Trap'} (rolled ${mindRoll} vs DC ${fp.trap.toDetect}).${this.getTrapCrossingHintText(fp.trap)}`);
        // Mark the trap as detected so it shows on the map
        this.floorTrapPlacementsByDungon.update(all => ({
          ...all,
          [current.dungonId]: (all[current.dungonId] ?? []).map(p =>
            p.id === fp.id ? { ...p, isDetected: true } : p
          )
        }));
        this.saveGameState();
        if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') this.startMonsterTurns();
        return;
      }
    }

    // Check floor traps in adjacent squares (one cell away through open/door connections)
    const filledSquares = this.filledSquaresByDungon()[current.dungonId] ?? {};
    const adjacentChecks: Array<{ dr: number; dc: number; label: string }> = [
      { dr: -1, dc: 0, label: 'North' },
      { dr: 0, dc: 1, label: 'East' },
      { dr: 1, dc: 0, label: 'South' },
      { dr: 0, dc: -1, label: 'West' },
    ];
    for (const adj of adjacentChecks) {
      const adjRow = current.row + adj.dr;
      const adjCol = current.column + adj.dc;
      const adjKey = this.getSquareKey(adjRow, adjCol);
      if (!filledSquares[adjKey]) continue;
      // Only search through traversable connections — not solid walls or hidden undiscovered doors
      const blockType = this.getMovementBlockTypeBetweenAdjacentSquares(
        current.dungonId, current.row, current.column, adjRow, adjCol
      );
      if (blockType === 'wall') continue;
      const adjFloorTraps = (this.floorTrapPlacementsByDungon()[current.dungonId] ?? [])
        .filter(p => p.row === adjRow && p.column === adjCol && !p.isTriggered && !p.isDisarmed);
      for (const fp of adjFloorTraps) {
        if (mindRoll >= fp.trap.toDetect) {
          this.foundTrap.set({ trap: fp.trap, source: 'floor', floorTrapId: fp.id, adjacentRow: adjRow, adjacentColumn: adjCol });
          this.previewActionMessage.set(`You find a floor trap to the ${adj.label}: ${fp.trap.name || 'Unknown Trap'} (rolled ${mindRoll} vs DC ${fp.trap.toDetect}).${this.getTrapCrossingHintText(fp.trap)}`);
          // Mark the trap as detected so it shows on the map
          this.floorTrapPlacementsByDungon.update(all => ({
            ...all,
            [current.dungonId]: (all[current.dungonId] ?? []).map(p =>
              p.id === fp.id ? { ...p, isDetected: true } : p
            )
          }));
          this.saveGameState();
          if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') this.startMonsterTurns();
          return;
        }
      }
    }

    // Check obstacle traps at current square
    const obstaclesAtCurrentSquare = (this.obstaclePlacementsByDungon()[current.dungonId] ?? []).filter(
      (obs) =>
        obs.row === current.row &&
        obs.column === current.column &&
        obs.trap !== null &&
        !obs.isDestroyed &&
        !obs.isTrapDisarmed
    );
    for (const obstacle of obstaclesAtCurrentSquare) {
      if (mindRoll >= obstacle.trap!.toDetect) {
        this.foundTrap.set({ trap: obstacle.trap!, source: 'obstacle', obstacleId: obstacle.id });
        this.previewActionMessage.set(
          `You find a trap on ${obstacle.name || 'the obstacle'}: ${obstacle.trap!.name || 'Trap'} (rolled ${mindRoll} vs DC ${obstacle.trap!.toDetect}).`
        );
        this.obstaclePlacementsByDungon.update((all) => ({
          ...all,
          [current.dungonId]: (all[current.dungonId] ?? []).map((obs) =>
            obs.id === obstacle.id ? { ...obs, isTrapDetected: true } : obs
          ),
        }));
        this.saveGameState();
        if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') this.startMonsterTurns();
        return;
      }
    }

    // Check obstacle traps in adjacent squares (one cell away through open/door connections)
    for (const adj of adjacentChecks) {
      const adjRow = current.row + adj.dr;
      const adjCol = current.column + adj.dc;
      const adjKey = this.getSquareKey(adjRow, adjCol);
      if (!filledSquares[adjKey]) continue;
      const blockType = this.getMovementBlockTypeBetweenAdjacentSquares(
        current.dungonId, current.row, current.column, adjRow, adjCol
      );
      if (blockType === 'wall') continue;
      const adjObstacles = (this.obstaclePlacementsByDungon()[current.dungonId] ?? []).filter(
        (obs) =>
          obs.row === adjRow &&
          obs.column === adjCol &&
          obs.trap !== null &&
          !obs.isDestroyed &&
          !obs.isTrapDisarmed
      );
      for (const obstacle of adjObstacles) {
        if (mindRoll >= obstacle.trap!.toDetect) {
          this.foundTrap.set({
            trap: obstacle.trap!,
            source: 'obstacle',
            obstacleId: obstacle.id,
            adjacentRow: adjRow,
            adjacentColumn: adjCol,
          });
          this.previewActionMessage.set(
            `You find a trap on ${obstacle.name || 'the obstacle'} to the ${adj.label}: ${obstacle.trap!.name || 'Trap'} (rolled ${mindRoll} vs DC ${obstacle.trap!.toDetect}).`
          );
          this.obstaclePlacementsByDungon.update((all) => ({
            ...all,
            [current.dungonId]: (all[current.dungonId] ?? []).map((obs) =>
              obs.id === obstacle.id ? { ...obs, isTrapDetected: true } : obs
            ),
          }));
          this.saveGameState();
          if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') this.startMonsterTurns();
          return;
        }
      }
    }

    // Check tresher traps at current square
    const treshers = this.getTreshersAtSquare(current.dungonId, current.row, current.column);
    for (let i = 0; i < treshers.length; i++) {
      const t = treshers[i];
      if (t.trap && mindRoll >= t.trap.toDetect) {
        this.foundTrap.set({ trap: t.trap, source: 'tresher', tresherIndex: i });
        this.previewActionMessage.set(`You find a trap on ${t.name || 'tresher'}: ${t.trap.name || 'Trap'} (rolled ${mindRoll} vs DC ${t.trap.toDetect}).`);
        this.saveGameState();
        if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') this.startMonsterTurns();
        return;
      }
    }

    // Check tresher traps at adjacent squares (one cell away through open/door connections)
    for (const adj of adjacentChecks) {
      const adjRow = current.row + adj.dr;
      const adjCol = current.column + adj.dc;
      const adjKey = this.getSquareKey(adjRow, adjCol);
      if (!filledSquares[adjKey]) continue;
      const blockType = this.getMovementBlockTypeBetweenAdjacentSquares(
        current.dungonId, current.row, current.column, adjRow, adjCol
      );
      if (blockType === 'wall') continue;
      const adjTreshers = this.getTreshersAtSquare(current.dungonId, adjRow, adjCol);
      for (let i = 0; i < adjTreshers.length; i++) {
        const t = adjTreshers[i];
        if (t.trap && mindRoll >= t.trap.toDetect) {
          this.foundTrap.set({ trap: t.trap, source: 'tresher', tresherIndex: i, adjacentRow: adjRow, adjacentColumn: adjCol });
          this.previewActionMessage.set(`You find a trap on ${t.name || 'tresher'} to the ${adj.label}: ${t.trap.name || 'Trap'} (rolled ${mindRoll} vs DC ${t.trap.toDetect}).`);
          this.saveGameState();
          if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') this.startMonsterTurns();
          return;
        }
      }
    }

    // Check adjacent door traps
    for (const doorInfo of this.nearbyDoorsForPreview()) {
      if (doorInfo.door.trap && mindRoll >= doorInfo.door.trap.toDetect) {
        this.foundTrap.set({ trap: doorInfo.door.trap, source: 'door', doorInfo });
        this.previewActionMessage.set(`You find a trap on the ${doorInfo.door.name || 'door'} (rolled ${mindRoll} vs DC ${doorInfo.door.trap.toDetect}).`);
        this.saveGameState();
        if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') this.startMonsterTurns();
        return;
      }
    }

    // Check for hidden doors
    const squares = this.squaresByDungon()[current.dungonId] ?? {};
    const currentSquare = squares[this.getSquareKey(current.row, current.column)];
    if (currentSquare) {
      const hiddenDoorChecks: Array<{ side: SquareSide; neighborSide: SquareSide; dr: number; dc: number; label: string }> = [
        { side: 'toTop', neighborSide: 'toBottom', dr: -1, dc: 0, label: 'North' },
        { side: 'toRight', neighborSide: 'toLeft', dr: 0, dc: 1, label: 'East' },
        { side: 'toBottom', neighborSide: 'toTop', dr: 1, dc: 0, label: 'South' },
        { side: 'toLeft', neighborSide: 'toRight', dr: 0, dc: -1, label: 'West' },
      ];
      for (const cs of hiddenDoorChecks) {
        const connection = currentSquare[cs.side];
        if (this.isDoorConnection(connection) && connection.isHidden && !connection.isFound) {
          if (mindRoll >= connection.toFind) {
            this.setDoorFound(
              current.dungonId,
              this.getSquareKey(current.row, current.column),
              cs.side,
              this.getSquareKey(current.row + cs.dr, current.column + cs.dc),
              cs.neighborSide
            );
            const doorName = connection.name || 'hidden door';
            this.previewActionMessage.set(`You find a ${doorName} to the ${cs.label}! (rolled ${mindRoll} vs DC ${connection.toFind})`);
            this.saveGameState();
            this.drawPreviewGridCanvas();
            this.drawFirstPersonViewCanvas();
            if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') this.startMonsterTurns();
            return;
          }
        }
      }
    }

    this.foundTrap.set(null);
    this.previewActionMessage.set(`No traps found (rolled ${mindRoll}).`);
    if (this.playerAE() <= 0) {
      this.startMonsterTurns();
    }
  }

  currentSquareObstacles(): ObstaclePlacement[] {
    const preview = this.gridPreviewContext();
    if (!preview) return [];
    return (this.obstaclePlacementsByDungon()[preview.dungonId] ?? []).filter(
      (obs) => !obs.isDestroyed && obs.row === preview.centerRow && obs.column === preview.centerColumn
    );
  }

  nearbyObstaclesForPreview(): NearbyObstacleInfo[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    const inventoryKeys = this.inventoryKeysForPreview();
    const centerRow = preview.centerRow;
    const centerColumn = preview.centerColumn;
    const cardinalChecks: Array<{ dr: number; dc: number; label: string }> = [
      { dr: -1, dc: 0, label: 'North' },
      { dr: 0, dc: 1, label: 'East' },
      { dr: 1, dc: 0, label: 'South' },
      { dr: 0, dc: -1, label: 'West' },
    ];

    const directionByPosition = new Map<string, string>();
    for (const check of cardinalChecks) {
      directionByPosition.set(`${centerRow + check.dr}:${centerColumn + check.dc}`, check.label);
    }

    const obstacles = this.obstaclePlacementsByDungon()[preview.dungonId] ?? [];
    return obstacles
      .filter((obs) => {
        if (!this.isObstacleInteractableFromPreview(preview.dungonId, centerRow, centerColumn, obs)) {
          return false;
        }
        if (obs.row === centerRow && obs.column === centerColumn) {
          return true; // current square — direction will be 'Here'
        }
        return !!directionByPosition.get(`${obs.row}:${obs.column}`);
      })
      .map((obstacle) => {
        const requiredKeyId = obstacle.requiredKeyId ?? null;
        const hasMatchingKey =
          requiredKeyId !== null && inventoryKeys.some((key) => key.id === requiredKeyId);
        const canInteractWithItem = obstacle.containsItemId !== null && !obstacle.itemTaken;
        const itemPlacement = obstacle.itemPlacement ?? 'in';
        const isLocked = this.obstacleIsLocked(obstacle);
        const canTakeItem = canInteractWithItem && this.obstacleContainedItemIsTakeable(obstacle);
        const canOpen =
          !obstacle.isDestroyed &&
          obstacle.isOpened !== true &&
          itemPlacement !== 'on' &&
          !isLocked &&
          obstacle.containsItemId !== null;
        const canUseKey =
          !obstacle.isDestroyed &&
          obstacle.isOpened !== true &&
          isLocked &&
          hasMatchingKey;
        const canPick =
          !obstacle.isDestroyed &&
          obstacle.isOpened !== true &&
          isLocked;
        const canSmash = !obstacle.isIndestructible && !obstacle.isDestroyed;
        const canClose = obstacle.isOpened === true && !obstacle.isDestroyed;
        const direction = obstacle.row === centerRow && obstacle.column === centerColumn
          ? 'Here'
          : (directionByPosition.get(`${obstacle.row}:${obstacle.column}`) ?? 'Nearby');

        return {
          obstacle,
          direction,
          canOpen,
          canUseKey,
          canPick,
          canTakeItem,
          hasMatchingKey,
          canSmash,
          canClose,
        };
      })
      .sort((left, right) => left.direction.localeCompare(right.direction));
  }

  private obstacleContainedItemIsVisible(obstacle: ObstaclePlacement): boolean {
    if (obstacle.containsItemId === null || obstacle.itemTaken) {
      return false;
    }

    const itemPlacement = obstacle.itemPlacement ?? 'in';
    return itemPlacement === 'on' || obstacle.isDestroyed || obstacle.isOpened === true;
  }

  private obstacleContainedItemIsTakeable(obstacle: ObstaclePlacement): boolean {
    const itemPlacement = obstacle.itemPlacement ?? 'in';
    if (itemPlacement === 'on') {
      return true;
    }

    return obstacle.isDestroyed || obstacle.isOpened === true;
  }

  obstacleIsLocked(obstacle: ObstaclePlacement): boolean {
    return (obstacle.requiredKeyId ?? null) !== null && obstacle.isDestroyed !== true && obstacle.isOpened !== true && obstacle.isUnlocked !== true;
  }

  private isObstacleInteractableFromPreview(
    dungonId: number,
    centerRow: number,
    centerColumn: number,
    obstacle: ObstaclePlacement,
  ): boolean {
    if (obstacle.row === centerRow && obstacle.column === centerColumn) {
      return true;
    }

    const rowDelta = Math.abs(obstacle.row - centerRow);
    const columnDelta = Math.abs(obstacle.column - centerColumn);
    if (rowDelta + columnDelta !== 1) {
      return false;
    }

    const squares = this.squaresByDungon()[dungonId] ?? {};
    const fromSquare = squares[this.getSquareKey(centerRow, centerColumn)];
    if (!fromSquare) {
      return false;
    }

    const rowStep = obstacle.row - centerRow;
    const columnStep = obstacle.column - centerColumn;
    let side: SquareSide;
    if (rowStep === -1) {
      side = 'toTop';
    } else if (rowStep === 1) {
      side = 'toBottom';
    } else if (columnStep === -1) {
      side = 'toLeft';
    } else {
      side = 'toRight';
    }

    const connection = fromSquare[side];
    if (this.isWallConnection(connection)) {
      return false;
    }

    if (this.isDoorConnection(connection)) {
      if (connection.isHidden && !connection.isFound) {
        return false;
      }
      if (connection.state !== 'open') {
        return false;
      }
      if (connection.oneWay && connection.openDirection !== null) {
        const allowedFromSide = `to${connection.openDirection.charAt(0).toUpperCase()}${connection.openDirection.slice(1)}` as SquareSide;
        return side === allowedFromSide;
      }
    }

    return true;
  }

  smashObstacle(obstacleId: number): void {
    if (this.turnPhase() !== 'player') return;
    const preview = this.gridPreviewContext();
    if (!preview) return;
    if (this.playerAE() <= 0) return;

    const obstacles = this.obstaclePlacementsByDungon()[preview.dungonId] ?? [];
    const obs = obstacles.find((o) => o.id === obstacleId);
    if (!obs || obs.isDestroyed || obs.isIndestructible) return;

    // Deal player strength + 1d6 damage
    const damage = this.randomInt(1, 6) + this.getEffectivePlayerStrength();
    const newHp = Math.max(0, (obs.currentHp ?? obs.hp) - damage);
    const destroyed = newHp <= 0;

    this.addCombatLog(`You smash ${obs.name || 'the obstacle'} for ${damage} damage!${destroyed ? ' It is destroyed!' : ` (HP: ${newHp}/${obs.hp})`}`);
    this.previewActionMessage.set(destroyed ? `${obs.name || 'Obstacle'} destroyed!` : `${obs.name || 'Obstacle'} HP: ${newHp}/${obs.hp}`);

    this.obstaclePlacementsByDungon.update((all) => ({
      ...all,
      [preview.dungonId]: (all[preview.dungonId] ?? []).map((o) =>
        o.id === obstacleId ? { ...o, currentHp: newHp, isDestroyed: destroyed, isOpened: destroyed || o.isOpened } : o
      ),
    }));

    // If destroyed and has item, drop it at this square
    if (destroyed && obs.containsItemId !== null && !obs.itemTaken) {
      this.floorItemPlacementsByDungon.update((all) => ({
        ...all,
        [preview.dungonId]: [...(all[preview.dungonId] ?? []), { itemId: obs.containsItemId!, row: obs.row, column: obs.column }],
      }));
      this.addCombatLog(`An item falls from the rubble of ${obs.name || 'the obstacle'}!`);
      this.obstaclePlacementsByDungon.update((all) => ({
        ...all,
        [preview.dungonId]: (all[preview.dungonId] ?? []).map((o) =>
          o.id === obstacleId ? { ...o, itemTaken: true, isOpened: true } : o
        ),
      }));
    }

    this.consumePlayerAE(1, preview.dungonId);
    this.saveGameState();
    if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') this.startMonsterTurns();
  }

  takeItemFromObstacle(obstacleId: number): void {
    const preview = this.gridPreviewContext();
    if (!preview) return;
    if (this.turnPhase() !== 'player' || this.playerHp() <= 0 || this.playerAE() < 1) {
      this.previewActionMessage.set('Not enough AE to pick up item.');
      return;
    }

    const obstacles = this.obstaclePlacementsByDungon()[preview.dungonId] ?? [];
    const obs = obstacles.find((o) => o.id === obstacleId);
    if (!obs || obs.containsItemId === null || obs.itemTaken) return;
    if (!this.isObstacleInteractableFromPreview(preview.dungonId, preview.centerRow, preview.centerColumn, obs)) {
      this.previewActionMessage.set('Move next to that obstacle first.');
      return;
    }
    if (obs.trap && !obs.isTrapDisarmed) {
      this.previewActionMessage.set(`${obs.name || 'Obstacle'} was trapped!`);
      this.addCombatLog(`You try to take an item from ${obs.name || 'the obstacle'} but a trap triggers!`);
      this.triggerTrap(obs.trap);
      this.consumePlayerAE(1, preview.dungonId);
      this.saveGameState();
      if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') this.startMonsterTurns();
      return;
    }
    if (!this.obstacleContainedItemIsTakeable(obs)) {
      this.previewActionMessage.set('Open this obstacle first.');
      return;
    }

    this.obstaclePlacementsByDungon.update((all) => ({
      ...all,
      [preview.dungonId]: (all[preview.dungonId] ?? []).map((o) =>
        o.id === obstacleId ? { ...o, itemTaken: true } : o
      ),
    }));

    const itemId = obs.containsItemId!;
    const itemName = (this.floorItemListByDungon()[preview.dungonId] ?? []).find((i) => i.id === itemId)?.name ?? 'an item';
    const itemData = (this.floorItemListByDungon()[preview.dungonId] ?? []).find((i) => i.id === itemId);
    if (itemData) {
      this.pcTresherItemsById.update((map) => {
        const updated = new Map(map);
        updated.set(itemData.id, { ...itemData, effectValue: itemData.effectValue ?? 0 });
        return updated;
      });
      this.collectedFloorItemsByDungon.update((all) => ({
        ...all,
        [preview.dungonId]: [...(all[preview.dungonId] ?? []), itemData],
      }));
    }

    this.addCombatLog(`You take ${itemName} from ${obs.name || 'the obstacle'}.`);
    this.previewActionMessage.set(`Found ${itemName}!`);
    this.consumePlayerAE(1, preview.dungonId);
    this.saveGameState();
    if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') this.startMonsterTurns();
  }

  forwardObstacleWithItem(): ObstaclePlacement | null {
    const preview = this.gridPreviewContext();
    if (!preview) return null;
    const fwd = this.getForwardPickupSquareContext(preview.dungonId, preview.centerRow, preview.centerColumn);
    if (!fwd) return null;
    const obstacles = this.obstaclePlacementsByDungon()[preview.dungonId] ?? [];
    return obstacles.find(
      (o) => !o.isDestroyed && o.row === fwd.row && o.column === fwd.column && o.containsItemId !== null && !o.itemTaken && o.isOpened === true
    ) ?? null;
  }

  openObstacle(obstacleId: number): void {
    const preview = this.gridPreviewContext();
    if (!preview) return;
    if (this.turnPhase() !== 'player' || this.playerHp() <= 0 || this.playerAE() < 1) {
      this.previewActionMessage.set('Not enough AE to open obstacle.');
      return;
    }

    const obstacles = this.obstaclePlacementsByDungon()[preview.dungonId] ?? [];
    const obs = obstacles.find((o) => o.id === obstacleId);
    if (!obs || obs.isDestroyed || obs.isOpened) return;
    if (!this.isObstacleInteractableFromPreview(preview.dungonId, preview.centerRow, preview.centerColumn, obs)) {
      this.previewActionMessage.set('Move next to that obstacle first.');
      return;
    }

    if (this.obstacleIsLocked(obs)) {
      this.previewActionMessage.set(`${obs.name || 'Obstacle'} is still locked.`);
      return;
    }

    if ((obs.itemPlacement ?? 'in') === 'on' && obs.containsItemId !== null && !obs.itemTaken) {
      this.previewActionMessage.set('The item is on top. Take it directly.');
      return;
    }

    if (obs.trap && !obs.isTrapDisarmed) {
      this.previewActionMessage.set(`${obs.name || 'Obstacle'} was trapped!`);
      this.addCombatLog(`You try to open ${obs.name || 'the obstacle'} but a trap triggers!`);
      this.triggerTrap(obs.trap);
      this.consumePlayerAE(1, preview.dungonId);
      this.saveGameState();
      if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') this.startMonsterTurns();
      return;
    }

    this.obstaclePlacementsByDungon.update((all) => ({
      ...all,
      [preview.dungonId]: (all[preview.dungonId] ?? []).map((o) =>
        o.id === obstacleId ? { ...o, isOpened: true, isUnlocked: true } : o
      ),
    }));

    const itemName = (this.floorItemListByDungon()[preview.dungonId] ?? []).find((i) => i.id === obs.containsItemId)?.name ?? 'an item';
    this.previewActionMessage.set(
      obs.containsItemId !== null
        ? `${obs.name || 'Obstacle'} opened. ${itemName} is now visible.`
        : `${obs.name || 'Obstacle'} opened.`
    );
    this.addCombatLog(
      obs.containsItemId !== null
        ? `Opened ${obs.name || 'obstacle'} and revealed ${itemName}.`
        : `Opened ${obs.name || 'obstacle'}.`
    );
    this.consumePlayerAE(1, preview.dungonId);
    this.saveGameState();
    if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') this.startMonsterTurns();
  }

  closeObstacle(obstacleId: number): void {
    const preview = this.gridPreviewContext();
    if (!preview) return;
    if (this.turnPhase() !== 'player' || this.playerHp() <= 0 || this.playerAE() < 1) {
      this.previewActionMessage.set('Not enough AE to close obstacle.');
      return;
    }
    const obs = (this.obstaclePlacementsByDungon()[preview.dungonId] ?? []).find((o) => o.id === obstacleId);
    if (!obs || !obs.isOpened || obs.isDestroyed) return;
    this.obstaclePlacementsByDungon.update((all) => ({
      ...all,
      [preview.dungonId]: (all[preview.dungonId] ?? []).map((o) =>
        o.id === obstacleId ? { ...o, isOpened: false } : o
      ),
    }));
    this.previewActionMessage.set(`${obs.name || 'Obstacle'} closed.`);
    this.consumePlayerAE(1, preview.dungonId);
    this.saveGameState();
    if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') this.startMonsterTurns();
  }

  unlockObstacle(obstacleId: number): void {
    const preview = this.gridPreviewContext();
    if (!preview) return;
    if (this.turnPhase() !== 'player' || this.playerHp() <= 0 || this.playerAE() < 1) {
      this.previewActionMessage.set('Not enough AE to unlock obstacle.');
      return;
    }

    const obs = (this.obstaclePlacementsByDungon()[preview.dungonId] ?? []).find((o) => o.id === obstacleId);
    if (!obs || !this.obstacleIsLocked(obs) || !this.isObstacleInteractableFromPreview(preview.dungonId, preview.centerRow, preview.centerColumn, obs)) {
      return;
    }
    if (!this.obstacleHasMatchingKey(obs)) {
      this.previewActionMessage.set('You do not have the right key.');
      return;
    }

    const keyLabel = this.obstacleRequiresKeyLabel(obs) ?? 'the key';
    this.obstaclePlacementsByDungon.update((all) => ({
      ...all,
      [preview.dungonId]: (all[preview.dungonId] ?? []).map((o) =>
        o.id === obstacleId ? { ...o, isUnlocked: true } : o
      ),
    }));
    this.previewActionMessage.set(`You unlock ${obs.name || 'the obstacle'} with ${keyLabel}.`);
    this.addCombatLog(`Unlocked ${obs.name || 'the obstacle'} with ${keyLabel}.`);
    this.consumePlayerAE(1, preview.dungonId);
    this.saveGameState();
    if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') this.startMonsterTurns();
  }

  pickObstacleLock(obstacleId: number): void {
    const preview = this.gridPreviewContext();
    if (!preview) return;
    if (this.turnPhase() !== 'player' || this.playerHp() <= 0 || this.playerAE() < 1) {
      this.previewActionMessage.set('Not enough AE to pick lock.');
      return;
    }

    const obs = (this.obstaclePlacementsByDungon()[preview.dungonId] ?? []).find((o) => o.id === obstacleId);
    if (!obs || !this.obstacleIsLocked(obs) || !this.isObstacleInteractableFromPreview(preview.dungonId, preview.centerRow, preview.centerColumn, obs)) {
      return;
    }

    const dc = Math.max(8, Math.min(18, obs.hp ?? 10));
    const roll = this.randomInt(1, 12) + this.getEffectivePlayerMind();
    const obstacleName = obs.name || 'obstacle';
    if (roll >= dc) {
      this.obstaclePlacementsByDungon.update((all) => ({
        ...all,
        [preview.dungonId]: (all[preview.dungonId] ?? []).map((o) =>
          o.id === obstacleId ? { ...o, isUnlocked: true } : o
        ),
      }));
      this.previewActionMessage.set(`You pick the lock on ${obstacleName} (rolled ${roll} vs DC ${dc}).`);
      this.addCombatLog(`Pick lock on ${obstacleName}: rolled ${roll} vs DC ${dc}. Success.`);
    } else {
      this.previewActionMessage.set(`Failed to pick the lock on ${obstacleName} (rolled ${roll} vs DC ${dc}).`);
      this.addCombatLog(`Pick lock on ${obstacleName}: rolled ${roll} vs DC ${dc}. Failed.`);
      if (obs.trap) {
        this.triggerTrap(obs.trap);
      }
    }
    this.consumePlayerAE(1, preview.dungonId);
    this.saveGameState();
    if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') this.startMonsterTurns();
  }

  obstacleRequiresKeyLabel(obstacle: ObstaclePlacement): string | null {
    const requiredKeyId = obstacle.requiredKeyId ?? null;
    if (requiredKeyId === null) {
      return null;
    }

    const key = this.keyList.find((entry) => entry.id === requiredKeyId);
    return key?.name?.trim() || `Key #${requiredKeyId}`;
  }

  obstacleHasMatchingKey(obstacle: ObstaclePlacement): boolean {
    const requiredKeyId = obstacle.requiredKeyId ?? null;
    if (requiredKeyId === null) {
      return false;
    }

    return this.inventoryKeysForPreview().some((key) => key.id === requiredKeyId);
  }

  obstacleOpenButtonLabel(obstacle: ObstaclePlacement): string {
    return 'Open Obstacle';
  }

  examineObstacle(obstacleId: number): void {
    if (this.turnPhase() !== 'player') return;
    const preview = this.gridPreviewContext();
    if (!preview) return;
    if (this.playerAE() < 1) {
      this.previewActionMessage.set('Not enough AE to examine.');
      return;
    }
    const obs = (this.obstaclePlacementsByDungon()[preview.dungonId] ?? []).find((o) => o.id === obstacleId);
    if (!obs || obs.containsItemId === null || obs.itemTaken) return;

    const roll = this.randomInt(1, 6) + this.getEffectivePlayerMind();
    const dc = 6;
    const itemName = (this.floorItemListByDungon()[preview.dungonId] ?? []).find((i) => i.id === obs.containsItemId)?.name ?? 'an item';

    if (roll >= dc) {
      this.examinedObstacleResults.update((m) => { const n = new Map(m); n.set(obstacleId, itemName); return n; });
      this.addCombatLog(`Examine ${obs.name || 'obstacle'}: rolled ${roll} vs DC ${dc}. You see ${itemName} inside!`);
      this.previewActionMessage.set(`Inside: ${itemName}!`);
    } else {
      this.examinedObstacleResults.update((m) => { const n = new Map(m); n.set(obstacleId, '?'); return n; });
      this.addCombatLog(`Examine ${obs.name || 'obstacle'}: rolled ${roll} vs DC ${dc}. You can't identify the contents.`);
      this.previewActionMessage.set("Can't tell what's inside.");
    }
    this.consumePlayerAE(1, preview.dungonId);
    this.saveGameState();
    if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') this.startMonsterTurns();
  }

  tryDisarmTrap(): void {
    const found = this.foundTrap();
    if (!found) return;
    const preview = this.gridPreviewContext();
    if (!preview) return;
    if (this.turnPhase() !== 'player' || this.playerHp() <= 0 || this.playerAE() < 1) {
      this.previewActionMessage.set('Not enough AE to disarm trap.');
      return;
    }
    const dc = found.trap.toDisarm;
    const isThieph = this.isThiephClass();
    const thiephDexBonus = isThieph ? Math.floor(this.getEffectivePlayerDexterity() / 2) : 0;
    const disarmMindBonus = this.getEffectivePlayerMind() + thiephDexBonus;
    let roll: number;
    if (isThieph) {
      const droll1 = this.randomInt(1, 20) + disarmMindBonus;
      const droll2 = this.randomInt(1, 20) + disarmMindBonus;
      roll = Math.max(droll1, droll2);
      this.addCombatLog('Disarm (advantage, +' + thiephDexBonus + ' DX): rolled ' + droll1 + ' and ' + droll2 + ', kept ' + roll + '.');
    } else {
      roll = this.randomInt(1, 20) + disarmMindBonus;
    }
    if (roll >= dc) {
      this.previewActionMessage.set(`Trap disarmed! (rolled ${roll} vs DC ${dc})`);
      this.addCombatLog(`Disarm trap: rolled ${roll} vs DC ${dc}. Success.`);
      if (found.source === 'floor' && found.floorTrapId != null) {
        this.floorTrapPlacementsByDungon.update(all => ({
          ...all,
          [preview.dungonId]: (all[preview.dungonId] ?? []).map(p =>
            p.id === found.floorTrapId ? { ...p, isDisarmed: true } : p
          )
        }));
      } else if (found.source === 'obstacle' && found.obstacleId != null) {
        this.obstaclePlacementsByDungon.update((all) => ({
          ...all,
          [preview.dungonId]: (all[preview.dungonId] ?? []).map((p) =>
            p.id === found.obstacleId ? { ...p, isTrapDetected: true, isTrapDisarmed: true } : p
          ),
        }));
      }
      this.foundTrap.set(null);
      this.saveGameState();
    } else {
      this.previewActionMessage.set(`Failed to disarm trap! (rolled ${roll} vs DC ${dc})`);
      this.addCombatLog(`Disarm trap: rolled ${roll} vs DC ${dc}. Failed - trap triggers!`);
      this.triggerTrap(found.trap);
      this.foundTrap.set(null);
      this.saveGameState();
    }
    this.consumePlayerAE(1, preview.dungonId);
    if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') {
      this.startMonsterTurns();
    }
  }

  private tryDisarmTrapTarget(targetTrap: FloorTrapPlacement, spell: PcTresherSpellData, spellFlavor: string): void {
    const preview = this.gridPreviewContext();
    if (!preview) return;
    const dc = targetTrap.trap.toDisarm;
    const disarmMindBonus = this.getEffectivePlayerMind();
    let roll: number;
    if (this.isThiephClass()) {
      const droll1 = this.randomInt(1, 20) + disarmMindBonus;
      const droll2 = this.randomInt(1, 20) + disarmMindBonus;
      roll = Math.max(droll1, droll2);
      this.addCombatLog('Disarm (advantage): rolled ' + droll1 + ' and ' + droll2 + ', kept ' + roll + '.');
    } else {
      roll = this.randomInt(1, 20) + disarmMindBonus;
    }

    const spellName = `${spell.name}${spellFlavor}`;
    if (roll >= dc) {
      this.previewActionMessage.set(`Trap disarmed by ${spellName}! (rolled ${roll} vs DC ${dc})`);
      this.addCombatLog(`Disarm trap with ${spellName}: rolled ${roll} vs DC ${dc}. Success.`);
      this.floorTrapPlacementsByDungon.update(all => ({
        ...all,
        [preview.dungonId]: (all[preview.dungonId] ?? []).map(p =>
          p.id === targetTrap.id ? { ...p, isDisarmed: true, isDetected: true } : p
        )
      }));
      this.foundTrap.set(null);
      this.saveGameState();
    } else {
      this.previewActionMessage.set(`Failed to disarm trap with ${spellName}! (rolled ${roll} vs DC ${dc})`);
      this.addCombatLog(`Disarm trap with ${spellName}: rolled ${roll} vs DC ${dc}. Failed - trap triggers!`);
      this.floorTrapPlacementsByDungon.update(all => ({
        ...all,
        [preview.dungonId]: (all[preview.dungonId] ?? []).map(p =>
          p.id === targetTrap.id ? { ...p, isTriggered: true, isDetected: true } : p
        )
      }));
      this.triggerTrap(targetTrap.trap);
      this.foundTrap.set(null);
      this.saveGameState();
    }
  }

  private triggerTrap(trap: Trap): void {
    this.previewActionMessage.set(`Trap triggered! ${trap.name || 'A trap'} goes off!`);
    this.applyTrapSecondaryEffect(trap);
    const rolledDamage = rollNotation(trap.damage);
    if (rolledDamage <= 0) {
      this.addCombatLog(`Trap triggered! ${trap.name || 'Trap'}`);
      return;
    }
    if (trap.damageTo === 'HP') {
      const newHp = Math.max(0, this.playerHp() - rolledDamage);
      this.playerHp.set(newHp);
      this.addCombatLog(`Trap triggered! ${trap.name || 'Trap'} deals ${rolledDamage} damage to HP.`);
      if (newHp <= 0) {
        this.playerDeathCause.set(`Killed by a trap${trap.name ? ': ' + trap.name : ''}`);
        this.turnPhase.set('gameover');
        setTimeout(() => this.goHome(), 3500);
      }
    } else if (trap.damageTo === 'Stamina') {
      this.addCombatLog(`Trap triggered! ${trap.name || 'Trap'} deals ${rolledDamage} damage to Stamina.`);
    } else if (trap.damageTo === 'Mind') {
      this.addCombatLog(`Trap triggered! ${trap.name || 'Trap'} deals ${rolledDamage} damage to Mind.`);
    } else if (trap.damageTo === 'AE') {
      const newAE = Math.max(0, this.playerAE() - rolledDamage);
      this.playerAE.set(newAE);
      this.addCombatLog(`Trap triggered! ${trap.name || 'Trap'} drains ${rolledDamage} Action Economy (AE).`);
    } else if (trap.damageTo === 'ROS') {
      const dungonId = this.gridPreviewContext()?.dungonId;
      if (dungonId !== undefined) {
        const existingCheater = this.cheaterByDungon()[dungonId];
        if (existingCheater) {
          const newROS = Math.max(1, existingCheater.rangeOfSight - rolledDamage);
          this.cheaterByDungon.update((all) => ({
            ...all,
            [dungonId]: { ...existingCheater, rangeOfSight: newROS },
          }));
          this.addCombatLog(`Trap triggered! ${trap.name || 'Trap'} reduces Range of Sight by ${rolledDamage} (now ${newROS}).`);
        }
      }
    }
  }

  lookForTrapsAtCurrentSquare(): void {
    this.searchForTraps();
  }

  takeAllFromCurrentSquare(): void {
    const current = this.getCurrentPreviewSquareContext();
    if (!current) {
      return;
    }
    if (this.turnPhase() !== 'player' || this.playerHp() <= 0 || this.playerAE() < 1) {
      this.previewActionMessage.set('Not enough AE to pick up items.');
      return;
    }

    const keysAtSquare = this.getKeysAtSquare(current.row, current.column);
    const tresherPlacements = this.getTresherPlacementsAtSquare(
      current.dungonId,
      current.row,
      current.column
    );
    const treshersAtSquare = this.getTreshersAtSquare(current.dungonId, current.row, current.column);

    const floorItemsHere = (this.floorItemPlacementsByDungon()[current.dungonId] ?? []).filter(
      (p) => p.row === current.row && p.column === current.column
    );
    const floorPotionsHere = (this.floorPotionPlacementsByDungon()[current.dungonId] ?? []).filter(
      (p) => p.row === current.row && p.column === current.column
    );
    const floorSpellsHere = (this.floorSpellPlacementsByDungon()[current.dungonId] ?? []).filter(
      (p) => p.row === current.row && p.column === current.column
    );

    const forwardTarget = this.getForwardPickupSquareContext(current.dungonId, current.row, current.column);
    const forwardTresherPlacements = forwardTarget
      ? this.getTresherPlacementsAtSquare(current.dungonId, forwardTarget.row, forwardTarget.column)
      : [];
    const forwardTreshersAtSquare = forwardTarget
      ? this.getTreshersAtSquare(current.dungonId, forwardTarget.row, forwardTarget.column)
      : [];
    const forwardFloorItemsHere = forwardTarget
      ? (this.floorItemPlacementsByDungon()[current.dungonId] ?? []).filter(
          (p) => p.row === forwardTarget.row && p.column === forwardTarget.column
        )
      : [];
    const currentObstacleLoot = this.getTakeableObstacleDiscoveryItemsForSquare(current.dungonId, current.row, current.column);
    const forwardObstacleLoot = forwardTarget
      ? this.getTakeableObstacleDiscoveryItemsForSquare(current.dungonId, forwardTarget.row, forwardTarget.column)
      : [];

    if (
      keysAtSquare.length === 0 &&
      tresherPlacements.length === 0 &&
      floorItemsHere.length === 0 &&
      floorPotionsHere.length === 0 &&
      floorSpellsHere.length === 0 &&
      forwardTresherPlacements.length === 0 &&
      forwardFloorItemsHere.length === 0 &&
      currentObstacleLoot.length === 0 &&
      forwardObstacleLoot.length === 0
    ) {
      this.previewActionMessage.set('Nothing to take on this square.');
      return;
    }

    const allTreshersToCollect = [...treshersAtSquare, ...forwardTreshersAtSquare];
    this.addItemsToCheaterInventory(
      current.dungonId,
      keysAtSquare,
      this.applyThiephTresherBonus(allTreshersToCollect)
    );

    if (keysAtSquare.length > 0) {
      this.keyList = this.keyList.map((key) =>
        key.rownId === current.row && key.columnId === current.column
          ? {
              ...key,
              rownId: null,
              columnId: null,
            }
          : key
      );
    }

    if (tresherPlacements.length > 0) {
      this.removeTresherPlacementsAtSquare(current.dungonId, current.row, current.column);
      this.activateTresherGuards(current.dungonId, current.row, current.column);
    }

    if (forwardTresherPlacements.length > 0 && forwardTarget) {
      this.removeTresherPlacementsAtSquare(current.dungonId, forwardTarget.row, forwardTarget.column);
      this.activateTresherGuards(current.dungonId, forwardTarget.row, forwardTarget.column);
    }

    const allFloorItemsHere = [...floorItemsHere, ...forwardFloorItemsHere];
    if (allFloorItemsHere.length > 0) {
      const itemsById = new Map(
        (this.floorItemListByDungon()[current.dungonId] ?? []).map((it) => [it.id, it])
      );
      const itemsToCollect = allFloorItemsHere
        .map((p) => itemsById.get(p.itemId))
        .filter((it): it is NonNullable<typeof it> => it !== undefined);

      // Add to pcTresherItemsById so the equip system can resolve them
      this.pcTresherItemsById.update((map) => {
        const updated = new Map(map);
        for (const it of itemsToCollect) {
          updated.set(it.id, { ...it, effectValue: it.effectValue ?? 0 });
        }
        return updated;
      });

      // Store in collected signal
      this.collectedFloorItemsByDungon.update((all) => ({
        ...all,
        [current.dungonId]: [...(all[current.dungonId] ?? []), ...itemsToCollect],
      }));

      // Remove placements from floor
      const pickedItemKeys = new Set(allFloorItemsHere.map((p) => `${p.row}:${p.column}:${p.itemId}`));
      this.floorItemPlacementsByDungon.update((all) => ({
        ...all,
        [current.dungonId]: (all[current.dungonId] ?? []).filter(
          (p) => !pickedItemKeys.has(`${p.row}:${p.column}:${p.itemId}`)
        ),
      }));
    }

    if (floorPotionsHere.length > 0) {
      const potionsById = new Map(
        (this.floorPotionListByDungon()[current.dungonId] ?? []).map((p) => [p.id, p])
      );
      const potionsToCollect = floorPotionsHere
        .map((p) => potionsById.get(p.potionId))
        .filter((p): p is NonNullable<typeof p> => p !== undefined);

      // Store in collected signal
      this.collectedFloorPotionsByDungon.update((all) => ({
        ...all,
        [current.dungonId]: [...(all[current.dungonId] ?? []), ...potionsToCollect],
      }));

      // Remove placements from floor
      const pickedPotionIds = new Set(floorPotionsHere.map((p) => p.potionId));
      this.floorPotionPlacementsByDungon.update((all) => ({
        ...all,
        [current.dungonId]: (all[current.dungonId] ?? []).filter(
          (p) => !(p.row === current.row && p.column === current.column && pickedPotionIds.has(p.potionId))
        ),
      }));
    }

    if (floorSpellsHere.length > 0) {
      const spellsToCollect = floorSpellsHere
        .map((p) => this.resolveSpellData(current.dungonId, p.spellId))
        .filter((s): s is NonNullable<typeof s> => s !== null);

      if (spellsToCollect.length > 0) {
        this.pcTresherSpellsById.update((map) => {
          const updated = new Map(map);
          for (const spell of spellsToCollect) {
            updated.set(spell.id, spell);
          }
          return updated;
        });
      }

      this.collectedFloorSpellsByDungon.update((all) => ({
        ...all,
        [current.dungonId]: [...(all[current.dungonId] ?? []), ...spellsToCollect],
      }));

      const pickedSpellIds = new Set(floorSpellsHere.map((p) => p.spellId));
      this.floorSpellPlacementsByDungon.update((all) => ({
        ...all,
        [current.dungonId]: (all[current.dungonId] ?? []).filter(
          (p) => !(p.row === current.row && p.column === current.column && pickedSpellIds.has(p.spellId))
        ),
      }));
    }

    const totalItemCount =
      keysAtSquare.length +
      tresherPlacements.length +
      floorItemsHere.length +
      floorPotionsHere.length +
      floorSpellsHere.length +
      forwardTresherPlacements.length +
      forwardFloorItemsHere.length +
      currentObstacleLoot.length +
      forwardObstacleLoot.length;
    this.previewActionMessage.set(
      `Took ${totalItemCount} item${totalItemCount === 1 ? '' : 's'} into inventory.`
    );
    this.consumePlayerAE(1, current.dungonId);
    this.drawPreviewGridCanvas();
    if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') {
      this.startMonsterTurns();
    }
    for (const obstacleLoot of [...currentObstacleLoot, ...forwardObstacleLoot]) {
      if (obstacleLoot.obstacleId == null) continue;
      this.takeItemFromObstacle(obstacleLoot.obstacleId);
    }
  }

  takeSomeFromCurrentSquare(): void {
    const current = this.getCurrentPreviewSquareContext();
    if (!current) {
      return;
    }

    const tresherPlacements = this.getTresherPlacementsAtSquare(
      current.dungonId,
      current.row,
      current.column
    );

    if (tresherPlacements.length <= 1) {
      this.previewActionMessage.set('Take Some is available when more than one tresher is here.');
      return;
    }

    const treshersById = this.getTreshersByIdForDungon(current.dungonId);
    const placementToTake = tresherPlacements.find((placement) => treshersById.has(placement.tresherId));
    if (!placementToTake) {
      this.previewActionMessage.set('Could not find a tresher to take from this square.');
      return;
    }

    const tresherToTake = treshersById.get(placementToTake.tresherId);
    if (!tresherToTake) {
      return;
    }

    this.addItemsToCheaterInventory(current.dungonId, [], this.applyThiephTresherBonus([tresherToTake]));
    this.removeSingleTresherPlacement(
      current.dungonId,
      current.row,
      current.column,
      placementToTake.tresherId
    );
    this.activateTresherGuards(current.dungonId, current.row, current.column);

    const remainingCount = tresherPlacements.length - 1;
    this.previewActionMessage.set(
      `Took 1 tresher. ${remainingCount} tresher${remainingCount === 1 ? '' : 's'} remain here.`
    );
    this.drawPreviewGridCanvas();
  }

  takeSinglePickupItem(item: NearbyDiscoveryItem): void {
    const current = this.getCurrentPreviewSquareContext();
    if (!current) return;
    if (this.turnPhase() !== 'player' || this.playerHp() <= 0 || this.playerAE() < 1) {
      this.previewActionMessage.set('Not enough AE to pick up item.');
      return;
    }

    switch (item.kind) {
      case 'Key': {
        const keysAtSquare = this.getKeysAtSquare(item.row, item.column);
        const keyToTake =
          keysAtSquare.find((k) => k.name.trim() === item.name.trim()) ?? keysAtSquare[0];
        if (!keyToTake) { this.previewActionMessage.set('Could not find key.'); return; }
        this.addItemsToCheaterInventory(current.dungonId, [keyToTake], []);
        let taken = false;
        this.keyList = this.keyList.map((k) => {
          if (!taken && k.id === keyToTake.id) { taken = true; return { ...k, rownId: null, columnId: null }; }
          return k;
        });
        this.previewActionMessage.set(`Took ${keyToTake.name || 'Key'}.`);
        break;
      }
      case 'Obstacle': {
        if (item.obstacleId !== null && item.obstacleId !== undefined) {
          this.takeItemFromObstacle(item.obstacleId);
          break;
        }
        const obstacle = (this.obstaclePlacementsByDungon()[current.dungonId] ?? []).find(
          (obs) => obs.row === item.row && obs.column === item.column && obs.containsItemId !== null && !obs.itemTaken
        );
        if (!obstacle) {
          this.previewActionMessage.set('Could not find obstacle loot.');
          return;
        }
        this.takeItemFromObstacle(obstacle.id);
        break;
      }
      case 'Tresher': {
        const placements = this.getTresherPlacementsAtSquare(current.dungonId, item.row, item.column);
        const treshersById = this.getTreshersByIdForDungon(current.dungonId);
        const placement =
          placements.find((p) => { const t = treshersById.get(p.tresherId); return t && t.name.trim() === item.name.trim(); }) ??
          placements[0];
        if (!placement) { this.previewActionMessage.set('Could not find tresher.'); return; }
        const tresher = treshersById.get(placement.tresherId);
        if (!tresher) return;
        this.addItemsToCheaterInventory(current.dungonId, [], this.applyThiephTresherBonus([tresher]));
        this.removeSingleTresherPlacement(current.dungonId, item.row, item.column, placement.tresherId);
        this.activateTresherGuards(current.dungonId, item.row, item.column);
        this.previewActionMessage.set(`Took ${tresher.name || 'Tresher'}.`);
        break;
      }
      case 'Item': {
        const floorItemsHere = (this.floorItemPlacementsByDungon()[current.dungonId] ?? []).filter(
          (p) => p.row === item.row && p.column === item.column
        );
        const itemsById = new Map((this.floorItemListByDungon()[current.dungonId] ?? []).map((it) => [it.id, it]));
        const placement =
          floorItemsHere.find((p) => { const it = itemsById.get(p.itemId); return it && it.name.trim() === item.name.trim(); }) ??
          floorItemsHere[0];
        if (!placement) { this.previewActionMessage.set('Could not find item.'); return; }
        const itemToCollect = itemsById.get(placement.itemId);
        if (!itemToCollect) return;
        this.pcTresherItemsById.update((map) => {
          const updated = new Map(map);
          updated.set(itemToCollect.id, { ...itemToCollect, effectValue: itemToCollect.effectValue ?? 0 });
          return updated;
        });
        this.collectedFloorItemsByDungon.update((all) => ({
          ...all,
          [current.dungonId]: [...(all[current.dungonId] ?? []), itemToCollect],
        }));
        const pickedItemId = placement.itemId;
        this.floorItemPlacementsByDungon.update((all) => ({
          ...all,
          [current.dungonId]: (all[current.dungonId] ?? []).filter(
            (p) => !(p.row === item.row && p.column === item.column && p.itemId === pickedItemId)
          ),
        }));
        this.previewActionMessage.set(`Took ${itemToCollect.name || 'Item'}.`);
        break;
      }
      case 'Potion': {
        const floorPotionsHere = (this.floorPotionPlacementsByDungon()[current.dungonId] ?? []).filter(
          (p) => p.row === item.row && p.column === item.column
        );
        const potionsById = new Map((this.floorPotionListByDungon()[current.dungonId] ?? []).map((p) => [p.id, p]));
        const placement =
          floorPotionsHere.find((p) => { const pot = potionsById.get(p.potionId); return pot && pot.name.trim() === item.name.trim(); }) ??
          floorPotionsHere[0];
        if (!placement) { this.previewActionMessage.set('Could not find potion.'); return; }
        const potionToCollect = potionsById.get(placement.potionId);
        if (!potionToCollect) return;
        this.collectedFloorPotionsByDungon.update((all) => ({
          ...all,
          [current.dungonId]: [...(all[current.dungonId] ?? []), potionToCollect],
        }));
        const pickedPotionId = placement.potionId;
        this.floorPotionPlacementsByDungon.update((all) => ({
          ...all,
          [current.dungonId]: (all[current.dungonId] ?? []).filter(
            (p) => !(p.row === item.row && p.column === item.column && p.potionId === pickedPotionId)
          ),
        }));
        this.previewActionMessage.set(`Took ${potionToCollect.name || 'Potion'}.`);
        break;
      }
      case 'Spell': {
        const floorSpellsHere = (this.floorSpellPlacementsByDungon()[current.dungonId] ?? []).filter(
          (p) => p.row === item.row && p.column === item.column
        );
        const placement =
          floorSpellsHere.find((p) => { const s = this.resolveSpellData(current.dungonId, p.spellId); return s && s.name.trim() === item.name.trim(); }) ??
          floorSpellsHere[0];
        if (!placement) { this.previewActionMessage.set('Could not find spell.'); return; }
        const spellToCollect = this.resolveSpellData(current.dungonId, placement.spellId);
        if (!spellToCollect) return;
        this.pcTresherSpellsById.update((map) => {
          const updated = new Map(map);
          updated.set(spellToCollect.id, spellToCollect);
          return updated;
        });
        this.collectedFloorSpellsByDungon.update((all) => ({
          ...all,
          [current.dungonId]: [...(all[current.dungonId] ?? []), spellToCollect],
        }));
        const pickedSpellId = placement.spellId;
        this.floorSpellPlacementsByDungon.update((all) => ({
          ...all,
          [current.dungonId]: (all[current.dungonId] ?? []).filter(
            (p) => !(p.row === item.row && p.column === item.column && p.spellId === pickedSpellId)
          ),
        }));
        this.previewActionMessage.set(`Took ${spellToCollect.name || 'Spell'}.`);
        break;
      }
      default:
        this.previewActionMessage.set('Cannot take this item directly.');
    }
    this.consumePlayerAE(1, current.dungonId);
    this.drawPreviewGridCanvas();
    if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') {
      this.startMonsterTurns();
    }
  }

  private loadGame(): void {
    const gameId = Number.parseInt(this.route.snapshot.paramMap.get('gameId') ?? '', 10);
    const isSample = !Number.isInteger(gameId) || gameId <= 0;

    const testMode = this.route.snapshot.queryParamMap?.get('testMode');
    if (testMode === 'creator') {
      this.loadCreatorTestSession();
      return;
    }

    if (isSample) {
      // Sample play mode — no auth required
      const pcIdRaw = this.route.snapshot.queryParamMap?.get('pcId') ?? '';
      const pcId = Number.parseInt(pcIdRaw, 10);
      const dungonIdRaw = this.route.snapshot.queryParamMap?.get('dungonId') ?? '';
      const dungonId = Number.parseInt(dungonIdRaw, 10);
      if (!Number.isInteger(pcId) || pcId <= 0) {
        this.gameLoadError.set('Invalid sample game parameters.');
        return;
      }

      this.isSampleMode.set(true);
      this.isLoadingGame.set(true);
      this.gameLoadError.set(null);

      this.http
        .get<GameSessionPayload>(`${API_BASE_URL}/games/sample-session`, {
          params: Number.isInteger(dungonId) && dungonId > 0
            ? { pcId: String(pcId), dungonId: String(dungonId) }
            : { pcId: String(pcId) },
        })
        .pipe(finalize(() => this.isLoadingGame.set(false)))
        .subscribe({
          next: (game) => {
            const playerMaxHp = this.gameJsonParserService.resolvePlayerMaxHp(game.pcMaxHP);
            this.playerMaxHp.set(playerMaxHp);
            this.playerStartingHp = this.gameJsonParserService.resolvePlayerCurrentHp(game.pcCurrentHP, playerMaxHp);
            this.currentGameId.set(null);
            this.gameName.set(game.name || 'Sample Game');
            this.gameLastUpdated.set(null);
            this.playerSp.set(0);
            this.playerMind.set(typeof game.pcMind === 'number' ? Math.max(0, Math.floor(game.pcMind)) : 0);
            this.playerStamina.set(typeof game.pcStamina === 'number' ? Math.max(0, Math.floor(game.pcStamina)) : 0);
            this.playerBaseAC.set(typeof game.pcAc === 'number' ? Math.max(1, game.pcAc) : 10);
            this.playerStrength.set(typeof game.pcStrength === 'number' ? Math.max(0, Math.floor(game.pcStrength)) : 0);
            this.playerMagicPower.set(typeof game.pcMagicPower === 'number' ? Math.max(0, Math.floor(game.pcMagicPower)) : 0);
            this.playerDexterity.set(typeof game.pcDexterity === 'number' ? Math.max(0, Math.floor(game.pcDexterity)) : 0);
            this.playerAwareness.set(typeof game.pcAwareness === 'number' ? Math.max(0, Math.floor(game.pcAwareness)) : 0);
            this.playerMp.set(this.getEffectivePlayerMagicPower());
            this.playerNOA.set(typeof game.pcNumberOfAttacks === 'number' ? Math.max(1, Math.floor(game.pcNumberOfAttacks)) : 1);
            this.playerNOD.set(typeof game.pcNumberOfDefends === 'number' ? Math.max(1, Math.floor(game.pcNumberOfDefends)) : 1);
            this.currentPcId_.set(null);
            this.dungonSpReward.set(0);
            this.loadDungonJsonState(game.dungonid, game.dungenJson);
            // Force-reset so PC treshers always seed fresh in sample mode (dungeon JSON may have flag set to true)
            this.setPcInventoryInitialized(game.dungonid, false);
            this.seedPcTreshersIntoInventory(game.dungonid, game.pcTreshers);
            if (Array.isArray(game.pcTresherItems)) {
              this.pcTresherItemsById.set(this.gameJsonParserService.parsePcTresherItemMap(game.pcTresherItems));
            }
            if (Array.isArray(game.pcTresherPotions)) {
              this.pcTresherPotionsById.set(this.gameJsonParserService.parsePcTresherPotionMap(game.pcTresherPotions));
            }
            if (Array.isArray(game.pcTresherSpells)) {
              const spellMap = this.gameJsonParserService.parsePcTresherSpellMap(game.pcTresherSpells);
              this.pcTresherSpellsById.update((existingMap) => {
                const merged = new Map(existingMap);
                for (const [id, spell] of spellMap) {
                  merged.set(id, spell);
                }
                return merged;
              });
            }
            if (Array.isArray(game.pcTresherCurses)) {
              this.pcTresherCursesById.set(this.gameJsonParserService.parsePcTresherCurseMap(game.pcTresherCurses));
            } else {
              this.pcTresherCursesById.set(new Map());
            }
            this.playerType.set(typeof game.pcType === 'string' ? game.pcType : null);
            this.playerSpecies.set(typeof game.pcSpecies === 'string' ? game.pcSpecies : null);
            this.playerName.set(typeof game.pcName === 'string' ? game.pcName : null);
            this.playerPortraitUrl.set(typeof game.pcImagePath === 'string' ? (this.resolveImageUrl(game.pcImagePath) || null) : null);
            this.dungonCoverImageUrl.set(
              typeof game.dungonCoverImagePath === 'string' && game.dungonCoverImagePath
                ? (this.resolveImageUrl(game.dungonCoverImagePath) || null)
                : null
            );
            this.isPreloadingAssets.set(true);
            this.preloadGameAssets(game).then(() => {
              this.isPreloadingAssets.set(false);
              this.setInitialPreviewContext(game.dungonid);
              this.initializeCombatState(game.dungonid);
              // Keep loadMonsterImages/Obstacle/Loot as fallback for any IDs not returned by the server
              this.loadMonsterImages(game.dungonid);
              this.loadObstacleImages(game.dungonid);
              this.loadLootImages(game.dungonid);
            });
          },
        });
      return;
    }

    const userKey = this.account.getKey();
    if (!userKey) {
      this.gameLoadError.set('Please log in to load a game.');
      return;
    }

    this.loadSpellCatalog(userKey);
    this.loadSoundCatalog(userKey);

    this.isLoadingGame.set(true);
    this.gameLoadError.set(null);
    this.previewActionMessage.set(null);
    this.activeInfoPanelTab.set('nearby');
    this.equippedTresherIndexesByDungon.set({});

    this.http
      .get<GameSessionPayload>(`${API_BASE_URL}/games/${gameId}`, {
        params: { userkey: userKey },
      })
      .pipe(finalize(() => this.isLoadingGame.set(false)))
      .subscribe({
        next: (game) => {
          const playerMaxHp = this.gameJsonParserService.resolvePlayerMaxHp(game.pcMaxHP);
          this.playerMaxHp.set(playerMaxHp);
          this.playerStartingHp = this.gameJsonParserService.resolvePlayerCurrentHp(game.pcCurrentHP, playerMaxHp);

          this.currentGameId.set(gameId);
          this.gameName.set(game.name || 'Game');
          this.gameLastUpdated.set(game.lastupdated ?? null);
          this.playerSp.set(typeof game.pcSp === 'number' ? Math.max(0, Math.floor(game.pcSp)) : 0);
          this.playerMind.set(typeof game.pcMind === 'number' ? Math.max(0, Math.floor(game.pcMind)) : 0);
          this.playerStamina.set(typeof game.pcStamina === 'number' ? Math.max(0, Math.floor(game.pcStamina)) : 0);
          this.playerBaseAC.set(typeof game.pcAc === 'number' ? Math.max(1, game.pcAc) : 10);
          this.playerStrength.set(typeof game.pcStrength === 'number' ? Math.max(0, Math.floor(game.pcStrength)) : 0);
          this.playerMagicPower.set(typeof game.pcMagicPower === 'number' ? Math.max(0, Math.floor(game.pcMagicPower)) : 0);
          this.playerDexterity.set(typeof game.pcDexterity === 'number' ? Math.max(0, Math.floor(game.pcDexterity)) : 0);
          this.playerAwareness.set(typeof game.pcAwareness === 'number' ? Math.max(0, Math.floor(game.pcAwareness)) : 0);
          this.playerMp.set(this.getEffectivePlayerMagicPower());
          this.playerNOA.set(typeof game.pcNumberOfAttacks === 'number' ? Math.max(1, Math.floor(game.pcNumberOfAttacks)) : 1);
          this.playerNOD.set(typeof game.pcNumberOfDefends === 'number' ? Math.max(1, Math.floor(game.pcNumberOfDefends)) : 1);
          this.currentPcId_.set(typeof game.currentPcId === 'number' ? game.currentPcId : null);
          this.playerType.set(typeof game.pcType === 'string' ? game.pcType : null);
          this.playerSpecies.set(typeof game.pcSpecies === 'string' ? game.pcSpecies : null);
          this.playerName.set(typeof game.pcName === 'string' ? game.pcName : null);
          this.playerPortraitUrl.set(typeof game.pcImagePath === 'string' ? (this.resolveImageUrl(game.pcImagePath) || null) : null);
          this.isMainGame.set(game.isMainGame === true);
          this.resettablePerPc.set(game.resettablePerPc === true);
          if (game.isMainGame === true) {
            this.loadStash();
          }
          this.dungonSpReward.set(typeof game.dungonSpReward === 'number' ? Math.max(0, Math.floor(game.dungonSpReward)) : 0);
          this.loadDungonJsonState(game.dungonid, game.dungenJson);
          this.seedPcTreshersIntoInventory(game.dungonid, game.pcTreshers);
          if (Array.isArray(game.pcTresherItems)) {
            this.pcTresherItemsById.set(this.gameJsonParserService.parsePcTresherItemMap(game.pcTresherItems));
          }
          if (Array.isArray(game.pcTresherPotions)) {
            this.pcTresherPotionsById.set(this.gameJsonParserService.parsePcTresherPotionMap(game.pcTresherPotions));
          }
          if (Array.isArray(game.pcTresherSpells)) {
            const spellMap = this.gameJsonParserService.parsePcTresherSpellMap(game.pcTresherSpells);
            this.pcTresherSpellsById.update((existingMap) => {
              const merged = new Map(existingMap);
              for (const [id, spell] of spellMap) {
                merged.set(id, spell);
              }
              return merged;
            });
          }
          if (Array.isArray(game.pcTresherCurses)) {
            this.pcTresherCursesById.set(this.gameJsonParserService.parsePcTresherCurseMap(game.pcTresherCurses));
          } else {
            this.pcTresherCursesById.set(new Map());
          }
          this.dungonCoverImageUrl.set(
            typeof game.dungonCoverImagePath === 'string' && game.dungonCoverImagePath
              ? (this.resolveImageUrl(game.dungonCoverImagePath) || null)
              : null
          );
          this.isPreloadingAssets.set(true);
          this.preloadGameAssets(game).then(() => {
            this.isPreloadingAssets.set(false);
            this.setInitialPreviewContext(game.dungonid);
            this.initializeCombatState(game.dungonid);
            // Keep load*Images as fallback for any IDs not bundled by the server
            this.loadMonsterImages(game.dungonid);
            this.loadObstacleImages(game.dungonid);
            this.loadLootImages(game.dungonid);
          });
        },
        error: () => {
          this.gameLoadError.set('Failed to load game.');
        },
      });
  }

  private loadCreatorTestSession(): void {
    const userKey = this.account.getKey();
    if (!userKey) {
      this.gameLoadError.set('Please log in to test this dungeon.');
      return;
    }

    const profileId = this.route.snapshot.queryParamMap?.get('testPcProfileId') ?? '';
    const dungonIdRaw = this.route.snapshot.queryParamMap?.get('dungonId') ?? '';
    const dungonId = Number.parseInt(dungonIdRaw, 10);
    if (!profileId || !Number.isInteger(dungonId) || dungonId <= 0) {
      this.gameLoadError.set('Invalid creator test parameters.');
      return;
    }

    const profile = this.getCreatorTestPcProfile(userKey, dungonId, profileId);
    if (!profile) {
      this.gameLoadError.set('Test PC profile not found.');
      return;
    }

    // Ensure monster spells (owned by this creator, or admin-visible) resolve during test play.
    this.loadSpellCatalog(userKey);

    this.isSampleMode.set(true);
    this.isLoadingGame.set(true);
    this.gameLoadError.set(null);

    this.http
      .get<unknown>(`${API_BASE_URL}/dungons/${dungonId}`, { params: { userkey: userKey } })
      .pipe(finalize(() => this.isLoadingGame.set(false)))
      .subscribe({
        next: (dungon) => {
          const source = (dungon ?? {}) as Record<string, unknown>;
          const dungenJson = source['dungenJson'];
          const name = typeof source['name'] === 'string' ? source['name'] : 'Dungeon Test';

          this.loadCreatorTestPayload(dungonId, name, dungenJson, profile);
        },
        error: () => {
          this.gameLoadError.set('Failed to load dungeon for creator test mode.');
        },
      });
  }

  private loadCreatorTestPayload(
    dungonId: number,
    dungonName: string,
    dungenJson: unknown,
    profile: CreatorTestPcProfilePayload
  ): void {
    const payload: GameSessionPayload = {
      id: 0,
      dungonid: dungonId,
      name: `TEST: ${dungonName}`,
      dungenJson: dungenJson ?? {},
      lastupdated: new Date().toISOString(),
      pcCurrentHP: profile.currentHP,
      pcMaxHP: profile.maxHP,
      pcSp: 0,
      pcMind: profile.mind,
      pcStamina: profile.stamina,
      pcAc: profile.ac,
      pcStrength: profile.strength,
      pcMagicPower: profile.magicPower,
      pcNumberOfAttacks: profile.numberOfAttacks,
      pcNumberOfDefends: profile.numberOfDefends,
      pcType: profile.type,
      pcSpecies: profile.species,
      pcName: profile.name,
      pcImagePath: null,
      currentPcId: null,
      isMainGame: false,
      resettablePerPc: false,
      dungonSpReward: 0,
      pcTreshers: this.buildTestPcTreshers(profile),
      pcTresherItems: this.buildTestPcItems(profile),
      pcTresherPotions: this.buildTestPcPotions(profile),
      pcTresherSpells: this.buildTestPcSpells(profile),
      pcTresherCurses: [],
      monsterImages: [],
      lootImages: [],
      obstacleImages: [],
      soundPaths: [],
      dungonCoverImagePath: null,
    };

    this.currentGameId.set(null);
    this.gameName.set(payload.name || 'Dungeon Test');
    this.gameLastUpdated.set(null);
    this.playerSp.set(0);
    this.playerMind.set(Math.max(0, Math.floor(payload.pcMind ?? 0)));
    this.playerStamina.set(Math.max(0, Math.floor(payload.pcStamina ?? 0)));
    this.playerBaseAC.set(Math.max(1, payload.pcAc ?? 10));
    this.playerStrength.set(Math.max(0, Math.floor(payload.pcStrength ?? 0)));
    this.playerMagicPower.set(Math.max(0, Math.floor(payload.pcMagicPower ?? 0)));
    this.playerDexterity.set(Math.max(0, Math.floor(payload.pcDexterity ?? 0)));
    this.playerAwareness.set(Math.max(0, Math.floor(payload.pcAwareness ?? 0)));
    this.playerMp.set(this.getEffectivePlayerMagicPower());
    this.playerNOA.set(Math.max(1, Math.floor(payload.pcNumberOfAttacks ?? 1)));
    this.playerNOD.set(Math.max(1, Math.floor(payload.pcNumberOfDefends ?? 1)));
    this.currentPcId_.set(null);
    this.playerType.set(payload.pcType ?? null);
    this.playerSpecies.set(payload.pcSpecies ?? null);
    this.playerName.set(payload.pcName ?? null);
    this.playerPortraitUrl.set(null);
    this.dungonSpReward.set(0);

    const playerMaxHp = this.gameJsonParserService.resolvePlayerMaxHp(payload.pcMaxHP);
    this.playerMaxHp.set(playerMaxHp);
    this.playerStartingHp = this.gameJsonParserService.resolvePlayerCurrentHp(payload.pcCurrentHP, playerMaxHp);

    this.loadDungonJsonState(payload.dungonid, payload.dungenJson);
    this.setPcInventoryInitialized(payload.dungonid, false);
    this.seedPcTreshersIntoInventory(payload.dungonid, payload.pcTreshers);
    this.pcTresherItemsById.set(this.gameJsonParserService.parsePcTresherItemMap(payload.pcTresherItems));
    this.pcTresherPotionsById.set(this.gameJsonParserService.parsePcTresherPotionMap(payload.pcTresherPotions));
    this.pcTresherSpellsById.set(this.gameJsonParserService.parsePcTresherSpellMap(payload.pcTresherSpells));
    this.pcTresherCursesById.set(new Map());

    this.dungonCoverImageUrl.set(null);
    this.isPreloadingAssets.set(false);
    this.setInitialPreviewContext(payload.dungonid);
    this.initializeCombatState(payload.dungonid);
    this.loadMonsterImages(payload.dungonid);
    this.loadObstacleImages(payload.dungonid);
    this.loadLootImages(payload.dungonid);
  }

  private getCreatorTestPcProfile(userKey: string, dungonId: number, profileId: string): CreatorTestPcProfilePayload | null {
    const storageKey = `${CREATOR_TEST_PC_KEY_PREFIX}:${userKey}:${dungonId}`;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      const profile = parsed.find((entry) => entry && typeof entry === 'object' && (entry as Record<string, unknown>)['id'] === profileId);
      return profile ? (profile as CreatorTestPcProfilePayload) : null;
    } catch {
      return null;
    }
  }

  private buildTestPcTreshers(profile: CreatorTestPcProfilePayload): unknown[] {
    const itemIds = profile.items.map((entry) => entry.id);
    const spellIds = profile.spells.map((entry) => entry.id);
    const potionIds = profile.potions.map((entry) => entry.id);
    return [
      {
        id: 999001,
        type: 'OtherTresher',
        name: 'Test Gear',
        description: 'Creator test gear',
        gold: 0,
        silver: 0,
        copper: 0,
        zinc: 0,
        item1Id: itemIds[0] ?? null,
        item2Id: itemIds[1] ?? null,
        item3Id: itemIds[2] ?? null,
        item4Id: itemIds[3] ?? null,
        spell1Id: spellIds[0] ?? null,
        spell2Id: spellIds[1] ?? null,
        spell3Id: spellIds[2] ?? null,
        spell4Id: spellIds[3] ?? null,
        potion1Id: potionIds[0] ?? null,
        potion2Id: potionIds[1] ?? null,
        potion3Id: potionIds[2] ?? null,
        curse1Id: null,
        curse2Id: null,
        imageId: null,
        soundId: null,
        spReward: 0,
      },
    ];
  }

  private buildTestPcItems(profile: CreatorTestPcProfilePayload): unknown[] {
    return profile.items.map((entry) => ({ ...entry }));
  }

  private buildTestPcPotions(profile: CreatorTestPcProfilePayload): unknown[] {
    return profile.potions.map((entry) => ({ ...entry }));
  }

  private buildTestPcSpells(profile: CreatorTestPcProfilePayload): unknown[] {
    return profile.spells.map((entry) => ({ ...entry }));
  }

  private preloadGameAssets(game: GameSessionPayload): Promise<void> {
    // Populate sound path map synchronously from bundled server data
    this.gameSoundService.seedBundledSoundPaths(game.soundPaths);

    const imageAssets: { cacheType: 'monster' | 'obstacle' | 'loot'; id: number; path: string }[] = [
      ...(game.monsterImages ?? []).map((a) => ({ cacheType: 'monster' as const, ...a })),
      ...(game.obstacleImages ?? []).map((a) => ({ cacheType: 'obstacle' as const, ...a })),
      ...(game.lootImages ?? []).map((a) => ({ cacheType: 'loot' as const, ...a })),
    ];

    // Always show the preload screen for at least 700ms so the cover image is visible
    const minDisplayPromise = new Promise<void>((resolve) => window.setTimeout(resolve, 700));

    if (imageAssets.length === 0) return minDisplayPromise;

    const timeoutPromise = new Promise<void>((resolve) => window.setTimeout(resolve, 10000));

    const loadPromise = new Promise<void>((resolve) => {
      let remaining = imageAssets.length;
      const tick = () => { if (--remaining <= 0) resolve(); };
      for (const asset of imageAssets) {
        const url = this.resolveImageUrl(asset.path);
        if (!url) { tick(); continue; }
        const img = new Image();
        img.onload = () => {
          if (asset.cacheType === 'monster') {
            this.monsterImageCache.set(asset.id, img);
            this.monsterImageCacheVersion.update((v) => v + 1);
          } else if (asset.cacheType === 'obstacle') {
            this.obstacleImageCache.set(asset.id, img);
            this.obstacleImageCacheVersion.update((v) => v + 1);
          } else {
            this.lootImageCache.set(asset.id, img);
            this.lootImageCacheVersion.update((v) => v + 1);
          }
          tick();
        };
        img.onerror = () => tick();
        img.src = url;
      }
    });

    return Promise.race([
      Promise.all([loadPromise, minDisplayPromise]).then(() => undefined),
      timeoutPromise,
    ]);
  }

  private loadMonsterImages(dungonId: number): void {
    this.drawingAssets.loadMonsterImages(dungonId);
  }

  private loadSpellCatalog(userKey: string, forceRefresh = false): void {
    if (this.spellCatalogById().size > 0 && !forceRefresh) {
      return;
    }

    this.http
      .get<unknown[]>(`${API_BASE_URL}/spells`, { params: { userkey: userKey } })
      .subscribe({
        next: (items) => {
          if (!Array.isArray(items) || items.length === 0) {
            return;
          }

          const catalog = new Map<number, PcTresherSpellData>();
          for (const raw of items) {
            const spell = this.gameJsonParserService.normalizeSpellRecord(raw);
            if (spell !== null) {
              catalog.set(spell.id, spell);
            }
          }

          if (catalog.size === 0) {
            return;
          }

          this.spellCatalogById.set(catalog);
          this.pcTresherSpellsById.update((existingMap) => {
            const merged = new Map(existingMap);
            for (const [id, spell] of catalog) {
              const existing = merged.get(id);
              if (!existing) {
                merged.set(id, spell);
                continue;
              }

              merged.set(id, { ...existing, ...spell });
            }
            return merged;
          });
        },
        error: () => {
          // Best-effort lookup source only.
        },
      });
  }

  private loadSoundCatalog(userKey: string, forceRefresh = false): void {
    this.gameSoundService.loadSoundCatalog(userKey, forceRefresh);
  }

  private resolveSpellData(dungonId: number, spellId: number): PcTresherSpellData | null {
    const normalizedSpellId = Number.isFinite(spellId) ? Math.floor(spellId) : null;
    if (normalizedSpellId === null) {
      return null;
    }

    return (
      this.pcTresherSpellsById().get(normalizedSpellId) ??
      (this.floorSpellListByDungon()[dungonId] ?? []).find((s) => s.id === normalizedSpellId || Number(s.id) === normalizedSpellId) ??
      this.spellCatalogById().get(normalizedSpellId) ??
      null
    );
  }

  private loadObstacleImages(dungonId: number): void {
    this.drawingAssets.loadObstacleImages(dungonId);
  }

  private loadLootImages(dungonId: number): void {
    this.drawingAssets.loadLootImages(dungonId);
  }

  private resolveImageUrl(imagePath: string): string {
    return this.drawingAssets.resolveImageUrl(imagePath);
  }

  private resolveClientAssetUrl(assetPath: string): string {
    return this.drawingAssets.resolveClientAssetUrl(assetPath);
  }

  private playSpellSound(spell: PcTresherSpellData): void {
    if (this.soundMuted()) {
      return;
    }

    const latestCatalogSpell = this.spellCatalogById().get(spell.id);
    const soundId = typeof spell.soundId === 'number'
      ? spell.soundId
      : typeof latestCatalogSpell?.soundId === 'number'
        ? latestCatalogSpell.soundId
        : null;
    const selectedPath = soundId !== null ? this.soundPathById().get(soundId) ?? null : null;
    const directPath = typeof latestCatalogSpell?.soundPath === 'string' && latestCatalogSpell.soundPath.trim()
      ? latestCatalogSpell.soundPath.trim()
      : typeof spell.soundPath === 'string' && spell.soundPath.trim()
        ? spell.soundPath.trim()
      : null;

    console.log('[sound] playSpellSound spell.id=', spell.id, 'soundId=', soundId, 'selectedPath=', selectedPath, 'directPath=', directPath, 'soundPathById.size=', this.soundPathById().size);

    if (soundId === null && !directPath) {
      const userKey = this.account.getKey();
      if (userKey) {
        this.loadSpellCatalog(userKey, true);
      }
    }
    if (!selectedPath && soundId !== null) {
      const userKey = this.account.getKey();
      if (userKey) {
        this.loadSoundCatalog(userKey, true);
      }
    }
    const soundPath = selectedPath ?? directPath ?? this.defaultSpellSoundPath;
    console.log('[sound] playSpellSound final soundPath=', soundPath);
    this.playSoundPath(soundPath);
  }

  private playSoundPath(soundPath: string): void {
    this.gameSoundService.playSoundPath(soundPath, {
      muted: this.soundMuted(),
      preferClientFirst: this.isSampleMode() || !this.account.getKey(),
      resolveClientAssetUrl: (assetPath) => this.resolveClientAssetUrl(assetPath),
    });
  }

  private playDoorOpenClickSound(): void {
    this.gameSoundService.playDoorOpenClickSound(this.soundMuted());
  }

  private setInitialPreviewContext(dungonId: number): void {
    const startpoint = this.startPointByDungon()[dungonId] ?? null;
    const filledSquares = this.filledSquaresByDungon()[dungonId] ?? {};
    const saved = this.savedCombatState;

    let centerRow = 0;
    let centerColumn = 0;

    const hasSavedPosition = saved.playerRow !== null && saved.playerColumn !== null;
    if (hasSavedPosition) {
      const savedKey = this.getSquareKey(saved.playerRow!, saved.playerColumn!);
      if (filledSquares[savedKey]) {
        centerRow = saved.playerRow!;
        centerColumn = saved.playerColumn!;
      }
    }

    if (!hasSavedPosition || (centerRow === 0 && centerColumn === 0)) {
      const startpointKey = startpoint ? this.getSquareKey(startpoint.row, startpoint.col) : null;
      if (startpoint && startpointKey && filledSquares[startpointKey]) {
        centerRow = startpoint.row;
        centerColumn = startpoint.col;
      }
    }

    if (centerRow === 0 && centerColumn === 0) {
      const firstFilledSquareKey = Object.keys(filledSquares)[0];
      if (!firstFilledSquareKey) {
        this.gameLoadError.set('This game has no playable squares.');
        return;
      }

      const [rowText, colText] = firstFilledSquareKey.split(':');
      centerRow = Number.parseInt(rowText ?? '0', 10);
      centerColumn = Number.parseInt(colText ?? '0', 10);
    }

    const halfDimension = Math.floor(this.previewGridDimension / 2);
    this.gridPreviewContext.set({
      dungonId,
      centerRow,
      centerColumn,
      startRow: centerRow - halfDimension,
      startColumn: centerColumn - halfDimension,
    });

    const cheater = this.cheaterByDungon()[dungonId] ?? DEFAULT_CHEATER;
    this.setVisualFacingDirection(dungonId, cheater.facingDir);

    this.drawPreviewGridCanvas();
  }

  private applyCardinalFacingDirection(nextDirection: FacingDirection): void {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return;
    }

    const currentCheater = this.cheaterByDungon()[preview.dungonId] ?? { ...DEFAULT_CHEATER };
    if (currentCheater.facingDir === nextDirection) {
      this.setVisualFacingDirection(preview.dungonId, nextDirection);
      this.drawPreviewGridCanvas();
      return;
    }

    this.cheaterByDungon.update((allCheaters) => ({
      ...allCheaters,
      [preview.dungonId]: {
        ...currentCheater,
        facingDir: nextDirection,
      },
    }));

    this.setVisualFacingDirection(preview.dungonId, nextDirection);
    this.drawPreviewGridCanvas();
  }

  private setVisualFacingDirection(
    dungonId: number,
    direction: DisplayFacingDirection
  ): void {
    this.visualFacingByDungon.update((allDirections) => ({
      ...allDirections,
      [dungonId]: direction,
    }));
  }

  private getDisplayedFacingDirection(
    dungonId: number,
    fallback: FacingDirection
  ): DisplayFacingDirection {
    return this.visualFacingByDungon()[dungonId] ?? fallback;
  }

  private currentSquareItemsForPreview(): NearbyDiscoveryItem[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    return this.nearbyItemsForPreview().filter(
      (item) => item.row === preview.centerRow && item.column === preview.centerColumn
    );
  }

  private getTakeableObstacleDiscoveryItemsForSquare(
    dungonId: number,
    row: number,
    column: number
  ): NearbyDiscoveryItem[] {
    const obstacles = this.obstaclePlacementsByDungon()[dungonId] ?? [];
    return obstacles
      .filter(
        (obs) =>
          obs.row === row &&
          obs.column === column &&
          obs.containsItemId !== null &&
          !obs.itemTaken &&
          this.obstacleContainedItemIsTakeable(obs)
      )
      .map((obs) => ({
        kind: 'Obstacle',
        name: obs.name || 'Obstacle',
        description: obs.isDestroyed
          ? 'Loot falls from the rubble.'
          : 'There is something inside.',
        row: obs.row,
        column: obs.column,
        obstacleId: obs.id,
      }));
  }

  private getForwardPickupSquareContext(
    dungonId: number,
    row: number,
    column: number
  ): { row: number; column: number } | null {
    const cheater = this.cheaterByDungon()[dungonId] ?? DEFAULT_CHEATER;
    const displayDirection = this.getDisplayedFacingDirection(dungonId, cheater.facingDir);
    const forward = this.getMovementDeltaForDisplayFacingDirection(displayDirection);
    const targetRow = row + forward.rowOffset;
    const targetColumn = column + forward.columnOffset;
    const forwardHasLiveMonster = this.monsterInstances().some(
      (m) => !m.isDead && m.row === targetRow && m.column === targetColumn
    );

    if (forwardHasLiveMonster) {
      return null;
    }

    return { row: targetRow, column: targetColumn };
  }

  private isPickupDiscoveryKind(kind: NearbyDiscoveryItem['kind']): boolean {
    return kind === 'Key' || kind === 'Tresher' || kind === 'Item' || kind === 'Potion' || kind === 'Spell';
  }

  private normalizeItemType(type: string | null | undefined): string {
    return (type ?? '').trim().toLowerCase();
  }

  private normalizeItemName(name: string | null | undefined): string {
    return (name ?? '').trim().toLowerCase();
  }

  private isNecklaceLikeItem(type: string | null | undefined, name: string | null | undefined): boolean {
    const normalizedType = this.normalizeItemType(type);
    if (normalizedType === 'necklace' || normalizedType === 'neckless' || normalizedType === 'amulet') {
      return true;
    }
    const normalizedName = this.normalizeItemName(name);
    return normalizedName.includes('amulet') || normalizedName.includes('necklace') || normalizedName.includes('neckless');
  }

  private isArmorItemType(type: string, name?: string): boolean {
    const normalized = this.normalizeItemType(type);
    return normalized === 'armor' || normalized === 'ring' || this.isNecklaceLikeItem(type, name);
  }

  private isWeaponItemType(type: string): boolean {
    const normalized = this.normalizeItemType(type);
    return normalized === 'weapon' || normalized === 'shield' || normalized === 'wand';
  }

  private getInventoryContextForPreview():
    | { dungonId: number; inventory: CheaterInventory }
    | null {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return null;
    }

    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    return {
      dungonId: preview.dungonId,
      inventory: {
        keys: Array.isArray(cheater.inventory?.keys) ? cheater.inventory.keys : [],
        treshers: Array.isArray(cheater.inventory?.treshers) ? cheater.inventory.treshers : [],
      },
    };
  }

  private getEquippedTresherIndexesForDungon(dungonId: number, itemCount: number): number[] {
    return this.inventoryService.getEquippedTresherIndexesForDungon(dungonId, itemCount);
  }

  private setEquippedTresherIndexesForDungon(dungonId: number, indexes: number[]): void {
    this.inventoryService.setEquippedTresherIndexesForDungon(dungonId, indexes);
  }

  private getHandsRequiredForEquip(tresher: Tresher): number {
    return this.inventoryService.getHandsRequiredForEquip(tresher);
  }

  private getCurrentPreviewSquareContext():
    | { dungonId: number; row: number; column: number }
    | null {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return null;
    }

    return {
      dungonId: preview.dungonId,
      row: preview.centerRow,
      column: preview.centerColumn,
    };
  }

  private getKeysAtSquare(row: number, column: number): Key[] {
    return this.keyList.filter((key) => key.rownId === row && key.columnId === column);
  }

  private getTresherPlacementsAtSquare(
    dungonId: number,
    row: number,
    column: number
  ): TresherPlacement[] {
    return (this.tresherPlacementsByDungon()[dungonId] ?? []).filter(
      (placement) => placement.row === row && placement.column === column
    );
  }

  private getTreshersByIdForDungon(dungonId: number): Map<number, Tresher> {
    return new Map(
      (this.tresherListByDungon()[dungonId] ?? []).map((tresher) => [tresher.id, tresher] as const)
    );
  }

  private getMonstersByIdForDungon(dungonId: number): Map<number, Monster> {
    return new Map(
      (this.monsterListByDungon()[dungonId] ?? []).map((monster) => [monster.id, monster] as const)
    );
  }

  private getTreshersAtSquare(dungonId: number, row: number, column: number): Tresher[] {
    const treshersById = this.getTreshersByIdForDungon(dungonId);
    return this.getTresherPlacementsAtSquare(dungonId, row, column)
      .map((placement) => treshersById.get(placement.tresherId))
      .filter((item): item is Tresher => item !== undefined)
      .map((tresher) => ({ ...tresher }));
  }

  private addItemsToCheaterInventory(dungonId: number, keys: Key[], treshers: Tresher[]): void {
    this.inventoryService.addItemsToCheaterInventory(dungonId, keys, treshers);
  }

  private seedPcTreshersIntoInventory(dungonId: number, rawPcTreshers: unknown[] | undefined): void {
    this.inventoryService.seedPcTreshersIntoInventory(dungonId, rawPcTreshers);
  }

  private removeInnerPotionSlotFromInventoryTresher(dungonId: number, tresherIndex: number, potionId: number): void {
    this.inventoryService.removeInnerPotionSlotFromInventoryTresher(dungonId, tresherIndex, potionId);
  }

  private removeInventoryTresherAtIndex(dungonId: number, index: number): void {
    this.inventoryService.removeInventoryTresherAtIndex(dungonId, index);
  }

  private removeTresherPlacementsAtSquare(dungonId: number, row: number, column: number): void {
    this.tresherPlacementsByDungon.update((allPlacements) => {
      const existingPlacements = allPlacements[dungonId] ?? [];
      const filteredPlacements = existingPlacements.filter(
        (placement) => placement.row !== row || placement.column !== column
      );

      if (filteredPlacements.length === existingPlacements.length) {
        return allPlacements;
      }

      return {
        ...allPlacements,
        [dungonId]: filteredPlacements,
      };
    });
  }

  private removeSingleTresherPlacement(
    dungonId: number,
    row: number,
    column: number,
    tresherId: number
  ): void {
    this.tresherPlacementsByDungon.update((allPlacements) => {
      const existingPlacements = allPlacements[dungonId] ?? [];
      let removed = false;
      const filteredPlacements = existingPlacements.filter((placement) => {
        if (
          !removed &&
          placement.row === row &&
          placement.column === column &&
          placement.tresherId === tresherId
        ) {
          removed = true;
          return false;
        }

        return true;
      });

      if (!removed) {
        return allPlacements;
      }

      return {
        ...allPlacements,
        [dungonId]: filteredPlacements,
      };
    });
  }

  private drawPreviewGridCanvas(): void {
    const preview = this.gridPreviewContext();
    const canvas = this.previewGridCanvasRef?.nativeElement;
    if (!preview || !canvas) {
      return;
    }

    const width = this.previewGridCanvasWidth;
    const height = this.previewGridCanvasHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#000000';
    context.fillRect(0, 0, width, height);

    const filledSquares = this.filledSquaresByDungon()[preview.dungonId] ?? {};
    const visibleSquareKeys = this.getVisibleSquareKeysForPreview(preview);

    // Pass 1: draw all filled squares as dark gray so rooms are always visible
    context.fillStyle = '#555555';
    for (let previewRow = 0; previewRow < this.previewGridDimension; previewRow += 1) {
      for (let previewColumn = 0; previewColumn < this.previewGridDimension; previewColumn += 1) {
        const sourceRow = preview.startRow + previewRow;
        const sourceColumn = preview.startColumn + previewColumn;
        const sourceSquareKey = this.getSquareKey(sourceRow, sourceColumn);
        if (!filledSquares[sourceSquareKey]) continue;
        context.fillRect(
          previewColumn * this.previewGridCellSize,
          previewRow * this.previewGridCellSize,
          this.previewGridCellSize,
          this.previewGridCellSize
        );
      }
    }

    // Pass 2: overwrite visible squares with light gray
    context.fillStyle = '#c7c7c7';
    for (let previewRow = 0; previewRow < this.previewGridDimension; previewRow += 1) {
      for (let previewColumn = 0; previewColumn < this.previewGridDimension; previewColumn += 1) {
        const sourceRow = preview.startRow + previewRow;
        const sourceColumn = preview.startColumn + previewColumn;
        const sourceSquareKey = this.getSquareKey(sourceRow, sourceColumn);
        if (!filledSquares[sourceSquareKey] || !visibleSquareKeys.has(sourceSquareKey)) {
          continue;
        }
        context.fillRect(
          previewColumn * this.previewGridCellSize,
          previewRow * this.previewGridCellSize,
          this.previewGridCellSize,
          this.previewGridCellSize
        );
      }
    }

    context.strokeStyle = 'rgba(255, 255, 255, 0.88)';
    context.lineWidth = 1;
    context.beginPath();

    for (let column = 0; column <= this.previewGridDimension; column += 1) {
      const x = column * this.previewGridCellSize + 0.5;
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }

    for (let row = 0; row <= this.previewGridDimension; row += 1) {
      const y = row * this.previewGridCellSize + 0.5;
      context.moveTo(0, y);
      context.lineTo(width, y);
    }

    context.stroke();

    const squares = Object.values(this.squaresByDungon()[preview.dungonId] ?? {});
    if (squares.length > 0) {
      context.strokeStyle = '#ff2f2f';
      context.lineWidth = 2;
      context.beginPath();

      for (const square of squares) {
        const sourceSquareKey = this.getSquareKey(square.row, square.column);
        if (!visibleSquareKeys.has(sourceSquareKey)) {
          continue;
        }

        const previewRow = square.row - preview.startRow;
        const previewColumn = square.column - preview.startColumn;
        if (
          previewRow < 0 ||
          previewColumn < 0 ||
          previewRow >= this.previewGridDimension ||
          previewColumn >= this.previewGridDimension
        ) {
          continue;
        }

        const left = previewColumn * this.previewGridCellSize;
        const top = previewRow * this.previewGridCellSize;
        const right = left + this.previewGridCellSize;
        const bottom = top + this.previewGridCellSize;

        if (this.isWallConnection(square.toTop)) {
          context.moveTo(left, top);
          context.lineTo(right, top);
        }

        if (this.isWallConnection(square.toRight)) {
          context.moveTo(right, top);
          context.lineTo(right, bottom);
        }

        if (this.isWallConnection(square.toBottom)) {
          context.moveTo(left, bottom);
          context.lineTo(right, bottom);
        }

        if (this.isWallConnection(square.toLeft)) {
          context.moveTo(left, top);
          context.lineTo(left, bottom);
        }
      }

      context.stroke();

      context.strokeStyle = '#20d646';
      context.lineWidth = 2;
      context.beginPath();

      for (const square of squares) {
        const sourceSquareKey = this.getSquareKey(square.row, square.column);
        if (!visibleSquareKeys.has(sourceSquareKey)) {
          continue;
        }

        const previewRow = square.row - preview.startRow;
        const previewColumn = square.column - preview.startColumn;
        if (
          previewRow < 0 ||
          previewColumn < 0 ||
          previewRow >= this.previewGridDimension ||
          previewColumn >= this.previewGridDimension
        ) {
          continue;
        }

        const left = previewColumn * this.previewGridCellSize;
        const top = previewRow * this.previewGridCellSize;
        const right = left + this.previewGridCellSize;
        const bottom = top + this.previewGridCellSize;

        if (this.isDoorConnection(square.toTop) && (!square.toTop.isHidden || square.toTop.isFound)) {
          context.moveTo(left, top);
          context.lineTo(right, top);
        }

        if (this.isDoorConnection(square.toRight) && (!square.toRight.isHidden || square.toRight.isFound)) {
          context.moveTo(right, top);
          context.lineTo(right, bottom);
        }

        if (this.isDoorConnection(square.toBottom) && (!square.toBottom.isHidden || square.toBottom.isFound)) {
          context.moveTo(left, bottom);
          context.lineTo(right, bottom);
        }

        if (this.isDoorConnection(square.toLeft) && (!square.toLeft.isHidden || square.toLeft.isFound)) {
          context.moveTo(left, top);
          context.lineTo(left, bottom);
        }
      }

      context.stroke();
    }

    context.fillStyle = '#2e84ff';
    for (const key of this.keyList) {
      if (key.rownId === null || key.columnId === null) {
        continue;
      }

      if (!visibleSquareKeys.has(this.getSquareKey(key.rownId, key.columnId))) {
        continue;
      }

      const previewRow = key.rownId - preview.startRow;
      const previewColumn = key.columnId - preview.startColumn;
      if (
        previewRow < 0 ||
        previewColumn < 0 ||
        previewRow >= this.previewGridDimension ||
        previewColumn >= this.previewGridDimension
      ) {
        continue;
      }

      const centerX = previewColumn * this.previewGridCellSize + this.previewGridCellSize / 2;
      const centerY = previewRow * this.previewGridCellSize + this.previewGridCellSize / 2;
      context.beginPath();
      context.arc(centerX, centerY, 3, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = '#dbe8ff';
      context.lineWidth = 1;
      context.stroke();
    }

    const tresherPlacements = this.tresherPlacementsByDungon()[preview.dungonId] ?? [];
    for (const placement of tresherPlacements) {
      const placementSquareKey = this.getSquareKey(placement.row, placement.column);
      if (!visibleSquareKeys.has(placementSquareKey)) {
        continue;
      }

      const previewRow = placement.row - preview.startRow;
      const previewColumn = placement.column - preview.startColumn;
      if (
        previewRow < 0 ||
        previewColumn < 0 ||
        previewRow >= this.previewGridDimension ||
        previewColumn >= this.previewGridDimension
      ) {
        continue;
      }

      const centerX = previewColumn * this.previewGridCellSize + this.previewGridCellSize / 2;
      const centerY = previewRow * this.previewGridCellSize + this.previewGridCellSize / 2;
      this.drawTresherCoinMarker(context, centerX, centerY, 3.5);
    }

    const floorItemPlacements = this.floorItemPlacementsByDungon()[preview.dungonId] ?? [];
    for (const placement of floorItemPlacements) {
      const placementSquareKey = this.getSquareKey(placement.row, placement.column);
      if (!visibleSquareKeys.has(placementSquareKey)) {
        continue;
      }

      const previewRow = placement.row - preview.startRow;
      const previewColumn = placement.column - preview.startColumn;
      if (
        previewRow < 0 ||
        previewColumn < 0 ||
        previewRow >= this.previewGridDimension ||
        previewColumn >= this.previewGridDimension
      ) {
        continue;
      }

      const centerX = previewColumn * this.previewGridCellSize + this.previewGridCellSize / 2;
      const centerY = previewRow * this.previewGridCellSize + this.previewGridCellSize / 2;
      this.drawFloorItemMarker(context, centerX, centerY, 3.5);
    }

    const floorPotionPlacements = this.floorPotionPlacementsByDungon()[preview.dungonId] ?? [];
    for (const placement of floorPotionPlacements) {
      const placementSquareKey = this.getSquareKey(placement.row, placement.column);
      if (!visibleSquareKeys.has(placementSquareKey)) {
        continue;
      }

      const previewRow = placement.row - preview.startRow;
      const previewColumn = placement.column - preview.startColumn;
      if (
        previewRow < 0 ||
        previewColumn < 0 ||
        previewRow >= this.previewGridDimension ||
        previewColumn >= this.previewGridDimension
      ) {
        continue;
      }

      const centerX = previewColumn * this.previewGridCellSize + this.previewGridCellSize / 2;
      const centerY = previewRow * this.previewGridCellSize + this.previewGridCellSize / 2;
      this.drawFloorItemMarker(context, centerX, centerY, 3.5);
    }

    const liveMonsterInstancesForMap = this.monsterInstances().filter((m) => this.shouldRenderMonsterInstance(m));
    for (const inst of liveMonsterInstancesForMap) {
      const placementSquareKey = this.getSquareKey(inst.row, inst.column);
      if (!visibleSquareKeys.has(placementSquareKey)) {
        continue;
      }

      const previewRow = inst.row - preview.startRow;
      const previewColumn = inst.column - preview.startColumn;
      if (
        previewRow < 0 ||
        previewColumn < 0 ||
        previewRow >= this.previewGridDimension ||
        previewColumn >= this.previewGridDimension
      ) {
        continue;
      }

      const centerX = previewColumn * this.previewGridCellSize + this.previewGridCellSize / 2;
      const centerY = previewRow * this.previewGridCellSize + this.previewGridCellSize / 2;

      const sel = this.selectedCombatTarget();
      const oor = this.outOfRangeTarget();
      const isSelected = sel && sel.row === inst.row && sel.column === inst.column;
      const isOutOfRange = oor && oor.row === inst.row && oor.column === inst.column;

      if (isOutOfRange) {
        this.drawMonsterMarkerGreen(context, centerX, centerY, 3.5);
      } else if (isSelected) {
        this.drawMonsterMarkerSelected(context, centerX, centerY, 3.5);
      } else {
        this.drawMonsterMarker(context, centerX, centerY, 3.5);
      }
    }

    const selectedTarget = this.selectedCombatTarget();
    if (selectedTarget) {
      const selectedMonster = liveMonsterInstancesForMap.find((inst) => inst.row === selectedTarget.row && inst.column === selectedTarget.column);
      if (!selectedMonster) {
        const targetKey = this.getSquareKey(selectedTarget.row, selectedTarget.column);
        if (visibleSquareKeys.has(targetKey)) {
          const previewRow = selectedTarget.row - preview.startRow;
          const previewColumn = selectedTarget.column - preview.startColumn;
          if (
            previewRow >= 0 &&
            previewColumn >= 0 &&
            previewRow < this.previewGridDimension &&
            previewColumn < this.previewGridDimension
          ) {
            const centerX = previewColumn * this.previewGridCellSize + this.previewGridCellSize / 2;
            const centerY = previewRow * this.previewGridCellSize + this.previewGridCellSize / 2;
            context.beginPath();
            context.arc(centerX, centerY, this.previewGridCellSize / 2 - 1, 0, Math.PI * 2);
            context.strokeStyle = '#ff66cc';
            context.lineWidth = 2.5;
            context.stroke();
          }
        }
      }
    }

    const startpoint = this.startPointByDungon()[preview.dungonId] ?? null;
    if (
      startpoint &&
      visibleSquareKeys.has(this.getSquareKey(startpoint.row, startpoint.col))
    ) {
      const previewRow = startpoint.row - preview.startRow;
      const previewColumn = startpoint.col - preview.startColumn;
      if (
        previewRow >= 0 &&
        previewColumn >= 0 &&
        previewRow < this.previewGridDimension &&
        previewColumn < this.previewGridDimension
      ) {
        const centerX = previewColumn * this.previewGridCellSize + this.previewGridCellSize / 2;
        const centerY = previewRow * this.previewGridCellSize + this.previewGridCellSize / 2;
        context.fillStyle = '#ff3b30';
        context.beginPath();
        context.arc(centerX, centerY, 4, 0, Math.PI * 2);
        context.fill();

        context.strokeStyle = '#ffd6d3';
        context.lineWidth = 1;
        context.stroke();
      }
    }

    // Draw "T" markers for square texts
    for (const st of this.squareTextsByDungon()[preview.dungonId] ?? []) {
      if (!visibleSquareKeys.has(this.getSquareKey(st.row, st.column))) {
        continue;
      }

      const previewRow = st.row - preview.startRow;
      const previewColumn = st.column - preview.startColumn;
      if (
        previewRow >= 0 &&
        previewColumn >= 0 &&
        previewRow < this.previewGridDimension &&
        previewColumn < this.previewGridDimension
      ) {
        const centerX = previewColumn * this.previewGridCellSize + this.previewGridCellSize / 2;
        const centerY = previewRow * this.previewGridCellSize + this.previewGridCellSize / 2;
        context.fillStyle = '#e17055';
        context.font = 'bold 9px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('T', centerX, centerY);
      }
    }

    // Draw portal markers (purple) for start/end points
    const portalsForMap = this.portalPlacementsByDungon()[preview.dungonId] ?? [];
    for (const portal of portalsForMap) {
      const symbolFor = (look: PortalLook) => (look === 'starDown' ? '▼' : look === 'magicDoor' ? '⊡' : '▲');
      // The far end of a two-way star portal shows the opposite look (starUp <-> starDown).
      const endLook: PortalLook = portal.look === 'starUp' ? 'starDown' : portal.look === 'starDown' ? 'starUp' : portal.look;
      const drawPortalDot = (row: number | null, col: number | null, symbol: string): void => {
        if (row === null || col === null) return;
        if (!visibleSquareKeys.has(this.getSquareKey(row, col))) return;
        const pRow = row - preview.startRow;
        const pCol = col - preview.startColumn;
        if (pRow < 0 || pCol < 0 || pRow >= this.previewGridDimension || pCol >= this.previewGridDimension) return;
        const cx = pCol * this.previewGridCellSize + this.previewGridCellSize / 2;
        const cy = pRow * this.previewGridCellSize + this.previewGridCellSize / 2;
        context.fillStyle = '#cc44ff';
        context.font = 'bold 9px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(symbol, cx, cy);
      };
      drawPortalDot(portal.startRow, portal.startColumn, symbolFor(portal.look));
      drawPortalDot(portal.endRow, portal.endColumn, symbolFor(endLook));
    }

    const centerPreviewRow = preview.centerRow - preview.startRow;
    const centerPreviewColumn = preview.centerColumn - preview.startColumn;
    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const displayDirection = this.getDisplayedFacingDirection(
      preview.dungonId,
      cheater.facingDir
    );
    if (
      centerPreviewRow >= 0 &&
      centerPreviewColumn >= 0 &&
      centerPreviewRow < this.previewGridDimension &&
      centerPreviewColumn < this.previewGridDimension
    ) {
      context.strokeStyle = '#f3d13d';
      context.lineWidth = 2;
      context.strokeRect(
        centerPreviewColumn * this.previewGridCellSize + 1,
        centerPreviewRow * this.previewGridCellSize + 1,
        this.previewGridCellSize - 2,
        this.previewGridCellSize - 2
      );

      this.drawFacingArrow(
        context,
        centerPreviewColumn * this.previewGridCellSize,
        centerPreviewRow * this.previewGridCellSize,
        this.previewGridCellSize,
        displayDirection
      );
    }

    // Draw spell target mode highlights (purple ring around each selected target)
    const targetMode = this.spellTargetMode();
    if (targetMode) {
      for (const t of targetMode.targets) {
        const tpRow = t.row - preview.startRow;
        const tpCol = t.column - preview.startColumn;
        if (tpRow >= 0 && tpCol >= 0 && tpRow < this.previewGridDimension && tpCol < this.previewGridDimension) {
          const cx = tpCol * this.previewGridCellSize + this.previewGridCellSize / 2;
          const cy = tpRow * this.previewGridCellSize + this.previewGridCellSize / 2;
          context.beginPath();
          context.arc(cx, cy, this.previewGridCellSize / 2 - 1, 0, Math.PI * 2);
          context.strokeStyle = '#cc44ff';
          context.lineWidth = 2.5;
          context.stroke();
        }
      }
    }

    // Draw monster hit splat/glow rings
    const glowKeys = this.monsterGlowKeys();
    const impactByKey = this.monsterImpactEffects();
    if (glowKeys.size > 0) {
      for (const inst of this.monsterInstances()) {
        const key = `${inst.row}_${inst.column}`;
        if (!glowKeys.has(key)) continue;
        const gpRow = inst.row - preview.startRow;
        const gpCol = inst.column - preview.startColumn;
        if (gpRow >= 0 && gpCol >= 0 && gpRow < this.previewGridDimension && gpCol < this.previewGridDimension) {
          const cx = gpCol * this.previewGridCellSize + this.previewGridCellSize / 2;
          const cy = gpRow * this.previewGridCellSize + this.previewGridCellSize / 2;
          const impact = impactByKey[key];
          const pulse = (Math.sin(this.monsterImpactPulse() * 0.55) + 1) / 2;
          const ringColor = impact?.color ?? (impact?.kind === 'blood' || impact?.kind === 'rangedTarget'
            ? '#c61d2d'
            : impact?.kind === 'lightning'
              ? '#8de8ff'
              : impact?.kind === 'ice'
                ? '#62c7ff'
                : impact?.kind === 'fire'
                  ? '#ff5028'
                  : impact?.kind === 'mind'
                    ? '#44dd77'
                    : '#f4cf63');
          const coreColor = impact?.kind === 'blood' || impact?.kind === 'rangedTarget'
            ? 'rgba(198, 29, 45, 0.34)'
            : impact?.kind === 'lightning'
              ? 'rgba(140, 232, 255, 0.28)'
              : impact?.kind === 'ice'
                ? 'rgba(100, 210, 255, 0.40)'
                : impact?.kind === 'fire'
                  ? 'rgba(255, 95, 42, 0.42)'
                  : impact?.kind === 'mind'
                    ? 'rgba(70, 220, 120, 0.35)'
                    : 'rgba(244, 207, 99, 0.35)';

          context.save();
          context.shadowColor = ringColor;
          context.shadowBlur = 11 + pulse * 8;
          context.fillStyle = coreColor;
          context.beginPath();
          context.arc(cx, cy, this.previewGridCellSize * (0.24 + pulse * 0.1), 0, Math.PI * 2);
          context.fill();
          context.beginPath();
          context.arc(cx, cy, this.previewGridCellSize * (0.38 + pulse * 0.12), 0, Math.PI * 2);
          context.strokeStyle = ringColor;
          context.lineWidth = 3;
          context.stroke();

          // Splat spikes so every hit has a visible impact burst.
          const spikeCount = 9;
          for (let i = 0; i < spikeCount; i += 1) {
            const ang = (Math.PI * 2 * i) / spikeCount + pulse * 0.7;
            const r1 = this.previewGridCellSize * 0.14;
            const r2 = this.previewGridCellSize * (0.26 + pulse * 0.11);
            context.beginPath();
            context.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
            context.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
            context.strokeStyle = ringColor;
            context.lineWidth = 1.7;
            context.stroke();
          }

          context.restore();
        }
      }
    }

    this.drawFirstPersonViewCanvas();
  }

  private drawFirstPersonViewCanvas(): void {
    const preview = this.gridPreviewContext();
    const canvas = this.firstPersonCanvasRef?.nativeElement;
    if (!preview || !canvas) {
      return;
    }

    const width = this.firstPersonCanvasWidth;
    const height = this.firstPersonCanvasHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const ceilingGradient = context.createLinearGradient(0, 0, 0, height / 2);
    ceilingGradient.addColorStop(0, '#1a1a2e');
    ceilingGradient.addColorStop(0.5, '#2a2a4a');
    ceilingGradient.addColorStop(1, '#3d3d5c');
    context.fillStyle = ceilingGradient;
    context.fillRect(0, 0, width, height / 2);

    const floorGradient = context.createLinearGradient(0, height / 2, 0, height);
    floorGradient.addColorStop(0, '#3b3024');
    floorGradient.addColorStop(0.4, '#4a3c2e');
    floorGradient.addColorStop(1, '#2e2418');
    context.fillStyle = floorGradient;
    context.fillRect(0, height / 2, width, height / 2);

    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const displayDirection = this.getDisplayedFacingDirection(
      preview.dungonId,
      cheater.facingDir
    );
    const firstPersonView = this.getFirstPersonView(preview, cheater);
    const tresherPlacements = this.tresherPlacementsByDungon()[preview.dungonId] ?? [];
    const treshersById = new Map(
      (this.tresherListByDungon()[preview.dungonId] ?? []).map((tresher) => [tresher.id, tresher])
    );
    const floorItemsById = new Map<number, { imageId?: number | null }>(
      (this.floorItemListByDungon()[preview.dungonId] ?? []).map((item) => [item.id, item])
    );
    for (const item of this.pcTresherItemsById().values()) {
      if (!floorItemsById.has(item.id)) {
        floorItemsById.set(item.id, item);
      }
    }
    const tresherCountBySquare = new Map<string, number>();
    const bagSquareKeys = new Set<string>();
    const lootImageBySquare = new Map<string, HTMLImageElement | null>();
    for (const placement of tresherPlacements) {
      const squareKey = this.getSquareKey(placement.row, placement.column);
      const existingCount = tresherCountBySquare.get(squareKey) ?? 0;
      tresherCountBySquare.set(squareKey, existingCount + 1);
      bagSquareKeys.add(squareKey);
      if (!lootImageBySquare.has(squareKey)) {
        const tresher = treshersById.get(placement.tresherId);
        const displayImageId = this.resolveTresherDisplayImageId(tresher, floorItemsById);
        const tresherImage = typeof displayImageId === 'number' && displayImageId > 0
          ? (this.lootImageCache.get(displayImageId) ?? null)
          : null;
        lootImageBySquare.set(squareKey, tresherImage);
      }
    }
    for (const placement of (this.floorItemPlacementsByDungon()[preview.dungonId] ?? [])) {
      const squareKey = this.getSquareKey(placement.row, placement.column);
      bagSquareKeys.add(squareKey);
      if (!lootImageBySquare.has(squareKey)) {
        const item = (this.floorItemListByDungon()[preview.dungonId] ?? []).find((it) => it.id === placement.itemId) ?? null;
        const itemImage = item && typeof item.imageId === 'number' && item.imageId > 0
          ? (this.lootImageCache.get(item.imageId) ?? null)
          : null;
        lootImageBySquare.set(squareKey, itemImage);
      }
    }
    for (const placement of (this.floorPotionPlacementsByDungon()[preview.dungonId] ?? [])) {
      bagSquareKeys.add(this.getSquareKey(placement.row, placement.column));
    }

    const obstacleSquareKeys = new Set<string>();
    const obstacleImageBySquare = new Map<string, HTMLImageElement | null>();
    for (const obs of this.obstaclePlacementsByDungon()[preview.dungonId] ?? []) {
      if (obs.isDestroyed) continue;
      const squareKey = this.getSquareKey(obs.row, obs.column);
      obstacleSquareKeys.add(squareKey);
      const image = obs.imageId !== null ? (this.obstacleImageCache.get(obs.imageId) ?? null) : null;
      obstacleImageBySquare.set(squareKey, image);
    }

    const liveMonsterInstances = this.monsterInstances().filter((m) => this.shouldRenderMonsterInstance(m));
    const monstersById = this.getMonstersByIdForDungon(preview.dungonId);
    const monsterImageBySquare = new Map<string, HTMLImageElement | null>();
    for (const inst of liveMonsterInstances) {
      const squareKey = this.getSquareKey(inst.row, inst.column);
      const monster = monstersById.get(inst.monsterId);
      const imageId = monster?.imageId ?? null;
      const img = imageId !== null ? (this.monsterImageCache.get(imageId) ?? null) : null;
      monsterImageBySquare.set(squareKey, img);
    }

    if (firstPersonView.steps.length === 0) {
      context.fillStyle = '#d1d6de';
      context.font = '13px sans-serif';
      context.fillText('No first-person view for this tile.', 16, height / 2);
      return;
    }

    const maxFrameDepth = Math.max(2, Math.min(12, firstPersonView.steps.length + 0.85));
    const frameAtDepth = (depth: number): { left: number; right: number; top: number; bottom: number } => {
      const ratio = Math.min(1, depth / maxFrameDepth);
      const marginX = ratio * (width * 0.41);
      const marginY = ratio * (height * 0.33);
      return {
        left: marginX,
        right: width - marginX,
        top: marginY,
        bottom: height - marginY,
      };
    };

    const depthSegments = firstPersonView.steps.map((step, depth) => ({
      depth,
      step,
      nearFrame: frameAtDepth(depth),
      farFrame: frameAtDepth(depth + 1),
    }));
    const farToNearSegments = [...depthSegments].reverse();

    // Pass 1: paint floor and ceiling perspective bands first.
    for (const segment of farToNearSegments) {
      const { depth, nearFrame, farFrame } = segment;
      const depthAlpha = Math.max(0.06, 0.25 - depth * 0.03);
      const floorPoints = [
        { x: nearFrame.left, y: nearFrame.bottom },
        { x: nearFrame.right, y: nearFrame.bottom },
        { x: farFrame.right, y: farFrame.bottom },
        { x: farFrame.left, y: farFrame.bottom },
      ];
      const ceilingPoints = [
        { x: nearFrame.left, y: nearFrame.top },
        { x: nearFrame.right, y: nearFrame.top },
        { x: farFrame.right, y: farFrame.top },
        { x: farFrame.left, y: farFrame.top },
      ];

      const floorGradient = context.createLinearGradient(0, farFrame.bottom, 0, nearFrame.bottom);
      floorGradient.addColorStop(0, `rgba(64, 51, 39, ${Math.min(0.72, depthAlpha + 0.04)})`);
      floorGradient.addColorStop(1, `rgba(90, 71, 54, ${Math.min(0.78, depthAlpha + 0.1)})`);
      context.fillStyle = floorGradient;
      context.beginPath();
      context.moveTo(nearFrame.left, nearFrame.bottom);
      context.lineTo(nearFrame.right, nearFrame.bottom);
      context.lineTo(farFrame.right, farFrame.bottom);
      context.lineTo(farFrame.left, farFrame.bottom);
      context.closePath();
      context.fill();
      this.drawSurfaceTextureInPolygon(
        context,
        floorPoints,
        nearFrame.left * 3 + nearFrame.bottom * 5 + farFrame.right * 7 + depth * 29,
        depth,
        'floor'
      );

      // Side floor extensions: fill corner areas below the frame on each side.
      const leftFloorExt = [
        { x: 0, y: nearFrame.bottom },
        { x: nearFrame.left, y: nearFrame.bottom },
        { x: farFrame.left, y: farFrame.bottom },
        { x: 0, y: farFrame.bottom },
      ];
      const rightFloorExt = [
        { x: nearFrame.right, y: nearFrame.bottom },
        { x: width, y: nearFrame.bottom },
        { x: width, y: farFrame.bottom },
        { x: farFrame.right, y: farFrame.bottom },
      ];
      context.fillStyle = floorGradient;
      context.beginPath();
      context.moveTo(0, nearFrame.bottom);
      context.lineTo(nearFrame.left, nearFrame.bottom);
      context.lineTo(farFrame.left, farFrame.bottom);
      context.lineTo(0, farFrame.bottom);
      context.closePath();
      context.fill();
      this.drawSurfaceTextureInPolygon(
        context,
        leftFloorExt,
        nearFrame.left * 3 + nearFrame.bottom * 5 + farFrame.right * 7 + depth * 29 + 31,
        depth,
        'floor'
      );
      context.fillStyle = floorGradient;
      context.beginPath();
      context.moveTo(nearFrame.right, nearFrame.bottom);
      context.lineTo(width, nearFrame.bottom);
      context.lineTo(width, farFrame.bottom);
      context.lineTo(farFrame.right, farFrame.bottom);
      context.closePath();
      context.fill();
      this.drawSurfaceTextureInPolygon(
        context,
        rightFloorExt,
        nearFrame.right * 3 + nearFrame.bottom * 5 + farFrame.left * 7 + depth * 29 + 37,
        depth,
        'floor'
      );

      const ceilingGradient = context.createLinearGradient(0, nearFrame.top, 0, farFrame.top);
      ceilingGradient.addColorStop(0, `rgba(38, 34, 58, ${Math.min(0.72, depthAlpha + 0.09)})`);
      ceilingGradient.addColorStop(1, `rgba(58, 53, 80, ${Math.min(0.76, depthAlpha + 0.05)})`);
      context.fillStyle = ceilingGradient;
      context.beginPath();
      context.moveTo(nearFrame.left, nearFrame.top);
      context.lineTo(nearFrame.right, nearFrame.top);
      context.lineTo(farFrame.right, farFrame.top);
      context.lineTo(farFrame.left, farFrame.top);
      context.closePath();
      context.fill();
      this.drawSurfaceTextureInPolygon(
        context,
        ceilingPoints,
        nearFrame.right * 11 + nearFrame.top * 13 + farFrame.left * 17 + depth * 31,
        depth,
        'ceiling'
      );

      // Side ceiling extensions: fill corner areas above the frame on each side.
      const leftCeilingExt = [
        { x: 0, y: nearFrame.top },
        { x: nearFrame.left, y: nearFrame.top },
        { x: farFrame.left, y: farFrame.top },
        { x: 0, y: farFrame.top },
      ];
      const rightCeilingExt = [
        { x: nearFrame.right, y: nearFrame.top },
        { x: width, y: nearFrame.top },
        { x: width, y: farFrame.top },
        { x: farFrame.right, y: farFrame.top },
      ];
      context.fillStyle = ceilingGradient;
      context.beginPath();
      context.moveTo(0, nearFrame.top);
      context.lineTo(nearFrame.left, nearFrame.top);
      context.lineTo(farFrame.left, farFrame.top);
      context.lineTo(0, farFrame.top);
      context.closePath();
      context.fill();
      this.drawSurfaceTextureInPolygon(
        context,
        leftCeilingExt,
        nearFrame.right * 11 + nearFrame.top * 13 + farFrame.left * 17 + depth * 31 + 41,
        depth,
        'ceiling'
      );
      context.fillStyle = ceilingGradient;
      context.beginPath();
      context.moveTo(nearFrame.right, nearFrame.top);
      context.lineTo(width, nearFrame.top);
      context.lineTo(width, farFrame.top);
      context.lineTo(farFrame.right, farFrame.top);
      context.closePath();
      context.fill();
      this.drawSurfaceTextureInPolygon(
        context,
        rightCeilingExt,
        nearFrame.left * 11 + nearFrame.top * 13 + farFrame.right * 17 + depth * 31 + 47,
        depth,
        'ceiling'
      );
    }

    const endFrame = frameAtDepth(firstPersonView.steps.length);
    const endStep = firstPersonView.steps[firstPersonView.steps.length - 1] ?? null;
    const canExtendEndWall = firstPersonView.endBlock.type === 'wall' && endStep !== null;
    const leftEndHasVisibleBackSurface =
      canExtendEndWall &&
      endStep.leftOpeningBackBlock !== null &&
      endStep.leftOpeningBackBlock.type !== 'none' &&
      endStep.leftOpeningBackBlock.type !== 'void' &&
      this.canSeeOpeningBackWallAtDepth(
        firstPersonView.steps,
        firstPersonView.steps.length - 1,
        'left'
      );
    const rightEndHasVisibleBackSurface =
      canExtendEndWall &&
      endStep.rightOpeningBackBlock !== null &&
      endStep.rightOpeningBackBlock.type !== 'none' &&
      endStep.rightOpeningBackBlock.type !== 'void' &&
      this.canSeeOpeningBackWallAtDepth(
        firstPersonView.steps,
        firstPersonView.steps.length - 1,
        'right'
      );
    const endWallExtension = canExtendEndWall
      ? Math.max(2, (endFrame.right - endFrame.left) * 0.18)
      : 0;
    const extendedEndLeft =
      leftEndHasVisibleBackSurface
        ? 0
        : canExtendEndWall
        ? Math.max(0, endFrame.left - endWallExtension)
        : endFrame.left;
    const extendedEndRight =
      rightEndHasVisibleBackSurface
        ? width
        : canExtendEndWall
        ? Math.min(width, endFrame.right + endWallExtension)
        : endFrame.right;
    const endWallWidth = Math.max(0, extendedEndRight - extendedEndLeft);
    const endFillColor =
      firstPersonView.endBlock.type === 'none'
        ? '#000000'
        : this.getFirstPersonFrontColor(firstPersonView.endBlock.type);
    context.fillStyle = endFillColor;
    context.fillRect(
      extendedEndLeft,
      endFrame.top,
      endWallWidth,
      endFrame.bottom - endFrame.top
    );

    if (firstPersonView.endBlock.type !== 'none') {
      context.strokeStyle = 'rgba(250, 250, 250, 0.26)';
      context.lineWidth = 1;
      context.strokeRect(
        extendedEndLeft,
        endFrame.top,
        endWallWidth,
        endFrame.bottom - endFrame.top
      );

      if (firstPersonView.endBlock.type === 'wall') {
        const endWallSeed =
          extendedEndLeft * 7 + endFrame.top * 13 + firstPersonView.steps.length * 19;
        this.drawBrickPatternInRect(
          context,
          extendedEndLeft,
          endFrame.top,
          endWallWidth,
          endFrame.bottom - endFrame.top,
          endWallSeed + 179,
          firstPersonView.steps.length
        );
      }

      if (
        firstPersonView.endBlock.type === 'openDoor' ||
        firstPersonView.endBlock.type === 'closedDoor'
      ) {
        this.drawFirstPersonDoorFace(context, endFrame, firstPersonView.endBlock, false);
      }
    }

    // Pass 2: draw walls, side surfaces, and portals.

    for (const segment of farToNearSegments) {
      const { depth, step, nearFrame, farFrame } = segment;

      const leftOpeningBackBlock = step.leftOpeningBackBlock;
      const rightOpeningBackBlock = step.rightOpeningBackBlock;
      const canSeeLeftOpeningBackWall = this.canSeeOpeningBackWallAtDepth(
        firstPersonView.steps,
        depth,
        'left'
      );
      const canSeeRightOpeningBackWall = this.canSeeOpeningBackWallAtDepth(
        firstPersonView.steps,
        depth,
        'right'
      );

      if (leftOpeningBackBlock && canSeeLeftOpeningBackWall) {
        this.drawFirstPersonOpeningBackWall(
          context,
          nearFrame,
          farFrame,
          'left',
          leftOpeningBackBlock,
          depth,
          true
        );
      }

      if (rightOpeningBackBlock && canSeeRightOpeningBackWall) {
        this.drawFirstPersonOpeningBackWall(
          context,
          nearFrame,
          farFrame,
          'right',
          rightOpeningBackBlock,
          depth,
          true
        );
      }
    }

    for (const segment of farToNearSegments) {
      const { depth, step, nearFrame, farFrame } = segment;

      this.drawFirstPersonSideSurface(context, nearFrame, farFrame, 'left', step.leftBlock, depth);
      this.drawFirstPersonSideSurface(context, nearFrame, farFrame, 'right', step.rightBlock, depth);

      if (step.forwardDoor && step.forwardDoor.type === 'openDoor') {
        this.drawFirstPersonDoorFace(context, farFrame, step.forwardDoor, true);
      }
    }

    // Pass 3: draw floor items and monsters last so they stay visible.
    for (const segment of farToNearSegments) {
      const { step, nearFrame, farFrame } = segment;
      const visibleSlots = [...step.visibleMonsterSlots];

      const visibleObstacleSlots = visibleSlots.filter((slot) => obstacleSquareKeys.has(slot.squareKey));
      if (visibleObstacleSlots.length > 0) {
        const lateralRange = Math.max(
          1,
          ...visibleObstacleSlots.map((slot) => Math.abs(slot.lateralOffset))
        );

        for (const slot of visibleObstacleSlots) {
          const obstacleImage = obstacleImageBySquare.get(slot.squareKey) ?? null;
          if (slot.isPeek) {
            this.drawFirstPersonPeekObstacle(
              context,
              width,
              nearFrame,
              farFrame,
              obstacleImage,
              slot.lateralOffset < 0 ? 'left' : 'right'
            );
          } else {
            this.drawFirstPersonObstacle(
              context,
              nearFrame,
              farFrame,
              obstacleImage,
              slot.lateralOffset,
              lateralRange
            );
          }
        }
      }

      const visibleBagSlots = visibleSlots.filter((slot) => bagSquareKeys.has(slot.squareKey));
      if (visibleBagSlots.length > 0) {
        const lateralRange = Math.max(
          1,
          ...visibleBagSlots.map((slot) => Math.abs(slot.lateralOffset))
        );

        for (const slot of visibleBagSlots) {
          const lootImage = lootImageBySquare.get(slot.squareKey) ?? null;
          if (slot.isPeek) {
            this.drawFirstPersonPeekBag(
              context,
              width,
              nearFrame,
              farFrame,
              lootImage,
              slot.lateralOffset < 0 ? 'left' : 'right'
            );
          } else {
            this.drawFirstPersonFloorBag(
              context,
              nearFrame,
              farFrame,
              lootImage,
              slot.lateralOffset,
              lateralRange
            );
          }
        }
      }

      if (step.hasKey) {
        this.drawFirstPersonFloorKey(context, nearFrame, farFrame);
      }

      if (step.visibleMonsterSlots.length > 0) {
        const visibleMonsterSlots = [...step.visibleMonsterSlots].sort(
          (leftSlot, rightSlot) =>
            Math.abs(rightSlot.lateralOffset) - Math.abs(leftSlot.lateralOffset)
        );
        const lateralRange = Math.max(
          1,
          ...visibleMonsterSlots.map((slot) => Math.abs(slot.lateralOffset))
        );

        for (const slot of visibleMonsterSlots) {
          if (!monsterImageBySquare.has(slot.squareKey)) {
            continue;
          }

          if (slot.isPeek) {
            this.drawFirstPersonPeekMonster(
              context,
              width,
              nearFrame,
              farFrame,
              monsterImageBySquare.get(slot.squareKey) ?? null,
              slot.lateralOffset < 0 ? 'left' : 'right'
            );
          } else {
            this.drawFirstPersonMonster(
              context,
              nearFrame,
              farFrame,
              monsterImageBySquare.get(slot.squareKey) ?? null,
              slot.lateralOffset,
              lateralRange
            );
          }
        }
      }
    }

    this.drawFirstPersonAngleGuideLines(context, frameAtDepth(0), frameAtDepth(1));
  }

  private drawFirstPersonAngleGuideLines(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number }
  ): void {
    const lerp = (start: number, end: number, t: number): number => start + (end - start) * t;

    const drawGuidesOnSide = (side: 'left' | 'right'): void => {
      const nearX = side === 'left' ? nearFrame.left : nearFrame.right;
      const farX = side === 'left' ? farFrame.left : farFrame.right;
      const topDy = farFrame.top - nearFrame.top;

      const drawSegment = (
        nearBaseY: number,
        tStart: number,
        tEnd: number,
        color: string,
        lineWidth: number
      ): void => {
        const x1 = lerp(nearX, farX, tStart);
        const y1 = nearBaseY + topDy * tStart;
        const x2 = lerp(nearX, farX, tEnd);
        const y2 = nearBaseY + topDy * tEnd;

        // Dark underlay to keep the guide visible over any wall texture.
        context.strokeStyle = 'rgba(8, 12, 18, 0.95)';
        context.lineWidth = lineWidth + 2;
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        context.stroke();

        context.strokeStyle = color;
        context.lineWidth = lineWidth;
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        context.stroke();

        // Tiny endpoint markers help confirm the exact drawn slope.
        context.fillStyle = color;
        context.beginPath();
        context.arc(x1, y1, 1.8, 0, Math.PI * 2);
        context.arc(x2, y2, 1.8, 0, Math.PI * 2);
        context.fill();
      };

      // Guide 1: top-edge angle guide (yellow)
      // Positioned away from compass/heart overlays and canvas edges.
      const topNearY = nearFrame.top + 8;
      drawSegment(topNearY, 0.34, 0.72, '#ffd44a', 2.8);

      // Guide 2: mortar-row angle guide (cyan) in the middle of the wall.
      const middleNearY = lerp(nearFrame.top, nearFrame.bottom, 0.58);
      drawSegment(middleNearY, 0.36, 0.78, '#34d9ff', 2.6);
    };

    context.save();
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    drawGuidesOnSide('left');
    drawGuidesOnSide('right');
    context.restore();
  }

  private getFirstPersonView(preview: GridPreviewContext, cheater: Cheater): FirstPersonView {
    const squares = this.squaresByDungon()[preview.dungonId] ?? {};
    const filledSquares = this.filledSquaresByDungon()[preview.dungonId] ?? {};
    const startSquareKey = this.getSquareKey(preview.centerRow, preview.centerColumn);
    if (!squares[startSquareKey] || !filledSquares[startSquareKey]) {
      return {
        steps: [],
        endBlock: this.toFirstPersonBlock('void', null),
      };
    }

    const forward = this.getMovementDeltaForFacingDirection(cheater.facingDir);
    const leftOffset = {
      rowOffset: -forward.columnOffset,
      columnOffset: forward.rowOffset,
    };
    const rightOffset = {
      rowOffset: forward.columnOffset,
      columnOffset: -forward.rowOffset,
    };
    const keyPositions = new Set(
      this.keyList
        .filter((key) => key.rownId !== null && key.columnId !== null)
        .map((key) => this.getSquareKey(key.rownId ?? -1, key.columnId ?? -1))
    );

    const steps: FirstPersonStep[] = [];
    const addStep = (row: number, column: number): void => {
      const squareKey = this.getSquareKey(row, column);
      const leftBlock = this.getLateralBlockType(
        preview.dungonId,
        row,
        column,
        leftOffset.rowOffset,
        leftOffset.columnOffset
      );
      const rightBlock = this.getLateralBlockType(
        preview.dungonId,
        row,
        column,
        rightOffset.rowOffset,
        rightOffset.columnOffset
      );

      steps.push({
        row,
        column,
        leftBlock,
        rightBlock,
        leftOpeningBackBlock:
          leftBlock.type === 'none'
            ? this.getSideOpeningBackBlock(
                preview.dungonId,
                row,
                column,
                leftOffset.rowOffset,
                leftOffset.columnOffset,
                forward.rowOffset,
                forward.columnOffset
              )
            : null,
        rightOpeningBackBlock:
          rightBlock.type === 'none'
            ? this.getSideOpeningBackBlock(
                preview.dungonId,
                row,
                column,
                rightOffset.rowOffset,
                rightOffset.columnOffset,
                forward.rowOffset,
                forward.columnOffset
              )
            : null,
        forwardDoor: null,
        visibleMonsterSlots: [],
        hasKey: keyPositions.has(squareKey),
      });
    };

    let currentRow = preview.centerRow;
    let currentColumn = preview.centerColumn;
    addStep(currentRow, currentColumn);

    const maxDepth = Math.max(
      1,
      Math.min(this.firstPersonMaxDepth, Math.floor(Math.max(1, this.getEffectiveRangeOfSight(preview.dungonId) + 1)))
    );
    let endBlock: FirstPersonBlock = this.toFirstPersonBlock('none', null);

    for (let depth = 0; depth < maxDepth; depth += 1) {
      const nextRow = currentRow + forward.rowOffset;
      const nextColumn = currentColumn + forward.columnOffset;
      const forwardConnection = this.getMovementConnectionInfoBetweenAdjacentSquares(
        preview.dungonId,
        currentRow,
        currentColumn,
        nextRow,
        nextColumn
      );

      if (
        forwardConnection.type === 'openDoor' ||
        forwardConnection.type === 'closedDoor'
      ) {
        steps[steps.length - 1] = {
          ...steps[steps.length - 1],
          forwardDoor: this.toFirstPersonBlock(forwardConnection.type, forwardConnection.door),
        };
      }

      if (forwardConnection.type === 'wall' || forwardConnection.type === 'closedDoor') {
        endBlock = this.toFirstPersonBlock(forwardConnection.type, forwardConnection.door);
        break;
      }

      const nextSquareKey = this.getSquareKey(nextRow, nextColumn);
      if (!squares[nextSquareKey] || !filledSquares[nextSquareKey]) {
        endBlock = this.toFirstPersonBlock('void', null);
        break;
      }

      currentRow = nextRow;
      currentColumn = nextColumn;
      addStep(currentRow, currentColumn);
    }

    for (let depth = 0; depth < steps.length; depth += 1) {
      const step = steps[depth];
      steps[depth] = {
        ...step,
        visibleMonsterSlots: this.getVisibleMonsterSlotsForDepth(
          preview.dungonId,
          steps,
          depth,
          step.row,
          step.column,
          leftOffset,
          rightOffset
        ),
      };
    }

    return {
      steps,
      endBlock,
    };
  }

  private drawFirstPersonSideSurface(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    side: 'left' | 'right',
    block: FirstPersonBlock,
    wallDepth: number
  ): void {
    if (block.type === 'none' || block.type === 'void') {
      return;
    }

    const seamPad = block.type === 'wall' ? 1.4 : 1;
    const verticalPad = block.type === 'wall' ? 0.8 : 0.5;

    const points =
      side === 'left'
        ? [
            { x: nearFrame.left - seamPad, y: nearFrame.top - verticalPad },
            { x: farFrame.left - seamPad, y: farFrame.top - verticalPad },
            { x: farFrame.left - seamPad, y: farFrame.bottom + verticalPad },
            { x: nearFrame.left - seamPad, y: nearFrame.bottom + verticalPad },
          ]
        : [
            { x: nearFrame.right + seamPad, y: nearFrame.top - verticalPad },
            { x: farFrame.right + seamPad, y: farFrame.top - verticalPad },
            { x: farFrame.right + seamPad, y: farFrame.bottom + verticalPad },
            { x: nearFrame.right + seamPad, y: nearFrame.bottom + verticalPad },
          ];

    context.fillStyle =
      block.type === 'wall'
        ? this.getFirstPersonWallPanelColor(wallDepth)
        : this.getFirstPersonSideColor(block.type);
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    context.lineTo(points[1].x, points[1].y);
    context.lineTo(points[2].x, points[2].y);
    context.lineTo(points[3].x, points[3].y);
    context.closePath();
    context.fill();

    if (block.type === 'wall') {
      const textureSeed = nearFrame.top * 11 + nearFrame.left * 5 + (side === 'left' ? 17 : 29);
      this.drawBrickPatternInPolygon(context, points, textureSeed + 131, wallDepth, true);
    }

    if (block.type === 'closedDoor') {
      this.drawFirstPersonSideDoorMarker(context, nearFrame, farFrame, side, block.type);
    }
  }

  private drawFirstPersonOpeningBackWall(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    side: 'left' | 'right',
    block: FirstPersonBlock,
    wallDepth: number,
    drawConnector = true
  ): void {
    if (block.type === 'none') {
      return;
    }

    const openingWidth =
      side === 'left' ? farFrame.left - nearFrame.left : nearFrame.right - farFrame.right;
    const seamOverlap = 2.4;
    const portalNearX =
      side === 'left' ? nearFrame.left - seamOverlap : nearFrame.right + seamOverlap;
    const canvasWidth = nearFrame.left + nearFrame.right;
    const panelInnerX =
      side === 'left' ? farFrame.left : farFrame.right;
    const panelOuterX =
      side === 'left' ? 0 : canvasWidth;
    const panelLeft = Math.min(panelInnerX, panelOuterX);
    const panelRight = Math.max(panelInnerX, panelOuterX);
    const wallTop = farFrame.top;
    const wallBottom = farFrame.bottom;

    const backWallPoints = [
      { x: panelLeft, y: wallTop },
      { x: panelRight, y: wallTop },
      { x: panelRight, y: wallBottom },
      { x: panelLeft, y: wallBottom },
    ];

    const connectorPoints = [
      { x: portalNearX, y: wallTop },
      { x: panelInnerX, y: wallTop },
      { x: panelInnerX, y: wallBottom },
      { x: portalNearX, y: wallBottom },
    ];

    context.fillStyle = this.getFirstPersonOpeningBackWallColor(block.type, wallDepth);
    if (drawConnector) {
      context.beginPath();
      context.moveTo(connectorPoints[0].x, connectorPoints[0].y);
      for (let index = 1; index < connectorPoints.length; index += 1) {
        context.lineTo(connectorPoints[index].x, connectorPoints[index].y);
      }
      context.closePath();
      context.fill();
    }

    context.beginPath();
    context.moveTo(backWallPoints[0].x, backWallPoints[0].y);
    context.lineTo(backWallPoints[1].x, backWallPoints[1].y);
    context.lineTo(backWallPoints[2].x, backWallPoints[2].y);
    context.lineTo(backWallPoints[3].x, backWallPoints[3].y);
    context.closePath();
    context.fill();

    if (block.type === 'wall') {
      const connectorSeed =
        nearFrame.left * 3 + farFrame.top * 7 + wallDepth * 19 + (side === 'left' ? 41 : 73);
      const backWallSeed =
        nearFrame.top * 5 + farFrame.right * 11 + wallDepth * 23 + (side === 'left' ? 59 : 97);
      if (drawConnector) {
        this.drawBrickPatternInPolygon(context, connectorPoints, connectorSeed + 211, wallDepth + 1);
      }
      this.drawBrickPatternInPolygon(context, backWallPoints, backWallSeed + 257, wallDepth + 1);
    }

    if (block.type !== 'void') {
      context.strokeStyle = 'rgba(222, 232, 245, 0.14)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(backWallPoints[0].x, backWallPoints[0].y);
      context.lineTo(backWallPoints[1].x, backWallPoints[1].y);
      context.lineTo(backWallPoints[2].x, backWallPoints[2].y);
      context.lineTo(backWallPoints[3].x, backWallPoints[3].y);
      context.closePath();
      context.stroke();
    }

    if (block.type === 'openDoor' || block.type === 'closedDoor') {
      const doorFrame =
        side === 'left'
          ? {
              left: backWallPoints[0].x * 0.6 + backWallPoints[1].x * 0.4,
              right: backWallPoints[0].x * 0.25 + backWallPoints[1].x * 0.75,
              top: backWallPoints[1].y,
              bottom: backWallPoints[2].y,
            }
          : {
              left: backWallPoints[0].x * 0.75 + backWallPoints[1].x * 0.25,
              right: backWallPoints[0].x * 0.4 + backWallPoints[1].x * 0.6,
              top: backWallPoints[1].y,
              bottom: backWallPoints[2].y,
            };
      this.drawFirstPersonDoorFace(context, doorFrame, block, false);
    }
  }

  private drawFirstPersonSideDoorMarker(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    side: 'left' | 'right',
    doorType: 'openDoor' | 'closedDoor'
  ): void {
    const midTop = (nearFrame.top + farFrame.top) / 2;
    const midBottom = (nearFrame.bottom + farFrame.bottom) / 2;
    const x =
      side === 'left' ? (nearFrame.left + farFrame.left) / 2 : (nearFrame.right + farFrame.right) / 2;

    context.strokeStyle = '#f0a6a6';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x, midTop + 2);
    context.lineTo(x, midBottom - 2);
    context.stroke();

    if (doorType === 'openDoor') {
      const swing = side === 'left' ? 6 : -6;
      context.strokeStyle = '#ff7f7f';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x, midTop + 4);
      context.lineTo(x + swing, midTop + 9);
      context.stroke();
    }
  }

  private drawFirstPersonMonster(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    image: HTMLImageElement | null,
    lateralOffset: number,
    lateralRange: number
  ): void {
    const midLeft = nearFrame.left * 0.65 + farFrame.left * 0.35;
    const midRight = nearFrame.right * 0.65 + farFrame.right * 0.35;
    const midTop = nearFrame.top * 0.65 + farFrame.top * 0.35;
    const midBottom = nearFrame.bottom * 0.65 + farFrame.bottom * 0.35;
    const tileWidth = midRight - midLeft;
    const tileHeight = midBottom - midTop;
    const normalizedOffset =
      lateralRange <= 0 ? 0 : lateralOffset / (Math.max(1, lateralRange) + 0.65);
    const centeredX = (midLeft + midRight) / 2 + normalizedOffset * tileWidth * 0.82;
    const minCenterX = midLeft + tileWidth * 0.12;
    const maxCenterX = midRight - tileWidth * 0.12;
    const centerX = Math.max(minCenterX, Math.min(maxCenterX, centeredX));
    const scale = 1 - Math.min(0.32, Math.abs(normalizedOffset) * 0.22);

    if (image && image.naturalWidth > 0 && image.naturalHeight > 0) {
      const maxWidth = tileWidth * 0.6 * scale;
      const maxHeight = tileHeight * 0.75 * scale;
      const aspectRatio = image.naturalWidth / image.naturalHeight;
      let drawWidth = maxWidth;
      let drawHeight = drawWidth / aspectRatio;
      if (drawHeight > maxHeight) {
        drawHeight = maxHeight;
        drawWidth = drawHeight * aspectRatio;
      }

      drawWidth = Math.max(8, drawWidth);
      drawHeight = Math.max(8, drawHeight);

      const drawX = centerX - drawWidth / 2;
      const drawY = midBottom - drawHeight;
      context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      return;
    }

    const centerY = midTop + tileHeight * 0.55;
    const size = Math.max(4, Math.min(tileWidth, tileHeight) * 0.25 * scale);

    context.fillStyle = '#d63031';
    context.beginPath();
    context.moveTo(centerX, centerY - size);
    context.lineTo(centerX + size, centerY);
    context.lineTo(centerX, centerY + size);
    context.lineTo(centerX - size, centerY);
    context.closePath();
    context.fill();

    context.strokeStyle = '#ff7675';
    context.lineWidth = 1;
    context.stroke();
  }

  private drawFirstPersonPeekMonster(
    context: CanvasRenderingContext2D,
    canvasWidth: number,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    image: HTMLImageElement | null,
    side: 'left' | 'right'
  ): void {
    const midLeft = nearFrame.left * 0.65 + farFrame.left * 0.35;
    const midRight = nearFrame.right * 0.65 + farFrame.right * 0.35;
    const midTop = nearFrame.top * 0.65 + farFrame.top * 0.35;
    const midBottom = nearFrame.bottom * 0.65 + farFrame.bottom * 0.35;
    const tileWidth = midRight - midLeft;
    const tileHeight = midBottom - midTop;
    const edgeX = side === 'left' ? nearFrame.left : nearFrame.right;

    context.save();
    context.beginPath();
    if (side === 'left') {
      context.rect(nearFrame.left, 0, canvasWidth - nearFrame.left, context.canvas.height);
    } else {
      context.rect(0, 0, nearFrame.right, context.canvas.height);
    }
    context.clip();
    context.globalAlpha = 0.8;

    if (image && image.naturalWidth > 0 && image.naturalHeight > 0) {
      const maxWidth = tileWidth * 0.6;
      const maxHeight = tileHeight * 0.75;
      const aspectRatio = image.naturalWidth / image.naturalHeight;
      let drawWidth = maxWidth;
      let drawHeight = drawWidth / aspectRatio;
      if (drawHeight > maxHeight) {
        drawHeight = maxHeight;
        drawWidth = drawHeight * aspectRatio;
      }
      drawWidth = Math.max(8, drawWidth);
      drawHeight = Math.max(8, drawHeight);
      context.drawImage(image, edgeX - drawWidth / 2, midBottom - drawHeight, drawWidth, drawHeight);
    } else {
      const centerY = midTop + tileHeight * 0.55;
      const size = Math.max(4, Math.min(tileWidth, tileHeight) * 0.25);
      context.fillStyle = '#d63031';
      context.beginPath();
      context.moveTo(edgeX, centerY - size);
      context.lineTo(edgeX + size, centerY);
      context.lineTo(edgeX, centerY + size);
      context.lineTo(edgeX - size, centerY);
      context.closePath();
      context.fill();
      context.strokeStyle = '#ff7675';
      context.lineWidth = 1;
      context.stroke();
    }

    context.globalAlpha = 1;
    context.restore();
  }

  private drawFirstPersonFloorKey(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number }
  ): void {
    const midLeft = (nearFrame.left + farFrame.left) / 2;
    const midRight = (nearFrame.right + farFrame.right) / 2;
    const centerX = (midLeft + midRight) / 2;
    const floorY = (nearFrame.bottom + farFrame.bottom) / 2;
    const tileWidth = midRight - midLeft;
    const size = Math.max(3, Math.min(12, tileWidth * 0.13));

    context.strokeStyle = '#d7e7ff';
    context.fillStyle = '#2e84ff';
    context.lineWidth = Math.max(1, size * 0.18);

    context.beginPath();
    context.arc(centerX - size * 0.42, floorY - size * 0.22, size * 0.3, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    context.beginPath();
    context.moveTo(centerX - size * 0.12, floorY - size * 0.2);
    context.lineTo(centerX + size * 0.56, floorY - size * 0.2);
    context.stroke();
  }

  private drawFirstPersonFloorBag(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    image: HTMLImageElement | null,
    lateralOffset = 0,
    lateralRange = 1
  ): void {
    const midLeft = (nearFrame.left + farFrame.left) / 2;
    const midRight = (nearFrame.right + farFrame.right) / 2;
    const midTop = (nearFrame.top + farFrame.top) / 2;
    const midBottom = (nearFrame.bottom + farFrame.bottom) / 2;
    const tileWidth = midRight - midLeft;
    const tileHeight = midBottom - midTop;
    const normalizedOffset = lateralRange <= 0 ? 0 : lateralOffset / (Math.max(1, lateralRange) + 0.65);
    const shiftedCenterX = (midLeft + midRight) / 2 + normalizedOffset * tileWidth * 0.82;
    const minCenterX = midLeft + tileWidth * 0.12;
    const maxCenterX = midRight - tileWidth * 0.12;
    const centerX = Math.max(minCenterX, Math.min(maxCenterX, shiftedCenterX));
    const floorY = midBottom;
    const bagW = Math.max(12, Math.min(64, tileWidth * 0.45));
    const bagH = bagW * 1.15;
    const bagLeft = centerX - bagW / 2;
    const bagBottom = floorY - 1;
    const bagTop = bagBottom - bagH;

    if (image && image.naturalWidth > 0 && image.naturalHeight > 0) {
      const maxWidth = tileWidth * 0.50;
      const maxHeight = tileHeight * 0.64;
      const aspectRatio = image.naturalWidth / image.naturalHeight;
      let drawWidth = maxWidth;
      let drawHeight = drawWidth / aspectRatio;
      if (drawHeight > maxHeight) {
        drawHeight = maxHeight;
        drawWidth = drawHeight * aspectRatio;
      }
      drawWidth = Math.max(10, drawWidth);
      drawHeight = Math.max(10, drawHeight);
      const drawX = centerX - drawWidth / 2;
      const drawY = bagBottom - drawHeight;
      context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      return;
    }

    const r = bagW * 0.20;

    // Soft glow shadow under the bag so it reads against any floor
    const glowRadius = bagW * 0.65;
    const glowGrad = context.createRadialGradient(centerX, bagBottom, 0, centerX, bagBottom, glowRadius);
    glowGrad.addColorStop(0, 'rgba(210, 140, 30, 0.45)');
    glowGrad.addColorStop(1, 'rgba(210, 140, 30, 0)');
    context.fillStyle = glowGrad;
    context.beginPath();
    context.ellipse(centerX, bagBottom, glowRadius, glowRadius * 0.35, 0, 0, Math.PI * 2);
    context.fill();

    // Bag body (rounded rectangle)
    context.fillStyle = '#a06820';
    context.beginPath();
    context.moveTo(bagLeft + r, bagTop);
    context.lineTo(bagLeft + bagW - r, bagTop);
    context.quadraticCurveTo(bagLeft + bagW, bagTop, bagLeft + bagW, bagTop + r);
    context.lineTo(bagLeft + bagW, bagBottom - r);
    context.quadraticCurveTo(bagLeft + bagW, bagBottom, bagLeft + bagW - r, bagBottom);
    context.lineTo(bagLeft + r, bagBottom);
    context.quadraticCurveTo(bagLeft, bagBottom, bagLeft, bagBottom - r);
    context.lineTo(bagLeft, bagTop + r);
    context.quadraticCurveTo(bagLeft, bagTop, bagLeft + r, bagTop);
    context.closePath();
    context.fill();

    // Neck / drawstring tie
    const neckW = bagW * 0.38;
    const neckH = bagH * 0.18;
    context.fillStyle = '#6b430e';
    context.fillRect(centerX - neckW / 2, bagTop - neckH, neckW, neckH);

    // Knot at top
    context.fillStyle = '#ffd700';
    context.beginPath();
    context.arc(centerX, bagTop - neckH * 0.4, bagW * 0.16, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#b8860b';
    context.lineWidth = Math.max(0.5, bagW * 0.02);
    context.stroke();

    // Highlight
    context.fillStyle = 'rgba(255, 210, 100, 0.28)';
    context.beginPath();
    context.ellipse(bagLeft + bagW * 0.28, bagTop + bagH * 0.27, bagW * 0.18, bagH * 0.20, -0.3, 0, Math.PI * 2);
    context.fill();

    // Outline
    context.strokeStyle = '#3a1e04';
    context.lineWidth = Math.max(1, bagW * 0.04);
    context.beginPath();
    context.moveTo(bagLeft + r, bagTop);
    context.lineTo(bagLeft + bagW - r, bagTop);
    context.quadraticCurveTo(bagLeft + bagW, bagTop, bagLeft + bagW, bagTop + r);
    context.lineTo(bagLeft + bagW, bagBottom - r);
    context.quadraticCurveTo(bagLeft + bagW, bagBottom, bagLeft + bagW - r, bagBottom);
    context.lineTo(bagLeft + r, bagBottom);
    context.quadraticCurveTo(bagLeft, bagBottom, bagLeft, bagBottom - r);
    context.lineTo(bagLeft, bagTop + r);
    context.quadraticCurveTo(bagLeft, bagTop, bagLeft + r, bagTop);
    context.closePath();
    context.stroke();
  }

  private drawFirstPersonObstacle(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    image: HTMLImageElement | null,
    lateralOffset: number,
    lateralRange: number
  ): void {
    const midLeft = nearFrame.left * 0.65 + farFrame.left * 0.35;
    const midRight = nearFrame.right * 0.65 + farFrame.right * 0.35;
    const midTop = nearFrame.top * 0.65 + farFrame.top * 0.35;
    const midBottom = nearFrame.bottom * 0.65 + farFrame.bottom * 0.35;
    const tileWidth = midRight - midLeft;
    const tileHeight = midBottom - midTop;
    const normalizedOffset = lateralRange <= 0 ? 0 : lateralOffset / (Math.max(1, lateralRange) + 0.65);
    const centeredX = (midLeft + midRight) / 2 + normalizedOffset * tileWidth * 0.82;
    const minCenterX = midLeft + tileWidth * 0.12;
    const maxCenterX = midRight - tileWidth * 0.12;
    const centerX = Math.max(minCenterX, Math.min(maxCenterX, centeredX));
    const scale = 1 - Math.min(0.32, Math.abs(normalizedOffset) * 0.22);

    if (image && image.naturalWidth > 0 && image.naturalHeight > 0) {
      const maxWidth = tileWidth * 0.46 * scale;
      const maxHeight = tileHeight * 0.62 * scale;
      const aspectRatio = image.naturalWidth / image.naturalHeight;
      let drawWidth = maxWidth;
      let drawHeight = drawWidth / aspectRatio;
      if (drawHeight > maxHeight) {
        drawHeight = maxHeight;
        drawWidth = drawHeight * aspectRatio;
      }
      drawWidth = Math.max(10, drawWidth);
      drawHeight = Math.max(10, drawHeight);
      const drawX = centerX - drawWidth / 2;
      const drawY = midBottom - drawHeight;
      context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      return;
    }

    const blockW = Math.max(10, tileWidth * 0.28 * scale);
    const blockH = Math.max(10, tileHeight * 0.38 * scale);
    const blockX = centerX - blockW / 2;
    const blockY = midBottom - blockH;
    context.fillStyle = '#7d8794';
    context.fillRect(blockX, blockY, blockW, blockH);
    context.strokeStyle = '#d6dde8';
    context.lineWidth = 1;
    context.strokeRect(blockX, blockY, blockW, blockH);
  }

  private drawFirstPersonPeekObstacle(
    context: CanvasRenderingContext2D,
    canvasWidth: number,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    image: HTMLImageElement | null,
    side: 'left' | 'right'
  ): void {
    context.save();
    context.beginPath();
    if (side === 'left') {
      context.rect(nearFrame.left, 0, canvasWidth - nearFrame.left, context.canvas.height);
    } else {
      context.rect(0, 0, nearFrame.right, context.canvas.height);
    }
    context.clip();
    context.globalAlpha = 0.9;
    this.drawFirstPersonObstacle(
      context,
      nearFrame,
      farFrame,
      image,
      side === 'left' ? -1 : 1,
      1
    );
    context.globalAlpha = 1;
    context.restore();
  }

  private drawFirstPersonPeekBag(
    context: CanvasRenderingContext2D,
    canvasWidth: number,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    image: HTMLImageElement | null,
    side: 'left' | 'right'
  ): void {
    context.save();
    context.beginPath();
    if (side === 'left') {
      context.rect(nearFrame.left, 0, canvasWidth - nearFrame.left, context.canvas.height);
    } else {
      context.rect(0, 0, nearFrame.right, context.canvas.height);
    }
    context.clip();
    context.globalAlpha = 0.9;
    this.drawFirstPersonFloorBag(
      context,
      nearFrame,
      farFrame,
      image,
      side === 'left' ? -1 : 1,
      1
    );
    context.globalAlpha = 1;
    context.restore();
  }

  private drawFloorItemMarker(
    context: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    size: number
  ): void {
    const s = Math.max(2, size);
    context.fillStyle = '#4fc3f7';
    context.beginPath();
    context.moveTo(centerX, centerY - s);
    context.lineTo(centerX + s, centerY);
    context.lineTo(centerX, centerY + s);
    context.lineTo(centerX - s, centerY);
    context.closePath();
    context.fill();
    context.strokeStyle = '#e0f7fa';
    context.lineWidth = 0.75;
    context.stroke();
  }

  private drawTresherCoinMarker(
    context: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number
  ): void {
    const clampedRadius = Math.max(2, radius);

    context.fillStyle = '#f5c332';
    context.beginPath();
    context.arc(centerX, centerY, clampedRadius, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = '#fff1b8';
    context.lineWidth = 1;
    context.stroke();
  }

  private drawMonsterMarker(
    context: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    size: number
  ): void {
    const s = Math.max(2, size);
    context.fillStyle = '#d63031';
    context.beginPath();
    context.moveTo(centerX, centerY - s);
    context.lineTo(centerX + s, centerY);
    context.lineTo(centerX, centerY + s);
    context.lineTo(centerX - s, centerY);
    context.closePath();
    context.fill();

    context.strokeStyle = '#ff7675';
    context.lineWidth = 1;
    context.stroke();
  }

  private drawMonsterMarkerSelected(
    context: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    size: number
  ): void {
    const s = Math.max(2, size) + 1;
    context.fillStyle = '#ff4444';
    context.beginPath();
    context.moveTo(centerX, centerY - s);
    context.lineTo(centerX + s, centerY);
    context.lineTo(centerX, centerY + s);
    context.lineTo(centerX - s, centerY);
    context.closePath();
    context.fill();
    context.strokeStyle = '#ffffff';
    context.lineWidth = 1.5;
    context.stroke();
  }

  private drawMonsterMarkerGreen(
    context: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    size: number
  ): void {
    const s = Math.max(2, size) + 1;
    context.fillStyle = '#00b300';
    context.beginPath();
    context.moveTo(centerX, centerY - s);
    context.lineTo(centerX + s, centerY);
    context.lineTo(centerX, centerY + s);
    context.lineTo(centerX - s, centerY);
    context.closePath();
    context.fill();
    context.strokeStyle = '#80ff80';
    context.lineWidth = 1.5;
    context.stroke();
  }

  private getFirstPersonSideColor(block: PathBlockType): string {
    if (block === 'closedDoor') {
      return '#8f2525';
    }

    if (block === 'openDoor') {
      return '#ab2f2f';
    }

    if (block === 'wall') {
      return '#a8adb6';
    }

    return '#1b1d21';
  }

  private getFirstPersonFrontColor(block: PathBlockType): string {
    if (block === 'closedDoor') {
      return '#9d2727';
    }

    if (block === 'openDoor') {
      return '#b13131';
    }

    if (block === 'wall') {
      return '#d6d9df';
    }

    return '#191b1f';
  }

  private getFirstPersonOpeningBackWallColor(block: PathBlockType, wallDepth: number): string {
    if (block === 'closedDoor') {
      return '#6f1e1e';
    }

    if (block === 'openDoor') {
      return '#7f2525';
    }

    if (block === 'wall') {
      const normalizedDepth = Math.max(0, wallDepth);
      const darkenAmount = Math.min(0.86, normalizedDepth * 0.085);
      return this.darkenHexColor(this.getFirstPersonFrontColor('wall'), darkenAmount);
    }

    return '#14171b';
  }

  private drawSurfaceTextureInPolygon(
    context: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
    seed: number,
    surfaceDepth: number,
    surface: 'floor' | 'ceiling'
  ): void {
    if (points.length < 3) {
      return;
    }

    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...xs);
    const bottom = Math.max(...ys);

    context.save();
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x, points[index].y);
    }
    context.closePath();
    context.clip();
    this.drawSurfaceTextureInRect(
      context,
      left,
      top,
      right - left,
      bottom - top,
      seed,
      surfaceDepth,
      surface
    );
    context.restore();
  }

  private drawSurfaceTextureInRect(
    context: CanvasRenderingContext2D,
    left: number,
    top: number,
    width: number,
    height: number,
    seed: number,
    surfaceDepth: number,
    surface: 'floor' | 'ceiling'
  ): void {
    if (width <= 0 || height <= 0) {
      return;
    }

    const normalizedDepth = Math.max(0, surfaceDepth);
    const area = width * height;
    const dotCount = Math.max(4, Math.floor(area / (surface === 'floor' ? 190 : 210)));
    const alphaBase = Math.max(0.02, 0.085 - normalizedDepth * 0.008);
    const toneBase = surface === 'floor' ? 122 : 134;
    const toneRange = surface === 'floor' ? 30 : 24;

    for (let index = 0; index < dotCount; index += 1) {
      const x = left + this.getSeededNoise(seed, index * 6 + 1) * width;
      const y = top + this.getSeededNoise(seed, index * 6 + 2) * height;
      const radius = 0.35 + this.getSeededNoise(seed, index * 6 + 3) * 0.8;
      const tone = toneBase + Math.floor(this.getSeededNoise(seed, index * 6 + 4) * toneRange);
      const alpha = alphaBase * (0.55 + this.getSeededNoise(seed, index * 6 + 5) * 0.9);

      context.fillStyle = `rgba(${tone}, ${tone}, ${tone}, ${alpha})`;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }

    const streakCount = Math.max(1, Math.floor(area / 2200));
    const streakAlpha = Math.max(0.02, 0.09 - normalizedDepth * 0.008);
    context.strokeStyle =
      surface === 'floor'
        ? `rgba(74, 62, 50, ${streakAlpha})`
        : `rgba(82, 88, 104, ${streakAlpha})`;
    context.lineWidth = 1;

    for (let index = 0; index < streakCount; index += 1) {
      const startX = left + this.getSeededNoise(seed + 41, index * 7 + 1) * width;
      const startY = top + this.getSeededNoise(seed + 41, index * 7 + 2) * height;
      const length = 4 + this.getSeededNoise(seed + 41, index * 7 + 3) * 8;
      const angle = this.getSeededNoise(seed + 41, index * 7 + 4) * Math.PI * 2;
      context.beginPath();
      context.moveTo(startX, startY);
      context.lineTo(startX + Math.cos(angle) * length, startY + Math.sin(angle) * length);
      context.stroke();
    }
  }

  private drawBrickPatternInPolygon(
    context: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
    seed: number,
    wallDepth: number,
    sidePerspective = false
  ): void {
    if (points.length < 3) {
      return;
    }

    if (points.length === 4) {
      this.drawBrickPatternInQuad(context, points, seed, wallDepth, sidePerspective);
      return;
    }

    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...xs);
    const bottom = Math.max(...ys);

    context.save();
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x, points[index].y);
    }
    context.closePath();
    context.clip();
    this.drawBrickPatternInRect(context, left, top, right - left, bottom - top, seed, wallDepth);
    context.restore();
  }

  private drawBrickPatternInQuad(
    context: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
    seed: number,
    wallDepth: number,
    sidePerspective: boolean
  ): void {
    // Clip drawing to the polygon boundary.
    context.save();
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let pi = 1; pi < points.length; pi += 1) {
      context.lineTo(points[pi].x, points[pi].y);
    }
    context.closePath();
    context.clip();

    if (sidePerspective) {
      this.drawSideWallBricks(context, points, seed, wallDepth);
    } else {
      this.drawBilinearBricks(context, points, seed, wallDepth);
    }

    context.restore();
  }

  /**
   * Used for side walls.
   *
   * Key insight: in this renderer the near and far edges of each side-wall strip
   * are both VERTICAL (same x each), so bilinear interpolation always produces
   * a HORIZONTAL mortar line at t=0.5 (the middle of the wall).  Only the very
   * top/bottom rows ever look angled — the rest look flat.
   *
  * Fix: split side-wall projection at the midpoint.
  * Top-half rows follow the top edge slope, while mid-and-below rows switch to
  * the bottom edge slope. Transition mortar rows at the handoff are omitted to
  * avoid a visible seam.
   */
  private drawSideWallBricks(
    context: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
    seed: number,
    wallDepth: number
  ): void {
    // points[0]=nearTop, points[1]=farTop, points[2]=farBottom, points[3]=nearBottom
    const nearX      = points[0].x;
    const farX       = points[1].x;
    const nearTop    = points[0].y;
    const nearBot    = points[3].y;
    const topProjOffset = points[1].y - points[0].y;
    const bottomProjOffset = points[2].y - points[3].y;

    const nearH      = nearBot - nearTop;
    const farH       = points[2].y - points[1].y;
    const avgH       = Math.max(1, (nearH + farH) * 0.5);
    const stripW     = Math.abs(farX - nearX);

    const normalizedDepth = Math.max(0, wallDepth);
    const brickH     = Math.max(4, Math.min(12, avgH * 0.18));
    const brickW     = Math.max(8, brickH * 1.9);
    const rowCount   = Math.max(1, Math.ceil(avgH / brickH));
    const midSwitchRow = Math.floor(rowCount / 2);
    const topHalfEndRow = Math.floor((rowCount - 1) / 2);
    const bottomHalfStartRow = Math.ceil((rowCount + 1) / 2);
    const mortarA    = Math.max(0.45, 0.62 - normalizedDepth * 0.018);
    const tintA      = Math.max(0.16, 0.34 - normalizedDepth * 0.015);

    // u=0 at near edge, u=1 at far edge (handles both left/right walls).
    const uToX = (u: number): number => nearX + u * (farX - nearX);
    const projectionOffsetForRow = (row: number): number => (
      row < midSwitchRow ? topProjOffset : bottomProjOffset
    );
    const rowY = (nearY: number, u: number, row: number): number => (
      nearY + u * projectionOffsetForRow(row)
    );
    const nearMidY = nearTop + nearH * 0.5;
    const farMidY = points[1].y + farH * 0.5;
    const midpointYAtU = (u: number): number => nearMidY + u * (farMidY - nearMidY);
    const clipSegmentToRowHalf = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      row: number
    ): { x0: number; y0: number; x1: number; y1: number } | null => {
      const isTopHalf = row < midSwitchRow;
      const xSpan = farX - nearX;
      const toU = (x: number): number => {
        if (Math.abs(xSpan) <= 0.000001) {
          return 0;
        }
        const raw = (x - nearX) / xSpan;
        return Math.max(0, Math.min(1, raw));
      };

      const u0 = toU(x0);
      const u1 = toU(x1);
      const delta0 = y0 - midpointYAtU(u0);
      const delta1 = y1 - midpointYAtU(u1);
      const inside0 = isTopHalf ? delta0 <= 0 : delta0 >= 0;
      const inside1 = isTopHalf ? delta1 <= 0 : delta1 >= 0;

      if (inside0 && inside1) {
        return { x0, y0, x1, y1 };
      }

      if (!inside0 && !inside1) {
        return null;
      }

      const denominator = delta0 - delta1;
      const rawT = Math.abs(denominator) <= 0.000001 ? 0.5 : delta0 / denominator;
      const t = Math.max(0, Math.min(1, rawT));
      const midX = x0 + (x1 - x0) * t;
      const midY = y0 + (y1 - y0) * t;

      return inside0
        ? { x0, y0, x1: midX, y1: midY }
        : { x0: midX, y0: midY, x1, y1 };
    };

    // ── Draw brick fills ─────────────────────────────────────────
    // Gradient: near side brighter, far side darker (depth cue).
    const brightGrad = context.createLinearGradient(nearX, 0, farX, 0);
    brightGrad.addColorStop(0, `rgba(210,215,222,${tintA * 1.8})`);
    brightGrad.addColorStop(1, `rgba(115,122,135,${tintA * 0.9})`);

    for (let row = 0; row < rowCount; row += 1) {
      const nearRowTop = nearTop + (row / rowCount) * nearH;
      const nearRowBot = nearTop + ((row + 1) / rowCount) * nearH;

      const stagger = row % 2 === 0 ? 0 : brickW * 0.5;
      const noise   = (this.getSeededNoise(seed, row * 5 + 1) - 0.5) * brickW * 0.2;
      let col = 0;

      for (
        let bx = -brickW + stagger + noise;
        bx < stripW;
        bx += brickW
      ) {
        const vL = Math.max(0, bx);
        const vR = Math.min(stripW, bx + brickW);
        if (vR - vL <= 1) { col += 1; continue; }

        const u0 = vL / stripW;
        const u1 = vR / stripW;

        // Four corners of this parallelogram brick.
        const x0 = uToX(u0),  x1 = uToX(u1);
        const ty0 = rowY(nearRowTop, u0, row),  ty1 = rowY(nearRowTop, u1, row);
        const by0 = rowY(nearRowBot, u0, row),  by1 = rowY(nearRowBot, u1, row);

        const toneNoise = this.getSeededNoise(seed + row * 19 + col * 31, 2);
        const tone = 132 + Math.floor(toneNoise * 34);
        const alpha = tintA * (0.7 + toneNoise * 0.6);
        context.fillStyle = `rgba(${tone},${tone},${tone},${alpha})`;

        context.beginPath();
        context.moveTo(x0, ty0);
        context.lineTo(x1, ty1);
        context.lineTo(x1, by1);
        context.lineTo(x0, by0);
        context.closePath();
        context.fill();

        col += 1;
      }
    }

    // ── Draw mortar lines ─────────────────────────────────────────
    context.strokeStyle = `rgba(80,88,102,${mortarA})`;
    context.lineWidth = 1.5;
    context.beginPath();

    // Horizontal mortar rows: switch slope at midpoint and hide transition seams.
    for (let row = 1; row < rowCount; row += 1) {
      if (row === topHalfEndRow || row === bottomHalfStartRow) {
        continue;
      }
      const nearY = nearTop + (row / rowCount) * nearH;
      const projOffset = projectionOffsetForRow(row);
      const clipped = clipSegmentToRowHalf(
        nearX,
        nearY,
        farX,
        nearY + projOffset,
        row
      );
      if (!clipped) {
        continue;
      }
      context.moveTo(clipped.x0, clipped.y0);
      context.lineTo(clipped.x1, clipped.y1);
    }

    // Vertical joints within each row.
    for (let row = 0; row < rowCount; row += 1) {
      const nearRowTop = nearTop + (row / rowCount) * nearH;
      const nearRowBot = nearTop + ((row + 1) / rowCount) * nearH;

      const stagger = row % 2 === 0 ? 0 : brickW * 0.5;
      const noise   = (this.getSeededNoise(seed, row * 5 + 1) - 0.5) * brickW * 0.2;

      for (let bx = stagger + noise; bx < stripW; bx += brickW) {
        const u = bx / stripW;
        const sx = uToX(u);
        const clipped = clipSegmentToRowHalf(
          sx,
          rowY(nearRowTop, u, row),
          sx,
          rowY(nearRowBot, u, row),
          row
        );
        if (!clipped) {
          continue;
        }
        context.moveTo(clipped.x0, clipped.y0);
        context.lineTo(clipped.x1, clipped.y1);
      }
    }

    context.stroke();
  }

  /** Used for front-facing surfaces (opening back walls etc.) — bilinear quad mapping. */
  private drawBilinearBricks(
    context: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
    seed: number,
    wallDepth: number
  ): void {
    const normalizedDepth = Math.max(0, wallDepth);
    const leftEdgeLength  = Math.hypot(points[3].x - points[0].x, points[3].y - points[0].y);
    const rightEdgeLength = Math.hypot(points[2].x - points[1].x, points[2].y - points[1].y);
    const avgHeight = Math.max(1, (leftEdgeLength + rightEdgeLength) * 0.5);

    const brickHeight = Math.max(4, Math.min(12, avgHeight * 0.18));
    const brickWidth  = Math.max(8, brickHeight * 1.9);
    const mortarAlpha = Math.max(0.08, 0.2 - normalizedDepth * 0.012);
    const tintAlpha   = Math.max(0.05, 0.16 - normalizedDepth * 0.01);
    const rowCount    = Math.max(1, Math.ceil(avgHeight / brickHeight));

    const lerp = (
      a: { x: number; y: number },
      b: { x: number; y: number },
      t: number
    ): { x: number; y: number } => ({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    });

    for (let row = 0; row < rowCount; row += 1) {
      const tS = row / rowCount;
      const tE = (row + 1) / rowCount;
      const TL = lerp(points[0], points[3], tS);
      const TR = lerp(points[1], points[2], tS);
      const BL = lerp(points[0], points[3], tE);
      const BR = lerp(points[1], points[2], tE);
      const rowW = Math.max(1,
        (Math.hypot(TR.x - TL.x, TR.y - TL.y) +
         Math.hypot(BR.x - BL.x, BR.y - BL.y)) * 0.5);

      const stagger = row % 2 === 0 ? 0 : brickWidth * 0.5;
      const noise   = (this.getSeededNoise(seed, row * 5 + 1) - 0.5) * brickWidth * 0.2;
      let col = 0;

      for (let bx = -brickWidth + stagger + noise; bx < rowW; bx += brickWidth) {
        const vL = Math.max(0, bx);
        const vR = Math.min(rowW, bx + brickWidth);
        if (vR - vL <= 1) { col += 1; continue; }

        const u0 = vL / rowW;
        const u1 = vR / rowW;
        const tA = lerp(TL, TR, u0);
        const tB = lerp(TL, TR, u1);
        const bB = lerp(BL, BR, u1);
        const bA = lerp(BL, BR, u0);

        const toneNoise = this.getSeededNoise(seed + row * 19 + col * 31, 2);
        const tone  = 132 + Math.floor(toneNoise * 34);
        const alpha = tintAlpha * (0.7 + toneNoise * 0.6);
        context.fillStyle = `rgba(${tone},${tone},${tone},${alpha})`;
        context.beginPath();
        context.moveTo(tA.x, tA.y);
        context.lineTo(tB.x, tB.y);
        context.lineTo(bB.x, bB.y);
        context.lineTo(bA.x, bA.y);
        context.closePath();
        context.fill();
        col += 1;
      }
    }

    context.strokeStyle = `rgba(74,80,92,${mortarAlpha})`;
    context.lineWidth = 1;
    context.beginPath();

    for (let row = 1; row < rowCount; row += 1) {
      const t  = row / rowCount;
      const lP = lerp(points[0], points[3], t);
      const rP = lerp(points[1], points[2], t);
      context.moveTo(lP.x, lP.y);
      context.lineTo(rP.x, rP.y);
    }

    for (let row = 0; row < rowCount; row += 1) {
      const tS = row / rowCount;
      const tE = (row + 1) / rowCount;
      const TL = lerp(points[0], points[3], tS);
      const TR = lerp(points[1], points[2], tS);
      const BL = lerp(points[0], points[3], tE);
      const BR = lerp(points[1], points[2], tE);
      const rowW = Math.max(1,
        (Math.hypot(TR.x - TL.x, TR.y - TL.y) +
         Math.hypot(BR.x - BL.x, BR.y - BL.y)) * 0.5);

      const stagger = row % 2 === 0 ? 0 : brickWidth * 0.5;
      const noise   = (this.getSeededNoise(seed, row * 5 + 1) - 0.5) * brickWidth * 0.2;
      for (let x = stagger + noise; x < rowW; x += brickWidth) {
        const u  = x / rowW;
        const tP = lerp(TL, TR, u);
        const bP = lerp(BL, BR, u);
        context.moveTo(tP.x, tP.y);
        context.lineTo(bP.x, bP.y);
      }
    }

    context.stroke();
  }

  private drawBrickPatternInRect(
    context: CanvasRenderingContext2D,
    left: number,
    top: number,
    width: number,
    height: number,
    seed: number,
    wallDepth: number
  ): void {
    if (width <= 0 || height <= 0) {
      return;
    }

    const normalizedDepth = Math.max(0, wallDepth);
    const brickHeight = Math.max(4, Math.min(12, height * 0.18));
    const brickWidth = Math.max(8, brickHeight * 1.9);
    const mortarAlpha = Math.max(0.08, 0.2 - normalizedDepth * 0.012);
    const tintAlpha = Math.max(0.05, 0.16 - normalizedDepth * 0.01);
    const right = left + width;
    const bottom = top + height;
    const rowCount = Math.ceil(height / brickHeight);

    for (let row = 0; row < rowCount; row += 1) {
      const rowTop = top + row * brickHeight;
      const rowBottom = Math.min(bottom, rowTop + brickHeight);
      const rowHeight = rowBottom - rowTop;
      if (rowHeight <= 0) {
        continue;
      }

      const staggerBase = row % 2 === 0 ? 0 : brickWidth * 0.5;
      const staggerNoise = (this.getSeededNoise(seed, row * 5 + 1) - 0.5) * brickWidth * 0.2;
      let brickColumn = 0;

      for (
        let brickLeft = left - brickWidth + staggerBase + staggerNoise;
        brickLeft < right;
        brickLeft += brickWidth
      ) {
        const visibleLeft = Math.max(left, brickLeft);
        const visibleRight = Math.min(right, brickLeft + brickWidth);
        const visibleWidth = visibleRight - visibleLeft;
        if (visibleWidth <= 1) {
          brickColumn += 1;
          continue;
        }

        const toneNoise = this.getSeededNoise(seed + row * 19 + brickColumn * 31, 2);
        const tone = 132 + Math.floor(toneNoise * 34);
        const alpha = tintAlpha * (0.7 + toneNoise * 0.6);
        context.fillStyle = `rgba(${tone}, ${tone}, ${tone}, ${alpha})`;
        context.fillRect(
          visibleLeft + 0.6,
          rowTop + 0.6,
          Math.max(0, visibleWidth - 1.2),
          Math.max(0, rowHeight - 1.2)
        );
        brickColumn += 1;
      }
    }

    context.strokeStyle = `rgba(74, 80, 92, ${mortarAlpha})`;
    context.lineWidth = 1;
    context.beginPath();

    for (let y = top + brickHeight; y < bottom; y += brickHeight) {
      context.moveTo(left, y);
      context.lineTo(right, y);
    }

    for (let row = 0; row < rowCount; row += 1) {
      const rowTop = top + row * brickHeight;
      const rowBottom = Math.min(bottom, rowTop + brickHeight);
      if (rowBottom - rowTop <= 0) {
        continue;
      }

      const staggerBase = row % 2 === 0 ? 0 : brickWidth * 0.5;
      const staggerNoise = (this.getSeededNoise(seed, row * 5 + 1) - 0.5) * brickWidth * 0.2;
      for (let x = left + staggerBase + staggerNoise; x < right; x += brickWidth) {
        context.moveTo(x, rowTop);
        context.lineTo(x, rowBottom);
      }
    }

    context.stroke();
  }

  private hasClearSideSightToDepth(
    steps: FirstPersonStep[],
    depth: number,
    side: 'left' | 'right'
  ): boolean {
    for (let index = 0; index <= depth; index += 1) {
      const step = steps[index];
      if (!step) {
        return false;
      }

      const block = side === 'left' ? step.leftBlock : step.rightBlock;
      if (!this.isSideSightTransparent(block)) {
        return false;
      }
    }

    return true;
  }

  private canSeeOpeningBackWallAtDepth(
    steps: FirstPersonStep[],
    depth: number,
    side: 'left' | 'right'
  ): boolean {
    if (this.hasClearSideSightToDepth(steps, depth, side)) {
      return true;
    }

    if (depth <= 0) {
      return false;
    }

    const previousStep = steps[depth - 1];
    const currentStep = steps[depth];
    if (!previousStep || !currentStep) {
      return false;
    }

    const previousBlock = side === 'left' ? previousStep.leftBlock : previousStep.rightBlock;
    const currentBlock = side === 'left' ? currentStep.leftBlock : currentStep.rightBlock;

    // Intersection/corner peek rule: if a side changes from blocked to open at this depth,
    // allow rendering the opening back wall even though earlier depths were blocked.
    return !this.isSideSightTransparent(previousBlock) && this.isSideSightTransparent(currentBlock);
  }

  private getVisibleMonsterSlotsForDepth(
    dungonId: number,
    steps: FirstPersonStep[],
    depth: number,
    row: number,
    column: number,
    leftOffset: { rowOffset: number; columnOffset: number },
    rightOffset: { rowOffset: number; columnOffset: number }
  ): Array<{ squareKey: string; lateralOffset: number; isPeek?: boolean }> {
    const squares = this.squaresByDungon()[dungonId] ?? {};
    const filledSquares = this.filledSquaresByDungon()[dungonId] ?? {};
    const visibleSlots: Array<{ squareKey: string; lateralOffset: number; isPeek?: boolean }> = [
      { squareKey: this.getSquareKey(row, column), lateralOffset: 0 },
    ];

    if (depth <= 0) {
      return visibleSlots;
    }

    const collectSideSlots = (
      side: 'left' | 'right',
      offset: { rowOffset: number; columnOffset: number },
      lateralDirection: number
    ): void => {
      if (!this.hasClearSideSightToDepth(steps, depth, side)) {
        return;
      }

      let currentRow = row;
      let currentColumn = column;
      for (let distance = 1; distance <= depth; distance += 1) {
        const nextRow = currentRow + offset.rowOffset;
        const nextColumn = currentColumn + offset.columnOffset;
        const connection = this.getMovementConnectionInfoBetweenAdjacentSquares(
          dungonId,
          currentRow,
          currentColumn,
          nextRow,
          nextColumn
        );
        if (!this.isTransparentConnectionType(connection.type)) {
          break;
        }

        const squareKey = this.getSquareKey(nextRow, nextColumn);
        if (!squares[squareKey] || !filledSquares[squareKey]) {
          break;
        }

        visibleSlots.push({
          squareKey,
          lateralOffset: lateralDirection * distance,
        });
        currentRow = nextRow;
        currentColumn = nextColumn;
      }
    };

    collectSideSlots('left', leftOffset, -1);
    collectSideSlots('right', rightOffset, 1);

    // Corner-peek: side just opened at this depth (wall before, opening now)
    if (depth >= 1) {
      const addPeekIfMonsterPresent = (
        side: 'left' | 'right',
        offset: { rowOffset: number; columnOffset: number },
        lateralDirection: number
      ): void => {
        const prevStep = steps[depth - 1];
        const currStep = steps[depth];
        if (!prevStep || !currStep) return;
        const prevBlock = side === 'left' ? prevStep.leftBlock : prevStep.rightBlock;
        const currBlock = side === 'left' ? currStep.leftBlock : currStep.rightBlock;
        // Previous step must have been a wall, current step must be open
        if (this.isSideSightTransparent(prevBlock)) return;
        if (!this.isSideSightTransparent(currBlock)) return;
        // Check the diagonal square (one ahead, one to the side)
        const diagRow = row + offset.rowOffset;
        const diagCol = column + offset.columnOffset;
        const squareKey = this.getSquareKey(diagRow, diagCol);
        if (!squares[squareKey] || !filledSquares[squareKey]) return;
        if (visibleSlots.some((s) => s.squareKey === squareKey)) return;
        visibleSlots.push({ squareKey, lateralOffset: lateralDirection, isPeek: true });
      };
      addPeekIfMonsterPresent('left', leftOffset, -1);
      addPeekIfMonsterPresent('right', rightOffset, 1);
    }

    return visibleSlots;
  }

  private isSideSightTransparent(block: FirstPersonBlock): boolean {
    return block.type === 'none' || block.type === 'openDoor';
  }

  private isTransparentConnectionType(type: PathBlockType): boolean {
    return type === 'none' || type === 'openDoor';
  }

  private getFirstPersonWallPanelColor(depth: number): string {
    const normalizedDepth = Math.max(0, Math.floor(depth));
    return this.darkenHexColor(this.getFirstPersonFrontColor('wall'), Math.min(0.9, normalizedDepth * 0.1));
  }

  private getSeededNoise(seed: number, step: number): number {
    const value = Math.sin(seed * 12.9898 + step * 78.233) * 43758.5453123;
    return value - Math.floor(value);
  }

  private darkenHexColor(hexColor: string, amount: number): string {
    const normalized = hexColor.startsWith('#') ? hexColor.slice(1) : hexColor;
    if (normalized.length !== 6) {
      return hexColor;
    }

    const parseChannel = (startIndex: number): number => {
      const channel = Number.parseInt(normalized.slice(startIndex, startIndex + 2), 16);
      if (Number.isNaN(channel)) {
        return 0;
      }

      return Math.max(0, Math.min(255, Math.floor(channel * (1 - amount))));
    };

    return `#${parseChannel(0).toString(16).padStart(2, '0')}${parseChannel(2).toString(16).padStart(2, '0')}${parseChannel(4).toString(16).padStart(2, '0')}`;
  }

  private toFirstPersonBlock(type: PathBlockType, door: Door | null, wall: Wall | null = null): FirstPersonBlock {
    return {
      type,
      hasKeyhole: Boolean(door?.keyLock),
      isDestructible: wall?.isDestructible === true,
    };
  }

  private loadDoorImages(): void {
    this.drawingAssets.loadDoorImages();
  }

  private drawFirstPersonDoorFace(
    context: CanvasRenderingContext2D,
    frame: { left: number; right: number; top: number; bottom: number },
    block: FirstPersonBlock,
    isPortal: boolean
  ): void {
    if (block.type !== 'openDoor' && block.type !== 'closedDoor') {
      return;
    }
    if (block.type === 'openDoor') {
      return;
    }

    const frameWidth = frame.right - frame.left;
    const frameHeight = frame.bottom - frame.top;
    const insetX = Math.max(2, frameWidth * 0.1);
    const insetY = Math.max(2, frameHeight * 0.08);
    const doorLeft = frame.left + insetX;
    const doorRight = frame.right - insetX;
    const doorTop = frame.top + insetY;
    const doorBottom = frame.bottom - insetY;
    const doorW = doorRight - doorLeft;
    const doorH = doorBottom - doorTop;

    const img = this.doorImageCache.get('closed') ?? null;

    context.save();
    context.globalAlpha = isPortal ? 0.84 : 1;

    if (img) {
      context.drawImage(img, doorLeft, doorTop, doorW, doorH);
    } else {
      context.fillStyle = '#b33030';
      context.fillRect(doorLeft, doorTop, doorW, doorH);
      context.strokeStyle = '#f0b0b0';
      context.lineWidth = Math.max(1, Math.min(2, doorW * 0.04));
      context.strokeRect(doorLeft, doorTop, doorW, doorH);
      if (block.hasKeyhole) {
        const keyholeX = doorRight - Math.max(4, doorW * 0.28);
        const keyholeY = doorTop + doorH * 0.64;
        const keyholeRadius = Math.max(1.2, doorW * 0.03);
        context.fillStyle = '#1f1111';
        context.beginPath();
        context.arc(keyholeX, keyholeY, keyholeRadius, 0, Math.PI * 2);
        context.fill();
      }
    }

    context.restore();
  }

  private getLateralBlockType(
    dungonId: number,
    row: number,
    column: number,
    rowOffset: number,
    columnOffset: number
  ): FirstPersonBlock {
    const squares = this.squaresByDungon()[dungonId] ?? {};
    const filledSquares = this.filledSquaresByDungon()[dungonId] ?? {};
    const sourceSquare = squares[this.getSquareKey(row, column)];
    if (!sourceSquare || !filledSquares[this.getSquareKey(row, column)]) {
      return this.toFirstPersonBlock('void', null);
    }

    const side = this.getSquareSideFromOffset(rowOffset, columnOffset);
    if (!side) {
      return this.toFirstPersonBlock('void', null);
    }

    const connection = sourceSquare[side];
    if (this.isWallConnection(connection)) {
      return this.toFirstPersonBlock('wall', null);
    }

    if (this.isDoorConnection(connection)) {
      if (connection.isHidden && !connection.isFound) {
        return this.toFirstPersonBlock('wall', null);
      }
      return this.toFirstPersonBlock(
        connection.state === 'closed' ? 'closedDoor' : 'openDoor',
        connection
      );
    }

    const neighborRow = row + rowOffset;
    const neighborColumn = column + columnOffset;
    const neighborSquareKey = this.getSquareKey(neighborRow, neighborColumn);
    if (!filledSquares[neighborSquareKey] || !squares[neighborSquareKey]) {
      return this.toFirstPersonBlock('void', null);
    }

    return this.toFirstPersonBlock('none', null);
  }

  private getSideOpeningBackBlock(
    dungonId: number,
    row: number,
    column: number,
    sideRowOffset: number,
    sideColumnOffset: number,
    forwardRowOffset: number,
    forwardColumnOffset: number
  ): FirstPersonBlock | null {
    const sideRow = row + sideRowOffset;
    const sideColumn = column + sideColumnOffset;
    const sideForwardRow = sideRow + forwardRowOffset;
    const sideForwardColumn = sideColumn + forwardColumnOffset;
    const sideForwardConnection = this.getMovementConnectionInfoBetweenAdjacentSquares(
      dungonId,
      sideRow,
      sideColumn,
      sideForwardRow,
      sideForwardColumn
    );

    if (sideForwardConnection.type === 'none') {
      return null;
    }

    return this.toFirstPersonBlock(sideForwardConnection.type, sideForwardConnection.door);
  }

  private getSquareSideFromOffset(rowOffset: number, columnOffset: number): SquareSide | null {
    if (rowOffset === -1 && columnOffset === 0) {
      return 'toTop';
    }

    if (rowOffset === 1 && columnOffset === 0) {
      return 'toBottom';
    }

    if (rowOffset === 0 && columnOffset === -1) {
      return 'toLeft';
    }

    if (rowOffset === 0 && columnOffset === 1) {
      return 'toRight';
    }

    return null;
  }

  private getVisibleSquareKeysForPreview(preview: GridPreviewContext): Set<string> {
    const visibleSquareKeys = new Set<string>();
    const filledSquares = this.filledSquaresByDungon()[preview.dungonId] ?? {};
    const range = this.getEffectiveRangeOfSight(preview.dungonId);

    const sourceSquareKey = this.getSquareKey(preview.centerRow, preview.centerColumn);
    if (filledSquares[sourceSquareKey]) {
      visibleSquareKeys.add(sourceSquareKey);
    }

    for (let previewRow = 0; previewRow < this.previewGridDimension; previewRow += 1) {
      for (let previewColumn = 0; previewColumn < this.previewGridDimension; previewColumn += 1) {
        const sourceRow = preview.startRow + previewRow;
        const sourceColumn = preview.startColumn + previewColumn;
        const squareKey = this.getSquareKey(sourceRow, sourceColumn);
        if (!filledSquares[squareKey]) {
          continue;
        }

        if (!this.isWithinSightRange(preview.centerRow, preview.centerColumn, sourceRow, sourceColumn, range)) {
          continue;
        }

        if (
          !this.hasLineOfSight(
            preview.dungonId,
            preview.centerRow,
            preview.centerColumn,
            sourceRow,
            sourceColumn
          )
        ) {
          continue;
        }

        visibleSquareKeys.add(squareKey);
      }
    }

    return visibleSquareKeys;
  }

  private isWithinSightRange(
    fromRow: number,
    fromColumn: number,
    toRow: number,
    toColumn: number,
    range: number
  ): boolean {
    const rowOffset = toRow - fromRow;
    const columnOffset = toColumn - fromColumn;
    return Math.hypot(rowOffset, columnOffset) <= range;
  }

  private hasLineOfSight(
    dungonId: number,
    fromRow: number,
    fromColumn: number,
    toRow: number,
    toColumn: number
  ): boolean {
    if (fromRow === toRow && fromColumn === toColumn) {
      return true;
    }

    const squares = this.squaresByDungon()[dungonId] ?? {};
    if (!squares[this.getSquareKey(fromRow, fromColumn)]) {
      return false;
    }

    if (!squares[this.getSquareKey(toRow, toColumn)]) {
      return false;
    }

    const startX = fromColumn + 0.5;
    const startY = fromRow + 0.5;
    const endX = toColumn + 0.5;
    const endY = toRow + 0.5;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const stepX = deltaX > 0 ? 1 : deltaX < 0 ? -1 : 0;
    const stepY = deltaY > 0 ? 1 : deltaY < 0 ? -1 : 0;
    const absoluteDeltaX = Math.abs(deltaX);
    const absoluteDeltaY = Math.abs(deltaY);

    let currentRow = fromRow;
    let currentColumn = fromColumn;

    let tMaxX =
      stepX === 0
        ? Number.POSITIVE_INFINITY
        : (stepX > 0 ? currentColumn + 1 - startX : startX - currentColumn) / absoluteDeltaX;

    let tMaxY =
      stepY === 0
        ? Number.POSITIVE_INFINITY
        : (stepY > 0 ? currentRow + 1 - startY : startY - currentRow) / absoluteDeltaY;

    const tDeltaX = stepX === 0 ? Number.POSITIVE_INFINITY : 1 / absoluteDeltaX;
    const tDeltaY = stepY === 0 ? Number.POSITIVE_INFINITY : 1 / absoluteDeltaY;
    const epsilon = 0.0000001;
    let guard = 0;
    const maxSteps = this.gridRowCount * this.gridColumnCount + 5;

    while ((currentRow !== toRow || currentColumn !== toColumn) && guard < maxSteps) {
      guard += 1;

      if (tMaxX < tMaxY - epsilon) {
        const nextColumn = currentColumn + stepX;
        if (
          this.isSightBlockedBetweenAdjacentSquares(
            dungonId,
            currentRow,
            currentColumn,
            currentRow,
            nextColumn
          )
        ) {
          return false;
        }

        currentColumn = nextColumn;
        tMaxX += tDeltaX;
        continue;
      }

      if (tMaxY < tMaxX - epsilon) {
        const nextRow = currentRow + stepY;
        if (
          this.isSightBlockedBetweenAdjacentSquares(
            dungonId,
            currentRow,
            currentColumn,
            nextRow,
            currentColumn
          )
        ) {
          return false;
        }

        currentRow = nextRow;
        tMaxY += tDeltaY;
        continue;
      }

      const nextColumn = currentColumn + stepX;
      const nextRow = currentRow + stepY;
      const blockedToHorizontal =
        stepX !== 0 &&
        this.isSightBlockedBetweenAdjacentSquares(
          dungonId,
          currentRow,
          currentColumn,
          currentRow,
          nextColumn
        );

      const blockedToVertical =
        stepY !== 0 &&
        this.isSightBlockedBetweenAdjacentSquares(
          dungonId,
          currentRow,
          currentColumn,
          nextRow,
          currentColumn
        );

      // Both adjacent walls blocked = full cover, no LOS.
      // One wall blocked = partial cover (LOS exists, -2 to hit via getAttackCoverPenalty).
      if (blockedToHorizontal && blockedToVertical) {
        return false;
      }

      currentColumn = nextColumn;
      currentRow = nextRow;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    }

    return currentRow === toRow && currentColumn === toColumn;
  }

  /**
   * Returns -2 if the target has partial cover (one wall clips the diagonal ray), or 0 otherwise.
   * Used to apply a -2 to-hit penalty when attacking diagonally past a corner wall.
   */
  private getAttackCoverPenalty(
    dungonId: number,
    fromRow: number,
    fromColumn: number,
    toRow: number,
    toColumn: number
  ): number {
    if (fromRow === toRow && fromColumn === toColumn) return 0;

    const squares = this.squaresByDungon()[dungonId] ?? {};
    if (!squares[this.getSquareKey(fromRow, fromColumn)]) return 0;
    if (!squares[this.getSquareKey(toRow, toColumn)]) return 0;

    const startX = fromColumn + 0.5;
    const startY = fromRow + 0.5;
    const endX = toColumn + 0.5;
    const endY = toRow + 0.5;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const stepX = deltaX > 0 ? 1 : deltaX < 0 ? -1 : 0;
    const stepY = deltaY > 0 ? 1 : deltaY < 0 ? -1 : 0;
    const absoluteDeltaX = Math.abs(deltaX);
    const absoluteDeltaY = Math.abs(deltaY);

    let currentRow = fromRow;
    let currentColumn = fromColumn;

    let tMaxX = stepX === 0 ? Number.POSITIVE_INFINITY
      : (stepX > 0 ? currentColumn + 1 - startX : startX - currentColumn) / absoluteDeltaX;
    let tMaxY = stepY === 0 ? Number.POSITIVE_INFINITY
      : (stepY > 0 ? currentRow + 1 - startY : startY - currentRow) / absoluteDeltaY;

    const tDeltaX = stepX === 0 ? Number.POSITIVE_INFINITY : 1 / absoluteDeltaX;
    const tDeltaY = stepY === 0 ? Number.POSITIVE_INFINITY : 1 / absoluteDeltaY;
    const epsilon = 0.0000001;
    let guard = 0;
    const maxSteps = this.gridRowCount * this.gridColumnCount + 5;

    while ((currentRow !== toRow || currentColumn !== toColumn) && guard < maxSteps) {
      guard += 1;

      if (tMaxX < tMaxY - epsilon) {
        currentColumn += stepX;
        tMaxX += tDeltaX;
        continue;
      }

      if (tMaxY < tMaxX - epsilon) {
        currentRow += stepY;
        tMaxY += tDeltaY;
        continue;
      }

      // Exact diagonal corner — exactly one wall blocked = partial cover
      const nextColumn = currentColumn + stepX;
      const nextRow = currentRow + stepY;
      const blockedH = stepX !== 0 && this.isSightBlockedBetweenAdjacentSquares(
        dungonId, currentRow, currentColumn, currentRow, nextColumn);
      const blockedV = stepY !== 0 && this.isSightBlockedBetweenAdjacentSquares(
        dungonId, currentRow, currentColumn, nextRow, currentColumn);

      if (blockedH !== blockedV) {
        return -2; // partial cover
      }

      currentColumn = nextColumn;
      currentRow = nextRow;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    }

    return 0;
  }

  private isSightBlockedBetweenAdjacentSquares(
    dungonId: number,
    fromRow: number,
    fromColumn: number,
    toRow: number,
    toColumn: number
  ): boolean {
    const rowDelta = toRow - fromRow;
    const columnDelta = toColumn - fromColumn;

    if (Math.abs(rowDelta) + Math.abs(columnDelta) !== 1) {
      return true;
    }

    const squares = this.squaresByDungon()[dungonId] ?? {};
    const fromSquare = squares[this.getSquareKey(fromRow, fromColumn)];
    const toSquare = squares[this.getSquareKey(toRow, toColumn)];
    if (!fromSquare || !toSquare) {
      return true;
    }

    let fromSide: SquareSide;
    let toSide: SquareSide;

    if (rowDelta === -1) {
      fromSide = 'toTop';
      toSide = 'toBottom';
    } else if (rowDelta === 1) {
      fromSide = 'toBottom';
      toSide = 'toTop';
    } else if (columnDelta === -1) {
      fromSide = 'toLeft';
      toSide = 'toRight';
    } else {
      fromSide = 'toRight';
      toSide = 'toLeft';
    }

    const fromConnection = fromSquare[fromSide];
    const toConnection = toSquare[toSide];
    return this.isSightBlockingConnection(fromConnection) || this.isSightBlockingConnection(toConnection);
  }

  private isSightBlockingConnection(connection: Door | Wall | null): boolean {
    if (this.isWallConnection(connection)) return true;
    if (this.isDoorConnection(connection)) {
      if (connection.isHidden && !connection.isFound) return true;
      return (connection as Door).state !== 'open';
    }
    return false;
  }

  private isSpaceKey(key: string): boolean {
    return key === ' ' || key === 'Space' || key === 'Spacebar';
  }

  private isBackwardMoveKey(key: string): boolean {
    return key.toLowerCase() === 'b';
  }

  private tryMoveCheaterForward(): void {
    this.tryMoveCheaterByFacingStep(1);
  }

  private tryMoveCheaterBackward(): void {
    this.tryMoveCheaterByFacingStep(-1);
  }

  private tryMoveCheaterByDisplayedFacingStep(stepMultiplier: 1 | -1): void {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return;
    }

    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const displayDirection = this.getDisplayedFacingDirection(preview.dungonId, cheater.facingDir);
    const moveDelta = this.getMovementDeltaForDisplayFacingDirection(displayDirection);
    this.tryMoveCheaterByDelta(
      preview,
      moveDelta.rowOffset * stepMultiplier,
      moveDelta.columnOffset * stepMultiplier
    );
  }

  private tryMoveCheaterByFacingStep(stepMultiplier: 1 | -1): void {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return;
    }

    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const moveDelta = this.getMovementDeltaForFacingDirection(cheater.facingDir);
    this.tryMoveCheaterByDelta(
      preview,
      moveDelta.rowOffset * stepMultiplier,
      moveDelta.columnOffset * stepMultiplier
    );
  }

  private tryMoveCheaterByDelta(
    preview: GridPreviewContext,
    rowOffset: number,
    columnOffset: number,
    forcedBypassTriggerDecision: boolean | null = null
  ): void {
    if (rowOffset === 0 && columnOffset === 0) {
      return;
    }

    const nextRow = preview.centerRow + rowOffset;
    const nextColumn = preview.centerColumn + columnOffset;
    if (
      nextRow < 0 ||
      nextColumn < 0 ||
      nextRow >= this.gridRowCount ||
      nextColumn >= this.gridColumnCount
    ) {
      return;
    }

    const filledSquares = this.filledSquaresByDungon()[preview.dungonId] ?? {};
    if (!filledSquares[this.getSquareKey(nextRow, nextColumn)]) {
      return;
    }

    const isCardinalStep = Math.abs(rowOffset) + Math.abs(columnOffset) === 1;
    const isDiagonalStep = Math.abs(rowOffset) === 1 && Math.abs(columnOffset) === 1;

    if (isCardinalStep) {
      if (
        this.isMovementBlockedBetweenAdjacentSquares(
          preview.dungonId,
          preview.centerRow,
          preview.centerColumn,
          nextRow,
          nextColumn
        )
      ) {
        return;
      }
    } else if (isDiagonalStep) {
      if (
        this.isDiagonalMovementBlocked(
          preview.dungonId,
          preview.centerRow,
          preview.centerColumn,
          rowOffset,
          columnOffset
        )
      ) {
        return;
      }
    } else {
      return;
    }

    const nextSquareKey = this.getSquareKey(nextRow, nextColumn);
    const hasLiveMonster = this.monsterInstances().some(
      (m) => !m.isDead && m.row === nextRow && m.column === nextColumn
    );
    if (hasLiveMonster) {
      return;
    }

    const currentTriggeredFloorTrap = this.getTriggeredFloorTrapAtSquare(
      preview.dungonId,
      preview.centerRow,
      preview.centerColumn
    );
    const isTrapped = currentTriggeredFloorTrap !== null;

    const activeFloorTrap = this.getActiveFloorTrapAtSquare(preview.dungonId, nextRow, nextColumn);
    const trapHasCrossingRequirements =
      activeFloorTrap !== null &&
      this.getTrapCrossingItems(activeFloorTrap.trap).length > 0;
    const canBypassTriggerWithItem =
      activeFloorTrap !== null &&
      this.isMoveTowardFacingDirection(preview.dungonId, rowOffset, columnOffset) &&
      this.canBypassTrapWithCrossingItem(activeFloorTrap.trap);
    let bypassTriggerForThisMove = false;
    if (trapHasCrossingRequirements && activeFloorTrap.isDetected && this.isMoveTowardFacingDirection(preview.dungonId, rowOffset, columnOffset) && activeFloorTrap) {
      if (forcedBypassTriggerDecision === null) {
        this.openTrapCrossingPrompt(preview, rowOffset, columnOffset, activeFloorTrap);
        return;
      }
      if (canBypassTriggerWithItem && forcedBypassTriggerDecision) {
        bypassTriggerForThisMove = true;
        this.previewActionMessage.set(`You use a crossing item to pass ${activeFloorTrap.trap.name || 'the trap'} safely.`);
      }
    }

    // Block movement into squares that have an obstacle not passable by height
    const obstaclesForDungon = this.obstaclePlacementsByDungon()[preview.dungonId] ?? [];
    const hasObstacleAtDest = obstaclesForDungon.some(
      (obs) => obs.row === nextRow && obs.column === nextColumn && this.isObstacleBlockingMovement(obs)
    );
    if (hasObstacleAtDest) {
      return;
    }

    const moveCost = isTrapped ? 3 : (isDiagonalStep ? 2 : 1);
    if (this.turnPhase() === 'player' && this.playerAE() < moveCost) {
      if (isTrapped) {
        this.previewActionMessage.set('You are trapped and need at least 3 AE to move again.');
      }
      return;
    }

    if (this.turnPhase() === 'player') {
      this.consumePlayerAE(moveCost, preview.dungonId);
    }

    const halfDimension = Math.floor(this.previewGridDimension / 2);
    this.gridPreviewContext.set({
      ...preview,
      centerRow: nextRow,
      centerColumn: nextColumn,
      startRow: nextRow - halfDimension,
      startColumn: nextColumn - halfDimension,
    });

    this.logNearbyAfterMove();
    this.triggerNpcGreetings();

    this.playStepSound(0.22);

    // Check if player stepped onto an exit
    const exits = this.exitsByDungon()[preview.dungonId] ?? [];
    const landedExit = exits.find((e) => e.row === nextRow && e.column === nextColumn);
    if (landedExit && !this.dungonWon() && !this.pendingExitTransitionType()) {
      const exitReq = landedExit.itemRequirement ?? null;
      if (exitReq && !this.playerHasItem(exitReq.itemId)) {
        // Show the exit confirm overlay but clearly mark reward as unavailable without the required item.
        this.pendingExitAwardsInnReward.set(false);
        this.pendingExitMissingItemName.set(exitReq.itemName);
        this.pendingExitTransitionType.set(landedExit.transitionType ?? 'open');
      } else {
        this.pendingExitAwardsInnReward.set(true);
        this.pendingExitMissingItemName.set(null);
        this.pendingExitTransitionType.set(landedExit.transitionType ?? 'open');
      }
    }

    // Check if player stepped onto a portal
    const portals = this.portalPlacementsByDungon()[preview.dungonId] ?? [];
    const landedPortal = portals.find((p) =>
      (p.startRow === nextRow && p.startColumn === nextColumn && p.endRow !== null && p.endColumn !== null) ||
      (p.isTwoWay && p.endRow === nextRow && p.endColumn === nextColumn && p.startRow !== null && p.startColumn !== null)
    );
    if (landedPortal) {
      const fromStart = landedPortal.startRow === nextRow && landedPortal.startColumn === nextColumn;
      const destRow = fromStart ? landedPortal.endRow! : landedPortal.startRow!;
      const destCol = fromStart ? landedPortal.endColumn! : landedPortal.startColumn!;
      const halfDim = Math.floor(this.previewGridDimension / 2);
      this.gridPreviewContext.set({
        ...this.gridPreviewContext()!,
        centerRow: destRow,
        centerColumn: destCol,
        startRow: destRow - halfDim,
        startColumn: destCol - halfDim,
      });
      this.playSoundPath(this.portalTraverseSoundPath);
      this.logNearbyAfterMove();
    }

    // Check if player stepped onto a floor trap
    this.checkFloorTrapsAtCurrentSquare(preview.dungonId, nextRow, nextColumn, bypassTriggerForThisMove);

    this.drawPreviewGridCanvas();

    if (this.turnPhase() === 'player' && this.playerAE() <= 0) {
      this.startMonsterTurns();
    }
  }

  private isDiagonalMovementBlocked(
    dungonId: number,
    fromRow: number,
    fromColumn: number,
    rowOffset: number,
    columnOffset: number
  ): boolean {
    const targetRow = fromRow + rowOffset;
    const targetColumn = fromColumn + columnOffset;
    const viaVertical = this.canTraverseTwoStepPath(
      dungonId,
      fromRow,
      fromColumn,
      fromRow + rowOffset,
      fromColumn,
      targetRow,
      targetColumn
    );
    const viaHorizontal = this.canTraverseTwoStepPath(
      dungonId,
      fromRow,
      fromColumn,
      fromRow,
      fromColumn + columnOffset,
      targetRow,
      targetColumn
    );

    return !viaVertical && !viaHorizontal;
  }

  private canTraverseTwoStepPath(
    dungonId: number,
    fromRow: number,
    fromColumn: number,
    middleRow: number,
    middleColumn: number,
    targetRow: number,
    targetColumn: number
  ): boolean {
    const filledSquares = this.filledSquaresByDungon()[dungonId] ?? {};
    if (!filledSquares[this.getSquareKey(middleRow, middleColumn)]) {
      return false;
    }

    if (!filledSquares[this.getSquareKey(targetRow, targetColumn)]) {
      return false;
    }

    if (
      this.isMovementBlockedBetweenAdjacentSquares(
        dungonId,
        fromRow,
        fromColumn,
        middleRow,
        middleColumn
      )
    ) {
      return false;
    }

    if (
      this.isMovementBlockedBetweenAdjacentSquares(
        dungonId,
        middleRow,
        middleColumn,
        targetRow,
        targetColumn
      )
    ) {
      return false;
    }

    return true;
  }

  private getMovementDeltaForFacingDirection(
    direction: FacingDirection
  ): { rowOffset: number; columnOffset: number } {
    if (direction === 'up') {
      return { rowOffset: -1, columnOffset: 0 };
    }

    if (direction === 'right') {
      return { rowOffset: 0, columnOffset: 1 };
    }

    if (direction === 'down') {
      return { rowOffset: 1, columnOffset: 0 };
    }

    return { rowOffset: 0, columnOffset: -1 };
  }

  private getFacingWallSides(direction: DisplayFacingDirection): SquareSide[] {
    switch (direction) {
      case 'up': return ['toTop'];
      case 'down': return ['toBottom'];
      case 'left': return ['toLeft'];
      case 'right': return ['toRight'];
      case 'upRight': return ['toTop', 'toRight'];
      case 'upLeft': return ['toTop', 'toLeft'];
      case 'downRight': return ['toBottom', 'toRight'];
      case 'downLeft': return ['toBottom', 'toLeft'];
      default: return [];
    }
  }

  private oppositeWallSide(side: SquareSide): SquareSide {
    const map: Record<SquareSide, SquareSide> = {
      toTop: 'toBottom',
      toBottom: 'toTop',
      toLeft: 'toRight',
      toRight: 'toLeft',
    };
    return map[side];
  }

  private checkFloorTrapsAtCurrentSquare(dungonId: number, row: number, column: number, skipTrigger = false): void {
    const traps = this.floorTrapPlacementsByDungon()[dungonId] ?? [];
    const activeTrap = traps.find(
      (p) => p.row === row && p.column === column && !p.isTriggered && !p.isDisarmed
    );
    if (!activeTrap) return;

    if (skipTrigger) {
      this.floorTrapPlacementsByDungon.update((all) => ({
        ...all,
        [dungonId]: (all[dungonId] ?? []).map((p) =>
          p.id === activeTrap.id ? { ...p, isDetected: true } : p
        ),
      }));
      this.saveGameState();
      return;
    }

    this.floorTrapPlacementsByDungon.update((all) => ({
      ...all,
      [dungonId]: (all[dungonId] ?? []).map((p) =>
        p.id === activeTrap.id ? { ...p, isTriggered: true, isDetected: true } : p
      ),
    }));

    this.triggerTrap(activeTrap.trap);
    this.saveGameState();
  }

  private getActiveFloorTrapAtSquare(dungonId: number, row: number, column: number): FloorTrapPlacement | null {
    return (this.floorTrapPlacementsByDungon()[dungonId] ?? []).find(
      (p) => p.row === row && p.column === column && !p.isTriggered && !p.isDisarmed
    ) ?? null;
  }

  private getTriggeredFloorTrapAtSquare(dungonId: number, row: number, column: number): FloorTrapPlacement | null {
    return (this.floorTrapPlacementsByDungon()[dungonId] ?? []).find(
      (p) => p.row === row && p.column === column && p.isTriggered && !p.isDisarmed
    ) ?? null;
  }

  private getTrapType(trap: Trap): string {
    const explicit = (trap.trapType ?? '').trim();
    if (explicit) return explicit;
    const name = (trap.name ?? '').trim().toLowerCase();
    if (name.includes('spiked pit')) return 'Spiked Pit';
    if (name.includes('ceiling spikes')) return 'Ceiling Spikes';
    if (name.includes('floor glue')) return 'Floor Glue';
    if (name.includes('drop net')) return 'Drop Net';
    if (name.includes('dart')) return 'Dart';
    if (name.includes('gas')) return 'Gas Cloud';
    if (name.includes('wall spikes')) return 'Wall Spikes';
    if (name.includes('pit')) return 'Pit';
    return 'Pit';
  }

  private getTrapCrossingItems(trap: Trap): { itemId: number; itemName: string }[] {
    return Array.isArray(trap.crossingRequirements) ? trap.crossingRequirements : [];
  }

  private getOwnedTrapCrossingItems(trap: Trap): { itemId: number; itemName: string }[] {
    return this.getTrapCrossingItems(trap).filter((req) => this.playerHasItem(req.itemId));
  }

  private getTrapCrossingHintText(trap: Trap): string {
    const requirements = this.getTrapCrossingItems(trap);
    if (requirements.length === 0) {
      return '';
    }
    const names = requirements
      .map((req) => (req.itemName && req.itemName.trim() ? req.itemName.trim() : `Item ${req.itemId}`))
      .join(', ');
    return ` Need one of these items to cross safely: ${names}.`;
  }

  private canBypassTrapWithCrossingItem(trap: Trap): boolean {
    return (
      this.getTrapCrossingItems(trap).length > 0 &&
      this.getOwnedTrapCrossingItems(trap).length > 0
    );
  }

  private openTrapCrossingPrompt(
    preview: GridPreviewContext,
    rowOffset: number,
    columnOffset: number,
    trapPlacement: FloorTrapPlacement
  ): void {
    const allRequirements = this.getTrapCrossingItems(trapPlacement.trap);
    if (allRequirements.length === 0) {
      return;
    }

    const requiredItems = allRequirements.map((req) => ({
      itemId: req.itemId,
      itemName: req.itemName && req.itemName.trim() ? req.itemName.trim() : `Item ${req.itemId}`,
      owned: this.playerHasItemInDungon(preview.dungonId, req.itemId),
    }));

    this.pendingTrapCrossingPrompt.set({
      dungonId: preview.dungonId,
      fromRow: preview.centerRow,
      fromColumn: preview.centerColumn,
      rowOffset,
      columnOffset,
      trapId: trapPlacement.id,
      trapName: trapPlacement.trap.name?.trim() || this.getTrapType(trapPlacement.trap),
      requiredItems,
    });
  }

  private isMoveTowardFacingDirection(dungonId: number, rowOffset: number, columnOffset: number): boolean {
    if (Math.abs(rowOffset) + Math.abs(columnOffset) !== 1) {
      return false;
    }
    const cheater = this.cheaterByDungon()[dungonId] ?? DEFAULT_CHEATER;
    const forwardDelta = this.getMovementDeltaForFacingDirection(cheater.facingDir);
    return forwardDelta.rowOffset === rowOffset && forwardDelta.columnOffset === columnOffset;
  }

  useTrapCrossingItem(itemId: number): void {
    const prompt = this.pendingTrapCrossingPrompt();
    if (!prompt) {
      return;
    }

    const required = prompt.requiredItems.find((entry) => entry.itemId === itemId) ?? null;
    if (!required) {
      return;
    }

    if (!this.playerHasItemInDungon(prompt.dungonId, itemId)) {
      this.previewActionMessage.set(`You don't have the required item to cross ${prompt.trapName} safely.`);
      this.pendingTrapCrossingPrompt.set({
        ...prompt,
        requiredItems: prompt.requiredItems.map((entry) => ({
          ...entry,
          owned: this.playerHasItemInDungon(prompt.dungonId, entry.itemId),
        })),
      });
      return;
    }

    this.pendingTrapCrossingPrompt.set(null);
    const itemName = required.itemName?.trim() || `Item ${itemId}`;
    this.previewActionMessage.set(`You use ${itemName} to cross ${prompt.trapName} safely.`);
    this.resumeTrapCrossingMove(prompt, true);
  }

  cancelTrapCrossingPrompt(): void {
    if (!this.pendingTrapCrossingPrompt()) {
      return;
    }
    this.pendingTrapCrossingPrompt.set(null);
  }

  declineTrapCrossingUseItem(): void {
    const prompt = this.pendingTrapCrossingPrompt();
    if (!prompt) {
      return;
    }
    this.pendingTrapCrossingPrompt.set(null);
    this.resumeTrapCrossingMove(prompt, false);
  }

  private resumeTrapCrossingMove(prompt: PendingTrapCrossingPrompt, useItem: boolean): void {
    const preview = this.gridPreviewContext();
    if (!preview || preview.dungonId !== prompt.dungonId) {
      return;
    }
    if (preview.centerRow !== prompt.fromRow || preview.centerColumn !== prompt.fromColumn) {
      this.previewActionMessage.set('You moved before answering the trap prompt. Try again.');
      return;
    }

    this.tryMoveCheaterByDelta(preview, prompt.rowOffset, prompt.columnOffset, useItem);
  }

  private hasAnyTrapCrossingItem(trap: Trap): boolean {
    const requirements = this.getTrapCrossingItems(trap);
    return requirements.some((req) => this.playerHasItem(req.itemId));
  }

  private canThiephCrossTrap(trap: Trap): boolean {
    if (!this.isThiephClass()) {
      return false;
    }
    const roll = this.randomInt(1, 10) + this.randomInt(1, 10) + 1;
    const dc = Math.max(0, trap.toDisarm);
    this.addCombatLog(`Thieph crossing roll: ${roll} vs DC ${dc}.`);
    return roll >= dc;
  }

  private canSafelyCrossFloorTrap(trap: Trap): boolean {
    const trapType = this.getTrapType(trap);
    if (this.isThiephClass()) {
      return this.canThiephCrossTrap(trap);
    }
    if (trapType === 'Pit' || trapType === 'Spiked Pit') {
      return this.hasAnyTrapCrossingItem(trap);
    }
    return false;
  }

  private applyTrapSecondaryEffect(trap: Trap): void {
    const effectTo = (trap.secondaryEffectTo ?? '').trim();
    const amount = Math.max(0, trap.secondaryEffectAmount ?? 0);
    const duration = Math.max(0, trap.secondaryEffectDuration ?? 0);
    if (!effectTo || amount <= 0) return;

    const normalized = effectTo.toLowerCase();
    if (normalized === 'ae') {
      this.playerAE.set(Math.max(0, this.playerAE() - amount));
      this.addCombatLog(`${trap.name || 'Trap'} also drains ${amount} AE.`);
      return;
    }

    if (normalized === 'ros') {
      const preview = this.gridPreviewContext();
      if (!preview) return;
      const existingCheater = this.cheaterByDungon()[preview.dungonId];
      if (!existingCheater) return;
      const newROS = Math.max(1, existingCheater.rangeOfSight - amount);
      this.cheaterByDungon.update((all) => ({
        ...all,
        [preview.dungonId]: { ...existingCheater, rangeOfSight: newROS },
      }));
      this.addCombatLog(`${trap.name || 'Trap'} also reduces Range of Sight by ${amount} (now ${newROS}).`);
      return;
    }

    this.playerActiveEffects.update((effects) => [
      ...effects,
      {
        effectOn: effectTo,
        effectAmount: amount,
        remainingAE: this.spellEffectRemainingAE(duration),
        sourceName: trap.name || 'Trap',
        behavior: 'modifier',
      },
    ]);
    this.addCombatLog(`${trap.name || 'Trap'} also applies ${effectTo} ${amount} for ${duration} AE.`);
  }

  private getMovementDeltaForDisplayFacingDirection(
    direction: DisplayFacingDirection
  ): { rowOffset: number; columnOffset: number } {
    if (direction === 'upRight') {
      return { rowOffset: -1, columnOffset: 1 };
    }

    if (direction === 'downRight') {
      return { rowOffset: 1, columnOffset: 1 };
    }

    if (direction === 'downLeft') {
      return { rowOffset: 1, columnOffset: -1 };
    }

    if (direction === 'upLeft') {
      return { rowOffset: -1, columnOffset: -1 };
    }

    return this.getMovementDeltaForFacingDirection(direction);
  }

  private isMovementBlockedBetweenAdjacentSquares(
    dungonId: number,
    fromRow: number,
    fromColumn: number,
    toRow: number,
    toColumn: number
  ): boolean {
    const blockType = this.getMovementBlockTypeBetweenAdjacentSquares(
      dungonId,
      fromRow,
      fromColumn,
      toRow,
      toColumn
    );

    return blockType === 'wall' || blockType === 'closedDoor' || blockType === 'void';
  }

  private getMovementBlockTypeBetweenAdjacentSquares(
    dungonId: number,
    fromRow: number,
    fromColumn: number,
    toRow: number,
    toColumn: number
  ): PathBlockType {
    return this.getMovementConnectionInfoBetweenAdjacentSquares(
      dungonId,
      fromRow,
      fromColumn,
      toRow,
      toColumn
    ).type;
  }

  private getMovementConnectionInfoBetweenAdjacentSquares(
    dungonId: number,
    fromRow: number,
    fromColumn: number,
    toRow: number,
    toColumn: number
  ): AdjacentConnectionInfo {
    const rowDelta = toRow - fromRow;
    const columnDelta = toColumn - fromColumn;
    if (Math.abs(rowDelta) + Math.abs(columnDelta) !== 1) {
      return { type: 'void', door: null };
    }

    const squares = this.squaresByDungon()[dungonId] ?? {};
    const fromSquare = squares[this.getSquareKey(fromRow, fromColumn)];
    if (!fromSquare) {
      return { type: 'void', door: null };
    }

    let fromSide: SquareSide;
    let toSide: SquareSide;

    if (rowDelta === -1) {
      fromSide = 'toTop';
      toSide = 'toBottom';
    } else if (rowDelta === 1) {
      fromSide = 'toBottom';
      toSide = 'toTop';
    } else if (columnDelta === -1) {
      fromSide = 'toLeft';
      toSide = 'toRight';
    } else {
      fromSide = 'toRight';
      toSide = 'toLeft';
    }

    const fromConnection = fromSquare[fromSide];

    if (this.isWallConnection(fromConnection)) {
      return { type: 'wall', door: null };
    }

    if (this.isDoorConnection(fromConnection)) {
      if (fromConnection.isHidden && !fromConnection.isFound) {
        return { type: 'wall', door: null };
      }
      if (fromConnection.state === 'open' && fromConnection.oneWay && fromConnection.openDirection !== null) {
        const allowedFromSide = `to${fromConnection.openDirection.charAt(0).toUpperCase()}${fromConnection.openDirection.slice(1)}` as SquareSide;
        if (fromSide !== allowedFromSide) {
          return { type: 'wall', door: null };
        }
      }
      return {
        type: fromConnection.state === 'closed' ? 'closedDoor' : 'openDoor',
        door: fromConnection,
      };
    }

    const toSquare = squares[this.getSquareKey(toRow, toColumn)];
    if (!toSquare) {
      return { type: 'void', door: null };
    }

    const toConnection = toSquare[toSide];

    if (this.isWallConnection(toConnection)) {
      return { type: 'wall', door: null };
    }

    if (this.isDoorConnection(toConnection)) {
      if (toConnection.isHidden && !toConnection.isFound) {
        return { type: 'wall', door: null };
      }
      return {
        type: toConnection.state === 'closed' ? 'closedDoor' : 'openDoor',
        door: toConnection,
      };
    }

    const obstacles = this.obstaclePlacementsByDungon()[dungonId] ?? [];
    const hasObstacle = obstacles.some(
      (obs) => obs.row === toRow && obs.column === toColumn && this.isObstacleBlockingMovement(obs)
    );
    if (hasObstacle) {
      return { type: 'wall', door: null };
    }

    return { type: 'none', door: null };
  }

  /**
   * Determines whether an obstacle placement blocks movement into its
   * square. Destroyed obstacles never block. Short floor-anchored obstacles
   * (<=20% height) can be stepped over, and low ceiling-anchored obstacles
   * (<=40% height) can be walked under - both are treated as non-blocking
   * terrain rather than a full wall.
   */
  private isObstacleBlockingMovement(obs: ObstaclePlacement): boolean {
    if (obs.isDestroyed) {
      return false;
    }
    const heightAnchor = obs.heightAnchor ?? 'floor';
    const heightPercent = obs.heightPercent ?? 100;
    if (heightAnchor === 'floor' && heightPercent <= 20) {
      return false;
    }
    if (heightAnchor === 'ceiling' && heightPercent <= 40) {
      return false;
    }
    return true;
  }

  private getFacingDirectionFromKey(key: string): FacingDirection | null {
    if (key === 'ArrowUp') {
      return 'up';
    }

    if (key === 'ArrowDown') {
      return 'down';
    }

    return null;
  }

  private turnFacing(current: FacingDirection, turn: 'left' | 'right'): FacingDirection {
    const order: FacingDirection[] = ['up', 'right', 'down', 'left'];
    const delta = turn === 'right' ? 1 : -1;
    return order[(order.indexOf(current) + delta + 4) % 4];
  }

  private drawFacingArrow(
    context: CanvasRenderingContext2D,
    left: number,
    top: number,
    size: number,
    direction: DisplayFacingDirection
  ): void {
    const centerX = left + size / 2;
    const centerY = top + size / 2;
    const tipOffset = size * 0.34;
    const baseOffset = size * 0.14;
    const wingOffset = size * 0.2;

    const vector = this.getFacingVector(direction);
    const perpendicular = {
      x: -vector.y,
      y: vector.x,
    };

    const tipX = centerX + vector.x * tipOffset;
    const tipY = centerY + vector.y * tipOffset;
    const baseX = centerX - vector.x * baseOffset;
    const baseY = centerY - vector.y * baseOffset;
    const wingAX = baseX + perpendicular.x * wingOffset;
    const wingAY = baseY + perpendicular.y * wingOffset;
    const wingBX = baseX - perpendicular.x * wingOffset;
    const wingBY = baseY - perpendicular.y * wingOffset;

    context.fillStyle = '#30d158';
    context.strokeStyle = '#1f8f3a';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(tipX, tipY);
    context.lineTo(wingAX, wingAY);
    context.lineTo(wingBX, wingBY);
    context.closePath();
    context.fill();
    context.stroke();
  }

  private getFacingVector(direction: DisplayFacingDirection): { x: number; y: number } {
    if (direction === 'up') {
      return { x: 0, y: -1 };
    }

    if (direction === 'upRight') {
      return { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
    }

    if (direction === 'right') {
      return { x: 1, y: 0 };
    }

    if (direction === 'downRight') {
      return { x: Math.SQRT1_2, y: Math.SQRT1_2 };
    }

    if (direction === 'down') {
      return { x: 0, y: 1 };
    }

    if (direction === 'downLeft') {
      return { x: -Math.SQRT1_2, y: Math.SQRT1_2 };
    }

    if (direction === 'left') {
      return { x: -1, y: 0 };
    }

    return { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
  }

  private getFacingDirectionLabel(direction: DisplayFacingDirection): string {
    if (direction === 'upRight') {
      return 'UP-RIGHT';
    }

    if (direction === 'downRight') {
      return 'DOWN-RIGHT';
    }

    if (direction === 'downLeft') {
      return 'DOWN-LEFT';
    }

    if (direction === 'upLeft') {
      return 'UP-LEFT';
    }

    return direction.toUpperCase();
  }

  private withSquareSide(
    square: Square,
    side: SquareSide,
    value: Door | Wall | null
  ): Square {
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

  private loadDungonJsonState(dungonId: number, rawDungonJson: unknown): void {
    const parsed = this.gameJsonParserService.parseDungonJsonPayload(rawDungonJson);

    this.filledSquaresByDungon.update((allSquares) => ({
      ...allSquares,
      [dungonId]: parsed.filledSquares,
    }));

    this.squaresByDungon.update((allSquares) => ({
      ...allSquares,
      [dungonId]: parsed.squares,
    }));

    this.cheaterByDungon.update((allCheaters) => ({
      ...allCheaters,
      [dungonId]: (() => {
        // For main-game dungons, load the PC-specific cheater if one exists
        if (this.isMainGame()) {
          const pcId = this.currentPcId_();
          if (pcId !== null && parsed.cheaterByPcId[pcId]) {
            return parsed.cheaterByPcId[pcId];
          }
        }
        return parsed.cheater;
      })(),
    }));

    this.cheaterByPcId_.set(parsed.cheaterByPcId);

    this.startPointByDungon.update((allStartPoints) => ({
      ...allStartPoints,
      [dungonId]: parsed.startpoint,
    }));

    this.tresherListByDungon.update((allTreshers) => ({
      ...allTreshers,
      [dungonId]: parsed.tresherList,
    }));

    this.tresherPlacementsByDungon.update((allPlacements) => ({
      ...allPlacements,
      [dungonId]: parsed.tresherPlacements,
    }));

    this.monsterListByDungon.update((allMonsters) => ({
      ...allMonsters,
      [dungonId]: parsed.monsterList,
    }));

    this.monsterPlacementsByDungon.update((allPlacements) => ({
      ...allPlacements,
      [dungonId]: parsed.monsterPlacements,
    }));

    this.squareTextsByDungon.update((allTexts) => ({
      ...allTexts,
      [dungonId]: parsed.squareTexts ?? [],
    }));

    this.exitsByDungon.update((allExits) => ({
      ...allExits,
      [dungonId]: parsed.exits,
    }));

    this.portalPlacementsByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.portalPlacements,
    }));

    this.setPcInventoryInitialized(dungonId, parsed.pcInventoryInitialized);

    this.floorTrapPlacementsByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.floorTrapPlacements,
    }));

    this.obstaclePlacementsByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.obstaclePlacements,
    }));

    this.floorItemPlacementsByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.itemPlacements,
    }));

    this.floorPotionPlacementsByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.potionPlacements,
    }));

    this.floorSpellPlacementsByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.spellPlacements,
    }));

    this.floorItemListByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.floorItemList,
    }));

    this.floorPotionListByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.floorPotionList,
    }));

    this.floorSpellListByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.floorSpellList,
    }));

    this.collectedFloorItemsByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.collectedFloorItems,
    }));

    this.collectedFloorPotionsByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.collectedFloorPotions,
    }));

    this.collectedFloorSpellsByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.collectedFloorSpells,
    }));

    this.learnedFloorSpellIdsByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.learnedFloorSpellIds,
    }));

    const knownSpellIds = new Set<number>(parsed.learnedFloorSpellIds);
    for (const tresher of (this.cheaterByDungon()[dungonId]?.inventory.treshers ?? [])) {
      for (const spellId of [tresher.spell1Id, tresher.spell2Id, tresher.spell3Id, tresher.spell4Id]) {
        if (spellId != null) knownSpellIds.add(spellId);
      }
    }
    this.equippedSpellIdsByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.equippedSpellIds.filter((id) => knownSpellIds.has(id)),
    }));

    if (parsed.collectedFloorSpells.length > 0 || parsed.floorSpellList.length > 0) {
      this.pcTresherSpellsById.update((map) => {
        const updated = new Map(map);
        for (const spell of parsed.floorSpellList) {
          updated.set(spell.id, spell);
        }
        for (const spell of parsed.collectedFloorSpells) {
          updated.set(spell.id, spell);
        }
        return updated;
      });
    }

    // Ensure collected floor items are in the item lookup map so the equip system can resolve them
    if (parsed.collectedFloorItems.length > 0) {
      this.pcTresherItemsById.update((map) => {
        const updated = new Map(map);
        for (const it of parsed.collectedFloorItems) {
          updated.set(it.id, { ...it, effectValue: it.effectValue ?? 0 });
        }
        return updated;
      });
    }

    this.keyList = parsed.keyList;

    const monsterHeldKeyIds = new Set(
      parsed.monsterList.flatMap((m) => m.keyIds ?? [])
    );
    const aliveMonsterIds = new Set(
      parsed.monsterPlacements
        .filter((p) => !p.isDead)
        .map((p) => p.monsterId)
    );
    const aliveHeldKeyIds = new Set(
      parsed.monsterList
        .filter((m) => aliveMonsterIds.has(m.id))
        .flatMap((m) => m.keyIds ?? [])
    );
    if (aliveHeldKeyIds.size > 0) {
      this.keyList = this.keyList.map((key) =>
        aliveHeldKeyIds.has(key.id)
          ? { ...key, rownId: null, columnId: null }
          : key
      );
    }

    this.npcTradesPurchased.set(parsed.npcTradesPurchased);
    this.rangerRangedHitBonus.set(parsed.rangerRangedHitBonus);
    this.rangerFavoredTypeDamageBonuses.set(parsed.rangerFavoredTypeDamageBonuses);
    this.selectedRangerFavoredTypeToBuy.set(null);

    this.savedCombatState = {
      playerHp: parsed.savedPlayerHp,
      playerAE: parsed.savedPlayerAE,
      turnPhase: parsed.savedTurnPhase,
      playerRow: parsed.savedPlayerRow,
      playerColumn: parsed.savedPlayerColumn,
    };
  }

  private normalizeCheaterInventory(
    inventory: CheaterInventory | null | undefined
  ): CheaterInventory {
    return this.inventoryService.normalizeCheaterInventory(inventory);
  }

  private getHealingPotionAmount(tresher: Tresher): number {
    return (tresher.type ?? 'OtherTresher') === 'Potion' ? 6 : 0;
  }

  private setPcInventoryInitialized(dungonId: number, isInitialized: boolean): void {
    this.inventoryService.setPcInventoryInitialized(dungonId, isInitialized);
  }

  private applyMonsterAttackCurseToPlayer(monsterName: string, attack: MonsterAttack): void {
    if (attack.curseId == null) {
      return;
    }
    const curse = this.pcTresherCursesById().get(attack.curseId);
    if (!curse) {
      return;
    }

    const slots: Array<{ effectOn: string; amount: number }> = [];
    if (curse.effectTo && curse.damage > 0) {
      slots.push({ effectOn: curse.effectTo, amount: -Math.abs(curse.damage) });
    }
    if (curse.effectTo2 && curse.damage2 > 0) {
      slots.push({ effectOn: curse.effectTo2, amount: -Math.abs(curse.damage2) });
    }
    if (slots.length === 0) {
      return;
    }

    for (const slot of slots) {
      const normalizedTarget = (slot.effectOn ?? '').trim().toLowerCase();
      const sourceName = `${monsterName} / ${curse.name}`;
      if (normalizedTarget === 'boost dice') {
        this.playerActiveEffects.update((effects) => [
          ...effects,
          {
            effectOn: 'Boost Dice',
            effectAmount: -1,
            remainingAE: this.spellEffectRemainingAE(Math.max(1, curse.lastFor || 1)),
            sourceName,
            behavior: 'modifier',
          },
        ]);
        this.addCombatLog(`${monsterName} afflicts you with ${curse.name}. (Boost Dice disabled)`);
        continue;
      }

      const target = this.normalizeEffectToPcStat(slot.effectOn);
      if (target === null) {
        continue;
      }

      if (curse.lastFor === 0) {
        this.applyPermanentPlayerSpellEffect(target, slot.amount);
      } else if (target === 'HP') {
        this.playerActiveEffects.update((effects) => [
          ...effects,
          {
            effectOn: 'HP',
            effectAmount: slot.amount,
            remainingAE: this.spellEffectRemainingAE(curse.lastFor),
            sourceName,
            behavior: 'tick',
          },
        ]);
      } else {
        this.playerActiveEffects.update((effects) => [
          ...effects,
          {
            effectOn: target,
            effectAmount: slot.amount,
            remainingAE: this.spellEffectRemainingAE(curse.lastFor),
            sourceName,
            behavior: 'modifier',
          },
        ]);
      }

      this.addCombatLog(
        `${monsterName} curses you with ${curse.name} ${this.spellEffectDurationLabel(curse.lastFor)}. (${target} ${slot.amount})`
      );
    }
  }

  closeTavernModal(): void {
    this.showTavernModal.set(false);
    if (!this.npcDialog() && !this.showYeOldMagiceShopModal()) {
      this.stopTavernMusic();
    }
  }

  enterFrontYeOldMagiceShop(): void {
    const shop = this.frontFacingYeOldMagiceShop();
    if (!shop) return;

    const preview = this.gridPreviewContext();
    if (!preview) return;

    this.gameShopService.openYeOldMagiceShop(preview.dungonId, shop.id, this.gameShopService.resolveKeeperInfo(shop.note));
    this.startTavernMusic();
  }

  dismissFrontYeOldMagiceShopPrompt(): void {
    const shop = this.frontFacingYeOldMagiceShop();
    const preview = this.gridPreviewContext();
    if (!shop || !preview) return;

    this.gameShopService.dismissYeOldMagiceShopPrompt(this.currentGameId() ?? 0, preview.dungonId, shop.id);
  }

  closeYeOldMagiceShop(): void {
    this.gameShopService.closeYeOldMagiceShop();
    if (!this.npcDialog() && !this.showTavernModal()) {
      this.stopTavernMusic();
    }
  }

  setYeOldMagiceShopView(
    view: 'main' | 'buyItems' | 'sellItems' | 'buySpells' | 'sellSpells' | 'buyPotions' | 'sellPotions' | 'info' | 'upgrades'
  ): void {
    this.gameShopService.setYeOldMagiceShopView(view);
  }

  buyDrinkForKeeperInfo(): void {
    if (this.yeOldMagiceShopDrinkPurchased()) {
      this.yeOldMagiceShopMessage.set('You already bought a drink for the keeper.');
      return;
    }
    if (this.playerSp() < this.shopDrinkCost) {
      this.yeOldMagiceShopMessage.set(`Need ${this.shopDrinkCost} SP for a drink.`);
      return;
    }
    this.playerSp.update((sp) => sp - this.shopDrinkCost);
    this.yeOldMagiceShopDrinkPurchased.set(true);
    this.yeOldMagiceShopMessage.set('You slide a drink across the bar. The keeper nods.');
    this.saveGameState();
  }

  askKeeperForDungonInfo(): void {
    if (!this.yeOldMagiceShopDrinkPurchased()) {
      this.yeOldMagiceShopMessage.set('Buy the keeper a drink first.');
      return;
    }
    this.yeOldMagiceShopInfoUnlocked.set(true);
    this.yeOldMagiceShopMessage.set('The keeper shares what they know.');
  }

  buyHealingAtShop(): void {
    if (this.playerHp() >= this.getEffectivePlayerMaxHp()) {
      this.yeOldMagiceShopMessage.set('You are already fully healed.');
      return;
    }
    if (this.playerSp() < this.shopHealingCost) {
      this.yeOldMagiceShopMessage.set(`Need ${this.shopHealingCost} SP for healing.`);
      return;
    }
    this.playerSp.update((sp) => sp - this.shopHealingCost);
    this.playerHp.set(this.getEffectivePlayerMaxHp());
    this.yeOldMagiceShopMessage.set('The keeper patches you up to full health.');
    this.saveGameState();
  }

  clearCursesAtShop(): void {
    const dungonId = this.activeYeOldMagiceShopDungonId();
    if (dungonId === null) return;

    const hasInventoryCurse = this.inventoryTreshersForPreview().some((t) => t.curse1Id !== null || t.curse2Id !== null);
    const hasActiveCurse = this.playerActiveEffects().some((e) => this.isCurseEffectEntry(e.effectOn, e.effectAmount));
    if (!hasInventoryCurse && !hasActiveCurse) {
      this.yeOldMagiceShopMessage.set('No curse is currently affecting you.');
      return;
    }
    if (this.playerSp() < this.shopCurseClearCost) {
      this.yeOldMagiceShopMessage.set(`Need ${this.shopCurseClearCost} SP to clear curses.`);
      return;
    }

    this.playerSp.update((sp) => sp - this.shopCurseClearCost);
    this.clearPlayerCursesForDungon(dungonId);
    this.yeOldMagiceShopMessage.set('A cleansing ritual clears your curses.');
    this.saveGameState();
  }

  private isCurseEffectEntry(effectOn: string, effectAmount: number): boolean {
    const normalized = (effectOn ?? '').trim().toLowerCase();
    return effectAmount < 0 || normalized === 'boost dice';
  }

  private clearPlayerCursesForDungon(dungonId: number): number {
    const activeBefore = this.playerActiveEffects().length;

    this.cheaterByDungon.update((all) => {
      const existing = all[dungonId] ?? { ...DEFAULT_CHEATER };
      return {
        ...all,
        [dungonId]: {
          ...existing,
          inventory: {
            ...existing.inventory,
            treshers: existing.inventory.treshers.map((t) => ({ ...t, curse1Id: null, curse2Id: null })),
          },
        },
      };
    });

    this.playerActiveEffects.update((effects) =>
      effects.filter((e) => !this.isCurseEffectEntry(e.effectOn, e.effectAmount))
    );

    return activeBefore - this.playerActiveEffects().length;
  }

  private clearMonsterCurses(monster: GameMonsterInstance): number {
    const before = monster.activeEffects.length;
    monster.activeEffects = monster.activeEffects.filter(
      (e) => !this.isCurseEffectEntry(e.effectOn, e.effectAmount)
    );
    return before - monster.activeEffects.length;
  }

  buyShopItem(itemId: number): void {
    const item = this.pcTresherItemsById().get(itemId);
    if (!item) return;
    this.buyFromShopCatalog(
      this.shopBuyItemCost,
      this.buildShopPurchaseTresher(`Shop Item: ${item.name}`, item.description, { itemId })
    );
  }

  buyShopSpell(spellId: number): void {
    const spell = this.pcTresherSpellsById().get(spellId);
    if (!spell) return;
    this.buyFromShopCatalog(
      this.shopBuySpellCost,
      this.buildShopPurchaseTresher(`Shop Spell: ${spell.name}`, spell.description, { spellId })
    );
  }

  buyShopPotion(potionId: number): void {
    const potion = this.pcTresherPotionsById().get(potionId);
    if (!potion) return;
    this.buyFromShopCatalog(
      this.shopBuyPotionCost,
      this.buildShopPurchaseTresher(`Shop Potion: ${potion.name}`, potion.description, { potionId })
    );
  }

  yeOldMagiceShopSellableItems(): ShopSellEntry[] {
    return this.getYeOldMagiceShopSellEntries('item');
  }

  yeOldMagiceShopSellableSpells(): ShopSellEntry[] {
    return this.getYeOldMagiceShopSellEntries('spell');
  }

  yeOldMagiceShopSellablePotions(): ShopSellEntry[] {
    return this.getYeOldMagiceShopSellEntries('potion');
  }

  sellFromYeOldMagiceShop(entry: ShopSellEntry): void {
    const dungonId = this.activeYeOldMagiceShopDungonId();
    if (dungonId === null) return;

    this.cheaterByDungon.update((all) => {
      const existing = all[dungonId] ?? { ...DEFAULT_CHEATER };
      const inventory = existing.inventory;
      if (entry.tresherIndex < 0 || entry.tresherIndex >= inventory.treshers.length) {
        return all;
      }
      const updatedTreshers = inventory.treshers.map((tresher, index) =>
        index === entry.tresherIndex ? { ...tresher, [entry.slotKey]: null } : tresher
      );
      return {
        ...all,
        [dungonId]: {
          ...existing,
          inventory: {
            ...inventory,
            treshers: updatedTreshers,
          },
        },
      };
    });

    this.playerSp.update((sp) => sp + entry.sellPrice);
    this.yeOldMagiceShopMessage.set(`Sold ${entry.name} for ${entry.sellPrice} SP.`);
    this.saveGameState();
  }

  private buyFromShopCatalog(cost: number, purchasedTresher: Tresher): void {
    const dungonId = this.activeYeOldMagiceShopDungonId();
    if (dungonId === null) return;
    if (this.playerSp() < cost) {
      this.yeOldMagiceShopMessage.set(`Need ${cost} SP.`);
      return;
    }
    this.playerSp.update((sp) => sp - cost);
    this.addItemsToCheaterInventory(dungonId, [], [purchasedTresher]);
    this.yeOldMagiceShopMessage.set(`Purchased ${purchasedTresher.name} for ${cost} SP.`);
    this.saveGameState();
  }

  private buildShopPurchaseTresher(
    name: string,
    description: string,
    payload: { itemId?: number; spellId?: number; potionId?: number }
  ): Tresher {
    const dungonId = this.activeYeOldMagiceShopDungonId() ?? this.gridPreviewContext()?.dungonId ?? 0;
    const existing = this.cheaterByDungon()[dungonId]?.inventory.treshers ?? [];
    return this.gameShopService.buildShopPurchaseTresher(name, description, payload, existing);
  }

  private getYeOldMagiceShopSellEntries(kind: 'item' | 'spell' | 'potion'): ShopSellEntry[] {
    const preview = this.gridPreviewContext();
    if (!preview) return [];
    const inventory = this.cheaterByDungon()[preview.dungonId]?.inventory.treshers ?? [];
    const itemMap = this.pcTresherItemsById();
    const spellMap = this.pcTresherSpellsById();
    const potionMap = this.pcTresherPotionsById();

    return this.gameShopService.getSellEntries(kind, inventory, itemMap, spellMap, potionMap);
  }

  private getFrontFacingYeOldMagiceShop(): ObstaclePlacement | null {
    const preview = this.gridPreviewContext();
    if (!preview) return null;

    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const forward = this.getMovementDeltaForFacingDirection(cheater.facingDir);
    const frontRow = preview.centerRow + forward.rowOffset;
    const frontColumn = preview.centerColumn + forward.columnOffset;
    const shop = (this.obstaclePlacementsByDungon()[preview.dungonId] ?? []).find(
      (obs) => !obs.isDestroyed && this.isYeOldMagiceShopObstacle(obs) && obs.row === frontRow && obs.column === frontColumn
    );
    if (!shop) return null;

    const wallSide = this.getObstaclePrimaryWallSide(preview.dungonId, shop.row, shop.column);
    if (!wallSide) return null;
    const frontDelta = this.getOffsetForSquareSide(this.oppositeWallSide(wallSide));
    const expectedPlayerRow = shop.row + frontDelta.rowOffset;
    const expectedPlayerColumn = shop.column + frontDelta.columnOffset;
    if (preview.centerRow !== expectedPlayerRow || preview.centerColumn !== expectedPlayerColumn) {
      return null;
    }

    return shop;
  }

  private isYeOldMagiceShopObstacle(obs: ObstaclePlacement): boolean {
    return this.gameShopService.isYeOldMagiceShopObstacle(obs);
  }

  private getObstaclePrimaryWallSide(dungonId: number, row: number, column: number): SquareSide | null {
    const square = (this.squaresByDungon()[dungonId] ?? {})[this.getSquareKey(row, column)];
    if (!square) return null;
    if (this.isWallConnection(square.toTop)) return 'toTop';
    if (this.isWallConnection(square.toRight)) return 'toRight';
    if (this.isWallConnection(square.toBottom)) return 'toBottom';
    if (this.isWallConnection(square.toLeft)) return 'toLeft';
    return null;
  }

  private getOffsetForSquareSide(side: SquareSide): { rowOffset: number; columnOffset: number } {
    if (side === 'toTop') return { rowOffset: -1, columnOffset: 0 };
    if (side === 'toRight') return { rowOffset: 0, columnOffset: 1 };
    if (side === 'toBottom') return { rowOffset: 1, columnOffset: 0 };
    return { rowOffset: 0, columnOffset: -1 };
  }

  toggleMusicMuted(): void {
    this.setMusicMuted(!this.musicMuted());
  }

  setMusicMuted(muted: boolean): void {
    this.musicMuted.set(muted);
    localStorage.setItem('musicMuted', muted ? 'true' : 'false');
    if (muted) {
      this.stopTavernMusic();
    } else if (this.showTavernModal() || this.npcDialog() || this.showYeOldMagiceShopModal()) {
      this.startTavernMusic();
    }
  }

  setSfxMuted(muted: boolean): void {
    this.soundMuted.set(muted);
    localStorage.setItem('soundMuted', muted ? 'true' : 'false');
  }

  openSettingsModal(): void {
    this.showSettingsModal.set(true);
  }

  closeSettingsModal(): void {
    this.showSettingsModal.set(false);
  }

  toggleMute(): void {
    this.openSettingsModal();
  }

  openReportBug(): void {
    const username = this.account.getUsername() ?? '';
    this.bugReportUsername.set(username);
    this.bugReportMessage.set('');
    this.bugReportSuccess.set(false);
    this.bugReportError.set(null);
    this.showReportBugModal.set(true);
  }

  closeReportBug(): void {
    this.showReportBugModal.set(false);
  }

  submitBugReport(): void {
    const comment = this.bugReportMessage().trim();
    if (!comment) return;
    this.bugReportSubmitting.set(true);
    this.bugReportError.set(null);
    const username = this.bugReportUsername().trim() || 'Anonymous';
    const preview = this.gridPreviewContext();
    const gameJson = preview ? JSON.stringify(this.buildDungenJsonForSave(preview.dungonId), null, 2) : '{}';
    const message = `${comment}\n\n--- Game State ---\n${gameJson}`;
    this.http.post(`${API_BASE_URL}/contact`, {
      name: username,
      email: 'noreply@tdodj.com',
      problem: 'Report Bug',
      username,
      message,
    }).subscribe({
      next: () => {
        this.bugReportSubmitting.set(false);
        this.bugReportSuccess.set(true);
      },
      error: () => {
        this.bugReportSubmitting.set(false);
        this.bugReportError.set('Failed to send report. Please try again.');
      },
    });
  }

  private startTavernMusic(): void {
    this.gameSoundService.startTavernMusic({
      muted: this.musicMuted(),
      resolveClientAssetUrl: (assetPath) => this.resolveClientAssetUrl(assetPath),
    });
  }

  private stopTavernMusic(): void {
    this.gameSoundService.stopTavernMusic();
  }

  get currentUserKey(): string {
    return this.account.getKey() ?? '';
  }

  onTavernSpChanged(newSp: number): void {
    this.playerSp.set(newSp);
  }

  onTavernStatChanged(event: { stat: TavernStat; newValue: number }): void {
    if (event.stat === 'strength') this.playerStrength.set(event.newValue);
    if (event.stat === 'stamina') this.playerStamina.set(event.newValue);
    if (event.stat === 'mind') this.playerMind.set(event.newValue);
    if (event.stat === 'magicPower') this.playerMagicPower.set(event.newValue);
    if (event.stat === 'numberOfAttacks') this.playerNOA.set(event.newValue);
    if (event.stat === 'numberOfDefends') this.playerNOD.set(event.newValue);
  }

  onQuestItemsTurnedIn(tresherIds: number[]): void {
    const idSet = new Set(tresherIds);
    this.cheaterByDungon.update((allCheaters) => {
      const updated: Record<number, Cheater> = {};
      for (const [key, cheater] of Object.entries(allCheaters)) {
        const n = Number(key);
        updated[n] = {
          ...cheater,
          inventory: {
            ...cheater.inventory,
            treshers: cheater.inventory.treshers.filter((t) => !(t.isquest && idSet.has(t.id))),
          },
        };
      }
      return updated;
    });
    this.saveGameState();
  }

  onTavernTresherGoldChanged(event: { tresherId: number; newGold: number }): void {
    this.cheaterByDungon.update((allCheaters) => {
      const updated: Record<number, Cheater> = {};
      for (const [key, cheater] of Object.entries(allCheaters)) {
        const n = Number(key);
        updated[n] = {
          ...cheater,
          inventory: {
            ...cheater.inventory,
            treshers: cheater.inventory.treshers.map((t) =>
              t.id === event.tresherId ? { ...t, gold: event.newGold } : t
            ),
          },
        };
      }
      return updated;
    });
  }

  loadStash(): void {
    const userKey = this.account.getKey();
    if (!userKey) return;
    this.http
      .get<{ result: number; items: StashItem[] }>(`${API_BASE_URL}/tavern-stash`, { params: { userkey: userKey } })
      .subscribe({
        next: (res) => {
          if (res.result === 1 && Array.isArray(res.items)) {
            this.stashItems.set(res.items);
          }
        },
        error: () => { /* stash load failure is non-critical */ },
      });
  }

  onDepositToStash(items: Tresher[]): void {
    const userKey = this.account.getKey();
    if (!userKey || items.length === 0) return;

    // Optimistically remove items from cheater inventories
    const depositIds = new Set(items.map((t) => t.id));
    this.cheaterByDungon.update((allCheaters) => {
      const updated: Record<number, Cheater> = {};
      for (const [key, cheater] of Object.entries(allCheaters)) {
        const n = Number(key);
        const remaining: Tresher[] = [];
        const toRemoveCount: Record<number, number> = {};
        for (const id of depositIds) { toRemoveCount[id] = (toRemoveCount[id] ?? 0) + 1; }
        for (const t of cheater.inventory.treshers) {
          if (depositIds.has(t.id) && (toRemoveCount[t.id] ?? 0) > 0) {
            toRemoveCount[t.id]--;
          } else {
            remaining.push(t);
          }
        }
        updated[n] = { ...cheater, inventory: { ...cheater.inventory, treshers: remaining } };
      }
      return updated;
    });
    this.saveGameState();

    const stashItems = items.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      type: t.type ?? 'OtherTresher',
      gold: t.gold,
      silver: t.silver,
      copper: t.copper,
      zinc: t.zinc,
      spReward: t.spReward,
      imageId: t.imageId,
      soundId: t.soundId,
      isquest: t.isquest ?? false,
    }));

    this.http
      .post<{ result: number; items: StashItem[] }>(`${API_BASE_URL}/tavern-stash/deposit`, { userkey: userKey, items: stashItems })
      .subscribe({
        next: (res) => {
          if (res.result === 1 && Array.isArray(res.items)) {
            this.stashItems.set(res.items);
          }
        },
        error: () => { /* deposit failure — stash may be out of sync until next load */ },
      });
  }

  onResetMyProgress(): void {
    const preview = this.gridPreviewContext();
    if (!preview) return;
    const dungonId = preview.dungonId;
    this.cheaterByDungon.update((all) => {
      const next = { ...all };
      delete next[dungonId];
      return next;
    });
    this.saveGameState();
  }

  onWithdrawFromStash(itemIndexes: number[]): void {
    const userKey = this.account.getKey();
    if (!userKey || itemIndexes.length === 0) return;

    this.http
      .post<{ result: number; remaining: StashItem[]; withdrawn: StashItem[] }>(`${API_BASE_URL}/tavern-stash/withdraw`, { userkey: userKey, itemIndexes })
      .subscribe({
        next: (res) => {
          if (res.result === 1) {
            this.stashItems.set(res.remaining ?? []);
            // Add withdrawn items to the current dungeon's cheater inventory
            const preview = this.gridPreviewContext();
            if (!preview) return;
            const withdrawn: StashItem[] = res.withdrawn ?? [];
            if (withdrawn.length === 0) return;
            const newTreshers: Tresher[] = withdrawn.map((s) => ({
              id: s.id,
              name: s.name,
              description: s.description,
              type: s.type,
              gold: s.gold,
              silver: s.silver,
              copper: s.copper,
              zinc: s.zinc,
              spReward: s.spReward,
              imageId: s.imageId,
              soundId: s.soundId,
              isquest: s.isquest,
              item1Id: null, item2Id: null, item3Id: null, item4Id: null,
              spell1Id: null, spell2Id: null, spell3Id: null, spell4Id: null,
              curse1Id: null, curse2Id: null,
              potion1Id: null, potion2Id: null, potion3Id: null,
              trap: null,
            }));
            const dungonId = preview.dungonId;
            const existingCheater = this.cheaterByDungon()[dungonId] ?? { ...DEFAULT_CHEATER };
            this.cheaterByDungon.update((allCheaters) => ({
              ...allCheaters,
              [dungonId]: {
                ...existingCheater,
                inventory: {
                  ...existingCheater.inventory,
                  treshers: [...existingCheater.inventory.treshers, ...newTreshers],
                },
              },
            }));
            this.saveGameState();
          }
        },
        error: () => { /* withdraw failure is non-critical */ },
      });
  }

  confirmExit(): void {
    const transitionType = this.pendingExitTransitionType();
    if (transitionType === null) return;
    this.pendingExitTransitionType.set(null);

    if (this.isCreatorTestMode()) {
      this.returnToCreatorFromTest();
      return;
    }

    this.triggerDungonWin(transitionType);
  }

  cancelExit(): void {
    this.pendingExitTransitionType.set(null);
  }

  // ─── NPC dialog ───────────────────────────────────────────────────────────

  dismissNpcDialog(): void {
    this.npcDialog.set(null);
    if (!this.showTavernModal() && !this.showYeOldMagiceShopModal()) {
      this.stopTavernMusic();
    }
  }

  canTalkToNpc(): boolean {
    if (this.turnPhase() !== 'player') return false;
    const preview = this.gridPreviewContext();
    if (!preview) return false;
    const monstersById = this.getMonstersByIdForDungon(preview.dungonId);
    return this.monsterInstances().some((m) => {
      if (m.isDead || m.npcIsHostile) return false;
      const template = monstersById.get(m.monsterId);
      if (!template) return false;
      const isNpc =
        template.npcGreeting ||
        template.npcInfo1 ||
        template.npcInfo2 ||
        template.npcInfo3 ||
        template.npcCanTrade;
      if (!isNpc) return false;
      const dist = Math.max(
        Math.abs(m.row - preview.centerRow),
        Math.abs(m.column - preview.centerColumn)
      );
      return dist <= 1;
    });
  }

  talkToNpc(): void {
    if (!this.canTalkToNpc()) return;
    const preview = this.gridPreviewContext();
    if (!preview) return;
    const monstersById = this.getMonstersByIdForDungon(preview.dungonId);
    const target = this.monsterInstances().find((m) => {
      if (m.isDead || m.npcIsHostile) return false;
      const template = monstersById.get(m.monsterId);
      if (!template) return false;
      const isNpc =
        template.npcGreeting ||
        template.npcInfo1 ||
        template.npcInfo2 ||
        template.npcInfo3 ||
        template.npcCanTrade;
      if (!isNpc) return false;
      const dist = Math.max(
        Math.abs(m.row - preview.centerRow),
        Math.abs(m.column - preview.centerColumn)
      );
      return dist <= 1;
    });
    if (!target) return;
    const template = monstersById.get(target.monsterId);
    if (!template) return;
    this.addCombatLog(this.npcApproachLine(template.name, template.type));
    const creativeGreeting = template.npcGreeting
      ? this.npcWrapSpeech(template.name, template.type, template.npcGreeting)
      : undefined;

    if (template.npcCanTrade) {
      this.showAdThen(
        `I'll be right with you. Please look over these items in the meantime.`,
        () => {
          this.npcDialog.set({ instance: target, template, creativeGreeting });
          this.startTavernMusic();
        }
      );
    } else {
      this.npcDialog.set({ instance: target, template, creativeGreeting });
      this.startTavernMusic();
    }
  }

  // ─── Monster dialogue tree (Q&A) ─────────────────────────────────────────
  // New feature, separate from the npcDialog greeting/trade popup above: a
  // per-placement list of question prompts the PC can ask, each with a
  // randomized response pool and optional triggersAttack /
  // preventsAttackUnlessAttacked flags.

  canAskMonsterDialogueQuestions(): boolean {
    if (this.turnPhase() !== 'player') return false;
    const preview = this.gridPreviewContext();
    if (!preview) return false;
    return this.monsterInstances().some((m) => {
      if (m.isDead || m.npcIsHostile) return false;
      if (m.dialogueEntries.length === 0) return false;
      const dist = Math.max(Math.abs(m.row - preview.centerRow), Math.abs(m.column - preview.centerColumn));
      return dist <= 1;
    });
  }

  openMonsterDialogueModal(): void {
    if (!this.canAskMonsterDialogueQuestions()) return;
    const preview = this.gridPreviewContext();
    if (!preview) return;
    const monstersById = this.getMonstersByIdForDungon(preview.dungonId);
    const target = this.monsterInstances().find((m) => {
      if (m.isDead || m.npcIsHostile) return false;
      if (m.dialogueEntries.length === 0) return false;
      const dist = Math.max(Math.abs(m.row - preview.centerRow), Math.abs(m.column - preview.centerColumn));
      return dist <= 1;
    });
    if (!target) return;
    const template = monstersById.get(target.monsterId);
    if (!template) return;
    this.monsterDialogueModal.set({ instance: target, template, selectedResponse: null });
  }

  askMonsterDialogueQuestion(entryId: number): void {
    const dialog = this.monsterDialogueModal();
    if (!dialog) return;
    const { instance: inst, template } = dialog;
    const entry = inst.dialogueEntries.find((e) => e.id === entryId);
    if (!entry) return;

    const response = entry.responses.length > 0 ? this.pickRandom(entry.responses) : '...';
    this.addCombatLog(this.npcWrapSpeech(template.name, template.type, response));

    if (entry.preventsAttackUnlessAttacked) {
      inst.dialoguePreventsAttack = true;
    }
    if (entry.triggersAttack) {
      inst.npcIsHostile = true;
      this.addCombatLog(`${template.name} grows hostile!`);
    }
    this.monsterInstances.update((arr) => [...arr]);
    this.monsterDialogueModal.set({ ...dialog, instance: inst, selectedResponse: response });
  }

  dismissMonsterDialogueModal(): void {
    this.monsterDialogueModal.set(null);
  }

  npcShareInfo(): void {
    const dialog = this.npcDialog();
    if (!dialog) return;
    const { instance: inst, template } = dialog;

    // Check if info is gated behind being attacked+spared
    if (template.npcGivesInfoAfterDamaged && !inst.isSpared) {
      this.addCombatLog(this.npcRefusalLine(template.name, template.type));
      return;
    }

    if (inst.hasSharedInfo) {
      this.addCombatLog(`${template.name} has nothing more to tell you.`);
      return;
    }

    const infoParts = [template.npcInfo1, template.npcInfo2, template.npcInfo3].filter((x): x is string => Boolean(x));
    if (infoParts.length === 0) {
      this.addCombatLog(`${template.name} shrugs. "I know nothing of use."`);
      return;
    }

    inst.hasSharedInfo = true;
    for (const info of infoParts) {
      this.addCombatLog(this.npcWrapSpeech(template.name, template.type, info));
    }

    if (template.npcAttacksAfterInfo) {
      inst.npcIsHostile = true;
      this.addCombatLog(this.pickRandom([
        `${template.name} snarls — "Now you know too much!" and attacks!`,
        `${template.name}'s eyes go cold. "A pity. You leave me no choice." They lunge!`,
        `"Now you'll have to die," ${template.name} hisses, drawing a weapon!`,
      ]));
    }

    this.monsterInstances.update((arr) => [...arr]);
    this.npcDialog.set({ ...dialog, instance: inst });
  }

  spareNpc(): void {
    const dialog = this.npcDialog();
    if (!dialog) return;
    const { instance: inst, template } = dialog;
    if (inst.isSpared) {
      this.addCombatLog(`${template.name} is already spared.`);
      return;
    }
    inst.isSpared = true;
    this.addCombatLog(`You lower your weapon. ${template.name} looks relieved.`);
    this.monsterInstances.update((arr) => [...arr]);
    this.npcDialog.set({ ...dialog, instance: inst });
  }

  getNpcShopItems(): { tresher: Tresher; price: number; purchased: boolean }[] {
    const dialog = this.npcDialog();
    if (!dialog || !dialog.template.npcCanTrade) return [];
    const preview = this.gridPreviewContext();
    if (!preview) return [];
    const treshersById = this.getTreshersByIdForDungon(preview.dungonId);
    const purchased = new Set(this.npcTradesPurchased());
    return dialog.template.tresherIds
      .map((id) => {
        const tresher = treshersById.get(id);
        if (!tresher) return null;
        return { tresher, price: Math.max(5, tresher.spReward), purchased: purchased.has(id) };
      })
      .filter((item): item is { tresher: Tresher; price: number; purchased: boolean } => item !== null);
  }

  npcBuyTresher(tresherId: number): void {
    const dialog = this.npcDialog();
    if (!dialog) return;
    const preview = this.gridPreviewContext();
    if (!preview) return;

    if (this.npcTradesPurchased().includes(tresherId)) {
      this.addCombatLog(`You already purchased that item.`);
      return;
    }

    const treshersById = this.getTreshersByIdForDungon(preview.dungonId);
    const tresher = treshersById.get(tresherId);
    if (!tresher) return;

    const price = Math.max(5, tresher.spReward);
    if (this.playerSp() < price) {
      this.addCombatLog(`Not enough SP — ${tresher.name} costs ${price} SP and you only have ${this.playerSp()}.`);
      return;
    }

    this.showAdThen(`Let me get that for you, just a second!`, () => {
      this.playerSp.update((s) => s - price);
      this.npcTradesPurchased.update((ids) => [...ids, tresherId]);
      this.addItemsToCheaterInventory(preview.dungonId, [], [tresher]);
      this.addCombatLog(`You paid ${price} SP for ${tresher.name}. It's now in your inventory.`);
    });
  }

  private triggerDungonWin(transitionType?: ExitTransitionType): void {
    this.dungonWon.set(true);
    if (transitionType === 'stairsUp' && this.winStairsImageIndex() === null) {
      const idx = (Math.floor(Math.random() * 3) + 1) as 1 | 2 | 3;
      this.winStairsImageIndex.set(idx);
    }
    if (transitionType === 'stairsUp' || transitionType === 'stairsDown') {
      this.playSoundPath(this.portalTraverseSoundPath);
    }
    const spReward = this.dungonSpReward();
    if (spReward > 0) {
      this.playerSp.update((s) => s + spReward);
      this.awardSpToPC(spReward);
    }
    // Show win screen for 3 seconds, then transition to the tavern/shop.
    setTimeout(() => {
      this.dungonWon.set(false);
      this.showAdThen(`Give me just a second...`, () => {
        this.showTavernModal.set(true);
        this.startTavernMusic();
      });
    }, 3000);
  }

  private awardSpToPC(amount: number): void {
    if (amount <= 0) {
      return;
    }

    const pcId = this.currentPcId_();
    if (!pcId) {
      return;
    }

    const userKey = this.account.getKey();
    if (!userKey) {
      return;
    }

    this.http
      .patch<{ result: number; sp: number }>(
        `${API_BASE_URL}/pcs/${pcId}/award-sp`,
        { userkey: userKey, amount }
      )
      .subscribe();
  }

  // ── Combat System ──────────────────────────────────────────────

  private initializeCombatState(dungonId: number): void {
    const placements = this.monsterPlacementsByDungon()[dungonId] ?? [];
    const monstersById = this.getMonstersByIdForDungon(dungonId);
    const saved = this.savedCombatState;
    const hasSavedCombat = saved.turnPhase !== null;

    const instances: GameMonsterInstance[] = placements.map((placement, index) => {
      const template = monstersById.get(placement.monsterId);
      const templateHp = template?.hp ?? 1;
      return {
        placementIndex: index,
        monsterId: placement.monsterId,
        row: placement.row,
        column: placement.column,
        roam: placement.roam,
        currentHp: hasSavedCombat && placement.currentHp != null ? placement.currentHp : templateHp,
        currentMagic: hasSavedCombat && placement.currentMagic != null ? placement.currentMagic : (template?.magic ?? 0),
        permanentStatModifiers: placement.permanentStatModifiers ? { ...placement.permanentStatModifiers } : {},
        isDead: hasSavedCombat && placement.isDead === true,
        remainingAE: 0,
        attacksUsedThisTurn: 0,
        hasCastSpellThisTurn: false,
        dropTresherIds: Array.isArray(placement.tresherIds) ? placement.tresherIds : [],
        dropKeyIds: Array.isArray(placement.keyIds) ? placement.keyIds : [],
        dropItemIds: Array.isArray(placement.itemIds) ? placement.itemIds : [],
        dropSpellIds: Array.isArray(placement.spellIds) ? placement.spellIds : [],
        dropPotionIds: Array.isArray(placement.potionIds) ? placement.potionIds : [],
        dropGold: Math.max(0, placement.gold ?? 0),
        dropSilver: Math.max(0, placement.silver ?? 0),
        dropCopper: Math.max(0, placement.copper ?? 0),
        dropZinc: Math.max(0, placement.zinc ?? 0),
        activeEffects: [],
        isDormant: placement.isDormant === true,
        guardRow: typeof placement.guardRow === 'number' ? placement.guardRow : null,
        guardColumn: typeof placement.guardColumn === 'number' ? placement.guardColumn : null,
        isStationary: placement.isStationary === true,
        stationaryTriggerRow: typeof placement.stationaryTriggerRow === 'number' ? placement.stationaryTriggerRow : null,
        stationaryTriggerCol: typeof placement.stationaryTriggerCol === 'number' ? placement.stationaryTriggerCol : null,
        noAttackUnlessAttacked: placement.noAttackUnlessAttacked === true,
        hasCalledReinforcements: false,
        dialogueEntries: Array.isArray(placement.dialogueEntries) ? placement.dialogueEntries : [],
        dialoguePreventsAttack: false,
        hasGreeted: false,
        hasSharedInfo: false,
        isSpared: false,
        npcIsHostile: false,
      };
    });
    this.monsterInstances.set(instances);

    if (hasSavedCombat) {
      this.playerHp.set(
        this.gameJsonParserService.resolvePlayerCurrentHp(saved.playerHp ?? this.playerStartingHp, this.playerMaxHp())
      );
      const effectiveAEMax = this.getEffectivePlayerMaxAE();
      const restoredAE = saved.playerAE ?? effectiveAEMax;
      this.turnPhase.set(saved.turnPhase!);
      this.playerAE.set(
        Math.max(0, Math.min(saved.turnPhase === 'player' && restoredAE <= 0 ? effectiveAEMax : restoredAE, effectiveAEMax))
      );
    } else {
      this.playerHp.set(this.playerStartingHp);
      this.playerAE.set(this.getEffectivePlayerMaxAE());
      this.playerAttacksThisTurn.set(0);
      this.playerSearchesThisTurn.set(0);
      this.turnPhase.set('player');
    }

    this.combatLog.set([]);
    this.playerActiveEffects.set([]);
    this.addCombatLog('Your turn. AE: ' + this.playerAE());
    this.savedCombatState = { playerHp: null, playerAE: null, turnPhase: null, playerRow: null, playerColumn: null };
  }

  private logNearbyAfterMove(): void {
    const doors = this.nearbyDoorsForPreview();
    const items = this.nearbyItemsForPreview();
    if (doors.length === 0 && items.length === 0) {
      return;
    }
    const parts: string[] = [];
    for (const d of doors) {
      const label = d.door.name || 'Door';
      const state = d.door.state === 'open' ? 'open' : d.door.isLocked ? 'locked' : 'closed';
      parts.push(`${label} (${d.direction}, ${state})`);
    }
    for (const item of items) {
      parts.push(`${item.kind}: ${item.name}`);
    }
    this.addCombatLog(`Nearby — ${parts.join(', ')}`);
  }

  private triggerNpcGreetings(): void {
    const preview = this.gridPreviewContext();
    if (!preview) return;

    const monstersById = this.getMonstersByIdForDungon(preview.dungonId);
    const instances = this.monsterInstances().filter(
      (m) => !m.isDead && !m.isDormant
    );

    for (const inst of instances) {
      const template = monstersById.get(inst.monsterId);
      if (!template?.npcGreeting) continue;
      if (inst.hasGreeted) continue;

      const dist = Math.max(
        Math.abs(inst.row - preview.centerRow),
        Math.abs(inst.column - preview.centerColumn)
      );
      if (dist > 1) continue;

      const hasLOS = this.hasLineOfSight(
        preview.dungonId, preview.centerRow, preview.centerColumn, inst.row, inst.column
      );
      if (!hasLOS) continue;

      inst.hasGreeted = true;
      const creativeGreeting = this.npcWrapSpeech(template.name, template.type, template.npcGreeting);
      this.addCombatLog(creativeGreeting);
      this.npcDialog.set({ instance: inst, template, creativeGreeting });
      this.startTavernMusic();
      this.monsterInstances.update((arr) => [...arr]);
      break; // one greeting per move
    }
  }

  private addCombatLog(text: string): void {
    this.combatLog.update((log) => [...log.slice(-49), { text }]);
  }

  private normalizeEffectToPcStat(stat: string | null | undefined): 'HP' | 'AC' | 'Magic' | 'Mind' | 'Stamina' | 'Strength' | 'Dexterity' | 'Awareness' | 'AE' | 'NOA' | 'ROS' | 'RemoveCurse' | 'RemoveTrap' | 'ToHit' | 'Damage' | null {
    if (!stat) return null;
    const s = stat.trim().toLowerCase();
    if (s === 'hp') return 'HP';
    if (s === 'ac' || s === 'armor class' || s === 'ac (armor class)') return 'AC';
    if (s === 'magic' || s === 'mp') return 'Magic';
    if (s === 'mind') return 'Mind';
    if (s === 'stamina' || s === 'staman') return 'Stamina';
    if (s === 'strength' || s === 'strench') return 'Strength';
    if (s === 'dexterity' || s === 'dx') return 'Dexterity';
    if (s === 'awareness' || s === 'aw') return 'Awareness';
    if (s === 'ae' || s === 'action economy' || s === 'action econame') return 'AE';
    if (s === 'noa' || s === '# of attacks' || s === '# of attacks #oa' || s === '#oa' || s === 'number of attacks') return 'NOA';
    if (s === 'ros' || s === 'sight' || s === 'range of sight') return 'ROS';
    if (s === 'remove curse' || s === 'cure curse' || s === 'cures curse') return 'RemoveCurse';
    if (s === 'remove trap' || s === 'cure trap' || s === 'cures trap') return 'RemoveTrap';
    if (s === 'tohit' || s === 'to hit') return 'ToHit';
    if (s === 'damage') return 'Damage';
    return null;
  }

  private normalizeEffectToMonsterStat(stat: string | null | undefined): 'HP' | 'AC' | 'Magic' | 'Mind' | 'Stamina' | 'Strength' | 'NOA' | 'MR' | 'THN' | null {
    if (!stat) return null;
    const s = stat.trim().toLowerCase();
    if (s === 'hp') return 'HP';
    if (s === 'ac') return 'AC';
    if (s === 'magic' || s === 'mp') return 'Magic';
    if (s === 'mind') return 'Mind';
    if (s === 'stamina' || s === 'staman') return 'Stamina';
    if (s === 'strength' || s === 'strench') return 'Strength';
    if (s === 'noa' || s === '# of attacks' || s === '#oa' || s === 'number of attacks') return 'NOA';
    if (s === 'mr' || s === 'magic resistance' || s === 'magicresistance') return 'MR';
    if (s === 'thn' || s === 'to hit needed' || s === 'tohitneeded' || s === 'to hit plus needed' || s === 'tohitplusneeded') return 'THN';
    return null;
  }

  private getMonsterPermanentStatModifier(instance: GameMonsterInstance, stat: 'HP' | 'AC' | 'Magic' | 'Mind' | 'Stamina' | 'Strength' | 'NOA' | 'MR' | 'THN'): number {
    return Object.entries(instance.permanentStatModifiers).reduce((sum, [rawKey, value]) => {
      if (this.normalizeEffectToMonsterStat(rawKey) !== stat) return sum;
      return sum + value;
    }, 0);
  }

  private getMonsterModifierEffectBonus(instance: GameMonsterInstance, stat: 'HP' | 'AC' | 'Magic' | 'Mind' | 'Stamina' | 'Strength' | 'NOA' | 'MR' | 'THN'): number {
    return instance.activeEffects.reduce((sum, eff) => {
      if (eff.behavior !== 'modifier') return sum;
      return this.normalizeEffectToMonsterStat(eff.effectOn) === stat ? sum + eff.effectAmount : sum;
    }, 0);
  }

  private getEffectiveMonsterAC(instance: GameMonsterInstance, template: Monster): number {
    const typeAcBonus = getMonsterTypeCombatModifiers(template.type).acBonus;
    return Math.max(0, template.ac + typeAcBonus + this.getMonsterPermanentStatModifier(instance, 'AC') + this.getMonsterModifierEffectBonus(instance, 'AC'));
  }

  private getEffectiveMonsterMagicResistance(instance: GameMonsterInstance, template: Monster): number {
    return Math.max(0, template.magicResistance + this.getMonsterPermanentStatModifier(instance, 'MR') + this.getMonsterModifierEffectBonus(instance, 'MR'));
  }

  private getEffectiveMonsterToHitPlusNeeded(instance: GameMonsterInstance, template: Monster): number {
    return Math.max(0, template.toHitPlusNeeded + this.getMonsterPermanentStatModifier(instance, 'THN') + this.getMonsterModifierEffectBonus(instance, 'THN'));
  }

  private getEffectiveMonsterNumberOfAttacks(instance: GameMonsterInstance, template: Monster): number {
    return Math.max(0, template.numberOfAttacks + this.getMonsterPermanentStatModifier(instance, 'NOA') + this.getMonsterModifierEffectBonus(instance, 'NOA'));
  }

  private getEffectiveMonsterStamina(instance: GameMonsterInstance, template: Monster): number {
    return template.movementEconomy + this.getMonsterPermanentStatModifier(instance, 'Stamina') + this.getMonsterModifierEffectBonus(instance, 'Stamina');
  }

  private getEffectiveMonsterStrength(instance: GameMonsterInstance, template: Monster): number {
    return this.getMonsterPermanentStatModifier(instance, 'Strength') + this.getMonsterModifierEffectBonus(instance, 'Strength');
  }

  private getEquippedItemBonusForStat(dungonId: number, stat: 'HP' | 'AC' | 'Magic' | 'Mind' | 'Stamina' | 'Strength' | 'Dexterity' | 'Awareness' | 'AE' | 'NOA' | 'ROS'): number {
    const equippedItemIds = this.equippedItemIdsByDungon()[dungonId] ?? [];
    const itemsMap = this.pcTresherItemsById();
    let total = 0;

    for (const itemId of equippedItemIds) {
      const item = itemsMap.get(itemId);
      if (!item) continue;
      const effectToPcTarget = this.normalizeEffectToPcStat(item.effectToPc ?? null);
      const effectOnTarget = this.normalizeEffectToPcStat(item.effectOn ?? null);
      const effectToPcValue = typeof item.effectToPcValue === 'number' ? item.effectToPcValue : 0;
      const effectOnValue = item.effectValue ?? 0;

      // effectToPc/effectToPcValue is an additional stat channel and should stack with effectOn/effectValue.
      if (effectToPcTarget === stat) {
        total += effectToPcValue;
      }

      // effectOn/effectValue applies directly to the chosen stat (used heavily by accessories).
      if (effectOnTarget === stat) {
        total += effectOnValue;
      }

      // Legacy armor behavior: armor effectValue contributes to AC even if effectOn is unset.
      const itemType = this.normalizeItemType(item.type);
      if (
        stat === 'AC' &&
        itemType === 'armor' &&
        effectOnTarget !== 'AC' &&
        effectToPcTarget !== 'AC'
      ) {
        total += effectOnValue;
      }
    }
    return total;
  }

  inventoryItemEffectsForView(item: { effectOn: string | null; effectValue: number | null; effectToPc?: string | null; effectToPcValue?: number }): string[] {
    const lines: string[] = [];

    const effectOnStat = this.normalizeEffectToPcStat(item.effectOn ?? null);
    const effectOnValue = typeof item.effectValue === 'number' ? item.effectValue : 0;
    if (effectOnStat && effectOnValue !== 0) {
      lines.push(`Effect: ${effectOnValue > 0 ? '+' : ''}${effectOnValue} ${effectOnStat}`);
    }

    const toPcStat = this.normalizeEffectToPcStat(item.effectToPc ?? null);
    const toPcValue = typeof item.effectToPcValue === 'number' ? item.effectToPcValue : 0;
    if (toPcStat && toPcValue !== 0) {
      lines.push(`To PC: ${toPcValue > 0 ? '+' : ''}${toPcValue} ${toPcStat}`);
    }

    return lines;
  }

  private getPlayerModifierEffectBonus(stat: 'HP' | 'AC' | 'Magic' | 'Mind' | 'Stamina' | 'Strength' | 'Dexterity' | 'Awareness' | 'AE' | 'NOA' | 'ROS'): number {
    return this.playerActiveEffects().reduce((sum, eff) => {
      if (eff.behavior !== 'modifier') {
        return sum;
      }
      return this.normalizeEffectToPcStat(eff.effectOn) === stat ? sum + eff.effectAmount : sum;
    }, 0);
  }

  private getEffectiveRangeOfSight(dungonId: number): number {
    const cheater = this.cheaterByDungon()[dungonId] ?? DEFAULT_CHEATER;
    const baseRange =
      typeof cheater.rangeOfSight === 'number' && Number.isFinite(cheater.rangeOfSight)
        ? Math.max(0, cheater.rangeOfSight)
        : DEFAULT_CHEATER.rangeOfSight;
    return Math.max(0, baseRange + this.getEquippedItemBonusForStat(dungonId, 'ROS') + this.getPlayerModifierEffectBonus('ROS'));
  }

  private getEffectivePlayerMaxHp(): number {
    const preview = this.gridPreviewContext();
    if (!preview) return this.playerMaxHp();
    return Math.max(1, this.playerMaxHp() + this.getEquippedItemBonusForStat(preview.dungonId, 'HP') + this.getPlayerModifierEffectBonus('HP'));
  }

  private getEffectivePlayerStrength(): number {
    const preview = this.gridPreviewContext();
    if (!preview) return this.playerStrength();
    return this.playerStrength() + this.getEquippedItemBonusForStat(preview.dungonId, 'Strength') + this.getPlayerModifierEffectBonus('Strength');
  }

  private getEffectivePlayerStamina(): number {
    const preview = this.gridPreviewContext();
    if (!preview) return this.playerStamina();
    return this.playerStamina() + this.getEquippedItemBonusForStat(preview.dungonId, 'Stamina') + this.getPlayerModifierEffectBonus('Stamina');
  }

  private getEffectivePlayerMind(): number {
    const preview = this.gridPreviewContext();
    if (!preview) return this.playerMind();
    return this.playerMind() + this.getEquippedItemBonusForStat(preview.dungonId, 'Mind') + this.getPlayerModifierEffectBonus('Mind');
  }

  private getEffectivePlayerMagicPower(): number {
    const preview = this.gridPreviewContext();
    if (!preview) return this.playerMagicPower();
    return this.playerMagicPower() + this.getEquippedItemBonusForStat(preview.dungonId, 'Magic') + this.getPlayerModifierEffectBonus('Magic');
  }

  private getEffectivePlayerDexterity(): number {
    const preview = this.gridPreviewContext();
    if (!preview) return this.playerDexterity();
    return this.playerDexterity() + this.getEquippedItemBonusForStat(preview.dungonId, 'Dexterity') + this.getPlayerModifierEffectBonus('Dexterity');
  }

  private getEffectivePlayerAwareness(): number {
    const preview = this.gridPreviewContext();
    if (!preview) return this.playerAwareness();
    return this.playerAwareness() + this.getEquippedItemBonusForStat(preview.dungonId, 'Awareness') + this.getPlayerModifierEffectBonus('Awareness');
  }

  private isMagicPotionEffect(effectTo: string | null | undefined): boolean {
    const normalized = (effectTo ?? '').trim().toLowerCase();
    return normalized === 'magic' || normalized === 'mp' || normalized === 'magic power';
  }

  private isHpPotionEffect(effectTo: string | null | undefined): boolean {
    return (effectTo ?? '').trim().toLowerCase() === 'hp';
  }

  private normalizePotionEffectToPcStat(effectTo: string | null | undefined):
    'HP' | 'AC' | 'Magic' | 'Mind' | 'Stamina' | 'Strength' | 'AE' | 'NOA' | 'ROS' | 'TempHP' | 'PoisonResistance' | 'RemoveCurse' | null {
    const normalized = (effectTo ?? '').trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === 'temp hp' || normalized === 'temporary hp') return 'TempHP';
    if (normalized === 'poison resistance' || normalized === 'poisonresistance') return 'PoisonResistance';
    if (normalized === 'remove curse' || normalized === 'cure curse' || normalized === 'cures curse') return 'RemoveCurse';
    if (normalized === 'magic power') return 'Magic';
    if (normalized === 'range of view' || normalized === 'range of sight' || normalized === 'view range') return 'ROS';
    if (normalized === 'number of attacts per round(noa)' || normalized === 'number of attacks per round(noa)' || normalized === 'noa') return 'NOA';
    if (normalized === 'remove trap' || normalized === 'cure trap') return null; // potions can't remove traps
    return this.normalizeEffectToPcStat(effectTo) as 'HP' | 'AC' | 'Magic' | 'Mind' | 'Stamina' | 'Strength' | 'AE' | 'NOA' | 'ROS' | null;
  }

  private getSpellEffectAmountWithMagicBonus(baseEffectAmount: number): number {
    const magicBonus = this.playerActiveEffects().reduce((sum, eff) => {
      if (!this.isMagicPotionEffect(eff.effectOn)) {
        return sum;
      }
      return sum + eff.effectAmount;
    }, 0);
    return baseEffectAmount + magicBonus;
  }

  private getEffectivePlayerMaxAE(): number {
    const preview = this.gridPreviewContext();
    if (!preview) return this.playerMaxAE;
    return Math.max(0, this.playerMaxAE + this.getEquippedItemBonusForStat(preview.dungonId, 'AE') + this.getPlayerModifierEffectBonus('AE'));
  }

  private getEffectivePlayerNOA(): number {
    const preview = this.gridPreviewContext();
    if (!preview) return this.playerNOA();
    return Math.max(1, this.playerNOA() + this.getEquippedItemBonusForStat(preview.dungonId, 'NOA') + this.getPlayerModifierEffectBonus('NOA'));
  }

  private syncCurrentResourcesAfterEquipChange(prevEffectiveHpMax: number, prevEffectiveMpMax: number, prevEffectiveAEMax: number): void {
    const nextEffectiveHpMax = this.getEffectivePlayerMaxHp();
    const nextEffectiveMpMax = this.getEffectivePlayerMagicPower();
    const nextEffectiveAEMax = this.getEffectivePlayerMaxAE();

    const hpDelta = nextEffectiveHpMax - prevEffectiveHpMax;
    if (hpDelta !== 0) {
      const adjustedHp = this.playerHp() + hpDelta;
      this.playerHp.set(Math.max(0, Math.min(adjustedHp, nextEffectiveHpMax)));
    } else {
      this.playerHp.set(Math.max(0, Math.min(this.playerHp(), nextEffectiveHpMax)));
    }

    const mpDelta = nextEffectiveMpMax - prevEffectiveMpMax;
    if (mpDelta !== 0) {
      const adjustedMp = this.playerMp() + mpDelta;
      this.playerMp.set(Math.max(0, Math.min(adjustedMp, nextEffectiveMpMax)));
    } else {
      this.playerMp.set(Math.max(0, Math.min(this.playerMp(), nextEffectiveMpMax)));
    }

    const aeDelta = nextEffectiveAEMax - prevEffectiveAEMax;
    if (aeDelta !== 0) {
      const adjustedAE = this.playerAE() + aeDelta;
      this.playerAE.set(Math.max(0, Math.min(adjustedAE, nextEffectiveAEMax)));
    } else {
      this.playerAE.set(Math.max(0, Math.min(this.playerAE(), nextEffectiveAEMax)));
    }
  }

  playerMaxHpForView(): number {
    return this.getEffectivePlayerMaxHp();
  }

  playerStrengthForView(): number {
    return this.getEffectivePlayerStrength();
  }

  playerStaminaForView(): number {
    return this.getEffectivePlayerStamina();
  }

  playerMindForView(): number {
    return this.getEffectivePlayerMind();
  }

  playerMagicPowerForView(): number {
    return this.getEffectivePlayerMagicPower();
  }

  playerMaxAEForView(): number {
    return this.getEffectivePlayerMaxAE();
  }

  playerNOAForView(): number {
    return this.getEffectivePlayerNOA();
  }

  playerACForView(): number {
    return this.getPlayerAC();
  }

  private getPlayerAC(): number {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return this.playerBaseAC();
    }
    const equippedIndexes = this.equippedTresherIndexesByDungon()[preview.dungonId] ?? [];
    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const inventory = cheater.inventory?.treshers ?? [];
    let armorCount = 0;
    for (const idx of equippedIndexes) {
      if ((inventory[idx] as unknown as Record<string, unknown>)?.['armorType']) {
        armorCount += 1;
      }
    }
    const equippedItemIds = this.equippedItemIdsByDungon()[preview.dungonId] ?? [];
    const armorItemBonus = this.getEquippedItemBonusForStat(preview.dungonId, 'AC');
    return this.playerBaseAC() + armorCount + armorItemBonus + this.getPlayerModifierEffectBonus('AC') - this.playerBoostAttackACPenalty();
  }

  endPlayerTurnEarly(): void {
    if (this.turnPhase() !== 'player') {
      return;
    }
    const preview = this.gridPreviewContext();
    const aeLeft = this.playerAE();
    this.playerAE.set(0);

    const mpRecovered = Math.max(0, aeLeft);
    const currentMp = this.playerMp();
    const maxMp = this.getEffectivePlayerMagicPower();
    const newMp = Math.min(maxMp, currentMp + mpRecovered);
    const actualRecovered = newMp - currentMp;

    this.playerMp.set(newMp);
    if (preview && actualRecovered > 0) {
      this.rollForDoxOnMageMpEvent(preview.dungonId, preview.centerRow, preview.centerColumn, actualRecovered, 'MP recovery');
    }
    this.addCombatLog(
      actualRecovered > 0
        ? `You end your turn early and recover ${actualRecovered} MP.`
        : 'You end your turn early.'
    );
    this.startMonsterTurns();
  }

  canAde(): boolean {
    return this.turnPhase() === 'player' && this.playerAE() >= 2 && this.canPlayerAttack() && this.canPlayerDefend();
  }

  tryAde(): void {
    if (!this.canAde()) return;
    this.tryPlayerAttack();
    // Re-check defend is still possible after the attack consumed 1 AE
    if (this.canPlayerDefend()) {
      this.tryPlayerDefend();
    }
    // End turn regardless
    if (this.turnPhase() === 'player') {
      this.endPlayerTurnEarly();
    }
  }

  canPlayerDefend(): boolean {
    return this.turnPhase() === 'player' && this.playerAE() >= 1 && this.playerDefendsThisTurn() < this.playerNOD();
  }

  tryPlayerDefend(): void {
    if (!this.canPlayerDefend()) return;
    const preview = this.gridPreviewContext();
    if (!preview) return;
    this.consumePlayerAE(1, preview.dungonId);
    this.playerDefendsThisTurn.update((n) => n + 1);
    this.playerDefendStacks.update((s) => s + 1);
    this.addCombatLog(`You defend! +2 AC for the next attack against you. (${this.playerDefendStacks()} stack${this.playerDefendStacks() !== 1 ? 's' : ''} active)`);
    if (this.playerAE() <= 0) {
      this.startMonsterTurns();
    }
  }

  goHome(): void {
    const dest = this.account.getKey() ? '/dashboard' : '/';
    void this.router.navigate([dest]);
  }

  private isCreatorTestMode(): boolean {
    return this.route.snapshot.queryParamMap?.get('testMode') === 'creator';
  }

  private getCreatorTestDungonIdFromQuery(): number | null {
    const raw = this.route.snapshot.queryParamMap?.get('dungonId') ?? '';
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  private returnToCreatorFromTest(): void {
    const dungonId = this.getCreatorTestDungonIdFromQuery();
    if (!dungonId) {
      this.goHome();
      return;
    }

    void this.router.navigate(['/create'], {
      queryParams: { dungonId },
    });
  }

  canSearch(): boolean {
    if (this.turnPhase() !== 'player' || this.playerAE() < 1) return false;
    const searches = this.playerSearchesThisTurn();
    const type = (this.playerType() ?? '').toLowerCase();
    const isThiephOrShorties = type === 'thieph' || type === 'shorties';
    // Thieph and Shorties can search twice per round; everyone else only once
    if (isThiephOrShorties && searches >= 2) return false;
    if (!isThiephOrShorties && searches >= 1) return false;
    return true;
  }

  isThiephClass(): boolean {
    const t = (this.playerType() ?? '').trim().toLowerCase();
    return t === 'thieph' || t === 'theph';
  }

  isHealerClass(): boolean {
    return (this.playerType() ?? '').trim().toLowerCase() === 'healer';
  }

  isMageClass(): boolean {
    return (this.playerType() ?? '').trim().toLowerCase() === 'mage';
  }

  canMageRest(): boolean {
    return this.isMageClass() && this.turnPhase() === 'player' && this.playerHp() > 0 && this.playerAE() >= 5;
  }

  mageRest(): void {
    if (!this.canMageRest()) return;
    const preview = this.gridPreviewContext();
    if (!preview) return;

    const rollCount = this.playerAE();
    const currentMp = this.playerMp();
    const maxMp = this.getEffectivePlayerMagicPower();
    const nextMp = Math.min(maxMp, currentMp + rollCount);
    const mpGained = Math.max(0, nextMp - currentMp);

    if (mpGained > 0) {
      this.playerMp.set(nextMp);
      this.rollForDoxOnMageMpEvent(preview.dungonId, preview.centerRow, preview.centerColumn, mpGained, 'MP recovery');
    }

    this.addCombatLog(`You rest and recover magic. (+${mpGained} MP, AE restored to max)`);
    this.playerAE.set(this.getEffectivePlayerMaxAE());
  }

  canHealerRest(): boolean {
    return this.isHealerClass() && this.turnPhase() === 'player' && this.playerHp() > 0 && this.playerAE() >= 1;
  }

  healerRest(): void {
    if (!this.canHealerRest()) return;
    const preview = this.gridPreviewContext();
    if (!preview) return;

    const rollCount = this.playerAE();
    const currentHp = this.playerHp();
    const maxHp = this.getEffectivePlayerMaxHp();
    const nextHp = Math.min(maxHp, currentHp + rollCount);
    const hpGained = Math.max(0, nextHp - currentHp);

    this.playerHp.set(nextHp);
    this.addCombatLog(`You rest and recover. (+${hpGained} HP, AE restored to max)`);
    this.playerAE.set(this.getEffectivePlayerMaxAE());
  }

  private rollForDoxOnMageMpEvent(
    dungonId: number,
    playerRow: number,
    playerCol: number,
    pointCount: number,
    source: 'MP recovery' | 'spell casting'
  ): void {
    if (!this.isMageClass() || pointCount <= 0) {
      return;
    }

    for (let i = 0; i < pointCount; i++) {
      const roll = this.randomInt(1, 20);
      if (roll === 1) {
        this.addCombatLog(`Dox check (${source}) ${i + 1}/${pointCount}: rolled ${roll} on 1d20.`);
        this.spawnDox(dungonId, playerRow, playerCol);
        return;
      }
    }
  }

  private spendSpellMpWithDoxCheck(dungonId: number, playerRow: number, playerCol: number, spellMpCost: number): void {
    const currentMp = this.playerMp();
    const nextMp = Math.max(0, currentMp - spellMpCost);
    const spent = Math.max(0, currentMp - nextMp);
    this.playerMp.set(nextMp);
    if (spent > 0) {
      this.rollForDoxOnMageMpEvent(dungonId, playerRow, playerCol, spent, 'spell casting');
    }
  }

  canUseSneek(): boolean {
    if (this.turnPhase() !== 'player' || this.playerHp() <= 0) return false;
    if (this.playerSneekRoundsRemaining() > 0) return false;
    if (this.playerSneekUsedThisRound()) return false;
    const preview = this.gridPreviewContext();
    if (!preview) return false;
    // Sneek is only usable when no fight is going on (no alive non-dormant monsters)
    const hasActiveFight = this.monsterInstances().some(m => !m.isDead && !m.isDormant);
    if (hasActiveFight) return false;
    // Thieph/Shorties: free action. Everyone else needs AE.
    const t = (this.playerType() ?? '').trim().toLowerCase();
    const isFreeAction = t === 'thieph' || t === 'theph' || t === 'shorties';
    if (!isFreeAction && this.playerAE() < 1) return false;
    return true;
  }

  private getSneekClassModifier(monsterType?: string | null): number {
    const cls = (this.playerType() ?? '').trim().toLowerCase();
    const species = (this.playerSpecies() ?? '').trim().toLowerCase();
    let mod = 0;
    if (cls === 'fighter' || cls === 'figher') mod -= 1;
    if (cls === 'dwarph' || cls === 'dwarf' || species === 'dwarph' || species === 'dwarf') mod -= 1;
    if (cls === 'shorties') mod += 2;
    if (cls === 'elf' || cls === 'elve' || cls === 'elves' || species === 'elf' || species === 'elve' || species === 'elves') mod += 1;
    if (cls === 'ranger' && (monsterType ?? '').trim().toLowerCase() === 'beast') mod += 2;
    return mod;
  }

  trySneek(): void {
    if (!this.canUseSneek()) {
      this.addCombatLog('Sneek not available right now.');
      return;
    }
    const preview = this.gridPreviewContext();
    if (!preview) return;

    const t = (this.playerType() ?? '').trim().toLowerCase();
    const isThieph = t === 'thieph' || t === 'theph';
    const isShorties = t === 'shorties';
    const isFreeAction = isThieph || isShorties;
    const isStable = isFreeAction; // Thieph/Shorties: no per-AE re-check

    if (isThieph) {
      this.addCombatLog('Sneek! Auto-success (Thieph). Hidden for rest of round.');
    } else {
      const playerMind = this.getEffectivePlayerMind();
      const classMod = this.getSneekClassModifier();
      const modStr = classMod > 0 ? '+' + classMod : classMod < 0 ? '' + classMod : '';
      this.addCombatLog('Sneek active. (Roll 1d4+mind' + modStr + ' each action vs monster awareness)');
      if (isShorties) {
        this.addCombatLog('Shorties: free action, lasts rest of round.');
      }
    }

    this.playerSneekRoundsRemaining.set(1);
    this.playerSneekStable.set(isStable);
    this.playerSneekUsedThisRound.set(true);

    if (!isFreeAction) {
      this.consumePlayerAE(1, preview.dungonId);
      if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') {
        this.startMonsterTurns();
      }
    }
  }

  private checkSneekVsNearbyMonsters(dungonId: number, playerRow: number, playerCol: number): void {
    if (this.playerSneekRoundsRemaining() === 0) return;
    const ros = this.getEffectiveRangeOfSight(dungonId);
    const nearbyMonsters = this.monsterInstances().filter(m => {
      if (m.isDead || m.isDormant) return false;
      return Math.max(Math.abs(m.row - playerRow), Math.abs(m.column - playerCol)) <= ros;
    });
    if (nearbyMonsters.length === 0) return;

    const monstersById = this.getMonstersByIdForDungon(dungonId);
    const playerMind = this.getEffectivePlayerMind();
    const diceRoll = this.randomInt(1, 4);

    for (const monster of nearbyMonsters) {
      const template = monstersById.get(monster.monsterId);
      const classMod = this.getSneekClassModifier(template?.type);
      const playerScore = diceRoll + playerMind + classMod;
      const modStr = classMod > 0 ? '+' + classMod : classMod < 0 ? '' + classMod : '';
      const awareness = template?.awareness ?? 5;
      if (playerScore < awareness) {
        this.playerSneekRoundsRemaining.set(0);
        this.playerSneekStable.set(false);
        this.addCombatLog(
          'Sneek broken! ' + (template?.name ?? 'A monster') + ' spots you. ' +
          '(1d4(' + diceRoll + ')+mind ' + playerMind + modStr +
          ' = ' + playerScore + ' vs awareness ' + awareness + ')'
        );
        return;
      }
    }
  }

  canUseHealerLesserHeal(): boolean {
    if (!this.isHealerClass()) return false;
    if (this.turnPhase() !== 'player' || this.playerHp() <= 0) return false;
    return !this.healerFreeHealUsedThisRound();
  }

  useHealerLesserHeal(): void {
    if (!this.canUseHealerLesserHeal()) return;
    const preview = this.gridPreviewContext();
    if (!preview) return;

    const sel = this.selectedCombatTarget();
    const targetMonster = sel
      ? this.monsterInstances().find(m => !m.isDead && !m.npcIsHostile && m.row === sel.row && m.column === sel.column)
      : null;
    const targetTemplate = targetMonster
      ? this.getMonstersByIdForDungon(preview.dungonId).get(targetMonster.monsterId)
      : null;

    if (targetMonster && targetTemplate) {
      const healAmount = Math.max(1, Math.ceil(targetTemplate.hp / 2));
      targetMonster.currentHp = Math.min(targetTemplate.hp, targetMonster.currentHp + healAmount);
      this.monsterInstances.update((arr) => [...arr]);
      this.addCombatLog('Lesser Heal restores ' + healAmount + ' HP to ' + targetTemplate.name + '.');
    } else {
      const maxHp = this.getEffectivePlayerMaxHp();
      const healAmount = Math.max(1, Math.ceil(maxHp / 2));
      this.playerHp.set(Math.min(maxHp, this.playerHp() + healAmount));
      this.addCombatLog('Lesser Heal restores ' + healAmount + ' HP to you.');
    }

    this.healerFreeHealUsedThisRound.set(true);
    this.previewActionMessage.set('Lesser Heal cast (free action).');
    this.drawPreviewGridCanvas();
  }

  isThiephTrapSenseActive(): boolean {
    if (!this.isThiephClass()) return false;
    const current = this.getCurrentPreviewSquareContext();
    if (!current) return false;

    const floorTraps = (this.floorTrapPlacementsByDungon()[current.dungonId] ?? []).filter(
      (p) => !p.isTriggered && !p.isDisarmed
    );
    if (floorTraps.some((p) => Math.max(Math.abs(p.row - current.row), Math.abs(p.column - current.column)) <= 1)) {
      return true;
    }

    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (Math.abs(dr) + Math.abs(dc) > 1) continue;
        const row = current.row + dr;
        const col = current.column + dc;
        const treshers = this.getTreshersAtSquare(current.dungonId, row, col);
        if (treshers.some((t) => !!t.trap)) return true;
      }
    }

    return this.nearbyDoorsForPreview().some((d) => !!d.door.trap);
  }

  private rollD12WithAdvantage(bonus: number = 0): { best: number; rolls: [number, number] } {
    const a = this.rollWithBoost(12) + bonus;
    const b = this.rollWithBoost(12) + bonus;
    return { best: Math.max(a, b), rolls: [a, b] };
  }

  private isHealerWeaponDisadvantaged(weaponName: string): boolean {
    const name = (weaponName ?? '').toLowerCase();
    return /sward|sword|blade|ax|axe|dagger|knife/.test(name);
  }

  private applyThiephTresherBonus(treshers: Tresher[]): Tresher[] {
    if (!this.isThiephClass() || treshers.length === 0) return treshers;
    return treshers.map(t => {
      if (Math.random() < 0.05) {
        this.addCombatLog('Lucky find! +2 silver pieces! (Thieph bonus)');
        return { ...t, silver: t.silver + 2 };
      }
      return t;
    });
  }

  canPlayerAttack(): boolean {
    if (this.turnPhase() !== 'player' || this.playerAE() < 1 || this.playerAttacksThisTurn() >= this.getEffectivePlayerNOA()) return false;
    const preview = this.gridPreviewContext();
    if (!preview) return false;
    const equippedItemIds = this.equippedItemIdsByDungon()[preview.dungonId] ?? [];
    const itemsMap = this.pcTresherItemsById();
    let bestRange = 0;
    for (const itemId of equippedItemIds) {
      const item = itemsMap.get(itemId);
      if (item?.type === 'weapon' && item.range > bestRange) bestRange = item.range;
    }
    const effectiveRange = bestRange === 0 ? 1 : bestRange; // unarmed = melee range 1
    return this.findAdjacentLiveMonster(preview.centerRow, preview.centerColumn, effectiveRange, preview.dungonId) !== null;
  }

  canBoostAttack(): boolean {
    return this.isFighterClass() && this.canPlayerAttack() && this.playerAttacksThisTurn() === 0;
  }

  isFighterClass(): boolean {
    const t = (this.playerType() ?? '').toLowerCase();
    return t === 'fighter' || t === 'figher';
  }

  isRangerClass(): boolean {
    return (this.playerType() ?? '').trim().toLowerCase() === 'ranger';
  }

  getSelectedRangerFavoredTypeToBuy(): string | null {
    const selected = this.selectedRangerFavoredTypeToBuy();
    const options = this.rangerAvailableFavoredTypeOptions();
    if (selected && options.includes(selected)) {
      return selected;
    }
    return options[0] ?? null;
  }

  getRangerRangedHitBonusUpgradeCost(): { sp: number; gp: number } {
    const currentValue = Math.max(1, this.rangerRangedHitBonus());
    return {
      sp: 100 * currentValue,
      gp: 50 * currentValue,
    };
  }

  getRangerFavoredTypeDamageUpgradeCost(type: string): { sp: number; gp: number } {
    const currentValue = Math.max(1, this.rangerFavoredTypeDamageBonuses()[type] ?? 2);
    return {
      sp: 500 * currentValue,
      gp: 50 * currentValue,
    };
  }

  canBuyRangerRangedHitBonus(): boolean {
    if (!this.isRangerClass()) {
      return false;
    }
    const cost = this.getRangerRangedHitBonusUpgradeCost();
    return this.playerSp() >= cost.sp && this.getTotalGoldInInventory() >= cost.gp;
  }

  buyRangerRangedHitBonus(): void {
    if (!this.canBuyRangerRangedHitBonus()) {
      return;
    }
    const cost = this.getRangerRangedHitBonusUpgradeCost();
    this.playerSp.update((sp) => Math.max(0, sp - cost.sp));
    this.deductGoldFromInventory(cost.gp);
    this.rangerRangedHitBonus.update((value) => Math.max(2, value) + 1);
    this.saveGameState();
  }

  canBuyRangerFavoredTypeDamageBonus(type: string): boolean {
    if (!this.isRangerClass()) {
      return false;
    }
    const cost = this.getRangerFavoredTypeDamageUpgradeCost(type);
    return this.playerSp() >= cost.sp && this.getTotalGoldInInventory() >= cost.gp;
  }

  buyRangerFavoredTypeDamageBonus(type: string): void {
    if (!this.canBuyRangerFavoredTypeDamageBonus(type)) {
      return;
    }
    const cost = this.getRangerFavoredTypeDamageUpgradeCost(type);
    this.playerSp.update((sp) => Math.max(0, sp - cost.sp));
    this.deductGoldFromInventory(cost.gp);
    this.rangerFavoredTypeDamageBonuses.update((all) => ({
      ...all,
      [type]: Math.max(2, all[type] ?? 2) + 1,
    }));
    this.saveGameState();
  }

  canBuyNewRangerFavoredType(): boolean {
    const selectedType = this.getSelectedRangerFavoredTypeToBuy();
    if (!this.isRangerClass() || !selectedType) {
      return false;
    }
    return this.playerSp() >= 50000 && this.getTotalGoldInInventory() >= 1000;
  }

  buyNewRangerFavoredType(): void {
    const selectedType = this.getSelectedRangerFavoredTypeToBuy();
    if (!selectedType || !this.canBuyNewRangerFavoredType()) {
      return;
    }
    this.playerSp.update((sp) => Math.max(0, sp - 50000));
    this.deductGoldFromInventory(1000);
    this.rangerFavoredTypeDamageBonuses.update((all) => ({
      ...all,
      [selectedType]: 2,
    }));
    this.selectedRangerFavoredTypeToBuy.set(null);
    this.saveGameState();
  }

  tryBoostAttack(): void {
    if (this.turnPhase() !== 'player') { this.addCombatLog('Boost: not your turn.'); return; }
    if (!this.isFighterClass()) { this.addCombatLog('Boost: only Fighters can use Boost Attack.'); return; }
    if (this.playerAttacksThisTurn() > 0) { this.addCombatLog('Boost: must be used before any other attack this turn.'); return; }
    if (this.playerAE() < 1) { this.addCombatLog('Boost: no AE remaining.'); return; }

    const preview = this.gridPreviewContext();
    if (!preview) { this.addCombatLog('Boost: no active dungeon context.'); return; }

    const bestWeapon = this.getBestEquippedWeaponAttackStats(preview.dungonId);
    let bestRange = bestWeapon?.bestRange ?? 0;
    const weaponToHit = bestWeapon?.weaponToHit ?? 0;
    const weaponMagicPlus = bestWeapon?.weaponMagicPlus ?? 0;
    const weaponDamageBonus = bestWeapon?.weaponDamageBonus ?? 0;
    const weaponDiceSize = bestWeapon?.weaponDiceSize ?? 6;
    const weaponName = bestWeapon?.weaponName ?? '';

    const isUnarmed = bestRange === 0;
    if (isUnarmed) {
      bestRange = 1;
    }
    const playerAttackSource = isUnarmed
      ? 'your bare hands'
      : (weaponName || `a +${weaponToHit} weapon`);

    const adjacentMonster = this.getTargetMonster(preview.dungonId, preview.centerRow, preview.centerColumn, bestRange);
    if (!adjacentMonster) {
      this.addCombatLog('No monster in weapon range.');
      return;
    }

    const template = this.getMonstersByIdForDungon(preview.dungonId).get(adjacentMonster.monsterId);
    const toHitRequired = template ? this.getEffectiveMonsterToHitPlusNeeded(adjacentMonster, template) : 0;
    if (isUnarmed && toHitRequired > 0) {
      this.addCombatLog(`Your bare hands cannot hit ${template?.name ?? 'this monster'}! Need a +${toHitRequired} weapon.`);
      return;
    }
    if (!isUnarmed && weaponMagicPlus < toHitRequired) {
      this.addCombatLog(`Your +${weaponMagicPlus} weapon cannot hit ${template?.name ?? 'this monster'}! Need +${toHitRequired} or better.`);
      return;
    }

    const aeToConsume = this.playerAE();
    this.consumePlayerAE(aeToConsume, preview.dungonId);
    if (this.turnPhase() === 'gameover') return;
    this.playerAttacksThisTurn.update(n => n + 1);
    if (this.playerSneekRoundsRemaining() > 0) {
      this.playerSneekRoundsRemaining.set(0);
      this.addCombatLog('Sneek cancelled — you attacked!');
    }
    this.playWeaponHitSound(bestWeapon?.weaponSoundId ?? null);
    const monsterAC = template ? this.getEffectiveMonsterAC(adjacentMonster, template) : 10;

    const prevCombo = this.comboTracker();
    const isSameTarget = prevCombo?.placementIndex === adjacentMonster.placementIndex;
    const comboCount = isSameTarget ? prevCombo!.count : 0;
    const comboBonus = Math.min(comboCount, 4);
    this.comboTracker.set({ placementIndex: adjacentMonster.placementIndex, count: comboCount + 1 });
    if (comboBonus > 0) {
      this.addCombatLog(`Combo ×${comboCount + 1}! +${comboBonus} to hit!`);
    }

    const level = this.playerLevel();
    const boostDieSize = level >= 6 ? 6 : level >= 3 ? 4 : 3;
    const boostDieRoll = this.rollWithBoost(boostDieSize);
    const attackDistance = this.getSquareDistance(preview.centerRow, preview.centerColumn, adjacentMonster.row, adjacentMonster.column);
    const rangerHitBonus = this.getRangerRangedHitBonusAtDistance(attackDistance);

    const rollBonus = (isUnarmed ? -1 : weaponToHit) + rangerHitBonus;
    const hitRoll = this.rollD12(rollBonus + this.getEffectivePlayerStamina() + comboBonus) + boostDieRoll;
    this.addCombatLog(`Boost Attack! +${boostDieRoll} (1d${boostDieSize}) to hit. Your AC is -4 until your next turn!`);

    if (hitRoll >= monsterAC) {
      const rangerDamageBonus = this.getRangerFavoredTypeDamageBonus(template ?? null);
      let damage = isUnarmed
        ? Math.max(1, 1 + Math.floor(this.getEffectivePlayerStrength() / 2) + rangerDamageBonus)
        : Math.max(1, this.randomInt(1, Math.max(4, weaponDiceSize)) + this.getEffectivePlayerStrength() + rangerDamageBonus + weaponDamageBonus);
      if (template && weaponMagicPlus <= 0 && getMonsterTypeCombatModifiers(template.type).resistsNonMagicWeapons) {
        damage = Math.max(1, Math.floor(damage / 2));
        this.addCombatLog(`${template.name} resists non-magical damage!`);
      }
      adjacentMonster.currentHp -= damage;
      if (!adjacentMonster.npcIsHostile) {
        adjacentMonster.npcIsHostile = true;
      }
      this.triggerWeaponMonsterImpact(
        adjacentMonster.row,
        adjacentMonster.column,
        isUnarmed ? 'Blood' : (bestWeapon?.weaponEffectType ?? 'Blood'),
        isUnarmed ? '#cc0000' : (bestWeapon?.weaponEffectColor ?? '#cc0000'),
        bestWeapon?.weaponName ?? '',
        attackDistance
      );
      this.addCombatLog(
        `You ${isUnarmed ? 'punch' : 'hit'} ${template?.name ?? 'monster'} with ${playerAttackSource} for ${damage} dmg! (rolled ${hitRoll} vs AC ${monsterAC})`
      );
      if (adjacentMonster.currentHp <= 0) {
        adjacentMonster.isDead = true;
        adjacentMonster.currentHp = 0;
        this.addCombatLog(`${template?.name ?? 'Monster'} is dead!`);
        this.selectedCombatTarget.set(null);
        this.comboTracker.set(null);
        this.dropMonsterLoot(preview.dungonId, adjacentMonster, template ?? null);
        const spGain = template?.spReward ?? 0;
        if (spGain > 0) {
          this.playerSp.update((s) => s + spGain);
          this.addCombatLog(`+${spGain} SP!`);
          this.awardSpToPC(spGain);
        }
      } else if (template?.npcGivesInfoAfterDamaged && !adjacentMonster.isSpared) {
        this.addCombatLog(`${template.name} staggers — you can spare it and ask for information.`);
        this.npcDialog.set({ instance: adjacentMonster, template });
        this.startTavernMusic();
      }
      this.monsterInstances.update((arr) => [...arr]);
    } else {
      this.addCombatLog(
        `You miss ${template?.name ?? 'monster'} with ${playerAttackSource}. (rolled ${hitRoll} vs AC ${monsterAC})`
      );
    }

    this.playerBoostAttackACPenalty.set(4);
    this.drawPreviewGridCanvas();
    this.startMonsterTurns();
  }

  tryPlayerAttack(): void {
    if (this.turnPhase() !== 'player') {
      return;
    }
    if (this.playerAttacksThisTurn() >= this.getEffectivePlayerNOA()) {
      this.addCombatLog('No attacks remaining this turn.');
      return;
    }
    if (this.playerAE() < 1) {
      return;
    }

    const preview = this.gridPreviewContext();
    if (!preview) {
      return;
    }

    const bestWeapon = this.getBestEquippedWeaponAttackStats(preview.dungonId);
    let bestRange = bestWeapon?.bestRange ?? 0;
    const weaponToHit = bestWeapon?.weaponToHit ?? 0;
    const weaponMagicPlus = bestWeapon?.weaponMagicPlus ?? 0;
    const weaponDamageBonus = bestWeapon?.weaponDamageBonus ?? 0;
    const weaponDiceSize = bestWeapon?.weaponDiceSize ?? 6;
    const weaponName = bestWeapon?.weaponName ?? '';

    const isUnarmed = bestRange === 0;
    if (isUnarmed) {
      bestRange = 1; // unarmed melee range
    }
    const playerAttackSource = isUnarmed
      ? 'your bare hands'
      : (weaponName || `a +${weaponToHit} weapon`);

    const adjacentMonster = this.getTargetMonster(preview.dungonId, preview.centerRow, preview.centerColumn, bestRange);
    if (!adjacentMonster) {
      this.addCombatLog('No monster in weapon range.');
      return;
    }

    const template = this.getMonstersByIdForDungon(preview.dungonId).get(adjacentMonster.monsterId);
    const toHitRequired = template ? this.getEffectiveMonsterToHitPlusNeeded(adjacentMonster, template) : 0;
    if (isUnarmed && toHitRequired > 0) {
      this.addCombatLog(`Your bare hands cannot hit ${template?.name ?? 'this monster'}! Need a +${toHitRequired} weapon.`);
      return;
    }
    if (!isUnarmed && weaponMagicPlus < toHitRequired) {
      this.addCombatLog(`Your +${weaponMagicPlus} weapon cannot hit ${template?.name ?? 'this monster'}! Need +${toHitRequired} or better.`);
      return;
    }

    this.consumePlayerAE(1, preview.dungonId);
    this.playerAttacksThisTurn.update(n => n + 1);
    const wasSneakingForAttack = this.playerSneekRoundsRemaining() > 0;
    if (wasSneakingForAttack) {
      this.playerSneekRoundsRemaining.set(0);
      this.addCombatLog('Sneek cancelled — you attacked!');
    }
    this.playWeaponHitSound(bestWeapon?.weaponSoundId ?? null);
    const monsterAC = template ? this.getEffectiveMonsterAC(adjacentMonster, template) : 10;

    const prevCombo = this.comboTracker();
    const isSameTarget = prevCombo?.placementIndex === adjacentMonster.placementIndex;
    const comboCount = isSameTarget ? prevCombo!.count : 0;
    const comboBonus = Math.min(comboCount, 4);
    this.comboTracker.set({ placementIndex: adjacentMonster.placementIndex, count: comboCount + 1 });
    if (comboBonus > 0) {
      this.addCombatLog(`Combo ×${comboCount + 1}! +${comboBonus} to hit!`);
    }

    const coverPenalty = this.getAttackCoverPenalty(
      preview.dungonId, preview.centerRow, preview.centerColumn,
      adjacentMonster.row, adjacentMonster.column
    );
    if (coverPenalty !== 0) {
      this.addCombatLog(`Partial cover! ${coverPenalty} to hit.`);
    }
    const attackDistance = this.getSquareDistance(preview.centerRow, preview.centerColumn, adjacentMonster.row, adjacentMonster.column);
    const rangerHitBonus = this.getRangerRangedHitBonusAtDistance(attackDistance);
    const isRangedWeaponAttack = !isUnarmed && bestRange > 1;
    const fighterToHitBonus = this.isFighterClass() ? Math.floor(this.getEffectivePlayerDexterity() / 2) : 0;
    const rangerDexToHitBonus = (this.isRangerClass() && isRangedWeaponAttack) ? Math.floor(this.getEffectivePlayerDexterity() / 2) : 0;
    const rollBonus = (isUnarmed ? -1 : weaponToHit) + coverPenalty + rangerHitBonus + fighterToHitBonus + rangerDexToHitBonus;
    const healerDisadvantaged = !isUnarmed && this.isHealerClass() && this.isHealerWeaponDisadvantaged(weaponName);
    let hitRoll: number;
    if (healerDisadvantaged) {
      const hroll1 = this.rollD12(rollBonus + this.getEffectivePlayerStamina() + comboBonus);
      const hroll2 = this.rollD12(rollBonus + this.getEffectivePlayerStamina() + comboBonus);
      hitRoll = Math.min(hroll1, hroll2);
      this.addCombatLog('Healer disadvantage: rolled ' + hroll1 + ' and ' + hroll2 + ', kept ' + hitRoll + '.');
    } else {
      hitRoll = this.rollD12(rollBonus + this.getEffectivePlayerStamina() + comboBonus);
    }
    if (hitRoll >= monsterAC) {
      const rangerDamageBonus = this.getRangerFavoredTypeDamageBonus(template ?? null);
      const fighterDamageBonus = this.isFighterClass() ? Math.floor(this.getEffectivePlayerStrength() / 4) : 0;
      const rangerStrDamageBonus = (this.isRangerClass() && isRangedWeaponAttack) ? Math.floor(this.getEffectivePlayerStrength() / 2) : 0;
      let damage = isUnarmed
        ? Math.max(1, 1 + Math.floor(this.getEffectivePlayerStrength() / 2) + rangerDamageBonus)
        : Math.max(1, this.randomInt(1, Math.max(4, weaponDiceSize)) + this.getEffectivePlayerStrength() + rangerDamageBonus);
      damage += fighterDamageBonus + rangerStrDamageBonus;
      const isThiephSneakAttack = this.isThiephClass() && wasSneakingForAttack;
      if (isThiephSneakAttack) {
        damage *= 2;
        this.addCombatLog('Sneak attack! Unseen strike deals ×2 damage!');
      }
      if (template && weaponMagicPlus <= 0 && getMonsterTypeCombatModifiers(template.type).resistsNonMagicWeapons) {
        damage = Math.max(1, Math.floor(damage / 2));
        this.addCombatLog(`${template.name} resists non-magical damage!`);
      }
      adjacentMonster.currentHp -= damage;
      // If this is an NPC that only attacks when attacked, mark it hostile now
      if (!adjacentMonster.npcIsHostile) {
        adjacentMonster.npcIsHostile = true;
      }
      if (healerDisadvantaged) {
        this.playerMp.update(mp => Math.max(0, mp - 1));
        this.addCombatLog('Your body rejects the violent act. -1 MP.');
      }
      this.triggerWeaponMonsterImpact(
        adjacentMonster.row,
        adjacentMonster.column,
        isUnarmed ? 'Blood' : (bestWeapon?.weaponEffectType ?? 'Blood'),
        isUnarmed ? '#cc0000' : (bestWeapon?.weaponEffectColor ?? '#cc0000'),
        bestWeapon?.weaponName ?? '',
        attackDistance
      );
      this.addCombatLog(
        `You ${isUnarmed ? 'punch' : 'hit'} ${template?.name ?? 'monster'} with ${playerAttackSource} for ${damage} dmg! (rolled ${hitRoll} vs AC ${monsterAC})`
      );
      if (adjacentMonster.currentHp <= 0) {
        adjacentMonster.isDead = true;
        adjacentMonster.currentHp = 0;
        this.addCombatLog(`${template?.name ?? 'Monster'} is dead!`);
        this.selectedCombatTarget.set(null); // clear target after kill
        this.comboTracker.set(null);
        this.dropMonsterLoot(preview.dungonId, adjacentMonster, template ?? null);
        const spGain = template?.spReward ?? 0;
        if (spGain > 0) {
          this.playerSp.update((s) => s + spGain);
          this.addCombatLog(`+${spGain} SP!`);
          this.awardSpToPC(spGain);
        }
      } else if (template?.npcGivesInfoAfterDamaged && !adjacentMonster.isSpared) {
        this.addCombatLog(`${template.name} staggers — you can spare it and ask for information.`);
        this.npcDialog.set({ instance: adjacentMonster, template });
        this.startTavernMusic();
      }
      this.monsterInstances.update((arr) => [...arr]);
    } else {
      this.addCombatLog(
        `You miss ${template?.name ?? 'monster'} with ${playerAttackSource}. (rolled ${hitRoll} vs AC ${monsterAC})`
      );
    }

    this.drawPreviewGridCanvas();

    if (this.playerAE() <= 0) {
      this.startMonsterTurns();
    }
  }

  private getBestEquippedWeaponAttackStats(dungonId: number): {
    bestRange: number;
    weaponToHit: number;
    weaponMagicPlus: number;
    weaponDamageBonus: number;
    weaponDiceSize: number;
    weaponName: string;
    weaponEffectType: string;
    weaponEffectColor: string | null;
    weaponSoundId: number | null;
  } | null {
    const equippedItemIds = this.equippedItemIdsByDungon()[dungonId] ?? [];
    const itemsMap = this.pcTresherItemsById();
    let hasWeapon = false;
    let bestRange = 0;
    let weaponToHit = 0;
    let weaponMagicPlus = 0;
    let weaponDamageBonus = 0;
    let weaponDiceSize = 6;
    let weaponName = '';
    let weaponEffectType = 'Blood';
    let weaponEffectColor: string | null = '#cc0000';
    let weaponSoundId: number | null = null;

    for (const itemId of equippedItemIds) {
      const item = itemsMap.get(itemId);
      if (item?.type !== 'weapon') {
        continue;
      }

      hasWeapon = true;
      if (item.range > bestRange) {
        bestRange = item.range;
      }

      // effectToPc === 'ToHit' adds to the weapon's effective plus for both the hit roll and magic check.
      const toPcStat = this.normalizeEffectToPcStat(item.effectToPc ?? null);
      const toPcValue = typeof item.effectToPcValue === 'number' ? item.effectToPcValue : 0;
      const toHitBonus = toPcStat === 'ToHit' ? toPcValue : 0;
      const effectiveToHit = (item.effectValue ?? 0) + toHitBonus;

      if (!weaponName || effectiveToHit > weaponToHit) {
        weaponToHit = effectiveToHit;
        weaponDamageBonus = toPcStat === 'Damage' ? toPcValue : 0;
        weaponDiceSize = item.damage > 0 ? item.damage : 6;
        weaponName = item.name || '';
        weaponEffectType = item.weaponEffectType || 'Blood';
        weaponEffectColor = item.weaponEffectColor || '#cc0000';
        weaponSoundId = item.soundId ?? null;
      }

      // A weapon is considered magical (+1 minimum) if it has any enchantment:
      // an explicit plus (effectValue/ToHit > 0), a non-standard elemental effect, or an effectOn property.
      const isEnchanted = effectiveToHit > 0
        || (!!item.weaponEffectType && item.weaponEffectType.toLowerCase() !== 'blood')
        || item.effectOn !== null
        || (toPcStat === 'Damage' && toPcValue > 0);
      const itemMagicPlus = isEnchanted ? Math.max(1, effectiveToHit) : 0;
      if (itemMagicPlus > weaponMagicPlus) {
        weaponMagicPlus = itemMagicPlus;
      }
    }

    if (!hasWeapon) {
      return null;
    }

    return {
      bestRange,
      weaponToHit,
      weaponMagicPlus,
      weaponDamageBonus,
      weaponDiceSize,
      weaponName,
      weaponEffectType,
      weaponEffectColor,
      weaponSoundId,
    };
  }

  private tickActiveEffectsOnce(dungonId: number): void {
    // Tick player active effects
    const pEffects = this.playerActiveEffects();
    if (pEffects.length > 0) {
      const pRemaining: ActiveEffect[] = [];
      for (const eff of pEffects) {
        if (eff.behavior === 'modifier') {
          const roundsLeft = eff.remainingAE - 1;
          const sign = eff.effectAmount >= 0 ? '+' : '';
          this.addCombatLog(`${eff.sourceName}: ${eff.effectOn} ${sign}${eff.effectAmount} active (${Math.max(0, roundsLeft)} rounds left).`);
          if (eff.remainingAE - 1 > 0) {
            pRemaining.push({ ...eff, remainingAE: eff.remainingAE - 1 });
          } else {
            this.addCombatLog(`${eff.sourceName} wears off. (${eff.effectOn} modifier ends)`);
            this.playerHp.set(Math.max(0, Math.min(this.playerHp(), this.getEffectivePlayerMaxHp())));
            this.playerMp.set(Math.max(0, Math.min(this.playerMp(), this.getEffectivePlayerMagicPower())));
            this.playerAE.set(Math.max(0, Math.min(this.playerAE(), this.getEffectivePlayerMaxAE())));
          }
          continue;
        }

        if (eff.effectOn === 'HP') {
          const newHp = Math.min(this.getEffectivePlayerMaxHp(), Math.max(0, this.playerHp() + eff.effectAmount));
          this.playerHp.set(newHp);
          const sign = eff.effectAmount >= 0 ? '+' : '';
          this.addCombatLog(`${eff.sourceName}: ${sign}${eff.effectAmount} HP (${eff.remainingAE - 1} AE left).`);
          if (newHp <= 0) {
            this.playerDeathCause.set(`Killed by ${eff.sourceName}`);
            this.turnPhase.set('gameover');
            setTimeout(() => this.goHome(), 3500);
          }
        } else if (this.isMagicPotionEffect(eff.effectOn)) {
          const currentMp = this.playerMp();
          const maxMp = this.getEffectivePlayerMagicPower();
          const newMp = eff.effectAmount > 0
            ? currentMp
            : Math.max(0, Math.min(currentMp + eff.effectAmount, maxMp));
          this.playerMp.set(newMp);
          const delta = newMp - currentMp;
          const sign = delta >= 0 ? '+' : '';
          this.addCombatLog(`${eff.sourceName}: ${sign}${delta} MP (${eff.remainingAE - 1} AE left).`);
        } else {
          this.addCombatLog(`${eff.sourceName}: ${eff.effectOn} ${eff.effectAmount} (${eff.remainingAE - 1} AE left).`);
        }
        if (eff.remainingAE - 1 > 0) {
          pRemaining.push({ ...eff, remainingAE: eff.remainingAE - 1 });
        } else {
          this.addCombatLog(`${eff.sourceName} wears off.`);
        }
      }
      this.playerActiveEffects.set(pRemaining);
    }

    // Tick monster active effects
    const instances = this.monsterInstances();
    const monstersById = this.getMonstersByIdForDungon(dungonId);
    let anyMonsterChanged = false;
    for (const instance of instances) {
      if (instance.isDead || instance.activeEffects.length === 0) continue;
      anyMonsterChanged = true;
      const template = monstersById.get(instance.monsterId);
      const mRemaining: ActiveEffect[] = [];
      let monsterDied = false;
      for (const eff of instance.activeEffects) {
        if (eff.behavior === 'modifier') {
          const roundsLeft = eff.remainingAE - 1;
          const sign = eff.effectAmount >= 0 ? '+' : '';
          this.addCombatLog(`${eff.sourceName}: ${eff.effectOn} ${sign}${eff.effectAmount} on ${template?.name ?? 'monster'} (${Math.max(0, roundsLeft)} rounds left).`);
          if (eff.remainingAE - 1 > 0) {
            mRemaining.push({ ...eff, remainingAE: eff.remainingAE - 1 });
          } else {
            this.addCombatLog(`${eff.sourceName} on ${template?.name ?? 'monster'} wears off. (${eff.effectOn} modifier ends)`);
          }
          continue;
        }

        if (eff.effectOn === 'HP') {
          instance.currentHp -= eff.effectAmount;
          this.triggerBloodSplatter();
          this.addCombatLog(`${eff.sourceName}: -${eff.effectAmount} HP on ${template?.name ?? 'monster'} (${eff.remainingAE - 1} AE left).`);
          if (instance.currentHp <= 0) {
            instance.isDead = true;
            instance.currentHp = 0;
            monsterDied = true;
            this.addCombatLog(`${template?.name ?? 'Monster'} is dead!`);
            this.dropMonsterLoot(dungonId, instance, template ?? null);
            const spGain = template?.spReward ?? 0;
            if (spGain > 0) {
              this.playerSp.update((s) => s + spGain);
              this.addCombatLog(`+${spGain} SP!`);
              this.awardSpToPC(spGain);
            }
            break;
          }
        } else {
          this.addCombatLog(`${eff.sourceName}: ${eff.effectOn} -${eff.effectAmount} on ${template?.name ?? 'monster'} (${eff.remainingAE - 1} AE left).`);
        }
        if (eff.remainingAE - 1 > 0) {
          mRemaining.push({ ...eff, remainingAE: eff.remainingAE - 1 });
        } else {
          this.addCombatLog(`${eff.sourceName} on ${template?.name ?? 'monster'} wears off.`);
        }
      }
      instance.activeEffects = monsterDied ? [] : mRemaining;
    }
    if (anyMonsterChanged) {
      this.monsterInstances.update((arr) => [...arr]);
    }
  }

  private consumePlayerAE(amount: number, dungonId: number): void {
    for (let i = 0; i < amount; i++) {
      this.playerAE.update((ae) => Math.max(0, ae - 1));
      this.tickActiveEffectsOnce(dungonId);
      if (this.turnPhase() === 'gameover') return;
      // Non-stable sneek (non-Thieph/Shorties): re-check vs nearby monsters each AE spent
      if (this.playerSneekRoundsRemaining() > 0 && !this.playerSneekStable()) {
        const preview = this.gridPreviewContext();
        if (preview) {
          this.checkSneekVsNearbyMonsters(preview.dungonId, preview.centerRow, preview.centerColumn);
        }
      }
    }
  }

  private consumeMonsterAE(monster: GameMonsterInstance, amount: number, dungonId: number): void {
    for (let i = 0; i < amount; i++) {
      monster.remainingAE = Math.max(0, monster.remainingAE - 1);
      this.tickActiveEffectsOnce(dungonId);
      if (this.turnPhase() === 'gameover') return;
    }
  }

  private rollWithBoost(dieSize: number): number {
    const boostDie: Record<number, number> = { 12: 6, 6: 4, 4: 3, 3: 2, 2: 2 };
    const roll = this.randomInt(1, dieSize);
    const boostCursed = this.playerActiveEffects().some(e => e.effectOn === 'Boost Dice');
    if (!boostCursed && roll === dieSize && boostDie[dieSize] != null) {
      return roll + this.rollWithBoost(boostDie[dieSize]);
    }
    return roll;
  }

  private rollD12(bonus: number = 0): number {
    return this.rollWithBoost(12) + bonus;
  }

  private getSpellLearningClassModifier(): number {
    const type = (this.playerType() ?? '').trim().toLowerCase();
    if (type === 'fighter' || type === 'figher') {
      return -2;
    }
    if (type === 'thieph') {
      return -1;
    }
    return 0;
  }

  private getSpellCastingClassModifier(): number {
    const type = (this.playerType() ?? '').trim().toLowerCase();
    return type === 'fighter' || type === 'figher' ? -1 : 0;
  }

  private formatSignedModifier(value: number): string {
    if (value > 0) {
      return `+${value}`;
    }
    if (value < 0) {
      return `${value}`;
    }
    return '+0';
  }

  private rollSpellEffectDelta(baseEffectAmount: number): number {
    const magnitude = Math.abs(baseEffectAmount);
    const rolled = this.randomInt(1, 12) + magnitude;
    return baseEffectAmount >= 0 ? rolled : -rolled;
  }


  private rollMindDamageBonus(): { total: number; diceCount: number } {
    const diceCount = Math.max(1, Math.ceil(this.getEffectivePlayerMind() / 12));
    let total = 0;
    for (let i = 0; i < diceCount; i += 1) {
      total += this.randomInt(1, 4);
    }
    return { total, diceCount };
  }

  private calculateSpellHpDamage(effectAmount: number, monsterMagicResistance: number): { damage: number; mindBonus: number; mindDiceCount: number; mrReduction: number } {
    const { total: mindBonus, diceCount: mindDiceCount } = this.rollMindDamageBonus();
    const mrReduction = Math.ceil(Math.max(0, monsterMagicResistance) / 2);
    const damage = Math.max(1, effectAmount + mindBonus - mrReduction);
    return { damage, mindBonus, mindDiceCount, mrReduction };
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private npcWrapSpeech(name: string, type: string, line: string): string {
    const t = type.toLowerCase();
    const humanAesthetic = [
      `${name} leans in and murmurs, "${line}"`,
      `${name} clears their throat. "${line}"`,
      `"${line}" ${name} says, arms folded.`,
      `${name} pauses, then speaks. "${line}"`,
      `${name} glances about before saying, "${line}"`,
      `${name} looks you in the eye. "${line}"`,
    ];
    const goblinAesthetic = [
      `"HEH! ${line}" ${name} cackles.`,
      `${name} scratches its head. "Uhhhh... ${line}. Yeah, that's it!"`,
      `"You didn't hear this from me — ${line}" ${name} squeaks.`,
      `${name} taps its nose knowingly. "${line}"`,
    ];
    const undeadAesthetic = [
      `${name}'s hollow voice intones: "${line}"`,
      `"${line}" — the spirit of ${name} echoes.`,
      `${name} rasps from beyond the veil: "${line}"`,
      `The whisper of ${name} chills the air: "${line}"`,
    ];
    const demonicAesthetic = [
      `${name}'s voice reverberates with dark amusement: "${line}"`,
      `"${line}," ${name} hisses through a twisted grin.`,
      `${name} regards you with contempt before conceding: "${line}"`,
      `Smoke curls from ${name}'s lips: "${line}"`,
    ];
    const beastAesthetic = [
      `${name} growls something that roughly translates to: "${line}"`,
      `With a rumbling breath, ${name} communicates: "${line}"`,
      `${name} grunts and stamps a foot. "${line}"`,
    ];
    const arcaneAesthetic = [
      `${name} traces a sigil in the air. "${line}"`,
      `${name} speaks with measured precision: "${line}"`,
      `"${line}" — ${name} intones, as if reciting from memory.`,
    ];
    if (t.includes('goblin') || t.includes('kobold') || t.includes('gremlin') || t.includes('boggart')) return this.pickRandom(goblinAesthetic);
    if (t.includes('undead') || t.includes('ghost') || t.includes('zombie') || t.includes('lich') || t.includes('skeleton') || t.includes('wraith') || t.includes('specter')) return this.pickRandom(undeadAesthetic);
    if (t.includes('demon') || t.includes('devil') || t.includes('fiend') || t.includes('infernal')) return this.pickRandom(demonicAesthetic);
    if (t.includes('beast') || t.includes('animal') || t.includes('troll') || t.includes('ogre')) return this.pickRandom(beastAesthetic);
    if (t.includes('mage') || t.includes('wizard') || t.includes('scholar') || t.includes('celestial') || t.includes('arcane')) return this.pickRandom(arcaneAesthetic);
    return this.pickRandom(humanAesthetic);
  }

  private npcRefusalLine(name: string, type: string): string {
    const t = type.toLowerCase();
    const generic = [
      `${name} eyes you warily. "Prove you can show mercy, and then we'll talk."`,
      `"Earn my trust first," ${name} says flatly.`,
      `${name} folds their arms. "Show me mercy, then maybe I'll speak."`,
    ];
    const goblin = [
      `"NUH-UH! Not tellin'!" ${name} folds its arms smugly.`,
      `${name} blows a raspberry. "Fight me an' spare me FIRST, then maybe!"`,
    ];
    const undead = [
      `${name}'s hollow voice drifts: "Prove your resolve, then the dead may speak."`,
    ];
    if (t.includes('goblin') || t.includes('kobold') || t.includes('gremlin')) return this.pickRandom(goblin);
    if (t.includes('undead') || t.includes('ghost') || t.includes('skeleton')) return this.pickRandom(undead);
    return this.pickRandom(generic);
  }

  private npcApproachLine(name: string, type: string): string {
    const t = type.toLowerCase();
    const generic = [
      `You approach ${name} cautiously.`,
      `You step forward to speak with ${name}.`,
      `You address ${name} with a nod of acknowledgment.`,
    ];
    const goblin = [
      `You cautiously approach the jittery ${name}.`,
      `You try to look non-threatening as you approach ${name}.`,
    ];
    if (t.includes('goblin') || t.includes('kobold') || t.includes('gremlin')) return this.pickRandom(goblin);
    return this.pickRandom(generic);
  }

  private triggerBloodSplatter(): void {
    const drops: { x: number; y: number; r: number }[] = [];
    const count = 6 + Math.floor(Math.random() * 7);
    for (let i = 0; i < count; i++) {
      drops.push({
        x: 10 + Math.floor(Math.random() * 310),
        y: 5 + Math.floor(Math.random() * 200),
        r: 2 + Math.floor(Math.random() * 9),
      });
    }
    this.bloodSplatter.set(drops);
    setTimeout(() => this.bloodSplatter.set([]), 2000);
  }

  private triggerPlayerHitFlash(): void {
    this.playerHitFlash.set(true);
    setTimeout(() => this.playerHitFlash.set(false), 1500);
  }

  private dropMonsterLoot(
    dungonId: number,
    monster: GameMonsterInstance,
    template: Monster | null
  ): void {
    if (!template) {
      return;
    }

    const droppedNames: string[] = [];

    const tresherIds = [...monster.dropTresherIds, ...(template.tresherIds ?? [])];
    if (tresherIds.length > 0) {
      const newPlacements: TresherPlacement[] = tresherIds.map((tresherId) => ({
        tresherId,
        row: monster.row,
        column: monster.column,
      }));

      this.tresherPlacementsByDungon.update((allPlacements) => ({
        ...allPlacements,
        [dungonId]: [...(allPlacements[dungonId] ?? []), ...newPlacements],
      }));

      const treshersById = this.getTreshersByIdForDungon(dungonId);
      for (const id of tresherIds) {
        droppedNames.push(treshersById.get(id)?.name ?? 'item');
      }
    }

    const keyIds = [...monster.dropKeyIds, ...(template.keyIds ?? [])];
    if (keyIds.length > 0) {
      const keyIdSet = new Set(keyIds);
      this.keyList = this.keyList.map((key) =>
        keyIdSet.has(key.id)
          ? { ...key, rownId: monster.row, columnId: monster.column }
          : key
      );
      for (const keyId of keyIds) {
        const key = this.keyList.find((k) => k.id === keyId);
        droppedNames.push(key?.name ?? 'key');
      }
    }

    const itemIds = [...monster.dropItemIds];
    if (itemIds.length > 0) {
      const newPlacements = itemIds.map((itemId) => ({
        itemId,
        row: monster.row,
        column: monster.column,
      }));
      this.floorItemPlacementsByDungon.update((allPlacements) => ({
        ...allPlacements,
        [dungonId]: [...(allPlacements[dungonId] ?? []), ...newPlacements],
      }));
      const itemsById = new Map((this.floorItemListByDungon()[dungonId] ?? []).map((item) => [item.id, item]));
      for (const id of itemIds) {
        droppedNames.push(itemsById.get(id)?.name ?? 'item');
      }
    }

    const potionIds = [...monster.dropPotionIds];
    if (potionIds.length > 0) {
      const newPlacements = potionIds.map((potionId) => ({
        potionId,
        row: monster.row,
        column: monster.column,
      }));
      this.floorPotionPlacementsByDungon.update((allPlacements) => ({
        ...allPlacements,
        [dungonId]: [...(allPlacements[dungonId] ?? []), ...newPlacements],
      }));
      const potionsById = new Map((this.floorPotionListByDungon()[dungonId] ?? []).map((potion) => [potion.id, potion]));
      for (const id of potionIds) {
        droppedNames.push(potionsById.get(id)?.name ?? 'potion');
      }
    }

    const spellIds = [...monster.dropSpellIds];
    if (spellIds.length > 0) {
      const newPlacements = spellIds.map((spellId) => ({
        spellId,
        row: monster.row,
        column: monster.column,
      }));
      this.floorSpellPlacementsByDungon.update((allPlacements) => ({
        ...allPlacements,
        [dungonId]: [...(allPlacements[dungonId] ?? []), ...newPlacements],
      }));
      const spellsById = new Map((this.floorSpellListByDungon()[dungonId] ?? []).map((spell) => [spell.id, spell]));
      for (const id of spellIds) {
        droppedNames.push(spellsById.get(id)?.name ?? 'spell');
      }
    }

    if (droppedNames.length > 0) {
      this.addCombatLog(`${template.name} dropped: ${droppedNames.join(', ')}`);
    }
  }

  private findAdjacentLiveMonster(row: number, col: number, maxRange = 1, dungonId?: number): GameMonsterInstance | null {
    const instances = this.monsterInstances();
    for (const monster of instances) {
      if (monster.isDead) {
        continue;
      }
      const dr = Math.abs(monster.row - row);
      const dc = Math.abs(monster.column - col);
      if (dr <= maxRange && dc <= maxRange && (dr + dc) > 0) {
        if (dungonId != null && !this.hasLineOfSight(dungonId, row, col, monster.row, monster.column)) {
          continue;
        }
        return monster;
      }
    }
    return null;
  }

  /**
   * Returns a 0-7 priority index for auto-targeting based on the player's
   * facing direction (0 = front = highest priority, 7 = back = lowest).
   */
  private getTargetDirectionPriority(
    facing: FacingDirection,
    playerRow: number, playerCol: number,
    monsterRow: number, monsterCol: number
  ): number {
    const dr = monsterRow - playerRow;
    const dc = monsterCol - playerCol;
    // Angle from north (CW positive); atan2(east, north)
    const monsterAngle = Math.atan2(dc, -dr);
    const facingAngle: Record<FacingDirection, number> = {
      up: 0,
      right: Math.PI / 2,
      down: Math.PI,
      left: -Math.PI / 2,
    };
    let rel = monsterAngle - facingAngle[facing];
    if (rel > Math.PI) rel -= 2 * Math.PI;
    if (rel < -Math.PI) rel += 2 * Math.PI;
    const abs = Math.abs(rel);
    const sign = rel >= 0 ? 1 : -1;
    if (abs <= Math.PI / 8)         return 0; // front
    if (abs <= 3 * Math.PI / 8)     return sign >= 0 ? 1 : 2; // front-right / front-left
    if (abs <= 5 * Math.PI / 8)     return sign >= 0 ? 3 : 4; // right / left
    if (abs <= 7 * Math.PI / 8)     return sign >= 0 ? 6 : 5; // back-right / back-left
    return 7; // back
  }

  /**
   * Finds the highest-priority monster in Chebyshev range with line-of-sight,
   * ordered front → front-right → front-left → right → left → back-left → back-right → back,
   * then by distance (closer first) within the same angular region.
   */
  private findPriorityTarget(
    dungonId: number,
    playerRow: number,
    playerCol: number,
    range: number
  ): GameMonsterInstance | null {
    const facing = (this.cheaterByDungon()[dungonId] ?? DEFAULT_CHEATER).facingDir;
    const inRange = this.monsterInstances().filter(m => {
      if (m.isDead) return false;
      const dr = Math.abs(m.row - playerRow);
      const dc = Math.abs(m.column - playerCol);
      return dr <= range && dc <= range && (dr + dc) > 0 &&
        this.hasLineOfSight(dungonId, playerRow, playerCol, m.row, m.column);
    });
    if (inRange.length === 0) return null;
    inRange.sort((a, b) => {
      const ap = this.getTargetDirectionPriority(facing, playerRow, playerCol, a.row, a.column);
      const bp = this.getTargetDirectionPriority(facing, playerRow, playerCol, b.row, b.column);
      if (ap !== bp) return ap - bp;
      const ad = Math.max(Math.abs(a.row - playerRow), Math.abs(a.column - playerCol));
      const bd = Math.max(Math.abs(b.row - playerRow), Math.abs(b.column - playerCol));
      return ad - bd;
    });
    return inRange[0];
  }

  /**
   * Returns the monster to attack/cast at:
   * 1. Uses selectedCombatTarget if there's a live monster there within range.
   * 2. Falls back to findPriorityTarget and updates selectedCombatTarget.
   */
  private getTargetMonster(
    dungonId: number,
    playerRow: number,
    playerCol: number,
    range: number
  ): GameMonsterInstance | null {
    const sel = this.selectedCombatTarget();
    if (sel) {
      const dr = Math.abs(sel.row - playerRow);
      const dc = Math.abs(sel.column - playerCol);
      if (dr <= range && dc <= range) {
        const m = this.monsterInstances().find(
          x => !x.isDead && x.row === sel.row && x.column === sel.column
        );
        if (m && this.hasLineOfSight(dungonId, playerRow, playerCol, m.row, m.column)) {
          return m;
        }
      }
    }
    // Auto-select by direction priority
    const auto = this.findPriorityTarget(dungonId, playerRow, playerCol, range);
    if (auto) {
      this.selectedCombatTarget.set({ row: auto.row, column: auto.column });
    }
    return auto;
  }

  private findPriorityFloorTrapTarget(
    dungonId: number,
    playerRow: number,
    playerCol: number,
    range: number
  ): FloorTrapPlacement | null {
    const inRange = (this.floorTrapPlacementsByDungon()[dungonId] ?? []).filter((p) => {
      if (p.isTriggered || p.isDisarmed) return false;
      const dr = Math.abs(p.row - playerRow);
      const dc = Math.abs(p.column - playerCol);
      return dr <= range && dc <= range && (dr + dc) > 0 && this.hasLineOfSight(dungonId, playerRow, playerCol, p.row, p.column);
    });
    if (inRange.length === 0) return null;
    inRange.sort((a, b) => {
      const ad = Math.max(Math.abs(a.row - playerRow), Math.abs(a.column - playerCol));
      const bd = Math.max(Math.abs(b.row - playerRow), Math.abs(b.column - playerCol));
      if (ad !== bd) return ad - bd;
      if (a.row !== b.row) return a.row - b.row;
      return a.column - b.column;
    });
    return inRange[0];
  }

  private getTargetFloorTrap(
    dungonId: number,
    playerRow: number,
    playerCol: number,
    range: number
  ): FloorTrapPlacement | null {
    const sel = this.selectedCombatTarget();
    if (sel) {
      const dr = Math.abs(sel.row - playerRow);
      const dc = Math.abs(sel.column - playerCol);
      if (dr <= range && dc <= range) {
        const trap = this.getActiveFloorTrapAtSquare(dungonId, sel.row, sel.column);
        if (trap && this.hasLineOfSight(dungonId, playerRow, playerCol, trap.row, trap.column)) {
          return trap;
        }
      }
    }

    const auto = this.findPriorityFloorTrapTarget(dungonId, playerRow, playerCol, range);
    if (auto) {
      this.selectedCombatTarget.set({ row: auto.row, column: auto.column });
    }
    return auto;
  }

  private isAdjacentTo(r1: number, c1: number, r2: number, c2: number): boolean {
    const dr = Math.abs(r1 - r2);
    const dc = Math.abs(c1 - c2);
    return dr <= 1 && dc <= 1 && (dr + dc) > 0;
  }

  private canUseAdjacentMeleeAttack(
    dungonId: number,
    attackerRow: number,
    attackerColumn: number,
    targetRow: number,
    targetColumn: number
  ): boolean {
    if (!this.isAdjacentTo(attackerRow, attackerColumn, targetRow, targetColumn)) {
      return false;
    }

    const rowDelta = targetRow - attackerRow;
    const columnDelta = targetColumn - attackerColumn;
    const absRowDelta = Math.abs(rowDelta);
    const absColumnDelta = Math.abs(columnDelta);

    // Orthogonal adjacent melee requires a clear shared edge.
    if (absRowDelta + absColumnDelta === 1) {
      return !this.isSightBlockedBetweenAdjacentSquares(
        dungonId,
        attackerRow,
        attackerColumn,
        targetRow,
        targetColumn
      );
    }

    // Diagonal adjacent melee cannot cut through blocked corner walls.
    if (absRowDelta === 1 && absColumnDelta === 1) {
      const blockedVertical = this.isSightBlockedBetweenAdjacentSquares(
        dungonId,
        attackerRow,
        attackerColumn,
        targetRow,
        attackerColumn
      );

      const blockedHorizontal = this.isSightBlockedBetweenAdjacentSquares(
        dungonId,
        attackerRow,
        attackerColumn,
        attackerRow,
        targetColumn
      );

      return !blockedVertical && !blockedHorizontal;
    }

    return false;
  }

  private playStepSound(volume = 0.2): void {
    this.gameSoundService.playStepSound(this.soundMuted(), volume);
  }

  private playWeaponHitSound(soundId: number | null): void {
    if (soundId !== null) {
      const soundPath = this.soundPathById().get(soundId);
      if (soundPath) {
        this.playSoundPath(soundPath);
        return;
      }

      const userKey = this.account.getKey();
      if (userKey) {
        this.loadSoundCatalog(userKey, true);
      }
    }
    this.playClangSound();
  }

  private playClangSound(): void {
    this.gameSoundService.playClangSound(this.soundMuted());
  }

  private playBiteSound(): void {
    this.playSoundPath('/sounds/game sounds/Bite.wav');
  }

  private playClawSound(): void {
    this.playSoundPath('/sounds/game sounds/Claw.wav');
  }

  private playDoxScreamSound(): void {
    this.playSoundPath('/sounds/game sounds/DoxScreem.wav');
  }

  private monsterHasRangedAttackInRange(template: Monster, dist: number): boolean {
    return template.attacks.some((a) => a.spellId == null && (a.range ?? 1) > 1 && (a.range ?? 1) >= dist);
  }

  /** Max range among the monster's non-spell (weapon/natural) attacks with range > 1, or 0 if it has none. */
  private getMonsterRangedWeaponMaxRange(template: Monster): number {
    let maxRange = 0;
    for (const attack of template.attacks) {
      if (attack.spellId != null) continue;
      const range = attack.range ?? 1;
      if (range > 1) {
        maxRange = Math.max(maxRange, range);
      }
    }
    return maxRange;
  }

  /** True when every non-spell attack the monster has requires range > 1 (a "pure" ranged attacker, e.g. archer). */
  private monsterHasOnlyRangedWeaponAttacks(template: Monster): boolean {
    const physicalAttacks = template.attacks.filter((a) => a.spellId == null);
    if (physicalAttacks.length === 0) return false;
    return physicalAttacks.every((a) => (a.range ?? 1) > 1);
  }

  private activateTresherGuards(dungonId: number, row: number, column: number): void {
    const monstersById = this.getMonstersByIdForDungon(dungonId);
    const instances = this.monsterInstances();
    let anyActivated = false;
    for (const m of instances) {
      if (!m.isDead && m.isDormant && m.guardRow === row && m.guardColumn === column) {
        m.isDormant = false;
        anyActivated = true;
        const template = monstersById.get(m.monsterId);
        this.addCombatLog(`${template?.name ?? 'Monster'} was guarding that treasure!`);
      }
    }
    if (anyActivated) {
      this.monsterInstances.update((arr) => [...arr]);
    }
  }

  private startMonsterTurns(): void {
    this.turnPhase.set('monsters');
    this.addCombatLog('--- Monster turns ---');
    this.comboTracker.set(null);
    this.outOfRangeTarget.set(null);

    const preview = this.gridPreviewContext();
    if (!preview) {
      this.endMonsterTurns();
      return;
    }

    const monstersById = this.getMonstersByIdForDungon(preview.dungonId);
    const instances = this.monsterInstances();
    for (const monster of instances) {
      if (monster.isDead || monster.isDormant) {
        monster.remainingAE = 0;
        monster.attacksUsedThisTurn = 0;
        monster.hasCastSpellThisTurn = false;
        continue;
      }
      const template = monstersById.get(monster.monsterId);
      monster.remainingAE = template ? Math.max(0, this.getEffectiveMonsterStamina(monster, template) + this.getEffectiveMonsterNumberOfAttacks(monster, template)) : 0;
      monster.attacksUsedThisTurn = 0;
      monster.hasCastSpellThisTurn = false;
      if (template) {
        const regenPerRound = getMonsterTypeCombatModifiers(template.type).regenPerRound;
        if (regenPerRound > 0 && monster.currentHp > 0) {
          monster.currentHp = Math.min(template.hp, monster.currentHp + regenPerRound);
        }
      }
      console.log(
        `[MonsterAI] ── START TURN: ${template?.name ?? '?'} (id:${monster.monsterId}) ` +
        `AE:${monster.remainingAE} hp:${monster.currentHp} mp:${monster.currentMagic} ` +
        `pos:(${monster.row},${monster.column}) attacks:${template?.attacks?.map(a => a.spellId != null ? `spell:${a.spellId}` : a.type).join('|') ?? '?'}`
      );
    }
    this.monsterInstances.update((arr) => [...arr]);

    this.processMonsterRound(preview.dungonId);
  }

  private processMonsterRound(dungonId: number): void {
    const instances = this.monsterInstances();
    const anyHasAE = instances.some((m) => !m.isDead && !m.isDormant && m.remainingAE > 0);
    if (!anyHasAE) {
      this.endMonsterTurns();
      return;
    }

    const preview = this.gridPreviewContext();
    if (!preview) {
      this.endMonsterTurns();
      return;
    }

    const monstersById = this.getMonstersByIdForDungon(dungonId);
    const playerRow = preview.centerRow;
    const playerCol = preview.centerColumn;

    // Activate dormant guard monsters if player is on their guarded square
    for (const m of instances) {
      if (!m.isDead && m.isDormant && m.guardRow !== null && m.guardColumn !== null) {
        if (playerRow === m.guardRow && playerCol === m.guardColumn) {
          m.isDormant = false;
          const t = monstersById.get(m.monsterId);
          this.addCombatLog(`${t?.name ?? 'Monster'} guards this spot and attacks!`);
          const tpl = monstersById.get(m.monsterId);
          m.remainingAE = tpl ? Math.max(0, this.getEffectiveMonsterStamina(m, tpl) + this.getEffectiveMonsterNumberOfAttacks(m, tpl)) : 0;
          m.hasCastSpellThisTurn = false;
        }
      }
      if (!m.isDead && m.isStationary && m.stationaryTriggerRow !== null && m.stationaryTriggerCol !== null) {
        if (playerRow === m.stationaryTriggerRow && playerCol === m.stationaryTriggerCol) {
          m.isStationary = false;
          const t = monstersById.get(m.monsterId);
          this.addCombatLog(`${t?.name ?? 'Monster'} starts moving!`);
        }
      }
    }

    for (const monster of instances) {
      if (monster.isDead || monster.isDormant || monster.remainingAE <= 0) {
        continue;
      }

      const template = monstersById.get(monster.monsterId);
      if (!template) {
        monster.remainingAE = 0;
        continue;
      }

      const maxAttacks = this.getEffectiveMonsterNumberOfAttacks(monster, template);
      const isAdjacent = this.canUseAdjacentMeleeAttack(dungonId, monster.row, monster.column, playerRow, playerCol);
      const distToPlayer = this.chebyshevDistance(monster.row, monster.column, playerRow, playerCol);
      const canRangedAttack = !isAdjacent && this.monsterHasRangedAttackInRange(template, distToPlayer);
      const canDetectPlayer = isAdjacent || canRangedAttack || this.isMonsterWithinRangeOfPlayer(monster, playerRow, playerCol, 5, dungonId);
      const canSeePlayer = this.hasLineOfSight(dungonId, monster.row, monster.column, playerRow, playerCol);
      const shouldFlee = monster.currentHp <= template.runAt && template.runAt > 0;
      const isPassive = (template.npcOnlyAttackWhenAttacked || monster.noAttackUnlessAttacked || monster.dialoguePreventsAttack) && !monster.npcIsHostile;
      const rangedWeaponMaxRange = this.getMonsterRangedWeaponMaxRange(template);
      const shouldKiteToRangedDistance =
        rangedWeaponMaxRange > 1 &&
        this.monsterHasOnlyRangedWeaponAttacks(template) &&
        distToPlayer < rangedWeaponMaxRange &&
        !monster.isStationary;

      console.log(
        `[MonsterAI] ${template.name} (id:${monster.monsterId}) | AE:${monster.remainingAE} | ` +
        `pos:(${monster.row},${monster.column}) -> player:(${playerRow},${playerCol}) | dist:${distToPlayer} | ` +
        `adjacent:${isAdjacent} canRanged:${canRangedAttack} canDetect:${canDetectPlayer} canSee:${canSeePlayer} | ` +
        `hp:${monster.currentHp} mp:${monster.currentMagic} attacks:${monster.attacksUsedThisTurn}/${maxAttacks} castThisTurn:${monster.hasCastSpellThisTurn} | ` +
        `shouldFlee:${shouldFlee} isPassive:${isPassive} shouldKite:${shouldKiteToRangedDistance}(maxRange:${rangedWeaponMaxRange})`
      );

      // Call for reinforcements before acting (first time only, costs full turn)
      if (template.callsReinforcements && !monster.hasCalledReinforcements && canDetectPlayer) {
        console.log(`[MonsterAI] ${template.name} AE:${monster.remainingAE} → CALL REINFORCEMENTS`);
        monster.hasCalledReinforcements = true;
        monster.remainingAE = 0;
        const spawnedCount = this.spawnConfiguredReinforcements(monster, template, instances, monstersById, dungonId);
        if (spawnedCount > 0) {
          const reinforcementLabel = this.resolveReinforcementTemplate(template, monstersById)?.name ?? template.name;
          this.addCombatLog(`${template.name} calls ${spawnedCount} ${reinforcementLabel}${spawnedCount === 1 ? '' : 's'} for reinforcements!`);
        } else {
          this.addCombatLog(`${template.name} calls for reinforcements, but none can reach the battlefield.`);
        }
        continue;
      }

      if (shouldFlee) {
        console.log(`[MonsterAI] ${template.name} AE:${monster.remainingAE} → FLEE (hp ${monster.currentHp} <= runAt ${template.runAt})`);
        this.monsterTryFlee(monster, dungonId, playerRow, playerCol);
      } else if (isPassive) {
        console.log(`[MonsterAI] ${template.name} AE:${monster.remainingAE} → PASSIVE — do nothing`);
        monster.remainingAE = 0;
      } else if (monster.attacksUsedThisTurn < maxAttacks && !monster.hasCastSpellThisTurn) {
        const spellAttack = this.selectMonsterSpellAttack(monster, template, dungonId, playerRow, playerCol);
        if (spellAttack !== null) {
          const inferredSpellMaxRange = this.getSpellEffectSlots(spellAttack.spell)
            .filter((slot) => slot.targetType === 'pc' || slot.targetType === 'monster')
            .reduce((max, slot) => Math.max(max, slot.range), 0);
          const selectedSpellMaxRange = Math.max(inferredSpellMaxRange, Math.max(1, spellAttack.attack.range ?? 1));
          const spellIsRanged = selectedSpellMaxRange > 1;
          const preferMeleePressure = !spellIsRanged && this.shouldMonsterPreferMeleePressure(monster, template, isAdjacent);
          const shouldKiteBeforeCasting = !preferMeleePressure && spellIsRanged && distToPlayer < selectedSpellMaxRange && !monster.isStationary;
          console.log(
            `[MonsterAI] ${template.name} AE:${monster.remainingAE} → spell candidate: "${spellAttack.spell.name}" ` +
            `(id:${spellAttack.spell.id} range:${selectedSpellMaxRange} dist:${distToPlayer} spellIsRanged:${spellIsRanged} preferMelee:${preferMeleePressure} shouldKiteBeforeCasting:${shouldKiteBeforeCasting} mp:${monster.currentMagic}/${template.magic})`
          );
          if (preferMeleePressure && isAdjacent) {
            console.log(`[MonsterAI] ${template.name} AE:${monster.remainingAE} → MELEE ATTACK (prefer melee pressure, adjacent)`);
            this.monsterAttackPlayer(monster, template, dungonId, playerRow, playerCol);
          } else if (preferMeleePressure && canDetectPlayer && canSeePlayer && !monster.isStationary) {
            console.log(`[MonsterAI] ${template.name} AE:${monster.remainingAE} → MOVE TOWARD (prefer melee pressure, closing distance)`);
            this.monsterMoveToward(monster, dungonId, playerRow, playerCol);
          } else if (shouldKiteBeforeCasting) {
            console.log(`[MonsterAI] ${template.name} AE:${monster.remainingAE} → KITE (retreat toward spell max range ${selectedSpellMaxRange}, dist:${distToPlayer}) before casting "${spellAttack.spell.name}"`);
            this.monsterKiteBeforeCastingSpell(monster, template, spellAttack, dungonId, playerRow, playerCol);
          } else {
            console.log(`[MonsterAI] ${template.name} AE:${monster.remainingAE} → CAST SPELL "${spellAttack.spell.name}"`);
            this.monsterCastSpellOnPlayer(monster, template, spellAttack, dungonId, playerRow, playerCol);
          }
        } else if (shouldKiteToRangedDistance) {
          console.log(`[MonsterAI] ${template.name} AE:${monster.remainingAE} → KITE (retreat toward ranged weapon max range ${rangedWeaponMaxRange}, dist:${distToPlayer})`);
          this.monsterKiteToRangedDistance(monster, template, dungonId, playerRow, playerCol);
        } else if (isAdjacent || canRangedAttack) {
          console.log(`[MonsterAI] ${template.name} AE:${monster.remainingAE} → ATTACK (no spell available, ${isAdjacent ? 'adjacent melee' : 'ranged'})`);
          this.monsterAttackPlayer(monster, template, dungonId, playerRow, playerCol);
        } else if (canDetectPlayer && canSeePlayer && !monster.isStationary) {
          console.log(`[MonsterAI] ${template.name} AE:${monster.remainingAE} → MOVE TOWARD (no spell in range, can detect+see)`);
          this.monsterMoveToward(monster, dungonId, playerRow, playerCol);
        } else if (monster.roam && !monster.isStationary) {
          console.log(`[MonsterAI] ${template.name} AE:${monster.remainingAE} → ROAM (no target)`);
          this.monsterMoveRandom(monster, dungonId);
        } else {
          console.log(`[MonsterAI] ${template.name} AE:${monster.remainingAE} → IDLE (nothing to do)`);
          monster.remainingAE = 0;
        }
      } else if (shouldKiteToRangedDistance && monster.attacksUsedThisTurn < maxAttacks) {
        console.log(`[MonsterAI] ${template.name} AE:${monster.remainingAE} → KITE (extra attack slot, retreat toward max range ${rangedWeaponMaxRange}, dist:${distToPlayer})`);
        this.monsterKiteToRangedDistance(monster, template, dungonId, playerRow, playerCol);
      } else if ((isAdjacent || canRangedAttack) && monster.attacksUsedThisTurn < maxAttacks) {
        console.log(`[MonsterAI] ${template.name} AE:${monster.remainingAE} → ATTACK (extra attack slot, ${isAdjacent ? 'adjacent' : 'ranged'})`);
        this.monsterAttackPlayer(monster, template, dungonId, playerRow, playerCol);
      } else if (!isAdjacent && canDetectPlayer && canSeePlayer && !monster.isStationary) {
        console.log(`[MonsterAI] ${template.name} AE:${monster.remainingAE} → MOVE TOWARD (after attacks used)`);
        this.monsterMoveToward(monster, dungonId, playerRow, playerCol);
      } else if (monster.roam && !monster.isStationary) {
        console.log(`[MonsterAI] ${template.name} AE:${monster.remainingAE} → ROAM (after attacks used)`);
        this.monsterMoveRandom(monster, dungonId);
      } else {
        console.log(`[MonsterAI] ${template.name} AE:${monster.remainingAE} → END TURN (no actions left)`);
        monster.remainingAE = 0;
      }

      if (this.turnPhase() === 'gameover') {
        return;
      }
    }

    this.monsterInstances.update((arr) => [...arr]);
    this.syncMonsterPlacementsFromInstances(dungonId);
    this.drawPreviewGridCanvas();

    setTimeout(() => this.processMonsterRound(dungonId), 300);
  }

  private shouldMonsterPreferMeleePressure(monster: GameMonsterInstance, template: Monster, isAdjacent: boolean): boolean {
    const hasRangeOneMeleeAttack = template.attacks.some((attack) => {
      const attackType = (attack.type ?? '').trim().toLowerCase();
      const isMeleeType = attackType === 'bite' || attackType === 'claw' || attackType === 'weapon';
      const isSpellLinked = attack.spellId != null;
      const attackRange = Math.max(1, attack.range ?? 1);
      return isMeleeType && !isSpellLinked && attackRange <= 1;
    });

    if (!hasRangeOneMeleeAttack) {
      return false;
    }

    // AE/MP-weighted decision: monsters with more magic remaining relative to their max
    // lean toward casting spells; monsters running low on MP fall back to melee pressure.
    const maxMagic = Math.max(0, template.magic);
    const mpRatio = maxMagic > 0 ? Math.min(1, monster.currentMagic / maxMagic) : 0;

    // At point-blank, monsters still often press the attack, but the chance shifts toward
    // casting as their remaining MP ratio climbs (0.75 chance to melee near-empty, down to
    // 0.25 at full MP).
    if (isAdjacent) {
      return Math.random() < 0.25 + (1 - mpRatio) * 0.5;
    }

    // At spell range they sometimes close distance to threaten range-1 attacks, but a
    // monster flush with MP is far less likely to abandon a ranged spell to do so.
    return Math.random() < 0.1 + (1 - mpRatio) * 0.4;
  }

  private selectMonsterSpellAttack(
    monster: GameMonsterInstance,
    template: Monster,
    dungonId: number,
    playerRow: number,
    playerCol: number
  ): { attack: MonsterAttack; spell: PcTresherSpellData } | null {
    if (monster.remainingAE < 1 || monster.currentMagic <= 0) {
      console.log(`[MonsterAI] ${template.name} selectSpell → SKIP (AE:${monster.remainingAE} mp:${monster.currentMagic})`);
      return null;
    }

    const candidates = template.attacks
      .map((attack) => {
        if (attack.spellId == null) {
          return null;
        }
        const spell = this.resolveSpellData(dungonId, attack.spellId);
        if (!spell) {
          console.log(`[MonsterAI] ${template.name} selectSpell → spell id:${attack.spellId} NOT FOUND in catalog`);
          return null;
        }
        const spellCost = Math.max(1, spell.magicCost ?? 1);
        if (monster.currentMagic < spellCost) {
          console.log(`[MonsterAI] ${template.name} selectSpell → "${spell.name}" SKIP: not enough mp (${monster.currentMagic} < cost ${spellCost})`);
          return null;
        }
        const monsterRange = Math.max(Math.abs(monster.row - playerRow), Math.abs(monster.column - playerCol));
        const inferredSpellMaxRange = this.getSpellEffectSlots(spell)
          .filter((slot) => slot.targetType === 'pc' || slot.targetType === 'monster')
          .reduce((max, slot) => Math.max(max, slot.range), 0);
        const maxSpellRange = Math.max(inferredSpellMaxRange, Math.max(1, attack.range ?? 1));
        console.log(
          `[MonsterAI] ${template.name} selectSpell → "${spell.name}" id:${spell.id} ` +
          `dist:${monsterRange} maxRange:${maxSpellRange} (inferredSlotRange:${inferredSpellMaxRange} attackRange:${attack.range ?? 'null'}) ` +
          `cost:${spellCost} mp:${monster.currentMagic} diceFormula:${spell.effectDiceCount ?? 0}d${spell.effectDiceSides ?? 0}`
        );
        if (maxSpellRange <= 0 || monsterRange > maxSpellRange) {
          console.log(`[MonsterAI] ${template.name} selectSpell → "${spell.name}" SKIP: out of range (${monsterRange} > ${maxSpellRange})`);
          return null;
        }
        const targetKind = this.getSpellTargetKind(spell);
        if (targetKind === 'trap' || targetKind === 'self') {
          console.log(`[MonsterAI] ${template.name} selectSpell → "${spell.name}" SKIP: wrong target kind (${targetKind})`);
          return null;
        }
        if (!this.hasLineOfSight(dungonId, monster.row, monster.column, playerRow, playerCol)) {
          console.log(`[MonsterAI] ${template.name} selectSpell → "${spell.name}" SKIP: no line of sight`);
          return null;
        }
        return { attack, spell };
      })
      .filter((entry): entry is { attack: MonsterAttack; spell: PcTresherSpellData } => entry !== null);

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((a, b) => {
      const aPower = Math.max(Math.abs(a.spell.effectAmount), Math.abs(a.spell.effectAmount2 ?? 0));
      const bPower = Math.max(Math.abs(b.spell.effectAmount), Math.abs(b.spell.effectAmount2 ?? 0));
      return bPower - aPower;
    });
    return candidates[0];
  }

  private monsterCastSpellOnPlayer(
    monster: GameMonsterInstance,
    template: Monster,
    spellAttack: { attack: MonsterAttack; spell: PcTresherSpellData },
    dungonId: number,
    playerRow: number,
    playerCol: number
  ): void {
    const { attack, spell } = spellAttack;
    const spellCost = Math.max(1, spell.magicCost ?? 1);
    if (monster.currentMagic < spellCost) {
      return;
    }

    this.consumeMonsterAE(monster, 1, dungonId);
    if (monster.isDead) {
      return;
    }
    monster.attacksUsedThisTurn += 1;
    monster.hasCastSpellThisTurn = true;
    monster.currentMagic = Math.max(0, monster.currentMagic - spellCost);

    // Monsters use the same spell audio path resolution as player casts.
    this.playSpellSound(spell);

    const coverPenalty = this.getAttackCoverPenalty(dungonId, monster.row, monster.column, playerRow, playerCol);
    const castPlus = Math.max(0, Math.trunc(template.castPlus ?? 0));
    const castDamageBonus = Math.floor(castPlus / 2);
    const spellHitBonus = (attack.plusToHit ?? 0) + coverPenalty + castPlus;
    const hitRoll = this.rollD12(spellHitBonus);
    const dc = spell.successTestValue + this.getPlayerMagicResistance();
    const rawFlashKind = this.getMonsterImpactKind(spell.name, spell.effectOn, spell.effectType ?? '');
    const flashKind = rawFlashKind === 'rangedTarget' ? 'blood' : rawFlashKind;
    if (hitRoll < dc) {
      // Even on resist, show the incoming spell visual across FPV.
      this.triggerSpellHitFlash(spell.name, spell.effectOn, spell.effectType ?? '', spell.effectColor);
      this.addCombatLog(
        `${template.name} casts ${spell.name} — rolled ${hitRoll} (1d12${this.formatSignedModifier(spellHitBonus)}) vs DC ${dc}. ` +
        `Cast+ ${castPlus} (Dmg +${castDamageBonus}). You resist.`
      );
      // Do not close distance after spending AE to cast.
      monster.remainingAE = 0;
      return;
    }

    // For spell impacts, use the spell-specific full-screen flash instead of generic red damage flash.
    this.triggerSpellHitFlash(spell.name, spell.effectOn, spell.effectType ?? '', spell.effectColor);

    const slots = this.getSpellEffectSlots(spell).filter(
      (slot) => slot.targetType === 'monster' || slot.targetType === 'pc'
    );
    if (slots.length === 0) {
      this.addCombatLog(
        `${template.name} casts ${spell.name} — rolled ${hitRoll} (1d12${this.formatSignedModifier(spellHitBonus)}) vs DC ${dc}. ` +
        `Cast+ ${castPlus} (Dmg +${castDamageBonus}), but nothing happens.`
      );
      return;
    }

    for (const slot of slots) {
      const distance = Math.max(Math.abs(monster.row - playerRow), Math.abs(monster.column - playerCol));
      if (distance > slot.range) {
        continue;
      }
      const baseEffect = slot.effectAmount;
      const signedDamageBonus = baseEffect >= 0 ? castDamageBonus : -castDamageBonus;
      const adjustedEffectBase = baseEffect + signedDamageBonus;
      const diceCount = Math.max(0, Math.trunc(slot.effectDiceCount ?? 0));
      const diceSides = Math.max(0, Math.trunc(slot.effectDiceSides ?? 0));
      const usesDiceFormula = diceCount > 0 && diceSides > 0;
      let rolledAmount: number;
      let formulaText: string;

      if (usesDiceFormula) {
        let diceTotal = 0;
        for (let i = 0; i < diceCount; i += 1) {
          diceTotal += this.randomInt(1, diceSides);
        }
        const signedDiceTotal = baseEffect >= 0 ? diceTotal : -diceTotal;
        rolledAmount = signedDiceTotal + signedDamageBonus;
        formulaText = `${diceCount}d${diceSides}${signedDamageBonus !== 0 ? this.formatSignedModifier(signedDamageBonus) : ''}`;
      } else {
        rolledAmount = this.rollSpellEffectDelta(adjustedEffectBase);
        formulaText = `1d12+|${adjustedEffectBase}|`;
      }

      this.addCombatLog(
        `${template.name} casts ${spell.name} pre-effect ${slot.effectOn}: base ${baseEffect}` +
        `${signedDamageBonus !== 0 ? ` + Cast+ ${signedDamageBonus >= 0 ? '+' : ''}${signedDamageBonus}` : ''}` +
        `${usesDiceFormula ? '' : ` => ${adjustedEffectBase}`}, formula ${formulaText}, rolled ${rolledAmount}.`
      );
      const detrimentalAmount = rolledAmount >= 0 ? -rolledAmount : rolledAmount;
      if (slot.lastFor === 0) {
        this.applyPermanentPlayerSpellEffect(slot.effectOn, detrimentalAmount);
      } else if ((slot.effectOn ?? '').trim().toLowerCase() === 'hp') {
        this.playerActiveEffects.update((effects) => [
          ...effects,
          {
            effectOn: 'HP',
            effectAmount: detrimentalAmount,
            remainingAE: this.spellEffectRemainingAE(slot.lastFor),
            sourceName: `${template.name} / ${spell.name}`,
            behavior: 'tick',
          },
        ]);
      } else {
        this.playerActiveEffects.update((effects) => [
          ...effects,
          {
            effectOn: slot.effectOn,
            effectAmount: detrimentalAmount,
            remainingAE: this.spellEffectRemainingAE(slot.lastFor),
            sourceName: `${template.name} / ${spell.name}`,
            behavior: 'modifier',
          },
        ]);
      }
    }

    this.addCombatLog(
      `${template.name} casts ${spell.name} on you — rolled ${hitRoll} (1d12${this.formatSignedModifier(spellHitBonus)}) vs DC ${dc}. ` +
      `Cast+ ${castPlus} (Dmg +${castDamageBonus}).`
    );
    // Do not close distance after spending AE to cast.
    monster.remainingAE = 0;
  }

  private monsterAttackPlayer(
    monster: GameMonsterInstance,
    template: Monster,
    dungonId: number,
    playerRow: number,
    playerCol: number
  ): void {
    this.consumeMonsterAE(monster, 1, dungonId);
    if (monster.isDead) return;
    monster.attacksUsedThisTurn += 1;

    // Thieph Sneek: player is hidden, monster cannot attack
    if (this.playerSneekRoundsRemaining() > 0) {
      this.addCombatLog(template.name + ' cannot find you! (Sneek)');
      return;
    }

    // Pick only non-spell attacks here. Spell-linked attacks are handled by monsterCastSpellOnPlayer.
    const physicalAttacks = template.attacks.filter((a) => a.spellId == null);
    if (physicalAttacks.length === 0) {
      monster.remainingAE = 0;
      return;
    }

    // Pick attack randomly from those in range (each attack independent when multi-attack)
    const distToPlayer = this.chebyshevDistance(monster.row, monster.column, playerRow, playerCol);
    const adjacentToPlayer = distToPlayer <= 1;
    let eligibleAttacks: MonsterAttack[];
    if (adjacentToPlayer) {
      // When adjacent prefer melee (range 1); fall back to all if monster is ranged-only
      const meleePool = physicalAttacks.filter((a) => (a.range ?? 1) === 1);
      eligibleAttacks = meleePool.length > 0 ? meleePool : physicalAttacks;
    } else {
      // At range, only use attacks that reach the player
      const rangedPool = physicalAttacks.filter((a) => (a.range ?? 1) >= distToPlayer);
      eligibleAttacks = rangedPool.length > 0 ? rangedPool : physicalAttacks;
    }
    const attack = eligibleAttacks[Math.floor(Math.random() * eligibleAttacks.length)] ?? physicalAttacks[0];
    const monsterStrength = this.getEffectiveMonsterStrength(monster, template);
    const typeToHitBonus = getMonsterTypeCombatModifiers(template.type).toHitBonus;
    const plusToHit = (attack?.plusToHit ?? 0) + monsterStrength + typeToHitBonus;
    const baseDamage =
      typeof attack?.damageFormula === 'string' && attack.damageFormula.trim().length > 0
        ? Math.max(1, rollNotation(attack.damageFormula))
        : Math.max(1, attack?.damage ?? 1);
    const maxDamage = Math.max(1, baseDamage + monsterStrength);
    const attackLabel = this.getMonsterAttackLabel(attack);

    if (attack?.type === 'Mind') {
      this.playDoxScreamSound();
    } else if (attack?.type === 'Weapon') {
      this.playClangSound();
    } else if (attack?.type === 'Claw') {
      this.playClawSound();
    } else if (attack?.type === 'Bite') {
      this.playBiteSound();
    }

    const coverPenalty = this.getAttackCoverPenalty(dungonId, monster.row, monster.column, playerRow, playerCol);
    const hitRoll = this.rollD12(plusToHit + coverPenalty);
    let playerAC = this.getPlayerAC();
    if (this.playerDefendStacks() > 0) {
      playerAC += 2;
      this.playerDefendStacks.update((s) => s - 1);
    }

    if (hitRoll >= playerAC) {
      this.playerWasHitThisRound.set(true);
      const damage = maxDamage <= 1 ? 1 : this.randomInt(1, maxDamage);
      if (attack?.type === 'Mind') {
        // Dox mind drain — damages Mind stat, not HP
        this.playerMind.update(m => Math.max(0, m - damage));
        this.triggerPlayerHitFlash();
        this.addCombatLog(
          `${template.name} drains ${damage} Mind! (rolled ${hitRoll} vs AC ${playerAC}) [Mind remaining: ${this.playerMind()}]`
        );
        if (this.playerMind() <= 0) {
          this.playerDeathCause.set(`Mind shattered by ${template.name}`);
          this.turnPhase.set('gameover');
          this.addCombatLog('Your mind has been shattered by the Dox. Game Over!');
          setTimeout(() => this.goHome(), 3500);
        }
      } else {
        this.playerHp.update((hp) => Math.max(0, hp - damage));
        this.triggerPlayerHitFlash();
        this.addCombatLog(
          `${template.name} hits you with ${attackLabel} for ${damage} dmg! (rolled ${hitRoll} vs AC ${playerAC})`
        );
        if (this.playerHp() <= 0) {
          this.playerDeathCause.set(`Slain by ${template.name}`);
          this.turnPhase.set('gameover');
          this.addCombatLog('You have been slain. Game Over!');
          setTimeout(() => this.goHome(), 3500);
        }
      }

      if (this.turnPhase() !== 'gameover' && attack?.curseId != null) {
        this.applyMonsterAttackCurseToPlayer(template.name, attack);
      }
    } else {
      this.addCombatLog(
        `${template.name} misses you with ${attackLabel}. (rolled ${hitRoll} vs AC ${playerAC})`
      );
    }
  }

  private getMonsterAttackLabel(attack: MonsterAttack | undefined): string {
    if (!attack) return 'an attack';
    const type = (attack.type || '').trim();
    const description = (attack.description || '').trim();
    if (type && description) {
      return `${type} (${description})`;
    }
    if (type) {
      return type;
    }
    if (description) {
      return description;
    }
    return 'an attack';
  }

  private formatSpellFlavor(spell: PcTresherSpellData): string {
    const type = (spell.effectType || 'Other').trim() || 'Other';
    const color = (spell.effectColor || '').trim();
    if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) {
      return ` [${type} ${color.toUpperCase()}]`;
    }
    return ` [${type}]`;
  }

  private monsterTryFlee(
    monster: GameMonsterInstance,
    dungonId: number,
    playerRow: number,
    playerCol: number
  ): void {
    if (!this.moveMonsterAwayFromPlayer(monster, dungonId, playerRow, playerCol)) {
      monster.remainingAE = 0;
    }
  }

  /**
   * Moves the monster one step in the direction that most increases its distance from the
   * player (respecting movement/AE rules). Returns true if a step was taken, false if no
   * valid retreat direction exists (e.g. monster is cornered).
   */
  private moveMonsterAwayFromPlayer(
    monster: GameMonsterInstance,
    dungonId: number,
    playerRow: number,
    playerCol: number
  ): boolean {
    const directions = this.getShuffledDirections();
    let bestDir: { rowOffset: number; columnOffset: number } | null = null;
    let bestDist = this.chebyshevDistance(monster.row, monster.column, playerRow, playerCol);

    for (const dir of directions) {
      const nr = monster.row + dir.rowOffset;
      const nc = monster.column + dir.columnOffset;
      const dist = this.chebyshevDistance(nr, nc, playerRow, playerCol);
      if (dist > bestDist && this.canMonsterMoveTo(monster, dungonId, nr, nc)) {
        const isDiag = dir.rowOffset !== 0 && dir.columnOffset !== 0;
        if (isDiag && monster.remainingAE < 2) {
          continue;
        }
        bestDist = dist;
        bestDir = dir;
      }
    }

    if (!bestDir) {
      return false;
    }

    const isDiag = bestDir.rowOffset !== 0 && bestDir.columnOffset !== 0;
    this.consumeMonsterAE(monster, isDiag ? 2 : 1, dungonId);
    if (!monster.isDead) {
      monster.row += bestDir.rowOffset;
      monster.column += bestDir.columnOffset;
      this.playStepSound(0.1);
    }
    return true;
  }

  /**
   * A "pure" ranged attacker (e.g. archer) retreats toward its weapon's max range before
   * firing, rather than shooting from melee range. If it can't retreat any further (cornered),
   * it fires from its current position instead of idling.
   */
  private monsterKiteToRangedDistance(
    monster: GameMonsterInstance,
    template: Monster,
    dungonId: number,
    playerRow: number,
    playerCol: number
  ): void {
    if (this.moveMonsterAwayFromPlayer(monster, dungonId, playerRow, playerCol)) {
      return;
    }

    const distToPlayer = this.chebyshevDistance(monster.row, monster.column, playerRow, playerCol);
    if (this.monsterHasRangedAttackInRange(template, distToPlayer)) {
      this.monsterAttackPlayer(monster, template, dungonId, playerRow, playerCol);
    } else {
      monster.remainingAE = 0;
    }
  }

  /**
   * A spellcasting monster that has chosen to cast a ranged spell but is currently closer
   * to the player than that spell's max range retreats one step toward that max range
   * first, mirroring monsterKiteToRangedDistance for pure ranged-weapon attackers. If it
   * can't retreat any further (cornered), it casts from its current position instead of
   * idling.
   */
  private monsterKiteBeforeCastingSpell(
    monster: GameMonsterInstance,
    template: Monster,
    spellAttack: { attack: MonsterAttack; spell: PcTresherSpellData },
    dungonId: number,
    playerRow: number,
    playerCol: number
  ): void {
    if (this.moveMonsterAwayFromPlayer(monster, dungonId, playerRow, playerCol)) {
      return;
    }
    this.monsterCastSpellOnPlayer(monster, template, spellAttack, dungonId, playerRow, playerCol);
  }

  private monsterMoveToward(
    monster: GameMonsterInstance,
    dungonId: number,
    playerRow: number,
    playerCol: number
  ): void {
    const directions = this.getShuffledDirections();
    let bestDir: { rowOffset: number; columnOffset: number } | null = null;
    let bestDist = this.chebyshevDistance(monster.row, monster.column, playerRow, playerCol);

    for (const dir of directions) {
      const nr = monster.row + dir.rowOffset;
      const nc = monster.column + dir.columnOffset;
      const dist = this.chebyshevDistance(nr, nc, playerRow, playerCol);
      if (dist < bestDist && this.canMonsterMoveTo(monster, dungonId, nr, nc)) {
        const isDiag = dir.rowOffset !== 0 && dir.columnOffset !== 0;
        if (isDiag && monster.remainingAE < 2) {
          continue;
        }
        bestDist = dist;
        bestDir = dir;
      }
    }

    if (bestDir) {
      const isDiag = bestDir.rowOffset !== 0 && bestDir.columnOffset !== 0;
      this.consumeMonsterAE(monster, isDiag ? 2 : 1, dungonId);
      if (!monster.isDead) {
        monster.row += bestDir.rowOffset;
        monster.column += bestDir.columnOffset;
        this.playStepSound(0.12);
      }
    } else {
      monster.remainingAE = 0;
    }
  }

  private monsterMoveRandom(monster: GameMonsterInstance, dungonId: number): void {
    const directions = this.getShuffledDirections();
    for (const dir of directions) {
      const nr = monster.row + dir.rowOffset;
      const nc = monster.column + dir.columnOffset;
      if (this.canMonsterMoveTo(monster, dungonId, nr, nc)) {
        const isDiag = dir.rowOffset !== 0 && dir.columnOffset !== 0;
        if (isDiag && monster.remainingAE < 2) {
          continue;
        }
        this.consumeMonsterAE(monster, isDiag ? 2 : 1, dungonId);
        if (!monster.isDead) {
          monster.row = nr;
          monster.column = nc;
          this.playStepSound(0.12);
        }
        return;
      }
    }
    monster.remainingAE = 0;
  }

  private resolveReinforcementTemplate(template: Monster, monstersById: Map<number, Monster>): Monster | null {
    const preferredName = (template.reinforcementMonsterName ?? '').trim().toLowerCase();
    if (!preferredName) {
      return template;
    }

    for (const candidate of monstersById.values()) {
      if (candidate.name.trim().toLowerCase() === preferredName) {
        return candidate;
      }
    }

    return null;
  }

  private spawnConfiguredReinforcements(
    caller: GameMonsterInstance,
    callerTemplate: Monster,
    instances: GameMonsterInstance[],
    monstersById: Map<number, Monster>,
    dungonId: number
  ): number {
    const reinforcementTemplate = this.resolveReinforcementTemplate(callerTemplate, monstersById);
    if (!reinforcementTemplate) {
      return 0;
    }

    const requestedCount = Math.max(1, callerTemplate.reinforcementCount || 1);
    const spawnLimit = Math.min(requestedCount, 12);
    const candidates: Array<{ row: number; column: number }> = [];

    for (let ring = 1; ring <= 4; ring += 1) {
      for (let rowOffset = -ring; rowOffset <= ring; rowOffset += 1) {
        for (let colOffset = -ring; colOffset <= ring; colOffset += 1) {
          if (Math.max(Math.abs(rowOffset), Math.abs(colOffset)) !== ring) {
            continue;
          }
          const row = caller.row + rowOffset;
          const column = caller.column + colOffset;
          if (this.canSpawnMonsterAtSquare(dungonId, row, column, instances, candidates)) {
            candidates.push({ row, column });
          }
        }
      }
    }

    const shuffled = this.shuffleCoordinates(candidates);
    let spawned = 0;

    for (const target of shuffled) {
      if (spawned >= spawnLimit) {
        break;
      }

      instances.push({
        placementIndex: instances.length,
        monsterId: reinforcementTemplate.id,
        row: target.row,
        column: target.column,
        roam: false,
        currentHp: reinforcementTemplate.hp,
        currentMagic: reinforcementTemplate.magic,
        permanentStatModifiers: {},
        isDead: false,
        remainingAE: 0,
        attacksUsedThisTurn: 0,
        hasCastSpellThisTurn: false,
        dropTresherIds: [],
        dropKeyIds: [],
        dropItemIds: [],
        dropSpellIds: [],
        dropPotionIds: [],
        dropGold: 0,
        dropSilver: 0,
        dropCopper: 0,
        dropZinc: 0,
        activeEffects: [],
        isDormant: false,
        guardRow: null,
        guardColumn: null,
        isStationary: false,
        stationaryTriggerRow: null,
        stationaryTriggerCol: null,
        noAttackUnlessAttacked: reinforcementTemplate.npcOnlyAttackWhenAttacked,
        hasCalledReinforcements: true,
        dialogueEntries: [],
        dialoguePreventsAttack: false,
        hasGreeted: false,
        hasSharedInfo: false,
        isSpared: false,
        npcIsHostile: false,
      });

      spawned += 1;
    }

    return spawned;
  }

  private spawnDox(dungonId: number, playerRow: number, playerCol: number): void {
    // Don't stack — only one living Dox at a time
    if (this.monsterInstances().some(m => m.monsterId === -666 && !m.isDead)) {
      return;
    }

    // Find an adjacent open square to the player
    const instances = this.monsterInstances();
    const candidates: { row: number; column: number }[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = playerRow + dr;
        const c = playerCol + dc;
        if (this.canSpawnMonsterAtSquare(dungonId, r, c, instances, [])) {
          candidates.push({ row: r, column: c });
        }
      }
    }
    if (candidates.length === 0) return;

    const spawn = candidates[Math.floor(Math.random() * candidates.length)];
    const doxHp = Math.floor(Math.random() * 20) + 1 + 13; // 1d20 + 13 (14–33)

    const doxTemplate: Monster = {
      id: -666,
      imageId: null,
      soundId: null,
      tresherIds: [],
      keyIds: [],
      name: 'Dox',
      type: 'Aberration',
      description: 'A mind-devouring spirit summoned by magical rest.',
      hp: doxHp,
      movementEconomy: 1,
      ac: 12,
      runAt: 0,
      numberOfAttacks: 1,
      spReward: 0,
      magic: 0,
      magicResistance: 0,
      toHitPlusNeeded: 1,
      callsReinforcements: false,
      reinforcementCount: 0,
      reinforcementMonsterName: null,
      npcGreeting: null,
      npcInfo1: null,
      npcInfo2: null,
      npcInfo3: null,
      npcOnlyAttackWhenAttacked: false,
      npcGivesInfoAfterDamaged: false,
      npcAttacksAfterInfo: false,
      npcCanTrade: false,
      awareness: 10,
      attacks: [{
        type: 'Mind',
        description: 'Mind Drain',
        plusToHit: 2,
        damage: 3,
        range: 1,
        weaponItemId: null,
        spellId: null,
        curseId: null,
      }],
    };

    // Register template (replace any dead previous Dox template)
    this.monsterListByDungon.update((all) => {
      const existing = (all[dungonId] ?? []).some(m => m.id === -666);
      if (existing) {
        return {
          ...all,
          [dungonId]: (all[dungonId] ?? []).map(m => m.id === -666 ? { ...doxTemplate } : m),
        };
      }
      return {
        ...all,
        [dungonId]: [...(all[dungonId] ?? []), doxTemplate],
      };
    });

    const newInstance: GameMonsterInstance = {
      placementIndex: this.monsterInstances().length,
      monsterId: -666,
      row: spawn.row,
      column: spawn.column,
      roam: false,
      currentHp: doxHp,
      currentMagic: 0,
      permanentStatModifiers: {},
      isDead: false,
      remainingAE: 0,
      attacksUsedThisTurn: 0,
      hasCastSpellThisTurn: false,
      dropTresherIds: [],
      dropKeyIds: [],
      dropItemIds: [],
      dropSpellIds: [],
      dropPotionIds: [],
      dropGold: 0,
      dropSilver: 0,
      dropCopper: 0,
      dropZinc: 0,
      activeEffects: [],
      isDormant: false,
      guardRow: null,
      guardColumn: null,
      isStationary: false,
      stationaryTriggerRow: null,
      stationaryTriggerCol: null,
      noAttackUnlessAttacked: false,
      hasCalledReinforcements: false,
      dialogueEntries: [],
      dialoguePreventsAttack: false,
      hasGreeted: false,
      hasSharedInfo: false,
      isSpared: false,
      npcIsHostile: false,
    };

    this.monsterInstances.update(arr => [...arr, newInstance]);
    this.syncMonsterPlacementsFromInstances(dungonId);

    // Load Dox image into the monster image cache if not already present
    if (!this.monsterImageCache.has(-666)) {
      const img = new Image();
      img.onload = () => {
        this.monsterImageCache.set(-666, img);
        this.monsterImageCacheVersion.update(v => v + 1);
        this.drawPreviewGridCanvas();
        this.drawFirstPersonViewCanvas();
      };
      img.src = '/images/Doxs.png';
    }

    this.addCombatLog(`A Dox materialises next to you! (${doxHp} HP) [Requires magic weapon or spell to hit]`);
    this.drawPreviewGridCanvas();
  }

  private canSpawnMonsterAtSquare(
    dungonId: number,
    row: number,
    column: number,
    instances: GameMonsterInstance[],
    reserved: Array<{ row: number; column: number }>
  ): boolean {
    if (row < 0 || column < 0 || row >= this.gridRowCount || column >= this.gridColumnCount) {
      return false;
    }

    const filledSquares = this.filledSquaresByDungon()[dungonId] ?? {};
    if (!filledSquares[this.getSquareKey(row, column)]) {
      return false;
    }

    const preview = this.gridPreviewContext();
    if (preview && preview.centerRow === row && preview.centerColumn === column) {
      return false;
    }

    if (instances.some((monster) => !monster.isDead && monster.row === row && monster.column === column)) {
      return false;
    }

    if (reserved.some((spot) => spot.row === row && spot.column === column)) {
      return false;
    }

    return true;
  }

  private shuffleCoordinates<T>(values: T[]): T[] {
    const shuffled = [...values];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  }

  private canMonsterMoveTo(
    monster: GameMonsterInstance,
    dungonId: number,
    targetRow: number,
    targetCol: number
  ): boolean {
    if (targetRow < 0 || targetCol < 0 || targetRow >= this.gridRowCount || targetCol >= this.gridColumnCount) {
      return false;
    }

    const filledSquares = this.filledSquaresByDungon()[dungonId] ?? {};
    if (!filledSquares[this.getSquareKey(targetRow, targetCol)]) {
      return false;
    }

    const rowOffset = targetRow - monster.row;
    const colOffset = targetCol - monster.column;
    const isCardinal = Math.abs(rowOffset) + Math.abs(colOffset) === 1;
    const isDiag = Math.abs(rowOffset) === 1 && Math.abs(colOffset) === 1;

    if (!isCardinal && !isDiag) {
      return false;
    }

    if (isCardinal) {
      if (this.isMovementBlockedBetweenAdjacentSquares(dungonId, monster.row, monster.column, targetRow, targetCol)) {
        return false;
      }
    } else if (isDiag) {
      if (this.isDiagonalMovementBlocked(dungonId, monster.row, monster.column, rowOffset, colOffset)) {
        return false;
      }
    }

    const preview = this.gridPreviewContext();
    if (preview && targetRow === preview.centerRow && targetCol === preview.centerColumn) {
      return false;
    }

    const otherMonster = this.monsterInstances().some(
      (m) => m !== monster && !m.isDead && m.row === targetRow && m.column === targetCol
    );
    if (otherMonster) {
      return false;
    }

    return true;
  }

  private isMonsterWithinRangeOfPlayer(
    monster: GameMonsterInstance,
    playerRow: number,
    playerCol: number,
    range: number,
    dungonId: number
  ): boolean {
    const dist = this.chebyshevDistance(monster.row, monster.column, playerRow, playerCol);
    if (dist > range) {
      return false;
    }

    const directions = this.getShuffledDirections();
    const currentDist = dist;
    for (const dir of directions) {
      const nr = monster.row + dir.rowOffset;
      const nc = monster.column + dir.columnOffset;
      const moveDist = this.chebyshevDistance(nr, nc, playerRow, playerCol);
      if (moveDist < currentDist && this.canMonsterMoveTo(monster, dungonId, nr, nc)) {
        return true;
      }
    }

    return this.isAdjacentTo(monster.row, monster.column, playerRow, playerCol);
  }

  private chebyshevDistance(r1: number, c1: number, r2: number, c2: number): number {
    return Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2));
  }

  private getShuffledDirections(): { rowOffset: number; columnOffset: number }[] {
    const dirs = [
      { rowOffset: -1, columnOffset: 0 },
      { rowOffset: 1, columnOffset: 0 },
      { rowOffset: 0, columnOffset: -1 },
      { rowOffset: 0, columnOffset: 1 },
      { rowOffset: -1, columnOffset: -1 },
      { rowOffset: -1, columnOffset: 1 },
      { rowOffset: 1, columnOffset: -1 },
      { rowOffset: 1, columnOffset: 1 },
    ];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    return dirs;
  }

  private syncMonsterPlacementsFromInstances(dungonId: number): void {
    const instances = this.monsterInstances();
    const updatedPlacements: MonsterPlacement[] = instances.map((inst) => ({
      monsterId: inst.monsterId,
      row: inst.row,
      column: inst.column,
      roam: inst.roam,
      currentMagic: inst.currentMagic,
      ...(Object.keys(inst.permanentStatModifiers).length > 0 ? { permanentStatModifiers: { ...inst.permanentStatModifiers } } : {}),
    }));

    this.monsterPlacementsByDungon.update((all) => ({
      ...all,
      [dungonId]: updatedPlacements,
    }));
  }

  private endMonsterTurns(): void {
    const preview = this.gridPreviewContext();
    if (preview) {
      this.syncMonsterPlacementsFromInstances(preview.dungonId);
    }

    this.resetMonsterAE();
    this.drawPreviewGridCanvas();

    if (this.turnPhase() !== 'gameover') {
      if (this.isFighterClass()) {
        if (this.playerAttacksThisTurn() === 0 && !this.playerWasHitThisRound()) {
          const rounds = this.playerRoundsSinceLastAction() + 1;
          if (rounds >= 3) {
            this.playerMaxHp.update((hp) => hp + 1);
            this.playerHp.update((hp) => hp + 1);
            this.playerRoundsSinceLastAction.set(0);
            this.addCombatLog('Toughening: +1 max HP from a peaceful round.');
          } else {
            this.playerRoundsSinceLastAction.set(rounds);
          }
        } else {
          this.playerRoundsSinceLastAction.set(0);
        }
      }
      this.playerWasHitThisRound.set(false);
      this.playerDefendStacks.set(0);
      this.playerBoostAttackACPenalty.set(0);
      this.playerAE.set(this.getEffectivePlayerMaxAE());
      this.playerAttacksThisTurn.set(0);
      this.playerDefendsThisTurn.set(0);
      this.playerSearchesThisTurn.set(0);
      this.healerFreeHealUsedThisRound.set(false);
      this.playerSneekRoundsRemaining.update(n => Math.max(0, n - 1));
      this.playerSneekUsedThisRound.set(false);
      if (this.playerSneekRoundsRemaining() === 0) this.playerSneekStable.set(false);
      this.turnPhase.set('player');
      this.addCombatLog('Your turn. AE: ' + this.getEffectivePlayerMaxAE());
    }

    this.saveGameState();
  }

  private resetMonsterAE(): void {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return;
    }
    const monstersById = this.getMonstersByIdForDungon(preview.dungonId);
    const instances = this.monsterInstances();
    for (const monster of instances) {
      if (monster.isDead) {
        monster.remainingAE = 0;
        monster.attacksUsedThisTurn = 0;
        monster.hasCastSpellThisTurn = false;
        continue;
      }
      const template = monstersById.get(monster.monsterId);
      monster.remainingAE = template ? Math.max(0, this.getEffectiveMonsterStamina(monster, template) + this.getEffectiveMonsterNumberOfAttacks(monster, template)) : 0;
      monster.attacksUsedThisTurn = 0;
      monster.hasCastSpellThisTurn = false;
    }
    this.monsterInstances.update((arr) => [...arr]);
  }

  private saveGameState(): void {
    const gameId = this.currentGameId();
    const preview = this.gridPreviewContext();
    const userKey = this.account.getKey();
    if (!gameId || !preview || !userKey) return;

    // Always update the pending payload to the latest state snapshot
    this.pendingSavePayload = { gameId, dungonId: preview.dungonId, userKey };

    // If already saving, just leave the pending payload — it will be sent when the current one finishes
    if (this.isSaveInFlight) return;

    this.flushSave();
  }

  private flushSave(retryPayload?: { gameId: number; dungonId: number; userKey: string; dungenJson: Record<string, unknown> }): void {
    // If caller passed an explicit retry payload, use it; otherwise consume the pending queue
    let payload: { gameId: number; userKey: string; dungenJson: Record<string, unknown> };
    if (retryPayload) {
      payload = retryPayload;
    } else {
      const pending = this.pendingSavePayload;
      if (!pending) return;
      this.pendingSavePayload = null;
      payload = { gameId: pending.gameId, userKey: pending.userKey, dungenJson: this.buildDungenJsonForSave(pending.dungonId) };
    }

    this.isSaveInFlight = true;
    this.saveStatus.set('saving');
    if (this.saveStatusTimer !== null) { clearTimeout(this.saveStatusTimer); this.saveStatusTimer = null; }

    this.http
      .put(`${API_BASE_URL}/games/${payload.gameId}/save`, { userkey: payload.userKey, dungenJson: payload.dungenJson })
      .subscribe({
        next: () => {
          this.isSaveInFlight = false;
          this.saveStatus.set('saved');
          this.saveStatusTimer = setTimeout(() => this.saveStatus.set(null), 3000);
          // If another save was queued while we were in-flight, send it now
          if (this.pendingSavePayload) this.flushSave();
        },
        error: () => {
          // Retry once with the same serialized snapshot (the DB still has the last good state)
          this.addCombatLog('[Warning] Save failed — retrying...');
          setTimeout(() => {
            this.http
              .put(`${API_BASE_URL}/games/${payload.gameId}/save`, { userkey: payload.userKey, dungenJson: payload.dungenJson })
              .subscribe({
                next: () => {
                  this.isSaveInFlight = false;
                  this.saveStatus.set('saved');
                  this.saveStatusTimer = setTimeout(() => this.saveStatus.set(null), 3000);
                  if (this.pendingSavePayload) this.flushSave();
                },
                error: () => {
                  // Both attempts failed — DB is out of sync with UI
                  this.isSaveInFlight = false;
                  this.saveStatus.set('lost');
                  this.addCombatLog('[ERROR] Progress could not be saved. Reload the page to restore from last save.');
                },
              });
          }, 2500);
        },
      });
  }

  private buildDungenJsonForSave(dungonId: number): Record<string, unknown> {
    const preview = this.gridPreviewContext();
    const instances = this.monsterInstances();
    const monstersById = this.getMonstersByIdForDungon(dungonId);

    const monsterList = (this.monsterListByDungon()[dungonId] ?? []).map((template) => {
      const liveInstance = instances.find((m) => m.monsterId === template.id);
      return {
        ...template,
        hp: liveInstance ? liveInstance.currentHp : template.hp,
      };
    });

    const monsterPlacements = instances.map((inst) => ({
      monsterId: inst.monsterId,
      row: inst.row,
      column: inst.column,
      roam: inst.roam,
      isDead: inst.isDead,
      currentHp: inst.currentHp,
      currentMagic: inst.currentMagic,
      ...(Object.keys(inst.permanentStatModifiers).length > 0 ? { permanentStatModifiers: { ...inst.permanentStatModifiers } } : {}),
      ...(inst.dropTresherIds.length > 0 ? { tresherIds: inst.dropTresherIds } : {}),
      ...(inst.dropKeyIds.length > 0 ? { keyIds: inst.dropKeyIds } : {}),
      ...(inst.dropItemIds.length > 0 ? { itemIds: inst.dropItemIds } : {}),
      ...(inst.dropSpellIds.length > 0 ? { spellIds: inst.dropSpellIds } : {}),
      ...(inst.dropPotionIds.length > 0 ? { potionIds: inst.dropPotionIds } : {}),
    }));

    return {
      filledSquares: this.filledSquaresByDungon()[dungonId] ?? {},
      squares: this.squaresByDungon()[dungonId] ?? {},
      keyList: this.keyList,
      cheater: this.cheaterByDungon()[dungonId] ?? DEFAULT_CHEATER,
      cheaterByPcId: (() => {
        if (!this.isMainGame()) return {};
        const pcId = this.currentPcId_();
        if (pcId === null) return this.cheaterByPcId_();
        return { ...this.cheaterByPcId_(), [pcId]: this.cheaterByDungon()[dungonId] ?? DEFAULT_CHEATER };
      })(),
      pcInventoryInitialized: this.pcInventoryInitializedByDungon()[dungonId] ?? false,
      startpoint: this.startPointByDungon()[dungonId] ?? null,
      tresherList: this.tresherListByDungon()[dungonId] ?? [],
      tresherPlacements: this.tresherPlacementsByDungon()[dungonId] ?? [],
      monsterList,
      monsterPlacements,
      squareTexts: this.squareTextsByDungon()[dungonId] ?? [],
      floorTrapPlacements: this.floorTrapPlacementsByDungon()[dungonId] ?? [],
      obstaclePlacements: this.obstaclePlacementsByDungon()[dungonId] ?? [],
      playerHp: this.playerHp(),
      playerAE: this.playerAE(),
      turnPhase: this.turnPhase(),
      playerRow: preview?.centerRow ?? 0,
      playerColumn: preview?.centerColumn ?? 0,
      npcTradesPurchased: this.npcTradesPurchased(),
      itemPlacements: this.floorItemPlacementsByDungon()[dungonId] ?? [],
      potionPlacements: this.floorPotionPlacementsByDungon()[dungonId] ?? [],
      spellPlacements: this.floorSpellPlacementsByDungon()[dungonId] ?? [],
      floorItemList: this.floorItemListByDungon()[dungonId] ?? [],
      floorPotionList: this.floorPotionListByDungon()[dungonId] ?? [],
      floorSpellList: this.floorSpellListByDungon()[dungonId] ?? [],
      collectedFloorItems: this.collectedFloorItemsByDungon()[dungonId] ?? [],
      collectedFloorPotions: this.collectedFloorPotionsByDungon()[dungonId] ?? [],
      collectedFloorSpells: this.collectedFloorSpellsByDungon()[dungonId] ?? [],
      learnedFloorSpellIds: this.learnedFloorSpellIdsByDungon()[dungonId] ?? [],
      equippedSpellIds: this.equippedSpellIdsByDungon()[dungonId] ?? [],
      rangerRangedHitBonus: this.rangerRangedHitBonus(),
      rangerFavoredTypeDamageBonuses: this.rangerFavoredTypeDamageBonuses(),
    };
  }

  private normalizeMonsterTypeLabel(value: string | null | undefined): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private normalizeMonsterTypeKey(value: string | null | undefined): string {
    return this.normalizeMonsterTypeLabel(value).toLowerCase();
  }

  private getSquareDistance(fromRow: number, fromColumn: number, toRow: number, toColumn: number): number {
    return Math.max(Math.abs(toRow - fromRow), Math.abs(toColumn - fromColumn));
  }

  private getRangerRangedHitBonusAtDistance(distance: number): number {
    if (!this.isRangerClass() || distance < 2) {
      return 0;
    }
    return Math.max(0, this.rangerRangedHitBonus());
  }

  private getRangerFavoredTypeDamageBonus(template: Monster | null): number {
    if (!this.isRangerClass() || !template) {
      return 0;
    }

    const monsterType = this.normalizeMonsterTypeKey(template.type);
    for (const [favoredType, bonus] of Object.entries(this.rangerFavoredTypeDamageBonuses())) {
      const favoredKey = this.normalizeMonsterTypeKey(favoredType);
      if (favoredKey && (monsterType === favoredKey || monsterType.includes(favoredKey))) {
        return Math.max(0, bonus);
      }
    }
    return 0;
  }

  private getRangedImpactProjectile(weaponName: string, attackDistance: number): MonsterImpactProjectile | null {
    if (attackDistance < 2) {
      return null;
    }
    const normalizedWeaponName = weaponName.trim().toLowerCase();
    if (normalizedWeaponName.includes('crossbow')) {
      return 'knife';
    }
    if (normalizedWeaponName.includes('bow')) {
      return 'arrow';
    }
    return null;
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

const SIDE_RULES: SideRule[] = [
  {
    side: 'toTop',
    wallKey: 'wallTop',
    doorKey: 'doorTop',
    neighborRowOffset: -1,
    neighborColumnOffset: 0,
    oppositeSide: 'toBottom',
  },
  {
    side: 'toRight',
    wallKey: 'wallRight',
    doorKey: 'doorRight',
    neighborRowOffset: 0,
    neighborColumnOffset: 1,
    oppositeSide: 'toLeft',
  },
  {
    side: 'toBottom',
    wallKey: 'wallBottom',
    doorKey: 'doorBottom',
    neighborRowOffset: 1,
    neighborColumnOffset: 0,
    oppositeSide: 'toTop',
  },
  {
    side: 'toLeft',
    wallKey: 'wallLeft',
    doorKey: 'doorLeft',
    neighborRowOffset: 0,
    neighborColumnOffset: -1,
    oppositeSide: 'toRight',
  },
];

