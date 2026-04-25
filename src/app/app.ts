import { Component, inject, signal } from '@angular/core';

import { Router, RouterLinkActive, RouterLinkWithHref, RouterOutlet } from '@angular/router';
import { Account } from './services/account';
import { NgIf } from '@angular/common';
import { CreatorLayout } from './services/creator-layout';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLinkWithHref, RouterLinkActive, NgIf],
  templateUrl: './app.html',
  styleUrl: './app.css',
})

export class App {
  readonly account = inject(Account);
  readonly creatorLayout = inject(CreatorLayout);
  private readonly router = inject(Router);

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
    this.router.navigate(['/dashboard']);
  }

  exitSamplePlay() {
    this.router.navigate(['/sample-game']);
  }

  toggleCreateHeader() {
    this.creatorLayout.toggleHeader();
  }

  showMenuBar() {
    return !this.isCreatePage() && !this.isSamplePlayPage() || !this.creatorLayout.isHeaderCollapsed();
  }
}
