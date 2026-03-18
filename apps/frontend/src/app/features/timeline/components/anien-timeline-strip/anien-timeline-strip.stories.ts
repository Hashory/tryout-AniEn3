import type { Meta, StoryObj } from '@storybook/angular';
import { AnienTimelineStripComponent } from './anien-timeline-strip.component';
import { StripVM } from '../../services/timeline-state.service';

const baseStrip: StripVM = {
  id: 'strip-story',
  type: 'strip',
  sourceId: 'strip-source-1',
  sourceName: 'Sample Strip',
  sourceOffsetTicks: 0,
  durationTicks: 60,
  startTick: 0,
  startRow: 0,
  laneSpan: 1,
  rowSpan: 1,
  ordinal: 0,
  isSelected: false,
  parentFolderId: 'root',
  parentStartTick: 0,
  absoluteStartTick: 10,
  absoluteStartRow: 0,
};

const meta: Meta<AnienTimelineStripComponent> = {
  title: 'Timeline/Strip',
  component: AnienTimelineStripComponent,
  tags: ['autodocs'],
  render: (args) => ({
    props: args,
    template: `
      <div
        style="
          --timeline-tick-size: 3px;
          --timeline-track-height: 34px;
          --timeline-strip-offset: 2px;
          --timeline-strip-padding-x: 9px;
          position: relative;
          width: 780px;
          height: 120px;
          background: #0b0f12;
          border-radius: 6px;
          overflow: hidden;
        "
      >
        <app-anien-timeline-strip [item]="item" [clipPath]="clipPath" />
      </div>
    `,
  }),
  args: {
    item: baseStrip,
    clipPath: null,
  },
};

export default meta;
type Story = StoryObj<AnienTimelineStripComponent>;

export const UnselectedOneLane: Story = {
  args: {
    item: {
      ...baseStrip,
      isSelected: false,
      laneSpan: 1,
      rowSpan: 1,
      durationTicks: 60,
    },
  },
};

export const SelectedOneLane: Story = {
  args: {
    item: {
      ...baseStrip,
      isSelected: true,
      laneSpan: 1,
      rowSpan: 1,
      durationTicks: 60,
    },
  },
};

export const UnselectedTwoLane: Story = {
  args: {
    item: {
      ...baseStrip,
      isSelected: false,
      laneSpan: 2,
      rowSpan: 2,
      durationTicks: 60,
    },
  },
};

export const SelectedTwoLane: Story = {
  args: {
    item: {
      ...baseStrip,
      isSelected: true,
      laneSpan: 2,
      rowSpan: 2,
      durationTicks: 60,
    },
  },
};

export const ShortWidth: Story = {
  args: {
    item: {
      ...baseStrip,
      durationTicks: 24,
      isSelected: false,
    },
  },
};

export const LongWidth: Story = {
  args: {
    item: {
      ...baseStrip,
      durationTicks: 160,
      isSelected: true,
    },
  },
};
