// Plain MCP client (no Claude Code): subscribes to ccm://inbox, posts a message, expects resources/updated.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ResourceUpdatedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';

const PORT = 7790;
const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/index.js'],
  env: { ...process.env, CCM_PORT: String(PORT) },
  stderr: 'ignore',
});
const client = new Client({ name: 'subscribe-test', version: '0.0.1' });
await client.connect(transport);

const updated = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('no resources/updated within 5s')), 5000);
  client.setNotificationHandler(ResourceUpdatedNotificationSchema, (n) => {
    clearTimeout(timer);
    resolve(n.params.uri);
  });
});

await client.subscribeResource({ uri: 'ccm://inbox' });
await new Promise((r) => setTimeout(r, 500));
const res = await fetch(`http://127.0.0.1:${PORT}/messages`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ from: 'subscribe-test', text: 'hello via subscription' }),
});
console.log('post:', res.status);

const uri = await updated;
console.log('resources/updated:', uri);

const read = await client.readResource({ uri: 'ccm://inbox' });
const queue = JSON.parse(read.contents[0].text);
console.log('resource shows:', queue.map((m) => m.text));
if (!queue.some((m) => m.text === 'hello via subscription')) throw new Error('message missing from resource');

await client.close();
console.log('subscribe test: ok');
