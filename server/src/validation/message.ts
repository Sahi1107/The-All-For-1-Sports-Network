import { z } from 'zod';
import { reqText, PaginationQuery } from './common';

export const CreateConversationBody = z.object({
  userId: z.string({ error: 'userId is required' }).uuid('userId must be a valid UUID'),
});

export const SendMessageBody = z
  .object({
    content: reqText(2000, 'Message content').optional(),
    sharedPostId: z.string().uuid('sharedPostId must be a valid UUID').optional(),
  })
  .refine((d) => d.content || d.sharedPostId, {
    message: 'Either content or sharedPostId is required',
  });

export const EditMessageBody = z.object({
  content: reqText(2000, 'Message content'),
});

export const ForwardMessageBody = z.object({
  targetConversationId: z.string().uuid('targetConversationId must be a valid UUID'),
});

export const MessageListQuery = PaginationQuery;
