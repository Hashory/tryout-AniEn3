import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import * as Y from 'yjs';
import { vi } from 'vitest';
import { AnienTimelineComponent } from '#app/features/main/main-layout/timeline/anien-timeline/anien-timeline.component';
import {
  StripVM,
  TimelineStateService,
} from '#app/features/main/main-layout/timeline/services/timeline-state.service';
import { TimelineUploadService } from '#app/features/main/main-layout/timeline/services/timeline-upload.service';
import { YjsDocumentService } from '#app/core/collaboration/yjs-document.service';

class FakeYjsDocumentService {
  private readonly doc = new Y.Doc();
  private readonly _isConnected = signal(true);
  private readonly _isSynced = signal(true);
  public readonly isConnected = this._isConnected.asReadonly();
  public readonly isSynced = this._isSynced.asReadonly();

  public getDoc(): Y.Doc {
    return this.doc;
  }

  public getMap<T>(name: string): Y.Map<T> {
    return this.doc.getMap(name) as Y.Map<T>;
  }

  public onSynced(callback: () => void): void {
    callback();
  }

  public setConnectionState(isConnected: boolean, isSynced: boolean): void {
    this._isConnected.set(isConnected);
    this._isSynced.set(isSynced);
  }
}

describe('AnienTimelineComponent', () => {
  let component: AnienTimelineComponent;
  let fixture: ComponentFixture<AnienTimelineComponent>;
  let stateService: TimelineStateService;
  let fakeCollab: FakeYjsDocumentService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnienTimelineComponent],
      providers: [{ provide: YjsDocumentService, useClass: FakeYjsDocumentService }],
    }).compileComponents();

    fixture = TestBed.createComponent(AnienTimelineComponent);
    component = fixture.componentInstance;
    stateService = TestBed.inject(TimelineStateService);
    fakeCollab = TestBed.inject(YjsDocumentService) as unknown as FakeYjsDocumentService;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const setMainWrapperRect = (): void => {
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
  };

  const createDropEvent = (
    target: HTMLElement,
    dataTransfer: DataTransfer,
    point: { clientX: number; clientY: number },
  ): DragEvent => {
    const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperties(event, {
      clientX: { value: point.clientX },
      clientY: { value: point.clientY },
      target: { value: target },
      dataTransfer: { value: dataTransfer },
    });
    return event;
  };

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows loading text while websocket is disconnected or data is syncing', () => {
    fakeCollab.setConnectionState(false, false);
    fixture.detectChanges();

    const loadingState = fixture.nativeElement.querySelector('.timeline-loading-state');
    expect(loadingState?.textContent).toContain('Loading Data...');
    expect(fixture.nativeElement.querySelector('.timeline-main')).toBeFalsy();

    fakeCollab.setConnectionState(true, true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.timeline-loading-state')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.timeline-main')).toBeTruthy();
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

  it('uploads dropped files and stores upload metadata in strip source', async () => {
    fixture.detectChanges();
    setMainWrapperRect();

    const uploadService = TestBed.inject(TimelineUploadService);
    const uploadSpy = vi.spyOn(uploadService, 'uploadFile').mockResolvedValue({
      fileName: 'asset.png',
      mimeType: 'image/png',
      size: 4,
      filePath: '/uploads/mock/asset.png',
      fileUrl: 'http://localhost/ws/uploads/mock/asset.png',
    });
    const addStripSpy = vi.spyOn(stateService, 'addStrip');

    const timelineMain = fixture.nativeElement.querySelector(
      '.timeline-main',
    ) as HTMLElement | null;
    expect(timelineMain).toBeTruthy();
    if (!timelineMain) {
      return;
    }

    const file = new File(['test'], 'asset.png', { type: 'image/png' });
    const dataTransfer = {
      files: [file],
      getData: () => '',
    } as unknown as DataTransfer;
    const dropEvent = createDropEvent(timelineMain, dataTransfer, { clientX: 120, clientY: 120 });

    await component.onTimelineDrop(dropEvent);

    expect(uploadSpy).toHaveBeenCalledTimes(1);
    expect(addStripSpy).toHaveBeenCalledTimes(1);
    const addStripPayload = addStripSpy.mock.calls[0]?.[1];
    expect(addStripPayload?.sourceName).toBe('asset.png');
    expect(addStripPayload?.kind).toBe('media');
    expect(addStripPayload?.metadata).toEqual({
      uploadedFilePath: '/uploads/mock/asset.png',
      uploadedFileUrl: 'http://localhost/ws/uploads/mock/asset.png',
      originalFileName: 'asset.png',
      mimeType: 'image/png',
      size: 4,
    });
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

  it('adds a folder with five scheduled strips from Create action button', () => {
    stateService.resetToDemoTimeline();
    fixture.detectChanges();

    const createSheduleFolderButton = Array.from(
      fixture.nativeElement.querySelectorAll('.timeline-actions button') as NodeListOf<HTMLElement>,
    ).find((button) => button.textContent?.trim() === 'Add Shedule Folder') as
      | HTMLButtonElement
      | undefined;

    expect(createSheduleFolderButton).toBeTruthy();
    createSheduleFolderButton?.click();
    fixture.detectChanges();

    const createdFolder = component
      .timelineItems()
      .find((item) => item.type === 'folder' && item.name === 'Shedule Preset Folder');

    expect(createdFolder).toBeTruthy();
    if (!createdFolder || createdFolder.type !== 'folder') {
      return;
    }

    const createdStrips = component
      .timelineItems()
      .filter(
        (item): item is StripVM =>
          item.type === 'strip' && item.parentFolderId === createdFolder.sourceId,
      );

    expect(createdStrips).toHaveLength(5);
    expect(createdFolder.bodyTrackCount).toBe(10);
    expect(createdStrips.every((item) => item.laneSpan === 2)).toBe(true);
    expect(createdStrips.every((item) => item.sourceKind === 'solid')).toBe(true);

    const stripStartTicks = new Set(createdStrips.map((item) => item.startTick));
    expect(stripStartTicks.size).toBe(1);
    expect(stripStartTicks.has(0)).toBe(true);

    const startRows = createdStrips.map((item) => item.startRow).sort((a, b) => a - b);
    expect(startRows).toEqual([0, 2, 4, 6, 8]);

    const orderedBrands = [...createdStrips]
      .sort((left, right) => left.startRow - right.startRow)
      .map((item) => item.scheduleBrand);
    expect(orderedBrands).toEqual(['ae', 'photoshop', 'maya', 'clipstudio', 'clipstudio']);
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

  it('converts shedule strip into a 3x2 folder on external drop', () => {
    stateService.resetToDemoTimeline();
    const rootFolderSourceId = stateService.rootFolderSourceId();
    expect(rootFolderSourceId).toBeTruthy();

    const stripPlacementId = stateService.addStrip(
      {
        parentFolderId: rootFolderSourceId ?? undefined,
        trackIndex: 5,
      },
      {
        sourceName: 'Alpha shedule Beta',
        kind: 'solid',
        startTick: 40,
        durationTicks: 300,
      },
    );
    expect(stripPlacementId).toBeTruthy();
    fixture.detectChanges();

    const stripItem = component
      .timelineItems()
      .find((item) => item.id === stripPlacementId && item.type === 'strip');
    expect(stripItem).toBeTruthy();
    if (!stripItem || stripItem.type !== 'strip') {
      return;
    }

    component.onStripExternalDrop(new Event('drop') as DragEvent, stripItem);
    fixture.detectChanges();

    const removedStrip = component
      .timelineItems()
      .find((item) => item.id === stripPlacementId && item.type === 'strip');
    expect(removedStrip).toBeFalsy();

    const createdFolder = component
      .timelineItems()
      .find(
        (item) =>
          item.type === 'folder' &&
          item.startTick === 40 &&
          item.startRow === 5 &&
          item.durationTicks === 300,
      );
    expect(createdFolder).toBeTruthy();
    if (!createdFolder || createdFolder.type !== 'folder') {
      return;
    }

    expect(createdFolder.name).toBe('Alpha  Beta');
    expect(createdFolder.scheduleBrand).toBe('ae');

    const childStrips = component
      .timelineItems()
      .filter(
        (item): item is StripVM =>
          item.type === 'strip' && item.parentFolderId === createdFolder.sourceId,
      );
    expect(childStrips).toHaveLength(6);
    expect(childStrips.every((item) => item.laneSpan === 2)).toBe(true);
    expect(childStrips.every((item) => item.sourceKind !== 'solid')).toBe(true);

    const startRows = childStrips.map((item) => item.startRow).sort((left, right) => left - right);
    expect(startRows).toEqual([0, 0, 0, 2, 2, 2]);

    const startTicks = [...new Set(childStrips.map((item) => item.startTick))].sort(
      (left, right) => left - right,
    );
    expect(startTicks).toEqual([0, 100, 200]);
  });

  it('creates a strip when plain text is dropped on timeline background', () => {
    stateService.resetToDemoTimeline();
    fixture.detectChanges();
    setMainWrapperRect();

    const timelineMain = fixture.nativeElement.querySelector(
      '.timeline-main',
    ) as HTMLElement | null;
    expect(timelineMain).toBeTruthy();
    if (!timelineMain) {
      return;
    }

    const countBefore = component.timelineItems().length;
    const dataTransfer = {
      files: [] as unknown as FileList,
      getData: (type: string) => (type === 'text/plain' ? 'Dropped body text' : ''),
    } as unknown as DataTransfer;

    component.onTimelineDrop(
      createDropEvent(timelineMain, dataTransfer, {
        clientX: 80,
        clientY: 68,
      }),
    );
    fixture.detectChanges();

    const createdStrip = component
      .timelineItems()
      .find((item): item is StripVM => item.type === 'strip' && item.sourceName === 'Dropped Text');

    expect(component.timelineItems().length).toBe(countBefore + 1);
    expect(createdStrip).toBeTruthy();
    expect(createdStrip?.durationTicks).toBe(120);
  });

  it('creates a strip when image file is dropped on timeline background', () => {
    stateService.resetToDemoTimeline();
    fixture.detectChanges();
    setMainWrapperRect();

    const timelineMain = fixture.nativeElement.querySelector(
      '.timeline-main',
    ) as HTMLElement | null;
    expect(timelineMain).toBeTruthy();
    if (!timelineMain) {
      return;
    }

    const countBefore = component.timelineItems().length;
    const imageFile = new File(['image-bytes'], 'drop-image.png', { type: 'image/png' });
    const dataTransfer = {
      files: [imageFile] as unknown as FileList,
      getData: () => '',
    } as unknown as DataTransfer;

    component.onTimelineDrop(
      createDropEvent(timelineMain, dataTransfer, {
        clientX: 120,
        clientY: 102,
      }),
    );
    fixture.detectChanges();

    const createdStrip = component
      .timelineItems()
      .find(
        (item): item is StripVM => item.type === 'strip' && item.sourceName === 'drop-image.png',
      );

    expect(component.timelineItems().length).toBe(countBefore + 1);
    expect(createdStrip).toBeTruthy();
    expect(createdStrip?.durationTicks).toBe(300);
  });

  it('does not create a strip when dropped content is unsupported', () => {
    stateService.resetToDemoTimeline();
    fixture.detectChanges();
    setMainWrapperRect();

    const timelineMain = fixture.nativeElement.querySelector(
      '.timeline-main',
    ) as HTMLElement | null;
    expect(timelineMain).toBeTruthy();
    if (!timelineMain) {
      return;
    }

    const countBefore = component.timelineItems().length;
    const dataTransfer = {
      files: [] as unknown as FileList,
      getData: () => '',
    } as unknown as DataTransfer;

    component.onTimelineDrop(
      createDropEvent(timelineMain, dataTransfer, {
        clientX: 200,
        clientY: 170,
      }),
    );
    fixture.detectChanges();

    expect(component.timelineItems().length).toBe(countBefore);
  });

  it('does not create a strip when dropping over an existing strip', () => {
    stateService.resetToDemoTimeline();
    fixture.detectChanges();
    setMainWrapperRect();

    const stripElement = fixture.nativeElement.querySelector(
      '.timeline-main .strip',
    ) as HTMLElement | null;
    expect(stripElement).toBeTruthy();
    if (!stripElement) {
      return;
    }

    const countBefore = component.timelineItems().length;
    const dataTransfer = {
      files: [] as unknown as FileList,
      getData: (type: string) => (type === 'text/plain' ? 'Should not create' : ''),
    } as unknown as DataTransfer;

    component.onTimelineDrop(
      createDropEvent(stripElement, dataTransfer, {
        clientX: 60,
        clientY: 40,
      }),
    );
    fixture.detectChanges();

    expect(component.timelineItems().length).toBe(countBefore);
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
