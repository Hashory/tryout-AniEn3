import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type MainSidebarPanel = 'task' | 'timeline';

@Component({
  selector: 'app-anien-sidebar',
  imports: [],
  template: `
    <nav class="sidebar" aria-label="Main sidebar">
      <div class="sidebar-header" aria-hidden="true">
        <span class="shape triangle"></span>
      </div>

      <button
        type="button"
        class="sidebar-item"
        [class.active]="activePanel() === 'task'"
        [attr.aria-pressed]="activePanel() === 'task'"
        (click)="selectPanel('task')"
      >
        <span class="shape circle" aria-hidden="true"></span>
        <span class="sidebar-label">Task</span>
      </button>

      <button
        type="button"
        class="sidebar-item"
        [class.active]="activePanel() === 'timeline'"
        [attr.aria-pressed]="activePanel() === 'timeline'"
        (click)="selectPanel('timeline')"
      >
        <span class="shape square" aria-hidden="true"></span>
        <span class="sidebar-label">Timeline</span>
      </button>
    </nav>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }

      .sidebar {
        width: 92px;
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px 8px;
        box-sizing: border-box;
        background-color: #101417;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      .sidebar-header {
        height: 40px;
        display: flex;
        justify-content: center;
        align-items: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        margin-bottom: 2px;
      }

      .sidebar-item {
        border: 0;
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-height: 68px;
        padding: 8px 6px;
        border-radius: 8px;
        cursor: pointer;
        color: rgba(255, 255, 255, 0.75);
        background: transparent;
        font-size: 11px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        transition:
          background-color 0.2s,
          color 0.2s;
      }

      .sidebar-item:hover,
      .sidebar-item:focus-visible,
      .sidebar-item.active {
        color: #ffffff;
        background-color: rgba(255, 255, 255, 0.08);
        outline: none;
      }

      .sidebar-label {
        line-height: 1;
      }

      .shape {
        display: inline-block;
      }

      .shape.circle {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid currentColor;
      }

      .shape.square {
        width: 14px;
        height: 14px;
        border: 2px solid currentColor;
      }

      .shape.triangle {
        width: 0;
        height: 0;
        border-left: 8px solid transparent;
        border-right: 8px solid transparent;
        border-bottom: 14px solid #ffffff;
        opacity: 0.85;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnienSidebarComponent {
  readonly activePanel = input<MainSidebarPanel>('timeline');
  readonly panelSelected = output<MainSidebarPanel>();

  selectPanel(panel: MainSidebarPanel): void {
    this.panelSelected.emit(panel);
  }
}
