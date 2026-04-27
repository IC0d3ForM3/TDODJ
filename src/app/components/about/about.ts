import { Component } from '@angular/core';
import { TacModal } from '../tac-modal/tac-modal';

@Component({
  selector: 'app-about',
  imports: [TacModal],
  templateUrl: './about.html',
  styleUrl: './about.css',
})
export class About {
  showTac = false;
}
