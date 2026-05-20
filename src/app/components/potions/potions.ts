import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { API_BASE_URL } from '../../api-config';
import { Account } from '../../services/account';
import { PotionService, UserPotionListItem, UserPotionWritePayload } from '../../services/potion';
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

@Component({
  selector: 'app-potions',
  imports: [ReactiveFormsModule, UploadPopup],
  templateUrl: './potions.html',
  styleUrl: './potions.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Potions implements OnInit {
  private readonly account = inject(Account);
  private readonly potionService = inject(PotionService);

  readonly imageOptions = input<ImageOption[]>([]);
  readonly soundOptions = input<SoundOption[]>([]);

  private readonly _localImages = signal<ImageOption[]>([]);
  private readonly _localSounds = signal<SoundOption[]>([]);
  readonly allImageOptions = computed(() => [...this.imageOptions(), ...this._localImages()]);
  readonly allSoundOptions = computed(() => [...this.soundOptions(), ...this._localSounds()]);
  readonly groupedImageOptions = computed(() => this.groupMediaOptions(this.allImageOptions()));
  readonly groupedSoundOptions = computed(() => this.groupMediaOptions(this.allSoundOptions()));

  readonly effectToOptions = [
    'HP', 'AC', 'Stamina', 'Mind', '# of Attacks', '# of attacks #OA', 'Magic', 'Sight', 'ROS', 'AE', 'Action Economy',
  ] as const;

  readonly isPotionSectionVisible = signal(true);
  readonly isSavingUserPotion = signal(false);
  readonly editingUserPotionId = signal<number | null>(null);
  readonly userPotionSaveMessage = signal<string | null>(null);
  readonly filterQuery = signal('');
  readonly filteredItems = computed(() => {
    const q = this.filterQuery().toLowerCase().trim();
    return q ? this.items().filter(i => i.name.toLowerCase().includes(q)) : this.items();
  });

  readonly isLoading = this.potionService.isLoading;
  readonly error = this.potionService.error;
  readonly items = this.potionService.items;

  readonly userPotionForm = new FormGroup({
    name: new FormControl<string>('', { nonNullable: true }),
    description: new FormControl<string>('', { nonNullable: true }),
    effectTo: new FormControl<string>('HP', { nonNullable: true }),
    effectTo2: new FormControl<string | null>(null),
    lastFor: new FormControl<number>(0, { nonNullable: true }),
    effectAmount: new FormControl<number>(0, { nonNullable: true }),
    effectAmount2: new FormControl<number>(0, { nonNullable: true }),
    value: new FormControl<number>(0, { nonNullable: true }),
    imageId: new FormControl<number | null>(null),
    soundId: new FormControl<number | null>(null),
    isPublic: new FormControl<boolean>(false, { nonNullable: true }),
  });

  ngOnInit(): void {
    const userkey = this.account.getKey();
    if (userkey) {
      this.potionService.loadPotions(userkey);
    }
  }

  isLoggedIn(): boolean {
    return this.account.isLoggedIn();
  }

  onImageUploaded(item: UploadedMediaItem): void {
    this._localImages.update((opts) => [...opts, item]);
    this.userPotionForm.controls.imageId.setValue(item.id);
  }

  onSoundUploaded(item: UploadedMediaItem): void {
    this._localSounds.update((opts) => [...opts, item]);
    this.userPotionForm.controls.soundId.setValue(item.id);
  }

  isAdminUser(): boolean {
    return this.account.isAdmin();
  }

  toggleSectionVisibility(): void {
    this.isPotionSectionVisible.update((v) => !v);
  }

  selectedImageOption(): ImageOption | null {
    const id = this.userPotionForm.controls.imageId.value;
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
    const id = this.userPotionForm.controls.soundId.value;
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

  beginCreate(clearMessage = true): void {
    this.editingUserPotionId.set(null);
    if (clearMessage) this.userPotionSaveMessage.set(null);
    this.resetForm();
  }

  editPotion(item: UserPotionListItem): void {
    this.editingUserPotionId.set(item.id);
    this.userPotionSaveMessage.set(null);
    this.userPotionForm.reset({
      name: item.name || '',
      description: item.description || '',
      effectTo: item.effectTo || 'HP',
      effectTo2: item.effectTo2 ?? null,
      lastFor: Math.max(0, this.normalizeNumber(item.lastFor, 0)),
      effectAmount: this.normalizeNumber(item.effectAmount, 0),
      effectAmount2: this.normalizeNumber(item.effectAmount2, 0),
      value: Math.max(0, this.normalizeNumber(item.value, 0)),
      imageId: this.normalizeNullableNumber(item.imageId),
      soundId: this.normalizeNullableNumber(item.soundId),
      isPublic: item.isPublic,
    });
  }

  cancelEdit(): void {
    this.beginCreate();
  }

  save(): void {
    if (this.isSavingUserPotion()) return;

    const userkey = this.account.getKey();
    if (!userkey) {
      this.userPotionSaveMessage.set('Please log in to save potions.');
      return;
    }

    const payload = this.buildPayload();
    const editingId = this.editingUserPotionId();
    const request$ = editingId
      ? this.potionService.updatePotion(editingId, userkey, payload)
      : this.potionService.createPotion(userkey, payload);

    this.isSavingUserPotion.set(true);
    this.userPotionSaveMessage.set(null);

    request$
      .pipe(finalize(() => this.isSavingUserPotion.set(false)))
      .subscribe({
        next: (response) => {
          if (response.result !== 1 || !response.potion) {
            this.userPotionSaveMessage.set(response.error || 'Failed to save potion.');
            return;
          }
          this.potionService.loadPotions(this.account.getKey()!);
          this.userPotionSaveMessage.set(editingId ? 'Potion updated.' : 'Potion created.');
          this.beginCreate(false);
        },
        error: () => {
          this.userPotionSaveMessage.set('Failed to save potion.');
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

  private buildPayload(): UserPotionWritePayload {
    const c = this.userPotionForm.controls;
    const effectTo2Raw = c.effectTo2.value;
    const effectTo2 = typeof effectTo2Raw === 'string' && effectTo2Raw.trim() ? effectTo2Raw.trim() : null;
    return {
      name: (c.name.value || '').trim() || 'Unnamed Potion',
      description: (c.description.value || '').trim(),
      effectTo: (c.effectTo.value || 'HP').trim(),
      effectTo2,
      lastFor: Math.max(0, this.normalizeNumber(c.lastFor.value, 0)),
      effectAmount: this.normalizeNumber(c.effectAmount.value, 0),
      effectAmount2: this.normalizeNumber(c.effectAmount2.value, 0),
      value: Math.max(0, this.normalizeNumber(c.value.value, 0)),
      imageId: this.normalizeNullableNumber(c.imageId.value),
      soundId: this.normalizeNullableNumber(c.soundId.value),
      isPublic: this.isAdminUser() ? c.isPublic.value === true : false,
    };
  }

  private resetForm(): void {
    this.userPotionForm.reset({
      name: '',
      description: '',
      effectTo: 'HP',
      effectTo2: null,
      lastFor: 0,
      effectAmount: 0,
      effectAmount2: 0,
      value: 0,
      imageId: null,
      soundId: null,
      isPublic: false,
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
