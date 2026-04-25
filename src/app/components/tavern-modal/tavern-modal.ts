import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../../api-config';
import { Tresher } from '../../interfaces/game/tresher';

export type TavernStat = 'strength' | 'stamina' | 'mind' | 'magicPower' | 'numberOfAttacks' | 'numberOfDefends';
type TavernView = 'main' | 'buy' | 'sell' | 'learn' | 'quests' | 'stash';

@Component({
  selector: 'app-tavern-modal',
  standalone: true,
  imports: [],
  templateUrl: './tavern-modal.html',
  styleUrl: './tavern-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TavernModalComponent implements OnInit {
  private readonly http = inject(HttpClient);

  readonly pcId = input<number | null>(null);
  readonly userkey = input('');
  readonly sp = input(0);
  readonly strength = input(0);
  readonly stamina = input(0);
  readonly mind = input(0);
  readonly magicPower = input(0);
  readonly numberOfAttacks = input(1);
  readonly numberOfDefends = input(1);
  readonly level = input(0);
  readonly pcName = input('');
  readonly questInventory = input<Tresher[]>([]);
  readonly stashItems = input<Array<{ id: number; name: string; description: string; type: string; gold: number; silver: number; copper: number; zinc: number; spReward: number; imageId: number | null; soundId: number | null; isquest: boolean }>>([]);
  readonly isMainGame = input(false);
  readonly inventoryItems = input<Tresher[]>([]);
  readonly resettablePerPc = input(false);

  readonly closed = output<void>();
  readonly spChanged = output<number>();
  readonly statChanged = output<{ stat: TavernStat; newValue: number }>();
  readonly questItemsTurnedIn = output<number[]>();
  readonly depositToStash = output<Tresher[]>();
  readonly withdrawFromStash = output<number[]>();
  readonly resetProgress = output<void>();
  readonly tresherGoldChanged = output<{ tresherId: number; newGold: number }>();

  readonly view = signal<TavernView>('main');
  readonly isUpgrading = signal(false);
  readonly upgradeError = signal('');
  readonly isTurningIn = signal(false);
  readonly turnInMessage = signal('');
  readonly isStashBusy = signal(false);
  readonly selectedInventoryIndexes = signal<Set<number>>(new Set());
  readonly selectedStashIndexes = signal<Set<number>>(new Set());
  readonly showResetConfirm = signal(false);

  // Local copies updated after each purchase so the view stays in sync
  readonly localSp = signal(0);
  readonly localStrength = signal(0);
  readonly localStamina = signal(0);
  readonly localMind = signal(0);
  readonly localMagicPower = signal(0);
  readonly localNoa = signal(1);
  readonly localNod = signal(1);

  readonly tavernImage = signal<'taren1' | 'taren2'>('taren1');
  readonly keeperName = computed(() => this.tavernImage() === 'taren1' ? 'Cellen' : 'Reanna');

  readonly totalInventoryGold = computed(() =>
    this.inventoryItems().reduce((sum, t) => sum + (t.gold ?? 0), 0)
  );

  readonly noaSpCost = computed(() => 200 * this.level());
  readonly noaGoldCost = computed(() => this.localNoa() * 1000);
  readonly nodSpCost = computed(() => 200 * this.level());
  readonly nodGoldCost = computed(() => this.localNod() * 1000);

  readonly canUpgradeNoa = computed(() =>
    this.level() >= 4 &&
    this.localSp() >= this.noaSpCost() &&
    this.totalInventoryGold() >= this.noaGoldCost() &&
    !this.isUpgrading()
  );
  readonly canUpgradeNod = computed(() =>
    this.level() >= 4 &&
    this.localSp() >= this.nodSpCost() &&
    this.totalInventoryGold() >= this.nodGoldCost() &&
    !this.isUpgrading()
  );

  readonly learnEntries: Array<{ label: string; stat: TavernStat; cost: number }> = [
    { label: 'Strength',    stat: 'strength',   cost: 1 },
    { label: 'Stamina',     stat: 'stamina',    cost: 1 },
    { label: 'Mind',        stat: 'mind',       cost: 1 },
    { label: 'Magic Power', stat: 'magicPower', cost: 1 },
  ];

  ngOnInit(): void {
    this.tavernImage.set(Math.random() < 0.5 ? 'taren1' : 'taren2');
    this.localSp.set(this.sp());
    this.localStrength.set(this.strength());
    this.localStamina.set(this.stamina());
    this.localMind.set(this.mind());
    this.localMagicPower.set(this.magicPower());
    this.localNoa.set(this.numberOfAttacks());
    this.localNod.set(this.numberOfDefends());
  }

  localValueFor(stat: TavernStat): number {
    switch (stat) {
      case 'strength': return this.localStrength();
      case 'stamina': return this.localStamina();
      case 'mind': return this.localMind();
      case 'magicPower': return this.localMagicPower();
      case 'numberOfAttacks': return this.localNoa();
      case 'numberOfDefends': return this.localNod();
    }
  }

  canAfford(cost: number): boolean {
    return this.localSp() >= cost;
  }

  setView(v: TavernView): void {
    this.view.set(v);
    this.upgradeError.set('');
  }

  close(): void {
    this.closed.emit();
  }

  turnInQuestItems(): void {
    const pcId = this.pcId();
    const userkey = this.userkey();
    const items = this.questInventory();
    if (!pcId || !userkey || this.isTurningIn() || items.length === 0) return;

    const tresherIds = items.map((t) => t.id);
    this.isTurningIn.set(true);
    this.turnInMessage.set('');

    this.http
      .post<{ result: number; spAwarded: number; newSp: number }>(
        `${API_BASE_URL}/pcs/${pcId}/tavern-turnin`,
        { userkey, tresherIds }
      )
      .subscribe({
        next: (res) => {
          if (res.result === 1) {
            this.localSp.set(res.newSp);
            this.spChanged.emit(res.newSp);
            this.questItemsTurnedIn.emit(tresherIds);
            this.turnInMessage.set(`Turned in ${items.length} quest item${items.length !== 1 ? 's' : ''} for ${res.spAwarded} SP!`);
          } else {
            this.turnInMessage.set('Turn-in failed. Please try again.');
          }
          this.isTurningIn.set(false);
        },
        error: () => {
          this.turnInMessage.set('Failed to turn in items. Please try again.');
          this.isTurningIn.set(false);
        },
      });
  }

  toggleInventorySelection(index: number): void {
    this.selectedInventoryIndexes.update((s) => {
      const next = new Set(s);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }

  toggleStashSelection(index: number): void {
    this.selectedStashIndexes.update((s) => {
      const next = new Set(s);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }

  depositSelected(): void {
    const indexes = [...this.selectedInventoryIndexes()];
    if (indexes.length === 0 || this.isStashBusy()) return;
    const items = this.inventoryItems();
    const toDeposit = indexes.map((i) => items[i]).filter(Boolean);
    if (toDeposit.length === 0) return;
    this.isStashBusy.set(true);
    this.selectedInventoryIndexes.set(new Set());
    this.depositToStash.emit(toDeposit);
    this.isStashBusy.set(false);
  }

  withdrawSelected(): void {
    const indexes = [...this.selectedStashIndexes()];
    if (indexes.length === 0 || this.isStashBusy()) return;
    this.isStashBusy.set(true);
    this.selectedStashIndexes.set(new Set());
    this.withdrawFromStash.emit(indexes);
    this.isStashBusy.set(false);
  }

  onResetProgress(): void {
    this.showResetConfirm.set(true);
  }

  confirmResetProgress(): void {
    this.showResetConfirm.set(false);
    this.resetProgress.emit();
    this.view.set('main');
  }

  cancelResetProgress(): void {
    this.showResetConfirm.set(false);
  }

  upgradeStat(stat: TavernStat): void {
    const pcId = this.pcId();
    const userkey = this.userkey();
    if (!pcId || !userkey || this.isUpgrading()) return;

    this.isUpgrading.set(true);
    this.upgradeError.set('');

    this.http
      .patch<{ result: number; sp: number; newValue: number }>(
        `${API_BASE_URL}/pcs/${pcId}/upgrade-stat`,
        { userkey, stat }
      )
      .subscribe({
        next: (res) => {
          if (res.result === 1) {
            this.localSp.set(res.sp);
            if (stat === 'strength') this.localStrength.set(res.newValue);
            if (stat === 'stamina') this.localStamina.set(res.newValue);
            if (stat === 'mind') this.localMind.set(res.newValue);
            if (stat === 'magicPower') this.localMagicPower.set(res.newValue);
            this.spChanged.emit(res.sp);
            this.statChanged.emit({ stat, newValue: res.newValue });
          } else {
            this.upgradeError.set('Not enough SP or upgrade failed.');
          }
          this.isUpgrading.set(false);
        },
        error: () => {
          this.upgradeError.set('Failed to upgrade. Please try again.');
          this.isUpgrading.set(false);
        },
      });
  }

  upgradeNoaLv4(): void {
    const pcId = this.pcId();
    const userkey = this.userkey();
    if (!pcId || !userkey || !this.canUpgradeNoa()) return;

    const spCost = this.noaSpCost();
    const goldCost = this.noaGoldCost();
    const richestTresher = [...this.inventoryItems()]
      .filter(t => (t.gold ?? 0) >= goldCost)
      .sort((a, b) => (b.gold ?? 0) - (a.gold ?? 0))[0] ?? null;

    if (!richestTresher) return;

    this.isUpgrading.set(true);
    this.upgradeError.set('');

    this.http
      .patch<{ result: number; sp: number; numberOfAttacks: number; tresherId: number | null; newGold: number | null }>(
        `${API_BASE_URL}/pcs/${pcId}/upgrade-noa`,
        { userkey, spCost, goldCost, tresherId: richestTresher.id }
      )
      .subscribe({
        next: (res) => {
          if (res.result === 1) {
            this.localSp.set(res.sp);
            this.localNoa.set(res.numberOfAttacks);
            this.spChanged.emit(res.sp);
            this.statChanged.emit({ stat: 'numberOfAttacks', newValue: res.numberOfAttacks });
            if (res.tresherId !== null && res.newGold !== null) {
              this.tresherGoldChanged.emit({ tresherId: res.tresherId, newGold: res.newGold });
            }
          } else {
            this.upgradeError.set('Not enough SP or gold, or upgrade failed.');
          }
          this.isUpgrading.set(false);
        },
        error: () => {
          this.upgradeError.set('Failed to upgrade. Please try again.');
          this.isUpgrading.set(false);
        },
      });
  }

  upgradeNodLv4(): void {
    const pcId = this.pcId();
    const userkey = this.userkey();
    if (!pcId || !userkey || !this.canUpgradeNod()) return;

    const spCost = this.nodSpCost();
    const goldCost = this.nodGoldCost();
    const richestTresher = [...this.inventoryItems()]
      .filter(t => (t.gold ?? 0) >= goldCost)
      .sort((a, b) => (b.gold ?? 0) - (a.gold ?? 0))[0] ?? null;

    if (!richestTresher) return;

    this.isUpgrading.set(true);
    this.upgradeError.set('');

    this.http
      .patch<{ result: number; sp: number; numberOfDefends: number; tresherId: number | null; newGold: number | null }>(
        `${API_BASE_URL}/pcs/${pcId}/upgrade-nod`,
        { userkey, spCost, goldCost, tresherId: richestTresher.id }
      )
      .subscribe({
        next: (res) => {
          if (res.result === 1) {
            this.localSp.set(res.sp);
            this.localNod.set(res.numberOfDefends);
            this.spChanged.emit(res.sp);
            this.statChanged.emit({ stat: 'numberOfDefends', newValue: res.numberOfDefends });
            if (res.tresherId !== null && res.newGold !== null) {
              this.tresherGoldChanged.emit({ tresherId: res.tresherId, newGold: res.newGold });
            }
          } else {
            this.upgradeError.set('Not enough SP or gold, or upgrade failed.');
          }
          this.isUpgrading.set(false);
        },
        error: () => {
          this.upgradeError.set('Failed to upgrade. Please try again.');
          this.isUpgrading.set(false);
        },
      });
  }
}
