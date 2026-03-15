import { ComponentFixture, TestBed } from '@angular/core/testing';
import * as Y from 'yjs';
import { AnienTimelineComponent } from './anien-timeline.component';
import { TimelineStateService } from '../../services/timeline-state.service';
import { YjsDocumentService } from '../../../../core/collaboration/yjs-document.service';

class FakeBroadcastChannel {
  public onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

  public postMessage(): void {
    // No-op for unit tests.
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
});
