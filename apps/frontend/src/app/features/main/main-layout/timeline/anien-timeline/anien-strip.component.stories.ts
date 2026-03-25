import type { Meta, StoryObj } from '@storybook/angular';
import { AnienStripComponent } from '#app/features/main/main-layout/timeline/anien-timeline/anien-strip.component';
import type { StripVM } from '#app/features/main/main-layout/timeline/services/timeline-state.service';

const baseStrip: StripVM = {
  id: 'strip-story',
  type: 'strip',
  sourceId: 'src-1',
  sourceName: 'Interview_Broll_01.mov',
  sourceKind: 'media',
  scheduleBrand: null,
  sourceOffsetTicks: 0,
  durationTicks: 120,
  startTick: 20,
  startRow: 2,
  laneSpan: 1,
  rowSpan: 1,
  ordinal: 1,
  isSelected: false,
  parentFolderId: 'root',
  parentStartTick: 0,
  absoluteStartTick: 20,
  absoluteStartRow: 2,
};

const makeStrip = (overrides: Partial<StripVM>): StripVM => ({
  ...baseStrip,
  ...overrides,
});

const meta: Meta<AnienStripComponent> = {
  title: 'Timeline/Strip',
  component: AnienStripComponent,
  tags: ['autodocs'],
  args: {
    item: baseStrip,
    clipPath: null,
    sheduleStrip: false,
    scheduleBrand: 'ae',
  },
};

export default meta;

type Story = StoryObj<AnienStripComponent>;

export const Unselected: Story = {
  args: {
    item: makeStrip({
      sourceName: 'Unselected Strip',
      isSelected: false,
      laneSpan: 1,
      rowSpan: 1,
      durationTicks: 120,
    }),
  },
};

export const Selected: Story = {
  args: {
    item: makeStrip({
      sourceName: 'Selected Strip',
      isSelected: true,
      laneSpan: 1,
      rowSpan: 1,
      durationTicks: 120,
    }),
  },
};

export const LaneSpanOne: Story = {
  name: 'Lane Span 1',
  args: {
    item: makeStrip({
      sourceName: 'Lane 1 Strip',
      laneSpan: 1,
      rowSpan: 1,
      durationTicks: 160,
      isSelected: false,
    }),
  },
};

export const LaneSpanTwo: Story = {
  name: 'Lane Span 2',
  args: {
    item: makeStrip({
      sourceName: 'Lane 2 Strip',
      laneSpan: 2,
      rowSpan: 2,
      durationTicks: 160,
      isSelected: false,
    }),
  },
};

export const WidthShort: Story = {
  name: 'Width Short (60 ticks)',
  args: {
    item: makeStrip({
      sourceName: 'Short Strip',
      durationTicks: 60,
      laneSpan: 1,
      rowSpan: 1,
      isSelected: false,
    }),
  },
};

export const WidthLong: Story = {
  name: 'Width Long (320 ticks)',
  args: {
    item: makeStrip({
      sourceName: 'Long Strip',
      durationTicks: 320,
      laneSpan: 2,
      rowSpan: 2,
      isSelected: true,
      absoluteStartTick: 10,
    }),
  },
};

export const ScheduleAfterEffects: Story = {
  name: 'Schedule - After Effects',
  args: {
    sheduleStrip: true,
    scheduleBrand: 'ae',
    item: makeStrip({
      sourceName: 'AfterEffects Opening',
      sourceKind: 'solid',
      scheduleBrand: 'ae',
      laneSpan: 2,
      rowSpan: 2,
      durationTicks: 180,
    }),
  },
};

export const SchedulePhotoshop: Story = {
  name: 'Schedule - Photoshop',
  args: {
    sheduleStrip: true,
    scheduleBrand: 'photoshop',
    item: makeStrip({
      sourceName: 'Photoshop Matte Paint',
      sourceKind: 'solid',
      scheduleBrand: 'photoshop',
      laneSpan: 2,
      rowSpan: 2,
      durationTicks: 180,
    }),
  },
};

export const ScheduleMaya: Story = {
  name: 'Schedule - Autodesk Maya',
  args: {
    sheduleStrip: true,
    scheduleBrand: 'maya',
    item: makeStrip({
      sourceName: 'Maya Camera Layout',
      sourceKind: 'solid',
      scheduleBrand: 'maya',
      laneSpan: 2,
      rowSpan: 2,
      durationTicks: 180,
    }),
  },
};

export const ScheduleClipStudio: Story = {
  name: 'Schedule - ClipStudio',
  args: {
    sheduleStrip: true,
    scheduleBrand: 'clipstudio',
    item: makeStrip({
      sourceName: 'ClipStudio Character Frame',
      sourceKind: 'solid',
      scheduleBrand: 'clipstudio',
      laneSpan: 2,
      rowSpan: 2,
      durationTicks: 180,
    }),
  },
};

export const SchedulePresetOrder: Story = {
  name: 'Schedule - Preset Order',
  render: () => ({
    props: {
      strips: [
        makeStrip({
          id: 'schedule-order-1',
          sourceId: 'schedule-source-1',
          sourceName: 'AfterEffects Schedule Strip',
          sourceKind: 'solid',
          scheduleBrand: 'ae',
          startRow: 0,
          absoluteStartRow: 0,
          laneSpan: 2,
          rowSpan: 2,
        }),
        makeStrip({
          id: 'schedule-order-2',
          sourceId: 'schedule-source-2',
          sourceName: 'Photoshop Schedule Strip',
          sourceKind: 'solid',
          scheduleBrand: 'photoshop',
          startRow: 2,
          absoluteStartRow: 2,
          laneSpan: 2,
          rowSpan: 2,
        }),
        makeStrip({
          id: 'schedule-order-3',
          sourceId: 'schedule-source-3',
          sourceName: 'Maya Schedule Strip',
          sourceKind: 'solid',
          scheduleBrand: 'maya',
          startRow: 4,
          absoluteStartRow: 4,
          laneSpan: 2,
          rowSpan: 2,
        }),
        makeStrip({
          id: 'schedule-order-4',
          sourceId: 'schedule-source-4',
          sourceName: 'ClipStudio Schedule Strip',
          sourceKind: 'solid',
          scheduleBrand: 'clipstudio',
          startRow: 6,
          absoluteStartRow: 6,
          laneSpan: 2,
          rowSpan: 2,
        }),
        makeStrip({
          id: 'schedule-order-5',
          sourceId: 'schedule-source-5',
          sourceName: 'ClipStudio Schedule Strip 2',
          sourceKind: 'solid',
          scheduleBrand: 'clipstudio',
          startRow: 8,
          absoluteStartRow: 8,
          laneSpan: 2,
          rowSpan: 2,
        }),
      ],
    },
    template: `
      <div style="position: relative; height: 360px; width: 680px; background: #0b0f12; --timeline-tick-size: 2px; --timeline-track-height: 34px; --timeline-strip-offset: 2px; --timeline-strip-padding-x: 9px;">
        @for (strip of strips; track strip.id) {
          <app-anien-strip
            [item]="strip"
            [clipPath]="null"
            [sheduleStrip]="true"
            [scheduleBrand]="strip.scheduleBrand ?? 'ae'"
          />
        }
      </div>
    `,
  }),
};
