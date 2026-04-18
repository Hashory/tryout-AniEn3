import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { AngularSplitModule, SplitGutterInteractionEvent } from 'angular-split';
import { AnienTimelineComponent } from '#app/features/main/main-layout/timeline/anien-timeline/anien-timeline.component';
import { ScreenComponent } from '#app/features/main/main-layout/screen/screen.component';
import { AnienMenuBarComponent } from '#app/features/main/main-layout/anien-menu-bar/anien-menu-bar.component';
import { TimelineViewService } from '#app/features/main/main-layout/timeline-view.service';
import { LayoutPersistenceService } from '#app/features/main/main-layout/layout-persistence.service';
import {
  AnienSidebarComponent,
  MainSidebarPanel,
} from '#app/features/main/main-layout/sidebar/anien-sidebar.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    AngularSplitModule,
    AnienTimelineComponent,
    ScreenComponent,
    AnienMenuBarComponent,
    AnienSidebarComponent,
  ],
  template: `
    <app-anien-menu-bar></app-anien-menu-bar>
    <div class="layout-shell">
      <div class="sidebar-shell">
        <app-anien-sidebar
          [activePanel]="activePanel()"
          (panelSelected)="onPanelSelected($event)"
        ></app-anien-sidebar>
      </div>

      <div class="content-shell">
        @if (activePanel() === 'timeline') {
          <as-split
            direction="vertical"
            style="height: 100%;"
            (dragEnd)="onMainVerticalDragEnd($event)"
          >
            <as-split-area [size]="mainVerticalSizes[0]">
              <as-split direction="horizontal" (dragEnd)="onTopHorizontalDragEnd($event)">
                <as-split-area [size]="topHorizontalSizes[0]">
                  <app-screen></app-screen>
                </as-split-area>
                <as-split-area [size]="topHorizontalSizes[1]">
                  <div class="pane-content" style="border-radius: 8px 0 8px 8px;">Node Editor</div>
                </as-split-area>
              </as-split>
            </as-split-area>
            <as-split-area [size]="mainVerticalSizes[1]">
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
        } @else {
          <section class="task-view" aria-label="Task view">
            <h2 class="task-title">Task</h2>
            <p class="task-description">Task view is a temporary placeholder.</p>
          </section>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }

      .layout-shell {
        display: flex;
        height: 100%;
        box-sizing: border-box;
      }

      .sidebar-shell {
        flex: 0 0 92px;
      }

      .content-shell {
        flex: 1;
        min-width: 0;
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

      .task-view {
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background-color: #101417;
        color: #ffffff;
        font-family: sans-serif;
      }

      .task-title {
        margin: 0;
        font-size: 20px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .task-description {
        margin: 10px 0 0;
        color: rgba(255, 255, 255, 0.65);
        font-size: 13px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLayoutComponent implements OnInit {
  protected readonly viewService = inject(TimelineViewService);
  private readonly layoutPersistence = inject(LayoutPersistenceService);
  protected readonly activePanel = signal<MainSidebarPanel>('timeline');

  mainVerticalSizes: [number, number] = [70, 50];
  topHorizontalSizes: [number, number] = [60, 40];

  ngOnInit(): void {
    const state = this.layoutPersistence.loadState();

    if (state?.mainVertical && state.mainVertical.length === 2) {
      this.mainVerticalSizes = [...state.mainVertical] as [number, number];
    }

    if (state?.topHorizontal && state.topHorizontal.length === 2) {
      this.topHorizontalSizes = [...state.topHorizontal] as [number, number];
    }

    if (state?.activePanel === 'task' || state?.activePanel === 'timeline') {
      this.activePanel.set(state.activePanel);
    }
  }

  onMainVerticalDragEnd(event: SplitGutterInteractionEvent): void {
    if (!event?.sizes || event.sizes.length < 2) {
      return;
    }

    const numericSizes = event.sizes.map((size) => Number(size));
    this.mainVerticalSizes = [numericSizes[0], numericSizes[1]];
    this.layoutPersistence.saveState({ mainVertical: this.mainVerticalSizes });
  }

  onTopHorizontalDragEnd(event: SplitGutterInteractionEvent): void {
    if (!event?.sizes || event.sizes.length < 2) {
      return;
    }

    const numericSizes = event.sizes.map((size) => Number(size));
    this.topHorizontalSizes = [numericSizes[0], numericSizes[1]];
    this.layoutPersistence.saveState({ topHorizontal: this.topHorizontalSizes });
  }

  onPanelSelected(panel: MainSidebarPanel): void {
    this.activePanel.set(panel);
    this.layoutPersistence.saveState({ activePanel: panel });
  }
}
