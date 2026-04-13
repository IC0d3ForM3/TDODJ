import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { Account } from '../../services/account';
import { DungeonFirstPersonComponent } from '../dungeon-first-person/dungeon-first-person';
import { DungeonPreviewGridComponent } from '../dungeon-preview-grid/dungeon-preview-grid';
import { CreatorLayout } from '../../services/creator-layout';
import { Items } from '../items/items';
import { Curses } from '../curses/curses';
import { Potions } from '../potions/potions';
import { Treshers } from '../treshers/treshers';
import { Monsters } from '../monsters/monsters';
import { UploadPopup, UploadedMediaItem } from '../upload-popup/upload-popup';
import { ItemService } from '../../services/item';
import { CurseService } from '../../services/curse';
import { PotionService } from '../../services/potion';
import { Door } from '../../interfaces/door';
import { Square } from '../../interfaces/square';
import { Wall } from '../../interfaces/wall';
import { Key } from '../../interfaces/key';
import { API_BASE_URL } from '../../api-config';
import {
  AdjacentConnectionInfo,
  Cheater,
  CheaterInventory,
  CreateDungonForm,
  DungonExit,
  DoorPromptResult,
  DungonDetails,
  DungonJsonPayload,
  DungonListItem,
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
  OpenBlockOption,
  OpenBlockOptionKey,
  PathBlockType,
  NearbyDiscoveryItem,
  PendingMonsterPlacement,
  PendingDoorPlacement,
  PendingExitPlacement,
  PendingStartPointPlacement,
  PendingTresherPlacement,
  SideRule,
  SquareSide,
  SquareText,
  normalizeSquareTextWallSide,
  StartPoint,
  Tresher,
  TresherPlacement,
  Trap,
  FloorTrapPlacement,
  PortalPlacement,
  PortalLook,
} from '../../interfaces/game';

const EMPTY_OPEN_BLOCK_SELECTIONS: Record<OpenBlockOptionKey, boolean> = {
  wallTop: false,
  wallBottom: false,
  wallLeft: false,
  wallRight: false,
  doorTop: false,
  doorBottom: false,
  doorLeft: false,
  doorRight: false,
};

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

interface TresherLibraryItem extends Tresher {
  userguid: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MonsterLibraryItem extends Monster {
  userguid: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

interface LibImageItem { id: number; name: string; path: string; isPublic: boolean; isActive: boolean; createdAt: string; updatedAt: string; userguid: string; }
interface LibSoundItem { id: number; name: string; path: string; isPublic: boolean; isActive: boolean; createdAt: string; updatedAt: string; userguid: string; }
interface LibSpellItem { id: number; name: string; description: string; range: number; effectOn: string; effectOn2: string; lastFor: number; effectAmount: number; effectAmount2: number; value: number; sp: number; successTestValue: number; magicCost: number; imageId: number | null; soundId: number | null; isPublic: boolean; createdAt: string; updatedAt: string; }
interface LibImageWritePayload { path: string; isPublic: boolean; isActive: boolean; name: string; }
interface LibSoundWritePayload { path: string; isPublic: boolean; isActive: boolean; name: string; }
interface LibSpellWritePayload { name: string; description: string; range: number; effectOn: string; effectOn2: string; lastFor: number; effectAmount: number; effectAmount2: number; value: number; sp: number; successTestValue: number; magicCost: number; imageId: number | null; soundId: number | null; isPublic: boolean; }

type CreatorTabId = 'dungons' | 'treshers' | 'monsters' | 'images' | 'sounds' | 'spells' | 'potions' | 'items' | 'curses';

interface GridPlacedItem {
  key: string;
  type: 'monster' | 'tresher' | 'door' | 'trap';
  label: string;
  row: number;
  column: number;
  refId: number;
}

type PublishVisibility = 'public' | 'friends' | 'private';

interface CreatorFriendListItem {
  id: number;
  userurid: string;
  friendurid: string;
  isActiveFriend: boolean;
  friendEmail: string;
}

@Component({
  selector: 'app-creator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DungeonFirstPersonComponent, DungeonPreviewGridComponent, Items, Curses, Potions, Treshers, Monsters, UploadPopup],
  templateUrl: './creator.html',
  styleUrl: './creator.css',
})
export class Creator implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly doorImageCache = new Map<string, HTMLImageElement>();
  private readonly stairsUpImageCache = new Map<string, HTMLImageElement>();
  private readonly stairsUpSquareAssignment = new Map<string, 1 | 2 | 3>();
  readonly account = inject(Account);
  readonly creatorLayout = inject(CreatorLayout);
  private readonly itemService = inject(ItemService);
  private readonly curseService = inject(CurseService);
  private readonly potionService = inject(PotionService);
  private nextWallId = 0;
  private nextDoorId = 0;
  private nextKeyId = 0;
  private nextTresherId = 0;
  private nextMonsterId = 0;
  private nextExitId = 0;
  private nextSquareTextId = 0;

  private gridCanvasRef: ElementRef<HTMLCanvasElement> | null = null;
  private previewGridCanvasRef: ElementRef<HTMLCanvasElement> | null = null;
  private firstPersonCanvasRef: ElementRef<HTMLCanvasElement> | null = null;

  @ViewChild('dungonGridCanvas')
  set dungonGridCanvas(value: ElementRef<HTMLCanvasElement> | undefined) {
    this.gridCanvasRef = value ?? null;
    this.drawGridCanvas();
  }

  readonly isSidebarCollapsed = signal(false);
  readonly previewShowMonsters = signal(true);
  readonly isCreateFormVisible = signal(false);
  readonly isSaving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly isLoadingDungons = signal(false);
  readonly isLoadingSelectedDungon = signal(false);
  readonly isSelectedDungonExpanded = signal(false);
  readonly isMoveMode = signal(false);
  readonly hasUnsavedDungonJson = signal(false);
  readonly isSavingDungonJson = signal(false);
  readonly isPublishingDungon = signal(false);
  readonly isPublishDialogVisible = signal(false);
  readonly savedPublishUpdatesByDungon = signal<Record<number, boolean>>({});
  readonly publishVisibility = signal<PublishVisibility>('public');
  readonly publishFriendUserKeys = signal<string[]>([]);
  readonly isLoadingPublishFriends = signal(false);
  readonly publishFriendsError = signal<string | null>(null);
  readonly publishFriends = signal<CreatorFriendListItem[]>([]);
  readonly isDoorDialogVisible = signal(false);
  readonly isKaysDialogVisible = signal(false);
  readonly isWhiteSpacePreviewPickMode = signal(false);
  readonly isGridPreviewModalVisible = signal(false);
  readonly isStartPointMode = signal(false);
  readonly isExitMode = signal(false);
  readonly isPlaceTresherMode = signal(false);
  readonly isPlaceMonsterMode = signal(false);
  readonly isAddTextMode = signal(false);
  readonly isTextDialogVisible = signal(false);
  readonly pendingTextRow = signal<number | null>(null);
  readonly pendingTextColumn = signal<number | null>(null);
  readonly textDialogInput = signal('');
  readonly textDialogWallSide = signal<SquareSide | null>(null);
  readonly editingSquareTextId = signal<number | null>(null);
  readonly isStartPointDialogVisible = signal(false);
  readonly isExitDialogVisible = signal(false);
  readonly isTresherDialogVisible = signal(false);
  readonly isMonsterDialogVisible = signal(false);
  readonly isPlaceTresherDialogVisible = signal(false);
  readonly isPlaceMonsterDialogVisible = signal(false);
  readonly isLoadingTresherLibrary = signal(false);
  readonly isLoadingMonsterLibrary = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly tresherLibraryError = signal<string | null>(null);
  readonly monsterLibraryError = signal<string | null>(null);
  readonly selectedDungonError = signal<string | null>(null);
  readonly dungonJsonSaveError = signal<string | null>(null);
  readonly publishDungonError = signal<string | null>(null);
  readonly doorDialogError = signal<string | null>(null);
  readonly exitDialogError = signal<string | null>(null);
  readonly previewActionMessage = signal<string | null>(null);
  readonly selectedDungonId = signal<number | null>(null);
  readonly selectedKeyIdForPlacement = signal<number | null>(null);
  readonly selectedDungon = signal<DungonDetails | null>(null);
  readonly pendingDoorPlacement = signal<PendingDoorPlacement | null>(null);
  readonly pendingStartPointPlacement = signal<PendingStartPointPlacement | null>(null);
  readonly pendingExitPlacement = signal<PendingExitPlacement | null>(null);
  readonly pendingTresherPlacement = signal<PendingTresherPlacement | null>(null);
  readonly pendingMonsterPlacement = signal<PendingMonsterPlacement | null>(null);
  readonly editingMonsterId = signal<number | null>(null);
  readonly editingMonsterKeyIds = signal<number[]>([]);
  readonly editingMonsterImageId = signal<number | null>(null);
  readonly editingMonsterSoundId = signal<number | null>(null);
  readonly editingMonsterTresherIds = signal<number[]>([]);
  readonly editingMonsterAttacks = signal<MonsterAttack[]>([]);
  readonly monsterDialogImages = signal<{ id: number; name: string; path: string }[]>([]);
  readonly monsterDialogSounds = signal<{ id: number; name: string; path: string }[]>([]);
  readonly monsterDialogWeaponItems = signal<{ id: number; name: string }[]>([]);
  readonly monsterDialogSpells = signal<{ id: number; name: string }[]>([]);
  readonly placeMonsterRoam = signal(false);
  readonly placeMonsterDropTresherIds = signal<number[]>([]);
  readonly placeMonsterDropKeyIds = signal<number[]>([]);
  readonly placeMonsterIsDormant = signal(false);
  readonly placeMonsterGuardRow = signal<number | null>(null);
  readonly placeMonsterGuardCol = signal<number | null>(null);
  readonly isSelectingGuardSquare = signal(false);
  readonly gridPreviewContext = signal<GridPreviewContext | null>(null);
  readonly cheaterByDungon = signal<Record<number, Cheater>>({});
  readonly startPointByDungon = signal<Record<number, StartPoint | null>>({});
  readonly exitsByDungon = signal<Record<number, DungonExit[]>>({});
  readonly tresherListByDungon = signal<Record<number, Tresher[]>>({});
  readonly tresherLibrary = signal<TresherLibraryItem[]>([]);
  readonly tresherPlacementsByDungon = signal<Record<number, TresherPlacement[]>>({});
  readonly monsterListByDungon = signal<Record<number, Monster[]>>({});
  readonly monsterLibrary = signal<MonsterLibraryItem[]>([]);
  readonly monsterPlacementsByDungon = signal<Record<number, MonsterPlacement[]>>({});
  readonly squareTextsByDungon = signal<Record<number, SquareText[]>>({});
  readonly filledSquaresByDungon = signal<Record<number, Record<string, true>>>({});
  readonly squaresByDungon = signal<Record<number, Record<string, Square>>>({});
  readonly floorTrapPlacementsByDungon = signal<Record<number, FloorTrapPlacement[]>>({});
  readonly isPlaceFloorTrapMode = signal(false);
  readonly isFloorTrapDialogVisible = signal(false);
  readonly pendingFloorTrapPlacement = signal<{ dungonId: number; row: number; column: number } | null>(null);
  private nextFloorTrapId = 1;
  readonly selectedPlacedItemKey = signal<string | null>(null);

  readonly portalPlacementsByDungon = signal<Record<number, PortalPlacement[]>>({});
  readonly isPortalDialogVisible = signal(false);
  readonly editingPortalId = signal<number | null>(null);
  readonly selectedPortalId = signal<number | null>(null);
  readonly portalPickMode = signal<'start' | 'end' | null>(null);
  readonly portalPickingId = signal<number | null>(null);
  private nextPortalId = 1;

  // ── Library tabs ──────────────────────────────────────────────────────────
  readonly activeCreatorTab = signal<CreatorTabId>('dungons');
  readonly creatorTabs: { id: CreatorTabId; label: string }[] = [
    { id: 'dungons', label: 'Dungeons' },
    { id: 'treshers', label: 'Treshers' },
    { id: 'monsters', label: 'Monsters' },
    { id: 'images', label: 'Images' },
    { id: 'sounds', label: 'Sounds' },
    { id: 'spells', label: 'Spells' },
    { id: 'potions', label: 'Potions' },
    { id: 'items', label: 'Items' },
    { id: 'curses', label: 'Curses' },
  ];

  readonly libItems = this.itemService.items;
  readonly libCurses = this.curseService.items;
  readonly libPotions = this.potionService.items;
  readonly libSpells = signal<{ id: number; name: string }[]>([]);

  readonly libImageOptions = signal<{ id: number; name: string; path: string }[]>([]);
  readonly libSoundOptions = signal<{ id: number; name: string; path: string }[]>([]);

  readonly libUserImages = signal<LibImageItem[]>([]);
  readonly isLoadingLibImages = signal(false);
  readonly libImagesError = signal<string | null>(null);
  readonly isSavingLibImage = signal(false);
  readonly editingLibImageId = signal<number | null>(null);
  readonly libImageSaveMessage = signal<string | null>(null);
  readonly isLibImageSectionVisible = signal(true);
  readonly selectedLibImageFile = signal<File | null>(null);

  readonly libUserSounds = signal<LibSoundItem[]>([]);
  readonly isLoadingLibSounds = signal(false);
  readonly libSoundsError = signal<string | null>(null);
  readonly isSavingLibSound = signal(false);
  readonly editingLibSoundId = signal<number | null>(null);
  readonly libSoundSaveMessage = signal<string | null>(null);
  readonly isLibSoundSectionVisible = signal(true);
  readonly selectedLibSoundFile = signal<File | null>(null);

  readonly libUserSpells = signal<LibSpellItem[]>([]);
  readonly isLoadingLibSpells = signal(false);
  readonly libSpellsError = signal<string | null>(null);
  readonly isSavingLibSpell = signal(false);
  readonly editingLibSpellId = signal<number | null>(null);
  readonly libSpellSaveMessage = signal<string | null>(null);
  readonly isLibSpellSectionVisible = signal(true);

  readonly libSpellEffectToOptions = [
    'HP', 'Defense', 'Stamina', 'Mind', 'Sneak', 'Magic', 'Sight', 'Action Economy',
  ] as const;

  readonly libImageForm = new FormGroup({
    path: new FormControl<string>('', { nonNullable: true }),
    isPublic: new FormControl<boolean>(false, { nonNullable: true }),
    isActive: new FormControl<boolean>(true, { nonNullable: true }),
    name: new FormControl<string>('', { nonNullable: true }),
  });

  readonly libSoundForm = new FormGroup({
    path: new FormControl<string>('', { nonNullable: true }),
    isPublic: new FormControl<boolean>(false, { nonNullable: true }),
    isActive: new FormControl<boolean>(true, { nonNullable: true }),
    name: new FormControl<string>('', { nonNullable: true }),
  });

  readonly libSpellForm = new FormGroup({
    name: new FormControl<string>('', { nonNullable: true }),
    description: new FormControl<string>('', { nonNullable: true }),
    range: new FormControl<number>(0, { nonNullable: true }),
    effectOn: new FormControl<string>('HP', { nonNullable: true }),
    effectOn2: new FormControl<string>('', { nonNullable: true }),
    lastFor: new FormControl<number>(0, { nonNullable: true }),
    effectAmount: new FormControl<number>(0, { nonNullable: true }),
    effectAmount2: new FormControl<number>(0, { nonNullable: true }),
    value: new FormControl<number>(0, { nonNullable: true }),
    sp: new FormControl<number>(0, { nonNullable: true }),
    successTestValue: new FormControl<number>(0, { nonNullable: true }),
    magicCost: new FormControl<number>(1, { nonNullable: true }),
    imageId: new FormControl<number | null>(null),
    soundId: new FormControl<number | null>(null),
    isPublic: new FormControl<boolean>(false, { nonNullable: true }),
  });
  readonly openBlockOptions: OpenBlockOption[] = [
     { key: 'wallTop', label: 'Wall T' },
     { key: 'wallBottom', label: 'Wall B' },
     { key: 'wallLeft', label: 'Wall L' },
     { key: 'wallRight', label: 'Wall R' },
     { key: 'doorTop', label: 'Door T' },
     { key: 'doorBottom', label: 'Door B' },
     { key: 'doorLeft', label: 'Door L' },
     { key: 'doorRight', label: 'Door R' },
  ];
  readonly openBlockSelections = signal<Record<OpenBlockOptionKey, boolean>>({
    ...EMPTY_OPEN_BLOCK_SELECTIONS,
  });
  readonly gridCellSize = 20;
  readonly gridColumnCount = 45;
  readonly gridRowCount = 50;
  readonly gridCanvasWidth = this.gridCellSize * this.gridColumnCount;
  readonly gridCanvasHeight = this.gridCellSize * this.gridRowCount;
  readonly previewGridCellSize = 18;
  readonly previewGridDimension = 10;
  readonly previewGridCanvasWidth = this.previewGridCellSize * this.previewGridDimension;
  readonly previewGridCanvasHeight = this.previewGridCellSize * this.previewGridDimension;
  readonly firstPersonCanvasWidth = 330;
  readonly firstPersonCanvasHeight = 220;
  readonly firstPersonMaxDepth = 8;
  readonly dungons = signal<DungonListItem[]>([]);
  readonly createDungonForm = new FormGroup<CreateDungonForm>({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    description: new FormControl('', { nonNullable: true }),
    intro: new FormControl('', { nonNullable: true }),
    minsplifetime: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    maxsplifetime: new FormControl(1000000, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    spreward: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.min(0)],
    }),
    ismaingame: new FormControl<boolean>(false, { nonNullable: true }),
    issample: new FormControl<boolean>(false, { nonNullable: true }),
  });

  readonly isEditMetadataFormVisible = signal(false);
  readonly isSavingMetadata = signal(false);
  readonly metadataSaveError = signal<string | null>(null);

  readonly editMetadataForm = new FormGroup<CreateDungonForm>({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    description: new FormControl('', { nonNullable: true }),
    intro: new FormControl('', { nonNullable: true }),
    minsplifetime: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    maxsplifetime: new FormControl(1000000, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    spreward: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.min(0)],
    }),
    ismaingame: new FormControl<boolean>(false, { nonNullable: true }),
    issample: new FormControl<boolean>(false, { nonNullable: true }),
  });

  readonly doorForm = new FormGroup({
    state: new FormControl<'open' | 'closed'>('closed', { nonNullable: true }),
    hp: new FormControl<number>(10, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)],
    }),
    isLocked: new FormControl<boolean>(false, { nonNullable: true }),
    toPick: new FormControl<number | null>(null, {
      validators: [Validators.min(0)],
    }),
    isHidden: new FormControl<boolean>(false, { nonNullable: true }),
    toFind: new FormControl<number>(3, {
      nonNullable: true,
      validators: [Validators.min(1), Validators.max(6)],
    }),
    name: new FormControl<string>('', { nonNullable: true }),
    description: new FormControl<string>('', { nonNullable: true }),
    spReward: new FormControl<number | null>(null, {
      validators: [Validators.min(0)],
    }),
    hasTrap: new FormControl<boolean>(false, { nonNullable: true }),
    trapName: new FormControl<string>('', { nonNullable: true }),
    trapDescription: new FormControl<string>('', { nonNullable: true }),
    trapDamage: new FormControl<number>(0, { nonNullable: true }),
    trapDamageTo: new FormControl<'HP' | 'Stamina' | 'Mind'>('HP', { nonNullable: true }),
    trapCurseId: new FormControl<number | null>(null),
    trapToDetect: new FormControl<number>(10, { nonNullable: true }),
    trapToDisarm: new FormControl<number>(10, { nonNullable: true }),
  });

  readonly startPointForm = new FormGroup({
    description: new FormControl<string>('', { nonNullable: true }),
    playerSees: new FormControl<string>('', { nonNullable: true }),
  });

  readonly exitForm = new FormGroup({
    destinationType: new FormControl<ExitDestinationType>('outside', { nonNullable: true }),
    destinationDungonId: new FormControl<number | null>(null),
    transitionType: new FormControl<ExitTransitionType>('open', { nonNullable: true }),
  });

  readonly tresherForm = new FormGroup({
    name: new FormControl<string>('', { nonNullable: true }),
    description: new FormControl<string>('', { nonNullable: true }),
    gold: new FormControl<number>(0, { nonNullable: true }),
    silver: new FormControl<number>(0, { nonNullable: true }),
    copper: new FormControl<number>(0, { nonNullable: true }),
    zinc: new FormControl<number>(0, { nonNullable: true }),
    item1Id: new FormControl<number | null>(null),
    item2Id: new FormControl<number | null>(null),
    item3Id: new FormControl<number | null>(null),
    item4Id: new FormControl<number | null>(null),
    spell1Id: new FormControl<number | null>(null),
    spell2Id: new FormControl<number | null>(null),
    spell3Id: new FormControl<number | null>(null),
    spell4Id: new FormControl<number | null>(null),
    curse1Id: new FormControl<number | null>(null),
    curse2Id: new FormControl<number | null>(null),
    spReward: new FormControl<number>(0, {
      nonNullable: true,
      validators: [Validators.min(0)],
    }),
    hasTrap: new FormControl<boolean>(false, { nonNullable: true }),
    trapName: new FormControl<string>('', { nonNullable: true }),
    trapDescription: new FormControl<string>('', { nonNullable: true }),
    trapDamage: new FormControl<number>(0, { nonNullable: true }),
    trapDamageTo: new FormControl<'HP' | 'Stamina' | 'Mind'>('HP', { nonNullable: true }),
    trapCurseId: new FormControl<number | null>(null),
    trapToDetect: new FormControl<number>(10, { nonNullable: true }),
    trapToDisarm: new FormControl<number>(10, { nonNullable: true }),
  });

  readonly monsterTypeOptions = ['Humanoid', 'Beast', 'Specter', 'Other'] as const;

  readonly monsterForm = new FormGroup({
    name: new FormControl<string>('', { nonNullable: true }),
    type: new FormControl<string>('Humanoid', { nonNullable: true }),
    description: new FormControl<string>('', { nonNullable: true }),
    hp: new FormControl<number>(1, { nonNullable: true }),
    movementEconomy: new FormControl<number>(0, { nonNullable: true }),
    ac: new FormControl<number>(10, { nonNullable: true }),
    runAt: new FormControl<number>(0, { nonNullable: true }),
    numberOfAttacks: new FormControl<number>(1, { nonNullable: true }),
    spReward: new FormControl<number>(0, {
      nonNullable: true,
      validators: [Validators.min(0)],
    }),
  });

  readonly floorTrapForm = new FormGroup({
    trapName: new FormControl<string>('', { nonNullable: true }),
    trapDescription: new FormControl<string>('', { nonNullable: true }),
    trapDamage: new FormControl<number>(0, { nonNullable: true }),
    trapDamageTo: new FormControl<'HP' | 'Stamina' | 'Mind'>('HP', { nonNullable: true }),
    trapCurseId: new FormControl<number | null>(null),
    trapToDetect: new FormControl<number>(10, { nonNullable: true }),
    trapToDisarm: new FormControl<number>(10, { nonNullable: true }),
  });

  readonly portalForm = new FormGroup({
    name: new FormControl<string>('', { nonNullable: true }),
    description: new FormControl<string>('', { nonNullable: true }),
    look: new FormControl<PortalLook>('starUp', { nonNullable: true }),
  });

  keyList: Key[] = [];

  toggleSidebar(): void {
    this.isSidebarCollapsed.update((value) => !value);
  }

  ngOnInit(): void {
    this.loadDungons();
    this.loadPublishFriends();
    this.loadTresherLibrary();
    this.loadMonsterLibrary();
    this.loadDoorImages();
    this.loadStairsUpImages();
    this.loadLibImageOptions();
    this.loadLibSoundOptions();
    this.loadLibUserImages();
    this.loadLibUserSounds();
    this.loadLibUserSpells();
    const userkey = this.account.getKey();
    if (userkey) {
      this.itemService.loadItems(userkey);
      this.curseService.loadCurses(userkey);
      this.potionService.loadPotions(userkey);
      this.loadLibSpellOptions(userkey);
    }
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(event: KeyboardEvent): void {
    if (!this.isGridPreviewModalVisible()) {
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

    const nextDirection = this.getFacingDirectionFromKey(event.key);
    if (!nextDirection) {
      return;
    }

    const dungonId = this.selectedDungonId();
    if (dungonId === null) {
      return;
    }

    const currentCheater = this.cheaterByDungon()[dungonId] ?? { ...DEFAULT_CHEATER };
    if (currentCheater.facingDir === nextDirection) {
      event.preventDefault();
      return;
    }

    this.cheaterByDungon.update((allCheaters) => ({
      ...allCheaters,
      [dungonId]: {
        ...currentCheater,
        facingDir: nextDirection,
      },
    }));

    this.markDungonJsonChanged();
    this.drawPreviewGridCanvas();
    event.preventDefault();
  }

  showCreateForm(): void {
    this.isCreateFormVisible.set(true);
    this.saveError.set(null);
    this.selectedDungonError.set(null);
    this.dungonJsonSaveError.set(null);
    this.publishDungonError.set(null);
    this.publishVisibility.set('public');
    this.publishFriendUserKeys.set([]);
    this.doorDialogError.set(null);
    this.previewActionMessage.set(null);
    this.hasUnsavedDungonJson.set(false);
    this.isSavingDungonJson.set(false);
    this.isPublishingDungon.set(false);
    this.isPublishDialogVisible.set(false);
    this.isDoorDialogVisible.set(false);
    this.isKaysDialogVisible.set(false);
    this.isWhiteSpacePreviewPickMode.set(false);
    this.isGridPreviewModalVisible.set(false);
    this.isStartPointMode.set(false);
    this.isExitMode.set(false);
    this.isPlaceTresherMode.set(false);
    this.isPlaceMonsterMode.set(false);
    this.isPlaceFloorTrapMode.set(false);
    this.isFloorTrapDialogVisible.set(false);
    this.pendingFloorTrapPlacement.set(null);
    this.isPortalDialogVisible.set(false);
    this.editingPortalId.set(null);
    this.selectedPortalId.set(null);
    this.portalPickMode.set(null);
    this.portalPickingId.set(null);
    this.isStartPointDialogVisible.set(false);
    this.isExitDialogVisible.set(false);
    this.isTresherDialogVisible.set(false);
    this.isMonsterDialogVisible.set(false);
    this.isPlaceTresherDialogVisible.set(false);
    this.isPlaceMonsterDialogVisible.set(false);
    this.selectedKeyIdForPlacement.set(null);
    this.pendingDoorPlacement.set(null);
    this.pendingStartPointPlacement.set(null);
    this.pendingExitPlacement.set(null);
    this.pendingTresherPlacement.set(null);
    this.pendingMonsterPlacement.set(null);
    this.editingMonsterId.set(null);
    this.placeMonsterRoam.set(false);
    this.placeMonsterDropTresherIds.set([]);
    this.placeMonsterDropKeyIds.set([]);
    this.placeMonsterIsDormant.set(false);
    this.placeMonsterGuardRow.set(null);
    this.placeMonsterGuardCol.set(null);
    this.isSelectingGuardSquare.set(false);
    this.exitForm.reset({
      destinationType: 'outside',
      destinationDungonId: null,
      transitionType: 'open',
    });
    this.gridPreviewContext.set(null);
    this.selectedDungonId.set(null);
    this.selectedDungon.set(null);
    this.isSelectedDungonExpanded.set(false);
    this.isMoveMode.set(false);
    this.openBlockSelections.set({ ...EMPTY_OPEN_BLOCK_SELECTIONS });
    this.startPointForm.reset({
      description: '',
      playerSees: '',
    });
    this.exitForm.reset({
      destinationType: 'outside',
      destinationDungonId: null,
      transitionType: 'open',
    });
    this.exitDialogError.set(null);
    this.tresherForm.reset({
      name: '',
      description: '',
      gold: 0,
      silver: 0,
      copper: 0,
      zinc: 0,
      item1Id: null,
      item2Id: null,
      item3Id: null,
      item4Id: null,
      spell1Id: null,
      spell2Id: null,
      spell3Id: null,
      spell4Id: null,
      curse1Id: null,
      curse2Id: null,
      spReward: 0,
      hasTrap: false,
      trapName: '',
      trapDescription: '',
      trapDamage: 0,
      trapDamageTo: 'HP',
      trapCurseId: null,
      trapToDetect: 10,
      trapToDisarm: 10,
    });
    this.monsterForm.reset({
      name: '',
      type: 'Humanoid',
      description: '',
      hp: 1,
      movementEconomy: 0,
      ac: 10,
      runAt: 0,
      numberOfAttacks: 1,
    });
    this.createDungonForm.reset({
      name: '',
      description: '',
      intro: '',
      minsplifetime: 0,
      maxsplifetime: 1000000,
      spreward: 0,
      ismaingame: false,
      issample: false,
    });
  }

  toggleSelectedDungonDetails(): void {
    this.isSelectedDungonExpanded.update((value) => !value);
  }

  setMoveMode(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.isMoveMode.set(Boolean(target?.checked));
  }

  toggleMoveMode(): void {
    const next = !this.isMoveMode();
    this.isMoveMode.set(next);
    if (next) {
      this.openBlockSelections.set({ ...EMPTY_OPEN_BLOCK_SELECTIONS });
    }
  }

  selectOpenBlockOption(key: OpenBlockOptionKey): void {
    const alreadySelected = this.openBlockSelections()[key];
    const newSelections = { ...EMPTY_OPEN_BLOCK_SELECTIONS };
    if (!alreadySelected) {
      newSelections[key] = true;
      this.isMoveMode.set(false);
    }
    this.openBlockSelections.set(newSelections);
  }

  setOpenBlockSelection(optionKey: OpenBlockOptionKey, event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.openBlockSelections.update((currentSelections) => ({
      ...currentSelections,
      [optionKey]: Boolean(target?.checked),
    }));
  }

  onDoorStateChange(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    if (!target) {
      return;
    }

    if (target.value === 'open') {
      this.doorForm.controls.isLocked.setValue(false);
    }
  }

  saveDoorPlacement(): void {
    const pending = this.pendingDoorPlacement();
    if (!pending) {
      return;
    }

    if (this.doorForm.invalid) {
      this.doorForm.markAllAsTouched();
      this.doorDialogError.set('Door HP must be 1 or greater.');
      return;
    }

    const state = this.doorForm.controls.state.value;
    const hp = Math.max(1, Math.floor(this.doorForm.controls.hp.value));
    const isLocked = state === 'closed' ? this.doorForm.controls.isLocked.value : false;
    const toPick = isLocked ? (this.doorForm.controls.toPick.value ?? null) : null;
    const hasTrap = this.doorForm.controls.hasTrap.value;
    const trap: Trap | null = hasTrap
      ? {
          name: this.doorForm.controls.trapName.value.trim(),
          description: this.doorForm.controls.trapDescription.value.trim(),
          damage: Math.max(0, this.doorForm.controls.trapDamage.value),
          damageTo: this.doorForm.controls.trapDamageTo.value,
          curseId: this.doorForm.controls.trapCurseId.value ?? null,
          toDetect: Math.max(0, this.doorForm.controls.trapToDetect.value),
          toDisarm: Math.max(0, this.doorForm.controls.trapToDisarm.value),
        }
      : null;
    const settings: DoorPromptResult = {
      state,
      hp,
      isLocked,
      isHidden: this.doorForm.controls.isHidden.value,
      toFind: this.doorForm.controls.isHidden.value
        ? Math.min(6, Math.max(1, Math.floor(this.doorForm.controls.toFind.value)))
        : 0,
      name: this.doorForm.controls.name.value.trim(),
      description: this.doorForm.controls.description.value.trim(),
      toPick,
      trap,
      spReward: this.doorForm.controls.spReward.value ?? null,
    };

    const dungonId = pending.dungonId;
    if (pending.isNewSquare) {
      this.filledSquaresByDungon.update((allSquares) => ({
        ...allSquares,
        [dungonId]: {
          ...(allSquares[dungonId] ?? {}),
          [pending.squareKey]: true,
        },
      }));

      this.squaresByDungon.update((allSquares) => ({
        ...allSquares,
        [dungonId]: this.addSquareWithSharedWallCleanup(
          pending.row,
          pending.column,
          allSquares[dungonId] ?? {},
          pending.selections,
          settings
        ),
      }));
    } else {
      this.squaresByDungon.update((allSquares) => ({
        ...allSquares,
        [dungonId]: this.applyDoorToExistingSquare(
          pending.row,
          pending.column,
          allSquares[dungonId] ?? {},
          pending.selections,
          settings
        ),
      }));
    }

    this.closeDoorPlacementDialog();
    this.openBlockSelections.set({ ...EMPTY_OPEN_BLOCK_SELECTIONS });
    this.markDungonJsonChanged();
    this.drawGridCanvas();
  }

  cancelDoorPlacement(): void {
    this.closeDoorPlacementDialog();
  }

  openKaysDialog(): void {
    this.isKaysDialogVisible.set(true);
    this.isTresherDialogVisible.set(false);
    this.isMonsterDialogVisible.set(false);
    this.isPlaceTresherDialogVisible.set(false);
    this.isPlaceMonsterDialogVisible.set(false);
    this.isWhiteSpacePreviewPickMode.set(false);
    this.isStartPointMode.set(false);
    this.isExitMode.set(false);
    this.isPlaceTresherMode.set(false);
    this.isPlaceMonsterMode.set(false);
    this.isAddTextMode.set(false);
    this.isPlaceFloorTrapMode.set(false);
  }

  closeKaysDialog(): void {
    this.isKaysDialogVisible.set(false);
  }

  onToolsActionChange(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    if (!target) {
      return;
    }

    const action = target.value;
    if (action === 'placeKeys') {
      this.openKaysDialog();
    } else if (action === 'createThresher') {
      this.openTresherDialog();
    } else if (action === 'placeTresher') {
      this.startPlaceTresherMode();
    } else if (action === 'setStart') {
      this.startSetStartPointMode();
    } else if (action === 'setExit') {
      this.startSetExitMode();
    } else if (action === 'createMonseter') {
      this.openMonsterDialog();
    } else if (action === 'placeMonster') {
      this.startPlaceMonsterMode();
    } else if (action === 'addCellWallText') {
      this.startAddTextMode();
    } else if (action === 'placeFloorTrap') {
      this.startPlaceFloorTrapMode();
    } else if (action === 'placePortal') {
      this.openPortalDialog(null);
    }

    target.value = '';
  }

  startPlaceFloorTrapMode(): void {
    this.isPlaceFloorTrapMode.set(true);
    this.isPlaceTresherMode.set(false);
    this.isPlaceMonsterMode.set(false);
    this.isStartPointMode.set(false);
    this.isExitMode.set(false);
    this.isAddTextMode.set(false);
    this.isFloorTrapDialogVisible.set(false);
    this.pendingFloorTrapPlacement.set(null);
    this.portalPickMode.set(null);
    this.portalPickingId.set(null);
  }

  stopPlaceFloorTrapMode(): void {
    this.isPlaceFloorTrapMode.set(false);
    this.isFloorTrapDialogVisible.set(false);
    this.pendingFloorTrapPlacement.set(null);
  }

  openFloorTrapDialog(dungonId: number, row: number, column: number): void {
    this.pendingFloorTrapPlacement.set({ dungonId, row, column });
    this.floorTrapForm.reset({
      trapName: '',
      trapDescription: '',
      trapDamage: 0,
      trapDamageTo: 'HP',
      trapCurseId: null,
      trapToDetect: 10,
      trapToDisarm: 10,
    });
    this.isFloorTrapDialogVisible.set(true);
  }

  saveFloorTrap(): void {
    const pending = this.pendingFloorTrapPlacement();
    if (!pending) return;

    const controls = this.floorTrapForm.controls;
    const trap: Trap = {
      name: controls.trapName.value.trim(),
      description: controls.trapDescription.value.trim(),
      damage: Math.max(0, controls.trapDamage.value),
      damageTo: controls.trapDamageTo.value,
      curseId: controls.trapCurseId.value ?? null,
      toDetect: Math.max(0, controls.trapToDetect.value),
      toDisarm: Math.max(0, controls.trapToDisarm.value),
    };

    const placement: FloorTrapPlacement = {
      id: this.nextFloorTrapId,
      row: pending.row,
      column: pending.column,
      trap,
      isTriggered: false,
      isDisarmed: false,
      isDetected: false,
    };
    this.nextFloorTrapId += 1;

    this.floorTrapPlacementsByDungon.update((all) => ({
      ...all,
      [pending.dungonId]: [...(all[pending.dungonId] ?? []), placement],
    }));

    this.markDungonJsonChanged();
    this.isFloorTrapDialogVisible.set(false);
    this.pendingFloorTrapPlacement.set(null);
  }

  cancelFloorTrap(): void {
    this.isFloorTrapDialogVisible.set(false);
    this.pendingFloorTrapPlacement.set(null);
  }

  removeFloorTrap(dungonId: number, trapId: number): void {
    this.floorTrapPlacementsByDungon.update((all) => ({
      ...all,
      [dungonId]: (all[dungonId] ?? []).filter((p) => p.id !== trapId),
    }));
    this.markDungonJsonChanged();
  }

  // ── Portals ───────────────────────────────────────────────────────────────

  currentDungonPortals(): PortalPlacement[] {
    const dungonId = this.selectedDungonId();
    return dungonId !== null ? (this.portalPlacementsByDungon()[dungonId] ?? []) : [];
  }

  selectedPortal(): PortalPlacement | null {
    const id = this.selectedPortalId();
    if (id === null) return null;
    return this.currentDungonPortals().find((p) => p.id === id) ?? null;
  }

  onPortalSelectChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedPortalId.set(value ? Number(value) : null);
  }

  portalLookLabel(look: PortalLook): string {
    if (look === 'starDown') return 'Star (Down)';
    if (look === 'magicDoor') return 'Magic Door';
    return 'Star (Up)';
  }

  openPortalDialog(portalId: number | null): void {
    this.editingPortalId.set(portalId);
    if (portalId !== null) {
      const dungonId = this.selectedDungonId();
      const portal =
        dungonId !== null
          ? (this.portalPlacementsByDungon()[dungonId] ?? []).find((p) => p.id === portalId) ?? null
          : null;
      if (portal) {
        this.portalForm.reset({
          name: portal.name,
          description: portal.description,
          look: portal.look,
        });
      } else {
        this.portalForm.reset({ name: '', description: '', look: 'starUp' });
      }
    } else {
      this.portalForm.reset({ name: '', description: '', look: 'starUp' });
    }
    this.isPortalDialogVisible.set(true);
  }

  savePortal(): void {
    const dungonId = this.selectedDungonId();
    if (dungonId === null) return;

    const controls = this.portalForm.controls;
    const name = controls.name.value.trim() || 'Unnamed Portal';
    const description = controls.description.value.trim();
    const look = controls.look.value;
    const editingId = this.editingPortalId();

    if (editingId !== null) {
      this.portalPlacementsByDungon.update((all) => ({
        ...all,
        [dungonId]: (all[dungonId] ?? []).map((p) =>
          p.id === editingId ? { ...p, name, description, look } : p
        ),
      }));
      this.isPortalDialogVisible.set(false);
      this.editingPortalId.set(null);
      this.markDungonJsonChanged();
      this.drawGridCanvas();
    } else {
      const newPortal: PortalPlacement = {
        id: this.nextPortalId,
        name,
        description,
        look,
        startRow: null,
        startColumn: null,
        endRow: null,
        endColumn: null,
      };
      this.nextPortalId += 1;
      this.portalPlacementsByDungon.update((all) => ({
        ...all,
        [dungonId]: [...(all[dungonId] ?? []), newPortal],
      }));
      this.isPortalDialogVisible.set(false);
      this.editingPortalId.set(null);
      this.selectedPortalId.set(newPortal.id);
      this.markDungonJsonChanged();
      // Auto-enter placement mode for start point
      this.startPickPortalPoint(newPortal.id, 'start');
    }
  }

  cancelPortalDialog(): void {
    this.isPortalDialogVisible.set(false);
    this.editingPortalId.set(null);
  }

  startPickPortalPoint(portalId: number, step: 'start' | 'end'): void {
    this.portalPickMode.set(step);
    this.portalPickingId.set(portalId);
    this.isPlaceFloorTrapMode.set(false);
    this.isPlaceTresherMode.set(false);
    this.isPlaceMonsterMode.set(false);
    this.isStartPointMode.set(false);
    this.isExitMode.set(false);
    this.isAddTextMode.set(false);
  }

  stopPickPortalPoint(): void {
    this.portalPickMode.set(null);
    this.portalPickingId.set(null);
  }

  setPortalPoint(dungonId: number, portalId: number, step: 'start' | 'end', row: number, column: number): void {
    this.portalPlacementsByDungon.update((all) => ({
      ...all,
      [dungonId]: (all[dungonId] ?? []).map((p) =>
        p.id === portalId
          ? step === 'start'
            ? { ...p, startRow: row, startColumn: column }
            : { ...p, endRow: row, endColumn: column }
          : p
      ),
    }));
    if (step === 'start') {
      this.portalPickMode.set('end');
    } else {
      this.portalPickMode.set(null);
      this.portalPickingId.set(null);
    }
    this.markDungonJsonChanged();
    this.drawGridCanvas();
  }

  removePortal(dungonId: number, portalId: number): void {
    this.portalPlacementsByDungon.update((all) => ({
      ...all,
      [dungonId]: (all[dungonId] ?? []).filter((p) => p.id !== portalId),
    }));
    if (this.selectedPortalId() === portalId) {
      this.selectedPortalId.set(null);
    }
    if (this.portalPickingId() === portalId) {
      this.stopPickPortalPoint();
    }
    this.markDungonJsonChanged();
    this.drawGridCanvas();
  }

  // ── Placement Inspector ───────────────────────────────────────────────────

  placedItemsForCurrentDungon(): GridPlacedItem[] {
    const dungonId = this.selectedDungonId();
    if (dungonId === null) return [];
    const items: GridPlacedItem[] = [];

    // Monsters
    const monsters = this.monsterListByDungon()[dungonId] ?? [];
    for (const p of this.monsterPlacementsByDungon()[dungonId] ?? []) {
      const name = monsters.find((m) => m.id === p.monsterId)?.name ?? `Monster #${p.monsterId}`;
      items.push({
        key: `monster-${p.monsterId}-${p.row}-${p.column}`,
        type: 'monster',
        label: `Monster: ${name} (r${p.row},c${p.column})`,
        row: p.row,
        column: p.column,
        refId: p.monsterId,
      });
    }

    // Treshers
    const treshers = this.tresherListByDungon()[dungonId] ?? [];
    for (const p of this.tresherPlacementsByDungon()[dungonId] ?? []) {
      const name = treshers.find((t) => t.id === p.tresherId)?.name ?? `Tresher #${p.tresherId}`;
      items.push({
        key: `tresher-${p.tresherId}-${p.row}-${p.column}`,
        type: 'tresher',
        label: `Tresher: ${name} (r${p.row},c${p.column})`,
        row: p.row,
        column: p.column,
        refId: p.tresherId,
      });
    }

    // Doors (deduplicated by door id)
    const seenDoorIds = new Set<number>();
    for (const square of Object.values(this.squaresByDungon()[dungonId] ?? {})) {
      const sides = [square.toTop, square.toRight, square.toBottom, square.toLeft];
      for (const conn of sides) {
        if (!conn || !this.isDoorConnection(conn) || seenDoorIds.has(conn.id)) continue;
        seenDoorIds.add(conn.id);
        items.push({
          key: `door-${conn.id}-${square.row}-${square.column}`,
          type: 'door',
          label: `Door: ${conn.name} (r${square.row},c${square.column})`,
          row: square.row,
          column: square.column,
          refId: conn.id,
        });
      }
    }

    // Traps
    for (const p of this.floorTrapPlacementsByDungon()[dungonId] ?? []) {
      items.push({
        key: `trap-${p.id}-${p.row}-${p.column}`,
        type: 'trap',
        label: `Trap: ${p.trap.name || 'Unnamed'} (r${p.row},c${p.column})`,
        row: p.row,
        column: p.column,
        refId: p.id,
      });
    }

    return items;
  }

  selectedPlacedItem(): GridPlacedItem | null {
    const key = this.selectedPlacedItemKey();
    if (!key) return null;
    return this.placedItemsForCurrentDungon().find((item) => item.key === key) ?? null;
  }

  onPlacedItemSelect(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedPlacedItemKey.set(value || null);
    this.drawGridCanvas();
  }

  moveSelectedPlacement(): void {
    const item = this.selectedPlacedItem();
    const dungonId = this.selectedDungonId();
    if (!item || dungonId === null) return;
    this.selectedPlacedItemKey.set(null);

    if (item.type === 'monster') {
      this.removeMonsterPlacementsAtSquare(dungonId, item.row, item.column);
      this.markDungonJsonChanged();
      this.drawGridCanvas();
      this.startPlaceMonsterMode();
    } else if (item.type === 'tresher') {
      this.removeTresherPlacementsAtSquare(dungonId, item.row, item.column);
      this.markDungonJsonChanged();
      this.drawGridCanvas();
      this.startPlaceTresherMode();
    } else if (item.type === 'trap') {
      this.removeFloorTrap(dungonId, item.refId);
      this.drawGridCanvas();
      this.startPlaceFloorTrapMode();
    }
  }

  editSelectedPlacement(): void {
    const item = this.selectedPlacedItem();
    if (!item) return;

    if (item.type === 'monster') {
      this.openMonsterDialog();
      this.editSelectedMonster(item.refId);
    } else if (item.type === 'tresher') {
      this.openTresherDialog();
    }
  }

  clearSelectedPlacement(): void {
    this.selectedPlacedItemKey.set(null);
    this.drawGridCanvas();
  }

  floorTrapsForPreview(): FloorTrapPlacement[] {
    const preview = this.gridPreviewContext();
    if (!preview) return [];
    return this.floorTrapPlacementsByDungon()[preview.dungonId] ?? [];
  }

  onPublishVisibilityChange(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    const visibility: PublishVisibility =
      target?.value === 'friends' || target?.value === 'private' ? target.value : 'public';
    this.publishVisibility.set(visibility);

    if (visibility !== 'friends') {
      this.publishFriendUserKeys.set([]);
    }
  }

  openPublishDialog(): void {
    if (!this.canOpenPublishDialog()) {
      return;
    }

    this.publishDungonError.set(null);
    this.loadPublishFriends();
    this.isPublishDialogVisible.set(true);
  }

  closePublishDialog(): void {
    if (this.isPublishingDungon()) {
      return;
    }

    this.publishDungonError.set(null);
    this.isPublishDialogVisible.set(false);
  }

  onPublishFriendSelectionChange(friendUserKey: string, event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const shouldSelect = Boolean(target?.checked);

    this.publishFriendUserKeys.update((current) => {
      if (shouldSelect) {
        if (current.includes(friendUserKey)) {
          return current;
        }

        return [...current, friendUserKey];
      }

      return current.filter((key) => key !== friendUserKey);
    });
  }

  isPublishFriendSelected(friendUserKey: string): boolean {
    return this.publishFriendUserKeys().includes(friendUserKey);
  }

  canOpenPublishDialog(): boolean {
    const selectedDungon = this.selectedDungon();
    if (!selectedDungon) {
      return false;
    }

    if (this.hasUnsavedDungonJson() || this.isSavingDungonJson()) {
      return false;
    }

    if (selectedDungon.status === 'pending') {
      return false;
    }

    if (selectedDungon.status !== 'published') {
      return true;
    }

    return this.savedPublishUpdatesByDungon()[selectedDungon.id] === true;
  }

  publishButtonText(): 'Publish' | 'Published' | 'Publish Update' | 'Pending Approval' {
    const selectedDungon = this.selectedDungon();
    if (!selectedDungon) {
      return 'Publish';
    }

    if (selectedDungon.status === 'pending') {
      return 'Pending Approval';
    }

    if (selectedDungon.status !== 'published') {
      return 'Publish';
    }

    return this.canOpenPublishDialog() ? 'Publish Update' : 'Published';
  }

  approveDungon(): void {
    const dungonId = this.selectedDungonId();
    if (dungonId === null) {
      return;
    }

    const userKey = this.account.getKey();
    if (!userKey) {
      return;
    }

    this.http
      .put<{ result: number; error?: string }>(
        `${API_BASE_URL}/dungons/${dungonId}/approve`,
        { userkey: userKey }
      )
      .subscribe({
        next: (response) => {
          if (response.result !== 1) {
            return;
          }

          const currentSelected = this.selectedDungon();
          if (currentSelected && currentSelected.id === dungonId) {
            this.selectedDungon.set({
              ...currentSelected,
              status: 'published',
              ispublic: true,
            });
          }

          this.dungons.update((items) =>
            items.map((item) =>
              item.id === dungonId ? { ...item, status: 'published' } : item
            )
          );
        },
      });
  }

  selectKeyForPlacement(keyId: number): void {
    const key = this.keyList.find((item) => item.id === keyId);
    if (!key) {
      return;
    }

    this.selectedKeyIdForPlacement.set(keyId);
    this.isKaysDialogVisible.set(false);
  }

  cancelKeyPlacement(): void {
    this.selectedKeyIdForPlacement.set(null);
  }

  hasAnyWhiteSpace(): boolean {
    const dungonId = this.selectedDungonId();
    if (dungonId === null) {
      return false;
    }

    return Object.keys(this.filledSquaresByDungon()[dungonId] ?? {}).length > 0;
  }

  startWhiteSpacePreviewPickMode(): void {
    if (!this.hasAnyWhiteSpace()) {
      return;
    }

    this.isWhiteSpacePreviewPickMode.set(true);
    this.isStartPointMode.set(false);
    this.isExitMode.set(false);
    this.isPlaceTresherMode.set(false);
    this.isPlaceMonsterMode.set(false);
    this.isAddTextMode.set(false);
    this.isTresherDialogVisible.set(false);
    this.isMonsterDialogVisible.set(false);
    this.isPlaceTresherDialogVisible.set(false);
    this.isPlaceMonsterDialogVisible.set(false);
    this.selectedKeyIdForPlacement.set(null);
    this.isKaysDialogVisible.set(false);
  }

  cancelWhiteSpacePreviewPickMode(): void {
    this.isWhiteSpacePreviewPickMode.set(false);
  }

  startSetStartPointMode(): void {
    if (!this.hasAnyWhiteSpace()) {
      return;
    }

    this.isStartPointMode.set(true);
    this.isWhiteSpacePreviewPickMode.set(false);
    this.isExitMode.set(false);
    this.isPlaceTresherMode.set(false);
    this.isPlaceMonsterMode.set(false);
    this.isAddTextMode.set(false);
    this.isTresherDialogVisible.set(false);
    this.isMonsterDialogVisible.set(false);
    this.isPlaceTresherDialogVisible.set(false);
    this.isPlaceMonsterDialogVisible.set(false);
    this.selectedKeyIdForPlacement.set(null);
    this.isKaysDialogVisible.set(false);
  }

  cancelSetStartPointMode(): void {
    this.isStartPointMode.set(false);
  }

  startSetExitMode(): void {
    if (!this.hasAnyWhiteSpace()) {
      return;
    }

    this.isExitMode.set(true);
    this.isStartPointMode.set(false);
    this.isPlaceTresherMode.set(false);
    this.isPlaceMonsterMode.set(false);
    this.isAddTextMode.set(false);
    this.isWhiteSpacePreviewPickMode.set(false);
    this.isTresherDialogVisible.set(false);
    this.isMonsterDialogVisible.set(false);
    this.isPlaceTresherDialogVisible.set(false);
    this.isPlaceMonsterDialogVisible.set(false);
    this.selectedKeyIdForPlacement.set(null);
    this.isKaysDialogVisible.set(false);
  }

  cancelSetExitMode(): void {
    this.isExitMode.set(false);
  }

  availableDestinationDungonsForExit(): DungonListItem[] {
    const selectedId = this.selectedDungonId();
    return this.dungons().filter((item) => item.id !== selectedId);
  }

  hasAnyOtherDungonsForExit(): boolean {
    return this.availableDestinationDungonsForExit().length > 0;
  }

  startPlaceTresherMode(): void {
    if (!this.hasAnyWhiteSpace()) {
      return;
    }

    this.isPlaceTresherMode.set(true);
    this.isPlaceMonsterMode.set(false);
    this.isAddTextMode.set(false);
    this.isStartPointMode.set(false);
    this.isExitMode.set(false);
    this.isWhiteSpacePreviewPickMode.set(false);
    this.isTresherDialogVisible.set(false);
    this.isMonsterDialogVisible.set(false);
    this.isPlaceTresherDialogVisible.set(false);
    this.isPlaceMonsterDialogVisible.set(false);
    this.selectedKeyIdForPlacement.set(null);
    this.isKaysDialogVisible.set(false);
  }

  cancelPlaceTresherMode(): void {
    this.isPlaceTresherMode.set(false);
  }

  saveStartPoint(): void {
    const pending = this.pendingStartPointPlacement();
    if (!pending) {
      return;
    }

    const description = this.startPointForm.controls.description.value.trim();
    const playerSees = this.startPointForm.controls.playerSees.value.trim();

    this.startPointByDungon.update((allStartPoints) => ({
      ...allStartPoints,
      [pending.dungonId]: {
        row: pending.row,
        col: pending.column,
        description,
        playerSees,
      },
    }));

    this.closeStartPointDialog();
    this.markDungonJsonChanged();
    this.drawGridCanvas();
    this.drawPreviewGridCanvas();
  }

  onExitDestinationTypeChange(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    if (!target) {
      return;
    }

    const nextDestinationType: ExitDestinationType =
      target.value === 'dungon' ? 'dungon' : 'outside';

    if (nextDestinationType === 'dungon' && !this.hasAnyOtherDungonsForExit()) {
      this.exitForm.controls.destinationType.setValue('outside');
      this.exitForm.controls.destinationDungonId.setValue(null);
      this.exitDialogError.set('No other dungons available for this user.');
      return;
    }

    if (nextDestinationType === 'outside') {
      this.exitForm.controls.destinationDungonId.setValue(null);
    } else {
      const selected = this.normalizeNullableNumber(
        this.toFiniteNumber(this.exitForm.controls.destinationDungonId.value)
      );
      if (
        selected === null ||
        !this.availableDestinationDungonsForExit().some((item) => item.id === selected)
      ) {
        this.exitForm.controls.destinationDungonId.setValue(
          this.availableDestinationDungonsForExit()[0]?.id ?? null
        );
      }
    }

    this.exitDialogError.set(null);
  }

  saveExit(): void {
    const pending = this.pendingExitPlacement();
    if (!pending) {
      return;
    }

    const destinationType = this.exitForm.controls.destinationType.value;
    const transitionType = this.exitForm.controls.transitionType.value;
    const destinationOptions = this.availableDestinationDungonsForExit();

    let destinationDungonId: number | null = null;
    if (destinationType === 'dungon') {
      if (destinationOptions.length === 0) {
        this.exitDialogError.set('No other dungons available for this user.');
        return;
      }

      const selectedDestinationId = this.normalizeNullableNumber(
        this.toFiniteNumber(this.exitForm.controls.destinationDungonId.value)
      );
      if (
        selectedDestinationId === null ||
        !destinationOptions.some((item) => item.id === selectedDestinationId)
      ) {
        this.exitDialogError.set('Pick a valid destination dungon.');
        return;
      }

      destinationDungonId = selectedDestinationId;
    }

    this.exitsByDungon.update((allExits) => {
      const existingExits = allExits[pending.dungonId] ?? [];
      const existingExitIndex = existingExits.findIndex(
        (item) => item.row === pending.row && item.column === pending.column
      );

      if (existingExitIndex >= 0) {
        const updatedExit: DungonExit = {
          ...existingExits[existingExitIndex],
          destinationType,
          destinationDungonId,
          transitionType,
        };

        return {
          ...allExits,
          [pending.dungonId]: existingExits.map((item, index) =>
            index === existingExitIndex ? updatedExit : item
          ),
        };
      }

      const nextExit: DungonExit = {
        id: this.nextExitId,
        row: pending.row,
        column: pending.column,
        destinationType,
        destinationDungonId,
        transitionType,
      };
      this.nextExitId += 1;

      return {
        ...allExits,
        [pending.dungonId]: [...existingExits, nextExit],
      };
    });

    this.closeExitDialog();
    this.markDungonJsonChanged();
    this.drawGridCanvas();
    this.drawPreviewGridCanvas();
  }

  cancelStartPointDialog(): void {
    this.closeStartPointDialog();
  }

  cancelExitDialog(): void {
    this.closeExitDialog();
  }

  openTresherDialog(): void {
    this.isTresherDialogVisible.set(true);
    this.isMonsterDialogVisible.set(false);
    this.isPlaceTresherDialogVisible.set(false);
    this.isPlaceMonsterDialogVisible.set(false);
    this.isKaysDialogVisible.set(false);
    this.isWhiteSpacePreviewPickMode.set(false);
    this.isStartPointMode.set(false);
    this.isExitMode.set(false);
    this.isPlaceTresherMode.set(false);
    this.isPlaceMonsterMode.set(false);
    this.isAddTextMode.set(false);
    this.selectedKeyIdForPlacement.set(null);
  }

  closeTresherDialog(): void {
    this.isTresherDialogVisible.set(false);
  }

  openMonsterDialog(): void {
    this.isMonsterDialogVisible.set(true);
    this.isTresherDialogVisible.set(false);
    this.isPlaceTresherDialogVisible.set(false);
    this.isPlaceMonsterDialogVisible.set(false);
    this.isKaysDialogVisible.set(false);
    this.isWhiteSpacePreviewPickMode.set(false);
    this.isStartPointMode.set(false);
    this.isExitMode.set(false);
    this.isPlaceTresherMode.set(false);
    this.isPlaceMonsterMode.set(false);
    this.isAddTextMode.set(false);
    this.selectedKeyIdForPlacement.set(null);
    this.beginCreateMonster();
    this.loadMonsterLibrary();
    this.loadMonsterDialogOptions();
  }

  closeMonsterDialog(): void {
    this.isMonsterDialogVisible.set(false);
    this.beginCreateMonster();
  }

  startPlaceMonsterMode(): void {
    if (!this.hasAnyWhiteSpace()) {
      return;
    }

    this.isPlaceMonsterMode.set(true);
    this.isPlaceTresherMode.set(false);
    this.isAddTextMode.set(false);
    this.isStartPointMode.set(false);
    this.isExitMode.set(false);
    this.isWhiteSpacePreviewPickMode.set(false);
    this.isTresherDialogVisible.set(false);
    this.isMonsterDialogVisible.set(false);
    this.isPlaceTresherDialogVisible.set(false);
    this.isPlaceMonsterDialogVisible.set(false);
    this.selectedKeyIdForPlacement.set(null);
    this.isKaysDialogVisible.set(false);
  }

  cancelPlaceMonsterMode(): void {
    this.isPlaceMonsterMode.set(false);
  }

  startAddTextMode(): void {
    if (!this.hasAnyWhiteSpace()) {
      return;
    }

    this.isAddTextMode.set(true);
    this.isPlaceMonsterMode.set(false);
    this.isPlaceTresherMode.set(false);
    this.isStartPointMode.set(false);
    this.isExitMode.set(false);
    this.isWhiteSpacePreviewPickMode.set(false);
    this.isTresherDialogVisible.set(false);
    this.isMonsterDialogVisible.set(false);
    this.isPlaceTresherDialogVisible.set(false);
    this.isPlaceMonsterDialogVisible.set(false);
    this.selectedKeyIdForPlacement.set(null);
    this.isKaysDialogVisible.set(false);
  }

  cancelAddTextMode(): void {
    this.isAddTextMode.set(false);
  }

  openTextDialog(dungonId: number, row: number, column: number): void {
    const existing = (this.squareTextsByDungon()[dungonId] ?? []).find(
      (t) => t.row === row && t.column === column
    );

    this.pendingTextRow.set(row);
    this.pendingTextColumn.set(column);
    this.textDialogInput.set(existing?.text ?? '');
    this.textDialogWallSide.set(existing?.wallSide ?? null);
    this.editingSquareTextId.set(existing?.id ?? null);
    this.isTextDialogVisible.set(true);
  }

  closeTextDialog(): void {
    this.isTextDialogVisible.set(false);
    this.pendingTextRow.set(null);
    this.pendingTextColumn.set(null);
    this.textDialogInput.set('');
    this.textDialogWallSide.set(null);
    this.editingSquareTextId.set(null);
  }

  onTextDialogInputChange(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;
    this.textDialogInput.set(target?.value ?? '');
  }

  onTextDialogWallSideChange(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.textDialogWallSide.set(normalizeSquareTextWallSide(target?.value ?? null));
  }

  saveSquareText(): void {
    const dungonId = this.selectedDungonId();
    const row = this.pendingTextRow();
    const column = this.pendingTextColumn();
    if (dungonId === null || row === null || column === null) {
      return;
    }

    const text = this.textDialogInput().trim();
    const wallSide = this.textDialogWallSide();
    if (!text) {
      if (this.editingSquareTextId() !== null) {
        this.squareTextsByDungon.update((all) => ({
          ...all,
          [dungonId]: (all[dungonId] ?? []).filter((t) => t.id !== this.editingSquareTextId()),
        }));
        this.markDungonJsonChanged();
      }
      this.closeTextDialog();
      this.drawGridCanvas();
      return;
    }

    const editingId = this.editingSquareTextId();
    if (editingId !== null) {
      this.squareTextsByDungon.update((all) => ({
        ...all,
        [dungonId]: (all[dungonId] ?? []).map((t) =>
          t.id === editingId ? { ...t, text, wallSide } : t
        ),
      }));
    } else {
      const newEntry: SquareText = {
        id: this.nextSquareTextId,
        row,
        column,
        text,
        wallSide,
      };
      this.nextSquareTextId += 1;
      this.squareTextsByDungon.update((all) => ({
        ...all,
        [dungonId]: [...(all[dungonId] ?? []), newEntry],
      }));
    }

    this.markDungonJsonChanged();
    this.closeTextDialog();
    this.drawGridCanvas();
  }

  onPlaceMonsterRoamChange(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.placeMonsterRoam.set(Boolean(target?.checked));
  }

  onPlaceMonsterIsDormantChange(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.placeMonsterIsDormant.set(Boolean(target?.checked));
    if (!target?.checked) {
      this.placeMonsterGuardRow.set(null);
      this.placeMonsterGuardCol.set(null);
      this.isSelectingGuardSquare.set(false);
    }
  }

  startSelectingGuardSquare(): void {
    this.isSelectingGuardSquare.set(true);
    this.isPlaceMonsterDialogVisible.set(false);
  }

  clearMonsterGuardSquare(): void {
    this.placeMonsterGuardRow.set(null);
    this.placeMonsterGuardCol.set(null);
  }

  isMonsterDropTresherSelected(id: number): boolean {
    return this.placeMonsterDropTresherIds().includes(id);
  }

  toggleMonsterDropTresher(id: number): void {
    const current = this.placeMonsterDropTresherIds();
    if (current.includes(id)) {
      this.placeMonsterDropTresherIds.set(current.filter((v) => v !== id));
    } else {
      this.placeMonsterDropTresherIds.set([...current, id]);
    }
  }

  isMonsterDropKeySelected(id: number): boolean {
    return this.placeMonsterDropKeyIds().includes(id);
  }

  toggleMonsterDropKey(id: number): void {
    const current = this.placeMonsterDropKeyIds();
    if (current.includes(id)) {
      this.placeMonsterDropKeyIds.set(current.filter((v) => v !== id));
    } else {
      this.placeMonsterDropKeyIds.set([...current, id]);
    }
  }

  closePlaceTresherDialog(): void {
    this.isPlaceTresherDialogVisible.set(false);
    this.pendingTresherPlacement.set(null);
  }

  closePlaceMonsterDialog(): void {
    this.isPlaceMonsterDialogVisible.set(false);
    this.pendingMonsterPlacement.set(null);
    this.placeMonsterRoam.set(false);
    this.placeMonsterDropTresherIds.set([]);
    this.placeMonsterDropKeyIds.set([]);
    this.placeMonsterIsDormant.set(false);
    this.placeMonsterGuardRow.set(null);
    this.placeMonsterGuardCol.set(null);
    this.isSelectingGuardSquare.set(false);
  }

  placeSelectedTresherAtPendingPlacement(tresherId: number): void {
    const pending = this.pendingTresherPlacement();
    if (!pending) {
      return;
    }

    const availableTreshers = this.tresherListByDungon()[pending.dungonId] ?? [];
    if (!availableTreshers.some((tresher) => tresher.id === tresherId)) {
      return;
    }

    this.placeTresherByIdAtPendingPlacement(tresherId);
  }

  placeLibraryTresherAtPendingPlacement(libraryTresherId: number): void {
    const pending = this.pendingTresherPlacement();
    if (!pending) {
      return;
    }

    const selectedLibraryTresher = this.tresherLibrary().find(
      (item) => item.id === libraryTresherId
    );
    if (!selectedLibraryTresher) {
      return;
    }

    const localTresherId = this.ensureDungonTresherFromLibrary(
      pending.dungonId,
      selectedLibraryTresher
    );
    this.placeTresherByIdAtPendingPlacement(localTresherId);
  }

  placeSelectedMonsterAtPendingPlacement(monsterId: number): void {
    const pending = this.pendingMonsterPlacement();
    if (!pending) {
      return;
    }

    const availableMonsters = this.monsterListByDungon()[pending.dungonId] ?? [];
    if (!availableMonsters.some((monster) => monster.id === monsterId)) {
      return;
    }

    this.placeMonsterByIdAtPendingPlacement(monsterId);
  }

  placeLibraryMonsterAtPendingPlacement(libraryMonsterId: number): void {
    const pending = this.pendingMonsterPlacement();
    if (!pending) {
      return;
    }

    const selectedLibraryMonster = this.monsterLibrary().find(
      (item) => item.id === libraryMonsterId
    );
    if (!selectedLibraryMonster) {
      return;
    }

    const localMonsterId = this.ensureDungonMonsterFromLibrary(
      pending.dungonId,
      selectedLibraryMonster
    );
    this.placeMonsterByIdAtPendingPlacement(localMonsterId);
  }

  private placeTresherByIdAtPendingPlacement(tresherId: number): void {
    const pending = this.pendingTresherPlacement();
    if (!pending) {
      return;
    }

    let didPlace = false;
    this.tresherPlacementsByDungon.update((allPlacements) => {
      const existingPlacements = allPlacements[pending.dungonId] ?? [];
      const alreadyPlaced = existingPlacements.some(
        (placement) =>
          placement.tresherId === tresherId &&
          placement.row === pending.row &&
          placement.column === pending.column
      );

      if (alreadyPlaced) {
        return allPlacements;
      }

      didPlace = true;
      return {
        ...allPlacements,
        [pending.dungonId]: [
          ...existingPlacements,
          {
            tresherId,
            row: pending.row,
            column: pending.column,
          },
        ],
      };
    });

    this.closePlaceTresherDialog();

    if (!didPlace) {
      return;
    }

    this.markDungonJsonChanged();
    this.drawGridCanvas();
    this.drawPreviewGridCanvas();
  }

  private placeMonsterByIdAtPendingPlacement(monsterId: number): void {
    const pending = this.pendingMonsterPlacement();
    if (!pending) {
      return;
    }

    let didPlace = false;
    this.monsterPlacementsByDungon.update((allPlacements) => {
      const existingPlacements = allPlacements[pending.dungonId] ?? [];
      const alreadyPlaced = existingPlacements.some(
        (placement) =>
          placement.monsterId === monsterId &&
          placement.row === pending.row &&
          placement.column === pending.column
      );

      if (alreadyPlaced) {
        return allPlacements;
      }

      didPlace = true;
      return {
        ...allPlacements,
        [pending.dungonId]: [
          ...existingPlacements,
          {
            monsterId,
            row: pending.row,
            column: pending.column,
            roam: this.placeMonsterRoam(),
            tresherIds: this.placeMonsterDropTresherIds().length > 0 ? [...this.placeMonsterDropTresherIds()] : undefined,
            keyIds: this.placeMonsterDropKeyIds().length > 0 ? [...this.placeMonsterDropKeyIds()] : undefined,
            isDormant: this.placeMonsterIsDormant() || undefined,
            guardRow: this.placeMonsterIsDormant() && this.placeMonsterGuardRow() !== null ? this.placeMonsterGuardRow() : undefined,
            guardColumn: this.placeMonsterIsDormant() && this.placeMonsterGuardCol() !== null ? this.placeMonsterGuardCol() : undefined,
          },
        ],
      };
    });

    this.closePlaceMonsterDialog();

    if (!didPlace) {
      return;
    }

    this.markDungonJsonChanged();
    this.drawGridCanvas();
    this.drawPreviewGridCanvas();
  }

  private ensureDungonTresherFromLibrary(
    dungonId: number,
    libraryTresher: TresherLibraryItem
  ): number {
    const existingMatch = (this.tresherListByDungon()[dungonId] ?? []).find((candidate) =>
      this.isSameTresherDefinition(candidate, libraryTresher)
    );

    if (existingMatch) {
      return existingMatch.id;
    }

    const nextLocalTresher: Tresher = {
      id: this.nextTresherId,
      type: libraryTresher.type ?? 'OtherTresher',
      name: libraryTresher.name,
      description: libraryTresher.description,
      gold: Math.max(0, this.normalizeNumber(this.toFiniteNumber(libraryTresher.gold), 0)),
      silver: Math.max(0, this.normalizeNumber(this.toFiniteNumber(libraryTresher.silver), 0)),
      copper: Math.max(0, this.normalizeNumber(this.toFiniteNumber(libraryTresher.copper), 0)),
      zinc: Math.max(0, this.normalizeNumber(this.toFiniteNumber(libraryTresher.zinc), 0)),
      item1Id: this.normalizeNullableNumber(this.toFiniteNumber(libraryTresher.item1Id)),
      item2Id: this.normalizeNullableNumber(this.toFiniteNumber(libraryTresher.item2Id)),
      item3Id: this.normalizeNullableNumber(this.toFiniteNumber(libraryTresher.item3Id)),
      item4Id: this.normalizeNullableNumber(this.toFiniteNumber(libraryTresher.item4Id)),
      spell1Id: this.normalizeNullableNumber(this.toFiniteNumber(libraryTresher.spell1Id)),
      spell2Id: this.normalizeNullableNumber(this.toFiniteNumber(libraryTresher.spell2Id)),
      spell3Id: this.normalizeNullableNumber(this.toFiniteNumber(libraryTresher.spell3Id)),
      spell4Id: this.normalizeNullableNumber(this.toFiniteNumber(libraryTresher.spell4Id)),
      curse1Id: this.normalizeNullableNumber(this.toFiniteNumber(libraryTresher.curse1Id)),
      curse2Id: this.normalizeNullableNumber(this.toFiniteNumber(libraryTresher.curse2Id)),
      potion1Id: this.normalizeNullableNumber(this.toFiniteNumber(libraryTresher.potion1Id)),
      potion2Id: this.normalizeNullableNumber(this.toFiniteNumber(libraryTresher.potion2Id)),
      potion3Id: this.normalizeNullableNumber(this.toFiniteNumber(libraryTresher.potion3Id)),
      imageId: this.normalizeNullableNumber(this.toFiniteNumber(libraryTresher.imageId)),
      soundId: this.normalizeNullableNumber(this.toFiniteNumber(libraryTresher.soundId)),
      spReward: Math.max(0, this.normalizeNumber(this.toFiniteNumber(libraryTresher.spReward), 0)),
      trap: null,
    };

    this.nextTresherId += 1;
    this.tresherListByDungon.update((allTreshers) => ({
      ...allTreshers,
      [dungonId]: [...(allTreshers[dungonId] ?? []), nextLocalTresher],
    }));

    this.markDungonJsonChanged();
    return nextLocalTresher.id;
  }

  private ensureDungonMonsterFromLibrary(
    dungonId: number,
    libraryMonster: MonsterLibraryItem
  ): number {
    const existingMatch = (this.monsterListByDungon()[dungonId] ?? []).find((candidate) =>
      this.isSameMonsterDefinition(candidate, libraryMonster)
    );

    if (existingMatch) {
      return existingMatch.id;
    }

    const attacks = this.normalizeMonsterAttacks(libraryMonster.attacks);
    const nextLocalMonster: Monster = {
      id: this.nextMonsterId,
      imageId: this.normalizeNullableNumber(this.toFiniteNumber(libraryMonster.imageId)),
      soundId: this.normalizeNullableNumber(this.toFiniteNumber(libraryMonster.soundId)),
      tresherIds: this.normalizeIdList(libraryMonster.tresherIds),
      keyIds: this.normalizeIdList(libraryMonster.keyIds),
      name: libraryMonster.name,
      type: libraryMonster.type,
      description: libraryMonster.description,
      hp: Math.max(0, this.normalizeNumber(this.toFiniteNumber(libraryMonster.hp), 1)),
      movementEconomy: Math.max(
        0,
        this.normalizeNumber(this.toFiniteNumber(libraryMonster.movementEconomy), 0)
      ),
      ac: Math.max(0, this.normalizeNumber(this.toFiniteNumber(libraryMonster.ac), 10)),
      runAt: Math.max(0, this.normalizeNumber(this.toFiniteNumber(libraryMonster.runAt), 0)),
      numberOfAttacks: Math.max(
        0,
        Math.max(
          this.normalizeNumber(this.toFiniteNumber(libraryMonster.numberOfAttacks), attacks.length),
          attacks.length
        )
      ),
      attacks,
      magic: Math.max(0, this.normalizeNumber(this.toFiniteNumber(libraryMonster.magic), 0)),
      magicResistance: Math.max(0, this.normalizeNumber(this.toFiniteNumber(libraryMonster.magicResistance), 0)),
      spReward: Math.max(0, this.normalizeNumber(this.toFiniteNumber(libraryMonster.spReward), 0)),
      callsReinforcements: libraryMonster.callsReinforcements === true,
    };
    this.nextMonsterId += 1;
    this.monsterListByDungon.update((allMonsters) => ({
      ...allMonsters,
      [dungonId]: [...(allMonsters[dungonId] ?? []), nextLocalMonster],
    }));

    this.markDungonJsonChanged();
    return nextLocalMonster.id;
  }

  private isSameTresherDefinition(left: Tresher, right: Tresher): boolean {
    return (
      left.name === right.name &&
      left.description === right.description &&
      left.gold === right.gold &&
      left.silver === right.silver &&
      left.copper === right.copper &&
      left.zinc === right.zinc &&
      left.item1Id === right.item1Id &&
      left.item2Id === right.item2Id &&
      left.item3Id === right.item3Id &&
      left.item4Id === right.item4Id &&
      left.spell1Id === right.spell1Id &&
      left.spell2Id === right.spell2Id &&
      left.spell3Id === right.spell3Id &&
      left.spell4Id === right.spell4Id &&
      left.curse1Id === right.curse1Id &&
      left.curse2Id === right.curse2Id
    );
  }

  private isSameMonsterDefinition(left: Monster, right: Monster): boolean {
    if (
      left.name !== right.name ||
      left.type !== right.type ||
      left.description !== right.description ||
      left.hp !== right.hp ||
      left.movementEconomy !== right.movementEconomy ||
      left.ac !== right.ac ||
      left.runAt !== right.runAt ||
      left.numberOfAttacks !== right.numberOfAttacks ||
      left.imageId !== (this.normalizeNullableNumber(this.toFiniteNumber(right.imageId)))
    ) {
      return false;
    }

    const leftTresherIds = this.normalizeIdList(left.tresherIds);
    const rightTresherIds = this.normalizeIdList(right.tresherIds);
    if (leftTresherIds.length !== rightTresherIds.length) {
      return false;
    }

    for (let index = 0; index < leftTresherIds.length; index += 1) {
      if (leftTresherIds[index] !== rightTresherIds[index]) {
        return false;
      }
    }

    const leftKeyIds = this.normalizeIdList(left.keyIds);
    const rightKeyIds = this.normalizeIdList(right.keyIds);
    if (leftKeyIds.length !== rightKeyIds.length) {
      return false;
    }

    for (let index = 0; index < leftKeyIds.length; index += 1) {
      if (leftKeyIds[index] !== rightKeyIds[index]) {
        return false;
      }
    }

    const leftAttacks = this.normalizeMonsterAttacks(left.attacks);
    const rightAttacks = this.normalizeMonsterAttacks(right.attacks);
    if (leftAttacks.length !== rightAttacks.length) {
      return false;
    }

    for (let index = 0; index < leftAttacks.length; index += 1) {
      const leftAttack = leftAttacks[index];
      const rightAttack = rightAttacks[index];
      if (
        leftAttack.description !== rightAttack.description ||
        leftAttack.damage !== rightAttack.damage ||
        leftAttack.plusToHit !== rightAttack.plusToHit
      ) {
        return false;
      }
    }

    return true;
  }

  saveMonster(): void {
    const dungonId = this.selectedDungonId();
    if (dungonId === null) {
      return;
    }

    const controls = this.monsterForm.controls;
    const editingId = this.editingMonsterId();
    const editingAttacks = this.editingMonsterAttacks();

    const nextMonster: Monster = {
      id: editingId ?? this.nextMonsterId,
      imageId: this.editingMonsterImageId(),
      soundId: this.editingMonsterSoundId(),
      tresherIds: this.normalizeIdList(this.editingMonsterTresherIds()),
      keyIds: this.normalizeIdList(this.editingMonsterKeyIds()),
      name: controls.name.value.trim() || 'Unnamed Monster',
      type: controls.type.value.trim() || 'Humanoid',
      description: controls.description.value.trim(),
      hp: Math.max(0, this.normalizeNumber(this.toFiniteNumber(controls.hp.value), 1)),
      movementEconomy: Math.max(
        0,
        this.normalizeNumber(this.toFiniteNumber(controls.movementEconomy.value), 0)
      ),
      ac: Math.max(0, this.normalizeNumber(this.toFiniteNumber(controls.ac.value), 10)),
      runAt: Math.max(0, this.normalizeNumber(this.toFiniteNumber(controls.runAt.value), 0)),
      numberOfAttacks: editingAttacks.length,
      attacks: editingAttacks,
      magic: 0,
      magicResistance: 0,
      spReward: Math.max(0, this.normalizeNumber(this.toFiniteNumber(controls.spReward?.value), 0)),
      callsReinforcements: false,
    };

    if (editingId !== null) {
      this.monsterListByDungon.update((allMonsters) => ({
        ...allMonsters,
        [dungonId]: (allMonsters[dungonId] ?? []).map((monster) =>
          monster.id === editingId ? nextMonster : monster
        ),
      }));
    } else {
      this.nextMonsterId += 1;
      this.monsterListByDungon.update((allMonsters) => ({
        ...allMonsters,
        [dungonId]: [...(allMonsters[dungonId] ?? []), nextMonster],
      }));
    }

    this.markDungonJsonChanged();
    this.beginCreateMonster(false);
  }

  beginCreateMonster(clearEditing: boolean = true): void {
    if (clearEditing) {
      this.editingMonsterId.set(null);
    }

    this.editingMonsterKeyIds.set([]);
    this.editingMonsterImageId.set(null);
    this.editingMonsterSoundId.set(null);
    this.editingMonsterTresherIds.set([]);
    this.editingMonsterAttacks.set([]);

    this.monsterForm.reset({
      name: '',
      type: 'Humanoid',
      description: '',
      hp: 1,
      movementEconomy: 0,
      ac: 10,
      runAt: 0,
      numberOfAttacks: 1,
    });
  }

  editSelectedMonster(monsterId: number): void {
    const dungonId = this.selectedDungonId();
    if (dungonId === null) {
      return;
    }

    const selectedMonster = (this.monsterListByDungon()[dungonId] ?? []).find(
      (item) => item.id === monsterId
    );
    if (!selectedMonster) {
      return;
    }

    this.editingMonsterId.set(selectedMonster.id);
    this.editingMonsterKeyIds.set(this.normalizeIdList(selectedMonster.keyIds));
    this.editingMonsterImageId.set(this.normalizeNullableNumber(this.toFiniteNumber(selectedMonster.imageId)));
    this.editingMonsterSoundId.set(this.normalizeNullableNumber(this.toFiniteNumber(selectedMonster.soundId)));
    this.editingMonsterTresherIds.set(this.normalizeIdList(selectedMonster.tresherIds));
    this.editingMonsterAttacks.set(this.normalizeMonsterAttacks(selectedMonster.attacks));
    this.monsterForm.reset({
      name: selectedMonster.name,
      type: selectedMonster.type,
      description: selectedMonster.description,
      hp: selectedMonster.hp,
      movementEconomy: selectedMonster.movementEconomy,
      ac: selectedMonster.ac,
      runAt: selectedMonster.runAt,
      numberOfAttacks: selectedMonster.numberOfAttacks,
    });
  }

  cancelEditMonster(): void {
    this.beginCreateMonster();
  }

  toggleMonsterKey(keyId: number): void {
    const current = this.editingMonsterKeyIds();
    if (current.includes(keyId)) {
      this.editingMonsterKeyIds.set(current.filter((id) => id !== keyId));
    } else {
      this.editingMonsterKeyIds.set([...current, keyId]);
    }
  }

  isKeyAssignedToMonster(keyId: number): boolean {
    return this.editingMonsterKeyIds().includes(keyId);
  }

  isKeyPlaced(keyId: number): boolean {
    const key = this.keyList.find((k) => k.id === keyId);
    if (key !== undefined && key.rownId !== null && key.columnId !== null) {
      return true;
    }
    const dungonId = this.selectedDungonId();
    if (dungonId !== null) {
      const monsterPlacements = this.monsterPlacementsByDungon()[dungonId] ?? [];
      if (monsterPlacements.some((p) => p.keyIds?.includes(keyId))) {
        return true;
      }
    }
    return false;
  }

  getDoorKeyLocation(doorRefId: number): { row: number; column: number } | null {
    const dungonId = this.selectedDungonId();
    if (dungonId === null) return null;

    const key = this.keyList.find((k) => k.doorId === doorRefId);
    if (!key) return null;

    // Key is placed directly on the grid
    if (key.rownId !== null && key.columnId !== null) {
      return { row: key.rownId, column: key.columnId };
    }

    // Key is held by a monster — find which placement
    const monsters = this.monsterListByDungon()[dungonId] ?? [];
    const holderMonster = monsters.find((m) => m.keyIds.includes(key.id));
    if (holderMonster) {
      const placement = (this.monsterPlacementsByDungon()[dungonId] ?? []).find(
        (p) => p.monsterId === holderMonster.id
      );
      if (placement) return { row: placement.row, column: placement.column };
    }

    // Key is inside a tresher — find which tresher placement
    const treshers = this.tresherListByDungon()[dungonId] ?? [];
    const holderTresher = treshers.find((t) => (t as any).keyIds?.includes(key.id));
    if (holderTresher) {
      const placement = (this.tresherPlacementsByDungon()[dungonId] ?? []).find(
        (p) => p.tresherId === holderTresher.id
      );
      if (placement) return { row: placement.row, column: placement.column };
    }

    return null;
  }

  setMonsterDialogImageId(value: string): void {
    this.editingMonsterImageId.set(value ? (parseInt(value, 10) || null) : null);
  }

  setMonsterDialogSoundId(value: string): void {
    this.editingMonsterSoundId.set(value ? (parseInt(value, 10) || null) : null);
  }

  toggleMonsterTresher(tresherId: number): void {
    const current = this.editingMonsterTresherIds();
    if (current.includes(tresherId)) {
      this.editingMonsterTresherIds.set(current.filter((id) => id !== tresherId));
    } else {
      this.editingMonsterTresherIds.set([...current, tresherId]);
    }
  }

  isMonsterTresherSelected(tresherId: number): boolean {
    return this.editingMonsterTresherIds().includes(tresherId);
  }

  addMonsterAttack(): void {
    this.editingMonsterAttacks.update((attacks) => [
      ...attacks,
      { type: 'Bite', description: '', damage: 0, plusToHit: 0, weaponItemId: null, spellId: null, curseId: null },
    ]);
  }

  removeMonsterAttack(idx: number): void {
    this.editingMonsterAttacks.update((attacks) => attacks.filter((_, i) => i !== idx));
  }

  setMonsterAttackType(idx: number, type: string): void {
    this.editingMonsterAttacks.update((attacks) =>
      attacks.map((a, i) => i === idx ? { ...a, type, weaponItemId: null, spellId: null } : a)
    );
  }

  setMonsterAttackDamage(idx: number, value: string): void {
    const damage = Math.max(0, parseInt(value, 10) || 0);
    this.editingMonsterAttacks.update((attacks) =>
      attacks.map((a, i) => i === idx ? { ...a, damage } : a)
    );
  }

  setMonsterAttackHit(idx: number, value: string): void {
    const plusToHit = parseInt(value, 10) || 0;
    this.editingMonsterAttacks.update((attacks) =>
      attacks.map((a, i) => i === idx ? { ...a, plusToHit } : a)
    );
  }

  setMonsterAttackWeaponId(idx: number, value: string): void {
    const weaponItemId = value ? (parseInt(value, 10) || null) : null;
    this.editingMonsterAttacks.update((attacks) =>
      attacks.map((a, i) => i === idx ? { ...a, weaponItemId } : a)
    );
  }

  setMonsterAttackSpellId(idx: number, value: string): void {
    const spellId = value ? (parseInt(value, 10) || null) : null;
    this.editingMonsterAttacks.update((attacks) =>
      attacks.map((a, i) => i === idx ? { ...a, spellId } : a)
    );
  }

  private loadMonsterDialogOptions(): void {
    const userKey = this.account.getKey();
    if (!userKey) return;

    this.http
      .get<{ id: number; name: string; path: string }[]>(`${API_BASE_URL}/images`, {
        params: { userkey: userKey, scope: 'library' },
      })
      .subscribe({
        next: (items) => this.monsterDialogImages.set(items),
        error: () => this.monsterDialogImages.set([]),
      });

    this.http
      .get<{ id: number; name: string; path: string }[]>(`${API_BASE_URL}/sounds`, {
        params: { userkey: userKey, scope: 'library' },
      })
      .subscribe({
        next: (items) => this.monsterDialogSounds.set(items),
        error: () => this.monsterDialogSounds.set([]),
      });

    this.http
      .get<{ id: number; name: string; type: string }[]>(`${API_BASE_URL}/items`, {
        params: { userkey: userKey },
      })
      .subscribe({
        next: (items) =>
          this.monsterDialogWeaponItems.set(
            items.filter((i) => i.type === 'weapon').map((i) => ({ id: i.id, name: i.name }))
          ),
        error: () => this.monsterDialogWeaponItems.set([]),
      });

    this.http
      .get<{ id: number; name: string }[]>(`${API_BASE_URL}/spells`, {
        params: { userkey: userKey },
      })
      .subscribe({
        next: (items) => this.monsterDialogSpells.set(items),
        error: () => this.monsterDialogSpells.set([]),
      });
  }

  saveTresher(): void {
    const dungonId = this.selectedDungonId();
    if (dungonId === null) {
      return;
    }

    const controls = this.tresherForm.controls;
    const name = controls.name.value.trim() || 'Unnamed Tresher';
    const description = controls.description.value.trim();

    const hasTrap = controls.hasTrap.value;
    const tresherTrap: Trap | null = hasTrap
      ? {
          name: controls.trapName.value.trim(),
          description: controls.trapDescription.value.trim(),
          damage: Math.max(0, controls.trapDamage.value),
          damageTo: controls.trapDamageTo.value,
          curseId: controls.trapCurseId.value ?? null,
          toDetect: Math.max(0, controls.trapToDetect.value),
          toDisarm: Math.max(0, controls.trapToDisarm.value),
        }
      : null;

    const nextTresher: Tresher = {
      id: this.nextTresherId,
      name,
      description,
      gold: Math.max(0, this.normalizeNumber(this.toFiniteNumber(controls.gold.value), 0)),
      silver: Math.max(0, this.normalizeNumber(this.toFiniteNumber(controls.silver.value), 0)),
      copper: Math.max(0, this.normalizeNumber(this.toFiniteNumber(controls.copper.value), 0)),
      zinc: Math.max(0, this.normalizeNumber(this.toFiniteNumber(controls.zinc.value), 0)),
      item1Id: this.normalizeNullableNumber(this.toFiniteNumber(controls.item1Id.value)),
      item2Id: this.normalizeNullableNumber(this.toFiniteNumber(controls.item2Id.value)),
      item3Id: this.normalizeNullableNumber(this.toFiniteNumber(controls.item3Id.value)),
      item4Id: this.normalizeNullableNumber(this.toFiniteNumber(controls.item4Id.value)),
      spell1Id: this.normalizeNullableNumber(this.toFiniteNumber(controls.spell1Id.value)),
      spell2Id: this.normalizeNullableNumber(this.toFiniteNumber(controls.spell2Id.value)),
      spell3Id: this.normalizeNullableNumber(this.toFiniteNumber(controls.spell3Id.value)),
      spell4Id: this.normalizeNullableNumber(this.toFiniteNumber(controls.spell4Id.value)),
      curse1Id: this.normalizeNullableNumber(this.toFiniteNumber(controls.curse1Id.value)),
      curse2Id: this.normalizeNullableNumber(this.toFiniteNumber(controls.curse2Id.value)),
      potion1Id: null,
      potion2Id: null,
      potion3Id: null,
      imageId: null,
      soundId: null,
      spReward: Math.max(0, this.normalizeNumber(this.toFiniteNumber(controls.spReward.value), 0)),
      trap: tresherTrap,
    };

    this.nextTresherId += 1;

    this.tresherListByDungon.update((allTreshers) => ({
      ...allTreshers,
      [dungonId]: [...(allTreshers[dungonId] ?? []), nextTresher],
    }));

    this.markDungonJsonChanged();
    this.closeTresherDialog();

    this.tresherForm.reset({
      name: '',
      description: '',
      gold: 0,
      silver: 0,
      copper: 0,
      zinc: 0,
      item1Id: null,
      item2Id: null,
      item3Id: null,
      item4Id: null,
      spell1Id: null,
      spell2Id: null,
      spell3Id: null,
      spell4Id: null,
      curse1Id: null,
      curse2Id: null,
      spReward: 0,
      hasTrap: false,
      trapName: '',
      trapDescription: '',
      trapDamage: 0,
      trapDamageTo: 'HP',
      trapCurseId: null,
      trapToDetect: 10,
      trapToDisarm: 10,
    });
  }

  selectedDungonTreshers(): Tresher[] {
    const dungonId = this.selectedDungonId();
    if (dungonId === null) {
      return [];
    }

    return this.tresherListByDungon()[dungonId] ?? [];
  }

  placeDialogLibraryTreshers(): TresherLibraryItem[] {
    return this.tresherLibrary();
  }

  libraryTresherSourceLabel(tresher: TresherLibraryItem): 'Mine' | 'Public' {
    const userKey = this.account.getKey();
    return tresher.userguid === userKey ? 'Mine' : 'Public';
  }

  hasAnyPlaceableTreshers(): boolean {
    return this.selectedDungonTreshers().length > 0 || this.placeDialogLibraryTreshers().length > 0;
  }

  selectedDungonMonsters(): Monster[] {
    const dungonId = this.selectedDungonId();
    if (dungonId === null) {
      return [];
    }

    return this.monsterListByDungon()[dungonId] ?? [];
  }

  placeDialogLibraryMonsters(): MonsterLibraryItem[] {
    return this.monsterLibrary();
  }

  libraryMonsterSourceLabel(monster: MonsterLibraryItem): 'Mine' | 'Public' {
    const userKey = this.account.getKey();
    return monster.userguid === userKey ? 'Mine' : 'Public';
  }

  hasAnyPlaceableMonsters(): boolean {
    return this.selectedDungonMonsters().length > 0 || this.placeDialogLibraryMonsters().length > 0;
  }

  editingMonsterDisplayName(): string {
    const editingId = this.editingMonsterId();
    if (editingId === null) {
      return 'Create Monster';
    }

    const selected = this.selectedDungonMonsters().find((item) => item.id === editingId);
    if (!selected) {
      return 'Edit Monster';
    }

    return `Edit Monster: ${selected.name}`;
  }

  nearbyItemsForPreview(): NearbyDiscoveryItem[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    const currentRow = preview.centerRow;
    const currentColumn = preview.centerColumn;
    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const forward = this.getMovementDeltaForFacingDirection(cheater.facingDir);
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

    const treshersById = new Map(
      (this.tresherListByDungon()[preview.dungonId] ?? []).map((tresher) => [tresher.id, tresher] as const)
    );

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

    if (this.previewShowMonsters()) {
      const monstersById = new Map(
        (this.monsterListByDungon()[preview.dungonId] ?? []).map((monster) => [monster.id, monster] as const)
      );

      for (const placement of this.monsterPlacementsByDungon()[preview.dungonId] ?? []) {
        if (!isRelevantSquare(placement.row, placement.column)) {
          continue;
        }

        const monster = monstersById.get(placement.monsterId);
        if (!monster) {
          continue;
        }

        const roamText = placement.roam ? 'Roam: true' : 'Roam: false';
        items.push({
          kind: 'Monster',
          name: monster.name.trim() || 'Unnamed Monster',
          description: `${monster.description.trim() || 'No description.'} (${roamText})`,
          row: placement.row,
          column: placement.column,
        });
      }
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

  currentSquareItemsForPreview(): NearbyDiscoveryItem[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    return this.nearbyItemsForPreview().filter(
      (item) => item.row === preview.centerRow && item.column === preview.centerColumn
    );
  }

  hasCurrentSquarePickupItems(): boolean {
    return this.currentSquareItemsForPreview().length > 0;
  }

  canTakeSomeFromCurrentSquare(): boolean {
    const current = this.getCurrentPreviewSquareContext();
    if (!current) {
      return false;
    }

    return this.getTresherPlacementsAtSquare(current.dungonId, current.row, current.column).length > 1;
  }

  lookForTrapsAtCurrentSquare(): void {
    const current = this.getCurrentPreviewSquareContext();
    if (!current) {
      return;
    }

    const treshers = this.getTreshersAtSquare(current.dungonId, current.row, current.column);
    if (treshers.length === 0) {
      this.previewActionMessage.set('No treshers here to inspect for traps.');
      return;
    }

    const trappedTreshers = treshers.filter(
      (tresher) => tresher.curse1Id !== null || tresher.curse2Id !== null
    ).length;

    if (trappedTreshers === 0) {
      this.previewActionMessage.set('No trap signs found on current treshers.');
      return;
    }

    this.previewActionMessage.set(
      `Possible trap signs on ${trappedTreshers} tresher${trappedTreshers === 1 ? '' : 's'}.`
    );
  }

  takeAllFromCurrentSquare(): void {
    const current = this.getCurrentPreviewSquareContext();
    if (!current) {
      return;
    }

    const keysAtSquare = this.getKeysAtSquare(current.row, current.column);
    const tresherPlacements = this.getTresherPlacementsAtSquare(
      current.dungonId,
      current.row,
      current.column
    );
    const treshersAtSquare = this.getTreshersAtSquare(current.dungonId, current.row, current.column);

    if (keysAtSquare.length === 0 && tresherPlacements.length === 0) {
      this.previewActionMessage.set('Nothing to take on this square.');
      return;
    }

    this.addItemsToCheaterInventory(current.dungonId, keysAtSquare, treshersAtSquare);

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
    }

    const totalItemCount = keysAtSquare.length + tresherPlacements.length;
    this.previewActionMessage.set(
      `Took ${totalItemCount} item${totalItemCount === 1 ? '' : 's'} into inventory.`
    );
    this.markDungonJsonChanged();
    this.drawGridCanvas();
    this.drawPreviewGridCanvas();
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

    this.addItemsToCheaterInventory(current.dungonId, [], [tresherToTake]);
    this.removeSingleTresherPlacement(
      current.dungonId,
      current.row,
      current.column,
      placementToTake.tresherId
    );

    const remainingCount = tresherPlacements.length - 1;
    this.previewActionMessage.set(
      `Took 1 tresher. ${remainingCount} tresher${remainingCount === 1 ? '' : 's'} remain here.`
    );
    this.markDungonJsonChanged();
    this.drawGridCanvas();
    this.drawPreviewGridCanvas();
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

  private getTreshersAtSquare(dungonId: number, row: number, column: number): Tresher[] {
    const treshersById = this.getTreshersByIdForDungon(dungonId);
    return this.getTresherPlacementsAtSquare(dungonId, row, column)
      .map((placement) => treshersById.get(placement.tresherId))
      .filter((item): item is Tresher => item !== undefined)
      .map((tresher) => ({ ...tresher }));
  }

  private addItemsToCheaterInventory(dungonId: number, keys: Key[], treshers: Tresher[]): void {
    const existingCheater = this.cheaterByDungon()[dungonId] ?? { ...DEFAULT_CHEATER };
    const existingInventory = this.normalizeCheaterInventory(existingCheater.inventory);

    const inventoryKeys = keys.map((key) => ({
      ...key,
      rownId: null,
      columnId: null,
    }));

    this.cheaterByDungon.update((allCheaters) => ({
      ...allCheaters,
      [dungonId]: {
        ...existingCheater,
        inventory: {
          keys: [...existingInventory.keys, ...inventoryKeys],
          treshers: [...existingInventory.treshers, ...treshers.map((tresher) => ({ ...tresher }))],
        },
      },
    }));
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

  closeGridPreviewModal(): void {
    this.isGridPreviewModalVisible.set(false);
    this.gridPreviewContext.set(null);
    this.previewActionMessage.set(null);
  }

  togglePreviewMonsterInclusion(): void {
    this.previewShowMonsters.update((value) => !value);
    if (this.previewShowMonsters()) {
      this.previewActionMessage.set('Monsters included in preview testing.');
      return;
    }

    this.previewActionMessage.set('Monsters excluded from preview testing.');
  }

  previewCheaterForModal(): Cheater {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return DEFAULT_CHEATER;
    }

    return this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
  }

  previewSquaresForModal(): Record<string, Square> {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return {};
    }

    return this.squaresByDungon()[preview.dungonId] ?? {};
  }

  previewFilledSquaresForModal(): Record<string, true> {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return {};
    }

    return this.filledSquaresByDungon()[preview.dungonId] ?? {};
  }

  previewTresherPlacementsForModal(): TresherPlacement[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    return this.tresherPlacementsByDungon()[preview.dungonId] ?? [];
  }

  previewMonsterPlacementsForModal(): MonsterPlacement[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    return this.monsterPlacementsByDungon()[preview.dungonId] ?? [];
  }

  previewStartPointForModal(): StartPoint | null {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return null;
    }

    return this.startPointByDungon()[preview.dungonId] ?? null;
  }

  previewExitsForModal(): DungonExit[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    return this.exitsByDungon()[preview.dungonId] ?? [];
  }

  previewSquareTextsForModal(): SquareText[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    return this.squareTextsByDungon()[preview.dungonId] ?? [];
  }

  saveDungonJson(): void {
    if (this.isSavingDungonJson()) {
      return;
    }

    const dungonId = this.selectedDungonId();
    if (dungonId === null) {
      return;
    }

    const userKey = this.account.getKey();
    if (!userKey) {
      this.dungonJsonSaveError.set('You must be logged in to save dungon changes.');
      return;
    }

    const payload = this.getDungonJsonPayload(dungonId);
    this.dungonJsonSaveError.set(null);
    this.isSavingDungonJson.set(true);

    this.http
      .put<{ result: number; error?: string }>(
        `${API_BASE_URL}/dungons/${dungonId}/dungonjson`,
        {
          userkey: userKey,
          dungonJson: payload,
        }
      )
      .pipe(finalize(() => this.isSavingDungonJson.set(false)))
      .subscribe({
        next: (response) => {
          if (response.result !== 1) {
            this.dungonJsonSaveError.set(response.error || 'Failed to save dungon json.');
            return;
          }

          this.hasUnsavedDungonJson.set(false);
          this.savedPublishUpdatesByDungon.update((current) => ({
            ...current,
            [dungonId]: true,
          }));
        },
        error: () => {
          this.dungonJsonSaveError.set('Failed to save dungon json.');
        },
      });
  }

  publishDungon(): void {
    if (this.isPublishingDungon()) {
      return;
    }

    const dungonId = this.selectedDungonId();
    if (dungonId === null) {
      return;
    }

    const userKey = this.account.getKey();
    if (!userKey) {
      this.publishDungonError.set('You must be logged in to publish a dungon.');
      return;
    }

    const visibility = this.publishVisibility();
    const friendUserKeys = visibility === 'friends' ? this.publishFriendUserKeys() : [];
    if (visibility === 'friends' && friendUserKeys.length === 0) {
      this.publishDungonError.set('Select at least one friend, or switch publish access to Public.');
      return;
    }

    this.publishDungonError.set(null);
    this.isPublishingDungon.set(true);

    this.http
      .put<{
        result: number;
        error?: string;
        status?: DungonListItem['status'];
        visibility?: PublishVisibility;
      }>(
        `${API_BASE_URL}/dungons/${dungonId}/publish`,
        {
          userkey: userKey,
          visibility,
          friendUserKeys,
        }
      )
      .pipe(finalize(() => this.isPublishingDungon.set(false)))
      .subscribe({
        next: (response) => {
          if (response.result !== 1) {
            this.publishDungonError.set(response.error || 'Failed to publish dungon.');
            return;
          }

          this.publishDungonError.set(null);
          this.isPublishDialogVisible.set(false);

          const nextStatus: DungonListItem['status'] = response.status ?? 'published';
          const currentSelected = this.selectedDungon();
          if (currentSelected && currentSelected.id === dungonId) {
            this.selectedDungon.set({
              ...currentSelected,
              status: nextStatus,
            });
          }

          this.dungons.update((items) =>
            items.map((item) =>
              item.id === dungonId
                ? {
                    ...item,
                    status: nextStatus,
                  }
                : item
            )
          );

          this.savedPublishUpdatesByDungon.update((current) => ({
            ...current,
            [dungonId]: false,
          }));
        },
        error: () => {
          this.publishDungonError.set('Failed to publish dungon.');
        },
      });
  }

  selectedKeyForPlacement(): Key | null {
    const keyId = this.selectedKeyIdForPlacement();
    if (keyId === null) {
      return null;
    }

    return this.keyList.find((item) => item.id === keyId) ?? null;
  }

  keyPositionLabel(key: Key): string {
    if (key.rownId === null || key.columnId === null) {
      return 'row -, col -';
    }

    return `row ${key.rownId}, col ${key.columnId}`;
  }

  onGridCanvasClick(event: MouseEvent): void {
    const dungonId = this.selectedDungonId();
    const canvas = this.gridCanvasRef?.nativeElement;
    if (dungonId === null || !canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) {
      return;
    }

    const column = Math.floor(x / this.gridCellSize);
    const row = Math.floor(y / this.gridCellSize);

    if (
      column < 0 ||
      row < 0 ||
      column >= this.gridColumnCount ||
      row >= this.gridRowCount
    ) {
      return;
    }

    const squareKey = `${row}:${column}`;
    const eraseModeEnabled = this.isMoveMode();
    const filledSquares = this.filledSquaresByDungon()[dungonId] ?? {};
    const isFilledSquare = Boolean(filledSquares[squareKey]);
    const selections = this.openBlockSelections();

    if (this.isWhiteSpacePreviewPickMode()) {
      if (isFilledSquare) {
        this.openGridPreviewAtSquare(dungonId, row, column);
        this.isWhiteSpacePreviewPickMode.set(false);
      }

      return;
    }

    if (this.isStartPointMode()) {
      if (isFilledSquare) {
        this.openStartPointDialog(dungonId, row, column);
        this.isStartPointMode.set(false);
      }

      return;
    }

    if (this.isExitMode()) {
      if (isFilledSquare) {
        this.openExitDialog(dungonId, row, column);
        this.isExitMode.set(false);
      }

      return;
    }

    if (this.isPlaceTresherMode()) {
      if (isFilledSquare) {
        this.openPlaceTresherDialog(dungonId, row, column);
        this.isPlaceTresherMode.set(false);
      }

      return;
    }

    if (this.isPlaceMonsterMode()) {
      if (isFilledSquare) {
        this.openPlaceMonsterDialog(dungonId, row, column);
        this.isPlaceMonsterMode.set(false);
      }

      return;
    }

    if (this.isSelectingGuardSquare()) {
      if (isFilledSquare) {
        this.placeMonsterGuardRow.set(row);
        this.placeMonsterGuardCol.set(column);
        this.isSelectingGuardSquare.set(false);
        this.isPlaceMonsterDialogVisible.set(true);
      }

      return;
    }

    if (this.isAddTextMode()) {
      if (isFilledSquare) {
        this.openTextDialog(dungonId, row, column);
        this.isAddTextMode.set(false);
      }

      return;
    }

    if (this.isPlaceFloorTrapMode()) {
      if (isFilledSquare) {
        this.openFloorTrapDialog(dungonId, row, column);
        this.isPlaceFloorTrapMode.set(false);
      }

      return;
    }

    if (this.portalPickMode() !== null) {
      if (isFilledSquare) {
        const portalId = this.portalPickingId();
        const step = this.portalPickMode();
        if (portalId !== null && step !== null) {
          this.setPortalPoint(dungonId, portalId, step, row, column);
        }
      }

      return;
    }

    const selectedKeyId = this.selectedKeyIdForPlacement();
    if (selectedKeyId !== null) {
      this.keyList = this.keyList.map((key) =>
        key.id === selectedKeyId
          ? {
              ...key,
              rownId: row,
              columnId: column,
            }
          : key
      );

      this.selectedKeyIdForPlacement.set(null);
      this.markDungonJsonChanged();
      this.drawGridCanvas();
      return;
    }

    if (eraseModeEnabled) {
      if (!isFilledSquare) {
        return;
      }

      this.filledSquaresByDungon.update((allSquares) => {
        const existingForDungon = allSquares[dungonId] ?? {};
        const { [squareKey]: _removed, ...remainingSquares } = existingForDungon;
        return {
          ...allSquares,
          [dungonId]: remainingSquares,
        };
      });

      this.squaresByDungon.update((allSquares) => {
        const existingForDungon = allSquares[dungonId] ?? {};
        const remainingSquares = this.removeSquareAndRestoreNeighborWalls(
          row,
          column,
          existingForDungon
        );
        return {
          ...allSquares,
          [dungonId]: remainingSquares,
        };
      });

      this.removeTresherPlacementsAtSquare(dungonId, row, column);
      this.removeMonsterPlacementsAtSquare(dungonId, row, column);
      this.removeExitsAtSquare(dungonId, row, column);

      this.markDungonJsonChanged();
      this.drawGridCanvas();
      return;
    }

    const hasDoorSelection = this.hasAnyDoorSelection(selections);
    if (hasDoorSelection) {
      this.openDoorPlacementDialog(
        dungonId,
        row,
        column,
        !isFilledSquare,
        selections,
        squareKey
      );
      return;
    }

    const hasWallSelection = this.hasAnyWallSelection(selections);
    if (hasWallSelection && isFilledSquare) {
      this.squaresByDungon.update((allSquares) => ({
        ...allSquares,
        [dungonId]: this.applyDoorToExistingSquare(
          row,
          column,
          allSquares[dungonId] ?? {},
          selections,
          null
        ),
      }));
      this.openBlockSelections.set({ ...EMPTY_OPEN_BLOCK_SELECTIONS });
      this.markDungonJsonChanged();
      this.drawGridCanvas();
      return;
    }

    if (isFilledSquare) {
      return;
    }

    this.filledSquaresByDungon.update((allSquares) => ({
      ...allSquares,
      [dungonId]: {
        ...(allSquares[dungonId] ?? {}),
        [squareKey]: true,
      },
    }));

    this.squaresByDungon.update((allSquares) => ({
      ...allSquares,
      [dungonId]: this.addSquareWithSharedWallCleanup(
        row,
        column,
        allSquares[dungonId] ?? {},
        selections,
        null
      ),
    }));

    this.openBlockSelections.set({ ...EMPTY_OPEN_BLOCK_SELECTIONS });
    this.markDungonJsonChanged();
    this.drawGridCanvas();
  }

  selectDungon(dungonId: number): void {
    const userKey = this.account.getKey();
    if (!userKey) {
      this.selectedDungon.set(null);
      this.selectedDungonId.set(null);
      this.publishVisibility.set('public');
      this.publishFriendUserKeys.set([]);
      this.isPublishDialogVisible.set(false);
      this.selectedDungonError.set('Please log in to view dungon details.');
      return;
    }

    this.isCreateFormVisible.set(false);
    this.saveError.set(null);
    this.selectedDungonError.set(null);
    this.dungonJsonSaveError.set(null);
    this.publishDungonError.set(null);
    this.publishVisibility.set('public');
    this.publishFriendUserKeys.set([]);
    this.isPublishDialogVisible.set(false);
    this.exitDialogError.set(null);
    this.previewActionMessage.set(null);
    this.hasUnsavedDungonJson.set(false);
    this.isKaysDialogVisible.set(false);
    this.isWhiteSpacePreviewPickMode.set(false);
    this.isGridPreviewModalVisible.set(false);
    this.isStartPointMode.set(false);
    this.isExitMode.set(false);
    this.isPlaceTresherMode.set(false);
    this.isPlaceMonsterMode.set(false);
    this.isAddTextMode.set(false);
    this.isStartPointDialogVisible.set(false);
    this.isExitDialogVisible.set(false);
    this.isTresherDialogVisible.set(false);
    this.isMonsterDialogVisible.set(false);
    this.isPlaceTresherDialogVisible.set(false);
    this.isPlaceMonsterDialogVisible.set(false);
    this.isPublishingDungon.set(false);
    this.selectedKeyIdForPlacement.set(null);
    this.pendingStartPointPlacement.set(null);
    this.pendingExitPlacement.set(null);
    this.pendingTresherPlacement.set(null);
    this.pendingMonsterPlacement.set(null);
    this.editingMonsterId.set(null);
    this.placeMonsterRoam.set(false);
    this.placeMonsterDropTresherIds.set([]);
    this.placeMonsterDropKeyIds.set([]);
    this.placeMonsterIsDormant.set(false);
    this.placeMonsterGuardRow.set(null);
    this.placeMonsterGuardCol.set(null);
    this.isSelectingGuardSquare.set(false);
    this.gridPreviewContext.set(null);
    this.selectedDungonId.set(dungonId);
    this.selectedDungon.set(null);
    this.isSelectedDungonExpanded.set(false);
    this.isMoveMode.set(false);
    this.openBlockSelections.set({ ...EMPTY_OPEN_BLOCK_SELECTIONS });
    this.isLoadingSelectedDungon.set(true);
    this.loadPublishFriends();

    this.http
      .get<DungonDetails>(`${API_BASE_URL}/dungons/${dungonId}`, {
        params: { userkey: userKey },
      })
      .pipe(finalize(() => this.isLoadingSelectedDungon.set(false)))
      .subscribe({
        next: (dungon) => {
          this.selectedDungon.set(dungon);
          this.loadDungonJsonState(dungonId, dungon.dungenJson);
          this.hasUnsavedDungonJson.set(false);
          this.dungonJsonSaveError.set(null);
        },
        error: () => {
          this.selectedDungon.set(null);
          this.selectedDungonError.set('Failed to load dungon details.');
        },
      });
  }

  saveCreateForm(): void {
    if (this.isSaving()) {
      return;
    }

    if (this.createDungonForm.invalid) {
      this.createDungonForm.markAllAsTouched();
      return;
    }

    const name = this.createDungonForm.controls.name.value.trim();
    if (!name) {
      this.createDungonForm.controls.name.setErrors({ required: true });
      return;
    }

    const minsplifetime = this.createDungonForm.controls.minsplifetime.value;
    const maxsplifetime = this.createDungonForm.controls.maxsplifetime.value;

    if (minsplifetime > maxsplifetime) {
      this.createDungonForm.controls.minsplifetime.setErrors({ invalidRange: true });
      this.createDungonForm.markAllAsTouched();
      return;
    }

    const userKey = this.account.getKey();
    if (!userKey) {
      this.saveError.set('You must be logged in to save a dungon.');
      return;
    }

    const description = this.createDungonForm.controls.description.value.trim();
    const intro = this.createDungonForm.controls.intro.value.trim();

    this.isSaving.set(true);
    this.saveError.set(null);

    const spreward = this.createDungonForm.controls.spreward.value;
    const ismaingame = this.account.isAdmin() ? this.createDungonForm.controls.ismaingame.value : false;
    const issample = this.account.isAdmin() ? this.createDungonForm.controls.issample.value : false;

    this.http
      .post<{ result: number; dungon?: { name: string; id: number } }>(`${API_BASE_URL}/dungons`, {
        userkey: userKey,
        name,
        description,
        intro,
        minsplifetime,
        maxsplifetime,
        spreward,
        ismaingame,
        issample,
      })
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (response) => {
          const savedDungon = response.dungon;
          if (response.result !== 1 || !savedDungon) {
            this.saveError.set('Failed to save dungon.');
            return;
          }

          this.loadDungons();
          this.cancelCreateForm();
        },
        error: () => {
          this.saveError.set('Failed to save dungon.');
        },
      });
  }

  cancelCreateForm(): void {
    this.isCreateFormVisible.set(false);
    this.saveError.set(null);
    this.createDungonForm.reset({
      name: '',
      description: '',
      intro: '',
      minsplifetime: 0,
      maxsplifetime: 1000000,
      spreward: 0,
    });
  }

  showEditMetadataForm(): void {
    const selected = this.selectedDungon();
    if (!selected) {
      return;
    }

    this.editMetadataForm.reset({
      name: selected.name,
      description: selected.description,
      intro: selected.intro,
      minsplifetime: selected.minsplifetime,
      maxsplifetime: selected.maxsplifetime,
      spreward: selected.spreward,
    });

    this.isEditMetadataFormVisible.set(true);
    this.metadataSaveError.set(null);
  }

  cancelEditMetadataForm(): void {
    this.isEditMetadataFormVisible.set(false);
    this.metadataSaveError.set(null);
    this.editMetadataForm.reset();
  }

  saveEditMetadataForm(): void {
    if (this.isSavingMetadata()) {
      return;
    }

    if (this.editMetadataForm.invalid) {
      this.editMetadataForm.markAllAsTouched();
      return;
    }

    const selected = this.selectedDungon();
    if (!selected) {
      this.metadataSaveError.set('No dungon selected.');
      return;
    }

    const userKey = this.account.getKey();
    if (!userKey) {
      this.metadataSaveError.set('You must be logged in.');
      return;
    }

    const name = this.editMetadataForm.controls.name.value.trim();
    if (!name) {
      this.editMetadataForm.controls.name.setErrors({ required: true });
      return;
    }

    const minsplifetime = this.editMetadataForm.controls.minsplifetime.value;
    const maxsplifetime = this.editMetadataForm.controls.maxsplifetime.value;

    if (minsplifetime > maxsplifetime) {
      this.editMetadataForm.controls.minsplifetime.setErrors({ invalidRange: true });
      this.editMetadataForm.markAllAsTouched();
      return;
    }

    const description = this.editMetadataForm.controls.description.value.trim();
    const intro = this.editMetadataForm.controls.intro.value.trim();

    this.isSavingMetadata.set(true);
    this.metadataSaveError.set(null);

    this.http
      .put<{ result: number; dungon?: DungonDetails }>(
        `${API_BASE_URL}/dungons/${selected.id}/metadata`,
        {
          userkey: userKey,
          name,
          description,
          intro,
          minsplifetime,
          maxsplifetime,
        }
      )
      .pipe(finalize(() => this.isSavingMetadata.set(false)))
      .subscribe({
        next: (response) => {
          if (response.result !== 1 || !response.dungon) {
            this.metadataSaveError.set('Failed to save metadata.');
            return;
          }

          this.selectedDungon.set(response.dungon);
          this.loadDungons();
          this.cancelEditMetadataForm();
        },
        error: () => {
          this.metadataSaveError.set('Failed to save metadata.');
        },
      });
  }

  private loadDungons(): void {
    const userKey = this.account.getKey();
    if (!userKey) {
      this.dungons.set([]);
      this.loadError.set('Please log in to view your dungons.');
      return;
    }

    this.isLoadingDungons.set(true);
    this.loadError.set(null);

    this.http
      .get<DungonListItem[]>(`${API_BASE_URL}/dungons`, {
        params: { userkey: userKey },
      })
      .pipe(finalize(() => this.isLoadingDungons.set(false)))
      .subscribe({
        next: (items) => {
          this.dungons.set(items);
        },
        error: () => {
          this.dungons.set([]);
          this.loadError.set('Failed to load dungons.');
        },
      });
  }

  private loadPublishFriends(): void {
    const userKey = this.account.getKey();
    if (!userKey) {
      this.isLoadingPublishFriends.set(false);
      this.publishFriends.set([]);
      this.publishFriendsError.set('Please log in to load your friends.');
      return;
    }

    this.isLoadingPublishFriends.set(true);
    this.publishFriendsError.set(null);

    this.http
      .get<CreatorFriendListItem[]>(`${API_BASE_URL}/friends`, {
        params: { userkey: userKey },
      })
      .pipe(finalize(() => this.isLoadingPublishFriends.set(false)))
      .subscribe({
        next: (items) => {
          this.publishFriends.set(items);
          const validFriendUserKeys = new Set(items.map((item) => item.friendurid));
          this.publishFriendUserKeys.update((selectedKeys) =>
            selectedKeys.filter((selectedKey) => validFriendUserKeys.has(selectedKey))
          );
        },
        error: () => {
          this.publishFriends.set([]);
          this.publishFriendsError.set('Failed to load your friends.');
        },
      });
  }

  private loadTresherLibrary(): void {
    const userKey = this.account.getKey();
    if (!userKey) {
      this.tresherLibrary.set([]);
      this.tresherLibraryError.set('Please log in to load your/public treshers.');
      return;
    }

    this.isLoadingTresherLibrary.set(true);
    this.tresherLibraryError.set(null);

    this.http
      .get<unknown[]>(`${API_BASE_URL}/treshers`, {
        params: { userkey: userKey, scope: 'library' },
      })
      .pipe(finalize(() => this.isLoadingTresherLibrary.set(false)))
      .subscribe({
        next: (items) => {
          this.tresherLibrary.set(this.parseTresherLibraryItems(items));
        },
        error: () => {
          this.tresherLibrary.set([]);
          this.tresherLibraryError.set('Failed to load your/public treshers.');
        },
      });
  }

  private parseTresherLibraryItems(items: unknown[]): TresherLibraryItem[] {
    const currentUserKey = this.account.getKey();
    const parsedItems = items
      .map((item) => this.parseTresherLibraryItem(item))
      .filter((item): item is TresherLibraryItem => item !== null);

    return parsedItems.sort((left, right) => {
      const leftMine = left.userguid === currentUserKey;
      const rightMine = right.userguid === currentUserKey;
      if (leftMine !== rightMine) {
        return leftMine ? -1 : 1;
      }

      const leftTime = Date.parse(left.updatedAt);
      const rightTime = Date.parse(right.updatedAt);
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
        return rightTime - leftTime;
      }

      return right.id - left.id;
    });
  }

  private parseTresherLibraryItem(item: unknown): TresherLibraryItem | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const source = item as {
      userguid?: unknown;
      isPublic?: unknown;
      ispublic?: unknown;
      createdAt?: unknown;
      createdat?: unknown;
      updatedAt?: unknown;
      updatedat?: unknown;
    };

    const parsedTresher = this.parseTresherItem(item);
    if (!parsedTresher || typeof source.userguid !== 'string' || !source.userguid.trim()) {
      return null;
    }

    return {
      ...parsedTresher,
      userguid: source.userguid,
      isPublic: source.isPublic === true || source.ispublic === true,
      createdAt:
        typeof source.createdAt === 'string'
          ? source.createdAt
          : typeof source.createdat === 'string'
            ? source.createdat
            : '',
      updatedAt:
        typeof source.updatedAt === 'string'
          ? source.updatedAt
          : typeof source.updatedat === 'string'
            ? source.updatedat
            : '',
    };
  }

  private loadMonsterLibrary(): void {
    const userKey = this.account.getKey();
    if (!userKey) {
      this.monsterLibrary.set([]);
      this.monsterLibraryError.set('Please log in to load your/public monsters.');
      return;
    }

    this.isLoadingMonsterLibrary.set(true);
    this.monsterLibraryError.set(null);

    this.http
      .get<unknown[]>(`${API_BASE_URL}/monsters`, {
        params: { userkey: userKey, scope: 'library' },
      })
      .pipe(finalize(() => this.isLoadingMonsterLibrary.set(false)))
      .subscribe({
        next: (items) => {
          this.monsterLibrary.set(this.parseMonsterLibraryItems(items));
        },
        error: () => {
          this.monsterLibrary.set([]);
          this.monsterLibraryError.set('Failed to load your/public monsters.');
        },
      });
  }

  private parseMonsterLibraryItems(items: unknown[]): MonsterLibraryItem[] {
    const currentUserKey = this.account.getKey();
    const parsedItems = items
      .map((item) => this.parseMonsterLibraryItem(item))
      .filter((item): item is MonsterLibraryItem => item !== null);

    return parsedItems.sort((left, right) => {
      const leftMine = left.userguid === currentUserKey;
      const rightMine = right.userguid === currentUserKey;
      if (leftMine !== rightMine) {
        return leftMine ? -1 : 1;
      }

      const leftTime = Date.parse(left.updatedAt);
      const rightTime = Date.parse(right.updatedAt);
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
        return rightTime - leftTime;
      }

      return right.id - left.id;
    });
  }

  private parseMonsterLibraryItem(item: unknown): MonsterLibraryItem | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const source = item as {
      userguid?: unknown;
      isPublic?: unknown;
      ispublic?: unknown;
      createdAt?: unknown;
      createdat?: unknown;
      updatedAt?: unknown;
      updatedat?: unknown;
    };

    const parsedMonster = this.parseMonsterItem(item);
    if (!parsedMonster || typeof source.userguid !== 'string' || !source.userguid.trim()) {
      return null;
    }

    return {
      ...parsedMonster,
      userguid: source.userguid,
      isPublic: source.isPublic === true || source.ispublic === true,
      createdAt:
        typeof source.createdAt === 'string'
          ? source.createdAt
          : typeof source.createdat === 'string'
            ? source.createdat
            : '',
      updatedAt:
        typeof source.updatedAt === 'string'
          ? source.updatedAt
          : typeof source.updatedat === 'string'
            ? source.updatedat
            : '',
    };
  }

  private openDoorPlacementDialog(
    dungonId: number,
    row: number,
    column: number,
    isNewSquare: boolean,
    selections: Record<OpenBlockOptionKey, boolean>,
    squareKey: string
  ): void {
    this.pendingDoorPlacement.set({
      dungonId,
      row,
      column,
      squareKey,
      isNewSquare,
      selections: { ...selections },
    });

    this.doorDialogError.set(null);
    this.doorForm.reset({
      state: 'closed',
      hp: 10,
      isLocked: false,
      toPick: null,
      name: '',
      description: '',
      hasTrap: false,
      trapName: '',
      trapDescription: '',
      trapDamage: 0,
      trapDamageTo: 'HP',
      trapCurseId: null,
      trapToDetect: 10,
      trapToDisarm: 10,
    });
    this.isDoorDialogVisible.set(true);
  }

  private closeDoorPlacementDialog(): void {
    this.isDoorDialogVisible.set(false);
    this.pendingDoorPlacement.set(null);
    this.doorDialogError.set(null);
  }

  private openStartPointDialog(dungonId: number, row: number, column: number): void {
    const currentStartPoint = this.startPointByDungon()[dungonId];
    this.pendingStartPointPlacement.set({
      dungonId,
      row,
      column,
    });

    this.startPointForm.reset({
      description: currentStartPoint?.description ?? '',
      playerSees: currentStartPoint?.playerSees ?? '',
    });

    this.isStartPointDialogVisible.set(true);
  }

  private closeStartPointDialog(): void {
    this.isStartPointDialogVisible.set(false);
    this.pendingStartPointPlacement.set(null);
  }

  private openExitDialog(dungonId: number, row: number, column: number): void {
    const existingExit = (this.exitsByDungon()[dungonId] ?? []).find(
      (item) => item.row === row && item.column === column
    );
    const destinationOptions = this.dungons().filter((item) => item.id !== dungonId);
    const destinationType: ExitDestinationType = existingExit
      ? existingExit.destinationType === 'dungon' && destinationOptions.length === 0
        ? 'outside'
        : existingExit.destinationType
      : destinationOptions.length > 0
        ? 'dungon'
        : 'outside';
    const destinationDungonId =
      destinationType === 'dungon'
        ? existingExit?.destinationDungonId ?? destinationOptions[0]?.id ?? null
        : null;

    this.pendingExitPlacement.set({
      dungonId,
      row,
      column,
    });

    this.exitForm.reset({
      destinationType,
      destinationDungonId,
      transitionType: existingExit?.transitionType ?? 'open',
    });
    this.exitDialogError.set(null);
    this.isExitDialogVisible.set(true);
  }

  private closeExitDialog(): void {
    this.isExitDialogVisible.set(false);
    this.pendingExitPlacement.set(null);
    this.exitDialogError.set(null);
  }

  private openPlaceTresherDialog(dungonId: number, row: number, column: number): void {
    this.pendingTresherPlacement.set({
      dungonId,
      row,
      column,
    });

    this.isKaysDialogVisible.set(false);
    this.isTresherDialogVisible.set(false);
    this.isMonsterDialogVisible.set(false);
    this.isPlaceMonsterDialogVisible.set(false);
    this.loadTresherLibrary();
    this.isPlaceTresherDialogVisible.set(true);
  }

  private openPlaceMonsterDialog(dungonId: number, row: number, column: number): void {
    this.pendingMonsterPlacement.set({
      dungonId,
      row,
      column,
    });

    this.placeMonsterRoam.set(false);
    this.placeMonsterDropTresherIds.set([]);
    this.placeMonsterDropKeyIds.set([]);
    this.placeMonsterIsDormant.set(false);
    this.placeMonsterGuardRow.set(null);
    this.placeMonsterGuardCol.set(null);
    this.isSelectingGuardSquare.set(false);
    this.isKaysDialogVisible.set(false);
    this.isTresherDialogVisible.set(false);
    this.isMonsterDialogVisible.set(false);
    this.isPlaceTresherDialogVisible.set(false);
    this.loadMonsterLibrary();
    this.isPlaceMonsterDialogVisible.set(true);
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

  private removeMonsterPlacementsAtSquare(dungonId: number, row: number, column: number): void {
    this.monsterPlacementsByDungon.update((allPlacements) => {
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

  private removeExitsAtSquare(dungonId: number, row: number, column: number): void {
    this.exitsByDungon.update((allExits) => {
      const existingExits = allExits[dungonId] ?? [];
      const filteredExits = existingExits.filter(
        (item) => item.row !== row || item.column !== column
      );

      if (filteredExits.length === existingExits.length) {
        return allExits;
      }

      return {
        ...allExits,
        [dungonId]: filteredExits,
      };
    });
  }

  private markDungonJsonChanged(): void {
    const dungonId = this.selectedDungonId();
    if (dungonId === null) {
      return;
    }

    this.hasUnsavedDungonJson.set(true);
    this.dungonJsonSaveError.set(null);

    const selectedDungon = this.selectedDungon();
    if (selectedDungon && selectedDungon.id === dungonId && selectedDungon.status === 'published') {
      this.savedPublishUpdatesByDungon.update((current) => ({
        ...current,
        [dungonId]: false,
      }));
    }
  }

  private getDungonJsonPayload(dungonId: number): DungonJsonPayload {
    const tresherPlacements = this.tresherPlacementsByDungon()[dungonId] ?? [];
    const monsterPlacements = this.monsterPlacementsByDungon()[dungonId] ?? [];
    const exits = this.exitsByDungon()[dungonId] ?? [];
    const floorTrapPlacements = this.floorTrapPlacementsByDungon()[dungonId] ?? [];
    const portalPlacements = this.portalPlacementsByDungon()[dungonId] ?? [];

    return {
      filledSquares: this.filledSquaresByDungon()[dungonId] ?? {},
      squares: this.squaresByDungon()[dungonId] ?? {},
      keyList: this.keyList,
      cheater: this.cheaterByDungon()[dungonId] ?? { ...DEFAULT_CHEATER },
      startpoint: this.startPointByDungon()[dungonId] ?? null,
      tresherList: this.tresherListByDungon()[dungonId] ?? [],
      tresherPlacements,
      monsterList: this.monsterListByDungon()[dungonId] ?? [],
      monsterPlacements,
      exits,
      exitList: exits,
      // Keep legacy aliases in saved JSON so older readers still preserve placement spots.
      tresherPlacementList: tresherPlacements,
      trasherPlacements: tresherPlacements,
      monsterPlacementList: monsterPlacements,
      monsters: this.monsterListByDungon()[dungonId] ?? [],
      squareTexts: this.squareTextsByDungon()[dungonId] ?? [],
      floorTrapPlacements,
      portalPlacements,
    };
  }

  private loadDungonJsonState(dungonId: number, rawDungonJson: unknown): void {
    const parsed = this.parseDungonJsonPayload(rawDungonJson);

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
      [dungonId]: parsed.cheater,
    }));

    this.startPointByDungon.update((allStartPoints) => ({
      ...allStartPoints,
      [dungonId]: parsed.startpoint,
    }));

    this.exitsByDungon.update((allExits) => ({
      ...allExits,
      [dungonId]: parsed.exits ?? [],
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
      [dungonId]: parsed.monsterList ?? [],
    }));

    this.monsterPlacementsByDungon.update((allPlacements) => ({
      ...allPlacements,
      [dungonId]: parsed.monsterPlacements ?? [],
    }));

    this.squareTextsByDungon.update((allTexts) => ({
      ...allTexts,
      [dungonId]: parsed.squareTexts ?? [],
    }));

    this.floorTrapPlacementsByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.floorTrapPlacements ?? [],
    }));

    this.portalPlacementsByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.portalPlacements ?? [],
    }));

    this.keyList = parsed.keyList;
    this.syncIdsFromLoadedData(
      parsed.squares,
      parsed.keyList,
      parsed.tresherList,
      parsed.monsterList ?? [],
      parsed.exits ?? [],
      parsed.squareTexts ?? [],
      parsed.portalPlacements ?? []
    );
    this.drawGridCanvas();
  }

  private parseDungonJsonPayload(rawDungonJson: unknown): DungonJsonPayload {
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
        exits: [],
        squareTexts: [],
      };
    }

    const source = rawDungonJson as Partial<DungonJsonPayload> & {
      startPoint?: unknown;
      trasherPlacements?: unknown[];
      tresherPlacementList?: unknown[];
      monsterList?: unknown[];
      monsters?: unknown[];
      monsterPlacements?: unknown[];
      monsterPlacementList?: unknown[];
      squareTexts?: unknown[];
    };
    const filledSquaresSource =
      source.filledSquares && typeof source.filledSquares === 'object'
        ? (source.filledSquares as Record<string, unknown>)
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
      source.squares && typeof source.squares === 'object'
        ? (source.squares as Record<string, Square>)
        : {};
    const squares = this.synchronizeDoorConnections(rawSquares);

    const keyList = Array.isArray(source.keyList)
      ? source.keyList
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
              description:
                typeof sourceKey.description === 'string' ? sourceKey.description : '',
              doorId: typeof sourceKey.doorId === 'number' ? sourceKey.doorId : null,
              rownId: typeof sourceKey.rownId === 'number' ? sourceKey.rownId : null,
              columnId: typeof sourceKey.columnId === 'number' ? sourceKey.columnId : null,
            } as Key;
          })
          .filter((item): item is Key => item !== null)
      : [];

    const sourceCheater =
      source.cheater && typeof source.cheater === 'object'
        ? (source.cheater as Partial<Cheater> & {
            inventory?: unknown;
            inventoryKeys?: unknown[];
            inventoryTreshers?: unknown[];
          })
        : {};

    const inventory = this.parseCheaterInventory(sourceCheater);

    const cheater: Cheater = {
      name:
        typeof sourceCheater.name === 'string' && sourceCheater.name.trim()
          ? sourceCheater.name
          : DEFAULT_CHEATER.name,
      rangeOfSight:
        typeof sourceCheater.rangeOfSight === 'number' && Number.isFinite(sourceCheater.rangeOfSight)
          ? sourceCheater.rangeOfSight
          : DEFAULT_CHEATER.rangeOfSight,
      facingDir: this.normalizeFacingDirection(sourceCheater.facingDir),
      inventory,
    };

    const sourceStartPointRaw =
      source.startpoint && typeof source.startpoint === 'object'
        ? source.startpoint
        : source.startPoint && typeof source.startPoint === 'object'
          ? source.startPoint
          : null;

    let startpoint: StartPoint | null = null;
    if (sourceStartPointRaw) {
      const sourceStartPoint = sourceStartPointRaw as Partial<StartPoint>;
      const parsedRow =
        typeof sourceStartPoint.row === 'number' && Number.isFinite(sourceStartPoint.row)
          ? Math.floor(sourceStartPoint.row)
          : null;
      const parsedCol =
        typeof sourceStartPoint.col === 'number' && Number.isFinite(sourceStartPoint.col)
          ? Math.floor(sourceStartPoint.col)
          : null;

      if (parsedRow !== null && parsedCol !== null) {
        startpoint = {
          row: parsedRow,
          col: parsedCol,
          description:
            typeof sourceStartPoint.description === 'string'
              ? sourceStartPoint.description
              : '',
          playerSees:
            typeof sourceStartPoint.playerSees === 'string'
              ? sourceStartPoint.playerSees
              : '',
        };
      }
    }

    const sourceTresherList =
      Array.isArray((source as { tresherList?: unknown[] }).tresherList)
        ? ((source as { tresherList?: unknown[] }).tresherList ?? [])
        : Array.isArray((source as { trasherList?: unknown[] }).trasherList)
          ? ((source as { trasherList?: unknown[] }).trasherList ?? [])
        : Array.isArray((source as { tresher?: unknown[] }).tresher)
          ? ((source as { tresher?: unknown[] }).tresher ?? [])
          : [];

    const tresherList = sourceTresherList
      .map((item) => this.parseTresherItem(item))
      .filter((item): item is Tresher => item !== null);

    const sourceTresherPlacements = Array.isArray(source.tresherPlacements)
      ? source.tresherPlacements
      : Array.isArray(source.tresherPlacementList)
        ? source.tresherPlacementList
        : Array.isArray(source.trasherPlacements)
          ? source.trasherPlacements
          : [];

    const validTresherIds = new Set(tresherList.map((tresher) => tresher.id));
    const tresherPlacements = sourceTresherPlacements
      .map((item) => this.parseTresherPlacementItem(item))
      .filter(
        (item): item is TresherPlacement => item !== null && validTresherIds.has(item.tresherId)
      );

    const sourceMonsterList = Array.isArray(source.monsterList)
      ? source.monsterList
      : Array.isArray(source.monsters)
        ? source.monsters
        : [];

    const monsterList = sourceMonsterList
      .map((item) => this.parseMonsterItem(item))
      .filter((item): item is Monster => item !== null);

    const sourceMonsterPlacements = Array.isArray(source.monsterPlacements)
      ? source.monsterPlacements
      : Array.isArray(source.monsterPlacementList)
        ? source.monsterPlacementList
        : [];

    const validMonsterIds = new Set(monsterList.map((monster) => monster.id));
    const monsterPlacements = sourceMonsterPlacements
      .map((item) => this.parseMonsterPlacementItem(item))
      .filter(
        (item): item is MonsterPlacement => item !== null && validMonsterIds.has(item.monsterId)
      );

    const sourceExitList = Array.isArray(source.exits)
      ? source.exits
      : Array.isArray(source.exitList)
        ? source.exitList
        : [];

    const exits = sourceExitList
      .map((item) => this.parseExitItem(item))
      .filter((item): item is DungonExit => item !== null);

    const squareTexts: SquareText[] = Array.isArray(source.squareTexts)
      ? (source.squareTexts as unknown[])
          .filter(
            (item): item is Record<string, unknown> =>
              !!item && typeof item === 'object'
          )
          .map((item) => ({
            id: Math.max(0, Math.floor(Number(item['id']) || 0)),
            row: Math.max(0, Math.floor(Number(item['row']) || 0)),
            column: Math.max(0, Math.floor(Number(item['column']) || 0)),
            text: typeof item['text'] === 'string' ? item['text'] : '',
            wallSide: normalizeSquareTextWallSide(item['wallSide']),
          }))
          .filter((st) => st.text.trim().length > 0)
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
      exits,
      squareTexts,
      floorTrapPlacements: this.parseFloorTrapPlacements((source as Record<string, unknown>)['floorTrapPlacements']),
      portalPlacements: this.parsePortalPlacements((source as Record<string, unknown>)['portalPlacements']),
    };
  }

  private parseFloorTrapPlacements(raw: unknown): FloorTrapPlacement[] {
    if (!Array.isArray(raw)) return [];
    let maxId = 0;
    const result: FloorTrapPlacement[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const src = item as Partial<Record<string, unknown>>;
      const id = typeof src['id'] === 'number' ? Math.floor(src['id']) : 0;
      const row = typeof src['row'] === 'number' ? Math.floor(src['row']) : null;
      const column = typeof src['column'] === 'number' ? Math.floor(src['column']) : null;
      if (row === null || column === null) continue;
      const trap = this.parseTrapObject(src['trap']);
      if (!trap) continue;
      result.push({
        id,
        row,
        column,
        trap,
        isTriggered: Boolean(src['isTriggered']),
        isDisarmed: Boolean(src['isDisarmed']),
        isDetected: src['isDetected'] === true,
      });
      if (id > maxId) maxId = id;
    }
    if (maxId >= this.nextFloorTrapId) {
      this.nextFloorTrapId = maxId + 1;
    }
    return result;
  }

  private parseTrapObject(raw: unknown): Trap | null {
    if (!raw || typeof raw !== 'object') return null;
    const src = raw as Partial<Record<string, unknown>>;
    const damageTo = src['damageTo'] === 'Stamina' ? 'Stamina' : src['damageTo'] === 'Mind' ? 'Mind' : 'HP';
    return {
      name: typeof src['name'] === 'string' ? src['name'] : '',
      description: typeof src['description'] === 'string' ? src['description'] : '',
      damage: typeof src['damage'] === 'number' ? Math.max(0, src['damage']) : 0,
      damageTo: damageTo as 'HP' | 'Stamina' | 'Mind',
      curseId: typeof src['curseId'] === 'number' ? src['curseId'] : null,
      toDetect: typeof src['toDetect'] === 'number' ? Math.max(0, src['toDetect']) : 10,
      toDisarm: typeof src['toDisarm'] === 'number' ? Math.max(0, src['toDisarm']) : 10,
    };
  }

  private parsePortalPlacements(raw: unknown): PortalPlacement[] {
    if (!Array.isArray(raw)) return [];
    let maxId = 0;
    const result: PortalPlacement[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const src = item as Partial<Record<string, unknown>>;
      const id = typeof src['id'] === 'number' ? Math.floor(src['id']) : 0;
      const look: PortalLook =
        src['look'] === 'starDown' ? 'starDown' :
        src['look'] === 'magicDoor' ? 'magicDoor' : 'starUp';
      const toNullableInt = (v: unknown): number | null =>
        typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : null;
      result.push({
        id,
        name: typeof src['name'] === 'string' ? src['name'] : '',
        description: typeof src['description'] === 'string' ? src['description'] : '',
        look,
        startRow: toNullableInt(src['startRow']),
        startColumn: toNullableInt(src['startColumn']),
        endRow: toNullableInt(src['endRow']),
        endColumn: toNullableInt(src['endColumn']),
      });
      if (id > maxId) maxId = id;
    }
    if (maxId >= this.nextPortalId) {
      this.nextPortalId = maxId + 1;
    }
    return result;
  }

  private parseTresherItem(item: unknown): Tresher | null {
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
      imageId: this.normalizeNullableNumber(this.toFiniteNumber(source['imageId'])),
      soundId: this.normalizeNullableNumber(this.toFiniteNumber(source['soundId'])),
      spReward: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source['spReward']), 0)),
      trap: this.parseTrapObject(source['trap']),
    };
  }

  private parseTresherPlacementItem(item: unknown): TresherPlacement | null {
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

  private parseMonsterItem(item: unknown): Monster | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const source = item as Partial<Monster> & {
      imageid?: unknown;
      tresherids?: unknown;
      trusherIds?: unknown;
      trusherids?: unknown;
      keyids?: unknown;
      movmentEconomy?: unknown;
      runat?: unknown;
      numberofattacks?: unknown;
      nuberOfAttacks?: unknown;
    };

    const parsedId = this.toFiniteNumber(source.id);
    if (parsedId === null) {
      return null;
    }

    const attacks = this.normalizeMonsterAttacks(source.attacks);
    const numberOfAttacks = Math.max(
      0,
      Math.max(
        this.normalizeNumber(
          this.toFiniteNumber(
            source.numberOfAttacks ?? source.numberofattacks ?? source.nuberOfAttacks
          ),
          attacks.length
        ),
        attacks.length
      )
    );

    return {
      id: Math.max(0, Math.floor(parsedId)),
      imageId: this.normalizeNullableNumber(this.toFiniteNumber(source.imageId ?? source.imageid)),
      soundId: this.normalizeNullableNumber(this.toFiniteNumber(source.soundId)),
      tresherIds: this.normalizeIdList(
        source.tresherIds ?? source.tresherids ?? source.trusherIds ?? source.trusherids
      ),
      keyIds: this.normalizeIdList(source.keyIds ?? source.keyids),
      name: typeof source.name === 'string' && source.name.trim() ? source.name : 'Unnamed Monster',
      type: typeof source.type === 'string' && source.type.trim() ? source.type : 'Humanoid',
      description: typeof source.description === 'string' ? source.description : '',
      hp: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.hp), 1)),
      movementEconomy: Math.max(
        0,
        this.normalizeNumber(this.toFiniteNumber(source.movementEconomy ?? source.movmentEconomy), 0)
      ),
      ac: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.ac), 10)),
      runAt: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.runAt ?? source.runat), 0)),
      numberOfAttacks,
      attacks,
      magic: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.magic), 0)),
      magicResistance: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.magicResistance), 0)),
      spReward: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.spReward), 0)),
      callsReinforcements: (source as Record<string, unknown>)['callsReinforcements'] === true,
    };
  }

  private parseMonsterAttackItem(item: unknown): MonsterAttack | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const source = item as Partial<MonsterAttack> & {
      discription?: unknown;
      plushToHit?: unknown;
    };

    const attackType = source.type;
    return {
      type: attackType === 'Bite' || attackType === 'Claw' || attackType === 'Spell' || attackType === 'Weapon' ? attackType : 'Bite',
      description:
        typeof source.description === 'string'
          ? source.description
          : typeof source.discription === 'string'
            ? source.discription
            : '',
      damage: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.damage), 0)),
      plusToHit: this.normalizeNumber(this.toFiniteNumber(source.plusToHit ?? source.plushToHit), 0),
      weaponItemId: this.normalizeNullableNumber(this.toFiniteNumber(source.weaponItemId)),
      spellId: this.normalizeNullableNumber(this.toFiniteNumber(source.spellId)),
      curseId: this.normalizeNullableNumber(this.toFiniteNumber(source.curseId)),
    };
  }

  private parseMonsterPlacementItem(item: unknown): MonsterPlacement | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const source = item as Partial<MonsterPlacement> & {
      monsterID?: unknown;
      rownId?: unknown;
      columnId?: unknown;
      col?: unknown;
      isRoaming?: unknown;
      roaming?: unknown;
      rome?: unknown;
    };

    const monsterIdRaw =
      source.monsterId !== undefined ? source.monsterId : source.monsterID;
    const rowRaw = source.row !== undefined ? source.row : source.rownId;
    const columnRaw =
      source.column !== undefined
        ? source.column
        : source.columnId !== undefined
          ? source.columnId
          : source.col;
    const roamRaw =
      source.roam !== undefined
        ? source.roam
        : source.roaming !== undefined
          ? source.roaming
          : source.isRoaming !== undefined
            ? source.isRoaming
            : source.rome;

    const monsterId = this.toFiniteNumber(monsterIdRaw);
    const row = this.toFiniteNumber(rowRaw);
    const column = this.toFiniteNumber(columnRaw);
    if (monsterId === null || row === null || column === null) {
      return null;
    }

    return {
      monsterId: Math.max(0, Math.floor(monsterId)),
      row: Math.floor(row),
      column: Math.floor(column),
      roam: this.normalizeBoolean(roamRaw),
      isDormant: source.isDormant === true || undefined,
      guardRow: typeof (source as Record<string, unknown>)['guardRow'] === 'number' ? Math.floor((source as Record<string, unknown>)['guardRow'] as number) : undefined,
      guardColumn: typeof (source as Record<string, unknown>)['guardColumn'] === 'number' ? Math.floor((source as Record<string, unknown>)['guardColumn'] as number) : undefined,
    };
  }

  private normalizeMonsterAttacks(value: unknown): MonsterAttack[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => this.parseMonsterAttackItem(item))
      .filter((item): item is MonsterAttack => item !== null);
  }

  private parseExitItem(item: unknown): DungonExit | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const source = item as Partial<DungonExit> & {
      col?: unknown;
      destinationDungonID?: unknown;
      destinationDungonId?: unknown;
      exitType?: unknown;
    };

    const parsedId = this.toFiniteNumber(source.id);
    const row = this.toFiniteNumber(source.row);
    const column = this.toFiniteNumber(source.column ?? source.col);
    if (parsedId === null || row === null || column === null) {
      return null;
    }

    const destinationType: ExitDestinationType =
      source.destinationType === 'dungon' ? 'dungon' : 'outside';
    const destinationRaw =
      source.destinationDungonId !== undefined
        ? source.destinationDungonId
        : source.destinationDungonID;
    const parsedDestination = this.normalizeNullableNumber(this.toFiniteNumber(destinationRaw));
    const transitionSource =
      source.transitionType ?? source.exitType;
    const transitionType: ExitTransitionType =
      transitionSource === 'stairsUp' ||
      transitionSource === 'stairsDown' ||
      transitionSource === 'open'
        ? transitionSource
        : 'open';

    return {
      id: Math.max(0, Math.floor(parsedId)),
      row: Math.floor(row),
      column: Math.floor(column),
      destinationType,
      destinationDungonId: destinationType === 'dungon' ? parsedDestination : null,
      transitionType,
    };
  }

  private parseCheaterInventory(
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

  private parseInventoryKeyItem(item: unknown): Key | null {
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

  private normalizeCheaterInventory(
    inventory: CheaterInventory | null | undefined
  ): CheaterInventory {
    return {
      keys: Array.isArray(inventory?.keys)
        ? inventory.keys.map((key) => ({ ...key }))
        : [],
      treshers: Array.isArray(inventory?.treshers)
        ? inventory.treshers.map((tresher) => ({ ...tresher }))
        : [],
    };
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

  private normalizeBoolean(value: unknown): boolean {
    return value === true;
  }

  private normalizeIdList(value: unknown): number[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => this.toFiniteNumber(item))
      .filter((item): item is number => item !== null);
  }

  private syncIdsFromLoadedData(
    squares: Record<string, Square>,
    keyList: Key[],
    tresherList: Tresher[],
    monsterList: Monster[],
    exits: DungonExit[],
    squareTexts: SquareText[],
    portalPlacements: PortalPlacement[] = []
  ): void {
    let maxWallId = -1;
    let maxDoorId = -1;

    for (const square of Object.values(squares)) {
      const connections = [square.toTop, square.toRight, square.toBottom, square.toLeft];
      for (const connection of connections) {
        if (!connection) {
          continue;
        }

        if (this.isDoorConnection(connection)) {
          maxDoorId = Math.max(maxDoorId, connection.id);
        } else {
          maxWallId = Math.max(maxWallId, connection.id);
        }
      }
    }

    const maxKeyId = keyList.reduce((maxValue, key) => Math.max(maxValue, key.id), -1);
    const maxTresherId = tresherList.reduce((maxValue, tresher) => Math.max(maxValue, tresher.id), -1);
    const maxExitId = exits.reduce((maxValue, item) => Math.max(maxValue, item.id), -1);
    const maxMonsterId = monsterList.reduce((maxValue, monster) => Math.max(maxValue, monster.id), -1);
    const maxSquareTextId = squareTexts.reduce((maxValue, st) => Math.max(maxValue, st.id), -1);
    const maxPortalId = portalPlacements.reduce((maxValue, p) => Math.max(maxValue, p.id), -1);
    this.nextWallId = maxWallId + 1;
    this.nextDoorId = maxDoorId + 1;
    this.nextKeyId = maxKeyId + 1;
    this.nextTresherId = maxTresherId + 1;
    this.nextExitId = maxExitId + 1;
    this.nextMonsterId = maxMonsterId + 1;
    this.nextSquareTextId = maxSquareTextId + 1;
    if (maxPortalId >= this.nextPortalId) {
      this.nextPortalId = maxPortalId + 1;
    }
  }

  private drawGridCanvas(): void {
    const canvas = this.gridCanvasRef?.nativeElement;
    if (!canvas) {
      return;
    }

    const width = this.gridCanvasWidth;
    const height = this.gridCanvasHeight;
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

    const dungonId = this.selectedDungonId();
    if (dungonId !== null) {
      const filledSquares = this.filledSquaresByDungon()[dungonId] ?? {};
      context.fillStyle = '#c7c7c7';

      for (const key of Object.keys(filledSquares)) {
        const [rowText, colText] = key.split(':');
        const row = Number.parseInt(rowText ?? '', 10);
        const column = Number.parseInt(colText ?? '', 10);

        if (!Number.isNaN(row) && !Number.isNaN(column)) {
          context.fillRect(
            column * this.gridCellSize,
            row * this.gridCellSize,
            this.gridCellSize,
            this.gridCellSize
          );
        }
      }

      // Draw dark-gray "wall shadow" cells adjacent to filled squares across wall connections,
      // so that wall structures look solid instead of showing a black void.
      const wallSquares = Object.values(this.squaresByDungon()[dungonId] ?? {});
      context.fillStyle = '#555555';
      for (const wsq of wallSquares) {
        const wallDirs: Array<{ dRow: number; dCol: number; connected: boolean }> = [
          { dRow: -1, dCol:  0, connected: this.isWallConnection(wsq.toTop) },
          { dRow:  1, dCol:  0, connected: this.isWallConnection(wsq.toBottom) },
          { dRow:  0, dCol: -1, connected: this.isWallConnection(wsq.toLeft) },
          { dRow:  0, dCol:  1, connected: this.isWallConnection(wsq.toRight) },
        ];
        for (const { dRow, dCol, connected } of wallDirs) {
          if (!connected) continue;
          const adjRow = wsq.row + dRow;
          const adjCol = wsq.column + dCol;
          const adjKey = this.getSquareKey(adjRow, adjCol);
          if (filledSquares[adjKey]) continue; // already shown as floor gray
          context.fillRect(adjCol * this.gridCellSize, adjRow * this.gridCellSize, this.gridCellSize, this.gridCellSize);
        }
      }
    }

    context.strokeStyle = 'rgba(255, 255, 255, 0.88)';
    context.lineWidth = 1;
    context.beginPath();

    for (let column = 0; column <= this.gridColumnCount; column += 1) {
      const x = column * this.gridCellSize + 0.5;
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }

    for (let row = 0; row <= this.gridRowCount; row += 1) {
      const y = row * this.gridCellSize + 0.5;
      context.moveTo(0, y);
      context.lineTo(width, y);
    }

    context.stroke();

    if (dungonId !== null) {
      const squares = Object.values(this.squaresByDungon()[dungonId] ?? {});
      if (squares.length > 0) {
        context.strokeStyle = '#ff2f2f';
        context.lineWidth = 2;
        context.beginPath();

        for (const square of squares) {
          const left = square.column * this.gridCellSize;
          const top = square.row * this.gridCellSize;
          const right = left + this.gridCellSize;
          const bottom = top + this.gridCellSize;

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
          const left = square.column * this.gridCellSize;
          const top = square.row * this.gridCellSize;
          const right = left + this.gridCellSize;
          const bottom = top + this.gridCellSize;

          if (this.isDoorConnection(square.toTop)) {
            context.moveTo(left, top);
            context.lineTo(right, top);
          }

          if (this.isDoorConnection(square.toRight)) {
            context.moveTo(right, top);
            context.lineTo(right, bottom);
          }

          if (this.isDoorConnection(square.toBottom)) {
            context.moveTo(left, bottom);
            context.lineTo(right, bottom);
          }

          if (this.isDoorConnection(square.toLeft)) {
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

        if (
          key.rownId < 0 ||
          key.columnId < 0 ||
          key.rownId >= this.gridRowCount ||
          key.columnId >= this.gridColumnCount
        ) {
          continue;
        }

        const centerX = key.columnId * this.gridCellSize + this.gridCellSize / 2;
        const centerY = key.rownId * this.gridCellSize + this.gridCellSize / 2;

        context.beginPath();
        context.arc(centerX, centerY, 3, 0, Math.PI * 2);
        context.fill();

        context.strokeStyle = '#dbe8ff';
        context.lineWidth = 1;
        context.stroke();
      }

      const filledSquares = this.filledSquaresByDungon()[dungonId] ?? {};
      const tresherPlacements = this.tresherPlacementsByDungon()[dungonId] ?? [];
      for (const placement of tresherPlacements) {
        if (
          placement.row < 0 ||
          placement.column < 0 ||
          placement.row >= this.gridRowCount ||
          placement.column >= this.gridColumnCount
        ) {
          continue;
        }

        const placementSquareKey = this.getSquareKey(placement.row, placement.column);
        if (!filledSquares[placementSquareKey]) {
          continue;
        }

        const centerX = placement.column * this.gridCellSize + this.gridCellSize / 2;
        const centerY = placement.row * this.gridCellSize + this.gridCellSize / 2;
        this.drawTresherCoinMarker(context, centerX, centerY, 4);
      }

      const monsterPlacements = this.monsterPlacementsByDungon()[dungonId] ?? [];
      for (const placement of monsterPlacements) {
        if (
          placement.row < 0 ||
          placement.column < 0 ||
          placement.row >= this.gridRowCount ||
          placement.column >= this.gridColumnCount
        ) {
          continue;
        }

        const placementSquareKey = this.getSquareKey(placement.row, placement.column);
        if (!filledSquares[placementSquareKey]) {
          continue;
        }

        const centerX = placement.column * this.gridCellSize + this.gridCellSize / 2;
        const centerY = placement.row * this.gridCellSize + this.gridCellSize / 2;
        this.drawMonsterMarker(context, centerX, centerY, 4);
      }

      const exits = this.exitsByDungon()[dungonId] ?? [];
      for (const exit of exits) {
        if (
          exit.row < 0 ||
          exit.column < 0 ||
          exit.row >= this.gridRowCount ||
          exit.column >= this.gridColumnCount
        ) {
          continue;
        }

        const exitSquareKey = this.getSquareKey(exit.row, exit.column);
        if (!filledSquares[exitSquareKey]) {
          continue;
        }

        const centerX = exit.column * this.gridCellSize + this.gridCellSize / 2;
        const centerY = exit.row * this.gridCellSize + this.gridCellSize / 2;
        this.drawExitMarker(context, centerX, centerY, this.gridCellSize * 0.5, exit.transitionType);
      }

      const startpoint = this.startPointByDungon()[dungonId] ?? null;
      if (
        startpoint &&
        startpoint.row >= 0 &&
        startpoint.col >= 0 &&
        startpoint.row < this.gridRowCount &&
        startpoint.col < this.gridColumnCount
      ) {
        const centerX = startpoint.col * this.gridCellSize + this.gridCellSize / 2;
        const centerY = startpoint.row * this.gridCellSize + this.gridCellSize / 2;
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
    if (dungonId !== null) {
      const stFilledSquares = this.filledSquaresByDungon()[dungonId] ?? {};
      for (const st of this.squareTextsByDungon()[dungonId] ?? []) {
        if (
          st.row < 0 ||
          st.column < 0 ||
          st.row >= this.gridRowCount ||
          st.column >= this.gridColumnCount
        ) {
          continue;
        }

        const stKey = this.getSquareKey(st.row, st.column);
        if (!stFilledSquares[stKey]) {
          continue;
        }

        this.drawSquareTextWallGlowOnGrid(
          context,
          st.row,
          st.column,
          st.wallSide ?? null,
          this.gridCellSize
        );

        const centerX = st.column * this.gridCellSize + this.gridCellSize / 2;
        const centerY = st.row * this.gridCellSize + this.gridCellSize / 2;
        context.fillStyle = st.wallSide ? '#d18cff' : '#e17055';
        context.font = 'bold 10px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('T', centerX, centerY);
      }
    }

    // Draw "!" markers for floor traps
    if (dungonId !== null) {
      const ftFilledSquares = this.filledSquaresByDungon()[dungonId] ?? {};
      for (const ft of this.floorTrapPlacementsByDungon()[dungonId] ?? []) {
        if (
          ft.row < 0 ||
          ft.column < 0 ||
          ft.row >= this.gridRowCount ||
          ft.column >= this.gridColumnCount
        ) {
          continue;
        }

        const ftKey = this.getSquareKey(ft.row, ft.column);
        if (!ftFilledSquares[ftKey]) {
          continue;
        }

        const centerX = ft.column * this.gridCellSize + this.gridCellSize / 2;
        const centerY = ft.row * this.gridCellSize + this.gridCellSize / 2;
        context.fillStyle = '#ff9f0a';
        context.font = 'bold 11px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('!', centerX, centerY);
      }
    }

    // Draw portal markers
    if (dungonId !== null) {
      const ptFilledSquares = this.filledSquaresByDungon()[dungonId] ?? {};
      const portalColors = ['#cc44ff', '#44ddff', '#ff44cc', '#88ff44', '#ffaa00'];
      const portals = this.portalPlacementsByDungon()[dungonId] ?? [];
      for (let pi = 0; pi < portals.length; pi++) {
        const portal = portals[pi];
        const color = portalColors[pi % portalColors.length] ?? '#cc44ff';
        const symbol = portal.look === 'starDown' ? '▼' : portal.look === 'magicDoor' ? '⊡' : '▲';

        const drawPortalMarker = (row: number | null, col: number | null, label: string): void => {
          if (row === null || col === null) return;
          if (row < 0 || col < 0 || row >= this.gridRowCount || col >= this.gridColumnCount) return;
          const key = this.getSquareKey(row, col);
          if (!ptFilledSquares[key]) return;
          const cx = col * this.gridCellSize + this.gridCellSize / 2;
          const cy = row * this.gridCellSize + this.gridCellSize / 2;
          context.fillStyle = color;
          context.font = 'bold 10px sans-serif';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(symbol + label, cx, cy);
        };

        drawPortalMarker(portal.startRow, portal.startColumn, 'S');
        drawPortalMarker(portal.endRow, portal.endColumn, 'E');

        // Draw a connecting line between start and end if both exist
        if (
          portal.startRow !== null && portal.startColumn !== null &&
          portal.endRow !== null && portal.endColumn !== null
        ) {
          const sx = portal.startColumn * this.gridCellSize + this.gridCellSize / 2;
          const sy = portal.startRow * this.gridCellSize + this.gridCellSize / 2;
          const ex = portal.endColumn * this.gridCellSize + this.gridCellSize / 2;
          const ey = portal.endRow * this.gridCellSize + this.gridCellSize / 2;
          context.strokeStyle = color;
          context.lineWidth = 1;
          context.setLineDash([3, 3]);
          context.beginPath();
          context.moveTo(sx, sy);
          context.lineTo(ex, ey);
          context.stroke();
          context.setLineDash([]);
        }
      }
    }

    // Highlight selected placement item
    const selectedItem = this.selectedPlacedItem();
    if (selectedItem) {
      const hx = selectedItem.column * this.gridCellSize;
      const hy = selectedItem.row * this.gridCellSize;
      context.strokeStyle = '#00e5ff';
      context.lineWidth = 3;
      context.strokeRect(hx + 1.5, hy + 1.5, this.gridCellSize - 3, this.gridCellSize - 3);

      // If a door is selected, also highlight where its key is
      if (selectedItem.type === 'door') {
        const keyLoc = this.getDoorKeyLocation(selectedItem.refId);
        if (keyLoc) {
          const kx = keyLoc.column * this.gridCellSize;
          const ky = keyLoc.row * this.gridCellSize;
          context.strokeStyle = '#ffd700';
          context.lineWidth = 3;
          context.strokeRect(kx + 1.5, ky + 1.5, this.gridCellSize - 3, this.gridCellSize - 3);
          // Draw a small key icon marker
          context.fillStyle = '#ffd700';
          context.font = 'bold 11px sans-serif';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText('🔑', kx + this.gridCellSize / 2, ky + this.gridCellSize / 2);
        }
      }
    }
  }

  private openGridPreviewAtSquare(dungonId: number, row: number, column: number): void {
    const includeMonsters = window.confirm(
      'Include monsters while testing this 10 x 10 preview?\n\nOK = include monsters\nCancel = ignore monsters'
    );
    this.previewShowMonsters.set(includeMonsters);

    const halfDimension = Math.floor(this.previewGridDimension / 2);
    this.gridPreviewContext.set({
      dungonId,
      centerRow: row,
      centerColumn: column,
      startRow: row - halfDimension,
      startColumn: column - halfDimension,
    });

    this.isGridPreviewModalVisible.set(true);
    this.previewActionMessage.set(
      includeMonsters
        ? 'Monsters included in preview testing.'
        : 'Monsters excluded from preview testing.'
    );
    this.drawPreviewGridCanvas();
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

        if (this.isDoorConnection(square.toTop)) {
          context.moveTo(left, top);
          context.lineTo(right, top);
        }

        if (this.isDoorConnection(square.toRight)) {
          context.moveTo(right, top);
          context.lineTo(right, bottom);
        }

        if (this.isDoorConnection(square.toBottom)) {
          context.moveTo(left, bottom);
          context.lineTo(right, bottom);
        }

        if (this.isDoorConnection(square.toLeft)) {
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

    const monsterPlacementsPreview = this.monsterPlacementsByDungon()[preview.dungonId] ?? [];
    for (const placement of monsterPlacementsPreview) {
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
      this.drawMonsterMarker(context, centerX, centerY, 3.5);
    }

    const exits = this.exitsByDungon()[preview.dungonId] ?? [];
    for (const exit of exits) {
      const exitSquareKey = this.getSquareKey(exit.row, exit.column);
      if (!visibleSquareKeys.has(exitSquareKey)) {
        continue;
      }

      const previewRow = exit.row - preview.startRow;
      const previewColumn = exit.column - preview.startColumn;
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
      this.drawExitMarker(context, centerX, centerY, this.previewGridCellSize * 0.48, exit.transitionType);
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

    const centerPreviewRow = preview.centerRow - preview.startRow;
    const centerPreviewColumn = preview.centerColumn - preview.startColumn;
    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
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
        cheater.facingDir
      );
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

    const wallColor = this.getFirstPersonFrontColor('wall');
    const darkerSurfaceColor = this.darkenHexColor(wallColor, 0.58);

    context.fillStyle = darkerSurfaceColor;
    context.fillRect(0, 0, width, height / 2);
    this.drawStoneTextureInRect(
      context,
      0,
      0,
      width,
      height / 2,
      width * 3 + height * 5 + preview.centerRow * 17 + preview.centerColumn * 23,
      {
        toneMin: 64,
        toneRange: 46,
        alphaMultiplier: 0.82,
      }
    );

    context.fillStyle = darkerSurfaceColor;
    context.fillRect(0, height / 2, width, height / 2);
    this.drawStoneTextureInRect(
      context,
      0,
      height / 2,
      width,
      height / 2,
      width * 7 + height * 11 + preview.centerRow * 29 + preview.centerColumn * 13,
      {
        toneMin: 64,
        toneRange: 46,
        alphaMultiplier: 0.82,
      }
    );

    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const firstPersonView = this.getFirstPersonView(preview, cheater);
    const tresherPlacements = this.tresherPlacementsByDungon()[preview.dungonId] ?? [];
    const tresherCountBySquare = new Map<string, number>();
    for (const placement of tresherPlacements) {
      const squareKey = this.getSquareKey(placement.row, placement.column);
      const existingCount = tresherCountBySquare.get(squareKey) ?? 0;
      tresherCountBySquare.set(squareKey, existingCount + 1);
    }

    const monsterPlacementsFP = this.monsterPlacementsByDungon()[preview.dungonId] ?? [];
    const monsterSquareKeys = new Set<string>();
    for (const placement of monsterPlacementsFP) {
      monsterSquareKeys.add(this.getSquareKey(placement.row, placement.column));
    }

    if (firstPersonView.steps.length === 0) {
      context.fillStyle = '#d1d6de';
      context.font = '13px sans-serif';
      context.fillText('No first-person view for this tile.', 16, height / 2);
      return;
    }

    const maxFrameDepth = Math.max(2, Math.min(12, firstPersonView.steps.length + 2));
    const frameAtDepth = (depth: number): { left: number; right: number; top: number; bottom: number } => {
      const ratio = Math.min(1, depth / maxFrameDepth);
      const marginX = ratio * (width * 0.38);
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
      const depthAlpha = Math.max(0.06, 0.24 - depth * 0.03);
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
      floorGradient.addColorStop(0, `rgba(74, 66, 57, ${Math.min(0.72, depthAlpha + 0.04)})`);
      floorGradient.addColorStop(1, `rgba(104, 93, 79, ${Math.min(0.78, depthAlpha + 0.1)})`);
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

      const ceilingGradient = context.createLinearGradient(0, nearFrame.top, 0, farFrame.top);
      ceilingGradient.addColorStop(0, `rgba(55, 60, 72, ${Math.min(0.72, depthAlpha + 0.09)})`);
      ceilingGradient.addColorStop(1, `rgba(86, 92, 108, ${Math.min(0.76, depthAlpha + 0.05)})`);
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
    }

    const endFrame = frameAtDepth(firstPersonView.steps.length);
    const endStep = firstPersonView.steps[firstPersonView.steps.length - 1] ?? null;
    const canExtendEndWall = firstPersonView.endBlock.type === 'wall' && endStep !== null;
    const endWallExtension = canExtendEndWall
      ? Math.max(2, (endFrame.right - endFrame.left) * 0.18)
      : 0;
    const extendedEndLeft =
      canExtendEndWall && this.isSideSightTransparent(endStep.leftBlock)
        ? Math.max(0, endFrame.left - endWallExtension)
        : endFrame.left;
    const extendedEndRight =
      canExtendEndWall && this.isSideSightTransparent(endStep.rightBlock)
        ? Math.min(width, endFrame.right + endWallExtension)
        : endFrame.right;
    const endWallWidth = Math.max(0, extendedEndRight - extendedEndLeft);
    const endFillColor =
      firstPersonView.endBlock.type === 'none'
        ? '#000000'
        : firstPersonView.endBlock.type === 'wall'
          ? this.getFirstPersonWallPanelColor(firstPersonView.steps.length)
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
        this.drawStoneTextureInRect(
          context,
          extendedEndLeft,
          endFrame.top,
          endWallWidth,
          endFrame.bottom - endFrame.top,
          endWallSeed,
          this.getStoneTextureOptionsForWallDepth(firstPersonView.steps.length)
        );
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
      const isFarthestVisibleLayer = depth === firstPersonView.steps.length - 1;

      const leftOpeningBackBlock = step.leftOpeningBackBlock;
      const rightOpeningBackBlock = step.rightOpeningBackBlock;
      const canSeeLeftOpeningBackWall = this.hasClearSideSightToDepth(
        firstPersonView.steps,
        depth,
        'left'
      );
      const canSeeRightOpeningBackWall = this.hasClearSideSightToDepth(
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
          !isFarthestVisibleLayer
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
          !isFarthestVisibleLayer
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

    // Pass 3: draw floor markers and monsters last so they stay visible.
    for (const segment of farToNearSegments) {
      const { step, nearFrame, farFrame } = segment;
      const squareKey = this.getSquareKey(step.row, step.column);
      const tresherCount = tresherCountBySquare.get(squareKey) ?? 0;
      if (tresherCount > 0) {
        this.drawFirstPersonFloorCoinStack(context, nearFrame, farFrame, tresherCount);
      }

      if (step.hasKey) {
        this.drawFirstPersonFloorKey(context, nearFrame, farFrame);
      }

      if (step.exitTransitionType) {
        this.drawFirstPersonFloorExit(
          context,
          nearFrame,
          farFrame,
          step.exitTransitionType,
          squareKey
        );
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
          if (!monsterSquareKeys.has(slot.squareKey)) {
            continue;
          }

          this.drawFirstPersonMonster(
            context,
            nearFrame,
            farFrame,
            slot.lateralOffset,
            lateralRange
          );
        }
      }
    }

    this.drawCompass(context, cheater.facingDir);
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
    const exitTransitionsBySquare = new Map<string, ExitTransitionType>();
    for (const exit of this.exitsByDungon()[preview.dungonId] ?? []) {
      exitTransitionsBySquare.set(
        this.getSquareKey(exit.row, exit.column),
        exit.transitionType
      );
    }

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
        exitTransitionType: exitTransitionsBySquare.get(squareKey) ?? null,
      });
    };

    let currentRow = preview.centerRow;
    let currentColumn = preview.centerColumn;
    addStep(currentRow, currentColumn);

    const maxDepth = Math.max(
      1,
      Math.min(this.firstPersonMaxDepth, Math.floor(Math.max(1, cheater.rangeOfSight + 1)))
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
      this.drawStoneTextureInPolygon(
        context,
        points,
        textureSeed,
        this.getStoneTextureOptionsForWallDepth(wallDepth)
      );
      this.drawBrickPatternInPolygon(context, points, textureSeed + 131, wallDepth);
    }

    if (block.type === 'openDoor' || block.type === 'closedDoor') {
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
    const nearInset = Math.max(4, openingWidth * 2.8);
    const farInset = Math.max(3, openingWidth * 1.8);
    const seamOverlap = 1.4;
    const portalNearX =
      side === 'left' ? nearFrame.left - seamOverlap : nearFrame.right + seamOverlap;
    const portalFarX =
      side === 'left' ? farFrame.left - seamOverlap : farFrame.right + seamOverlap;

    const backWallPoints =
      side === 'left'
        ? [
            { x: nearFrame.left - nearInset, y: nearFrame.top },
            { x: farFrame.left - farInset, y: farFrame.top },
            { x: farFrame.left - farInset, y: farFrame.bottom },
            { x: nearFrame.left - nearInset, y: nearFrame.bottom },
          ]
        : [
            { x: nearFrame.right + nearInset, y: nearFrame.top },
            { x: farFrame.right + farInset, y: farFrame.top },
            { x: farFrame.right + farInset, y: farFrame.bottom },
            { x: nearFrame.right + nearInset, y: nearFrame.bottom },
          ];

    const connectorPoints = [
      { x: portalNearX, y: nearFrame.top },
      { x: portalFarX, y: farFrame.top },
      backWallPoints[1],
      backWallPoints[2],
      { x: portalFarX, y: farFrame.bottom },
      { x: portalNearX, y: nearFrame.bottom },
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
      const textureOptions = this.getStoneTextureOptionsForWallDepth(wallDepth + 1);
      const connectorSeed =
        nearFrame.left * 3 + farFrame.top * 7 + wallDepth * 19 + (side === 'left' ? 41 : 73);
      const backWallSeed =
        nearFrame.top * 5 + farFrame.right * 11 + wallDepth * 23 + (side === 'left' ? 59 : 97);
      if (drawConnector) {
        this.drawStoneTextureInPolygon(
          context,
          connectorPoints,
          connectorSeed,
          textureOptions
        );
        this.drawBrickPatternInPolygon(context, connectorPoints, connectorSeed + 211, wallDepth + 1);
      }
      this.drawStoneTextureInPolygon(
        context,
        backWallPoints,
        backWallSeed,
        textureOptions
      );
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
    const x = side === 'left' ? (nearFrame.left + farFrame.left) / 2 : (nearFrame.right + farFrame.right) / 2;

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

    context.beginPath();
    context.moveTo(centerX + size * 0.32, floorY - size * 0.2);
    context.lineTo(centerX + size * 0.32, floorY + size * 0.12);
    context.moveTo(centerX + size * 0.46, floorY - size * 0.2);
    context.lineTo(centerX + size * 0.46, floorY + size * 0.05);
    context.stroke();
  }

  private drawFirstPersonMonster(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
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

  private drawFirstPersonFloorCoinStack(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    tresherCount: number
  ): void {
    const midLeft = (nearFrame.left + farFrame.left) / 2;
    const midRight = (nearFrame.right + farFrame.right) / 2;
    const tileWidth = midRight - midLeft;
    const centerX = (midLeft + midRight) / 2 + tileWidth * 0.14;
    const floorY = (nearFrame.bottom + farFrame.bottom) / 2 + tileWidth * 0.04;
    const baseSize = Math.max(2.2, Math.min(8, tileWidth * 0.1));
    const stackSize = Math.max(1, Math.min(4, Math.floor(tresherCount)));
    const offsets = [
      { x: -baseSize * 0.78, y: baseSize * 0.22, radius: baseSize * 0.72 },
      { x: baseSize * 0.7, y: baseSize * 0.22, radius: baseSize * 0.72 },
      { x: 0, y: -baseSize * 0.18, radius: baseSize * 0.86 },
      { x: 0, y: -baseSize * 0.82, radius: baseSize * 0.63 },
    ];

    for (let index = 0; index < stackSize; index += 1) {
      const offset = offsets[index];
      this.drawTresherCoinMarker(
        context,
        centerX + offset.x,
        floorY + offset.y,
        Math.max(2, offset.radius)
      );
    }
  }

  private drawFirstPersonFloorExit(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    transitionType: ExitTransitionType,
    squareKey = ''
  ): void {
    const nearWidth = nearFrame.right - nearFrame.left;
    const farWidth = farFrame.right - farFrame.left;
    const frontInset = nearWidth * 0.08;
    const backInset = farWidth * 0.14;
    const frontLeft = nearFrame.left + frontInset;
    const frontRight = nearFrame.right - frontInset;
    const backLeft = farFrame.left + backInset;
    const backRight = farFrame.right - backInset;

    const frontY = nearFrame.bottom - nearWidth * 0.025;
    const backBaseY = farFrame.bottom + farWidth * 0.02;
    const depthSize = Math.max(6, frontY - backBaseY);

    if (transitionType === 'open') {
      const centerX = (frontLeft + frontRight + backLeft + backRight) / 4;
      const centerY = (frontY + backBaseY) / 2;
      const radius = Math.max(3, Math.min(11, nearWidth * 0.1));
      context.fillStyle = '#45d483';
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = '#e4fff0';
      context.lineWidth = 1;
      context.stroke();
      return;
    }

    if (transitionType === 'stairsUp') {
      if (squareKey && !this.stairsUpSquareAssignment.has(squareKey)) {
        this.stairsUpSquareAssignment.set(squareKey, (Math.floor(Math.random() * 3) + 1) as 1 | 2 | 3);
      }
      const assignedIdx = squareKey ? (this.stairsUpSquareAssignment.get(squareKey) ?? 1) : 1;
      const stairImg = this.stairsUpImageCache.get(`stup${assignedIdx}`) ?? null;
      if (stairImg) {
        const midLeft = nearFrame.left * 0.65 + farFrame.left * 0.35;
        const midRight = nearFrame.right * 0.65 + farFrame.right * 0.35;
        const midTop = nearFrame.top * 0.65 + farFrame.top * 0.35;
        const midBottom = nearFrame.bottom * 0.65 + farFrame.bottom * 0.35;
        const drawW = Math.max(8, (midRight - midLeft) * 0.9);
        const drawH = Math.max(8, (midBottom - midTop) * 0.92);
        const drawX = (midLeft + midRight) / 2 - drawW / 2;
        const drawY = midBottom - drawH;
        context.drawImage(stairImg, drawX, drawY, drawW, drawH);
        return;
      }
    }

    // Build a full-tile stair plane that starts at the front edge and reaches the back edge.
    const slopeFrontY = transitionType === 'stairsUp' ? frontY : frontY - depthSize * 0.1;
    const slopeBackY =
      transitionType === 'stairsUp'
        ? backBaseY - depthSize * 0.58
        : frontY + depthSize * 0.62;

    const stepCount = 6;
    const ratioAt = (index: number): number => {
      const baseRatio = index / stepCount;
      return transitionType === 'stairsUp'
        ? Math.pow(baseRatio, 1.3)
        : Math.pow(baseRatio, 0.7);
    };

    // Draw filled 3D step bands to make the angle obvious in perspective.
    for (let index = 0; index < stepCount; index += 1) {
      const startRatio = ratioAt(index);
      const endRatio = ratioAt(index + 1);

      const startLeftX = frontLeft + (backLeft - frontLeft) * startRatio;
      const startRightX = frontRight + (backRight - frontRight) * startRatio;
      const endLeftX = frontLeft + (backLeft - frontLeft) * endRatio;
      const endRightX = frontRight + (backRight - frontRight) * endRatio;
      const startY = slopeFrontY + (slopeBackY - slopeFrontY) * startRatio;
      const endY = slopeFrontY + (slopeBackY - slopeFrontY) * endRatio;

      const treadTint = index % 2 === 0 ? 0.36 : 0.5;
      context.fillStyle =
        transitionType === 'stairsUp'
          ? `rgba(255, 96, 96, ${treadTint})`
          : `rgba(170, 34, 34, ${treadTint})`;
      context.beginPath();
      context.moveTo(startLeftX, startY);
      context.lineTo(startRightX, startY);
      context.lineTo(endRightX, endY);
      context.lineTo(endLeftX, endY);
      context.closePath();
      context.fill();

      // Riser edge between each step segment.
      context.strokeStyle = transitionType === 'stairsUp' ? '#ffd6d6' : '#ffb5b5';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(startLeftX, startY);
      context.lineTo(startRightX, startY);
      context.stroke();
    }

    // Outline the stair volume.
    context.strokeStyle = transitionType === 'stairsUp' ? '#ffd9d9' : '#ffc1c1';
    context.lineWidth = 1.1;
    context.beginPath();
    context.moveTo(frontLeft, slopeFrontY);
    context.lineTo(frontRight, slopeFrontY);
    context.lineTo(backRight, slopeBackY);
    context.lineTo(backLeft, slopeBackY);
    context.closePath();
    context.stroke();

    // Side rails to emphasize depth direction.
    context.strokeStyle = transitionType === 'stairsUp' ? '#ff9f9f' : '#ff7777';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(frontLeft, slopeFrontY);
    context.lineTo(backLeft, slopeBackY);
    context.moveTo(frontRight, slopeFrontY);
    context.lineTo(backRight, slopeBackY);
    context.stroke();

    const arrowStartX = (frontLeft + frontRight) / 2;
    const arrowStartY = slopeFrontY + (transitionType === 'stairsUp' ? -nearWidth * 0.015 : nearWidth * 0.015);
    const arrowTipX = (backLeft + backRight) / 2;
    const arrowTipY = slopeBackY + (transitionType === 'stairsUp' ? -farWidth * 0.02 : farWidth * 0.02);
    const arrowVectorX = arrowTipX - arrowStartX;
    const arrowVectorY = arrowTipY - arrowStartY;
    const arrowLength = Math.hypot(arrowVectorX, arrowVectorY) || 1;
    const normX = arrowVectorX / arrowLength;
    const normY = arrowVectorY / arrowLength;
    const perpendicularX = -normY;
    const perpendicularY = normX;
    const arrowHeadSize = Math.max(3, nearWidth * 0.05);

    context.strokeStyle = '#ffd7d7';
    context.lineWidth = 1.25;
    context.beginPath();
    context.moveTo(arrowStartX, arrowStartY);
    context.lineTo(arrowTipX, arrowTipY);
    context.stroke();

    context.fillStyle = '#ffd7d7';
    context.beginPath();
    context.moveTo(arrowTipX, arrowTipY);
    context.lineTo(
      arrowTipX - normX * arrowHeadSize + perpendicularX * (arrowHeadSize * 0.55),
      arrowTipY - normY * arrowHeadSize + perpendicularY * (arrowHeadSize * 0.55)
    );
    context.lineTo(
      arrowTipX - normX * arrowHeadSize - perpendicularX * (arrowHeadSize * 0.55),
      arrowTipY - normY * arrowHeadSize - perpendicularY * (arrowHeadSize * 0.55)
    );
    context.closePath();
    context.fill();
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

    context.fillStyle = 'rgba(255, 248, 210, 0.45)';
    context.beginPath();
    context.arc(
      centerX - clampedRadius * 0.25,
      centerY - clampedRadius * 0.25,
      clampedRadius * 0.38,
      0,
      Math.PI * 2
    );
    context.fill();
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

  private drawExitMarker(
    context: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    markerSize: number,
    transitionType: ExitTransitionType
  ): void {
    const halfSize = Math.max(3, markerSize);

    if (transitionType === 'open') {
      context.fillStyle = '#45d483';
      context.beginPath();
      context.arc(centerX, centerY, halfSize * 0.36, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = '#e4fff0';
      context.lineWidth = 1;
      context.stroke();

      return;
    }

    const left = centerX - halfSize;
    const top = centerY - halfSize;
    const sideLength = halfSize * 2;

    context.fillStyle =
      transitionType === 'stairsUp' ? 'rgba(221, 76, 76, 0.38)' : 'rgba(189, 36, 36, 0.42)';
    context.fillRect(left, top, sideLength, sideLength);

    context.strokeStyle = transitionType === 'stairsUp' ? '#ffd7d7' : '#ffcdcd';
    context.lineWidth = 1;
    context.strokeRect(left + 0.5, top + 0.5, Math.max(0, sideLength - 1), Math.max(0, sideLength - 1));

    context.strokeStyle = transitionType === 'stairsUp' ? '#ff8f8f' : '#ff6262';
    context.lineWidth = 1.4;
    context.beginPath();

    const stepCount = 4;
    for (let index = 0; index < stepCount; index += 1) {
      const ratio = (index + 1) / (stepCount + 1);
      const inset = ratio * (sideLength * 0.18);
      const y =
        transitionType === 'stairsUp'
          ? top + sideLength - ratio * sideLength
          : top + ratio * sideLength;
      context.moveTo(left + inset, y);
      context.lineTo(left + sideLength - inset, y);
    }

    context.stroke();
  }

  private drawSquareTextWallGlowOnGrid(
    context: CanvasRenderingContext2D,
    row: number,
    column: number,
    wallSide: SquareSide | null,
    cellSize: number
  ): void {
    if (!wallSide) {
      return;
    }

    const left = column * cellSize;
    const top = row * cellSize;
    const right = left + cellSize;
    const bottom = top + cellSize;

    context.save();
    context.strokeStyle = 'rgba(205, 144, 255, 0.98)';
    context.shadowColor = 'rgba(154, 78, 255, 0.95)';
    context.shadowBlur = 10;
    context.lineWidth = 3;
    context.beginPath();

    if (wallSide === 'toTop') {
      context.moveTo(left + 2, top + 1.5);
      context.lineTo(right - 2, top + 1.5);
    } else if (wallSide === 'toRight') {
      context.moveTo(right - 1.5, top + 2);
      context.lineTo(right - 1.5, bottom - 2);
    } else if (wallSide === 'toBottom') {
      context.moveTo(left + 2, bottom - 1.5);
      context.lineTo(right - 2, bottom - 1.5);
    } else {
      context.moveTo(left + 1.5, top + 2);
      context.lineTo(left + 1.5, bottom - 2);
    }

    context.stroke();
    context.restore();
  }

  private getFirstPersonSideColor(block: PathBlockType): string {
    if (block === 'closedDoor') {
      return '#8f2525';
    }

    if (block === 'openDoor') {
      return '#ab2f2f';
    }

    if (block === 'wall') {
      return this.getFirstPersonFrontColor('wall');
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
    if (block === 'wall') {
      const normalizedDepth = Math.max(0, wallDepth);
      const darkenAmount = Math.min(0.86, normalizedDepth * 0.085);
      return this.darkenHexColor(this.getFirstPersonFrontColor('wall'), darkenAmount);
    }

    if (block === 'closedDoor') {
      return '#6f1e1e';
    }

    if (block === 'openDoor') {
      return '#7f2525';
    }

    return '#14171b';
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

  private getVisibleMonsterSlotsForDepth(
    dungonId: number,
    steps: FirstPersonStep[],
    depth: number,
    row: number,
    column: number,
    leftOffset: { rowOffset: number; columnOffset: number },
    rightOffset: { rowOffset: number; columnOffset: number }
  ): Array<{ squareKey: string; lateralOffset: number }> {
    const squares = this.squaresByDungon()[dungonId] ?? {};
    const filledSquares = this.filledSquaresByDungon()[dungonId] ?? {};
    const visibleSlots = [{ squareKey: this.getSquareKey(row, column), lateralOffset: 0 }];

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
    const darkenAmount = Math.min(0.9, normalizedDepth * 0.1);
    return this.darkenHexColor(this.getFirstPersonFrontColor('wall'), darkenAmount);
  }

  private getStoneTextureOptionsForWallDepth(depth: number): {
    densityMultiplier: number;
    crackDensityMultiplier: number;
    alphaMultiplier: number;
    crackAlpha: number;
    toneMin: number;
    toneRange: number;
  } {
    const normalizedDepth = Math.max(0, Math.floor(depth));
    return {
      densityMultiplier: 1,
      crackDensityMultiplier: 1,
      alphaMultiplier: Math.max(0.42, 1 - normalizedDepth * 0.08),
      crackAlpha: Math.max(0.08, 0.24 - normalizedDepth * 0.02),
      toneMin: Math.max(48, 160 - normalizedDepth * 12),
      toneRange: Math.max(24, 70 - normalizedDepth * 4),
    };
  }

  private drawStoneTextureInPolygon(
    context: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
    seed: number,
    options?: {
      densityMultiplier?: number;
      crackDensityMultiplier?: number;
      alphaMultiplier?: number;
      crackAlpha?: number;
      toneMin?: number;
      toneRange?: number;
    }
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
    for (let i = 1; i < points.length; i += 1) {
      context.lineTo(points[i].x, points[i].y);
    }
    context.closePath();
    context.clip();

    this.drawStoneTextureInRect(context, left, top, right - left, bottom - top, seed, options);
    context.restore();
  }

  private drawStoneTextureInRect(
    context: CanvasRenderingContext2D,
    left: number,
    top: number,
    width: number,
    height: number,
    seed: number,
    options?: {
      densityMultiplier?: number;
      crackDensityMultiplier?: number;
      alphaMultiplier?: number;
      crackAlpha?: number;
      toneMin?: number;
      toneRange?: number;
    }
  ): void {
    if (width <= 0 || height <= 0) {
      return;
    }

    const densityMultiplier = options?.densityMultiplier ?? 1;
    const crackDensityMultiplier = options?.crackDensityMultiplier ?? 1;
    const alphaMultiplier = options?.alphaMultiplier ?? 1;
    const crackAlpha = options?.crackAlpha ?? 0.24;
    const toneMin = options?.toneMin ?? 160;
    const toneRange = options?.toneRange ?? 70;

    const area = width * height;
    const dotCount = Math.max(5, Math.floor((area / 85) * densityMultiplier));
    for (let index = 0; index < dotCount; index += 1) {
      const x = left + this.getSeededNoise(seed, index * 5 + 1) * width;
      const y = top + this.getSeededNoise(seed, index * 5 + 2) * height;
      const radius = 0.45 + this.getSeededNoise(seed, index * 5 + 3) * 0.95;
      const tone = toneMin + Math.floor(this.getSeededNoise(seed, index * 5 + 4) * toneRange);
      const alpha = (0.12 + this.getSeededNoise(seed, index * 5 + 5) * 0.2) * alphaMultiplier;

      context.fillStyle = `rgba(${tone}, ${tone}, ${tone}, ${alpha})`;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }

    const crackCount = Math.max(1, Math.floor((area / 1200) * crackDensityMultiplier));
    for (let index = 0; index < crackCount; index += 1) {
      const startX = left + this.getSeededNoise(seed + 31, index * 7 + 1) * width;
      const startY = top + this.getSeededNoise(seed + 31, index * 7 + 2) * height;
      const length = 6 + this.getSeededNoise(seed + 31, index * 7 + 3) * 12;
      const angle = this.getSeededNoise(seed + 31, index * 7 + 4) * Math.PI * 2;
      const endX = startX + Math.cos(angle) * length;
      const endY = startY + Math.sin(angle) * length;

      context.strokeStyle = `rgba(92, 97, 108, ${crackAlpha})`;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(startX, startY);
      context.lineTo(endX, endY);
      context.stroke();
    }
  }

  private drawBrickPatternInPolygon(
    context: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
    seed: number,
    wallDepth: number
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
    for (let i = 1; i < points.length; i += 1) {
      context.lineTo(points[i].x, points[i].y);
    }
    context.closePath();
    context.clip();

    this.drawBrickPatternInRect(context, left, top, right - left, bottom - top, seed, wallDepth);
    context.restore();
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

      const scaled = Math.floor(channel * (1 - amount));
      return Math.max(0, Math.min(255, scaled));
    };

    const red = parseChannel(0).toString(16).padStart(2, '0');
    const green = parseChannel(2).toString(16).padStart(2, '0');
    const blue = parseChannel(4).toString(16).padStart(2, '0');
    return `#${red}${green}${blue}`;
  }

  private toFirstPersonBlock(type: PathBlockType, door: Door | null, wall: Wall | null = null): FirstPersonBlock {
    return {
      type,
      hasKeyhole: Boolean(door?.keyLock),
      isDestructible: wall?.isDestructible === true,
    };
  }

  private loadDoorImages(): void {
    for (const key of ['open', 'closed'] as const) {
      if (this.doorImageCache.has(key)) continue;
      const img = new Image();
      img.onload = () => {
        this.doorImageCache.set(key, img);
        this.drawFirstPersonViewCanvas();
      };
      img.src = key === 'open' ? '/images/dooropen.jpg' : '/images/doorclosed.jpg';
    }
  }

  private loadStairsUpImages(): void {
    for (let i = 1; i <= 3; i++) {
      const key = `stup${i}`;
      if (this.stairsUpImageCache.has(key)) continue;
      const img = new Image();
      img.onload = () => {
        this.stairsUpImageCache.set(key, img);
        this.drawFirstPersonViewCanvas();
      };
      img.src = `/images/${key}.jpg`;
    }
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

    const cacheKey = block.type === 'openDoor' ? 'open' : 'closed';
    const img = this.doorImageCache.get(cacheKey) ?? null;

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
      if (block.type === 'openDoor') {
        const openingWidth = Math.max(3, doorW * 0.35);
        const openingLeft = doorRight - openingWidth - Math.max(2, doorW * 0.06);
        context.fillStyle = '#0c0f14';
        context.fillRect(openingLeft, doorTop + 2, openingWidth, Math.max(2, doorH - 4));
        context.strokeStyle = '#ff8080';
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(doorLeft + 2, doorTop + 3);
        context.lineTo(openingLeft, doorTop + Math.max(3, doorH * 0.32));
        context.stroke();
      } else {
        const centerX = (doorLeft + doorRight) / 2;
        context.strokeStyle = '#f5c1c1';
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(centerX, doorTop + 1);
        context.lineTo(centerX, doorBottom - 1);
        context.stroke();
        const handleX = doorRight - Math.max(3, doorW * 0.18);
        const handleY = doorTop + doorH * 0.52;
        context.fillStyle = '#f7dddd';
        context.beginPath();
        context.arc(handleX, handleY, Math.max(1.2, doorW * 0.025), 0, Math.PI * 2);
        context.fill();
        if (block.hasKeyhole) {
          const keyholeX = doorRight - Math.max(4, doorW * 0.28);
          const keyholeY = doorTop + doorH * 0.64;
          const keyholeRadius = Math.max(1.2, doorW * 0.03);
          context.fillStyle = '#1f1111';
          context.beginPath();
          context.arc(keyholeX, keyholeY, keyholeRadius, 0, Math.PI * 2);
          context.fill();
          context.fillRect(
            keyholeX - keyholeRadius * 0.45,
            keyholeY,
            keyholeRadius * 0.9,
            Math.max(2, keyholeRadius * 2.2)
          );
        }
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
    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const range =
      typeof cheater.rangeOfSight === 'number' && Number.isFinite(cheater.rangeOfSight)
        ? Math.max(0, cheater.rangeOfSight)
        : DEFAULT_CHEATER.rangeOfSight;

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
    const cornerPeekDistance = 1;
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

      if (blockedToHorizontal && blockedToVertical) {
        return false;
      }

      if (blockedToHorizontal || blockedToVertical) {
        const cornerDistanceFromSource = Math.max(
          Math.abs(currentRow - fromRow),
          Math.abs(currentColumn - fromColumn)
        );

        if (cornerDistanceFromSource > cornerPeekDistance) {
          return false;
        }
      }

      currentColumn = nextColumn;
      currentRow = nextRow;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    }

    return currentRow === toRow && currentColumn === toColumn;
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
    return this.isWallConnection(connection) || this.isDoorConnection(connection);
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

  private tryMoveCheaterByFacingStep(stepMultiplier: 1 | -1): void {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return;
    }

    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const moveDelta = this.getMovementDeltaForFacingDirection(cheater.facingDir);
    const nextRow = preview.centerRow + moveDelta.rowOffset * stepMultiplier;
    const nextColumn = preview.centerColumn + moveDelta.columnOffset * stepMultiplier;
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

    if (this.previewShowMonsters()) {
      const nextSquareKey = this.getSquareKey(nextRow, nextColumn);
      const monsterPlacements = this.monsterPlacementsByDungon()[preview.dungonId] ?? [];
      const hasMonster = monsterPlacements.some(
        (p) => this.getSquareKey(p.row, p.column) === nextSquareKey
      );
      if (hasMonster) {
        return;
      }
    }

    const halfDimension = Math.floor(this.previewGridDimension / 2);
    this.gridPreviewContext.set({
      ...preview,
      centerRow: nextRow,
      centerColumn: nextColumn,
      startRow: nextRow - halfDimension,
      startColumn: nextColumn - halfDimension,
    });

    this.drawPreviewGridCanvas();
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

  private drawCompass(context: CanvasRenderingContext2D, facingDir: FacingDirection): void {
    const cx = 38;
    const cy = 38;
    const radius = 22;
    const dirMap: Record<FacingDirection, { label: string; angle: number }> = {
      up:    { label: 'N', angle: -Math.PI / 2 },
      right: { label: 'E', angle: 0 },
      down:  { label: 'S', angle: Math.PI / 2 },
      left:  { label: 'W', angle: Math.PI },
    };
    const facing = dirMap[facingDir];
    const arrowAngle = facing.angle;

    context.save();

    // Background circle
    context.beginPath();
    context.arc(cx, cy, radius + 5, 0, Math.PI * 2);
    context.fillStyle = 'rgba(0, 0, 0, 0.50)';
    context.fill();
    context.strokeStyle = 'rgba(190, 175, 145, 0.55)';
    context.lineWidth = 1;
    context.stroke();

    // Cardinal labels
    const cardinals: { label: string; angle: number }[] = [
      { label: 'N', angle: -Math.PI / 2 },
      { label: 'E', angle: 0 },
      { label: 'S', angle: Math.PI / 2 },
      { label: 'W', angle: Math.PI },
    ];
    context.font = 'bold 9px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (const c of cardinals) {
      const lx = cx + Math.cos(c.angle) * (radius - 1);
      const ly = cy + Math.sin(c.angle) * (radius - 1);
      context.fillStyle = c.label === facing.label ? '#f8c84a' : 'rgba(210, 200, 180, 0.85)';
      context.fillText(c.label, lx, ly);
    }

    // Arrow pointing in the facing direction
    const arrowLen = radius * 0.52;
    const arrowTipX = cx + Math.cos(arrowAngle) * arrowLen;
    const arrowTipY = cy + Math.sin(arrowAngle) * arrowLen;
    const arrowBaseX = cx - Math.cos(arrowAngle) * (arrowLen * 0.45);
    const arrowBaseY = cy - Math.sin(arrowAngle) * (arrowLen * 0.45);
    const perpX = Math.sin(arrowAngle) * 4.5;
    const perpY = -Math.cos(arrowAngle) * 4.5;
    context.beginPath();
    context.moveTo(arrowTipX, arrowTipY);
    context.lineTo(arrowBaseX + perpX, arrowBaseY + perpY);
    context.lineTo(arrowBaseX - perpX, arrowBaseY - perpY);
    context.closePath();
    context.fillStyle = '#f8c84a';
    context.fill();

    context.restore();
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
      return {
        type: toConnection.state === 'closed' ? 'closedDoor' : 'openDoor',
        door: toConnection,
      };
    }

    return { type: 'none', door: null };
  }

  private getFacingDirectionFromKey(key: string): FacingDirection | null {
    if (key === 'ArrowUp') {
      return 'up';
    }

    if (key === 'ArrowRight') {
      return 'right';
    }

    if (key === 'ArrowDown') {
      return 'down';
    }

    if (key === 'ArrowLeft') {
      return 'left';
    }

    return null;
  }

  private normalizeFacingDirection(direction: unknown): FacingDirection {
    return direction === 'up' || direction === 'right' || direction === 'down' || direction === 'left'
      ? direction
      : DEFAULT_CHEATER.facingDir;
  }

  private drawFacingArrow(
    context: CanvasRenderingContext2D,
    left: number,
    top: number,
    size: number,
    direction: FacingDirection
  ): void {
    const centerX = left + size / 2;
    const centerY = top + size / 2;
    const tipOffset = size * 0.34;
    const baseOffset = size * 0.14;
    const wingOffset = size * 0.2;

    let tipX = centerX;
    let tipY = centerY;
    let wingAX = centerX;
    let wingAY = centerY;
    let wingBX = centerX;
    let wingBY = centerY;

    if (direction === 'up') {
      tipY = centerY - tipOffset;
      wingAX = centerX - wingOffset;
      wingAY = centerY + baseOffset;
      wingBX = centerX + wingOffset;
      wingBY = centerY + baseOffset;
    } else if (direction === 'right') {
      tipX = centerX + tipOffset;
      wingAX = centerX - baseOffset;
      wingAY = centerY - wingOffset;
      wingBX = centerX - baseOffset;
      wingBY = centerY + wingOffset;
    } else if (direction === 'down') {
      tipY = centerY + tipOffset;
      wingAX = centerX - wingOffset;
      wingAY = centerY - baseOffset;
      wingBX = centerX + wingOffset;
      wingBY = centerY - baseOffset;
    } else {
      tipX = centerX - tipOffset;
      wingAX = centerX + baseOffset;
      wingAY = centerY - wingOffset;
      wingBX = centerX + baseOffset;
      wingBY = centerY + wingOffset;
    }

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

  private hasAnyDoorSelection(
    selections: Record<OpenBlockOptionKey, boolean>
  ): boolean {
    return (
      selections['doorTop'] ||
      selections['doorRight'] ||
      selections['doorBottom'] ||
      selections['doorLeft']
    );
  }

  private hasAnyWallSelection(
    selections: Record<OpenBlockOptionKey, boolean>
  ): boolean {
    return (
      selections['wallTop'] ||
      selections['wallRight'] ||
      selections['wallBottom'] ||
      selections['wallLeft']
    );
  }

  private synchronizeDoorConnections(
    squares: Record<string, Square>
  ): Record<string, Square> {
    const synchronizedSquares = Object.entries(squares).reduce<Record<string, Square>>(
      (accumulator, [squareKey, square]) => {
        accumulator[squareKey] = { ...square };
        return accumulator;
      },
      {}
    );

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
          synchronizedSquares[squareKey] = this.withSquareSide(
            synchronizedSquares[squareKey],
            sideRule.side,
            sharedDoor
          );
        }

        if (synchronizedSquares[neighborKey][sideRule.oppositeSide] !== sharedDoor) {
          synchronizedSquares[neighborKey] = this.withSquareSide(
            synchronizedSquares[neighborKey],
            sideRule.oppositeSide,
            sharedDoor
          );
        }
      }
    }

    return synchronizedSquares;
  }

  private getSquareKey(row: number, column: number): string {
    return `${row}:${column}`;
  }

  private addSquareWithSharedWallCleanup(
    row: number,
    column: number,
    existingSquares: Record<string, Square>,
    selections: Record<OpenBlockOptionKey, boolean>,
    doorPromptResult: DoorPromptResult | null
  ): Record<string, Square> {
    const nextSquares = { ...existingSquares };
    let nextSquare = this.buildSquare(row, column);

    for (const sideRule of SIDE_RULES) {
      const neighborRow = row + sideRule.neighborRowOffset;
      const neighborColumn = column + sideRule.neighborColumnOffset;
      const neighborKey = this.getSquareKey(neighborRow, neighborColumn);
      const neighborSquare = nextSquares[neighborKey];

      const wantsDoor = selections[sideRule.doorKey];
      const wantsWall = selections[sideRule.wallKey];

      if (wantsDoor && doorPromptResult) {
        const sharedDoor = this.buildDoor(doorPromptResult, row, column);
        nextSquare = this.withSquareSide(nextSquare, sideRule.side, sharedDoor);

        if (neighborSquare) {
          nextSquares[neighborKey] = this.withSquareSide(
            neighborSquare,
            sideRule.oppositeSide,
            sharedDoor
          );
        }
        continue;
      }

      if (wantsWall) {
        nextSquare = this.withSquareSide(nextSquare, sideRule.side, this.buildDestructibleWall(10));
        if (neighborSquare) {
          nextSquares[neighborKey] = this.withSquareSide(
            neighborSquare,
            sideRule.oppositeSide,
            this.buildDestructibleWall(10)
          );
        }
        continue;
      }

      if (!neighborSquare) {
        continue;
      }

      const neighborConnection = neighborSquare[sideRule.oppositeSide];
      if (this.isWallConnection(neighborConnection) && neighborConnection.isDestructible) {
        // Neighbor already has a deliberately-placed destructible wall — share it with the new square
        nextSquare = this.withSquareSide(nextSquare, sideRule.side, neighborConnection);
      } else {
        // Open the passage, removing structural walls on both sides
        nextSquare = this.withSquareSide(nextSquare, sideRule.side, null);
        if (this.isWallConnection(neighborConnection)) {
          nextSquares[neighborKey] = this.withSquareSide(
            neighborSquare,
            sideRule.oppositeSide,
            null
          );
        }
      }
    }

    nextSquares[this.getSquareKey(row, column)] = nextSquare;
    return this.synchronizeDoorConnections(nextSquares);
  }

  private applyDoorToExistingSquare(
    row: number,
    column: number,
    existingSquares: Record<string, Square>,
    selections: Record<OpenBlockOptionKey, boolean>,
    doorPromptResult: DoorPromptResult | null
  ): Record<string, Square> {
    const nextSquares = { ...existingSquares };
    const squareKey = this.getSquareKey(row, column);
    const currentSquare = nextSquares[squareKey];
    if (!currentSquare) {
      return nextSquares;
    }

    let nextSquare: Square = { ...currentSquare };

    for (const sideRule of SIDE_RULES) {
      const wantsDoor = selections[sideRule.doorKey];
      const wantsWall = selections[sideRule.wallKey];
      if (!wantsDoor && !wantsWall) {
        continue;
      }

      const neighborRow = row + sideRule.neighborRowOffset;
      const neighborColumn = column + sideRule.neighborColumnOffset;
      const neighborKey = this.getSquareKey(neighborRow, neighborColumn);
      const neighborSquare = nextSquares[neighborKey];

      if (wantsDoor && doorPromptResult) {
        const sharedDoor = this.buildDoor(doorPromptResult, row, column);
        nextSquare = this.withSquareSide(nextSquare, sideRule.side, sharedDoor);

        if (neighborSquare) {
          nextSquares[neighborKey] = this.withSquareSide(
            neighborSquare,
            sideRule.oppositeSide,
            sharedDoor
          );
        }
        continue;
      }

      nextSquare = this.withSquareSide(nextSquare, sideRule.side, this.buildDestructibleWall(10));

      if (neighborSquare) {
        nextSquares[neighborKey] = this.withSquareSide(
          neighborSquare,
          sideRule.oppositeSide,
          this.buildDestructibleWall(10)
        );
      }
    }

    nextSquares[squareKey] = nextSquare;
    return this.synchronizeDoorConnections(nextSquares);
  }

  private removeSquareAndRestoreNeighborWalls(
    row: number,
    column: number,
    existingSquares: Record<string, Square>
  ): Record<string, Square> {
    const nextSquares = { ...existingSquares };
    const removedKey = this.getSquareKey(row, column);
    if (!nextSquares[removedKey]) {
      return nextSquares;
    }

    delete nextSquares[removedKey];

    const ensureNeighborWall = (
      neighborRow: number,
      neighborColumn: number,
      neighborSide: SquareSide
    ): void => {
      const neighborKey = this.getSquareKey(neighborRow, neighborColumn);
      const neighborSquare = nextSquares[neighborKey];
      if (!neighborSquare) {
        return;
      }

      if (this.isWallConnection(neighborSquare[neighborSide])) {
        return;
      }

      nextSquares[neighborKey] = this.withSquareSide(
        neighborSquare,
        neighborSide,
        this.buildWall()
      );
    };

    ensureNeighborWall(row - 1, column, 'toBottom');
    ensureNeighborWall(row + 1, column, 'toTop');
    ensureNeighborWall(row, column - 1, 'toRight');
    ensureNeighborWall(row, column + 1, 'toLeft');

    return nextSquares;
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

  private buildSquare(row: number, column: number): Square {
    const squareId = row * this.gridColumnCount + column;
    return {
      id: squareId,
      row,
      column,
      description: '',
      isTrapped: false,
      toTop: this.buildWall(),
      toRight: this.buildWall(),
      toBottom: this.buildWall(),
      toLeft: this.buildWall(),
    };
  }

  private buildDoor(
    settings: DoorPromptResult,
    row: number,
    column: number
  ): Door {
    const doorId = this.nextDoorId;
    this.nextDoorId += 1;

    let keyLock: Key | null = null;
    if (settings.isLocked) {
      keyLock = this.buildKey(doorId, row, column, settings.name);
      this.keyList = [...this.keyList, keyLock];
    }

    return {
      id: doorId,
      name: settings.name,
      description: settings.description,
      keyLock,
      isLocked: settings.isLocked,
      isTrapped: settings.trap !== null,
      toPick: settings.toPick ?? null,
      trap: settings.trap ?? null,
      HP: settings.hp,
      state: settings.state,
      isHidden: settings.isHidden,
      toFind: settings.toFind,
      isFound: false,
      spReward: settings.spReward ?? null,
    };
  }

  private buildKey(
    doorId: number,
    row: number,
    column: number,
    doorName: string
  ): Key {
    const key: Key = {
      id: this.nextKeyId,
      name: doorName ? `${doorName} Key` : 'Door Key',
      description: `Unlocks door ${doorId} near row ${row}, column ${column}`,
      doorId,
      rownId: null,
      columnId: null,
    };

    this.nextKeyId += 1;
    return key;
  }

  private buildWall(): Wall {
    const wall: Wall = {
      id: this.nextWallId,
      name: '',
      description: '',
      HP: 10,
      state: 'intact',
      isDestructible: false,
    };

    this.nextWallId += 1;
    return wall;
  }

  private buildDestructibleWall(hp = 20): Wall {
    const wall: Wall = {
      id: this.nextWallId,
      name: 'Destructible Wall',
      description: '',
      HP: hp,
      state: 'intact',
      isDestructible: true,
    };

    this.nextWallId += 1;
    return wall;
  }

  // ── Library tab helpers ───────────────────────────────────────────────────

  setCreatorTab(id: CreatorTabId): void { this.activeCreatorTab.set(id); }
  isCreatorTabActive(id: CreatorTabId): boolean { return this.activeCreatorTab() === id; }

  isAdminUser(): boolean { return this.account.isAdmin(); }

  private loadLibImageOptions(): void {
    const userkey = this.account.getKey();
    if (!userkey) return;
    this.http
      .get<{ id: number; name: string; path: string }[]>(`${API_BASE_URL}/images`, { params: { userkey, scope: 'library' } })
      .subscribe({ next: (items) => this.libImageOptions.set(items), error: () => this.libImageOptions.set([]) });
  }

  private loadLibSoundOptions(): void {
    const userkey = this.account.getKey();
    if (!userkey) return;
    this.http
      .get<{ id: number; name: string; path: string }[]>(`${API_BASE_URL}/sounds`, { params: { userkey, scope: 'library' } })
      .subscribe({ next: (items) => this.libSoundOptions.set(items), error: () => this.libSoundOptions.set([]) });
  }

  private loadLibSpellOptions(userkey: string): void {
    this.http
      .get<{ id: number; name: string }[]>(`${API_BASE_URL}/spells`, { params: { userkey } })
      .subscribe({ next: (items) => this.libSpells.set(items), error: () => this.libSpells.set([]) });
  }

  private loadLibUserImages(): void {
    const userkey = this.account.getKey();
    if (!userkey) { this.libImagesError.set('Log in to manage your images.'); return; }
    this.isLoadingLibImages.set(true);
    this.libImagesError.set(null);
    this.http
      .get<LibImageItem[]>(`${API_BASE_URL}/images`, { params: { userkey } })
      .pipe(finalize(() => this.isLoadingLibImages.set(false)))
      .subscribe({
        next: (items) => { this.libUserImages.set(items); this.loadLibImageOptions(); },
        error: () => { this.libUserImages.set([]); this.libImagesError.set('Failed to load your images.'); },
      });
  }

  private loadLibUserSounds(): void {
    const userkey = this.account.getKey();
    if (!userkey) { this.libSoundsError.set('Log in to manage your sounds.'); return; }
    this.isLoadingLibSounds.set(true);
    this.libSoundsError.set(null);
    this.http
      .get<LibSoundItem[]>(`${API_BASE_URL}/sounds`, { params: { userkey } })
      .pipe(finalize(() => this.isLoadingLibSounds.set(false)))
      .subscribe({
        next: (items) => { this.libUserSounds.set(items); this.loadLibSoundOptions(); },
        error: () => { this.libUserSounds.set([]); this.libSoundsError.set('Failed to load your sounds.'); },
      });
  }

  private loadLibUserSpells(): void {
    const userkey = this.account.getKey();
    if (!userkey) { this.libSpellsError.set('Log in to manage your spells.'); return; }
    this.isLoadingLibSpells.set(true);
    this.libSpellsError.set(null);
    this.http
      .get<LibSpellItem[]>(`${API_BASE_URL}/spells`, { params: { userkey } })
      .pipe(finalize(() => this.isLoadingLibSpells.set(false)))
      .subscribe({
        next: (items) => { this.libUserSpells.set(items); },
        error: () => { this.libUserSpells.set([]); this.libSpellsError.set('Failed to load your spells.'); },
      });
  }

  toggleLibImageSection(): void { this.isLibImageSectionVisible.update((v) => !v); }
  toggleLibSoundSection(): void { this.isLibSoundSectionVisible.update((v) => !v); }
  toggleLibSpellSection(): void { this.isLibSpellSectionVisible.update((v) => !v); }

  libImageUploadName(): string | null { return this.selectedLibImageFile()?.name ?? null; }
  libSoundUploadName(): string | null { return this.selectedLibSoundFile()?.name ?? null; }

  onLibImageFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    this.selectedLibImageFile.set(file);
    if (file && this.editingLibImageId() === null && !this.libImageForm.controls.name.value.trim()) {
      this.libImageForm.controls.name.setValue(this.libFileBaseName(file.name));
    }
  }

  onLibSoundFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    this.selectedLibSoundFile.set(file);
    if (file && this.editingLibSoundId() === null && !this.libSoundForm.controls.name.value.trim()) {
      this.libSoundForm.controls.name.setValue(this.libFileBaseName(file.name));
    }
  }

  editLibImage(item: LibImageItem): void {
    this.editingLibImageId.set(item.id);
    this.selectedLibImageFile.set(null);
    this.libImageSaveMessage.set(null);
    this.libImageForm.reset({ path: item.path, isPublic: item.isPublic, isActive: item.isActive, name: item.name });
  }
  cancelEditLibImage(): void { this.editingLibImageId.set(null); this.selectedLibImageFile.set(null); this.libImageSaveMessage.set(null); this.libImageForm.reset({ path: '', isPublic: false, isActive: true, name: '' }); }

  editLibSound(item: LibSoundItem): void {
    this.editingLibSoundId.set(item.id);
    this.selectedLibSoundFile.set(null);
    this.libSoundSaveMessage.set(null);
    this.libSoundForm.reset({ path: item.path, isPublic: item.isPublic, isActive: item.isActive, name: item.name });
  }
  cancelEditLibSound(): void { this.editingLibSoundId.set(null); this.selectedLibSoundFile.set(null); this.libSoundSaveMessage.set(null); this.libSoundForm.reset({ path: '', isPublic: false, isActive: true, name: '' }); }

  editLibSpell(item: LibSpellItem): void {
    this.editingLibSpellId.set(item.id);
    this.libSpellSaveMessage.set(null);
    this.libSpellForm.reset({
      name: item.name || '', description: item.description || '', range: item.range ?? 0,
      effectOn: item.effectOn || 'HP', effectOn2: item.effectOn2 || '',
      lastFor: item.lastFor ?? 0, effectAmount: item.effectAmount ?? 0, effectAmount2: item.effectAmount2 ?? 0,
      value: item.value ?? 0, sp: item.sp ?? 0, successTestValue: item.successTestValue ?? 0,
      magicCost: item.magicCost ?? 1, imageId: item.imageId ?? null, soundId: item.soundId ?? null, isPublic: item.isPublic,
    });
  }
  cancelEditLibSpell(): void { this.editingLibSpellId.set(null); this.libSpellSaveMessage.set(null); this.resetLibSpellForm(); }

  onLibSpellImageUploaded(item: UploadedMediaItem): void {
    this.libImageOptions.update((opts) => [...opts, item]);
    this.libSpellForm.controls.imageId.setValue(item.id);
  }

  onLibSpellSoundUploaded(item: UploadedMediaItem): void {
    this.libSoundOptions.update((opts) => [...opts, item]);
    this.libSpellForm.controls.soundId.setValue(item.id);
  }

  libSelectedSpellImageUrl(): string {
    const id = this.libSpellForm.controls.imageId.value;
    const img = id !== null ? this.libImageOptions().find((i) => i.id === id) : null;
    return img ? this.libResolveImageUrl(img.path) : '';
  }

  libResolveImageUrl(path: string): string {
    const t = (path || '').trim();
    if (!t) return '';
    if (/^https?:\/\//i.test(t)) return t;
    return t.startsWith('/') ? `${API_BASE_URL}${t}` : `${API_BASE_URL}/${t}`;
  }

  libResolveSoundUrl(path: string): string {
    const t = (path || '').trim();
    if (!t) return '';
    if (/^https?:\/\//i.test(t)) return t;
    return t.startsWith('/') ? `${API_BASE_URL}${t}` : `${API_BASE_URL}/${t}`;
  }

  saveLibImage(): void {
    if (this.isSavingLibImage()) return;
    const userkey = this.account.getKey();
    if (!userkey) { this.libImageSaveMessage.set('Please log in to save images.'); return; }
    const v = this.libImageForm.getRawValue();
    const payload: LibImageWritePayload = { path: (v.path || '').trim(), isPublic: this.isAdminUser() && v.isPublic, isActive: v.isActive, name: (v.name || '').trim() || 'Unnamed Image' };
    const editingId = this.editingLibImageId();
    const request$ = editingId
      ? this.http.put<{ result: number; error?: string }>(`${API_BASE_URL}/images/${editingId}`, { userkey, image: payload })
      : (() => {
          const file = this.selectedLibImageFile();
          if (!file) { this.libImageSaveMessage.set('Select an image file to upload.'); return null; }
          const fd = new FormData();
          fd.append('userkey', userkey);
          fd.append('name', payload.name);
          fd.append('isPublic', payload.isPublic ? 'true' : 'false');
          fd.append('isActive', payload.isActive ? 'true' : 'false');
          fd.append('image', file);
          return this.http.post<{ result: number; error?: string }>(`${API_BASE_URL}/images`, fd);
        })();
    if (!request$) return;
    this.isSavingLibImage.set(true);
    this.libImageSaveMessage.set(null);
    request$.pipe(finalize(() => this.isSavingLibImage.set(false))).subscribe({
      next: (r) => {
        if (r.result !== 1) { this.libImageSaveMessage.set(r.error || 'Failed to save image.'); return; }
        this.loadLibUserImages();
        this.libImageSaveMessage.set(editingId ? 'Image updated.' : 'Image uploaded.');
        this.cancelEditLibImage();
      },
      error: () => this.libImageSaveMessage.set('Failed to save image.'),
    });
  }

  saveLibSound(): void {
    if (this.isSavingLibSound()) return;
    const userkey = this.account.getKey();
    if (!userkey) { this.libSoundSaveMessage.set('Please log in to save sounds.'); return; }
    const v = this.libSoundForm.getRawValue();
    const payload: LibSoundWritePayload = { path: (v.path || '').trim(), isPublic: this.isAdminUser() && v.isPublic, isActive: v.isActive, name: (v.name || '').trim() || 'Unnamed Sound' };
    const editingId = this.editingLibSoundId();
    const request$ = editingId
      ? this.http.put<{ result: number; error?: string }>(`${API_BASE_URL}/sounds/${editingId}`, { userkey, sound: payload })
      : (() => {
          const file = this.selectedLibSoundFile();
          if (!file) { this.libSoundSaveMessage.set('Select a sound file to upload.'); return null; }
          const fd = new FormData();
          fd.append('userkey', userkey);
          fd.append('name', payload.name);
          fd.append('isPublic', payload.isPublic ? 'true' : 'false');
          fd.append('isActive', payload.isActive ? 'true' : 'false');
          fd.append('sound', file);
          return this.http.post<{ result: number; error?: string }>(`${API_BASE_URL}/sounds`, fd);
        })();
    if (!request$) return;
    this.isSavingLibSound.set(true);
    this.libSoundSaveMessage.set(null);
    request$.pipe(finalize(() => this.isSavingLibSound.set(false))).subscribe({
      next: (r) => {
        if (r.result !== 1) { this.libSoundSaveMessage.set(r.error || 'Failed to save sound.'); return; }
        this.loadLibUserSounds();
        this.libSoundSaveMessage.set(editingId ? 'Sound updated.' : 'Sound uploaded.');
        this.cancelEditLibSound();
      },
      error: () => this.libSoundSaveMessage.set('Failed to save sound.'),
    });
  }

  saveLibSpell(): void {
    if (this.isSavingLibSpell()) return;
    const userkey = this.account.getKey();
    if (!userkey) { this.libSpellSaveMessage.set('Please log in to save spells.'); return; }
    const c = this.libSpellForm.controls;
    const payload: LibSpellWritePayload = {
      name: (c.name.value || '').trim() || 'Unnamed Spell',
      description: (c.description.value || '').trim(),
      range: Math.max(0, c.range.value ?? 0),
      effectOn: (c.effectOn.value || 'HP').trim(),
      effectOn2: (c.effectOn2.value || '').trim(),
      lastFor: Math.max(0, c.lastFor.value ?? 0),
      effectAmount: c.effectAmount.value ?? 0,
      effectAmount2: c.effectAmount2.value ?? 0,
      value: Math.max(0, c.value.value ?? 0),
      sp: Math.max(0, c.sp.value ?? 0),
      successTestValue: Math.max(0, c.successTestValue.value ?? 0),
      magicCost: Math.max(1, c.magicCost.value ?? 1),
      imageId: c.imageId.value ?? null,
      soundId: c.soundId.value ?? null,
      isPublic: this.isAdminUser() ? c.isPublic.value : false,
    };
    const editingId = this.editingLibSpellId();
    const request$ = editingId
      ? this.http.put<{ result: number; error?: string }>(`${API_BASE_URL}/spells/${editingId}`, { userkey, spell: payload })
      : this.http.post<{ result: number; error?: string }>(`${API_BASE_URL}/spells`, { userkey, spell: payload });
    this.isSavingLibSpell.set(true);
    this.libSpellSaveMessage.set(null);
    request$.pipe(finalize(() => this.isSavingLibSpell.set(false))).subscribe({
      next: (r) => {
        if (r.result !== 1) { this.libSpellSaveMessage.set(r.error || 'Failed to save spell.'); return; }
        this.loadLibUserSpells();
        const key = this.account.getKey();
        if (key) this.loadLibSpellOptions(key);
        this.libSpellSaveMessage.set(editingId ? 'Spell updated.' : 'Spell created.');
        this.cancelEditLibSpell();
      },
      error: () => this.libSpellSaveMessage.set('Failed to save spell.'),
    });
  }

  private resetLibSpellForm(): void {
    this.libSpellForm.reset({ name: '', description: '', range: 0, effectOn: 'HP', effectOn2: '',
      lastFor: 0, effectAmount: 0, effectAmount2: 0, value: 0, sp: 0, successTestValue: 0, magicCost: 1, imageId: null, soundId: null, isPublic: false });
  }

  private libFileBaseName(fileName: string): string {
    const t = (fileName || '').trim();
    const i = t.lastIndexOf('.');
    return (i > 0 ? t.slice(0, i).trim() : t) || 'Uploaded File';
  }
}
