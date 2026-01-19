import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from '../../../common/guards/ws-jwt.guard';
import { MessagingService } from './messaging.service';
import logger from '../../../common/utils/logger.util';

interface ConnectedUser {
  socketId: string;
  userId: string;
  username: string;
  lastActive: Date;
  conversations: string[];
}

@WebSocketGateway({
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  },
  namespace: 'chat',
  transports: ['websocket', 'polling'],
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private connectedUsers = new Map<string, ConnectedUser>();
  private typingUsers = new Map<
    string,
    { conversationId: string; timeout: NodeJS.Timeout }
  >();

  constructor(private readonly messagingService: MessagingService) {}

  afterInit(server: Server) {
    logger.info('WebSocket Gateway initialized', {
      namespace: 'chat',
    });
  }

  /* ----------------------------- CONNECTION ----------------------------- */

  @UseGuards(WsJwtGuard)
  async handleConnection(client: Socket) {
    const user = client.data.user;

    if (!user) {
      client.disconnect();
      return;
    }

    this.connectedUsers.set(client.id, {
      socketId: client.id,
      userId: user.userId,
      username: user.username,
      lastActive: new Date(),
      conversations: [],
    });

    client.join(`user:${user.userId}`);

    client.emit('connected', {
      event: 'connected',
      payload: {
        userId: user.userId,
        username: user.username,
      },
    });

    logger.info('Client connected', {
      userId: user.userId,
      socketId: client.id,
    });
  }

  handleDisconnect(client: Socket) {
    const user = this.connectedUsers.get(client.id);
    if (!user) return;

    user.conversations.forEach((convId) =>
      client.leave(`conversation:${convId}`),
    );

    this.connectedUsers.delete(client.id);

    logger.info('Client disconnected', {
      userId: user.userId,
      socketId: client.id,
    });
  }

  /* ----------------------------- CONVERSATIONS ----------------------------- */

  @SubscribeMessage('join_conversation')
  @UseGuards(WsJwtGuard)
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() { conversationId }: { conversationId: string },
  ) {
    client.join(`conversation:${conversationId}`);

    const connectedUser = this.connectedUsers.get(client.id);
    if (
      connectedUser &&
      !connectedUser.conversations.includes(conversationId)
    ) {
      connectedUser.conversations.push(conversationId);
    }

    client.to(`conversation:${conversationId}`).emit('user_joined', {
      payload: { userId: connectedUser?.userId },
    });
  }

  @SubscribeMessage('leave_conversation')
  @UseGuards(WsJwtGuard)
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() { conversationId }: { conversationId: string },
  ) {
    client.leave(`conversation:${conversationId}`);

    const connectedUser = this.connectedUsers.get(client.id);
    if (connectedUser) {
      connectedUser.conversations = connectedUser.conversations.filter(
        (id) => id !== conversationId,
      );
    }
  }

  /* ----------------------------- MESSAGES ----------------------------- */

  @SubscribeMessage('send_message')
  @UseGuards(WsJwtGuard)
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    const user = client.data.user;
    if (!user) return;

    try {
      const result = await this.messagingService.sendMessage(user.userId, data);

      if (!result.success) return;

      this.server
        .to(`conversation:${result.data.conversation_id}`)
        .emit('new_message', {
          payload: result.data,
        });

      client.emit('message_sent', {
        payload: {
          message_id: result.data.message_id,
        },
      });
    } catch (error) {
      logger.error('Send message failed', error);
      client.emit('message_error', { message: 'SEND_FAILED' });
    }
  }

  /* ----------------------------- TYPING ----------------------------- */

  @SubscribeMessage('typing_start')
  @UseGuards(WsJwtGuard)
  handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() { conversationId }: { conversationId: string },
  ) {
    const timeout = setTimeout(() => {
      this.typingUsers.delete(client.id);
      client.to(`conversation:${conversationId}`).emit('typing_end');
    }, 3000);

    this.typingUsers.set(client.id, { conversationId, timeout });

    client.to(`conversation:${conversationId}`).emit('typing_start');
  }

  @SubscribeMessage('typing_end')
  @UseGuards(WsJwtGuard)
  handleTypingEnd(@ConnectedSocket() client: Socket) {
    const entry = this.typingUsers.get(client.id);
    if (!entry) return;

    clearTimeout(entry.timeout);
    this.typingUsers.delete(client.id);

    client.to(`conversation:${entry.conversationId}`).emit('typing_end');
  }

  /* ----------------------------- HELPERS ----------------------------- */

  getUserSockets(userId: string): string[] {
    return Array.from(this.connectedUsers.entries())
      .filter(([_, user]) => user.userId === userId)
      .map(([socketId]) => socketId);
  }

  getOnlineUsers(conversationId: string) {
    return Array.from(this.connectedUsers.values()).filter((u) =>
      u.conversations.includes(conversationId),
    );
  }
}
