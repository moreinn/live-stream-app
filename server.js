// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// --- App + HTTP server ---
const app = express();
const server = http.createServer(app);

// Serve static files from 'public' folder
app.use(express.static('public'));

// Simple API to list active rooms (for the homepage)
const rooms = {}; // map: roomId -> { publisher: socketId|null, viewers: Set }

app.get('/rooms', (req, res) => {
  // return minimal info for public listing
  const list = Object.entries(rooms).map(([roomId, info]) => ({
    roomId,
    hasPublisher: !!info.publisher,
    viewerCount: info.viewers.size
  }));
  res.json(list);
});

// --- Socket.IO setup ---
const io = new Server(server);

// Helper: ensure room object exists
function ensureRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = { publisher: null, viewers: new Set() };
  }
  return rooms[roomId];
}

io.on('connection', (socket) => {
  console.log('socket connected:', socket.id);

  socket.on('join-room', ({ roomId, role, username }) => {
    console.log('join-room', roomId, role, socket.id, username);
    socket.join(roomId);
    socket.roomId = roomId;
    socket.role = role;
    socket.username = username || 'Anonymous';

    const room = ensureRoom(roomId);

    if (role === 'publisher') {
      if (room.publisher === null) {
        room.publisher = socket.id;
        socket.emit('joined', { roomId, role: 'publisher', mySocketId: socket.id });
        // notify viewers (if any) that publisher is ready or that someone is publishing
        io.to(roomId).emit('publisher-ready', { publisherSocketId: socket.id });
        console.log(`Publisher set for room ${roomId}:`, socket.id);
      } else {
        // room already has a publisher
        socket.emit('error', { code: 'ROOM_HAS_PUBLISHER', message: 'Room already has a streamer' });
        console.log('publisher join rejected for', roomId);
      }
    } else { // viewer
      room.viewers.add(socket.id);
      socket.emit('joined', { roomId, role: 'viewer', mySocketId: socket.id });
      // notify publisher (if present) that a viewer joined
      if (room.publisher) {
        io.to(room.publisher).emit('viewer-joined', { viewerSocketId: socket.id, username: socket.username });
      } else {
        // inform viewer that they're waiting for publisher
        socket.emit('info', { message: 'Waiting for publisher to go live' });
      }
    }
  });

  // Signaling: offer from publisher to a viewer
  socket.on('offer', ({ toSocketId, sdp }) => {
    io.to(toSocketId).emit('offer', { fromSocketId: socket.id, sdp });
  });

  // Signaling: answer from viewer to publisher
  socket.on('answer', ({ toSocketId, sdp }) => {
    io.to(toSocketId).emit('answer', { fromSocketId: socket.id, sdp });
  });

  // Signaling: ICE candidates forwarded to target
  socket.on('ice-candidate', ({ toSocketId, candidate }) => {
    io.to(toSocketId).emit('ice-candidate', { fromSocketId: socket.id, candidate });
  });

  // Chat messages broadcast to room
  socket.on('chat-message', ({ roomId, username, message }) => {
    const ts = Date.now();
    io.to(roomId).emit('chat-message', { username, message, ts });
  });

  // Publisher stops stream
  socket.on('stop-stream', ({ roomId }) => {
    const room = rooms[roomId];
    if (room && room.publisher === socket.id) {
      // notify viewers
      io.to(roomId).emit('publisher-left', { reason: 'publisher_stopped' });
      room.publisher = null;
      console.log('publisher stopped stream for', roomId);
    }
  });

  // Cleanup on disconnect
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    const role = socket.role;
    console.log('disconnect', socket.id, role, roomId);

    if (!roomId || !rooms[roomId]) return;
    const room = rooms[roomId];

    if (role === 'publisher') {
      // clear publisher and notify viewers
      room.publisher = null;
      io.to(roomId).emit('publisher-left', { reason: 'publisher_disconnected' });
    } else {
      // viewer left
      room.viewers.delete(socket.id);
      if (room.publisher) {
        io.to(room.publisher).emit('viewer-left', { viewerSocketId: socket.id });
      }
    }

    // If room empty, delete it
    if (room.publisher === null && room.viewers.size === 0) {
      delete rooms[roomId];
      console.log('deleted empty room', roomId);
    }
  });
});

// Start server
const PORT = process.env.PORT || 3004;
server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
