import { Component } from '@angular/core';
import { AngularSplitModule } from 'angular-split';
import { AnienTimelineComponent } from '../../features/timeline/components/anien-timeline/anien-timeline.component';
import { AnienMenuBarComponent } from './anien-menu-bar/anien-menu-bar.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [AngularSplitModule, AnienTimelineComponent, AnienMenuBarComponent],
  template: `
    <app-anien-menu-bar></app-anien-menu-bar>
    <div class="app-container">
      <as-split direction="vertical" style="height: 100%;">
        <as-split-area [size]="70">
          <as-split direction="horizontal">
            <as-split-area [size]="60">
              <div class="pane-content" style="border-radius: 0 8px 8px 8px;">Preview</div>
            </as-split-area>
            <as-split-area [size]="40">
              <div class="pane-content" style="border-radius: 8px 0 8px 8px;">Node Editor</div>
            </as-split-area>
          </as-split>
        </as-split-area>
        <as-split-area [size]="50">
          <app-anien-timeline></app-anien-timeline>
        </as-split-area>
      </as-split>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }

      .app-container {
        height: 100%;
      }

      .pane-content {
        height: 100%;
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        background-color: #101417;
        color: white;
        font-family: sans-serif;
      }
    `,
  ],
})
export class MainLayoutComponent {}
