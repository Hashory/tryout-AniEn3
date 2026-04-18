import type { Meta, StoryObj } from '@storybook/angular';
import { componentWrapperDecorator } from '@storybook/angular';
import {
  AnienSidebarComponent,
  type MainSidebarPanel,
} from '#app/features/main/main-layout/sidebar/anien-sidebar.component';

const meta: Meta<AnienSidebarComponent> = {
  title: 'Layout/Sidebar',
  component: AnienSidebarComponent,
  tags: ['autodocs'],
  args: {
    activePanel: 'timeline' as MainSidebarPanel,
  },
  decorators: [
    componentWrapperDecorator(
      (story) => `
        <div style="width: 92px; height: 360px;">
          ${story}
        </div>
      `,
    ),
  ],
};

export default meta;

type Story = StoryObj<AnienSidebarComponent>;

export const TimelineSelected: Story = {
  args: {
    activePanel: 'timeline',
  },
};

export const TaskSelected: Story = {
  args: {
    activePanel: 'task',
  },
};
