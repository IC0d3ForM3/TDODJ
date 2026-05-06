import { Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLinkWithHref } from '@angular/router';
import { API_BASE_URL } from '../../api-config';

@Component({
  selector: 'app-home',
  imports: [RouterLinkWithHref],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  private readonly http = inject(HttpClient);

  ngOnInit(): void {
    this.http.post(`${API_BASE_URL}/stats/home-hit`, {}).subscribe({
      error: (error) => {
        // Analytics should never break homepage rendering.
        console.error('Failed to record home hit:', error);
      },
    });
  }
}
