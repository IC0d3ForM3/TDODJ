import { Component, inject, signal } from '@angular/core';

import { ActivatedRoute, Router, RouterLinkActive, RouterLinkWithHref, RouterLink, RouterOutlet } from '@angular/router';
import { Account } from './services/account';
import { NgIf } from '@angular/common';
import { CreatorLayout } from './services/creator-layout';
import { AdBannerComponent } from './components/ad-banner/ad-banner';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLinkWithHref, RouterLinkActive, RouterLink, NgIf, AdBannerComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})

export class App {
  readonly account = inject(Account);
  readonly creatorLayout = inject(CreatorLayout);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly title = signal('TDODJ');
  constructor() {
    this.account.restoreKey();
  }

  isLoggedIn() {
    return this.account.isLoggedIn();
  }

  logout() {
    this.account.logout();
  }

  isAdmin() {
    return this.account.isAdmin();
  }
  isCreator() {
    return this.account.isCreator();
  }

  isCreatePage() {
    return this.router.url.startsWith('/create');
  }

  isGamePage() {
    return this.router.url.startsWith('/game/');
  }

  isSamplePlayPage() {
    return this.router.url.startsWith('/sample-play');
  }

  exitGame() {
    // Extract query params from current URL
    const urlTree = this.router.parseUrl(this.router.url);
    const isCreatorTestMode = urlTree.queryParams['testMode'] === 'creator';
    
    if (isCreatorTestMode) {
      const rawDungonId = urlTree.queryParams['dungonId'] ?? '';
      const dungonId = Number(rawDungonId);
      if (Number.isInteger(dungonId) && dungonId > 0) {
        void this.router.navigate(['/create'], {
          queryParams: { dungonId },
        });
        return;
      }
    }

    this.router.navigate(['/dashboard']);
  }

  exitSamplePlay() {
    // Extract query params from current URL
    const urlTree = this.router.parseUrl(this.router.url);
    const isCreatorTestMode = urlTree.queryParams['testMode'] === 'creator';
    
    if (isCreatorTestMode) {
      const rawDungonId = urlTree.queryParams['dungonId'] ?? '';
      const dungonId = Number(rawDungonId);
      if (Number.isInteger(dungonId) && dungonId > 0) {
        void this.router.navigate(['/create'], {
          queryParams: { dungonId },
        });
        return;
      }
    }

    this.router.navigate(['/sample-game']);
  }

  toggleCreateHeader() {
    this.creatorLayout.toggleHeader();
  }

  showMenuBar() {
    return !this.isCreatePage() && !this.isSamplePlayPage() || !this.creatorLayout.isHeaderCollapsed();
  }
}
