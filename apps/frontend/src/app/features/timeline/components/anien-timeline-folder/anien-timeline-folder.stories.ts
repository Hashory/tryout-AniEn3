import type { Meta, StoryObj } from '@storybook/angular';
import { AnienTimelineFolderComponent } from './anien-timeline-folder.component';
import { FolderVM } from '../../services/timeline-state.service';

const baseFolder: FolderVM = {
  id: 'folder-story',
  type: 'folder',
  sourceId: 'folder-source-1',
  name: 'Sample Folder',
  bodyTrackCount: 1,
  durationTicks: 120,
  startTick: 0,
  startRow: 0,
  rowSpan: 2,
  ordinal: 0,
  isSelected: false,
  isExpanded: true,
  containedIds: [],
  parentFolderId: 'root',
  parentStartTick: 0,
  absoluteStartTick: 10,
  absoluteStartRow: 0,
};

const meta: Meta<AnienTimelineFolderComponent> = {
  title: 'Timeline/Folder',
  component: AnienTimelineFolderComponent,
  tags: ['autodocs'],
  render: (args) => ({
    props: args,
    template: `
      <div
        style="
          --timeline-tick-size: 3px;
          --timeline-track-height: 34px;
          --timeline-folder-offset: 4px;
          --timeline-strip-padding-x: 9px;
          --timeline-folder-content-stripe-height: 4px;
          position: relative;
          width: 900px;
          height: 220px;
          background: #0b0f12;
          border-radius: 6px;
          overflow: hidden;
        "
      >
        <app-anien-timeline-folder [item]="item" [clipPath]="clipPath" />
      </div>
    `,
  }),
  args: {
    item: baseFolder,
    clipPath: null,
  },
};

export default meta;
type Story = StoryObj<AnienTimelineFolderComponent>;

export const UnselectedSmallBody: Story = {
  args: {
    item: {
      ...baseFolder,
      isSelected: false,
      bodyTrackCount: 1,
      rowSpan: 2,
      durationTicks: 120,
    },
  },
};

export const SelectedLargeBody: Story = {
  args: {
    item: {
      ...baseFolder,
      isSelected: true,
      bodyTrackCount: 4,
      rowSpan: 5,
      durationTicks: 120,
    },
  },
};

export const ShortWidth: Story = {
  args: {
    item: {
      ...baseFolder,
      bodyTrackCount: 2,
      rowSpan: 3,
      durationTicks: 52,
      isSelected: false,
    },
  },
};

export const LongWidth: Story = {
  args: {
    item: {
      ...baseFolder,
      bodyTrackCount: 2,
      rowSpan: 3,
      durationTicks: 210,
      isSelected: true,
    },
  },
};
