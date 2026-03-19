import { ComponentFixture, TestBed } from '@angular/core/testing';
import * as Y from 'yjs';
import { vi } from 'vitest';
import { AnienTimelineComponent } from './anien-timeline.component';
import { TimelineStateService } from '../../services/timeline-state.service';
import { YjsDocumentService } from '../../../../core/collaboration/yjs-document.service';

class FakeBroadcastChannel {
  public onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

  public postMessage(): void {
    // No-op for unit tests.
  }

  public close(): void {
    this.onmessage = null;
  }
}

class FakeYjsDocumentService {
  private readonly doc = new Y.Doc();
  private readonly channels = new Map<string, FakeBroadcastChannel>();

  public getDoc(): Y.Doc {
    return this.doc;
  }

  public getMap<T>(name: string): Y.Map<T> {
    return this.doc.getMap(name) as Y.Map<T>;
  }

  public onSynced(callback: () => void): void {
    callback();
  }

  public getBroadcastChannel(name: string): BroadcastChannel {
    const existing = this.channels.get(name);
    if (existing) {
      return existing as unknown as BroadcastChannel;
    }

    const channel = new FakeBroadcastChannel();
    this.channels.set(name, channel);
    return channel as unknown as BroadcastChannel;
  }
}

describe('AnienTimelineComponent', () => {
  let component: AnienTimelineComponent;
  let fixture: ComponentFixture<AnienTimelineComponent>;
  let stateService: TimelineStateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnienTimelineComponent],
      providers: [{ provide: YjsDocumentService, useClass: FakeYjsDocumentService }],
    }).compileComponents();

    fixture = TestBed.createComponent(AnienTimelineComponent);
    component = fixture.componentInstance;
    stateService = TestBed.inject(TimelineStateService);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders width and left style from ticks for strips', () => {
    stateService.resetToDemoTimeline();
    const rootFolderSourceId = stateService.rootFolderSourceId();
    expect(rootFolderSourceId).toBeTruthy();

    const stripId = stateService.addStrip(
      {
        parentFolderId: rootFolderSourceId ?? undefined,
        trackIndex: 10,
      },
      {
        sourceName: 'UI Position Probe',
        kind: 'generated',
        startTick: 123,
        durationTicks: 45,
      },
    );
    expect(stripId).toBeTruthy();
    fixture.detectChanges();

    const stripItem = component
      .timelineItems()
      .find((item) => item.id === stripId && item.type === 'strip');
    expect(stripItem?.absoluteStartTick).toBe(123);
    expect(stripItem?.durationTicks).toBe(45);

    const stripElements = Array.from(
      fixture.nativeElement.querySelectorAll('.timeline-main .strip') as NodeListOf<HTMLElement>,
    );
    const stripElement = stripElements.find((element) =>
      element.textContent?.includes('UI Position Probe'),
    );

    expect(stripElement).toBeTruthy();
    expect(stripElement?.style.left).toBe('calc(var(--timeline-tick-size) * 123)');
    expect(stripElement?.style.width).toBe('calc(var(--timeline-tick-size) * 45)');
  });

  it('renders strips with border-box sizing to avoid visual overlap from horizontal padding', () => {
    stateService.resetToDemoTimeline();
    fixture.detectChanges();

    const stripElement = fixture.nativeElement.querySelector(
      '.timeline-main .strip',
    ) as HTMLElement | null;

    expect(stripElement).toBeTruthy();
    if (!stripElement) {
      return;
    }

    expect(window.getComputedStyle(stripElement).boxSizing).toBe('border-box');
  });

  it('keeps same-row strips non-overlapping after drag move toward the left', () => {
    stateService.resetToDemoTimeline();
    const rootFolderSourceId = stateService.rootFolderSourceId();
    expect(rootFolderSourceId).toBeTruthy();

    const firstId = stateService.addStrip(
      {
        parentFolderId: rootFolderSourceId ?? undefined,
        trackIndex: 12,
      },
      {
        sourceName: 'Drag Left Base',
        kind: 'generated',
        startTick: 0,
        durationTicks: 100,
      },
    );
    const secondId = stateService.addStrip(
      {
        parentFolderId: rootFolderSourceId ?? undefined,
        trackIndex: 12,
      },
      {
        sourceName: 'Drag Left Target',
        kind: 'generated',
        startTick: 170,
        durationTicks: 60,
      },
    );
    expect(firstId).toBeTruthy();
    expect(secondId).toBeTruthy();

    fixture.detectChanges();

    const targetItem = component
      .timelineItems()
      .find((item) => item.id === secondId && item.type === 'strip');
    expect(targetItem).toBeTruthy();
    if (!targetItem || targetItem.type !== 'strip') {
      return;
    }

    const startX = 500;
    const startY = 400;
    component.onItemMouseDown(
      new MouseEvent('mousedown', { clientX: startX, clientY: startY }),
      targetItem,
    );

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 260, clientY: startY }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 260, clientY: startY }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 260, clientY: startY }));
    fixture.detectChanges();

    const sameRowItems = component
      .timelineItems()
      .filter((item) => item.type === 'strip' && item.absoluteStartRow === 12)
      .sort((left, right) => left.absoluteStartTick - right.absoluteStartTick);

    expect(sameRowItems.length).toBeGreaterThanOrEqual(2);
    for (let index = 1; index < sameRowItems.length; index += 1) {
      const previous = sameRowItems[index - 1];
      const current = sameRowItems[index];
      expect(previous.absoluteStartTick + previous.durationTicks).toBeLessThanOrEqual(
        current.absoluteStartTick,
      );
    }
  });

  it('updates the timeline tick-size CSS variable when zoom level changes', () => {
    stateService.setZoomLevel(2);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.style.getPropertyValue('--timeline-tick-size')).toBe('4px');
  });

  it('zooms around cursor anchor with Ctrl+mouse wheel', () => {
    fixture.detectChanges();

    const mainWrapper = component.mainWrapperRef?.nativeElement;
    expect(mainWrapper).toBeTruthy();
    if (!mainWrapper) {
      return;
    }

    mainWrapper.scrollLeft = 120;
    Object.defineProperty(mainWrapper, 'getBoundingClientRect', {
      value: () =>
        ({
          left: 50,
          top: 0,
          right: 650,
          bottom: 300,
          width: 600,
          height: 300,
          x: 50,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    });

    const anchorClientX = 250;
    const beforeTickSize = stateService.tickSizePx();
    const beforeAnchorTick = (mainWrapper.scrollLeft + (anchorClientX - 50)) / beforeTickSize;

    component.onHostWheel(
      new WheelEvent('wheel', {
        ctrlKey: true,
        deltaY: -100,
        clientX: anchorClientX,
      }),
    );
    fixture.detectChanges();

    const afterTickSize = stateService.tickSizePx();
    const afterAnchorTick = (mainWrapper.scrollLeft + (anchorClientX - 50)) / afterTickSize;
    expect(stateService.zoomLevel()).toBeGreaterThan(1);
    expect(Math.abs(afterAnchorTick - beforeAnchorTick)).toBeLessThan(0.001);
  });

  it('zooms with Ctrl+Space+left drag using drag start point as anchor', () => {
    fixture.detectChanges();

    const mainWrapper = component.mainWrapperRef?.nativeElement;
    expect(mainWrapper).toBeTruthy();
    if (!mainWrapper) {
      return;
    }

    mainWrapper.scrollLeft = 90;
    Object.defineProperty(mainWrapper, 'getBoundingClientRect', {
      value: () =>
        ({
          left: 40,
          top: 0,
          right: 640,
          bottom: 300,
          width: 600,
          height: 300,
          x: 40,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    });

    const anchorClientX = 220;
    const anchorViewportX = anchorClientX - 40;
    const beforeTickSize = stateService.tickSizePx();
    const beforeAnchorTick = (mainWrapper.scrollLeft + anchorViewportX) / beforeTickSize;

    component.onWindowKeydown(new KeyboardEvent('keydown', { code: 'Space', ctrlKey: true }));
    component.onTimelineMouseDown(
      new MouseEvent('mousedown', {
        button: 0,
        clientX: anchorClientX,
        clientY: 300,
        ctrlKey: true,
      }),
    );

    window.dispatchEvent(
      new MouseEvent('mousemove', {
        clientX: anchorClientX,
        clientY: 230,
      }),
    );
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: anchorClientX, clientY: 230 }));
    fixture.detectChanges();

    const afterTickSize = stateService.tickSizePx();
    const afterAnchorTick = (mainWrapper.scrollLeft + anchorViewportX) / afterTickSize;
    expect(stateService.zoomLevel()).toBeGreaterThan(1);
    expect(Math.abs(afterAnchorTick - beforeAnchorTick)).toBeLessThan(0.001);
  });

  it('undoes latest timeline change from timeline-actions Undo button', () => {
    stateService.resetToDemoTimeline();
    const rootFolderSourceId = stateService.rootFolderSourceId();
    expect(rootFolderSourceId).toBeTruthy();

    const countBefore = component.timelineItems().length;
    stateService.addStrip(
      {
        parentFolderId: rootFolderSourceId ?? undefined,
        trackIndex: 1,
      },
      {
        sourceName: 'Undo Button Probe',
        kind: 'generated',
        startTick: 12,
        durationTicks: 30,
      },
    );
    fixture.detectChanges();
    expect(component.timelineItems().length).toBe(countBefore + 1);

    const undoButton = Array.from(
      fixture.nativeElement.querySelectorAll('.timeline-actions button') as NodeListOf<HTMLElement>,
    ).find((button) => button.textContent?.trim() === 'Undo') as HTMLButtonElement | undefined;

    expect(undoButton).toBeTruthy();
    expect(undoButton?.disabled).toBe(false);

    undoButton?.click();
    fixture.detectChanges();

    expect(component.timelineItems().length).toBe(countBefore);
  });

  it('undoes latest timeline change with Ctrl+Z', () => {
    stateService.resetToDemoTimeline();
    const rootFolderSourceId = stateService.rootFolderSourceId();
    expect(rootFolderSourceId).toBeTruthy();

    const countBefore = component.timelineItems().length;
    stateService.addStrip(
      {
        parentFolderId: rootFolderSourceId ?? undefined,
        trackIndex: 1,
      },
      {
        sourceName: 'Undo Shortcut Probe',
        kind: 'generated',
        startTick: 18,
        durationTicks: 28,
      },
    );
    fixture.detectChanges();
    expect(component.timelineItems().length).toBe(countBefore + 1);

    component.onWindowKeydown(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    fixture.detectChanges();

    expect(component.timelineItems().length).toBe(countBefore);
  });

  it('reparents a strip when dropped inside folder body', () => {
    stateService.resetToDemoTimeline();
    const rootFolderSourceId = stateService.rootFolderSourceId();
    expect(rootFolderSourceId).toBeTruthy();

    const folderPlacementId = stateService.addFolder(
      {
        parentFolderId: rootFolderSourceId ?? undefined,
        trackIndex: 2,
      },
      {
        name: 'Drop Target Folder',
        startTick: 100,
        durationTicks: 180,
        bodyTrackCount: 2,
      },
    );
    const stripPlacementId = stateService.addStrip(
      {
        parentFolderId: rootFolderSourceId ?? undefined,
        trackIndex: 7,
      },
      {
        sourceName: 'Reparent Probe Strip',
        kind: 'generated',
        startTick: 20,
        durationTicks: 40,
      },
    );
    expect(folderPlacementId).toBeTruthy();
    expect(stripPlacementId).toBeTruthy();

    fixture.detectChanges();

    const folderItem = component
      .timelineItems()
      .find((item) => item.id === folderPlacementId && item.type === 'folder');
    const stripItem = component
      .timelineItems()
      .find((item) => item.id === stripPlacementId && item.type === 'strip');
    expect(folderItem).toBeTruthy();
    expect(stripItem).toBeTruthy();
    if (!folderItem || !stripItem || folderItem.type !== 'folder' || stripItem.type !== 'strip') {
      return;
    }

    const mainWrapper = component.mainWrapperRef?.nativeElement;
    expect(mainWrapper).toBeTruthy();
    if (!mainWrapper) {
      return;
    }

    mainWrapper.scrollLeft = 0;
    mainWrapper.scrollTop = 0;
    Object.defineProperty(mainWrapper, 'getBoundingClientRect', {
      value: () =>
        ({
          left: 0,
          top: 0,
          right: 1200,
          bottom: 800,
          width: 1200,
          height: 800,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    });

    const targetStartTick = folderItem.absoluteStartTick + 10;
    const targetStartRow = folderItem.absoluteStartRow + 1;
    const deltaTicks = targetStartTick - stripItem.absoluteStartTick;
    const deltaRows = targetStartRow - stripItem.absoluteStartRow;
    const startX = 300;
    const startY = 300;
    const moveX = startX + deltaTicks * stateService.tickSizePx();
    const moveY = startY + deltaRows * 34;

    component.onItemMouseDown(
      new MouseEvent('mousedown', { clientX: startX, clientY: startY }),
      stripItem,
    );
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: moveX, clientY: moveY }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: moveX, clientY: moveY }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: moveX, clientY: moveY }));
    fixture.detectChanges();

    const movedStrip = component
      .timelineItems()
      .find((item) => item.id === stripPlacementId && item.type === 'strip');
    expect(movedStrip?.parentFolderId).toBe(folderItem.sourceId);
  });

  it('does not reparent a strip when dropped on folder header area', () => {
    stateService.resetToDemoTimeline();
    const rootFolderSourceId = stateService.rootFolderSourceId();
    expect(rootFolderSourceId).toBeTruthy();

    const folderPlacementId = stateService.addFolder(
      {
        parentFolderId: rootFolderSourceId ?? undefined,
        trackIndex: 2,
      },
      {
        name: 'Header Guard Folder',
        startTick: 160,
        durationTicks: 180,
        bodyTrackCount: 2,
      },
    );
    const stripPlacementId = stateService.addStrip(
      {
        parentFolderId: rootFolderSourceId ?? undefined,
        trackIndex: 8,
      },
      {
        sourceName: 'Header Drop Probe',
        kind: 'generated',
        startTick: 10,
        durationTicks: 40,
      },
    );
    expect(folderPlacementId).toBeTruthy();
    expect(stripPlacementId).toBeTruthy();

    fixture.detectChanges();

    const folderItem = component
      .timelineItems()
      .find((item) => item.id === folderPlacementId && item.type === 'folder');
    const stripItem = component
      .timelineItems()
      .find((item) => item.id === stripPlacementId && item.type === 'strip');
    expect(folderItem).toBeTruthy();
    expect(stripItem).toBeTruthy();
    if (!folderItem || !stripItem || folderItem.type !== 'folder' || stripItem.type !== 'strip') {
      return;
    }

    const mainWrapper = component.mainWrapperRef?.nativeElement;
    expect(mainWrapper).toBeTruthy();
    if (!mainWrapper) {
      return;
    }

    mainWrapper.scrollLeft = 0;
    mainWrapper.scrollTop = 0;
    Object.defineProperty(mainWrapper, 'getBoundingClientRect', {
      value: () =>
        ({
          left: 0,
          top: 0,
          right: 1200,
          bottom: 800,
          width: 1200,
          height: 800,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    });

    const targetStartTick = folderItem.absoluteStartTick + 20;
    const targetStartRow = folderItem.absoluteStartRow;
    const deltaTicks = targetStartTick - stripItem.absoluteStartTick;
    const deltaRows = targetStartRow - stripItem.absoluteStartRow;
    const startX = 320;
    const startY = 300;
    const moveX = startX + deltaTicks * stateService.tickSizePx();
    const moveY = startY + deltaRows * 34;

    component.onItemMouseDown(
      new MouseEvent('mousedown', { clientX: startX, clientY: startY }),
      stripItem,
    );
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: moveX, clientY: moveY }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: moveX, clientY: moveY }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: moveX, clientY: moveY }));
    fixture.detectChanges();

    const movedStrip = component
      .timelineItems()
      .find((item) => item.id === stripPlacementId && item.type === 'strip');
    expect(movedStrip?.parentFolderId).toBe(rootFolderSourceId);
  });

  it('applies clip-path to child strip that overflows parent folder bounds', () => {
    stateService.resetToDemoTimeline();
    const rootFolderSourceId = stateService.rootFolderSourceId();
    expect(rootFolderSourceId).toBeTruthy();

    const folderPlacementId = stateService.addFolder(
      {
        parentFolderId: rootFolderSourceId ?? undefined,
        trackIndex: 3,
      },
      {
        name: 'Clip Parent Folder',
        startTick: 100,
        durationTicks: 100,
        bodyTrackCount: 1,
      },
    );
    expect(folderPlacementId).toBeTruthy();
    fixture.detectChanges();

    const folderItem = component
      .timelineItems()
      .find((item) => item.id === folderPlacementId && item.type === 'folder');
    expect(folderItem).toBeTruthy();
    if (!folderItem || folderItem.type !== 'folder') {
      return;
    }

    const childStripId = stateService.addStrip(
      {
        parentFolderId: folderItem.sourceId,
        trackIndex: 0,
      },
      {
        sourceName: 'Overflow Child Strip',
        kind: 'generated',
        startTick: 80,
        durationTicks: 60,
      },
    );
    expect(childStripId).toBeTruthy();
    fixture.detectChanges();

    const stripElements = Array.from(
      fixture.nativeElement.querySelectorAll('.timeline-main .strip') as NodeListOf<HTMLElement>,
    );
    const childStripElement = stripElements.find((element) =>
      element.textContent?.includes('Overflow Child Strip'),
    );

    expect(childStripElement).toBeTruthy();
    expect(childStripElement?.style.clipPath).toContain('inset(');
  });

  it('deduplicates multiple requestRender calls into a single frame detectChanges', () => {
    const rafQueue: FrameRequestCallback[] = [];
    const detectChangesSpy = vi.spyOn(
      (component as unknown as { changeDetectorRef: { detectChanges: () => void } })
        .changeDetectorRef,
      'detectChanges',
    );
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (callback: FrameRequestCallback) => {
        rafQueue.push(callback);
        return rafQueue.length;
      },
    );

    (component as unknown as { requestRender: () => void }).requestRender();
    (component as unknown as { requestRender: () => void }).requestRender();
    expect(rafQueue.length).toBe(1);

    for (const callback of [...rafQueue]) {
      callback(performance.now());
    }

    expect(detectChangesSpy).toHaveBeenCalledTimes(1);
  });

  it('drag loop marks render as needed and does not call detectChanges synchronously', () => {
    const rafQueue: FrameRequestCallback[] = [];
    const detectChangesSpy = vi.spyOn(
      (component as unknown as { changeDetectorRef: { detectChanges: () => void } })
        .changeDetectorRef,
      'detectChanges',
    );
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (callback: FrameRequestCallback) => {
        rafQueue.push(callback);
        return rafQueue.length;
      },
    );
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    const rootFolderSourceId = stateService.rootFolderSourceId();
    expect(rootFolderSourceId).toBeTruthy();
    if (!rootFolderSourceId) {
      return;
    }

    const stripId = stateService.addStrip(
      {
        parentFolderId: rootFolderSourceId,
        trackIndex: 0,
      },
      {
        sourceName: 'Loop Probe Strip',
        kind: 'generated',
        startTick: 0,
        durationTicks: 20,
      },
    );
    expect(stripId).toBeTruthy();
    fixture.detectChanges();

    const stripItem = component
      .timelineItems()
      .find((item) => item.id === stripId && item.type === 'strip');
    expect(stripItem).toBeTruthy();
    if (!stripItem || stripItem.type !== 'strip') {
      return;
    }

    component.onItemMouseDown(
      new MouseEvent('mousedown', { clientX: 240, clientY: 220, button: 0 }),
      stripItem,
    );

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 260, clientY: 220 }));
    expect(detectChangesSpy).toHaveBeenCalledTimes(0);
    expect(rafQueue.length).toBeGreaterThan(0);

    const firstCallbacks = [...rafQueue];
    rafQueue.length = 0;
    for (const callback of firstCallbacks) {
      callback(performance.now());
    }

    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 240, clientY: 220 }));

    const secondCallbacks = [...rafQueue];
    rafQueue.length = 0;
    for (const callback of secondCallbacks) {
      callback(performance.now());
    }

    expect(detectChangesSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(detectChangesSpy.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
