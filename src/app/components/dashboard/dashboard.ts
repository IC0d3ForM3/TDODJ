import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { ActiveGameListItem, ArmorType, CoinType, DungonListItem, PotionEffectTarget, TresherType } from '../../interfaces/game';
import { Account } from '../../services/account';
import { API_BASE_URL } from '../../api-config';

interface UserTresherListItem {
  id: number;
  userguid: string;
  type: TresherType;
  name: string;
  description: string;
  worth: number;
  curseID: number | null;
  trapID: number | null;
  HP: number | null;
  damage: number | null;
  hands: number | null;
  range: number | null;
  ammoType: string | null;
  speedReduction: number | null;
  armorType: ArmorType | null;
  coinType: CoinType | null;
  effectNumber: number | null;
  effectTarget: PotionEffectTarget | null;
  effectDuration: number | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UserTresherEditorValue {
  type: TresherType;
  name: string;
  description: string;
  worth: number;
  trapID: number | null;
  curseID: number | null;
  HP: number | null;
  damage: number | null;
  hands: number | null;
  range: number | null;
  ammoType: string | null;
  speedReduction: number | null;
  armorType: ArmorType | null;
  coinType: CoinType | null;
  effectNumber: number | null;
  effectTarget: PotionEffectTarget | null;
  effectDuration: number | null;
  isPublic: boolean;
}

interface UserTresherWritePayload {
  type: TresherType;
  name: string;
  description: string;
  worth: number;
  trapID: number | null;
  curseID: number | null;
  HP: number | null;
  damage: number | null;
  hands: number | null;
  range: number | null;
  ammoType: string | null;
  speedReduction: number | null;
  armorType: ArmorType | null;
  coinType: CoinType | null;
  effectNumber: number | null;
  effectTarget: PotionEffectTarget | null;
  effectDuration: number | null;
  isPublic: boolean;
}

interface UserMonsterAttackListItem {
  description: string;
  damage: number;
  plusToHit: number;
}

interface UserMonsterListItem {
  id: number;
  userguid: string;
  imageId: number | null;
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
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UserMonsterAttackEditorValue {
  description: string;
  damage: number;
  plusToHit: number;
}

interface UserMonsterWritePayload {
  imageId: number | null;
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
  isPublic: boolean;
}

interface UserImageListItem {
  id: number;
  userguid: string;
  path: string;
  isPublic: boolean;
  isActive: boolean;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface UserImageEditorValue {
  path: string;
  isPublic: boolean;
  isActive: boolean;
  name: string;
}

interface UserImageWritePayload {
  path: string;
  isPublic: boolean;
  isActive: boolean;
  name: string;
}

interface UserFriendListItem {
  id: number;
  userurid: string;
  friendurid: string;
  isActiveFriend: boolean;
  friendEmail: string;
}

type PcSpeciesOption = 'Human' | 'Elph' | 'DwarPh' | 'Shorties';
type PcTypeOption = 'Figher' | 'Mage' | 'thieph' | 'Healer';

interface UserPcListItem {
  id: number;
  userguid: string;
  name: string;
  species: PcSpeciesOption;
  type: PcTypeOption;
  imageId: number | null;
  maxHP: number;
  currentHP: number;
  ac: number;
  movementEconomy: number;
  poisonResest: number;
  magicPower: number;
  level: number;
  strength: number;
  rangeOfView: number;
  primaryTresherId: number | null;
  weaponTresherId: number | null;
  tresherIds: number[];
  headArmorTresherId: number | null;
  bodyArmorTresherId: number | null;
  leftArmArmorTresherId: number | null;
  rightArmArmorTresherId: number | null;
  leftLegArmorTresherId: number | null;
  rightLegArmorTresherId: number | null;
  createdAt: string;
  updatedAt: string;
}

interface UserPcWritePayload {
  name: string;
  species: PcSpeciesOption;
  type: PcTypeOption;
  imageId: number | null;
  maxHP: number;
  currentHP: number;
  ac: number;
  movementEconomy: number;
  poisonResest: number;
  magicPower: number;
  level: number;
  strength: number;
  rangeOfView: number;
  primaryTresherId: number | null;
  weaponTresherId: number | null;
  tresherIds: number[];
  headArmorTresherId: number | null;
  bodyArmorTresherId: number | null;
  leftArmArmorTresherId: number | null;
  rightArmArmorTresherId: number | null;
  leftLegArmorTresherId: number | null;
  rightLegArmorTresherId: number | null;
}

type MonsterAttackFormGroup = FormGroup<{
  description: FormControl<string>;
  damage: FormControl<number>;
  plusToHit: FormControl<number>;
}>;

type MonsterTresherControl = FormControl<number | null>;
type PcTresherControl = FormControl<number | null>;

type DashboardTabId =
  | 'published-games'
  | 'active-games'
  | 'friend'
  | 'treshers'
  | 'monsters'
  | 'images'
  | 'pc';

interface DashboardTabItem {
  id: DashboardTabId;
  label: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly account = inject(Account);
  private readonly router = inject(Router);

  readonly isLoadingPublishedGames = signal(false);
  readonly publishedGamesError = signal<string | null>(null);
  readonly publishedGames = signal<DungonListItem[]>([]);
  readonly isStartingGameId = signal<number | null>(null);
  readonly startGameMessage = signal<string | null>(null);
  readonly pendingStartGame = signal<DungonListItem | null>(null);
  readonly selectedStartPcId = signal<number | null>(null);
  readonly activeGames = signal<ActiveGameListItem[]>([]);
  readonly isLoadingActiveGames = signal(false);
  readonly activeGamesError = signal<string | null>(null);
  readonly isDeletingGameId = signal<number | null>(null);
  readonly deleteGameMessage = signal<string | null>(null);
  readonly activeDashboardTab = signal<DashboardTabId>('published-games');
  readonly dashboardTabs: readonly DashboardTabItem[] = [
    { id: 'published-games', label: 'Available Games' },
    { id: 'active-games', label: 'Active Games' },
    { id: 'friend', label: 'Friend' },
    { id: 'treshers', label: 'Treshers' },
    { id: 'monsters', label: 'Monsters' },
    { id: 'images', label: 'Images' },
    { id: 'pc', label: 'PC' },
  ] as const;

  readonly isLoadingUserFriends = signal(false);
  readonly userFriendsError = signal<string | null>(null);
  readonly userFriends = signal<UserFriendListItem[]>([]);
  readonly isSavingUserFriend = signal(false);
  readonly userFriendSaveMessage = signal<string | null>(null);

  readonly isLoadingUserTreshers = signal(false);
  readonly userTreshersError = signal<string | null>(null);
  readonly userTreshers = signal<UserTresherListItem[]>([]);
  readonly isSavingUserTresher = signal(false);
  readonly editingUserTresherId = signal<number | null>(null);
  readonly userTresherSaveMessage = signal<string | null>(null);
  readonly isTresherSectionVisible = signal(true);

  readonly isLoadingUserMonsters = signal(false);
  readonly userMonstersError = signal<string | null>(null);
  readonly userMonsters = signal<UserMonsterListItem[]>([]);
  readonly isSavingUserMonster = signal(false);
  readonly editingUserMonsterId = signal<number | null>(null);
  readonly userMonsterSaveMessage = signal<string | null>(null);
  readonly isMonsterSectionVisible = signal(true);
  readonly monsterImageOptions = signal<UserImageListItem[]>([]);
  readonly monsterImageOptionsError = signal<string | null>(null);
  readonly isLoadingMonsterImageOptions = signal(false);
  readonly monsterTresherOptions = signal<UserTresherListItem[]>([]);
  readonly monsterTresherOptionsError = signal<string | null>(null);
  readonly isLoadingMonsterTresherOptions = signal(false);

  readonly isLoadingUserImages = signal(false);
  readonly userImagesError = signal<string | null>(null);
  readonly userImages = signal<UserImageListItem[]>([]);
  readonly isSavingUserImage = signal(false);
  readonly editingUserImageId = signal<number | null>(null);
  readonly userImageSaveMessage = signal<string | null>(null);
  readonly isImageSectionVisible = signal(true);
  readonly selectedImageFile = signal<File | null>(null);

  readonly isLoadingUserPcs = signal(false);
  readonly userPcsError = signal<string | null>(null);
  readonly userPcs = signal<UserPcListItem[]>([]);
  readonly isSavingUserPc = signal(false);
  readonly editingUserPcId = signal<number | null>(null);
  readonly userPcSaveMessage = signal<string | null>(null);

  readonly tresherTypeOptions: TresherType[] = ['Weapon', 'Armor', 'Coins', 'Potion', 'OtherTresher'];
  readonly armorTypeOptions: ArmorType[] = ['head', 'hand', 'body', 'arms', 'legs'];
  readonly coinTypeOptions: CoinType[] = ['Gold', 'Silver', 'Copper', 'Tin'];
  readonly potionEffectTargetOptions: PotionEffectTarget[] = ['Health', 'AC', 'AE'];
  readonly pcSpeciesOptions: PcSpeciesOption[] = ['Human', 'Elph', 'DwarPh', 'Shorties'];
  readonly pcTypeOptions: PcTypeOption[] = ['Figher', 'Mage', 'thieph', 'Healer'];

  readonly userTresherForm = new FormGroup({
    type: new FormControl<TresherType>('Weapon', { nonNullable: true }),
    name: new FormControl<string>('', { nonNullable: true }),
    description: new FormControl<string>('', { nonNullable: true }),
    worth: new FormControl<number>(0, { nonNullable: true }),
    trapID: new FormControl<number | null>(null),
    curseID: new FormControl<number | null>(null),
    HP: new FormControl<number | null>(10),
    damage: new FormControl<number | null>(0),
    hands: new FormControl<number | null>(1),
    range: new FormControl<number | null>(0),
    ammoType: new FormControl<string | null>(null),
    speedReduction: new FormControl<number | null>(0),
    armorType: new FormControl<ArmorType | null>('body'),
    coinType: new FormControl<CoinType | null>('Gold'),
    effectNumber: new FormControl<number | null>(0),
    effectTarget: new FormControl<PotionEffectTarget | null>('Health'),
    effectDuration: new FormControl<number | null>(1),
    isPublic: new FormControl<boolean>(false, { nonNullable: true }),
  });

  readonly userMonsterForm = new FormGroup({
    tresherIds: new FormArray<MonsterTresherControl>([this.createMonsterTresherControl()]),
    imageId: new FormControl<number | null>(null),
    name: new FormControl<string>('', { nonNullable: true }),
    type: new FormControl<string>('Unknown', { nonNullable: true }),
    description: new FormControl<string>('', { nonNullable: true }),
    hp: new FormControl<number>(1, { nonNullable: true }),
    movementEconomy: new FormControl<number>(0, { nonNullable: true }),
    ac: new FormControl<number>(10, { nonNullable: true }),
    runAt: new FormControl<number>(0, { nonNullable: true }),
    numberOfAttacks: new FormControl<number>(1, { nonNullable: true }),
    attacks: new FormArray<MonsterAttackFormGroup>([this.createMonsterAttackForm()]),
    isPublic: new FormControl<boolean>(false, { nonNullable: true }),
  });

  readonly userImageForm = new FormGroup({
    path: new FormControl<string>('', { nonNullable: true }),
    isPublic: new FormControl<boolean>(false, { nonNullable: true }),
    isActive: new FormControl<boolean>(true, { nonNullable: true }),
    name: new FormControl<string>('', { nonNullable: true }),
  });

  readonly userFriendForm = new FormGroup({
    email: new FormControl<string>('', { nonNullable: true }),
  });

  readonly userPcForm = new FormGroup({
    name: new FormControl<string>('', { nonNullable: true }),
    species: new FormControl<PcSpeciesOption>('Human', { nonNullable: true }),
    type: new FormControl<PcTypeOption>('Figher', { nonNullable: true }),
    imageId: new FormControl<number | null>(null),
    maxHP: new FormControl<number>(10, { nonNullable: true }),
    currentHP: new FormControl<number>(10, { nonNullable: true }),
    ac: new FormControl<number>(10, { nonNullable: true }),
    movementEconomy: new FormControl<number>(0, { nonNullable: true }),
    poisonResest: new FormControl<number>(0, { nonNullable: true }),
    magicPower: new FormControl<number>(0, { nonNullable: true }),
    level: new FormControl<number>(1, { nonNullable: true }),
    strength: new FormControl<number>(0, { nonNullable: true }),
    rangeOfView: new FormControl<number>(5, { nonNullable: true }),
    primaryTresherId: new FormControl<number | null>(null),
    weaponTresherId: new FormControl<number | null>(null),
    tresherIds: new FormArray<PcTresherControl>([this.createPcTresherControl()]),
    headArmorTresherId: new FormControl<number | null>(null),
    bodyArmorTresherId: new FormControl<number | null>(null),
    leftArmArmorTresherId: new FormControl<number | null>(null),
    rightArmArmorTresherId: new FormControl<number | null>(null),
    leftLegArmorTresherId: new FormControl<number | null>(null),
    rightLegArmorTresherId: new FormControl<number | null>(null),
  });

  ngOnInit(): void {
    this.loadPublishedGames();
    this.loadActiveGames();
    this.loadUserFriends();
    this.loadUserTreshers();
    this.loadMonsterTresherOptions();
    this.loadMonsterImageOptions();
    this.loadUserMonsters();
    this.loadUserImages();
    this.loadUserPcs();
  }

  private loadPublishedGames(): void {
    const userkey = this.account.getKey();
    this.isLoadingPublishedGames.set(true);
    this.publishedGamesError.set(null);

    const request = userkey
      ? this.http.get<DungonListItem[]>(`${API_BASE_URL}/dungons/published`, {
          params: { userkey },
        })
      : this.http.get<DungonListItem[]>(`${API_BASE_URL}/dungons/published`);

    request
      .pipe(finalize(() => this.isLoadingPublishedGames.set(false)))
      .subscribe({
        next: (games) => {
          this.publishedGames.set(games);
        },
        error: () => {
          this.publishedGames.set([]);
          this.publishedGamesError.set('Failed to load published games.');
        },
      });
  }

  private loadActiveGames(): void {
    const userkey = this.account.getKey();
    if (!userkey) {
      return;
    }

    this.isLoadingActiveGames.set(true);
    this.activeGamesError.set(null);

    this.http
      .get<ActiveGameListItem[]>(`${API_BASE_URL}/games?userkey=${encodeURIComponent(userkey)}`)
      .pipe(finalize(() => this.isLoadingActiveGames.set(false)))
      .subscribe({
        next: (games) => {
          this.activeGames.set(games);
        },
        error: () => {
          this.activeGames.set([]);
          this.activeGamesError.set('Failed to load active games.');
        },
      });
  }

  resumeActiveGame(game: ActiveGameListItem): void {
    void this.router.navigate(['/game', game.id]);
  }

  deleteActiveGame(game: ActiveGameListItem): void {
    if (this.isDeletingGameId() !== null) {
      return;
    }

    const userkey = this.account.getKey();
    if (!userkey) {
      this.deleteGameMessage.set('Please log in to delete a game.');
      return;
    }

    this.deleteGameMessage.set(null);
    this.isDeletingGameId.set(game.id);

    this.http
      .delete<{ result: number; error?: string }>(
        `${API_BASE_URL}/games/${game.id}`,
        { body: { userkey } }
      )
      .pipe(finalize(() => this.isDeletingGameId.set(null)))
      .subscribe({
        next: (response) => {
          if (response.result !== 1) {
            this.deleteGameMessage.set(response.error || 'Failed to delete game.');
            return;
          }

          this.activeGames.update((games) => games.filter((g) => g.id !== game.id));
          this.deleteGameMessage.set('Game deleted.');
        },
        error: () => {
          this.deleteGameMessage.set('Failed to delete game.');
        },
      });
  }

  selectGameForStart(game: DungonListItem): void {
    this.pendingStartGame.set(game);
    this.selectedStartPcId.set(null);
    this.startGameMessage.set(null);
  }

  cancelStartGame(): void {
    this.pendingStartGame.set(null);
    this.selectedStartPcId.set(null);
    this.startGameMessage.set(null);
  }

  confirmStartGame(): void {
    const game = this.pendingStartGame();
    if (!game) {
      return;
    }

    const pcId = this.selectedStartPcId();
    if (!pcId) {
      this.startGameMessage.set('Please select a PC to start with.');
      return;
    }

    this.startPublishedGame(game, pcId);
  }

  startPublishedGame(game: DungonListItem, pcId: number): void {
    if (this.isStartingGameId() !== null) {
      return;
    }

    const userkey = this.account.getKey();
    if (!userkey) {
      this.startGameMessage.set('Please log in before starting a game.');
      return;
    }

    this.startGameMessage.set(null);
    this.isStartingGameId.set(game.id);

    this.http
      .post<{ result: number; error?: string; game?: { id: number; lastupdated?: string } }>(
        `${API_BASE_URL}/dungons/${game.id}/start`,
        { userkey, pcId }
      )
      .pipe(finalize(() => this.isStartingGameId.set(null)))
      .subscribe({
        next: (response) => {
          if (response.result !== 1) {
            this.startGameMessage.set(response.error || 'Failed to start game.');
            return;
          }

          const gameId = response.game?.id;
          if (!gameId) {
            this.startGameMessage.set('Game was created but no game id was returned.');
            return;
          }

          const lastUpdated = response.game?.lastupdated;
          this.startGameMessage.set(
            lastUpdated
              ? `Game ready. Last updated ${new Date(lastUpdated).toLocaleString()}.`
              : 'Game ready.'
          );
          this.pendingStartGame.set(null);
          this.selectedStartPcId.set(null);
          this.loadActiveGames();
          void this.router.navigate(['/game', gameId]);
        },
        error: () => {
          this.startGameMessage.set('Failed to start game.');
        },
      });
  }

  isLoggedIn(): boolean {
    return this.account.isLoggedIn();
  }

  isAdminUser(): boolean {
    return this.account.isAdmin();
  }

  setActiveDashboardTab(tabId: DashboardTabId): void {
    this.activeDashboardTab.set(tabId);
  }

  isDashboardTabActive(tabId: DashboardTabId): boolean {
    return this.activeDashboardTab() === tabId;
  }

  saveFriend(): void {
    if (this.isSavingUserFriend()) {
      return;
    }

    const userkey = this.account.getKey();
    if (!userkey) {
      this.userFriendSaveMessage.set('Please log in to save friends.');
      return;
    }

    const email = this.userFriendForm.controls.email.value.trim();
    if (!email) {
      this.userFriendSaveMessage.set('Enter a friend email.');
      return;
    }

    this.isSavingUserFriend.set(true);
    this.userFriendSaveMessage.set(null);

    this.http
      .post<{ result: number; error?: string; friend?: UserFriendListItem }>(
        `${API_BASE_URL}/friends`,
        { userkey, email }
      )
      .pipe(finalize(() => this.isSavingUserFriend.set(false)))
      .subscribe({
        next: (response) => {
          if (response.result !== 1 || !response.friend) {
            this.userFriendSaveMessage.set(response.error || 'Failed to save friend.');
            return;
          }

          this.userFriendForm.controls.email.setValue('');
          this.userFriendSaveMessage.set('Friend saved.');
          this.loadUserFriends();
        },
        error: (errorResponse: { error?: { error?: string } }) => {
          this.userFriendSaveMessage.set(
            errorResponse?.error?.error || 'Failed to save friend.'
          );
        },
      });
  }

  toggleTresherSectionVisibility(): void {
    this.isTresherSectionVisible.update((value) => !value);
  }

  selectedTresherType(): TresherType {
    return this.userTresherForm.controls.type.value;
  }

  isWeaponTresherSelected(): boolean {
    return this.selectedTresherType() === 'Weapon';
  }

  isArmorTresherSelected(): boolean {
    return this.selectedTresherType() === 'Armor';
  }

  isCoinsTresherSelected(): boolean {
    return this.selectedTresherType() === 'Coins';
  }

  isPotionTresherSelected(): boolean {
    return this.selectedTresherType() === 'Potion';
  }

  shouldTresherHaveHp(): boolean {
    const type = this.selectedTresherType();
    return type === 'Weapon' || type === 'Armor' || type === 'OtherTresher';
  }

  beginCreateTresher(clearMessage: boolean = true): void {
    this.editingUserTresherId.set(null);
    if (clearMessage) {
      this.userTresherSaveMessage.set(null);
    }
    this.resetUserTresherForm();
  }

  editTresher(item: UserTresherListItem): void {
    this.editingUserTresherId.set(item.id);
    this.userTresherSaveMessage.set(null);
    this.userTresherForm.reset({
      type: item.type,
      name: item.name,
      description: item.description,
      worth: item.worth,
      trapID: item.trapID,
      curseID: item.curseID,
      HP: item.HP,
      damage: item.damage,
      hands: item.hands,
      range: item.range,
      ammoType: item.ammoType,
      speedReduction: item.speedReduction,
      armorType: item.armorType,
      coinType: item.coinType,
      effectNumber: item.effectNumber,
      effectTarget: item.effectTarget,
      effectDuration: item.effectDuration,
      isPublic: item.isPublic,
    });
  }

  cancelEditTresher(): void {
    this.beginCreateTresher();
  }

  saveTresher(): void {
    if (this.isSavingUserTresher()) {
      return;
    }

    const userkey = this.account.getKey();
    if (!userkey) {
      this.userTresherSaveMessage.set('Please log in to save treshers.');
      return;
    }

    const payload = this.buildTresherPayload(this.userTresherForm.getRawValue());
    const editingId = this.editingUserTresherId();
    const request$ = editingId
      ? this.http.put<{ result: number; error?: string; tresher?: UserTresherListItem }>(
          `${API_BASE_URL}/treshers/${editingId}`,
          {
            userkey,
            tresher: payload,
          }
        )
      : this.http.post<{ result: number; error?: string; tresher?: UserTresherListItem }>(
          `${API_BASE_URL}/treshers`,
          {
            userkey,
            tresher: payload,
          }
        );

    this.isSavingUserTresher.set(true);
    this.userTresherSaveMessage.set(null);

    request$
      .pipe(finalize(() => this.isSavingUserTresher.set(false)))
      .subscribe({
        next: (response) => {
          if (response.result !== 1 || !response.tresher) {
            this.userTresherSaveMessage.set(response.error || 'Failed to save tresher.');
            return;
          }

          this.loadUserTreshers();
          this.userTresherSaveMessage.set(
            editingId ? 'Tresher updated.' : 'Tresher created.'
          );
          this.beginCreateTresher(false);
        },
        error: () => {
          this.userTresherSaveMessage.set('Failed to save tresher.');
        },
      });
  }

  toggleMonsterSectionVisibility(): void {
    this.isMonsterSectionVisible.update((value) => !value);
  }

  toggleImageSectionVisibility(): void {
    this.isImageSectionVisible.update((value) => !value);
  }

  selectedImageUploadName(): string | null {
    return this.selectedImageFile()?.name ?? null;
  }

  onImageFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files && input.files.length > 0 ? input.files[0] : null;
    this.selectedImageFile.set(file);

    if (!file || this.editingUserImageId() !== null) {
      return;
    }

    const currentName = this.userImageForm.controls.name.value.trim();
    if (!currentName) {
      this.userImageForm.controls.name.setValue(this.fileNameWithoutExtension(file.name));
    }
  }

  beginCreateImage(clearMessage: boolean = true): void {
    this.editingUserImageId.set(null);
    this.selectedImageFile.set(null);
    if (clearMessage) {
      this.userImageSaveMessage.set(null);
    }
    this.resetUserImageForm();
  }

  editImage(item: UserImageListItem): void {
    this.editingUserImageId.set(item.id);
    this.selectedImageFile.set(null);
    this.userImageSaveMessage.set(null);
    this.userImageForm.reset({
      path: item.path,
      isPublic: item.isPublic,
      isActive: item.isActive,
      name: item.name,
    });
  }

  cancelEditImage(): void {
    this.beginCreateImage();
  }

  saveImage(): void {
    if (this.isSavingUserImage()) {
      return;
    }

    const userkey = this.account.getKey();
    if (!userkey) {
      this.userImageSaveMessage.set('Please log in to save images.');
      return;
    }

    const payload = this.buildImagePayload(this.userImageForm.getRawValue());
    const editingId = this.editingUserImageId();

    const request$ = editingId
      ? this.http.put<{ result: number; error?: string; image?: UserImageListItem }>(
          `${API_BASE_URL}/images/${editingId}`,
          {
            userkey,
            image: payload,
          }
        )
      : (() => {
          const uploadFile = this.selectedImageFile();
          if (!uploadFile) {
            this.userImageSaveMessage.set('Select an image file to upload.');
            return null;
          }

          const formData = new FormData();
          formData.append('userkey', userkey);
          formData.append('name', payload.name);
          formData.append('isPublic', payload.isPublic ? 'true' : 'false');
          formData.append('isActive', payload.isActive ? 'true' : 'false');
          formData.append('image', uploadFile);

          return this.http.post<{ result: number; error?: string; image?: UserImageListItem }>(
            `${API_BASE_URL}/images`,
            formData
          );
        })();

    if (!request$) {
      return;
    }

    this.isSavingUserImage.set(true);
    this.userImageSaveMessage.set(null);

    request$
      .pipe(finalize(() => this.isSavingUserImage.set(false)))
      .subscribe({
        next: (response) => {
          if (response.result !== 1 || !response.image) {
            this.userImageSaveMessage.set(response.error || 'Failed to save image.');
            return;
          }

          this.loadUserImages();
          this.userImageSaveMessage.set(editingId ? 'Image updated.' : 'Image uploaded.');
          this.beginCreateImage(false);
        },
        error: () => {
          this.userImageSaveMessage.set('Failed to save image.');
        },
      });
  }

  resolveImageUrl(imagePath: string): string {
    const trimmed = typeof imagePath === 'string' ? imagePath.trim() : '';
    if (!trimmed) {
      return '';
    }

    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }

    return trimmed.startsWith('/')
      ? `${API_BASE_URL}${trimmed}`
      : `${API_BASE_URL}/${trimmed}`;
  }

  onPcSpeciesChanged(): void {
    this.syncPcRangeOfView();
  }

  pcTresherControls(): PcTresherControl[] {
    return this.userPcTresherIdsArray.controls;
  }

  addPcTresher(): void {
    this.userPcTresherIdsArray.push(this.createPcTresherControl());
  }

  removePcTresher(index: number): void {
    if (this.userPcTresherIdsArray.length <= 1) {
      this.userPcTresherIdsArray.at(0).setValue(null);
      return;
    }

    this.userPcTresherIdsArray.removeAt(index);
  }

  selectedPcTresherSummary(): string {
    const selectedIds = this.normalizeIdList(this.userPcTresherIdsArray.getRawValue());
    return this.buildTresherSummaryByIds(selectedIds);
  }

  pcTresherSummaryForPc(pc: UserPcListItem): string {
    return this.buildTresherSummaryByIds(pc.tresherIds);
  }

  selectedPcImage(): UserImageListItem | null {
    const selectedId = this.userPcForm.controls.imageId.value;
    if (selectedId === null) {
      return null;
    }

    return this.monsterImageOptions().find((item) => item.id === selectedId) ?? null;
  }

  selectedPcImageUrl(): string {
    const selected = this.selectedPcImage();
    return selected ? this.resolveImageUrl(selected.path) : '';
  }

  selectedPcImageName(): string | null {
    const selected = this.selectedPcImage();
    return selected ? selected.name : null;
  }

  pcImageForPc(pc: UserPcListItem): UserImageListItem | null {
    if (pc.imageId === null) {
      return null;
    }

    return this.monsterImageOptions().find((item) => item.id === pc.imageId) ?? null;
  }

  pcImageUrlForPc(pc: UserPcListItem): string {
    const image = this.pcImageForPc(pc);
    return image ? this.resolveImageUrl(image.path) : '';
  }

  availablePcLoadoutTreshers(): UserTresherListItem[] {
    const selectedIds = new Set(this.normalizeIdList(this.userPcTresherIdsArray.getRawValue()));
    return this.monsterTresherOptions().filter((item) => selectedIds.has(item.id));
  }

  beginCreatePc(clearMessage: boolean = true): void {
    this.editingUserPcId.set(null);
    if (clearMessage) {
      this.userPcSaveMessage.set(null);
    }
    this.resetUserPcForm();
  }

  editPc(item: UserPcListItem): void {
    this.editingUserPcId.set(item.id);
    this.userPcSaveMessage.set(null);
    this.replacePcTresherForms(item.tresherIds ?? []);

    const controls = this.userPcForm.controls;
    controls.name.setValue(item.name || '');
    controls.species.setValue(this.normalizePcSpecies(item.species));
    controls.type.setValue(this.normalizePcType(item.type));
    controls.imageId.setValue(this.normalizeNullableNumber(item.imageId));
    controls.maxHP.setValue(Math.max(1, this.normalizeNumber(item.maxHP, 10)));
    controls.currentHP.setValue(
      Math.max(0, this.normalizeNumber(item.currentHP, controls.maxHP.value))
    );
    controls.ac.setValue(Math.max(0, this.normalizeNumber(item.ac, 10)));
    controls.movementEconomy.setValue(
      Math.max(0, this.normalizeNumber(item.movementEconomy, 0))
    );
    controls.poisonResest.setValue(this.normalizeNumber(item.poisonResest, 0));
    controls.magicPower.setValue(this.normalizeNumber(item.magicPower, 0));
    controls.level.setValue(Math.max(1, this.normalizeNumber(item.level, 1)));
    controls.strength.setValue(this.normalizeNumber(item.strength, 0));
    controls.rangeOfView.setValue(
      Math.max(0, this.normalizeNumber(item.rangeOfView, this.rangeOfViewBySpecies(controls.species.value)))
    );
    controls.primaryTresherId.setValue(this.normalizeNullableNumber(item.primaryTresherId));
    controls.weaponTresherId.setValue(this.normalizeNullableNumber(item.weaponTresherId));
    controls.headArmorTresherId.setValue(this.normalizeNullableNumber(item.headArmorTresherId));
    controls.bodyArmorTresherId.setValue(this.normalizeNullableNumber(item.bodyArmorTresherId));
    controls.leftArmArmorTresherId.setValue(this.normalizeNullableNumber(item.leftArmArmorTresherId));
    controls.rightArmArmorTresherId.setValue(this.normalizeNullableNumber(item.rightArmArmorTresherId));
    controls.leftLegArmorTresherId.setValue(this.normalizeNullableNumber(item.leftLegArmorTresherId));
    controls.rightLegArmorTresherId.setValue(this.normalizeNullableNumber(item.rightLegArmorTresherId));
    this.syncPcRangeOfView();
  }

  cancelEditPc(): void {
    this.beginCreatePc();
  }

  savePc(): void {
    if (this.isSavingUserPc()) {
      return;
    }

    const userkey = this.account.getKey();
    if (!userkey) {
      this.userPcSaveMessage.set('Please log in to save PCs.');
      return;
    }

    const payload = this.buildPcPayload();
    const editingId = this.editingUserPcId();
    const request$ = editingId
      ? this.http.put<{ result: number; error?: string; pc?: UserPcListItem }>(
          `${API_BASE_URL}/pcs/${editingId}`,
          {
            userkey,
            pc: payload,
          }
        )
      : this.http.post<{ result: number; error?: string; pc?: UserPcListItem }>(
          `${API_BASE_URL}/pcs`,
          {
            userkey,
            pc: payload,
          }
        );

    this.isSavingUserPc.set(true);
    this.userPcSaveMessage.set(null);

    request$
      .pipe(finalize(() => this.isSavingUserPc.set(false)))
      .subscribe({
        next: (response) => {
          if (response.result !== 1 || !response.pc) {
            this.userPcSaveMessage.set(response.error || 'Failed to save PC.');
            return;
          }

          this.loadUserPcs();
          this.userPcSaveMessage.set(editingId ? 'PC updated.' : 'PC created.');
          this.beginCreatePc(false);
        },
        error: () => {
          this.userPcSaveMessage.set('Failed to save PC.');
        },
      });
  }

  selectedMonsterImage(): UserImageListItem | null {
    const selectedId = this.userMonsterForm.controls.imageId.value;
    if (selectedId === null) {
      return null;
    }

    return this.monsterImageOptions().find((item) => item.id === selectedId) ?? null;
  }

  selectedMonsterImageUrl(): string {
    const selected = this.selectedMonsterImage();
    return selected ? this.resolveImageUrl(selected.path) : '';
  }

  selectedMonsterImageName(): string | null {
    const selected = this.selectedMonsterImage();
    return selected ? selected.name : null;
  }

  monsterTresherControls(): MonsterTresherControl[] {
    return this.userMonsterTresherIdsArray.controls;
  }

  addMonsterTresher(): void {
    this.userMonsterTresherIdsArray.push(this.createMonsterTresherControl());
  }

  removeMonsterTresher(index: number): void {
    if (this.userMonsterTresherIdsArray.length <= 1) {
      this.userMonsterTresherIdsArray.at(0).setValue(null);
      return;
    }

    this.userMonsterTresherIdsArray.removeAt(index);
  }

  selectedMonsterTresherSummary(): string {
    const selectedIds = this.normalizeIdList(this.userMonsterTresherIdsArray.getRawValue());
    return this.buildTresherSummaryByIds(selectedIds);
  }

  monsterTresherSummaryForMonster(monster: UserMonsterListItem): string {
    return this.buildTresherSummaryByIds(monster.tresherIds);
  }

  monsterImageForMonster(monster: UserMonsterListItem): UserImageListItem | null {
    if (monster.imageId === null) {
      return null;
    }

    return this.monsterImageOptions().find((item) => item.id === monster.imageId) ?? null;
  }

  monsterImageUrlForMonster(monster: UserMonsterListItem): string {
    const image = this.monsterImageForMonster(monster);
    return image ? this.resolveImageUrl(image.path) : '';
  }

  monsterAttackControls(): MonsterAttackFormGroup[] {
    return this.userMonsterAttacksArray.controls;
  }

  addMonsterAttack(): void {
    this.userMonsterAttacksArray.push(this.createMonsterAttackForm());
    this.syncMonsterAttackCount();
  }

  removeMonsterAttack(index: number): void {
    if (this.userMonsterAttacksArray.length <= 1) {
      this.userMonsterAttacksArray.at(0).reset({
        description: '',
        damage: 0,
        plusToHit: 0,
      });
      this.syncMonsterAttackCount();
      return;
    }

    this.userMonsterAttacksArray.removeAt(index);
    this.syncMonsterAttackCount();
  }

  beginCreateMonster(clearMessage: boolean = true): void {
    this.editingUserMonsterId.set(null);
    if (clearMessage) {
      this.userMonsterSaveMessage.set(null);
    }
    this.resetUserMonsterForm();
  }

  editMonster(item: UserMonsterListItem): void {
    this.editingUserMonsterId.set(item.id);
    this.userMonsterSaveMessage.set(null);

    const attacks = Array.isArray(item.attacks)
      ? item.attacks.map((attack) => ({
          description: attack.description || '',
          damage: this.normalizeNumber(attack.damage, 0),
          plusToHit: this.normalizeNumber(attack.plusToHit, 0),
        }))
      : [];

    this.replaceMonsterAttackForms(attacks);
    this.replaceMonsterTresherForms(item.tresherIds ?? []);

    const controls = this.userMonsterForm.controls;
    controls.imageId.setValue(this.normalizeNullableNumber(item.imageId));
    controls.name.setValue(item.name || '');
    controls.type.setValue(item.type || 'Unknown');
    controls.description.setValue(item.description || '');
    controls.hp.setValue(Math.max(0, this.normalizeNumber(item.hp, 1)));
    controls.movementEconomy.setValue(
      Math.max(0, this.normalizeNumber(item.movementEconomy, 0))
    );
    controls.ac.setValue(Math.max(0, this.normalizeNumber(item.ac, 10)));
    controls.runAt.setValue(Math.max(0, this.normalizeNumber(item.runAt, 0)));
    controls.numberOfAttacks.setValue(
      Math.max(this.normalizeNumber(item.numberOfAttacks, 0), this.userMonsterAttacksArray.length)
    );
    controls.isPublic.setValue(item.isPublic);
  }

  cancelEditMonster(): void {
    this.beginCreateMonster();
  }

  saveMonster(): void {
    if (this.isSavingUserMonster()) {
      return;
    }

    const userkey = this.account.getKey();
    if (!userkey) {
      this.userMonsterSaveMessage.set('Please log in to save monsters.');
      return;
    }

    const payload = this.buildMonsterPayload();
    const editingId = this.editingUserMonsterId();
    const request$ = editingId
      ? this.http.put<{ result: number; error?: string; monster?: UserMonsterListItem }>(
          `${API_BASE_URL}/monsters/${editingId}`,
          {
            userkey,
            monster: payload,
          }
        )
      : this.http.post<{ result: number; error?: string; monster?: UserMonsterListItem }>(
          `${API_BASE_URL}/monsters`,
          {
            userkey,
            monster: payload,
          }
        );

    this.isSavingUserMonster.set(true);
    this.userMonsterSaveMessage.set(null);

    request$
      .pipe(finalize(() => this.isSavingUserMonster.set(false)))
      .subscribe({
        next: (response) => {
          if (response.result !== 1 || !response.monster) {
            this.userMonsterSaveMessage.set(response.error || 'Failed to save monster.');
            return;
          }

          this.loadUserMonsters();
          this.userMonsterSaveMessage.set(
            editingId ? 'Monster updated.' : 'Monster created.'
          );
          this.beginCreateMonster(false);
        },
        error: () => {
          this.userMonsterSaveMessage.set('Failed to save monster.');
        },
      });
  }

  private loadUserTreshers(): void {
    const userkey = this.account.getKey();
    if (!userkey) {
      this.userTreshers.set([]);
      this.userTreshersError.set('Log in to manage your treshers.');
      return;
    }

    this.isLoadingUserTreshers.set(true);
    this.userTreshersError.set(null);

    this.http
      .get<UserTresherListItem[]>(`${API_BASE_URL}/treshers`, {
        params: { userkey },
      })
      .pipe(finalize(() => this.isLoadingUserTreshers.set(false)))
      .subscribe({
        next: (items) => {
          this.userTreshers.set(items);
          this.loadMonsterTresherOptions();
        },
        error: () => {
          this.userTreshers.set([]);
          this.userTreshersError.set('Failed to load your treshers.');
        },
      });
  }

  private loadUserFriends(): void {
    const userkey = this.account.getKey();
    if (!userkey) {
      this.userFriends.set([]);
      this.userFriendsError.set('Log in to manage your friends.');
      return;
    }

    this.isLoadingUserFriends.set(true);
    this.userFriendsError.set(null);

    this.http
      .get<UserFriendListItem[]>(`${API_BASE_URL}/friends`, {
        params: { userkey },
      })
      .pipe(finalize(() => this.isLoadingUserFriends.set(false)))
      .subscribe({
        next: (items) => {
          this.userFriends.set(items);
        },
        error: () => {
          this.userFriends.set([]);
          this.userFriendsError.set('Failed to load your friends.');
        },
      });
  }

  private loadMonsterTresherOptions(): void {
    const userkey = this.account.getKey();
    if (!userkey) {
      this.monsterTresherOptions.set([]);
      this.monsterTresherOptionsError.set('Log in to select monster treshers.');
      return;
    }

    this.isLoadingMonsterTresherOptions.set(true);
    this.monsterTresherOptionsError.set(null);

    this.http
      .get<UserTresherListItem[]>(`${API_BASE_URL}/treshers`, {
        params: { userkey, scope: 'library' },
      })
      .pipe(finalize(() => this.isLoadingMonsterTresherOptions.set(false)))
      .subscribe({
        next: (items) => {
          this.monsterTresherOptions.set(items);
        },
        error: () => {
          this.monsterTresherOptions.set([]);
          this.monsterTresherOptionsError.set('Failed to load monster tresher options.');
        },
      });
  }

  private loadUserMonsters(): void {
    const userkey = this.account.getKey();
    if (!userkey) {
      this.userMonsters.set([]);
      this.userMonstersError.set('Log in to manage your monsters.');
      return;
    }

    this.isLoadingUserMonsters.set(true);
    this.userMonstersError.set(null);

    this.http
      .get<UserMonsterListItem[]>(`${API_BASE_URL}/monsters`, {
        params: { userkey },
      })
      .pipe(finalize(() => this.isLoadingUserMonsters.set(false)))
      .subscribe({
        next: (items) => {
          const normalizedItems = items.map((item) => ({
            ...item,
            imageId: this.normalizeNullableNumber(item.imageId),
            tresherIds: this.normalizeIdList(item.tresherIds),
            attacks: Array.isArray(item.attacks)
              ? item.attacks.map((attack) => ({
                  description: attack.description || '',
                  damage: this.normalizeNumber(attack.damage, 0),
                  plusToHit: this.normalizeNumber(attack.plusToHit, 0),
                }))
              : [],
          }));
          this.userMonsters.set(normalizedItems);
        },
        error: () => {
          this.userMonsters.set([]);
          this.userMonstersError.set('Failed to load your monsters.');
        },
      });
  }

  private loadMonsterImageOptions(): void {
    const userkey = this.account.getKey();
    if (!userkey) {
      this.monsterImageOptions.set([]);
      this.monsterImageOptionsError.set('Log in to select monster images.');
      return;
    }

    this.isLoadingMonsterImageOptions.set(true);
    this.monsterImageOptionsError.set(null);

    this.http
      .get<UserImageListItem[]>(`${API_BASE_URL}/images`, {
        params: { userkey, scope: 'library' },
      })
      .pipe(finalize(() => this.isLoadingMonsterImageOptions.set(false)))
      .subscribe({
        next: (items) => {
          this.monsterImageOptions.set(items);
        },
        error: () => {
          this.monsterImageOptions.set([]);
          this.monsterImageOptionsError.set('Failed to load monster image options.');
        },
      });
  }

  private loadUserImages(): void {
    const userkey = this.account.getKey();
    if (!userkey) {
      this.userImages.set([]);
      this.userImagesError.set('Log in to manage your images.');
      return;
    }

    this.isLoadingUserImages.set(true);
    this.userImagesError.set(null);

    this.http
      .get<UserImageListItem[]>(`${API_BASE_URL}/images`, {
        params: { userkey },
      })
      .pipe(finalize(() => this.isLoadingUserImages.set(false)))
      .subscribe({
        next: (items) => {
          this.userImages.set(items);
          this.loadMonsterImageOptions();
        },
        error: () => {
          this.userImages.set([]);
          this.userImagesError.set('Failed to load your images.');
        },
      });
  }

  private loadUserPcs(): void {
    const userkey = this.account.getKey();
    if (!userkey) {
      this.userPcs.set([]);
      this.userPcsError.set('Log in to manage your PCs.');
      return;
    }

    this.isLoadingUserPcs.set(true);
    this.userPcsError.set(null);

    this.http
      .get<UserPcListItem[]>(`${API_BASE_URL}/pcs`, {
        params: { userkey },
      })
      .pipe(finalize(() => this.isLoadingUserPcs.set(false)))
      .subscribe({
        next: (items) => {
          const normalized = items.map((item) => ({
            ...item,
            species: this.normalizePcSpecies(item.species),
            type: this.normalizePcType(item.type),
            imageId: this.normalizeNullableNumber(item.imageId),
            tresherIds: this.normalizeIdList(item.tresherIds),
            primaryTresherId: this.normalizeNullableNumber(item.primaryTresherId),
            weaponTresherId: this.normalizeNullableNumber(item.weaponTresherId),
            headArmorTresherId: this.normalizeNullableNumber(item.headArmorTresherId),
            bodyArmorTresherId: this.normalizeNullableNumber(item.bodyArmorTresherId),
            leftArmArmorTresherId: this.normalizeNullableNumber(item.leftArmArmorTresherId),
            rightArmArmorTresherId: this.normalizeNullableNumber(item.rightArmArmorTresherId),
            leftLegArmorTresherId: this.normalizeNullableNumber(item.leftLegArmorTresherId),
            rightLegArmorTresherId: this.normalizeNullableNumber(item.rightLegArmorTresherId),
          }));

          this.userPcs.set(normalized);
        },
        error: () => {
          this.userPcs.set([]);
          this.userPcsError.set('Failed to load your PCs.');
        },
      });
  }

  private buildTresherPayload(value: UserTresherEditorValue): UserTresherWritePayload {
    const type = value.type;

    const payload: UserTresherWritePayload = {
      type,
      name: (value.name || '').trim() || 'Unnamed Tresher',
      description: (value.description || '').trim(),
      worth: Math.max(0, this.normalizeNumber(value.worth, 0)),
      trapID: this.normalizeNullableNumber(value.trapID),
      curseID: this.normalizeNullableNumber(value.curseID),
      HP: null,
      damage: null,
      hands: null,
      range: null,
      ammoType: null,
      speedReduction: null,
      armorType: null,
      coinType: null,
      effectNumber: null,
      effectTarget: null,
      effectDuration: null,
      isPublic: this.isAdminUser() ? value.isPublic === true : false,
    };

    if (type === 'Weapon') {
      payload.HP = this.normalizeNumber(value.HP, 10);
      payload.damage = this.normalizeNumber(value.damage, 0);
      payload.hands = Math.max(1, this.normalizeNumber(value.hands, 1));
      payload.range = Math.max(0, this.normalizeNumber(value.range, 0));
      payload.ammoType = this.normalizeNullableText(value.ammoType);
      return payload;
    }

    if (type === 'Armor') {
      payload.HP = this.normalizeNumber(value.HP, 10);
      payload.hands = Math.max(0, this.normalizeNumber(value.hands, 0));
      payload.speedReduction = this.normalizeNumber(value.speedReduction, 0);
      payload.armorType = value.armorType;
      return payload;
    }

    if (type === 'Coins') {
      payload.coinType = value.coinType;
      return payload;
    }

    if (type === 'Potion') {
      payload.effectNumber = this.normalizeNumber(value.effectNumber, 0);
      payload.effectTarget = value.effectTarget;
      const target = payload.effectTarget;
      if (target === 'AC' || target === 'AE') {
        payload.effectDuration = Math.max(0, this.normalizeNumber(value.effectDuration, 1));
      }
      return payload;
    }

    payload.HP = this.normalizeNumber(value.HP, 10);
    return payload;
  }

  private buildMonsterPayload(): UserMonsterWritePayload {
    const controls = this.userMonsterForm.controls;
    const attackValues = this.userMonsterAttacksArray.getRawValue();

    const attacks: UserMonsterAttackEditorValue[] = attackValues.map((attack) => ({
      description: (attack.description || '').trim(),
      damage: Math.max(0, this.normalizeNumber(attack.damage, 0)),
      plusToHit: this.normalizeNumber(attack.plusToHit, 0),
    }));

    const requestedAttackCount = Math.max(
      0,
      this.normalizeNumber(controls.numberOfAttacks.value, attacks.length)
    );

    return {
      tresherIds: this.normalizeIdList(this.userMonsterTresherIdsArray.getRawValue()),
      imageId: this.normalizeNullableNumber(controls.imageId.value),
      name: (controls.name.value || '').trim() || 'Unnamed Monster',
      type: (controls.type.value || '').trim() || 'Unknown',
      description: (controls.description.value || '').trim(),
      hp: Math.max(0, this.normalizeNumber(controls.hp.value, 1)),
      movementEconomy: Math.max(0, this.normalizeNumber(controls.movementEconomy.value, 0)),
      ac: Math.max(0, this.normalizeNumber(controls.ac.value, 10)),
      runAt: Math.max(0, this.normalizeNumber(controls.runAt.value, 0)),
      numberOfAttacks: Math.max(requestedAttackCount, attacks.length),
      attacks,
      isPublic: this.isAdminUser() ? controls.isPublic.value === true : false,
    };
  }

  private buildImagePayload(value: UserImageEditorValue): UserImageWritePayload {
    return {
      path: this.normalizeImagePath(value.path),
      isPublic: this.isAdminUser() ? value.isPublic === true : false,
      isActive: value.isActive === true,
      name: (value.name || '').trim() || 'Unnamed Image',
    };
  }

  private buildPcPayload(): UserPcWritePayload {
    const controls = this.userPcForm.controls;
    const species = this.normalizePcSpecies(controls.species.value);
    const type = this.normalizePcType(controls.type.value);
    const maxHP = Math.max(1, this.normalizeNumber(controls.maxHP.value, 10));
    const currentHP = Math.max(
      0,
      Math.min(maxHP, this.normalizeNumber(controls.currentHP.value, maxHP))
    );
    const tresherIds = this.normalizeIdList(this.userPcTresherIdsArray.getRawValue());

    return {
      name: (controls.name.value || '').trim() || 'Unnamed PC',
      species,
      type,
      imageId: this.normalizeNullableNumber(controls.imageId.value),
      maxHP,
      currentHP,
      ac: Math.max(0, this.normalizeNumber(controls.ac.value, 10)),
      movementEconomy: Math.max(0, this.normalizeNumber(controls.movementEconomy.value, 0)),
      poisonResest: this.normalizeNumber(controls.poisonResest.value, 0),
      magicPower: this.normalizeNumber(controls.magicPower.value, 0),
      level: Math.max(1, this.normalizeNumber(controls.level.value, 1)),
      strength: this.normalizeNumber(controls.strength.value, 0),
      rangeOfView: this.rangeOfViewBySpecies(species),
      primaryTresherId: this.normalizeLinkedTresherId(
        this.normalizeNullableNumber(controls.primaryTresherId.value),
        tresherIds
      ),
      weaponTresherId: this.normalizeLinkedTresherId(
        this.normalizeNullableNumber(controls.weaponTresherId.value),
        tresherIds
      ),
      tresherIds,
      headArmorTresherId: this.normalizeLinkedTresherId(
        this.normalizeNullableNumber(controls.headArmorTresherId.value),
        tresherIds
      ),
      bodyArmorTresherId: this.normalizeLinkedTresherId(
        this.normalizeNullableNumber(controls.bodyArmorTresherId.value),
        tresherIds
      ),
      leftArmArmorTresherId: this.normalizeLinkedTresherId(
        this.normalizeNullableNumber(controls.leftArmArmorTresherId.value),
        tresherIds
      ),
      rightArmArmorTresherId: this.normalizeLinkedTresherId(
        this.normalizeNullableNumber(controls.rightArmArmorTresherId.value),
        tresherIds
      ),
      leftLegArmorTresherId: this.normalizeLinkedTresherId(
        this.normalizeNullableNumber(controls.leftLegArmorTresherId.value),
        tresherIds
      ),
      rightLegArmorTresherId: this.normalizeLinkedTresherId(
        this.normalizeNullableNumber(controls.rightLegArmorTresherId.value),
        tresherIds
      ),
    };
  }

  private resetUserTresherForm(): void {
    this.userTresherForm.reset({
      type: 'Weapon',
      name: '',
      description: '',
      worth: 0,
      trapID: null,
      curseID: null,
      HP: 10,
      damage: 0,
      hands: 1,
      range: 0,
      ammoType: null,
      speedReduction: 0,
      armorType: 'body',
      coinType: 'Gold',
      effectNumber: 0,
      effectTarget: 'Health',
      effectDuration: 1,
      isPublic: false,
    });
  }

  private resetUserMonsterForm(): void {
    this.replaceMonsterAttackForms([{ description: '', damage: 0, plusToHit: 0 }]);
    this.replaceMonsterTresherForms([]);

    const controls = this.userMonsterForm.controls;
    controls.imageId.setValue(null);
    controls.name.setValue('');
    controls.type.setValue('Unknown');
    controls.description.setValue('');
    controls.hp.setValue(1);
    controls.movementEconomy.setValue(0);
    controls.ac.setValue(10);
    controls.runAt.setValue(0);
    controls.numberOfAttacks.setValue(1);
    controls.isPublic.setValue(false);
  }

  private replaceMonsterTresherForms(tresherIds: number[]): void {
    this.userMonsterTresherIdsArray.clear();

    const normalized = this.normalizeIdList(tresherIds);
    if (normalized.length === 0) {
      this.userMonsterTresherIdsArray.push(this.createMonsterTresherControl());
      return;
    }

    for (const tresherId of normalized) {
      this.userMonsterTresherIdsArray.push(this.createMonsterTresherControl(tresherId));
    }
  }

  private resetUserImageForm(): void {
    this.userImageForm.reset({
      path: '',
      isPublic: false,
      isActive: true,
      name: '',
    });
  }

  private resetUserPcForm(): void {
    this.replacePcTresherForms([]);

    const controls = this.userPcForm.controls;
    controls.name.setValue('');
    controls.species.setValue('Human');
    controls.type.setValue('Figher');
    controls.imageId.setValue(null);
    controls.maxHP.setValue(10);
    controls.currentHP.setValue(10);
    controls.ac.setValue(10);
    controls.movementEconomy.setValue(0);
    controls.poisonResest.setValue(0);
    controls.magicPower.setValue(0);
    controls.level.setValue(1);
    controls.strength.setValue(0);
    controls.primaryTresherId.setValue(null);
    controls.weaponTresherId.setValue(null);
    controls.headArmorTresherId.setValue(null);
    controls.bodyArmorTresherId.setValue(null);
    controls.leftArmArmorTresherId.setValue(null);
    controls.rightArmArmorTresherId.setValue(null);
    controls.leftLegArmorTresherId.setValue(null);
    controls.rightLegArmorTresherId.setValue(null);
    this.syncPcRangeOfView();
  }

  private replacePcTresherForms(tresherIds: number[]): void {
    this.userPcTresherIdsArray.clear();

    const normalized = this.normalizeIdList(tresherIds);
    if (normalized.length === 0) {
      this.userPcTresherIdsArray.push(this.createPcTresherControl());
      return;
    }

    for (const tresherId of normalized) {
      this.userPcTresherIdsArray.push(this.createPcTresherControl(tresherId));
    }
  }

  private replaceMonsterAttackForms(
    attacks: UserMonsterAttackEditorValue[] | UserMonsterAttackListItem[]
  ): void {
    this.userMonsterAttacksArray.clear();

    const normalizedAttacks = attacks.length
      ? attacks.map((attack) => ({
          description: attack.description || '',
          damage: this.normalizeNumber(attack.damage, 0),
          plusToHit: this.normalizeNumber(attack.plusToHit, 0),
        }))
      : [{ description: '', damage: 0, plusToHit: 0 }];

    for (const attack of normalizedAttacks) {
      this.userMonsterAttacksArray.push(this.createMonsterAttackForm(attack));
    }
  }

  private syncMonsterAttackCount(): void {
    const current = Math.max(0, this.normalizeNumber(this.userMonsterForm.controls.numberOfAttacks.value, 0));
    const minimum = this.userMonsterAttacksArray.length;

    if (current < minimum) {
      this.userMonsterForm.controls.numberOfAttacks.setValue(minimum);
    }
  }

  private createMonsterAttackForm(
    value?: Partial<UserMonsterAttackEditorValue>
  ): MonsterAttackFormGroup {
    return new FormGroup({
      description: new FormControl<string>(value?.description || '', { nonNullable: true }),
      damage: new FormControl<number>(this.normalizeNumber(value?.damage ?? null, 0), {
        nonNullable: true,
      }),
      plusToHit: new FormControl<number>(this.normalizeNumber(value?.plusToHit ?? null, 0), {
        nonNullable: true,
      }),
    });
  }

  private createMonsterTresherControl(value: number | null = null): MonsterTresherControl {
    return new FormControl<number | null>(value);
  }

  private createPcTresherControl(value: number | null = null): PcTresherControl {
    return new FormControl<number | null>(value);
  }

  private get userMonsterAttacksArray(): FormArray<MonsterAttackFormGroup> {
    return this.userMonsterForm.controls.attacks;
  }

  private get userMonsterTresherIdsArray(): FormArray<MonsterTresherControl> {
    return this.userMonsterForm.controls.tresherIds;
  }

  private get userPcTresherIdsArray(): FormArray<PcTresherControl> {
    return this.userPcForm.controls.tresherIds;
  }

  private normalizeNumber(value: number | null, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fallback;
    }

    return Math.trunc(value);
  }

  private normalizeNullableNumber(value: number | null): number | null {
    if (value === null || typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }

    return Math.trunc(value);
  }

  private normalizeNullableText(value: string | null): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private normalizeImagePath(value: string): string {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed;
  }

  private syncPcRangeOfView(): void {
    const species = this.normalizePcSpecies(this.userPcForm.controls.species.value);
    this.userPcForm.controls.rangeOfView.setValue(this.rangeOfViewBySpecies(species));
  }

  private rangeOfViewBySpecies(species: PcSpeciesOption): number {
    if (species === 'Elph') {
      return 6;
    }

    if (species === 'DwarPh') {
      return 7;
    }

    return 5;
  }

  private normalizePcSpecies(value: string): PcSpeciesOption {
    const lower = (value || '').trim().toLowerCase();
    if (lower === 'elph') {
      return 'Elph';
    }

    if (lower === 'dwarph') {
      return 'DwarPh';
    }

    if (lower === 'shorties') {
      return 'Shorties';
    }

    return 'Human';
  }

  private normalizePcType(value: string): PcTypeOption {
    const lower = (value || '').trim().toLowerCase();
    if (lower === 'mage') {
      return 'Mage';
    }

    if (lower === 'thieph') {
      return 'thieph';
    }

    if (lower === 'healer') {
      return 'Healer';
    }

    return 'Figher';
  }

  private normalizeLinkedTresherId(
    value: number | null,
    availableTresherIds: number[]
  ): number | null {
    if (value === null) {
      return null;
    }

    return availableTresherIds.includes(value) ? value : null;
  }

  private normalizeIdList(value: unknown): number[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const normalized = value
      .map((entry) => this.normalizeNullableNumber(entry as number | null))
      .filter((entry): entry is number => entry !== null && entry > 0)
      .map((entry) => Math.trunc(entry));

    return Array.from(new Set(normalized));
  }

  private buildTresherSummaryByIds(tresherIds: number[]): string {
    const normalizedIds = this.normalizeIdList(tresherIds);
    if (normalizedIds.length === 0) {
      return 'None';
    }

    const nameById = new Map<number, string>();
    for (const option of this.monsterTresherOptions()) {
      nameById.set(option.id, option.name);
    }

    return normalizedIds
      .map((id) => nameById.get(id) || `ID ${id}`)
      .join(', ');
  }

  private fileNameWithoutExtension(fileName: string): string {
    const trimmed = (fileName || '').trim();
    const extensionIndex = trimmed.lastIndexOf('.');
    if (extensionIndex <= 0) {
      return trimmed || 'Uploaded Image';
    }

    const name = trimmed.slice(0, extensionIndex).trim();
    return name || 'Uploaded Image';
  }
}
