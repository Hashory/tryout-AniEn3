import type { Meta, StoryObj } from '@storybook/angular';
import { AnienStripComponent } from './anien-strip.component';
import type { StripVM } from '../../services/timeline-state.service';

const baseStrip: StripVM = {
  id: 'strip-story',
  type: 'strip',
  sourceId: 'src-1',
  sourceName: 'Interview_Broll_01.mov',
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
