import { Component, signal, viewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MenuBar, Menu, MenuContent, MenuItem } from '@angular/aria/menu';
import { OverlayModule } from '@angular/cdk/overlay';
import { Dialog, DialogModule } from '@angular/cdk/dialog';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { heroCheckMicro } from '@ng-icons/heroicons/micro';
import { AboutDialogComponent } from '#app/features/main/main-layout/anien-menu-bar/about-dialog.component';
import { TimelineViewService } from '#app/features/main/main-layout/timeline-view.service';

@Component({
  selector: 'app-anien-menu-bar',
  standalone: true,
  imports: [
    CommonModule,
    MenuBar,
    Menu,
    MenuContent,
    MenuItem,
    OverlayModule,
    NgIcon,
    DialogModule,
  ],
  template: `
    <div ngMenuBar class="anien-menubar" (focusin)="onFocusIn()">
      <!-- About -->
      <div
        ngMenuItem
        class="menu-bar-item"
        value="About"
        tabindex="0"
        (click)="openAbout()"
        (keydown.enter)="openAbout()"
        (keydown.space)="openAbout()"
      >
        About
      </div>

      <!-- View -->
      <div
        ngMenuItem
        #viewEl
        #viewItem="ngMenuItem"
        class="menu-bar-item"
        value="View"
        [submenu]="viewMenu()"
      >
        view
      </div>
      <ng-template
        [cdkConnectedOverlayOpen]="rendered()"
        [cdkConnectedOverlay]="{ origin: viewEl, usePopover: 'inline' }"
        [cdkConnectedOverlayPositions]="[
          { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
        ]"
        cdkAttachPopoverAsChild
      >
        <div ngMenu #viewMenu="ngMenu" class="anien-menu">
          <ng-template ngMenuContent>
            <div
              ngMenuItem
              value="video clip timeline"
              tabindex="0"
              (click)="toggleVideoTimeline()"
              (keydown.enter)="toggleVideoTimeline()"
              (keydown.space)="toggleVideoTimeline()"
            >
              <ng-icon
                name="heroCheckMicro"
                class="check-icon"
                [style.visibility]="viewService.videoTimelineVisible() ? 'visible' : 'hidden'"
              ></ng-icon>
              <span class="label">video clip timeline</span>
            </div>
            <div
              ngMenuItem
              value="audio clip timeline"
              tabindex="0"
              (click)="toggleAudioTimeline()"
              (keydown.enter)="toggleAudioTimeline()"
              (keydown.space)="toggleAudioTimeline()"
            >
              <ng-icon
                name="heroCheckMicro"
                class="check-icon"
                [style.visibility]="viewService.audioTimelineVisible() ? 'visible' : 'hidden'"
              ></ng-icon>
              <span class="label">audio clip timeline</span>
            </div>
            <div
              ngMenuItem
              value="script(subtitle) timeline"
              tabindex="0"
              (click)="toggleScriptTimeline()"
              (keydown.enter)="toggleScriptTimeline()"
              (keydown.space)="toggleScriptTimeline()"
            >
              <ng-icon
                name="heroCheckMicro"
                class="check-icon"
                [style.visibility]="viewService.scriptTimelineVisible() ? 'visible' : 'hidden'"
              ></ng-icon>
              <span class="label">script(subtitle) timeline</span>
            </div>
            <div
              ngMenuItem
              value="keyframe timeline"
              tabindex="0"
              (click)="toggleKeyframeTimeline()"
              (keydown.enter)="toggleKeyframeTimeline()"
              (keydown.space)="toggleKeyframeTimeline()"
            >
              <ng-icon
                name="heroCheckMicro"
                class="check-icon"
                [style.visibility]="viewService.keyframeTimelineVisible() ? 'visible' : 'hidden'"
              ></ng-icon>
              <span class="label">keyframe timeline</span>
            </div>
          </ng-template>
        </div>
      </ng-template>

      <!-- Workspace -->
      <div
        ngMenuItem
        #workspaceEl
        #workspaceItem="ngMenuItem"
        class="menu-bar-item"
        value="Workspace"
        [submenu]="workspaceMenu()"
      >
        workspace
      </div>
      <ng-template
        [cdkConnectedOverlayOpen]="rendered()"
        [cdkConnectedOverlay]="{ origin: workspaceEl, usePopover: 'inline' }"
        [cdkConnectedOverlayPositions]="[
          { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
        ]"
        cdkAttachPopoverAsChild
      >
        <div ngMenu #workspaceMenu="ngMenu" class="anien-menu">
          <ng-template ngMenuContent>
            <div ngMenuItem value="timeline edit">
              <ng-icon name="heroCheckMicro" class="check-icon"></ng-icon>
              <span class="label">timeline edit</span>
            </div>
          </ng-template>
        </div>
      </ng-template>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      top: 1rem;
      left: 1rem;
      z-index: 1000;
      font-family: sans-serif;
      color: #fff;
    }

    .anien-menubar {
      display: flex;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      border-radius: 8px;
      background-color: rgba(30, 30, 30, 0.8);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .menu-bar-item {
      outline: none;
      cursor: pointer;
      padding: 0.25rem 0.6rem;
      font-size: 0.875rem;
      border-radius: 4px;
      transition: background-color 0.2s;
      user-select: none;
    }

    .menu-bar-item:hover,
    .menu-bar-item[data-active='true'] {
      background-color: rgba(255, 255, 255, 0.1);
    }

    .menu-bar-item:focus {
      outline: 2px solid rgba(255, 255, 255, 0.3);
    }

    .anien-menu {
      top: 8px;
      display: flex;
      flex-direction: column;
      padding: 0.5rem;
      border-radius: 8px;
      background-color: rgba(30, 30, 30, 0.95);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      min-width: 200px;
    }

    .anien-menu[data-visible='false'] {
      display: none;
    }

    [ngMenuItem] {
      outline: none;
      display: flex;
      cursor: pointer;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem;
      font-size: 0.875rem;
      border-radius: 4px;
      color: #ddd;
      transition:
        background-color 0.2s,
        color 0.2s;
    }

    [ngMenuItem][data-active='true'],
    [ngMenuItem]:hover {
      background-color: rgba(255, 255, 255, 0.1);
      color: #fff;
    }

    [ngMenuItem]:focus {
      outline: 2px solid rgba(255, 255, 255, 0.3);
    }

    .check-icon {
      font-size: 1rem;
      width: 1rem;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .label {
      flex: 1;
    }
  `,
  viewProviders: [provideIcons({ heroCheckMicro })],
})
export class AnienMenuBarComponent {
  viewMenu = viewChild<Menu<string>>('viewMenu');
  workspaceMenu = viewChild<Menu<string>>('workspaceMenu');

  private dialog = inject(Dialog);
  protected readonly viewService = inject(TimelineViewService);
  rendered = signal(false);

  onFocusIn() {
    this.rendered.set(true);
  }

  openAbout() {
    this.dialog.open(AboutDialogComponent, {
      minWidth: '300px',
    });
  }

  toggleScriptTimeline(): void {
    this.viewService.toggleScriptTimeline();
  }

  toggleVideoTimeline(): void {
    this.viewService.toggleVideoTimeline();
  }

  toggleAudioTimeline(): void {
    this.viewService.toggleAudioTimeline();
  }

  toggleKeyframeTimeline(): void {
    this.viewService.toggleKeyframeTimeline();
  }
}
