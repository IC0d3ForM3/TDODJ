import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Account } from './account';
import { DungeonStateService } from './dungeon-state';
import { GameInventoryService } from './game-inventory';
import { API_BASE_URL } from '../api-config';

interface ImageRecordPayload {
  id: number;
  path: string;
}

@Injectable({ providedIn: 'root' })
export class GameDrawingAssetsService {
  private readonly http = inject(HttpClient);
  private readonly account = inject(Account);
  private readonly dungeonState = inject(DungeonStateService);
  private readonly inventoryService = inject(GameInventoryService);

  readonly monsterImageCache = new Map<number, HTMLImageElement>();
  readonly monsterImageCacheVersion = signal(0);
  readonly obstacleImageCache = new Map<number, HTMLImageElement>();
  readonly obstacleImageCacheVersion = signal(0);
  readonly lootImageCache = new Map<number, HTMLImageElement>();
  readonly lootImageCacheVersion = signal(0);
  readonly doorImageCache = new Map<string, HTMLImageElement>();

  private drawPreviewCallback: (() => void) | null = null;
  private drawFirstPersonCallback: (() => void) | null = null;

  setRedrawCallbacks(drawPreview: () => void, drawFirstPerson: () => void): void {
    this.drawPreviewCallback = drawPreview;
    this.drawFirstPersonCallback = drawFirstPerson;
  }

  loadDoorImages(): void {
    for (const key of ['open', 'closed'] as const) {
      if (this.doorImageCache.has(key)) continue;
      const img = new Image();
      img.onload = () => {
        this.doorImageCache.set(key, img);
        this.drawFirstPersonCallback?.();
      };
      img.src = key === 'open' ? '/images/dooropen.jpg' : '/images/doorclosed.jpg';
    }
  }

  loadMonsterImages(dungonId: number): void {
    const monsters = this.dungeonState.monsterListByDungon()[dungonId] ?? [];
    const imageIds = new Set<number>();
    for (const monster of monsters) {
      if (monster.imageId !== null && !this.monsterImageCache.has(monster.imageId)) {
        imageIds.add(monster.imageId);
      }
    }

    if (monsters.some((m) => m.id === -666) && !this.monsterImageCache.has(-666)) {
      const doxImg = new Image();
      doxImg.onload = () => {
        this.monsterImageCache.set(-666, doxImg);
        this.monsterImageCacheVersion.update((v) => v + 1);
        this.drawPreviewCallback?.();
        this.drawFirstPersonCallback?.();
      };
      doxImg.src = '/images/Doxs.png';
    }

    if (imageIds.size === 0) {
      return;
    }

    const userKey = this.account.getKey();

    if (!userKey) {
      this.http
        .get<{ id: number; path: string }[]>(`${API_BASE_URL}/images/by-ids`, {
          params: { ids: Array.from(imageIds).join(',') },
        })
        .subscribe({
          next: (images) => {
            for (const image of images) {
              if (!imageIds.has(image.id) || !image.path) {
                continue;
              }
              const url = this.resolveImageUrl(image.path);
              if (!url) {
                continue;
              }
              const img = new Image();
              img.onload = () => {
                this.monsterImageCache.set(image.id, img);
                this.monsterImageCacheVersion.update((v) => v + 1);
                this.drawFirstPersonCallback?.();
              };
              img.src = url;
            }
          },
        });
      return;
    }

    this.http
      .get<ImageRecordPayload[]>(`${API_BASE_URL}/images`, {
        params: { userkey: userKey, scope: 'library' },
      })
      .subscribe({
        next: (images) => {
          for (const image of images) {
            if (!imageIds.has(image.id) || !image.path) {
              continue;
            }

            const url = this.resolveImageUrl(image.path);
            if (!url) {
              continue;
            }

            const img = new Image();
            img.onload = () => {
              this.monsterImageCache.set(image.id, img);
              this.monsterImageCacheVersion.update((v) => v + 1);
              this.drawFirstPersonCallback?.();
            };
            img.src = url;
          }
        },
      });
  }

  loadObstacleImages(dungonId: number): void {
    const placements = this.dungeonState.obstaclePlacementsByDungon()[dungonId] ?? [];
    const imageIds = new Set<number>();
    for (const p of placements) {
      if (p.imageId !== null && !this.obstacleImageCache.has(p.imageId)) {
        imageIds.add(p.imageId);
      }
      if (p.textImageId !== null && p.textImageId !== undefined && !this.obstacleImageCache.has(p.textImageId)) {
        imageIds.add(p.textImageId);
      }
    }
    if (imageIds.size === 0) return;
    const userKey = this.account.getKey();
    if (!userKey) {
      this.http
        .get<{ id: number; path: string }[]>(`${API_BASE_URL}/images/by-ids`, {
          params: { ids: Array.from(imageIds).join(',') },
        })
        .subscribe({
          next: (images) => {
            for (const image of images) {
              if (!imageIds.has(image.id) || !image.path) continue;
              const url = this.resolveImageUrl(image.path);
              if (!url) continue;
              const img = new Image();
              img.onload = () => {
                this.obstacleImageCache.set(image.id, img);
                this.obstacleImageCacheVersion.update((v) => v + 1);
              };
              img.src = url;
            }
          },
        });
      return;
    }
    this.http
      .get<ImageRecordPayload[]>(`${API_BASE_URL}/images`, {
        params: { userkey: userKey, scope: 'library' },
      })
      .subscribe({
        next: (images) => {
          for (const image of images) {
            if (!imageIds.has(image.id) || !image.path) continue;
            const url = this.resolveImageUrl(image.path);
            if (!url) continue;
            const img = new Image();
            img.onload = () => {
              this.obstacleImageCache.set(image.id, img);
              this.obstacleImageCacheVersion.update((v) => v + 1);
            };
            img.src = url;
          }
        },
      });
  }

  loadLootImages(dungonId: number): void {
    const userPersonalImageIds = new Set<number>();
    const dungeonLootImageIds = new Set<number>();

    // Store treshers and floor items separately (these are dungeon loot, not user personal)
    for (const tresher of this.dungeonState.tresherListByDungon()[dungonId] ?? []) {
      if (typeof tresher.imageId === 'number' && tresher.imageId > 0 && !this.lootImageCache.has(tresher.imageId)) {
        dungeonLootImageIds.add(tresher.imageId);
      }
    }

    for (const item of this.inventoryService.floorItemListByDungon()[dungonId] ?? []) {
      const imageId = (item as { imageId?: number | null }).imageId;
      if (typeof imageId === 'number' && imageId > 0 && !this.lootImageCache.has(imageId)) {
        dungeonLootImageIds.add(imageId);
      }
    }

    // User personal items come from their tresher collection
    for (const item of this.inventoryService.pcTresherItemsById().values()) {
      const imageId = (item as { imageId?: number | null }).imageId;
      if (typeof imageId === 'number' && imageId > 0 && !this.lootImageCache.has(imageId)) {
        userPersonalImageIds.add(imageId);
      }
    }

    const onImageLoaded = (id: number, path: string): void => {
      if ((!userPersonalImageIds.has(id) && !dungeonLootImageIds.has(id)) || !path) {
        return;
      }

      const url = this.resolveImageUrl(path);
      if (!url) {
        return;
      }

      const img = new Image();
      img.onload = () => {
        this.lootImageCache.set(id, img);
        this.lootImageCacheVersion.update((v) => v + 1);
        this.drawFirstPersonCallback?.();
      };
      img.src = url;
    };

    // Always fetch dungeon loot images from public endpoint
    if (dungeonLootImageIds.size > 0) {
      this.http
        .get<{ id: number; path: string }[]>(`${API_BASE_URL}/images/by-ids`, {
          params: { ids: Array.from(dungeonLootImageIds).join(',') },
        })
        .subscribe({
          next: (images) => {
            for (const image of images) {
              onImageLoaded(image.id, image.path);
            }
          },
        });
    }

    // Fetch user's personal library if logged in
    const userKey = this.account.getKey();
    if (userKey && userPersonalImageIds.size > 0) {
      this.http
        .get<ImageRecordPayload[]>(`${API_BASE_URL}/images`, {
          params: { userkey: userKey, scope: 'library' },
        })
        .subscribe({
          next: (images) => {
            for (const image of images) {
              onImageLoaded(image.id, image.path);
            }
          },
        });
    }

    // If no userKey but have personal images, fetch from public endpoint as fallback
    if (!userKey && userPersonalImageIds.size > 0) {
      this.http
        .get<{ id: number; path: string }[]>(`${API_BASE_URL}/images/by-ids`, {
          params: { ids: Array.from(userPersonalImageIds).join(',') },
        })
        .subscribe({
          next: (images) => {
            for (const image of images) {
              onImageLoaded(image.id, image.path);
            }
          },
        });
    }
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

  resolveClientAssetUrl(assetPath: string): string {
    const trimmed = typeof assetPath === 'string' ? assetPath.trim() : '';
    if (!trimmed) {
      return '';
    }

    if (/^https?:\/\//i.test(trimmed)) {
      return encodeURI(trimmed);
    }

    return encodeURI(trimmed.startsWith('/') ? trimmed : `/${trimmed}`);
  }
}
