import http from 'http';
import { WebSocketServer } from 'ws';

const port = 14202;

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Hello from WebSocket/API Server!');
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('Client connected');
  ws.on('message', (message) => {
    console.log(`Received message: ${message}`);
    // Echo back for now
    ws.send(`Echo: ${message}`);
  });
  ws.on('close', () => console.log('Client disconnected'));
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
