import { Component } from '@angular/core';
import { AngularSplitModule } from 'angular-split';
import { AnienTimelineComponent } from '../anien-timeline/anien-timeline.component';
// import { TimelineComponent } from '../timeline/timeline.component';
// import { PreviewComponent } from '../preview/preview.component';
// import { NodeEditorComponent } from '../node-editor/node-editor.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    AngularSplitModule,
    AnienTimelineComponent,
    // TimelineComponent, PreviewComponent, NodeEditorComponent
  ],
  template: `
    <div class="app-container">
      <as-split direction="vertical" style="height: 100%;">
        <as-split-area [size]="70">
          <as-split direction="horizontal">
            <as-split-area [size]="60">
              <div class="pane-content">Preview</div>
            </as-split-area>
            <as-split-area [size]="40">
              <div class="pane-content">Node Editor</div>
            </as-split-area>
          </as-split>
        </as-split-area>
        <as-split-area [size]="30">
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
        background-color: #2c2c2c;
        color: white;
        font-family: sans-serif;
      }
    `,
  ],
})
export class MainLayoutComponent {}
