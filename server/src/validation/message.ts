import { z } from 'zod';
import { reqText, PaginationQuery } from './common';

export const CreateConversationBody = z.object({
  userId: z.string({ error: 'userId is required' }).uuid('userId must be a valid UUID'),
});

export const SendMessageBody = z.object({
  // reqText allows newlines (for multi-line messages) but strips HTML
  content: reqText(2000, 'Message content'),
});

export const MessageListQuery = PaginationQuery;
