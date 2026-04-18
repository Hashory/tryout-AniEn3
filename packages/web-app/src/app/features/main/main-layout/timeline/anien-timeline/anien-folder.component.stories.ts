import type { Meta, StoryObj } from '@storybook/angular';
import { AnienFolderComponent } from '#app/features/main/main-layout/timeline/anien-timeline/anien-folder.component';
import type { FolderVM } from '#app/features/main/main-layout/timeline/services/timeline-state.service';

const baseFolder: FolderVM = {
  id: 'folder-story',
  type: 'folder',
  sourceId: 'folder-src-1',
  name: 'Scene Folder',
  bodyTrackCount: 3,
  durationTicks: 240,
  startTick: 30,
  startRow: 1,
  rowSpan: 4,
  ordinal: 1,
  isSelected: false,
  isExpanded: true,
  containedIds: [],
  parentFolderId: 'root',
  parentStartTick: 0,
  absoluteStartTick: 30,
  absoluteStartRow: 1,
};

const makeFolder = (overrides: Partial<FolderVM>): FolderVM => ({
  ...baseFolder,
  ...overrides,
});

const meta: Meta<AnienFolderComponent> = {
  title: 'Timeline/Folder',
  component: AnienFolderComponent,
  tags: ['autodocs'],
  args: {
    item: baseFolder,
    clipPath: null,
  },
};

export default meta;

type Story = StoryObj<AnienFolderComponent>;

export const Unselected: Story = {
  args: {
    item: makeFolder({
      name: 'Unselected Folder',
      isSelected: false,
      bodyTrackCount: 3,
      rowSpan: 4,
      durationTicks: 220,
    }),
  },
};

export const Selected: Story = {
  args: {
    item: makeFolder({
      name: 'Selected Folder',
      isSelected: true,
      bodyTrackCount: 3,
      rowSpan: 4,
      durationTicks: 220,
    }),
  },
};

export const TrackCountOne: Story = {
  name: 'Track Count 1',
  args: {
    item: makeFolder({
      name: '1 Track Folder',
      bodyTrackCount: 1,
      rowSpan: 2,
      durationTicks: 200,
    }),
  },
};

export const TrackCountFive: Story = {
  name: 'Track Count 5',
  args: {
    item: makeFolder({
      name: '5 Track Folder',
      bodyTrackCount: 5,
      rowSpan: 6,
      durationTicks: 200,
    }),
  },
};

export const WidthMedium: Story = {
  name: 'Width Medium (180 ticks)',
  args: {
    item: makeFolder({
      name: 'Medium Folder',
      durationTicks: 180,
      bodyTrackCount: 2,
      rowSpan: 3,
    }),
  },
};

export const WidthLong: Story = {
  name: 'Width Long (420 ticks)',
  args: {
    item: makeFolder({
      name: 'Long Folder',
      durationTicks: 420,
      bodyTrackCount: 4,
      rowSpan: 5,
      isSelected: true,
      absoluteStartTick: 5,
    }),
  },
};
