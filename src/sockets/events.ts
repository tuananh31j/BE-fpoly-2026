import type { Server } from 'socket.io';

import { STAFF_NOTIFICATION_ROOM } from '@services/realtime-notification.service';

export const registerSocketEvents = (io: Server) => {
  io.on('connection', (socket) => {
    const role = socket.data.user?.role;

    if (role === 'staff' || role === 'admin') {
      socket.join(STAFF_NOTIFICATION_ROOM);
      socket.emit('staff:notifications:ready', {
        room: STAFF_NOTIFICATION_ROOM,
        timestamp: new Date().toISOString()
      });
    }

    socket.on('client:ping', () => {
      socket.emit('server:pong', {
        timestamp: new Date().toISOString()
      });
    });

    socket.on('staff:notifications:join', () => {
      const userRole = socket.data.user?.role;

      if (userRole === 'staff' || userRole === 'admin') {
        socket.join(STAFF_NOTIFICATION_ROOM);
      }
    });

    socket.on('room:join', (payload: { roomId?: string }) => {
      if (!payload?.roomId) {
        return;
      }

      socket.join(payload.roomId);
    });

    socket.on('room:message', (payload: { roomId?: string; message?: string }) => {
      if (!payload?.roomId || !payload?.message) {
        return;
      }

      io.to(payload.roomId).emit('room:message', {
        roomId: payload.roomId,
        message: payload.message,
        senderId: socket.data.user?.id,
        timestamp: new Date().toISOString()
      });
    });
  });
};
