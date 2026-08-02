import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AdService } from '../../services/ad.service';

/**
 * Horizontal bottom-of-page ad banner.
 * Renders nothing when the user has an active paid subscription.
 *
 * To add a real ad unit: replace the .ad-banner-placeholder div inside
 * .ad-banner-bar with your Google AdSense horizontal banner unit.
 */
@Component({
  selector: 'app-ad-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ad-banner.html',
  styleUrl: './ad-banner.css',
})
export class AdBannerComponent {
  readonly adService = inject(AdService);
}
