import { Component, signal } from '@angular/core';
import { AnienMainComponent } from '#app/features/main/anien-main.component';

@Component({
  selector: 'app-root',
  imports: [AnienMainComponent],
  template: ` <app-anien-main></app-anien-main> `,
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
