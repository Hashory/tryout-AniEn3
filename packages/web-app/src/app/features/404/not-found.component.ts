import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <p>404</p>
      <p>Page not found.</p>
    </main>
  `,
})
export class NotFoundComponent {}
