import { Component, signal } from '@angular/core';
import { MainLayoutComponent } from './main-layout/main-layout';

@Component({
  selector: 'app-root',
  imports: [MainLayoutComponent],
  template: ` <app-main-layout></app-main-layout> `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
    `,
  ],
})
export class App {
  protected readonly title = signal('tryout-AniEn3');
}
