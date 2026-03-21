import { Server } from 'socket.io';

let _io: Server;

export function initIO(io: Server) {
  _io = io;
}

export function getIO(): Server {
  if (!_io) throw new Error('Socket.IO not initialized');
  return _io;
}
