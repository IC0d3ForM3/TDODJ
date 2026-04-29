import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Account } from '../services/account';

/** Requires the user to be logged in. Redirects to /login if not authenticated. */
export const authGuard: CanActivateFn = () => {
  const account = inject(Account);
  const router = inject(Router);

  account.restoreKey();

  if (!account.isLoggedIn()) {
    return router.createUrlTree(['/login']);
  }
  return true;
};
