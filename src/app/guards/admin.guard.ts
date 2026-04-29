import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Account } from '../services/account';

/** Requires the user to be logged in AND have admin role. Redirects to /dashboard if authenticated but not admin, or /login if not authenticated. */
export const adminGuard: CanActivateFn = () => {
  const account = inject(Account);
  const router = inject(Router);

  account.restoreKey();

  if (!account.isLoggedIn()) {
    return router.createUrlTree(['/login']);
  }
  if (!account.isAdmin()) {
    return router.createUrlTree(['/dashboard']);
  }
  return true;
};
