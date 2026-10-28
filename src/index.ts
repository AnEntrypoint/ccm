#!/usr/bin/env node
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

interface Message {
  id: number;
  from: string;
  text: string;
  receivedAt: string;
}

const PORT = Number(process.env.CCM_PORT ?? 7777);
const HOST = process.env.CCM_HOST ?? '127.0.0.1';
const MAX_QUEUE = Number(process.env.CCM_MAX_QUEUE ?? 1000);

let nextId = 1;
let queue: Message[] = [];

const server = new McpServer(
  { name: 'ccm-inbox', version: '0.1.0' },
  { capabilities: { logging: {} } },
);

async function notify(msg: Message): Promise<void> {
  try {
    await server.sendLoggingMessage({
      level: 'notice',
      logger: 'ccm-inbox',
      data: msg,
    });
  } catch (err) {
    console.error('notify skipped (no connected client):', (err as Error).message);
  }
}

server.registerTool(
  'read_messages',
  {
    description: 'Return and clear all messages received on the HTTP inbox since the last read.',
    inputSchema: {},
  },
  async () => {
    const drained = queue;
    queue = [];
    return {
      content: [{ type: 'text', text: JSON.stringify(drained, null, 2) }],
    };
  },
);

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw.length ? JSON.parse(raw) : {};
}

const MessageBody = z.object({
  from: z.string().max(200).default('anonymous'),
  text: z.string().min(1).max(64_000),
});

const http = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? HOST}`);

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, { ok: true, queued: queue.length });
    }

    if (req.method === 'POST' && url.pathname === '/messages') {
      const parsed = MessageBody.safeParse(await readJson(req));
      if (!parsed.success) {
        return send(res, 400, { error: parsed.error.issues.map((i) => i.message).join('; ') });
      }
      const msg: Message = {
        id: nextId++,
        from: parsed.data.from,
        text: parsed.data.text,
        receivedAt: new Date().toISOString(),
      };
      queue.push(msg);
      if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
      await notify(msg);
      return send(res, 202, { id: msg.id });
    }

    if (req.method === 'GET' && url.pathname === '/messages') {
      const drained = queue;
      queue = [];
      return send(res, 200, drained);
    }

    send(res, 404, { error: 'not found' });
  } catch (err) {
    send(res, 400, { error: (err as Error).message });
  }
});

async function main(): Promise<void> {
  http.listen(PORT, HOST, () => {
    console.error(`ccm-inbox HTTP listening on http://${HOST}:${PORT}`);
  });
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
