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
  readonly curseOptions = input<CurseOption[]>([]);

  readonly itemTypeOptions: ItemType[] = ['weapon', 'armor', 'pick', 'light', 'ring', 'necklace', 'gem', 'other'];
  readonly armorSlotOptions = [
    { value: 'shield', label: 'Shield' },
    { value: 'head', label: 'Head' },
    { value: 'body', label: 'Body' },
    { value: 'left-arm', label: 'Left Arm' },
    { value: 'right-arm', label: 'Right Arm' },
    { value: 'left-leg', label: 'Left Leg' },
    { value: 'right-leg', label: 'Right Leg' },
  ];
  readonly effectOnOptions = [
    { value: 'HP', label: 'HP (Max Health)' },
    { value: 'AC', label: 'AC (Armor Class)' },
    { value: 'MP', label: 'MP (Magic Power)' },
    { value: 'Mind', label: 'Mind' },
    { value: 'Stamina', label: 'Stamina' },
    { value: 'Strength', label: 'Strength' },
    { value: 'SP', label: 'SP (Skill Points)' },
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
    range: new FormControl<number>(0, { nonNullable: true }),
    value: new FormControl<number>(0, { nonNullable: true }),
    weight: new FormControl<number>(0, { nonNullable: true }),
    curseId: new FormControl<number | null>(null),
    effectValue: new FormControl<number>(0, { nonNullable: true }),
    damage: new FormControl<number>(6, { nonNullable: true }),
    imageId: new FormControl<number | null>(null),
    soundId: new FormControl<number | null>(null),
    isPublic: new FormControl<boolean>(false, { nonNullable: true }),
    isTwoHanded: new FormControl<boolean>(false, { nonNullable: true }),
  });

  effectValueLabel(): string {
    const type = this.userItemForm.controls.type.value;
    if (type === 'armor') return 'Effect Value (+AC)';
    if (type === 'light') return 'Effect Value (ROS)';
    if (type === 'weapon') return 'Effect Value (+Hit)';
    return 'Effect Value';
  }

  showEffectValue(): boolean {
    return this.userItemForm.controls.type.value !== 'gem';
  }

  showRange(): boolean {
    const type = this.userItemForm.controls.type.value;
    return type !== 'armor' && type !== 'ring' && type !== 'necklace' && type !== 'gem';
  }

  showDamage(): boolean {
    return this.userItemForm.controls.type.value === 'weapon';
  }

  showEffectOn(): boolean {
    const type = this.userItemForm.controls.type.value;
    return type === 'ring' || type === 'necklace';
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
    this.userItemForm.reset({
      name: item.name || '',
      description: item.description || '',
      type: item.type || 'other',
      armorSlot: item.armorSlot ?? null,
      effectOn: item.effectOn ?? null,
      range: Math.max(0, Math.trunc(Number(item.range)) || 0),
      value: Math.max(0, this.normalizeNumber(item.value, 0)),
      weight: Math.max(0, this.normalizeNumber(item.weight, 0)),
      curseId: this.normalizeNullableNumber(item.curseId),
      effectValue: this.normalizeNumber(item.effectValue, 0),
      damage: this.normalizeNumber(item.damage, 6),
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

  private buildPayload(): UserItemWritePayload {
    const c = this.userItemForm.controls;
    const type = c.type.value || 'other';
    const isAccessory = type === 'ring' || type === 'necklace';
    return {
      name: (c.name.value || '').trim() || 'Unnamed Item',
      description: (c.description.value || '').trim(),
      type,
      armorSlot: type === 'armor' ? (c.armorSlot.value || null) : null,
      effectOn: isAccessory ? (c.effectOn.value || null) : null,
      range: Math.max(0, this.normalizeNumber(c.range.value, 0)),
      value: Math.max(0, this.normalizeNumber(c.value.value, 0)),
      weight: Math.max(0, this.normalizeNumber(c.weight.value, 0)),
      curseId: this.normalizeNullableNumber(c.curseId.value),
      effectValue: this.normalizeNumber(c.effectValue.value, 0),
      damage: Math.max(0, this.normalizeNumber(c.damage.value, 6)),
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
      range: 0,
      value: 0,
      weight: 0,
      curseId: null,
      effectValue: 0,
      damage: 6,
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
}
