import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { API_BASE_URL } from '../api-config';

interface SoundRecordPayload {
  id: number;
  path: string;
}

@Injectable({ providedIn: 'root' })
export class GameSoundService {
  private readonly http = inject(HttpClient);

  readonly soundPathById = signal<Map<number, string>>(new Map());
  readonly defaultSpellSoundPath = '/sounds/sfx-glowing-magic-default-01.wav';
  readonly tavernWindowSoundPaths = ['/sounds/game sounds/1.mp3', '/sounds/game sounds/2.mp3'];
  readonly portalTraverseSoundPath = '/sounds/game sounds/portal sound.wav';

  private tavernMusicAudio: HTMLAudioElement | null = null;

  seedBundledSoundPaths(soundPaths: Array<{ id: number; path: string }> | null | undefined): void {
    if (!Array.isArray(soundPaths) || soundPaths.length === 0) {
      return;
    }

    this.soundPathById.update((existingMap) => {
      const merged = new Map(existingMap);
      for (const asset of soundPaths) {
        if (typeof asset?.id !== 'number' || typeof asset?.path !== 'string') {
          continue;
        }
        const trimmed = asset.path.trim();
        if (!trimmed) {
          continue;
        }
        merged.set(asset.id, trimmed);
      }
      return merged;
    });
  }

  loadSoundCatalog(userKey: string, forceRefresh = false): void {
    if (this.soundPathById().size > 0 && !forceRefresh) {
      console.log('[sound] loadSoundCatalog skipped - already have', this.soundPathById().size, 'entries');
      return;
    }

    console.log('[sound] loadSoundCatalog fetching from API (forceRefresh=' + forceRefresh + ')');
    this.http
      .get<SoundRecordPayload[]>(`${API_BASE_URL}/sounds`, {
        params: { userkey: userKey, scope: 'library' },
      })
      .subscribe({
        next: (items) => {
          console.log('[sound] loadSoundCatalog response:', items?.length ?? 0, 'items');
          if (!Array.isArray(items) || items.length === 0) {
            return;
          }

          const map = new Map<number, string>();
          for (const item of items) {
            if (typeof item?.id !== 'number' || typeof item?.path !== 'string') {
              continue;
            }

            const trimmedPath = item.path.trim();
            if (!trimmedPath) {
              continue;
            }

            map.set(item.id, trimmedPath);
          }

          console.log('[sound] loadSoundCatalog built map with', map.size, 'entries');
          if (map.size > 0) {
            this.soundPathById.update((existingMap) => {
              const merged = new Map(existingMap);
              for (const [id, path] of map) {
                merged.set(id, path);
              }
              return merged;
            });
            console.log('[sound] soundPathById now has', this.soundPathById().size, 'entries');
          }
        },
        error: (err) => {
          console.error('[sound] loadSoundCatalog ERROR:', err);
        },
      });
  }

  playSoundPath(
    soundPath: string,
    options: {
      muted: boolean;
      preferClientFirst: boolean;
      resolveClientAssetUrl: (assetPath: string) => string;
    }
  ): void {
    if (options.muted) {
      return;
    }

    const soundUrls = this.buildSoundUrlCandidates(soundPath, options.preferClientFirst, options.resolveClientAssetUrl);
    if (soundUrls.length === 0) {
      return;
    }

    this.playSoundFromUrls(soundUrls, 0, options.muted);
  }

  playDoorOpenClickSound(muted: boolean): void {
    if (muted) {
      return;
    }

    try {
      const ctx = new AudioContext();
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.exponentialRampToValueAtTime(380, now + 0.05);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.07);
      osc.onended = () => {
        void ctx.close();
      };
    } catch {
      // Audio API unavailable.
    }
  }

  playStepSound(muted: boolean, volume = 0.2): void {
    if (muted) return;
    try {
      const ctx = new AudioContext();
      const now = ctx.currentTime;

      const bufSize = Math.ceil(ctx.sampleRate * 0.04);
      const noiseBuffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) noiseData[i] = Math.random() * 2 - 1;
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 800;
      noiseFilter.Q.value = 0.8;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(volume * 0.9, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noiseSource.start(now);
      noiseSource.stop(now + 0.04);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.07);
      gain.gain.setValueAtTime(volume * 2.0, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
      osc.onended = () => ctx.close();
    } catch {
      // Audio API unavailable.
    }
  }

  playClangSound(muted: boolean): void {
    if (muted) return;
    try {
      const ctx = new AudioContext();
      const now = ctx.currentTime;

      const bufSize = Math.ceil(ctx.sampleRate * 0.016);
      const noiseBuffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) noiseData[i] = Math.random() * 2 - 1;
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 9000;
      noiseFilter.Q.value = 1.8;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.85, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.016);
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noiseSource.start(now);
      noiseSource.stop(now + 0.016);

      for (const [freq, vol, decay] of [
        [2400, 0.22, 0.07],
        [3700, 0.16, 0.05],
        [5500, 0.09, 0.04],
        [1200, 0.14, 0.09],
      ] as [number, number, number][]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + decay);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + decay);
      }

      const thump = ctx.createOscillator();
      const thumpGain = ctx.createGain();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(300, now);
      thump.frequency.exponentialRampToValueAtTime(90, now + 0.022);
      thumpGain.gain.setValueAtTime(0.72, now);
      thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      thump.connect(thumpGain);
      thumpGain.connect(ctx.destination);
      thump.start(now);
      thump.stop(now + 0.035);

      setTimeout(() => void ctx.close(), 300);
    } catch {
      // Audio API unavailable.
    }
  }

  startTavernMusic(options: { muted: boolean; resolveClientAssetUrl: (assetPath: string) => string }): void {
    if (options.muted || this.tavernMusicAudio) return;
    const candidates = this.tavernWindowSoundPaths.filter((path) => typeof path === 'string' && path.trim().length > 0);
    if (candidates.length === 0) return;

    const randomIndex = Math.floor(Math.random() * candidates.length);
    const selectedPath = candidates[randomIndex] ?? candidates[0];
    const soundUrl = options.resolveClientAssetUrl(selectedPath);
    if (!soundUrl) return;

    try {
      const audio = new Audio(soundUrl);
      audio.loop = true;
      audio.volume = 0.38;
      this.tavernMusicAudio = audio;
      void audio.play().catch(() => {
        if (this.tavernMusicAudio === audio) {
          this.tavernMusicAudio = null;
        }
      });
    } catch {
      // Audio API unavailable.
    }
  }

  stopTavernMusic(): void {
    if (this.tavernMusicAudio) {
      try {
        this.tavernMusicAudio.pause();
        this.tavernMusicAudio.currentTime = 0;
      } catch {
        // Ignore media cleanup issues.
      }
      this.tavernMusicAudio = null;
    }
  }

  private resolveSoundUrl(soundPath: string): string {
    const trimmed = typeof soundPath === 'string' ? soundPath.trim() : '';
    if (!trimmed) {
      return '';
    }

    if (/^https?:\/\//i.test(trimmed)) {
      return encodeURI(trimmed);
    }

    const baseUrl = trimmed.startsWith('/')
      ? `${API_BASE_URL}${trimmed}`
      : `${API_BASE_URL}/${trimmed}`;
    return encodeURI(baseUrl);
  }

  private buildSoundUrlCandidates(
    soundPath: string,
    preferClientFirst: boolean,
    resolveClientAssetUrl: (assetPath: string) => string
  ): string[] {
    const trimmed = typeof soundPath === 'string' ? soundPath.trim() : '';
    if (!trimmed) {
      return [];
    }

    if (/^https?:\/\//i.test(trimmed)) {
      return [encodeURI(trimmed)];
    }

    const apiUrl = this.resolveSoundUrl(trimmed);
    const clientUrl = resolveClientAssetUrl(trimmed);
    const looksLikeHostedSound = /^\/?sounds\//i.test(trimmed);

    if (!looksLikeHostedSound) {
      return apiUrl ? [apiUrl] : [];
    }

    const ordered = preferClientFirst
      ? [clientUrl, apiUrl]
      : [apiUrl, clientUrl];

    const unique: string[] = [];
    for (const url of ordered) {
      if (!url || unique.includes(url)) {
        continue;
      }
      unique.push(url);
    }
    return unique;
  }

  private playSoundFromUrls(soundUrls: string[], index: number, muted: boolean): void {
    if (index >= soundUrls.length || muted) {
      if (index >= soundUrls.length) {
        console.warn('[sound] playSoundFromUrls exhausted all candidates:', soundUrls);
      }
      return;
    }

    const soundUrl = soundUrls[index];
    console.log('[sound] playSoundFromUrls trying [' + index + '/' + soundUrls.length + ']:', soundUrl);

    try {
      const audio = new Audio(soundUrl);
      audio.volume = 0.55;

      let advanced = false;
      const tryNext = () => {
        if (advanced) {
          return;
        }
        advanced = true;
        console.warn('[sound] playSoundFromUrls FAILED:', soundUrl);
        this.playSoundFromUrls(soundUrls, index + 1, muted);
      };

      audio.addEventListener('error', tryNext, { once: true });
      void audio.play().then(() => {
        console.log('[sound] playSoundFromUrls OK:', soundUrl);
      }).catch(tryNext);
    } catch {
      console.warn('[sound] playSoundFromUrls exception for:', soundUrl);
      this.playSoundFromUrls(soundUrls, index + 1, muted);
    }
  }
}
