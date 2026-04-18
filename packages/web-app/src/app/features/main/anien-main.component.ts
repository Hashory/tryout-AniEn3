import { Component, signal } from '@angular/core';
import { MainLayoutComponent } from '#app/features/main/main-layout/main-layout.component';

@Component({
  selector: 'app-anien-main',
  imports: [MainLayoutComponent],
  template: ` <app-main-layout />`,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
    `,
  ],
})
export class AnienMainComponent {
  protected readonly title = signal('tryout-AniEn3');
}
