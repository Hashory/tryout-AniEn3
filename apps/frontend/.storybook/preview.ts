import type { Preview } from '@storybook/angular';
import { componentWrapperDecorator } from '@storybook/angular';

const preview: Preview = {
  decorators: [
    componentWrapperDecorator(
      (story) => `
        <div
          style="
            --timeline-tick-size: 2px;
            --timeline-track-height: 34px;
            --timeline-strip-padding-x: 9px;
            --timeline-strip-offset: 2px;
            --timeline-folder-offset: 4px;
            --timeline-folder-content-stripe-height: 4px;
            position: relative;
            width: 960px;
            height: 260px;
            background: #0b0f12;
            border-radius: 8px;
            overflow: hidden;
          "
        >
          ${story}
        </div>
      `,
    ),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: 'centered',
  },
};

export default preview;
