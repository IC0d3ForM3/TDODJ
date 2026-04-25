import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Account } from '../services/account';

/** Redirects already-logged-in users away from public-only pages (home, login, signup) to the dashboard. */
export const loggedInGuard: CanActivateFn = () => {
  const account = inject(Account);
  const router = inject(Router);

  account.restoreKey();

  if (account.isLoggedIn()) {
    return router.createUrlTree(['/dashboard']);
  }
  return true;
};
