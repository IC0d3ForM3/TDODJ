import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { API_BASE_URL } from '../../api-config';
import { Account } from '../../services/account';
import { ItemService, ItemType, UserItemListItem, UserItemWritePayload } from '../../services/item';
import { UploadPopup, UploadedMediaItem } from '../upload-popup/upload-popup';

interface ImageOption {
  id: number;
  name: string;
  path: string;
}

interface SoundOption {
  id: number;
  name: string;
  path: string;
}

interface CurseOption {
  id: number;
  name: string;
}

@Component({
  selector: 'app-items',
  imports: [ReactiveFormsModule, UploadPopup],
  templateUrl: './items.html',
  styleUrl: './items.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Items implements OnInit {
  private readonly account = inject(Account);
  private readonly itemService = inject(ItemService);

  readonly imageOptions = input<ImageOption[]>([]);
  readonly soundOptions = input<SoundOption[]>([]);

  private readonly _localImages = signal<ImageOption[]>([]);
  private readonly _localSounds = signal<SoundOption[]>([]);
  readonly allImageOptions = computed(() => [...this.imageOptions(), ...this._localImages()]);
  readonly allSoundOptions = computed(() => [...this.soundOptions(), ...this._localSounds()]);
  readonly groupedImageOptions = computed(() => this.groupMediaOptions(this.allImageOptions()));
  readonly groupedSoundOptions = computed(() => this.groupMediaOptions(this.allSoundOptions()));
  readonly curseOptions = input<CurseOption[]>([]);

  readonly itemTypeOptions: Array<{ value: ItemType; label: string }> = [
    { value: 'weapon', label: 'Weapon' },
    { value: 'armor', label: 'Armor' },
    { value: 'pick', label: 'Pick' },
    { value: 'ring', label: 'Ring (4 Equipped)' },
    { value: 'necklace', label: 'Necklace (1 Equipped)' },
    { value: 'gem', label: 'Gem' },
    { value: 'other', label: 'Other' },
  ];
  readonly armorSlotOptions = [
    { value: 'shield', label: 'Shield' },
    { value: 'head', label: 'Head' },
    { value: 'body', label: 'Body' },
    { value: 'left-arm', label: 'Left Arm' },
    { value: 'right-arm', label: 'Right Arm' },
    { value: 'left-leg', label: 'Left Leg' },
    { value: 'right-leg', label: 'Right Leg' },
  ];
  readonly effectOnAccessoryOptions = [
    { value: 'HP', label: 'HP (Max Health)' },
    { value: 'AC', label: 'AC (Armor Class)' },
    { value: 'MP', label: 'MP (Magic Power)' },
    { value: 'Mind', label: 'Mind' },
    { value: 'Stamina', label: 'Stamina' },
    { value: 'Strength', label: 'Strength' },
    { value: 'SP', label: 'SP (Skill Points)' },
    { value: 'AE', label: 'AE (Action Economy)' },
    { value: 'NOA', label: '# of Attacks' },
    { value: 'ROS', label: 'ROS (Range of Sight)' },
  ];
  readonly effectOnOtherOptions = [
    { value: 'HP', label: 'HP' },
    { value: 'AC', label: 'AC' },
    { value: 'MP', label: 'MP' },
    { value: 'Mind', label: 'Mind' },
    { value: 'Stamina', label: 'Stamina' },
    { value: 'Strength', label: 'Strength' },
    { value: 'SP', label: 'SP' },
    { value: 'AE', label: 'AE (Action Economy)' },
    { value: 'NOA', label: '# of Attacks' },
    { value: 'ROS', label: 'ROS (Range of Sight)' },
    { value: 'Door Trap', label: 'Door Trap' },
    { value: 'To Pick', label: 'To Pick' },
    { value: 'Placed Trap', label: 'Placed Trap' },
  ];
  readonly effectToPcOptions = [
    { value: 'HP', label: 'HP' },
    { value: 'Mind', label: 'Mind' },
    { value: 'Magic', label: 'Magic' },
    { value: 'Stamina', label: 'Stamina' },
    { value: 'Strength', label: 'Strength' },
    { value: 'AC', label: 'AC' },
    { value: 'AE', label: 'AE (Action Economy)' },
    { value: 'NOA', label: '# of Attacks' },
    { value: 'ROS', label: 'ROS (Range of Sight)' },
  ];
  readonly weaponEffectTypeOptions = ['Blood', 'Lightning', 'Fire', 'Cold'] as const;
  readonly equippedAsOptions = [
    { value: 'none', label: 'None' },
    { value: 'hand', label: 'Hand' },
    { value: 'shield', label: 'Shield' },
    { value: 'head', label: 'Head' },
    { value: 'body', label: 'Body' },
    { value: 'left-arm', label: 'Left Arm' },
    { value: 'right-arm', label: 'Right Arm' },
    { value: 'left-leg', label: 'Left Leg' },
    { value: 'right-leg', label: 'Right Leg' },
  ];

  readonly isItemSectionVisible = signal(true);
  readonly isSavingUserItem = signal(false);
  readonly editingUserItemId = signal<number | null>(null);
  readonly userItemSaveMessage = signal<string | null>(null);

  readonly isLoading = this.itemService.isLoading;
  readonly error = this.itemService.error;
  readonly items = this.itemService.items;

  readonly userItemForm = new FormGroup({
    name: new FormControl<string>('', { nonNullable: true }),
    description: new FormControl<string>('', { nonNullable: true }),
    type: new FormControl<ItemType>('other', { nonNullable: true }),
    armorSlot: new FormControl<string | null>(null),
    effectOn: new FormControl<string | null>(null),
    effectToPc: new FormControl<string | null>(null),
    effectToPcValue: new FormControl<number>(0, { nonNullable: true }),
    range: new FormControl<number>(0, { nonNullable: true }),
    value: new FormControl<number>(0, { nonNullable: true }),
    weight: new FormControl<number>(0, { nonNullable: true }),
    curseId: new FormControl<number | null>(null),
    effectValue: new FormControl<number>(0, { nonNullable: true }),
    damage: new FormControl<number>(6, { nonNullable: true }),
    weaponEffectType: new FormControl<string>('Blood', { nonNullable: true }),
    weaponEffectColor: new FormControl<string>('#cc0000', { nonNullable: true }),
    imageId: new FormControl<number | null>(null),
    soundId: new FormControl<number | null>(null),
    isPublic: new FormControl<boolean>(false, { nonNullable: true }),
    isTwoHanded: new FormControl<boolean>(false, { nonNullable: true }),
  });

  effectValueLabel(): string {
    const type = this.userItemForm.controls.type.value;
    if (type === 'armor') return 'Effect Value (+AC)';
    if (type === 'weapon') return 'Effect Value (+Hit)';
    if (type === 'pick') return 'Effect Value (+Disarm / +Pick)';
    return 'Effect Value';
  }

  showEffectValue(): boolean {
    return this.userItemForm.controls.type.value !== 'gem';
  }

  showRange(): boolean {
    const type = this.userItemForm.controls.type.value;
    return type !== 'armor' && type !== 'ring' && type !== 'necklace' && type !== 'neckless' && type !== 'gem';
  }

  showDamage(): boolean {
    const type = this.userItemForm.controls.type.value;
    return type === 'weapon' || type === 'other';
  }

  showEffectOn(): boolean {
    const type = this.userItemForm.controls.type.value;
    return type === 'ring' || type === 'necklace' || type === 'neckless' || type === 'other';
  }

  showEffectToPc(): boolean {
    const type = this.userItemForm.controls.type.value;
    return type === 'weapon' || type === 'armor' || type === 'ring' || type === 'necklace' || type === 'neckless' || type === 'other';
  }

  showEquippedAs(): boolean {
    return this.userItemForm.controls.type.value === 'other';
  }

  itemTypeLabel(type: string | null | undefined): string {
    if (!type) return 'Other';
    if (type === 'neckless' || type === 'amulet') return 'Necklace (1 Equipped)';
    const match = this.itemTypeOptions.find((opt) => opt.value === type);
    if (match) return match.label;
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  onTypeChange(): void {
    const type = this.userItemForm.controls.type.value;
    if (type === 'pick') {
      this.userItemForm.controls.range.setValue(1);
    }
    if (type !== 'weapon') {
      this.userItemForm.controls.isTwoHanded.setValue(false);
    }
  }

  ngOnInit(): void {
    const userkey = this.account.getKey();
    if (userkey) {
      this.itemService.loadItems(userkey);
    }
  }

  isLoggedIn(): boolean {
    return this.account.isLoggedIn();
  }

  onImageUploaded(item: UploadedMediaItem): void {
    this._localImages.update((opts) => [...opts, item]);
    this.userItemForm.controls.imageId.setValue(item.id);
  }

  onSoundUploaded(item: UploadedMediaItem): void {
    this._localSounds.update((opts) => [...opts, item]);
    this.userItemForm.controls.soundId.setValue(item.id);
  }

  isAdminUser(): boolean {
    return this.account.isAdmin();
  }

  toggleSectionVisibility(): void {
    this.isItemSectionVisible.update((v) => !v);
  }

  selectedImageOption(): ImageOption | null {
    const id = this.userItemForm.controls.imageId.value;
    return id !== null ? (this.allImageOptions().find((i) => i.id === id) ?? null) : null;
  }

  selectedImageUrl(): string {
    const img = this.selectedImageOption();
    return img ? this.resolveImageUrl(img.path) : '';
  }

  selectedImageName(): string | null {
    return this.selectedImageOption()?.name ?? null;
  }

  selectedSoundOption(): SoundOption | null {
    const id = this.userItemForm.controls.soundId.value;
    return id !== null ? (this.allSoundOptions().find((s) => s.id === id) ?? null) : null;
  }

  selectedSoundUrl(): string {
    const sound = this.selectedSoundOption();
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

  curseNameForItem(curseId: number | null): string | null {
    if (curseId === null) return null;
    return this.curseOptions().find((c) => c.id === curseId)?.name ?? null;
  }

  beginCreate(clearMessage = true): void {
    this.editingUserItemId.set(null);
    if (clearMessage) this.userItemSaveMessage.set(null);
    this.resetForm();
  }

  editItem(item: UserItemListItem): void {
    this.editingUserItemId.set(item.id);
    this.userItemSaveMessage.set(null);
    const formType = this.normalizeItemTypeForForm(item.type);
    this.userItemForm.reset({
      name: item.name || '',
      description: item.description || '',
      type: formType,
      armorSlot: item.armorSlot ?? null,
      effectOn: item.effectOn ?? null,
      effectToPc: item.effectToPc ?? null,
      effectToPcValue: this.normalizeNumber(item.effectToPcValue, 0),
      range: Math.max(0, Math.trunc(Number(item.range)) || 0),
      value: Math.max(0, this.normalizeNumber(item.value, 0)),
      weight: Math.max(0, this.normalizeNumber(item.weight, 0)),
      curseId: this.normalizeNullableNumber(item.curseId),
      effectValue: this.normalizeNumber(item.effectValue, 0),
      damage: this.normalizeNumber(item.damage, 6),
      weaponEffectType: item.weaponEffectType || 'Blood',
      weaponEffectColor: item.weaponEffectColor || '#cc0000',
      imageId: this.normalizeNullableNumber(item.imageId),
      soundId: this.normalizeNullableNumber(item.soundId),
      isPublic: item.isPublic,
      isTwoHanded: item.isTwoHanded,
    });
  }

  cancelEdit(): void {
    this.beginCreate();
  }

  save(): void {
    if (this.isSavingUserItem()) return;

    const userkey = this.account.getKey();
    if (!userkey) {
      this.userItemSaveMessage.set('Please log in to save items.');
      return;
    }

    const payload = this.buildPayload();
    const editingId = this.editingUserItemId();
    const request$ = editingId
      ? this.itemService.updateItem(editingId, userkey, payload)
      : this.itemService.createItem(userkey, payload);

    this.isSavingUserItem.set(true);
    this.userItemSaveMessage.set(null);

    request$
      .pipe(finalize(() => this.isSavingUserItem.set(false)))
      .subscribe({
        next: (response) => {
          if (response.result !== 1 || !response.item) {
            this.userItemSaveMessage.set(response.error || 'Failed to save item.');
            return;
          }
          this.itemService.loadItems(this.account.getKey()!);
          this.userItemSaveMessage.set(editingId ? 'Item updated.' : 'Item created.');
          this.beginCreate(false);
        },
        error: () => {
          this.userItemSaveMessage.set('Failed to save item.');
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

  private buildPayload(): UserItemWritePayload {
    const c = this.userItemForm.controls;
    const type = this.normalizeItemTypeForForm(c.type.value || 'other');
    const payloadType: ItemType = type;
    const isAccessory = type === 'ring' || type === 'necklace' || type === 'neckless';
    const canApplyPcEffect = type === 'weapon' || type === 'armor' || isAccessory || type === 'other';
    const supportsEffectOn = isAccessory || type === 'other';
    const supportsEffectVisuals = type === 'weapon' || type === 'other';
    const normalizedRange = type === 'pick'
      ? 1
      : Math.max(0, this.normalizeNumber(c.range.value, 0));
    return {
      name: (c.name.value || '').trim() || 'Unnamed Item',
      description: (c.description.value || '').trim(),
      type: payloadType,
      armorSlot: type === 'armor' || type === 'other' ? (c.armorSlot.value || null) : null,
      effectOn: supportsEffectOn ? (c.effectOn.value || null) : null,
      effectToPc: canApplyPcEffect ? (c.effectToPc.value || null) : null,
      effectToPcValue: canApplyPcEffect ? this.normalizeNumber(c.effectToPcValue.value, 0) : 0,
      range: normalizedRange,
      value: Math.max(0, this.normalizeNumber(c.value.value, 0)),
      weight: Math.max(0, this.normalizeNumber(c.weight.value, 0)),
      curseId: this.normalizeNullableNumber(c.curseId.value),
      effectValue: this.normalizeNumber(c.effectValue.value, 0),
      damage: Math.max(0, this.normalizeNumber(c.damage.value, 6)),
      weaponEffectType: supportsEffectVisuals ? (c.weaponEffectType.value || 'Blood') : 'Blood',
      weaponEffectColor: supportsEffectVisuals ? (c.weaponEffectColor.value || '#cc0000') : '#cc0000',
      imageId: this.normalizeNullableNumber(c.imageId.value),
      soundId: this.normalizeNullableNumber(c.soundId.value),
      isPublic: this.isAdminUser() ? c.isPublic.value === true : false,
      isTwoHanded: type === 'weapon' ? c.isTwoHanded.value === true : false,
    };
  }

  private resetForm(): void {
    this.userItemForm.reset({
      name: '',
      description: '',
      type: 'other',
      armorSlot: null,
      effectOn: null,
      effectToPc: null,
      effectToPcValue: 0,
      range: 0,
      value: 0,
      weight: 0,
      curseId: null,
      effectValue: 0,
      damage: 6,
      weaponEffectType: 'Blood',
      weaponEffectColor: '#cc0000',
      imageId: null,
      soundId: null,
      isPublic: false,
      isTwoHanded: false,
    });
  }

  private normalizeNumber(value: number | null, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.trunc(value);
  }

  private normalizeNullableNumber(value: number | null): number | null {
    if (value === null || typeof value !== 'number' || !Number.isFinite(value)) return null;
    return Math.trunc(value);
  }

  private normalizeItemTypeForForm(type: string | null | undefined): ItemType {
    const normalized = (type ?? '').trim().toLowerCase();
    if (normalized === 'neckless' || normalized === 'amulet') {
      return 'necklace';
    }
    if (
      normalized === 'weapon' ||
      normalized === 'armor' ||
      normalized === 'pick' ||
      normalized === 'ring' ||
      normalized === 'necklace' ||
      normalized === 'gem' ||
      normalized === 'other'
    ) {
      return normalized;
    }
    return 'other';
  }
}
