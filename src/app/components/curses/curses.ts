import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { API_BASE_URL } from '../../api-config';
import { Account } from '../../services/account';
import { CurseService, UserCurseListItem, UserCurseWritePayload } from '../../services/curse';
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
  selector: 'app-curses',
  imports: [ReactiveFormsModule, UploadPopup],
  templateUrl: './curses.html',
  styleUrl: './curses.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Curses implements OnInit {
  private readonly account = inject(Account);
  private readonly curseService = inject(CurseService);

  readonly imageOptions = input<ImageOption[]>([]);
  readonly soundOptions = input<SoundOption[]>([]);

  private readonly _localImages = signal<ImageOption[]>([]);
  private readonly _localSounds = signal<SoundOption[]>([]);
  readonly allImageOptions = computed(() => [...this.imageOptions(), ...this._localImages()]);
  readonly allSoundOptions = computed(() => [...this.soundOptions(), ...this._localSounds()]);

  readonly effectToOptions = [
    'HP', 'Defense', 'Stamina', 'Mind', 'Sneak', 'Magic', 'Sight', 'Action Economy',
  ] as const;

  readonly isCurseSectionVisible = signal(true);
  readonly isSavingUserCurse = signal(false);
  readonly editingUserCurseId = signal<number | null>(null);
  readonly userCurseSaveMessage = signal<string | null>(null);

  readonly isLoading = this.curseService.isLoading;
  readonly error = this.curseService.error;
  readonly items = this.curseService.items;

  readonly userCurseForm = new FormGroup({
    name: new FormControl<string>('', { nonNullable: true }),
    description: new FormControl<string>('', { nonNullable: true }),
    effectTo: new FormControl<string>('HP', { nonNullable: true }),
    effectTo2: new FormControl<string | null>(null),
    damage: new FormControl<number>(0, { nonNullable: true }),
    damage2: new FormControl<number>(0, { nonNullable: true }),
    lastFor: new FormControl<number>(0, { nonNullable: true }),
    imageId: new FormControl<number | null>(null),
    soundId: new FormControl<number | null>(null),
    isPublic: new FormControl<boolean>(false, { nonNullable: true }),
  });

  ngOnInit(): void {
    const userkey = this.account.getKey();
    if (userkey) {
      this.curseService.loadCurses(userkey);
    }
  }

  isLoggedIn(): boolean {
    return this.account.isLoggedIn();
  }

  onImageUploaded(item: UploadedMediaItem): void {
    this._localImages.update((opts) => [...opts, item]);
    this.userCurseForm.controls.imageId.setValue(item.id);
  }

  onSoundUploaded(item: UploadedMediaItem): void {
    this._localSounds.update((opts) => [...opts, item]);
    this.userCurseForm.controls.soundId.setValue(item.id);
  }

  isAdminUser(): boolean {
    return this.account.isAdmin();
  }

  toggleSectionVisibility(): void {
    this.isCurseSectionVisible.update((v) => !v);
  }

  selectedImageOption(): ImageOption | null {
    const id = this.userCurseForm.controls.imageId.value;
    return id !== null ? (this.allImageOptions().find((i) => i.id === id) ?? null) : null;
  }

  selectedImageUrl(): string {
    const img = this.selectedImageOption();
    return img ? this.resolveImageUrl(img.path) : '';
  }

  selectedImageName(): string | null {
    return this.selectedImageOption()?.name ?? null;
  }

  beginCreate(clearMessage = true): void {
    this.editingUserCurseId.set(null);
    if (clearMessage) this.userCurseSaveMessage.set(null);
    this.resetForm();
  }

  editCurse(item: UserCurseListItem): void {
    this.editingUserCurseId.set(item.id);
    this.userCurseSaveMessage.set(null);
    this.userCurseForm.reset({
      name: item.name || '',
      description: item.description || '',
      effectTo: item.effectTo || 'HP',
      effectTo2: item.effectTo2 ?? null,
      damage: this.normalizeNumber(item.damage, 0),
      damage2: this.normalizeNumber(item.damage2, 0),
      lastFor: Math.max(0, this.normalizeNumber(item.lastFor, 0)),
      imageId: this.normalizeNullableNumber(item.imageId),
      soundId: this.normalizeNullableNumber(item.soundId),
      isPublic: item.isPublic,
    });
  }

  cancelEdit(): void {
    this.beginCreate();
  }

  save(): void {
    if (this.isSavingUserCurse()) return;

    const userkey = this.account.getKey();
    if (!userkey) {
      this.userCurseSaveMessage.set('Please log in to save curses.');
      return;
    }

    const payload = this.buildPayload();
    const editingId = this.editingUserCurseId();
    const request$ = editingId
      ? this.curseService.updateCurse(editingId, userkey, payload)
      : this.curseService.createCurse(userkey, payload);

    this.isSavingUserCurse.set(true);
    this.userCurseSaveMessage.set(null);

    request$
      .pipe(finalize(() => this.isSavingUserCurse.set(false)))
      .subscribe({
        next: (response) => {
          if (response.result !== 1 || !response.curse) {
            this.userCurseSaveMessage.set(response.error || 'Failed to save curse.');
            return;
          }
          this.curseService.loadCurses(this.account.getKey()!);
          this.userCurseSaveMessage.set(editingId ? 'Curse updated.' : 'Curse created.');
          this.beginCreate(false);
        },
        error: () => {
          this.userCurseSaveMessage.set('Failed to save curse.');
        },
      });
  }

  resolveImageUrl(path: string): string {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  private buildPayload(): UserCurseWritePayload {
    const c = this.userCurseForm.controls;
    const effectTo2Raw = c.effectTo2.value;
    const effectTo2 = typeof effectTo2Raw === 'string' && effectTo2Raw.trim() ? effectTo2Raw.trim() : null;
    return {
      name: (c.name.value || '').trim() || 'Unnamed Curse',
      description: (c.description.value || '').trim(),
      effectTo: (c.effectTo.value || 'HP').trim(),
      effectTo2,
      damage: this.normalizeNumber(c.damage.value, 0),
      damage2: this.normalizeNumber(c.damage2.value, 0),
      lastFor: Math.max(0, this.normalizeNumber(c.lastFor.value, 0)),
      imageId: this.normalizeNullableNumber(c.imageId.value),
      soundId: this.normalizeNullableNumber(c.soundId.value),
      isPublic: this.isAdminUser() ? c.isPublic.value === true : false,
    };
  }

  private resetForm(): void {
    this.userCurseForm.reset({
      name: '',
      description: '',
      effectTo: 'HP',
      effectTo2: null,
      damage: 0,
      damage2: 0,
      lastFor: 0,
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
