import { Component, inject } from '@angular/core';
import { AngularSplitModule } from 'angular-split';
import { AnienTimelineComponent } from '../../features/timeline/components/anien-timeline/anien-timeline.component';
import { AnienMenuBarComponent } from './anien-menu-bar/anien-menu-bar.component';
import { TimelineViewService } from '../../core/layout/timeline-view.service';

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
          <div class="timeline-container">
            @if (viewService.scriptTimelineVisible()) {
              <div class="timeline-row script-row">
                <div class="timeline-row-label">Script (Subtitle) Timeline</div>
              </div>
            }

            @if (viewService.videoTimelineVisible()) {
              <div class="timeline-row video-row">
                <app-anien-timeline></app-anien-timeline>
              </div>
            }

            @if (viewService.audioTimelineVisible()) {
              <div class="timeline-row audio-row">
                <div class="timeline-row-label">Audio Clip Timeline</div>
              </div>
            }

            @if (viewService.keyframeTimelineVisible()) {
              <div class="timeline-row keyframe-row">
                <div class="timeline-row-label">Keyframe Timeline</div>
              </div>
            }
          </div>
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

      .timeline-container {
        display: flex;
        flex-direction: column;
        gap: 8px;
        height: 100%;
      }

      .timeline-row {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        background-color: #101417;
        color: white;
        font-family: sans-serif;
        border-radius: 8px 8px 0 0;
        padding: 4px 12px;
        min-height: 48px;
      }

      .timeline-row.video-row {
        padding: 0;
        overflow: hidden;
      }

      .timeline-row.video-row app-anien-timeline {
        width: 100%;
        height: 100%;
      }

      .timeline-row-label {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        opacity: 0.8;
      }
    `,
  ],
})
export class MainLayoutComponent {
  protected readonly viewService = inject(TimelineViewService);
}
