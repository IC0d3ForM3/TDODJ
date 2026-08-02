import { Injectable, computed, inject } from '@angular/core';
import { Account } from './account';

/**
 * Set to true once Google AdSense is approved and ad units are in place.
 * While false, no ad slots are shown to anyone regardless of subscription status.
 */
const ADS_ENABLED = false;

/**
 * Central ad-gating service.
 * showAds() is true only when ads are globally enabled AND the user is not a paid subscriber.
 * Inject this wherever you need to conditionally render ad slots.
 */
@Injectable({ providedIn: 'root' })
export class AdService {
  private readonly account = inject(Account);
  readonly showAds = computed(() => ADS_ENABLED && !this.account.isPaidSubscriber());
}
