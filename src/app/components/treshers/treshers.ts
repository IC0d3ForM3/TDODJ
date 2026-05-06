import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { API_BASE_URL } from '../../api-config';
import { Account } from '../../services/account';
import { TresherService, UserTresherListItem, UserTresherWritePayload } from '../../services/tresher';
import { UploadPopup, UploadedMediaItem } from '../upload-popup/upload-popup';

interface ImageOption { id: number; name: string; path: string; }
interface SoundOption { id: number; name: string; path: string; }
interface ItemOption { id: number; name: string; }
interface SpellOption { id: number; name: string; }
interface CurseOption { id: number; name: string; }
interface PotionOption { id: number; name: string; }

@Component({
  selector: 'app-treshers',
  imports: [ReactiveFormsModule, UploadPopup],
  templateUrl: './treshers.html',
  styleUrl: './treshers.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Treshers implements OnInit {
  private readonly account = inject(Account);
  private readonly tresherService = inject(TresherService);

  readonly imageOptions = input<ImageOption[]>([]);
  readonly soundOptions = input<SoundOption[]>([]);

  private readonly _localImages = signal<ImageOption[]>([]);
  private readonly _localSounds = signal<SoundOption[]>([]);
  readonly allImageOptions = computed(() => [...this.imageOptions(), ...this._localImages()]);
  readonly allSoundOptions = computed(() => [...this.soundOptions(), ...this._localSounds()]);

  readonly itemOptions = input<ItemOption[]>([]);
  readonly spellOptions = input<SpellOption[]>([]);
  readonly curseOptions = input<CurseOption[]>([]);
  readonly potionOptions = input<PotionOption[]>([]);

  readonly isSectionVisible = signal(true);
  readonly isSaving = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly saveMessage = signal<string | null>(null);

  readonly tresherTypeOptions = ['OtherTresher', 'Weapon', 'Armor', 'Coins', 'Potion'] as const;

  readonly isLoading = this.tresherService.isLoading;
  readonly error = this.tresherService.error;
  readonly items = this.tresherService.items;

  readonly userTresherForm = new FormGroup({
    type: new FormControl<string>('OtherTresher', { nonNullable: true }),
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
    potion1Id: new FormControl<number | null>(null),
    potion2Id: new FormControl<number | null>(null),
    potion3Id: new FormControl<number | null>(null),
    imageId: new FormControl<number | null>(null),
    soundId: new FormControl<number | null>(null),
    spReward: new FormControl<number>(0, { nonNullable: true }),
    isPublic: new FormControl<boolean>(false, { nonNullable: true }),
    isquest: new FormControl<boolean>(false, { nonNullable: true }),
  });

  ngOnInit(): void {
    const userkey = this.account.getKey();
    if (userkey) {
      this.tresherService.loadTreshers(userkey);
    }
  }

  isLoggedIn(): boolean {
    return this.account.isLoggedIn();
  }

  onImageUploaded(item: UploadedMediaItem): void {
    this._localImages.update((opts) => [...opts, item]);
    this.userTresherForm.controls.imageId.setValue(item.id);
  }

  onSoundUploaded(item: UploadedMediaItem): void {
    this._localSounds.update((opts) => [...opts, item]);
    this.userTresherForm.controls.soundId.setValue(item.id);
  }

  isAdminUser(): boolean {
    return this.account.isAdmin();
  }

  toggleSectionVisibility(): void {
    this.isSectionVisible.update((v) => !v);
  }

  selectedImage(): ImageOption | null {
    const id = this.userTresherForm.controls.imageId.value;
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
    const id = this.userTresherForm.controls.soundId.value;
    return id !== null ? (this.allSoundOptions().find((s) => s.id === id) ?? null) : null;
  }

  selectedSoundUrl(): string {
    const sound = this.selectedSound();
    return sound ? this.resolveSoundUrl(sound.path) : '';
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
    this.editingId.set(null);
    if (clearMessage) this.saveMessage.set(null);
    this.resetForm();
  }

  editTresher(item: UserTresherListItem): void {
    this.editingId.set(item.id);
    this.saveMessage.set(null);
    this.userTresherForm.reset({
      type: item.type || 'OtherTresher',
      name: item.name || '',
      description: item.description || '',
      gold: this.normalizeNumber(item.gold, 0),
      silver: this.normalizeNumber(item.silver, 0),
      copper: this.normalizeNumber(item.copper, 0),
      zinc: this.normalizeNumber(item.zinc, 0),
      item1Id: this.normalizeNullableNumber(item.item1Id),
      item2Id: this.normalizeNullableNumber(item.item2Id),
      item3Id: this.normalizeNullableNumber(item.item3Id),
      item4Id: this.normalizeNullableNumber(item.item4Id),
      spell1Id: this.normalizeNullableNumber(item.spell1Id),
      spell2Id: this.normalizeNullableNumber(item.spell2Id),
      spell3Id: this.normalizeNullableNumber(item.spell3Id),
      spell4Id: this.normalizeNullableNumber(item.spell4Id),
      curse1Id: this.normalizeNullableNumber(item.curse1Id),
      curse2Id: this.normalizeNullableNumber(item.curse2Id),
      potion1Id: this.normalizeNullableNumber(item.potion1Id),
      potion2Id: this.normalizeNullableNumber(item.potion2Id),
      potion3Id: this.normalizeNullableNumber(item.potion3Id),
      isPublic: item.isPublic,
      isquest: item.isquest ?? false,
      imageId: this.normalizeNullableNumber(item.imageId),
      soundId: this.normalizeNullableNumber(item.soundId),
      spReward: this.normalizeNumber(item.spReward, 0),
    });
  }

  cancelEdit(): void {
    this.beginCreate();
  }

  save(): void {
    if (this.isSaving()) return;

    const userkey = this.account.getKey();
    if (!userkey) {
      this.saveMessage.set('Please log in to save treshers.');
      return;
    }

    const payload = this.buildPayload();
    const editingId = this.editingId();
    const request$ = editingId
      ? this.tresherService.updateTresher(editingId, userkey, payload)
      : this.tresherService.createTresher(userkey, payload);

    this.isSaving.set(true);
    this.saveMessage.set(null);

    request$
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (response) => {
          if (response.result !== 1 || !response.tresher) {
            this.saveMessage.set(response.error || 'Failed to save tresher.');
            return;
          }
          this.tresherService.loadTreshers(this.account.getKey()!);
          this.saveMessage.set(editingId ? 'Tresher updated.' : 'Tresher created.');
          this.beginCreate(false);
        },
        error: () => {
          this.saveMessage.set('Failed to save tresher.');
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

  private buildPayload(): UserTresherWritePayload {
    const v = this.userTresherForm.getRawValue();
    return {
      type: v.type || 'OtherTresher',
      name: (v.name || '').trim() || 'Unnamed Tresher',
      description: (v.description || '').trim(),
      gold: Math.max(0, this.normalizeNumber(v.gold, 0)),
      silver: Math.max(0, this.normalizeNumber(v.silver, 0)),
      copper: Math.max(0, this.normalizeNumber(v.copper, 0)),
      zinc: Math.max(0, this.normalizeNumber(v.zinc, 0)),
      item1Id: this.normalizeNullableNumber(v.item1Id),
      item2Id: this.normalizeNullableNumber(v.item2Id),
      item3Id: this.normalizeNullableNumber(v.item3Id),
      item4Id: this.normalizeNullableNumber(v.item4Id),
      spell1Id: this.normalizeNullableNumber(v.spell1Id),
      spell2Id: this.normalizeNullableNumber(v.spell2Id),
      spell3Id: this.normalizeNullableNumber(v.spell3Id),
      spell4Id: this.normalizeNullableNumber(v.spell4Id),
      curse1Id: this.normalizeNullableNumber(v.curse1Id),
      curse2Id: this.normalizeNullableNumber(v.curse2Id),
      isPublic: this.isAdminUser() ? v.isPublic === true : false,
      isquest: this.isAdminUser() ? v.isquest === true : false,
      imageId: this.normalizeNullableNumber(v.imageId),
      soundId: this.normalizeNullableNumber(v.soundId),
      spReward: Math.max(0, this.normalizeNumber(v.spReward, 0)),
      potion1Id: this.normalizeNullableNumber(v.potion1Id),
      potion2Id: this.normalizeNullableNumber(v.potion2Id),
      potion3Id: this.normalizeNullableNumber(v.potion3Id),
    };
  }

  private resetForm(): void {
    this.userTresherForm.reset({
      type: 'OtherTresher',
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
      potion1Id: null,
      potion2Id: null,
      potion3Id: null,
      isPublic: false,
      isquest: false,
      imageId: null,
      soundId: null,
      spReward: 0,
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
