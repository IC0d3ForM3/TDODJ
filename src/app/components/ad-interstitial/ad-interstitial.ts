import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Full-screen ad interstitial overlay.
 * Shows an NPC message, an ad unit, and a Continue button.
 *
 * Usage:
 *   <app-ad-interstitial [message]="'Hold on while I get that...'" (continued)="onAdDone()" />
 *
 * To add a real ad unit: replace the .ad-placeholder div inside .ad-unit with
 * your Google AdSense <ins> tag (see the comment inside the template).
 */
@Component({
  selector: 'app-ad-interstitial',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ad-interstitial.html',
  styleUrl: './ad-interstitial.css',
})
export class AdInterstitialComponent {
  @Input() message = '';
  @Output() continued = new EventEmitter<void>();

  onContinue(): void {
    this.continued.emit();
  }
}
