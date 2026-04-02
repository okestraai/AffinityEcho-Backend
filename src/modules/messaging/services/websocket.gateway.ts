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
import { UseGuards, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from '../../../common/guards/ws-jwt.guard';
import { MessagingService } from './messaging.service';
import { CORS_CONFIG } from '../../../common/config/cors.config';

interface ConnectedUser {
  socketId: string;
  userId: string;
  username: string;
  conversations: string[];
  lastActive: Date;
}

@WebSocketGateway({
  path: '/ws/socket.io',
  cors: {
    origin: CORS_CONFIG.origin,
    credentials: CORS_CONFIG.credentials,
    methods: ['GET', 'POST'],
    allowedHeaders: CORS_CONFIG.allowedHeaders,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private users = new Map<string, ConnectedUser>();

  constructor(private readonly messagingService: MessagingService) {}

  afterInit(server: Server) {
    this.logger.log('🔌 WebSocket Gateway initialized');
    this.logger.log(`📍 Path: /ws/socket.io`);
    this.logger.log(`🌐 CORS Origins: ${JSON.stringify(CORS_CONFIG.origin)}`);
  }

  async handleConnection(client: Socket) {
    try {
      this.logger.log(`🔗 Client attempting connection: ${client.id}`);
      this.logger.log(`📋 Handshake auth:`, client.handshake.auth);
      this.logger.log(`📋 Handshake headers:`, {
        authorization:
          client.handshake.headers?.authorization?.substring(0, 30) + '...',
        origin: client.handshake.headers?.origin,
      });

      // Don't validate token here - let WsJwtGuard handle it
      // Just send initial connection confirmation
      client.emit('connected', {
        socketId: client.id,
        message: 'WebSocket connection established. Please authenticate.',
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`✅ Client connected (pending auth): ${client.id}`);
    } catch (error) {
      this.logger.error(`❌ Connection error for ${client.id}:`, error);
      client.emit('error', { message: 'Connection failed' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const user = this.users.get(client.id);

    if (user) {
      // Leave all conversation rooms
      user.conversations.forEach((id) => client.leave(`conversation:${id}`));
      this.users.delete(client.id);

      // Notify others
      this.server.emit('user_offline', {
        userId: user.userId,
        username: user.username,
      });

      this.logger.log(`👋 User disconnected: ${user.username} (${client.id})`);
    } else {
      this.logger.log(`👋 Client disconnected: ${client.id}`);
    }
  }

  /* -------------------- AUTHENTICATION -------------------- */

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('authenticate')
  async handleAuthenticate(@ConnectedSocket() client: Socket) {
    try {
      const user = client.data.user;

      if (!user) {
        this.logger.error(`❌ No user data after guard: ${client.id}`);
        client.emit('auth_error', { message: 'Authentication failed' });
        client.disconnect();
        return;
      }

      // Store user in connected users map
      this.users.set(client.id, {
        socketId: client.id,
        userId: user.userId,
        username: user.username,
        conversations: [],
        lastActive: new Date(),
      });

      // Join user's personal room
      client.join(`user:${user.userId}`);

      // Send authentication success
      client.emit('authenticated', {
        userId: user.userId,
        username: user.username,
        email: user.email,
        socketId: client.id,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`✅ User authenticated: ${user.username} (${client.id})`);
    } catch (error: any) {
      const errorMessage = error?.message || 'Authentication failed';
      this.logger.error(`❌ Authentication error: ${errorMessage}`);
      client.emit('auth_error', { message: errorMessage });
      client.disconnect();
    }
  }

  /* -------------------- CONVERSATIONS -------------------- */

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('join_conversation')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() { conversationId }: any,
  ) {
    const user = this.users.get(client.id);
    if (!user) {
      this.logger.error('❌ join_conversation: User not authenticated');
      client.emit('error', { message: 'User not authenticated' });
      return;
    }

    const room = `conversation:${conversationId}`;
    client.join(room);

    if (!user.conversations.includes(conversationId)) {
      user.conversations.push(conversationId);
    }

    // Get room info for debugging
    const roomClients = await this.server.in(room).fetchSockets();

    client.emit('joined_conversation', { conversationId });
    client.to(room).emit('user_joined', {
      userId: user.userId,
      username: user.username,
    });

    this.logger.log(`📥 ${user.username} joined conversation: ${conversationId}`, {
      room,
      socketId: client.id,
      totalClientsInRoom: roomClients.length,
      clientIds: roomClients.map((s) => s.id),
    });
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('leave_conversation')
  handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() { conversationId }: any,
  ) {
    const user = this.users.get(client.id);
    if (!user) return;

    client.leave(`conversation:${conversationId}`);
    user.conversations = user.conversations.filter(
      (id) => id !== conversationId,
    );

    client.to(`conversation:${conversationId}`).emit('user_left', {
      userId: user.userId,
      username: user.username,
    });

    this.logger.log(`📤 ${user.username} left conversation: ${conversationId}`);
  }

  /* -------------------- MESSAGES -------------------- */

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('send_message')
  async sendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: any,
  ) {
    try {
      const user = client.data.user;
      if (!user) {
        this.logger.error('❌ send_message: User not authenticated');
        client.emit('message_error', { message: 'User not authenticated' });
        return;
      }

      this.logger.log(`📨 send_message received from ${user.username}`, {
        payload,
        socketId: client.id,
      });

      const result = await this.messagingService.sendMessage(
        user.userId,
        payload,
      );

      const room = `conversation:${result.data.conversation_id}`;
      const roomClients = await this.server.in(room).fetchSockets();

      this.logger.log(`🔊 Emitting new_message to room: ${room}`, {
        messageId: result.data.message_id,
        conversationId: result.data.conversation_id,
        sender: user.username,
        roomSize: roomClients.length,
        clientsInRoom: roomClients.map((s) => s.id),
        hasMessageContent: !!result.data.message?.content_encrypted,
      });

      // Emit complete message data to conversation room
      this.server.to(room).emit('new_message', {
        success: true,
        data: result.data.message, // Send the complete message object
        metadata: {
          recipient_id: result.data.recipient_id,
          chat_type: result.data.chat_type,
        },
      });

      // Confirm to sender with message details
      client.emit('message_sent', {
        success: true,
        message_id: result.data.message_id,
        conversation_id: result.data.conversation_id,
        created_at: result.data.sent_at,
      });

      this.logger.log(
        `✅ Message sent by ${user.username} in conversation ${result.data.conversation_id}`,
      );
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to send message';
      this.logger.error('❌ Error sending message:', {
        error: error.message,
        stack: error.stack,
      });
      client.emit('message_error', {
        message: errorMessage,
      });
    }
  }

  /* -------------------- EDIT MESSAGE -------------------- */

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('edit_message')
  async editMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: any,
  ) {
    try {
      const user = client.data.user;
      if (!user) {
        this.logger.error('❌ edit_message: User not authenticated');
        client.emit('message_error', { message: 'User not authenticated' });
        return;
      }

      this.logger.log(`✏️ edit_message received from ${user.username}`, {
        payload,
        socketId: client.id,
      });

      const result = await this.messagingService.editMessage(
        user.userId,
        payload.messageId,
        {
          conversation_id: payload.conversationId || payload.conversation_id,
          content_encrypted: payload.content_encrypted,
        },
      );

      const room = `conversation:${result.data.conversation_id}`;

      // Emit message_edited event to all participants in the conversation
      this.server.to(room).emit('message_edited', {
        success: true,
        data: {
          message_id: result.data.message_id,
          conversation_id: result.data.conversation_id,
          content_encrypted: result.data.content_encrypted,
          is_edited: result.data.is_edited,
          edited_at: result.data.edited_at,
        },
      });

      // Confirm to sender
      client.emit('message_edit_confirmed', {
        success: true,
        message_id: result.data.message_id,
        conversation_id: result.data.conversation_id,
        edited_at: result.data.edited_at,
      });

      this.logger.log(
        `✅ Message edited by ${user.username} in conversation ${result.data.conversation_id}`,
      );
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to edit message';
      this.logger.error('❌ Error editing message:', {
        error: error.message,
        stack: error.stack,
      });
      client.emit('message_error', {
        message: errorMessage,
      });
    }
  }

  /* -------------------- READ RECEIPTS -------------------- */

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('mark_as_read')
  async markRead(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    try {
      await this.messagingService.markAsRead(
        client.data.user.userId,
        data.messageId,
        data.conversationId,
      );

      // Notify conversation participants
      this.server
        .to(`conversation:${data.conversationId}`)
        .emit('message_read', {
          messageId: data.messageId,
          userId: client.data.user.userId,
        });
    } catch (error: any) {
      this.logger.error('❌ Error marking as read:', error?.message || error);
    }
  }

  /* -------------------- TYPING INDICATORS -------------------- */

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('typing_start')
  typingStart(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    const user = client.data.user;
    if (!user) return;

    client.to(`conversation:${data.conversationId}`).emit('typing_start', {
      userId: user.userId,
      username: user.username,
      conversation_id: data.conversationId,
    });
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('typing_end')
  typingEnd(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    const user = client.data.user;
    if (!user) return;

    client.to(`conversation:${data.conversationId}`).emit('typing_end', {
      userId: user.userId,
      username: user.username,
      conversation_id: data.conversationId,
    });
  }

  /* -------------------- PING/PONG -------------------- */

  @SubscribeMessage('ping')
  ping(@ConnectedSocket() client: Socket) {
    client.emit('pong', { timestamp: Date.now() });
  }

  /* -------------------- DEBUG HELPERS -------------------- */

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('debug_room_info')
  async debugRoomInfo(
    @ConnectedSocket() client: Socket,
    @MessageBody() { conversationId }: any,
  ) {
    const user = this.users.get(client.id);
    if (!user) return;

    const room = `conversation:${conversationId}`;
    const roomClients = await this.server.in(room).fetchSockets();
    const userRooms = Array.from(client.rooms);

    const debugInfo = {
      conversationId,
      room,
      socketId: client.id,
      username: user.username,
      userConversations: user.conversations,
      socketRooms: userRooms,
      isInRoom: userRooms.includes(room),
      roomSize: roomClients.length,
      clientsInRoom: roomClients.map((s) => ({
        id: s.id,
        rooms: Array.from(s.rooms),
      })),
    };

    this.logger.log(`🐛 Debug Room Info for ${user.username}:`, debugInfo);
    client.emit('debug_room_info_response', debugInfo);
  }

  /* -------------------- HELPER METHODS -------------------- */

  getConnectedUsers(): ConnectedUser[] {
    return Array.from(this.users.values());
  }

  isUserConnected(userId: string): boolean {
    return Array.from(this.users.values()).some(
      (user) => user.userId === userId,
    );
  }

  /**
   * Emit an event to a specific user's personal room.
   * Used by NotificationsService to push real-time notifications.
   */
  emitToUser(userId: string, event: string, payload: any) {
    this.server.to(`user:${userId}`).emit(event, payload);
    this.logger.log(`📡 Emitted '${event}' to user:${userId}`);
  }
}
