import { Server } from '@hocuspocus/server';
import { Logger } from '@hocuspocus/extension-logger';
import { SQLite } from '@hocuspocus/extension-sqlite';

const port = 14202;

const server = new Server({
  port,
  address: '0.0.0.0',
  extensions: [
    new Logger(),
    new SQLite({
      database: 'hocuspocus.sqlite',
    }),
  ],
});

server.listen();
