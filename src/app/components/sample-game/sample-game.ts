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
}
