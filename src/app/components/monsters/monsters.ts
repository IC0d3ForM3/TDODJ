import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { API_BASE_URL } from '../../api-config';
import { Account } from '../../services/account';
import {
  MonsterService,
  UserMonsterListItem,
  UserMonsterWritePayload,
  UserMonsterAttackEditorValue,
  UserMonsterAttackListItem,
} from '../../services/monster';
import { TresherService } from '../../services/tresher';
import { UploadPopup, UploadedMediaItem } from '../upload-popup/upload-popup';

interface ImageOption { id: number; name: string; path: string; }
interface SoundOption { id: number; name: string; path: string; }

interface ItemOption { id: number; name: string; }
interface SpellOption { id: number; name: string; }
interface CurseOption { id: number; name: string; }

type MonsterAttackFormGroup = FormGroup<{
  type: FormControl<string>;
  description: FormControl<string>;
  damage: FormControl<number>;
  plusToHit: FormControl<number>;
  weaponItemId: FormControl<number | null>;
  spellId: FormControl<number | null>;
  curseId: FormControl<number | null>;
}>;

type MonsterTresherControl = FormControl<number | null>;

@Component({
  selector: 'app-monsters',
  imports: [ReactiveFormsModule, UploadPopup],
  templateUrl: './monsters.html',
  styleUrl: './monsters.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Monsters implements OnInit {
  private readonly account = inject(Account);
  private readonly monsterService = inject(MonsterService);
  private readonly tresherService = inject(TresherService);

  readonly imageOptions = input<ImageOption[]>([]);
  readonly soundOptions = input<SoundOption[]>([]);

  private readonly _localImages = signal<ImageOption[]>([]);
  private readonly _localSounds = signal<SoundOption[]>([]);
  readonly allImageOptions = computed(() => [...this.imageOptions(), ...this._localImages()]);
  readonly allSoundOptions = computed(() => [...this.soundOptions(), ...this._localSounds()]);
  readonly groupedImageOptions = computed(() => this.groupMediaOptions(this.allImageOptions()));
  readonly groupedSoundOptions = computed(() => this.groupMediaOptions(this.allSoundOptions()));
  readonly itemOptions = input<ItemOption[]>([]);
  readonly spellOptions = input<SpellOption[]>([]);
  readonly curseOptions = input<CurseOption[]>([]);

  readonly monsterTypeOptions = ['Humanoid', 'Beast', 'Specter', 'Other'] as const;

  readonly isSectionVisible = signal(true);
  readonly isSaving = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly saveMessage = signal<string | null>(null);

  readonly isLoading = this.monsterService.isLoading;
  readonly error = this.monsterService.error;
  readonly items = this.monsterService.items;
  readonly tresherOptions = this.tresherService.tresherOptions;
  readonly isLoadingTresherOptions = this.tresherService.isLoadingOptions;
  readonly tresherOptionsError = this.tresherService.optionsError;

  readonly userMonsterForm = new FormGroup({
    tresherIds: new FormArray<MonsterTresherControl>([this.createMonsterTresherControl()]),
    imageId: new FormControl<number | null>(null),
    soundId: new FormControl<number | null>(null),
    name: new FormControl<string>('', { nonNullable: true }),
    type: new FormControl<string>('Humanoid', { nonNullable: true }),
    description: new FormControl<string>('', { nonNullable: true }),
    hp: new FormControl<number>(1, { nonNullable: true }),
    movementEconomy: new FormControl<number>(0, { nonNullable: true }),
    ac: new FormControl<number>(10, { nonNullable: true }),
    runAt: new FormControl<number>(0, { nonNullable: true }),
    numberOfAttacks: new FormControl<number>(1, { nonNullable: true }),
    magic: new FormControl<number>(0, { nonNullable: true }),
    spReward: new FormControl<number>(0, { nonNullable: true }),
    attacks: new FormArray<MonsterAttackFormGroup>([this.createMonsterAttackForm()]),
    isPublic: new FormControl<boolean>(false, { nonNullable: true }),
    callsReinforcements: new FormControl<boolean>(false, { nonNullable: true }),
    reinforcementCount: new FormControl<number>(1, { nonNullable: true }),
    reinforcementMonsterName: new FormControl<string>('', { nonNullable: true }),
    toHitPlusNeeded: new FormControl<number>(0, { nonNullable: true }),
    npcGreeting: new FormControl<string>('', { nonNullable: true }),
    npcInfo1: new FormControl<string>('', { nonNullable: true }),
    npcInfo2: new FormControl<string>('', { nonNullable: true }),
    npcInfo3: new FormControl<string>('', { nonNullable: true }),
    npcOnlyAttackWhenAttacked: new FormControl<boolean>(false, { nonNullable: true }),
    npcGivesInfoAfterDamaged: new FormControl<boolean>(false, { nonNullable: true }),
    npcAttacksAfterInfo: new FormControl<boolean>(false, { nonNullable: true }),
    npcCanTrade: new FormControl<boolean>(false, { nonNullable: true }),
    awareness: new FormControl<number>(5, { nonNullable: true }),
  });

  ngOnInit(): void {
    const userkey = this.account.getKey();
    if (userkey) {
      this.monsterService.loadMonsters(userkey);
      this.tresherService.loadTresherOptions(userkey);
    }
  }

  isLoggedIn(): boolean {
    return this.account.isLoggedIn();
  }

  onImageUploaded(item: UploadedMediaItem): void {
    this._localImages.update((opts) => [...opts, item]);
    this.userMonsterForm.controls.imageId.setValue(item.id);
  }

  onSoundUploaded(item: UploadedMediaItem): void {
    this._localSounds.update((opts) => [...opts, item]);
    this.userMonsterForm.controls.soundId.setValue(item.id);
  }

  isAdminUser(): boolean {
    return this.account.isAdmin();
  }

  toggleSectionVisibility(): void {
    this.isSectionVisible.update((v) => !v);
  }

  selectedImage(): ImageOption | null {
    const id = this.userMonsterForm.controls.imageId.value;
    return id !== null ? (this.allImageOptions().find((i) => i.id === id) ?? null) : null;
  }

  selectedImageUrl(): string {
    const img = this.selectedImage();
    return img ? this.resolveImageUrl(img.path) : '';
  }

  selectedImageName(): string | null {
    return this.selectedImage()?.name ?? null;
  }

  selectedSound(): SoundOption | null {
    const id = this.userMonsterForm.controls.soundId.value;
    return id !== null ? (this.allSoundOptions().find((s) => s.id === id) ?? null) : null;
  }

  selectedSoundUrl(): string {
    const sound = this.selectedSound();
    return sound ? this.resolveSoundUrl(sound.path) : '';
  }

  mediaOptionName(name: string): string {
    return name.replace(/^\[(Game|Uploaded)\]\s*/i, '');
  }

  playSelectedSound(): void {
    const soundUrl = this.selectedSoundUrl();
    if (!soundUrl) return;
    try {
      const audio = new Audio(soundUrl);
      audio.volume = 0.75;
      void audio.play().catch(() => {
        // Ignore browser playback failures.
      });
    } catch {
      // Audio API unavailable.
    }
  }

  tresherControls(): MonsterTresherControl[] {
    return this.monsterTresherIdsArray.controls;
  }

  addTresher(): void {
    this.monsterTresherIdsArray.push(this.createMonsterTresherControl());
  }

  removeTresher(index: number): void {
    if (this.monsterTresherIdsArray.length <= 1) {
      this.monsterTresherIdsArray.at(0).setValue(null);
      return;
    }
    this.monsterTresherIdsArray.removeAt(index);
  }

  selectedTresherSummary(): string {
    return this.buildTresherSummary(this.normalizeIdList(this.monsterTresherIdsArray.getRawValue()));
  }

  tresherSummaryForMonster(monster: UserMonsterListItem): string {
    return this.buildTresherSummary(monster.tresherIds);
  }

  imageForMonster(monster: UserMonsterListItem): ImageOption | null {
    if (monster.imageId === null) return null;
    return this.allImageOptions().find((i) => i.id === monster.imageId) ?? null;
  }

  imageUrlForMonster(monster: UserMonsterListItem): string {
    const img = this.imageForMonster(monster);
    return img ? this.resolveImageUrl(img.path) : '';
  }

  attackControls(): MonsterAttackFormGroup[] {
    return this.monsterAttacksArray.controls;
  }

  addAttack(): void {
    this.monsterAttacksArray.push(this.createMonsterAttackForm());
    this.syncAttackCount();
  }

  removeAttack(index: number): void {
    if (this.monsterAttacksArray.length <= 1) {
      this.monsterAttacksArray.at(0).reset({
        type: 'Bite',
        description: '',
        damage: 0,
        plusToHit: 0,
        weaponItemId: null,
        spellId: null,
        curseId: null,
      });
      this.syncAttackCount();
      return;
    }
    this.monsterAttacksArray.removeAt(index);
    this.syncAttackCount();
  }

  beginCreate(clearMessage = true): void {
    this.editingId.set(null);
    if (clearMessage) this.saveMessage.set(null);
    this.resetForm();
  }

  editMonster(item: UserMonsterListItem): void {
    this.editingId.set(item.id);
    this.saveMessage.set(null);

    const attacks = Array.isArray(item.attacks)
      ? item.attacks.map((a) => ({
          type: a.type || 'Bite',
          description: a.description || '',
          damage: this.normalizeNumber(a.damage, 0),
          plusToHit: this.normalizeNumber(a.plusToHit, 0),
          weaponItemId: this.normalizeNullableNumber(a.weaponItemId),
          spellId: this.normalizeNullableNumber(a.spellId),
          curseId: this.normalizeNullableNumber(a.curseId),
        }))
      : [];

    this.replaceAttackForms(attacks);
    this.replaceTresherForms(item.tresherIds ?? []);

    const c = this.userMonsterForm.controls;
    c.imageId.setValue(this.normalizeNullableNumber(item.imageId));
    c.soundId.setValue(this.normalizeNullableNumber(item.soundId));
    c.name.setValue(item.name || '');
    c.type.setValue(item.type || 'Humanoid');
    c.description.setValue(item.description || '');
    c.hp.setValue(Math.max(0, this.normalizeNumber(item.hp, 1)));
    c.movementEconomy.setValue(Math.max(0, this.normalizeNumber(item.movementEconomy, 0)));
    c.ac.setValue(Math.max(0, this.normalizeNumber(item.ac, 10)));
    c.runAt.setValue(Math.max(0, this.normalizeNumber(item.runAt, 0)));
    c.numberOfAttacks.setValue(
      Math.max(this.normalizeNumber(item.numberOfAttacks, 0), this.monsterAttacksArray.length)
    );
    c.magic.setValue(this.normalizeNumber(item.magic, 0));
    c.spReward.setValue(this.normalizeNumber(item.spReward, 0));
    c.isPublic.setValue(item.isPublic);
    c.callsReinforcements.setValue(item.callsReinforcements === true);
    c.reinforcementCount.setValue(Math.max(1, this.normalizeNumber(item.reinforcementCount, 1)));
    c.reinforcementMonsterName.setValue(item.reinforcementMonsterName ?? '');
    c.toHitPlusNeeded.setValue(this.normalizeNumber(item.toHitPlusNeeded, 0));
    c.npcGreeting.setValue(item.npcGreeting ?? '');
    c.npcInfo1.setValue(item.npcInfo1 ?? '');
    c.npcInfo2.setValue(item.npcInfo2 ?? '');
    c.npcInfo3.setValue(item.npcInfo3 ?? '');
    c.npcOnlyAttackWhenAttacked.setValue(item.npcOnlyAttackWhenAttacked === true);
    c.npcGivesInfoAfterDamaged.setValue(item.npcGivesInfoAfterDamaged === true);
    c.npcAttacksAfterInfo.setValue(item.npcAttacksAfterInfo === true);
    c.npcCanTrade.setValue(item.npcCanTrade === true);
    c.awareness.setValue(Math.max(1, item.awareness ?? 5));
  }

  cancelEdit(): void {
    this.beginCreate();
  }

  save(): void {
    if (this.isSaving()) return;

    const userkey = this.account.getKey();
    if (!userkey) {
      this.saveMessage.set('Please log in to save monsters.');
      return;
    }

    const payload = this.buildPayload();
    const editingId = this.editingId();
    const request$ = editingId
      ? this.monsterService.updateMonster(editingId, userkey, payload)
      : this.monsterService.createMonster(userkey, payload);

    this.isSaving.set(true);
    this.saveMessage.set(null);

    request$
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (response) => {
          if (response.result !== 1 || !response.monster) {
            this.saveMessage.set(response.error || 'Failed to save monster.');
            return;
          }
          this.monsterService.loadMonsters(this.account.getKey()!);
          this.saveMessage.set(editingId ? 'Monster updated.' : 'Monster created.');
          this.beginCreate(false);
        },
        error: () => {
          this.saveMessage.set('Failed to save monster.');
        },
      });
  }

  resolveImageUrl(path: string): string {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  resolveSoundUrl(path: string): string {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  private groupMediaOptions<T extends { path: string }>(options: T[]): { game: T[]; uploaded: T[] } {
    const grouped: { game: T[]; uploaded: T[] } = { game: [], uploaded: [] };
    for (const option of options) {
      if (this.isUploadedMediaPath(option.path)) grouped.uploaded.push(option);
      else grouped.game.push(option);
    }
    return grouped;
  }

  private isUploadedMediaPath(path: string): boolean {
    const normalized = path.toLowerCase();
    return normalized.includes('/uploads/') || normalized.includes('\\uploads\\') || normalized.startsWith('uploads/');
  }

  private get monsterTresherIdsArray(): FormArray<MonsterTresherControl> {
    return this.userMonsterForm.controls.tresherIds;
  }

  private get monsterAttacksArray(): FormArray<MonsterAttackFormGroup> {
    return this.userMonsterForm.controls.attacks;
  }

  private buildTresherSummary(tresherIds: number[]): string {
    const ids = this.normalizeIdList(tresherIds);
    if (ids.length === 0) return 'None';
    const nameById = new Map<number, string>();
    for (const opt of this.tresherOptions()) {
      nameById.set(opt.id, opt.name);
    }
    return ids.map((id) => nameById.get(id) || `ID ${id}`).join(', ');
  }

  private buildPayload(): UserMonsterWritePayload {
    const c = this.userMonsterForm.controls;
    const attackValues = this.monsterAttacksArray.getRawValue();
    const attacks: UserMonsterAttackEditorValue[] = attackValues.map((attack) => ({
      type: (attack.type || 'Bite').trim(),
      description: (attack.description || '').trim(),
      damage: Math.max(0, this.normalizeNumber(attack.damage, 0)),
      plusToHit: this.normalizeNumber(attack.plusToHit, 0),
      weaponItemId: this.normalizeNullableNumber(attack.weaponItemId),
      spellId: this.normalizeNullableNumber(attack.spellId),
      curseId: this.normalizeNullableNumber(attack.curseId),
    }));

    const requestedAttackCount = Math.max(
      0,
      this.normalizeNumber(c.numberOfAttacks.value, attacks.length)
    );

    return {
      tresherIds: this.normalizeIdList(this.monsterTresherIdsArray.getRawValue()),
      imageId: this.normalizeNullableNumber(c.imageId.value),
      soundId: this.normalizeNullableNumber(c.soundId.value),
      name: (c.name.value || '').trim() || 'Unnamed Monster',
      type: (c.type.value || '').trim() || 'Humanoid',
      description: (c.description.value || '').trim(),
      hp: Math.max(0, this.normalizeNumber(c.hp.value, 1)),
      movementEconomy: Math.max(0, this.normalizeNumber(c.movementEconomy.value, 0)),
      ac: Math.max(0, this.normalizeNumber(c.ac.value, 10)),
      runAt: Math.max(0, this.normalizeNumber(c.runAt.value, 0)),
      numberOfAttacks: Math.max(requestedAttackCount, attacks.length),
      magic: this.normalizeNumber(c.magic.value, 0),
      spReward: Math.max(0, this.normalizeNumber(c.spReward.value, 0)),
      attacks,
      isPublic: this.isAdminUser() ? c.isPublic.value === true : false,
      callsReinforcements: c.callsReinforcements.value === true,
      reinforcementCount:
        c.callsReinforcements.value === true
          ? Math.max(1, this.normalizeNumber(c.reinforcementCount.value, 1))
          : 0,
      reinforcementMonsterName:
        c.callsReinforcements.value === true
          ? c.reinforcementMonsterName.value.trim() || null
          : null,
      toHitPlusNeeded: Math.max(0, this.normalizeNumber(c.toHitPlusNeeded.value, 0)),
      npcGreeting: c.npcGreeting.value.trim() || null,
      npcInfo1: c.npcInfo1.value.trim() || null,
      npcInfo2: c.npcInfo2.value.trim() || null,
      npcInfo3: c.npcInfo3.value.trim() || null,
      npcOnlyAttackWhenAttacked: c.npcOnlyAttackWhenAttacked.value === true,
      npcGivesInfoAfterDamaged: c.npcGivesInfoAfterDamaged.value === true,
      npcAttacksAfterInfo: c.npcAttacksAfterInfo.value === true,
      npcCanTrade: c.npcCanTrade.value === true,
      awareness: Math.max(1, c.awareness.value ?? 5),
    };
  }

  private resetForm(): void {
    this.replaceAttackForms([
      { type: 'Bite', description: '', damage: 0, plusToHit: 0, weaponItemId: null, spellId: null, curseId: null },
    ]);
    this.replaceTresherForms([]);
    const c = this.userMonsterForm.controls;
    c.imageId.setValue(null);
    c.soundId.setValue(null);
    c.name.setValue('');
    c.type.setValue('Humanoid');
    c.description.setValue('');
    c.hp.setValue(1);
    c.movementEconomy.setValue(0);
    c.ac.setValue(10);
    c.runAt.setValue(0);
    c.numberOfAttacks.setValue(1);
    c.magic.setValue(0);
    c.spReward.setValue(0);
    c.isPublic.setValue(false);
    c.callsReinforcements.setValue(false);
    c.reinforcementCount.setValue(1);
    c.reinforcementMonsterName.setValue('');
    c.toHitPlusNeeded.setValue(0);
    c.npcGreeting.setValue('');
    c.npcInfo1.setValue('');
    c.npcInfo2.setValue('');
    c.npcInfo3.setValue('');
    c.npcOnlyAttackWhenAttacked.setValue(false);
    c.npcGivesInfoAfterDamaged.setValue(false);
    c.npcAttacksAfterInfo.setValue(false);
    c.npcCanTrade.setValue(false);
    c.awareness.setValue(5);
  }

  private replaceTresherForms(tresherIds: number[]): void {
    this.monsterTresherIdsArray.clear();
    const normalized = this.normalizeIdList(tresherIds);
    if (normalized.length === 0) {
      this.monsterTresherIdsArray.push(this.createMonsterTresherControl());
      return;
    }
    for (const id of normalized) {
      this.monsterTresherIdsArray.push(this.createMonsterTresherControl(id));
    }
  }

  private replaceAttackForms(
    attacks: UserMonsterAttackEditorValue[] | UserMonsterAttackListItem[]
  ): void {
    this.monsterAttacksArray.clear();
    const normalized = attacks.length
      ? attacks.map((a) => ({
          type: a.type || 'Bite',
          description: a.description || '',
          damage: this.normalizeNumber(a.damage, 0),
          plusToHit: this.normalizeNumber(a.plusToHit, 0),
          weaponItemId: this.normalizeNullableNumber(a.weaponItemId),
          spellId: this.normalizeNullableNumber(a.spellId),
          curseId: this.normalizeNullableNumber(a.curseId),
        }))
      : [
          { type: 'Bite', description: '', damage: 0, plusToHit: 0, weaponItemId: null, spellId: null, curseId: null },
        ];
    for (const attack of normalized) {
      this.monsterAttacksArray.push(this.createMonsterAttackForm(attack));
    }
  }

  private syncAttackCount(): void {
    const current = Math.max(
      0,
      this.normalizeNumber(this.userMonsterForm.controls.numberOfAttacks.value, 0)
    );
    if (current < this.monsterAttacksArray.length) {
      this.userMonsterForm.controls.numberOfAttacks.setValue(this.monsterAttacksArray.length);
    }
  }

  private createMonsterAttackForm(
    value?: Partial<UserMonsterAttackEditorValue>
  ): MonsterAttackFormGroup {
    return new FormGroup({
      type: new FormControl<string>(value?.type || 'Bite', { nonNullable: true }),
      description: new FormControl<string>(value?.description || '', { nonNullable: true }),
      damage: new FormControl<number>(this.normalizeNumber(value?.damage ?? null, 0), {
        nonNullable: true,
      }),
      plusToHit: new FormControl<number>(this.normalizeNumber(value?.plusToHit ?? null, 0), {
        nonNullable: true,
      }),
      weaponItemId: new FormControl<number | null>(
        this.normalizeNullableNumber(value?.weaponItemId ?? null)
      ),
      spellId: new FormControl<number | null>(
        this.normalizeNullableNumber(value?.spellId ?? null)
      ),
      curseId: new FormControl<number | null>(
        this.normalizeNullableNumber(value?.curseId ?? null)
      ),
    });
  }

  private createMonsterTresherControl(value: number | null = null): MonsterTresherControl {
    return new FormControl<number | null>(value);
  }

  private normalizeNumber(value: number | null, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.trunc(value);
  }

  private normalizeNullableNumber(value: number | null): number | null {
    if (value === null || typeof value !== 'number' || !Number.isFinite(value)) return null;
    return Math.trunc(value);
  }

  private normalizeIdList(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return Array.from(
      new Set(
        value
          .map((entry) => this.normalizeNullableNumber(entry as number | null))
          .filter((entry): entry is number => entry !== null && entry > 0)
      )
    );
  }

  reinforcementMonsterOptions(): string[] {
    const names = this.items()
      .map((monster) => (monster.name || '').trim())
      .filter((name) => name.length > 0);

    const current = this.userMonsterForm.controls.reinforcementMonsterName.value.trim();
    if (current.length > 0) {
      names.push(current);
    }

    return Array.from(new Set(names));
  }
}
