import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
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
  imagePath?: string | null;
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

interface PcGuide {
  strengths: string[];
  watchOut: string[];
}

const PC_TYPE_GUIDES: Record<string, PcGuide> = {
  fighter: {
    strengths: [
      'High HP and heavy armor — you can absorb a lot of punishment',
      'Multiple attacks per round let you chain hits in a single turn',
      'Top melee damage boosted by a strong Strength stat',
      'Can equip almost any weapon or armor you find in loot',
    ],
    watchOut: [
      'No spells or MP — potions are your only in-combat healing option',
      'Ranged monsters chip away at you before you can close the gap',
      'Running dry on potions can turn a routine fight lethal',
    ],
  },
  mage: {
    strengths: [
      'Powerful spells can blast multiple monsters from a safe distance',
      'Many spells bypass a monster\'s Armor Class entirely',
      'High Magic Power means each spell lands harder',
    ],
    watchOut: [
      'Fragile: low HP and AC — a few bad hits can be fatal',
      'MP is finite for the whole dungeon; every cast counts',
      'Melee is a last resort — stay out of reach at all times',
    ],
  },
  wizard: {
    strengths: [
      'Powerful spells can blast multiple monsters from a safe distance',
      'Many spells bypass a monster\'s Armor Class entirely',
      'High Magic Power means each spell lands harder',
    ],
    watchOut: [
      'Fragile: low HP and AC — a few bad hits can be fatal',
      'MP is finite for the whole dungeon; every cast counts',
      'Melee is a last resort — stay out of reach at all times',
    ],
  },
  ranger: {
    strengths: [
      'Ranged weapons let you attack before a monster can close in',
      'High Range of View — you spot threats further down the corridor',
      'Solid balance of offense and survivability',
    ],
    watchOut: [
      'Tight corridors reduce the advantage of a ranged weapon',
      'No healing spells — stock up on potions before descending',
      'Fast-moving melee enemies can quickly close any gap you try to keep',
    ],
  },
  rogue: {
    strengths: [
      'Exceptional burst damage on a single target when well-positioned',
      'High Strength multiplier maximises weapon damage per hit',
      'Mobile and fast — you decide when and where fights begin',
    ],
    watchOut: [
      'Lower HP than fighters — avoid trading blows if you can help it',
      'No magical options; everything comes down to steel and positioning',
      'Cornered or surrounded, your main advantage disappears quickly',
    ],
  },
  cleric: {
    strengths: [
      'Healing spells let you restore HP without leaving the dungeon',
      'Support and offensive spells add real tactical flexibility',
      'Better armor than a pure mage; can hold a front-line position',
    ],
    watchOut: [
      'MP is limited — save healing spells for genuine emergencies',
      'Lower raw damage output than a dedicated fighter',
      'Casting too freely early on leaves you helpless in harder rooms',
    ],
  },
  paladin: {
    strengths: [
      'Heavy melee damage plus spells in one package',
      'Strong HP and Armor Class — built to survive sustained fights',
      'Offensive spells give options that a pure fighter simply lacks',
    ],
    watchOut: [
      'Smaller MP pool than a mage — choose your moments to cast carefully',
      'Splitting focus between sword and spell can spread resources thin',
    ],
  },
  bard: {
    strengths: [
      'Versatile: a mix of melee, magic, and great loot synergies',
      'Adapts well to whatever weapons and armor the dungeon provides',
    ],
    watchOut: [
      'Neither the highest damage dealer nor the toughest tank — adapt your approach',
      'Watch both HP and MP; letting either run dry will hurt',
    ],
  },
  druid: {
    strengths: [
      'Nature-based spells with strong offensive and support options',
      'Decent HP for a spellcasting class',
    ],
    watchOut: [
      'MP conservation is critical — plan spells across the whole dungeon',
      'Lighter armor than melee classes; avoid prolonged exchanges',
    ],
  },
};

const DEFAULT_PC_GUIDE: PcGuide = {
  strengths: [
    'Versatile enough to use most weapons and armor you find',
    'Adapt your style to whatever the dungeon throws at you',
  ],
  watchOut: [
    'Keep an eye on HP — drink potions before reaching critical health',
    'Every AE point is precious; plan your turn before spending it',
  ],
};

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
  readonly sampleDungons = signal<SampleDungon[]>([]);
  readonly samplePcs = signal<SamplePc[]>([]);
  readonly selectedPc = signal<SamplePc | null>(null);
  readonly pickerIndex = signal(0);
  readonly isLoading = signal(true);
  readonly hasError = signal(false);

  // ── Tavern dungeon picker modal ───────────────────────────────
  readonly showTavernDungeonPicker = signal(false);
  readonly tavernDungeonPickerIndex = signal(0);

  // ── Tavern tutorial ───────────────────────────────────────────
  readonly showTutorial = signal(false);
  readonly tutorialPageIndex = signal(0);

  readonly tutorialPages = computed<TutorialPage[]>(() => [
    {
      image: 'images/taren1.jpg',
      speaker: 'Cellen',
      title: 'Welcome, Adventurer!',
      text: this.buildKeeperIntro(this.dungon()),
    },
    {
      image: 'images/taren1.jpg',
      speaker: 'Cellen',
      title: 'Finding Your Way',
      text: "You explore in first-person with a mini-map below. Arrow keys turn, Space or F moves forward, and B steps back. Use the map so you do not get turned around.",
    },
    {
      image: 'images/taren1.jpg',
      speaker: 'Cellen',
      title: 'Action Economy',
      text: "Each turn you spend AE. Moving, attacking, drinking potions, and casting each cost 1 AE. Spells also spend MP. When AE reaches 0, monsters take their turn.",
    },
    {
      image: 'images/taren2.jpg',
      speaker: 'Reanna',
      title: 'Combat',
      text: "Click a monster on the mini-map, then Attack. You roll d12 plus weapon bonus and Stamina vs monster AC. Damage is weapon dice plus Strength. Keep distance and do not let enemies surround you.",
    },
    {
      image: 'images/taren2.jpg',
      speaker: 'Reanna',
      title: 'Loot & the Exit',
      text: "Loot treshers for gear, potions, spells, and coin. Use Take All or pick items one by one, then equip from Inventory. Reach the Exit square to complete the dungeon and claim your SP reward.",
    },
  ]);

  get currentTutorialPage(): TutorialPage {
    return this.tutorialPages()[this.tutorialPageIndex()];
  }

  get isLastTutorialPage(): boolean {
    return this.tutorialPageIndex() === this.tutorialPages().length - 1;
  }

  get tutorialProgress(): string {
    return `${this.tutorialPageIndex() + 1} / ${this.tutorialPages().length}`;
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
    this.navigateToSamplePlay();
  }

  playFromTutorial(): void {
    this.showTutorial.set(false);
    this.navigateToSamplePlay();
  }

  ngOnInit(): void {
    forkJoin({
      dungons: this.http.get<SampleDungon[]>(`${API_BASE_URL}/dungons/sample-list`),
      pcs: this.http.get<SamplePc[]>(`${API_BASE_URL}/pcs/sample`),
    }).subscribe({
      next: ({ dungons, pcs }) => {
        this.sampleDungons.set(dungons);
        this.dungon.set(dungons[0] ?? null);
        this.samplePcs.set(pcs);
        this.pickerIndex.set(0);
        this.selectedPc.set(null);
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
    this.tavernDungeonPickerIndex.set(0);
    this.showTavernDungeonPicker.set(true);
  }

  selectDungon(dungon: SampleDungon): void {
    this.dungon.set(dungon);
    this.selectedPc.set(null);
    this.pickerIndex.set(0);
  }

  pickerPc(): SamplePc | null {
    const pcs = this.samplePcs();
    if (pcs.length === 0) {
      return null;
    }
    const index = this.pickerIndex();
    if (index < 0 || index >= pcs.length) {
      this.pickerIndex.set(0);
      return pcs[0];
    }
    return pcs[index];
  }

  previousPickerPc(): void {
    const pcs = this.samplePcs();
    if (pcs.length <= 1) {
      return;
    }
    this.pickerIndex.update((index) => (index - 1 + pcs.length) % pcs.length);
  }

  nextPickerPc(): void {
    const pcs = this.samplePcs();
    if (pcs.length <= 1) {
      return;
    }
    this.pickerIndex.update((index) => (index + 1) % pcs.length);
  }

  startWithPickerPc(): void {
    const pc = this.pickerPc();
    if (!pc) {
      return;
    }
    this.selectPc(pc);
  }

  changePc(): void {
    this.selectedPc.set(null);
    this.showTavernDungeonPicker.set(false);
  }

  tavernPickerDungon(): SampleDungon | null {
    const dungons = this.sampleDungons();
    if (dungons.length === 0) {
      return null;
    }
    const index = this.tavernDungeonPickerIndex();
    if (index < 0 || index >= dungons.length) {
      this.tavernDungeonPickerIndex.set(0);
      return dungons[0];
    }
    return dungons[index];
  }

  tavernPreviousDungon(): void {
    const dungons = this.sampleDungons();
    if (dungons.length <= 1) {
      return;
    }
    this.tavernDungeonPickerIndex.update((index) => (index - 1 + dungons.length) % dungons.length);
  }

  tavernNextDungon(): void {
    const dungons = this.sampleDungons();
    if (dungons.length <= 1) {
      return;
    }
    this.tavernDungeonPickerIndex.update((index) => (index + 1) % dungons.length);
  }

  selectDungonFromTavern(dungon: SampleDungon): void {
    this.dungon.set(dungon);
    this.showTavernDungeonPicker.set(false);
    this.tutorialPageIndex.set(0);
    this.showTutorial.set(true);
  }

  playNow(): void {
    if (!this.showTutorial()) {
      this.tutorialPageIndex.set(0);
      this.showTutorial.set(true);
      return;
    }

    this.navigateToSamplePlay();
  }

  private navigateToSamplePlay(): void {
    const pc = this.selectedPc();
    const dungon = this.dungon();
    if (!pc || !dungon) return;
    this.router.navigate(['/sample-play'], { queryParams: { pcId: pc.id, dungonId: dungon.id } });
  }

  buildKeeperIntro(dungon: SampleDungon | null): string {
    if (!dungon) {
      return 'Cellen watches the door and says you should pick a sample dungeon before you go.';
    }

    const source = (dungon.description || dungon.intro || '').trim();
    if (!source) {
      return `Cellen says ${dungon.name} is ready for a fresh run.`;
    }

    const firstSentence = source.split(/(?<=[.!?])\s+/)[0].trim();
    const clipped = firstSentence.length > 160 ? `${firstSentence.slice(0, 157).trimEnd()}...` : firstSentence;
    return `Cellen studies the parchment and says: “${clipped}”`;
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

  readonly universalControls: { key: string; action: string }[] = [
    { key: '← →', action: 'Turn to face a new direction' },
    { key: '↑  or  Space / F', action: 'Step forward' },
    { key: '↓  or  B', action: 'Step backward' },
    { key: 'Click mini-map', action: 'Target a monster' },
    { key: 'Attack button', action: 'Strike your target (costs 1 AE)' },
    { key: 'Spells tab', action: 'Cast a spell (costs 1 AE + Magic Cost from MP)' },
    { key: 'Potions tab', action: 'Drink a potion (costs 1 AE)' },
    { key: 'Take All / Take', action: 'Pick up loot on your current square' },
    { key: 'Inventory tab', action: 'Equip weapons and armor' },
    { key: 'End Turn', action: 'Skip remaining AE — monsters act next' },
  ];

  getPcGuide(pc: SamplePc): PcGuide {
    const key = (pc.type ?? '').toLowerCase().trim();
    return PC_TYPE_GUIDES[key] ?? DEFAULT_PC_GUIDE;
  }
}
