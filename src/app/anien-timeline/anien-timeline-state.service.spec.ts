import { TestBed } from '@angular/core/testing';
import { TimelineStateService, FolderVM, StripVM } from './anien-timeline-state.service';
import { YjsTimelineService } from './anien-timeline-store.service';
import type { Folder, Strip } from './anien-timeline.types';

class TimelineServiceStub {
  private snapshot: Folder | null = null;
  private readonly listeners = new Set<(snapshot: Folder | null) => void>();

  public subscribeTimeline(listener: (snapshot: Folder | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setSnapshot(snapshot: Folder | null): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }

  public addTrack(): void {
    // no-op for tests
  }
}

describe('TimelineStateService', () => {
  let service: TimelineStateService;
  let timelineServiceStub: TimelineServiceStub;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TimelineStateService,
        { provide: YjsTimelineService, useClass: TimelineServiceStub },
      ],
    });

    timelineServiceStub = TestBed.inject(YjsTimelineService) as unknown as TimelineServiceStub;

    const nestedStrip: Strip = {
      id: 'strip-child',
      type: 'strip',
      source: 'Child Clip',
      startFrame: 40,
      length: 10,
    };

    const nestedFolder: Folder = {
      id: 'folder-nested',
      type: 'folder',
      name: 'Nested Folder',
      startFrame: 100,
      length: 200,
      root: false,
      strips: [[nestedStrip]],
    };

    const topStrip: Strip = {
      id: 'strip-root',
      type: 'strip',
      source: 'Root Clip',
      startFrame: 10,
      length: 50,
    };

    const rootFolder: Folder = {
      id: 'folder-root',
      type: 'folder',
      name: 'Root Folder',
      startFrame: 30,
      length: 400,
      root: true,
      strips: [[topStrip], [nestedFolder]],
    };

    timelineServiceStub.setSnapshot(rootFolder);

    service = TestBed.inject(TimelineStateService);
  });

  it('uses root frame offsets for nested timeline items', () => {
    service.toggleFolderExpansion('folder-nested');

    const items = service.timelineItems();
    const folderVm = items.find((item) => item.id === 'folder-nested') as FolderVM | undefined;
    const nestedStripVm = items.find((item) => item.id === 'strip-child') as StripVM | undefined;
    const topStripVm = items.find((item) => item.id === 'strip-root') as StripVM | undefined;

    expect(folderVm?.startFrame).toBe(130);
    expect(nestedStripVm?.startFrame).toBe(170);
    expect(topStripVm?.startFrame).toBe(40);
  });
});
