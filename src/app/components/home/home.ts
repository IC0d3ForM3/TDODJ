import { Component } from '@angular/core';
import { RouterLinkWithHref } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [RouterLinkWithHref],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {}
