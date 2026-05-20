import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { ActiveGameListItem, DungonListItem } from '../../interfaces/game';
import { Account } from '../../services/account';
import { API_BASE_URL } from '../../api-config';
import { TresherService, UserTresherListItem } from '../../services/tresher';
import { UploadPopup, UploadedMediaItem } from '../upload-popup/upload-popup';

interface UserImageListItem {
  id: number;
  userguid: string;
  path: string;
  isPublic: boolean;
  isActive: boolean;
  name: string;
  assettype?: string;
  createdAt: string;
  updatedAt: string;
}

interface UserFriendListItem {
  id: number;
  userurid: string;
  friendurid: string;
  isActiveFriend: boolean;
  friendEmail: string;
}

type PcSpeciesOption = 'Human' | 'Elph' | 'DwarPh' | 'Shorties';
type PcTypeOption = 'Fighter' | 'Mage' | 'Thieph' | 'Healer' | 'Ranger';

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
  actionEconomy: number;
  poisonResest: number;
  magicPower: number;
  mind: number;
  stamina: number;
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
  ring1ItemId: number | null;
  ring2ItemId: number | null;
  ring3ItemId: number | null;
  ring4ItemId: number | null;
  ring5ItemId: number | null;
  necklaceItemId: number | null;
  hand1ItemId: number | null;
  hand2ItemId: number | null;
  createdAt: string;
  updatedAt: string;
  sp: number;
  spLifetime: number;
  numberOfAttacks: number;
  agility: number;
  ismaingame: boolean;
}

interface UserItemOption {
  id: number;
  name: string;
  type: string;
  armorSlot: string | null;
}

interface UserPcWritePayload {
  name: string;
  species: PcSpeciesOption;
  type: PcTypeOption;
  imageId: number | null;
  ismaingame?: boolean;
  maxHP: number;
  currentHP: number;
  ac: number;
  actionEconomy: number;
  poisonResest: number;
  magicPower: number;
  mind: number;
  stamina: number;
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
  ring1ItemId: number | null;
  ring2ItemId: number | null;
  ring3ItemId: number | null;
  ring4ItemId: number | null;
  ring5ItemId: number | null;
  necklaceItemId: number | null;
  hand1ItemId: number | null;
  hand2ItemId: number | null;
  numberOfAttacks: number;
  agility: number;
}

type PcTresherControl = FormControl<number | null>;

type DashboardTabId =
  | 'published-games'
  | 'active-games'
  | 'friend'
  | 'pc';

interface DashboardTabItem {
  id: DashboardTabId;
  label: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [ReactiveFormsModule, DatePipe, UploadPopup],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly account = inject(Account);
  private readonly router = inject(Router);
  private readonly tresherService = inject(TresherService);

  readonly isLoadingPublishedGames = signal(false);
  readonly publishedGamesError = signal<string | null>(null);
  readonly publishedGames = signal<DungonListItem[]>([]);
  readonly isStartingGameId = signal<number | null>(null);
  readonly startGameMessage = signal<string | null>(null);
  readonly pendingStartGame = signal<DungonListItem | null>(null);
  readonly selectedStartPcId = signal<number | null>(null);

  /** For main-game dungeons: whether the player is creating a new PC or picking an existing one. */
  readonly mainGamePcChoice = signal<'create' | 'existing' | null>(null);

  /** PCs eligible for the currently-selected dungeon (filtered by ismaingame). */
  readonly pcsForSelectedGame = computed(() => {
    const game = this.pendingStartGame();
    if (!game) return this.userPcs();
    return this.userPcs().filter((pc) => pc.ismaingame === game.ismaingame);
  });

  readonly selectedPcForGame = computed(() => {
    const id = this.selectedStartPcId();
    if (id === null) return null;
    return this.pcsForSelectedGame().find((pc) => pc.id === id) ?? null;
  });

  readonly selectedPcForGameImageUrl = computed(() => {
    const pc = this.selectedPcForGame();
    if (!pc) return '';
    return this.pcImageUrlForPc(pc);
  });
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
    { id: 'pc', label: 'PC' },
  ] as const;

  readonly isLoadingUserFriends = signal(false);
  readonly userFriendsError = signal<string | null>(null);
  readonly userFriends = signal<UserFriendListItem[]>([]);
  readonly isSavingUserFriend = signal(false);
  readonly userFriendSaveMessage = signal<string | null>(null);
  readonly generatedInviteCode = signal<string | null>(null);
  readonly generatedInviteeEmail = signal<string | null>(null);
  readonly isSavingAcceptInvite = signal(false);
  readonly acceptInviteMessage = signal<string | null>(null);

  readonly userTreshers = this.tresherService.items;
  readonly monsterTresherOptions = this.tresherService.tresherOptions;
  readonly isLoadingMonsterTresherOptions = this.tresherService.isLoadingOptions;
  readonly monsterTresherOptionsError = this.tresherService.optionsError;

  readonly monsterImageOptions = signal<UserImageListItem[]>([]);
  readonly monsterImageOptionsError = signal<string | null>(null);
  readonly isLoadingMonsterImageOptions = signal(false);
  private readonly _localPcImages = signal<UserImageListItem[]>([]);
  readonly allMonsterImageOptions = computed(() => [...this.monsterImageOptions(), ...this._localPcImages()]);
  readonly pcImageOptions = computed(() =>
    this.allMonsterImageOptions().filter((item) => item.assettype === 'PC')
  );

  readonly isLoadingUserPcs = signal(false);
  readonly userPcsError = signal<string | null>(null);
  readonly userPcs = signal<UserPcListItem[]>([]);
  readonly isPcEditorVisible = signal(false);
  readonly isSavingUserPc = signal(false);
  readonly editingUserPcId = signal<number | null>(null);
  readonly expandedPcId = signal<number | null>(null);
  readonly pcStatsRolled = signal(false);
  readonly userPcSaveMessage = signal<string | null>(null);
  readonly userItems = signal<UserItemOption[]>([]);
  readonly isLoadingUserItems = signal(false);
  readonly isUpgradingNoa = signal<number | null>(null);
  readonly noaUpgradeMessage = signal<string | null>(null);

  readonly pcSpeciesOptions: PcSpeciesOption[] = ['Human', 'Elph', 'DwarPh', 'Shorties'];
  readonly pcTypeOptions: PcTypeOption[] = ['Fighter', 'Ranger', 'Mage', 'Thieph', 'Healer'];

  readonly userFriendForm = new FormGroup({
    email: new FormControl<string>('', { nonNullable: true }),
  });

  readonly userAcceptInviteForm = new FormGroup({
    code: new FormControl<string>('', { nonNullable: true }),
  });

  readonly userPcForm = new FormGroup({
    name: new FormControl<string>('', { nonNullable: true }),
    species: new FormControl<PcSpeciesOption>('Human', { nonNullable: true }),
    type: new FormControl<PcTypeOption>('Fighter', { nonNullable: true }),
    imageId: new FormControl<number | null>(null),
    maxHP: new FormControl<number>(10, { nonNullable: true }),
    currentHP: new FormControl<number>(10, { nonNullable: true }),
    ac: new FormControl<number>(10, { nonNullable: true }),
    actionEconomy: new FormControl<number>(0, { nonNullable: true }),
    poisonResest: new FormControl<number>(0, { nonNullable: true }),
    magicPower: new FormControl<number>(0, { nonNullable: true }),
    mind: new FormControl<number>(0, { nonNullable: true }),
    stamina: new FormControl<number>(0, { nonNullable: true }),
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
    ring1ItemId: new FormControl<number | null>(null),
    ring2ItemId: new FormControl<number | null>(null),
    ring3ItemId: new FormControl<number | null>(null),
    ring4ItemId: new FormControl<number | null>(null),
    ring5ItemId: new FormControl<number | null>(null),
    necklaceItemId: new FormControl<number | null>(null),
    hand1ItemId: new FormControl<number | null>(null),
    hand2ItemId: new FormControl<number | null>(null),
    numberOfAttacks: new FormControl<number>(1, { nonNullable: true }),
    agility: new FormControl<number>(3, { nonNullable: true }),
  });

  ngOnInit(): void {
    this.loadPublishedGames();
    this.loadActiveGames();
    this.loadUserFriends();
    this.loadMonsterImageOptions();
    this.loadUserPcs();
    this.loadUserItems();
    const userkey = this.account.getKey();
    if (userkey) {
      this.tresherService.loadTreshers(userkey);
      this.tresherService.loadTresherOptions(userkey);
    }
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
    this.mainGamePcChoice.set(null);
    this.beginCreatePc();
  }

  cancelStartGame(): void {
    this.pendingStartGame.set(null);
    this.selectedStartPcId.set(null);
    this.startGameMessage.set(null);
    this.mainGamePcChoice.set(null);
  }

  chooseMainGameOption(choice: 'create' | 'existing'): void {
    this.mainGamePcChoice.set(choice);
    this.selectedStartPcId.set(null);
    if (choice === 'create') {
      this.beginCreatePc();
    }
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

  startSelectedPcGame(pcId: number): void {
    const game = this.pendingStartGame();
    if (!game) {
      return;
    }
    this.selectedStartPcId.set(pcId);
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

  createFriendInvite(): void {
    if (this.isSavingUserFriend()) {
      return;
    }

    const userkey = this.account.getKey();
    if (!userkey) {
      this.userFriendSaveMessage.set('Please log in to invite friends.');
      return;
    }

    const email = this.userFriendForm.controls.email.value.trim();
    if (!email) {
      this.userFriendSaveMessage.set('Enter a friend email.');
      return;
    }

    this.isSavingUserFriend.set(true);
    this.userFriendSaveMessage.set(null);
    this.generatedInviteCode.set(null);
    this.generatedInviteeEmail.set(null);

    this.http
      .post<{ result: number; error?: string; code?: string; inviteeEmail?: string }>(
        `${API_BASE_URL}/friends/invite`,
        { userkey, email }
      )
      .pipe(finalize(() => this.isSavingUserFriend.set(false)))
      .subscribe({
        next: (response) => {
          if (response.result !== 1 || !response.code) {
            this.userFriendSaveMessage.set(response.error || 'Failed to create invite.');
            return;
          }

          this.userFriendForm.controls.email.setValue('');
          this.generatedInviteCode.set(response.code);
          this.generatedInviteeEmail.set(response.inviteeEmail ?? null);
          this.userFriendSaveMessage.set(null);
        },
        error: (errorResponse: { error?: { error?: string } }) => {
          this.userFriendSaveMessage.set(
            errorResponse?.error?.error || 'Failed to create invite.'
          );
        },
      });
  }

  acceptFriendInvite(): void {
    if (this.isSavingAcceptInvite()) {
      return;
    }

    const userkey = this.account.getKey();
    if (!userkey) {
      this.acceptInviteMessage.set('Please log in to accept an invite.');
      return;
    }

    const code = this.userAcceptInviteForm.controls.code.value.trim().toUpperCase();
    if (!code) {
      this.acceptInviteMessage.set('Enter an invite code.');
      return;
    }

    this.isSavingAcceptInvite.set(true);
    this.acceptInviteMessage.set(null);

    this.http
      .post<{ result: number; error?: string }>(
        `${API_BASE_URL}/friends/accept`,
        { userkey, code }
      )
      .pipe(finalize(() => this.isSavingAcceptInvite.set(false)))
      .subscribe({
        next: (response) => {
          if (response.result !== 1) {
            this.acceptInviteMessage.set(response.error || 'Failed to accept invite.');
            return;
          }

          this.userAcceptInviteForm.controls.code.setValue('');
          this.acceptInviteMessage.set('You are now friends!');
          this.loadUserFriends();
        },
        error: (errorResponse: { error?: { error?: string } }) => {
          this.acceptInviteMessage.set(
            errorResponse?.error?.error || 'Failed to accept invite.'
          );
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
    this.clearPcStats();
  }

  onPcTypeChanged(): void {
    this.clearPcStats();
  }

  rerollPcStats(): void {
    this.generatePcStats();
  }

  private clearPcStats(): void {
    this.pcStatsRolled.set(false);
    const controls = this.userPcForm.controls;
    controls.actionEconomy.setValue(0);
    controls.strength.setValue(0);
    controls.stamina.setValue(0);
    controls.mind.setValue(0);
    controls.magicPower.setValue(0);
    controls.rangeOfView.setValue(0);
    controls.maxHP.setValue(0);
    controls.currentHP.setValue(0);
    controls.poisonResest.setValue(0);
    controls.ac.setValue(0);
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

    return this.allMonsterImageOptions().find((item) => item.id === selectedId) ?? null;
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

    return this.allMonsterImageOptions().find((item) => item.id === pc.imageId) ?? null;
  }

  pcImageUrlForPc(pc: UserPcListItem): string {
    const image = this.pcImageForPc(pc);
    return image ? this.resolveImageUrl(image.path) : '';
  }

  availablePcLoadoutTreshers(): UserTresherListItem[] {
    const selectedIds = new Set(this.normalizeIdList(this.userPcTresherIdsArray.getRawValue()));
    return this.monsterTresherOptions().filter((item) => selectedIds.has(item.id));
  }

  availablePcHandTreshers(): UserTresherListItem[] {
    return this.availablePcLoadoutTreshers().filter((item) => {
      const t = (item.type ?? '').toLowerCase();
      return t === 'weapon' || t === 'shield' || t === 'light';
    });
  }

  availablePcWeaponShieldItems(): UserItemOption[] {
    const treshers = this.availablePcLoadoutTreshers();
    const itemIds = new Set<number>();
    for (const t of treshers) {
      if (t.item1Id) itemIds.add(t.item1Id);
      if (t.item2Id) itemIds.add(t.item2Id);
      if (t.item3Id) itemIds.add(t.item3Id);
      if (t.item4Id) itemIds.add(t.item4Id);
    }
    return this.userItems().filter((item) => {
      if (!itemIds.has(item.id)) return false;
      const t = (item.type ?? '').toLowerCase();
      if (t === 'weapon' || t === 'shield') return true;
      if (t === 'armor') {
        const slot = (item.armorSlot ?? '').toLowerCase();
        return slot === 'shield' || slot === '';
      }
      return false;
    });
  }

  availablePcHand1Items(): UserItemOption[] {
    const hand2Id = this.userPcForm.controls.hand2ItemId.value;
    return this.availablePcWeaponShieldItems().filter((i) => i.id !== hand2Id);
  }

  availablePcHand2Items(): UserItemOption[] {
    const hand1Id = this.userPcForm.controls.hand1ItemId.value;
    return this.availablePcWeaponShieldItems().filter((i) => i.id !== hand1Id);
  }

  availablePcEquipItems(): UserItemOption[] {
    const treshers = this.availablePcLoadoutTreshers();
    const itemIds = new Set<number>();
    for (const t of treshers) {
      if (t.item1Id) itemIds.add(t.item1Id);
      if (t.item2Id) itemIds.add(t.item2Id);
      if (t.item3Id) itemIds.add(t.item3Id);
      if (t.item4Id) itemIds.add(t.item4Id);
    }
    return this.userItems().filter((item) => itemIds.has(item.id));
  }

  availablePcArmorTreshers(): UserTresherListItem[] {
    return this.availablePcLoadoutTreshers().filter((item) => item.type === 'Armor');
  }

  beginCreatePc(clearMessage: boolean = true): void {
    this.editingUserPcId.set(null);
    if (clearMessage) {
      this.userPcSaveMessage.set(null);
    }
    this.resetUserPcForm();
    this.isPcEditorVisible.set(true);
  }

  openNewPcEditor(): void {
    this.beginCreatePc();
  }

  togglePcExpanded(id: number): void {
    this.expandedPcId.set(this.expandedPcId() === id ? null : id);
  }

  editPc(item: UserPcListItem): void {
    this.isPcEditorVisible.set(true);
    const source = this.userPcs().find((pc) => pc.id === item.id) ?? item;
    this.editingUserPcId.set(source.id);
    this.userPcSaveMessage.set(null);
    this.replacePcTresherForms(source.tresherIds ?? []);

    const controls = this.userPcForm.controls;
    controls.name.setValue(source.name || '');
    controls.species.setValue(this.normalizePcSpecies(source.species));
    controls.type.setValue(this.normalizePcType(source.type));
    controls.imageId.setValue(this.normalizeNullableNumber(source.imageId));
    controls.maxHP.setValue(Math.max(1, this.normalizeNumber(source.maxHP, 10)));
    controls.currentHP.setValue(
      Math.max(0, this.normalizeNumber(source.currentHP, controls.maxHP.value))
    );
    controls.ac.setValue(Math.max(0, this.normalizeNumber(source.ac, 10)));
    controls.actionEconomy.setValue(
      Math.max(0, this.normalizeNumber(source.actionEconomy, 0))
    );
    controls.poisonResest.setValue(this.normalizeNumber(source.poisonResest, 0));
    controls.magicPower.setValue(this.normalizeNumber(source.magicPower, 0));
    controls.mind.setValue(this.normalizeNumber(source.mind, 0));
    controls.stamina.setValue(this.normalizeNumber(source.stamina, 0));
    controls.level.setValue(Math.max(1, this.normalizeNumber(source.level, 1)));
    controls.strength.setValue(this.normalizeNumber(source.strength, 0));
    controls.rangeOfView.setValue(
      Math.max(0, this.normalizeNumber(source.rangeOfView, this.rangeOfViewBySpecies(controls.species.value)))
    );
    controls.primaryTresherId.setValue(this.normalizeNullableNumber(source.primaryTresherId));
    controls.weaponTresherId.setValue(this.normalizeNullableNumber(source.weaponTresherId));
    controls.headArmorTresherId.setValue(this.normalizeNullableNumber(source.headArmorTresherId));
    controls.bodyArmorTresherId.setValue(this.normalizeNullableNumber(source.bodyArmorTresherId));
    controls.leftArmArmorTresherId.setValue(this.normalizeNullableNumber(source.leftArmArmorTresherId));
    controls.rightArmArmorTresherId.setValue(this.normalizeNullableNumber(source.rightArmArmorTresherId));
    controls.leftLegArmorTresherId.setValue(this.normalizeNullableNumber(source.leftLegArmorTresherId));
    controls.rightLegArmorTresherId.setValue(this.normalizeNullableNumber(source.rightLegArmorTresherId));
    controls.ring1ItemId.setValue(this.normalizeNullableNumber(source.ring1ItemId));
    controls.ring2ItemId.setValue(this.normalizeNullableNumber(source.ring2ItemId));
    controls.ring3ItemId.setValue(this.normalizeNullableNumber(source.ring3ItemId));
    controls.ring4ItemId.setValue(this.normalizeNullableNumber(source.ring4ItemId));
    controls.ring5ItemId.setValue(this.normalizeNullableNumber(source.ring5ItemId));
    controls.necklaceItemId.setValue(this.normalizeNullableNumber(source.necklaceItemId));
    controls.hand1ItemId.setValue(this.normalizeNullableNumber(source.hand1ItemId));
    controls.hand2ItemId.setValue(this.normalizeNullableNumber(source.hand2ItemId));
    controls.numberOfAttacks.setValue(Math.max(1, this.normalizeNumber(source.numberOfAttacks, 1)));
    controls.agility.setValue(Math.max(0, this.normalizeNumber((source as UserPcListItem & Record<string, unknown>)['agility'] as number ?? source.agility ?? 3, 3)));
    this.pcStatsRolled.set(true);
  }

  cancelEditPc(): void {
    this.closePcEditor();
  }

  closePcEditor(): void {
    this.isPcEditorVisible.set(false);
    this.editingUserPcId.set(null);
    this.resetUserPcForm();
    this.userPcSaveMessage.set(null);
  }

  upgradeNoa(pcId: number): void {
    const userkey = this.account.getKey();
    if (!userkey || this.isUpgradingNoa() !== null) return;
    this.isUpgradingNoa.set(pcId);
    this.noaUpgradeMessage.set(null);
    this.http
      .patch<{ result: number; sp: number; numberOfAttacks: number; error?: string }>(
        `${API_BASE_URL}/pcs/${pcId}/upgrade-noa`,
        { userkey }
      )
      .pipe(finalize(() => this.isUpgradingNoa.set(null)))
      .subscribe({
        next: (r) => {
          if (r.result !== 1) {
            this.noaUpgradeMessage.set(r.error ?? 'Failed to upgrade NOA.');
            return;
          }
          this.noaUpgradeMessage.set(`NOA upgraded to ${r.numberOfAttacks}! SP remaining: ${r.sp}`);
          this.loadUserPcs();
        },
        error: () => this.noaUpgradeMessage.set('Failed to upgrade NOA.'),
      });
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

    // When creating a PC in the main-game flow, flag it as a main game PC
    const isMainGameCreate = !editingId && this.mainGamePcChoice() === 'create' && this.pendingStartGame()?.ismaingame === true;
    const pcBody = isMainGameCreate ? { ...payload, ismaingame: true } : payload;

    const request$ = editingId
      ? this.http.put<{ result: number; error?: string; pc?: UserPcListItem }>(
          `${API_BASE_URL}/pcs/${editingId}`,
          {
            userkey,
            pc: pcBody,
          }
        )
      : this.http.post<{ result: number; error?: string; pc?: UserPcListItem }>(
          `${API_BASE_URL}/pcs`,
          {
            userkey,
            pc: pcBody,
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

          const responsePc = response.pc as UserPcListItem & Record<string, unknown>;
          const normalizedSavedPc = this.normalizeUserPcRecord({
            ...response.pc,
            tresherIds: this.normalizeIdList(
              (responsePc['tresherIds'] ?? responsePc['tresherids'] ?? payload.tresherIds) as unknown
            ),
            primaryTresherId: this.normalizeNullableNumber(
              (responsePc['primaryTresherId'] ?? responsePc['primarytresherid'] ?? payload.primaryTresherId) as number | string | null
            ),
            weaponTresherId: this.normalizeNullableNumber(
              (responsePc['weaponTresherId'] ?? responsePc['weapontresherid'] ?? payload.weaponTresherId) as number | string | null
            ),
            headArmorTresherId: this.normalizeNullableNumber(
              (responsePc['headArmorTresherId'] ?? responsePc['headarmortresherid'] ?? payload.headArmorTresherId) as number | string | null
            ),
            bodyArmorTresherId: this.normalizeNullableNumber(
              (responsePc['bodyArmorTresherId'] ?? responsePc['bodyarmortresherid'] ?? payload.bodyArmorTresherId) as number | string | null
            ),
            leftArmArmorTresherId: this.normalizeNullableNumber(
              (responsePc['leftArmArmorTresherId'] ?? responsePc['leftarmarmortresherid'] ?? payload.leftArmArmorTresherId) as number | string | null
            ),
            rightArmArmorTresherId: this.normalizeNullableNumber(
              (responsePc['rightArmArmorTresherId'] ?? responsePc['rightarmarmortresherid'] ?? payload.rightArmArmorTresherId) as number | string | null
            ),
            leftLegArmorTresherId: this.normalizeNullableNumber(
              (responsePc['leftLegArmorTresherId'] ?? responsePc['leftlegarmortresherid'] ?? payload.leftLegArmorTresherId) as number | string | null
            ),
            rightLegArmorTresherId: this.normalizeNullableNumber(
              (responsePc['rightLegArmorTresherId'] ?? responsePc['rightlegarmortresherid'] ?? payload.rightLegArmorTresherId) as number | string | null
            ),
          });

          this.userPcs.update((pcs) => {
            const existingIndex = pcs.findIndex((pc) => pc.id === normalizedSavedPc.id);
            if (existingIndex === -1) {
              return this.sortUserPcsByName([normalizedSavedPc, ...pcs]);
            }
            const next = [...pcs];
            next[existingIndex] = normalizedSavedPc;
            return this.sortUserPcsByName(next);
          });

          this.userPcSaveMessage.set(editingId ? 'PC updated.' : 'PC created.');
          this.closePcEditor();

          // If created a new PC in the main-game flow, auto-start the game
          const pendingGame = this.pendingStartGame();
          if (!editingId && this.mainGamePcChoice() === 'create' && pendingGame?.ismaingame && response.pc?.id) {
            this.startPublishedGame(pendingGame, response.pc.id);
          }
        },
        error: () => {
          this.userPcSaveMessage.set('Failed to save PC.');
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

  private loadUserItems(): void {
    const userkey = this.account.getKey();
    if (!userkey) return;
    this.isLoadingUserItems.set(true);
    this.http
      .get<UserItemOption[]>(`${API_BASE_URL}/items`, { params: { userkey } })
      .pipe(finalize(() => this.isLoadingUserItems.set(false)))
      .subscribe({
        next: (items) => this.userItems.set(items),
        error: () => this.userItems.set([]),
      });
  }

  onPcImageUploaded(item: UploadedMediaItem): void {
    this._localPcImages.update((opts) => [...opts, item as unknown as UserImageListItem]);
    this.userPcForm.controls.imageId.setValue(item.id);
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
          const normalized = this.sortUserPcsByName(
            items.map((item) => this.normalizeUserPcRecord(item))
          );

          this.userPcs.set(normalized);
        },
        error: () => {
          this.userPcs.set([]);
          this.userPcsError.set('Failed to load your PCs.');
        },
      });
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
      actionEconomy: Math.max(0, this.normalizeNumber(controls.actionEconomy.value, 0)),
      poisonResest: this.normalizeNumber(controls.poisonResest.value, 0),
      magicPower: this.normalizeNumber(controls.magicPower.value, 0),
      mind: Math.max(0, this.normalizeNumber(controls.mind.value, 0)),
      stamina: Math.max(0, this.normalizeNumber(controls.stamina.value, 0)),
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
      ring1ItemId: this.normalizeNullableNumber(controls.ring1ItemId.value),
      ring2ItemId: this.normalizeNullableNumber(controls.ring2ItemId.value),
      ring3ItemId: this.normalizeNullableNumber(controls.ring3ItemId.value),
      ring4ItemId: this.normalizeNullableNumber(controls.ring4ItemId.value),
      ring5ItemId: this.normalizeNullableNumber(controls.ring5ItemId.value),
      necklaceItemId: this.normalizeNullableNumber(controls.necklaceItemId.value),
      hand1ItemId: this.normalizeNullableNumber(controls.hand1ItemId.value),
      hand2ItemId: this.normalizeNullableNumber(controls.hand2ItemId.value),
      numberOfAttacks: Math.max(1, this.normalizeNumber(controls.numberOfAttacks.value, 1)),
      agility: Math.max(0, this.normalizeNumber(controls.agility.value, 3)),
    };
  }


  private resetUserPcForm(): void {
    this.replacePcTresherForms([]);
    this.pcStatsRolled.set(false);

    const controls = this.userPcForm.controls;
    controls.name.setValue('');
    controls.species.setValue('Human');
    controls.type.setValue('Fighter');
    controls.imageId.setValue(null);
    controls.actionEconomy.setValue(0);
    controls.strength.setValue(0);
    controls.stamina.setValue(0);
    controls.mind.setValue(0);
    controls.magicPower.setValue(0);
    controls.rangeOfView.setValue(0);
    controls.maxHP.setValue(0);
    controls.currentHP.setValue(0);
    controls.poisonResest.setValue(0);
    controls.ac.setValue(0);
    controls.level.setValue(1);
    controls.primaryTresherId.setValue(null);
    controls.weaponTresherId.setValue(null);
    controls.headArmorTresherId.setValue(null);
    controls.bodyArmorTresherId.setValue(null);
    controls.leftArmArmorTresherId.setValue(null);
    controls.rightArmArmorTresherId.setValue(null);
    controls.leftLegArmorTresherId.setValue(null);
    controls.rightLegArmorTresherId.setValue(null);
    controls.ring1ItemId.setValue(null);
    controls.ring2ItemId.setValue(null);
    controls.ring3ItemId.setValue(null);
    controls.ring4ItemId.setValue(null);
    controls.ring5ItemId.setValue(null);
    controls.necklaceItemId.setValue(null);
    controls.hand1ItemId.setValue(null);
    controls.hand2ItemId.setValue(null);
    controls.numberOfAttacks.setValue(1);
    controls.agility.setValue(3);
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

  private createPcTresherControl(value: number | null = null): PcTresherControl {
    return new FormControl<number | null>(value);
  }

  readonly compareNullableIds = (
    left: number | string | null,
    right: number | string | null
  ): boolean => {
    if (left === null || left === undefined || left === '') {
      return right === null || right === undefined || right === '';
    }
    if (right === null || right === undefined || right === '') {
      return false;
    }
    return Number(left) === Number(right);
  };

  private get userPcTresherIdsArray(): FormArray<PcTresherControl> {
    return this.userPcForm.controls.tresherIds;
  }

  private normalizeNumber(value: number | null, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fallback;
    }

    return Math.trunc(value);
  }

  private normalizeNullableNumber(value: number | string | null): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const asNumber =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
        ? Number.parseInt(value.trim(), 10)
        : Number.NaN;

    if (!Number.isFinite(asNumber)) {
      return null;
    }

    return Math.trunc(asNumber);
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

  private rangeOfViewBySpecies(species: PcSpeciesOption): number {
    return species === 'Elph' || species === 'DwarPh' ? 7 : 5;
  }

  private rollDn(sides: number): number {
    return Math.floor(Math.random() * sides) + 1;
  }

  private generatePcStats(): void {
    this.pcStatsRolled.set(true);
    const species = this.normalizePcSpecies(this.userPcForm.controls.species.value);
    const type = this.normalizePcType(this.userPcForm.controls.type.value);
    const controls = this.userPcForm.controls;

    // AE: Human/Elph=5, DwarPh/Shorties=4
    controls.actionEconomy.setValue(species === 'Human' || species === 'Elph' ? 5 : 4);

    // Strength by species (from species table)
    let strength: number;
    if (species === 'Human')        strength = Math.floor(this.rollDn(12) / 2) + 1;
    else if (species === 'Elph')   strength = Math.floor(this.rollDn(12) / 2);
    else if (species === 'DwarPh') strength = Math.floor(this.rollDn(12) / 2) + 4;
    else                           strength = Math.floor(this.rollDn(12) / 4) + 2; // Shorties
    controls.strength.setValue(strength);

    // Stamina: species base + type bonus
    // Base: Human=1d4, Elph=1d3, DwarPh=1d6, Shorties=1d3
    const staminaBase = species === 'Human' ? this.rollDn(4)
      : species === 'Elph'   ? this.rollDn(3)
      : species === 'DwarPh' ? this.rollDn(6)
      : this.rollDn(3); // Shorties
    // Type bonus: Fighter=+1d6, Thieph=+1d2, Mage=+1d3, Healer=+1d4
    const staminaBonus = type === 'Fighter' ? this.rollDn(6)
      : type === 'Thieph'  ? this.rollDn(2)
      : type === 'Mage'    ? this.rollDn(3)
      : this.rollDn(4); // Healer
    const stamina = staminaBase + staminaBonus;
    controls.stamina.setValue(stamina);

    // Mind: 1d6 + (Elph +1d4) + (Mage +1d4, Healer +1d3, Thieph +1d2)
    let mind = this.rollDn(6);
    if (species === 'Elph')       mind += this.rollDn(4);
    if (type === 'Mage')          mind += this.rollDn(4);
    else if (type === 'Healer')   mind += this.rollDn(3);
    else if (type === 'Thieph')   mind += this.rollDn(2);
    controls.mind.setValue(mind);

    // Magic Power: Mind + (Elph +1d4) + (Mage +1d6, Healer +1d4)
    let magicPower = mind;
    if (species === 'Elph')     magicPower += this.rollDn(4);
    if (type === 'Mage')        magicPower += this.rollDn(6);
    else if (type === 'Healer') magicPower += this.rollDn(4);
    controls.magicPower.setValue(magicPower);

    // Range of View (species-based)
    controls.rangeOfView.setValue(this.rangeOfViewBySpecies(species));

    // Max HP: stamina + (DwarPh +2) + (Fighter +2) + 1d4
    let maxHP = stamina;
    if (species === 'DwarPh') maxHP += 2;
    if (type === 'Fighter')   maxHP += 2;
    maxHP += this.rollDn(4);
    controls.maxHP.setValue(maxHP);
    controls.currentHP.setValue(maxHP);

    // Poison Resist: floor(stamina/2) + (Elph or DwarPh +1d4)
    let poisonResist = Math.floor(stamina / 2);
    if (species === 'Elph' || species === 'DwarPh') poisonResist += this.rollDn(4);
    controls.poisonResest.setValue(poisonResist);

    // AC: Fighter = 2 + min(floor(Strength/2), 5) + floor(1d6/2); others = 1
    const ac = type === 'Fighter'
      ? 2 + Math.min(Math.floor(strength / 2), 5) + Math.floor(this.rollDn(6) / 2)
      : 1;
    controls.ac.setValue(ac);
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
      return 'Thieph';
    }

    if (lower === 'healer') {
      return 'Healer';
    }

    if (lower === 'ranger') {
      return 'Ranger';
    }

    return 'Fighter';
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
      .map((entry) => this.normalizeNullableNumber(entry as number | string | null))
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

  private normalizeUserPcRecord(item: UserPcListItem): UserPcListItem {
    const source = item as UserPcListItem & Record<string, unknown>;

    return {
      ...item,
      species: this.normalizePcSpecies(String(source['species'] ?? item.species ?? 'Human')),
      type: this.normalizePcType(String(source['type'] ?? item.type ?? 'Fighter')),
      imageId: this.normalizeNullableNumber(
        (source['imageId'] ?? source['imageid'] ?? item.imageId) as number | string | null
      ),
      tresherIds: this.normalizeIdList(
        (source['tresherIds'] ?? source['tresherids'] ?? source['trusherIds'] ?? source['trusherids'] ?? item.tresherIds) as unknown
      ),
      primaryTresherId: this.normalizeNullableNumber(
        (source['primaryTresherId'] ?? source['primarytresherid'] ?? source['primaryTrusherId'] ?? source['primarytrusherid'] ?? item.primaryTresherId) as number | string | null
      ),
      weaponTresherId: this.normalizeNullableNumber(
        (source['weaponTresherId'] ?? source['weapontresherid'] ?? source['weaponTrusherId'] ?? source['weapontrusherid'] ?? item.weaponTresherId) as number | string | null
      ),
      headArmorTresherId: this.normalizeNullableNumber(
        (source['headArmorTresherId'] ?? source['headarmortresherid'] ?? item.headArmorTresherId) as number | string | null
      ),
      bodyArmorTresherId: this.normalizeNullableNumber(
        (source['bodyArmorTresherId'] ?? source['bodyarmortresherid'] ?? item.bodyArmorTresherId) as number | string | null
      ),
      leftArmArmorTresherId: this.normalizeNullableNumber(
        (source['leftArmArmorTresherId'] ?? source['leftarmarmortresherid'] ?? item.leftArmArmorTresherId) as number | string | null
      ),
      rightArmArmorTresherId: this.normalizeNullableNumber(
        (source['rightArmArmorTresherId'] ?? source['rightarmarmortresherid'] ?? item.rightArmArmorTresherId) as number | string | null
      ),
      leftLegArmorTresherId: this.normalizeNullableNumber(
        (source['leftLegArmorTresherId'] ?? source['leftlegarmortresherid'] ?? item.leftLegArmorTresherId) as number | string | null
      ),
      rightLegArmorTresherId: this.normalizeNullableNumber(
        (source['rightLegArmorTresherId'] ?? source['rightlegarmortresherid'] ?? item.rightLegArmorTresherId) as number | string | null
      ),
      ring1ItemId: this.normalizeNullableNumber(
        (source['ring1ItemId'] ?? source['ring1itemid'] ?? item.ring1ItemId) as number | string | null
      ),
      ring2ItemId: this.normalizeNullableNumber(
        (source['ring2ItemId'] ?? source['ring2itemid'] ?? item.ring2ItemId) as number | string | null
      ),
      ring3ItemId: this.normalizeNullableNumber(
        (source['ring3ItemId'] ?? source['ring3itemid'] ?? item.ring3ItemId) as number | string | null
      ),
      ring4ItemId: this.normalizeNullableNumber(
        (source['ring4ItemId'] ?? source['ring4itemid'] ?? item.ring4ItemId) as number | string | null
      ),
      ring5ItemId: this.normalizeNullableNumber(
        (source['ring5ItemId'] ?? source['ring5itemid'] ?? item.ring5ItemId) as number | string | null
      ),
      necklaceItemId: this.normalizeNullableNumber(
        (source['necklaceItemId'] ?? source['necklaceitemid'] ?? item.necklaceItemId) as number | string | null
      ),
      spLifetime: Math.max(0, this.normalizeNumber((source['spLifetime'] as number | null | undefined) ?? item.spLifetime ?? 0, 0)),
      agility: Math.max(0, this.normalizeNumber((source['agility'] as number | null | undefined) ?? item.agility ?? 3, 3)),
    };
  }

  private sortUserPcsByName(items: UserPcListItem[]): UserPcListItem[] {
    return [...items].sort((a, b) => {
      const byName = (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
      if (byName !== 0) {
        return byName;
      }
      return a.id - b.id;
    });
  }

}
