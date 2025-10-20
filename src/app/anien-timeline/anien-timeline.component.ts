import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { TimelineStateService } from './anien-timeline-state.service';

@Component({
  selector: 'app-anien-timeline',
  template: `
    <div class="timeline-header">
      <button (click)="addTrack()">+</button>
      <div class="timeline-ruller" style="color:white;">Ruller Here</div>
    </div>
    <div class="timeline-sidebar"></div>

    <div class="timeline-main-wrapper">
      <div
        class="timeline-main"
        [style.width]="'calc(var(--timeline-frame-size) * 1000)'"
        [style.height]="'calc(var(--timeline-track-height) * ' + 100 + ')'"
      >
        @for (track of tracks(); track track; let i = $index) {
          @if (track.type === 'strip') {
            <div
              class="strip"
              [style.width]="'calc(var(--timeline-frame-size) * ' + track.length + ')'"
              [style.top]="
                'calc(' +
                track.trackOrder +
                ' * var(--timeline-track-height) + var(--timeline-strip-offset))'
              "
              [style.left]="'calc(var(--timeline-frame-size) * ' + track.startFrame + ')'"
            >
              {{ track.source }}
            </div>
          } @else {
            <div
              class="folder"
              [style.width]="'calc(var(--timeline-frame-size) * ' + track.length + ')'"
              [style.top]="
                'calc(' +
                track.trackOrder +
                ' * var(--timeline-track-height) + var(--timeline-folder-offset))'
              "
              [style.left]="'calc(var(--timeline-frame-size) * ' + track.startFrame + ')'"
            >
              <div class="folder-header">{{ track.name }}</div>
              <div
                class="folder-content-holder"
                [style.height]="
                  'calc(' +
                  track.trackLength +
                  ' * var(--timeline-track-height) + var(--timeline-folder-offset))'
                "
              ></div>
            </div>
          }
        } @empty {
          <div class="empty-state">No tracks yet.</div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        /* variables */
        --timeline-frame-size: 2px;
        --timeline-track-height: 34px;
        --timeline-sidebar-width: 33px;
        --timeline-grid-gap: 3px;
        --timeline-strip-height: 26px;
        --timeline-strip-padding-x: 9px;
        --timeline-strip-offset: 2px;
        --timeline-background-stripe-height: 30px;
        --timeline-folder-offset: 4px;
        --timeline-folder-content-stripe-height: 4px;

        /* layout */
        display: block;
        background: #101417;
        width: 100%;
        height: 100%;
        border-radius: 8px 8px 0px 0px;
        display: grid;
        grid-template-rows: 25px auto;
        grid-template-columns: var(--timeline-sidebar-width) auto;
        column-gap: var(--timeline-grid-gap);
      }

      .timeline-header {
        grid-column: 1 / span 2;
        grid-row: 1 / 2;

        display: grid;
        grid-template-columns: var(--timeline-sidebar-width) auto;
      }

      .timeline-sidebar {
        grid-column: 1 / 2;
        grid-row: 2 / span 1;
      }

      .timeline-main-wrapper {
        grid-column: 2 / span 1;
        grid-row: 2 / span 1;
        overflow: auto;
        scrollbar-width: none;
      }

      .timeline-main {
        background-color: #0b0f12;
        background-image: repeating-linear-gradient(
          to bottom,
          #262a2e,
          #262a2e var(--timeline-background-stripe-height),
          #0b0f12 var(--timeline-background-stripe-height),
          #0b0f12 var(--timeline-track-height)
        );

        position: relative;
      }

      .timeline-main .strip {
        z-index: 20000;
        height: var(--timeline-strip-height);
        background-color: #024b71;
        color: #cbe6ff;
        align-content: center;
        padding: 0 var(--timeline-strip-padding-x);
        border-radius: 5px;
        position: absolute;
      }

      .timeline-main .folder {
        z-index: 10000;
        position: absolute;
        display: flex;
        flex-direction: column;
      }

      .timeline-main .folder .folder-header {
        height: var(--timeline-strip-height);
        background-color: #437836;
        color: #e0e3e8;
        align-content: center;
        padding: 0 var(--timeline-strip-padding-x);
        border-radius: 10px 10px 0 0;
      }

      .timeline-main .folder .folder-content-holder {
        background-color: #2e6b2e;
        background-image: repeating-linear-gradient(
          to bottom,
          #32562a,
          #32562a var(--timeline-folder-content-stripe-height),
          #264c14 var(--timeline-folder-content-stripe-height),
          #264c14 var(--timeline-track-height)
        );
        color: white;
        border-radius: 0 0 var(--timeline-folder-offset) var(--timeline-folder-offset);
      }

      .timeline-main .empty-state {
        color: white;
        height: 100%;
        display: grid;
        justify-content: center;
        align-items: center;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [],
})
export class AnienTimelineComponent {
  private readonly stateService = inject(TimelineStateService);

  public readonly tracks = this.stateService.rootTracksVM;
  public readonly timelineName = this.stateService.timelineName;

  public addTrack(): void {
    this.stateService.addTrack();
  }

  // Helper for testing
  public addTestStrip(): void {
    if (this.tracks().length === 0) {
      this.stateService.addTrack();
    }
    this.stateService.addTrack();
  }
}
