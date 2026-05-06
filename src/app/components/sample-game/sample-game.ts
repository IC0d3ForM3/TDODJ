import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { RouterLinkWithHref } from '@angular/router';
import { forkJoin } from 'rxjs';
import { API_BASE_URL } from '../../api-config';

interface SampleDungon {
  id: number;
  name: string;
  description: string;
  intro: string;
}

interface SamplePc {
  id: number;
  name: string;
  species: string;
  type: string;
  imagePath?: string | null;
  maxHP: number;
  currentHP: number;
  ac: number;
  actionEconomy: number;
  strength: number;
  stamina: number;
  mind: number;
  magicPower: number;
  rangeOfView: number;
}

interface TutorialPage {
  image: string;
  speaker: string;
  title: string;
  text: string;
}

@Component({
  selector: 'app-sample-game',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sample-game.html',
  styleUrl: './sample-game.css',
  imports: [RouterLinkWithHref],
})
export class SampleGame implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly dungon = signal<SampleDungon | null>(null);
  readonly samplePcs = signal<SamplePc[]>([]);
  readonly selectedPc = signal<SamplePc | null>(null);
  readonly isLoading = signal(true);
  readonly hasError = signal(false);

  // ── Tavern tutorial ───────────────────────────────────────────
  readonly showTutorial = signal(true);
  readonly tutorialPageIndex = signal(0);

  readonly tutorialPages: TutorialPage[] = [
    {
      image: 'images/taren1.jpg',
      speaker: 'Cellen',
      title: 'Welcome, Adventurer!',
      text: "Pull up a stool and rest your boots! I'm Cellen, keeper of the Rusty Flagon. Word is you're thinking of braving the dungeons beneath our town. Smart move coming to me first — I've sent many brave souls down there, and most of them came back. Let me walk you through what you're in for.",
    },
    {
      image: 'images/taren1.jpg',
      speaker: 'Cellen',
      title: 'Finding Your Way',
      text: "You'll explore from a first-person view — stone corridors stretching out ahead of you — with a mini-map below to keep your bearings. Use the Arrow Keys to turn and face a new direction. Press Space or F to step forward, and B to step back. The dungeon isn't huge, but every corridor looks the same in the dark.",
    },
    {
      image: 'images/taren1.jpg',
      speaker: 'Cellen',
      title: 'Action Economy',
      text: "Every round you have a pool of Action Economy — AE for short. Moving costs 1 AE. Attacking costs 1 AE. Drinking a potion costs 1 AE. Casting a spell also costs 1 AE — but spells additionally spend their Magic Cost from your MP pool, so keep an eye on both. When your AE hits zero, it's the monsters' turn. Spend your points wisely — getting caught flat-footed is how adventurers end up as wall decorations.",
    },
    {
      image: 'images/taren2.jpg',
      speaker: 'Reanna',
      title: 'Combat',
      text: "Tap a monster on the mini-map to target it, then click Attack. You'll roll a d12 and add your weapon bonus and Stamina — beat the monster's Armor Class and you land a hit. Damage is your weapon dice plus Strength. Monsters hit back on their turn, so keep moving and keep that armor on. Oh — and watch your flanks.",
    },
    {
      image: 'images/taren2.jpg',
      speaker: 'Reanna',
      title: 'Loot & the Exit',
      text: "Treshers — those containers scattered through the dungeon — hold weapons, armor, potions, spells, and coin. Hit the Take All button in the side panel to scoop up everything on your current square, or grab items one at a time. Your Inventory panel shows what you're carrying — equip weapons and armor from there. Your goal is the Exit square on the mini-map. Step onto it to finish the dungeon and earn your Skill Point reward. Now get in there — the first round's on the house when you return!",
    },
  ];

  get currentTutorialPage(): TutorialPage {
    return this.tutorialPages[this.tutorialPageIndex()];
  }

  get isLastTutorialPage(): boolean {
    return this.tutorialPageIndex() === this.tutorialPages.length - 1;
  }

  get tutorialProgress(): string {
    return `${this.tutorialPageIndex() + 1} / ${this.tutorialPages.length}`;
  }

  nextTutorialPage(): void {
    if (!this.isLastTutorialPage) {
      this.tutorialPageIndex.update(p => p + 1);
    }
  }

  prevTutorialPage(): void {
    if (this.tutorialPageIndex() > 0) {
      this.tutorialPageIndex.update(p => p - 1);
    }
  }

  skipTutorial(): void {
    this.showTutorial.set(false);
  }

  playFromTutorial(): void {
    this.showTutorial.set(false);
    if (this.selectedPc()) {
      this.playNow();
    }
  }

  ngOnInit(): void {
    forkJoin({
      dungon: this.http.get<SampleDungon>(`${API_BASE_URL}/dungons/sample`),
      pcs: this.http.get<SamplePc[]>(`${API_BASE_URL}/pcs/sample`),
    }).subscribe({
      next: ({ dungon, pcs }) => {
        this.dungon.set(dungon);
        this.samplePcs.set(pcs);
        if (pcs.length === 1) {
          this.selectedPc.set(pcs[0]);
        }
        this.isLoading.set(false);
      },
      error: () => {
        this.hasError.set(true);
        this.isLoading.set(false);
      },
    });
  }

  selectPc(pc: SamplePc): void {
    this.selectedPc.set(pc);
  }

  changePc(): void {
    this.selectedPc.set(null);
  }

  playNow(): void {
    const pc = this.selectedPc();
    if (!pc) return;
    this.router.navigate(['/sample-play'], { queryParams: { pcId: pc.id } });
  }

  resolveImageUrl(imagePath: string | null | undefined): string {
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
}
