# ccm-inbox

MCP server (TypeScript SDK, stdio transport) with a small HTTP inbox. Messages POSTed to the HTTP API are queued and pushed to the connected MCP client as `notifications/message` (logger `ccm-inbox`). The `read_messages` tool drains the queue for clients that don't surface notifications.

## HTTP API (default `http://127.0.0.1:7777`)

| Method | Path        | Body / result |
|--------|-------------|---------------|
| POST   | /messages   | `{"from":"name","text":"..."}` → `202 {"id":n}`; `400` on invalid body |
| GET    | /messages   | Returns and clears all queued messages |
| GET    | /health     | `{"ok":true,"queued":n}` |

Env: `CCM_PORT` (7777), `CCM_HOST` (127.0.0.1), `CCM_MAX_QUEUE` (1000).

## Build and run

    npm install
    npm run build
    npm start            # stdio MCP server; launched by the MCP client
    npm test             # end-to-end: stdio client + HTTP posts + notification + drain

## Register with Claude Code

    claude mcp add ccm-inbox -- node /workspace/ccm/dist/index.js

Send a message:

    curl -X POST http://127.0.0.1:7777/messages -H 'content-type: application/json' -d '{"from":"me","text":"hi"}'
