import { type DurableObjectNamespace } from "@cloudflare/workers-types";

import { Hono } from "hono";
import { html } from "hono/html";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { z } from "zod";

// noinspection JSUnusedGlobalSymbols
export class Chatroom {
  state: any;
  storage: any;
  env: any;

  constructor(state: any, env: any) {
    this.state = state;
    this.storage = state.storage;
    this.env = env;

    this.state.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  async fetch(_: Request) {
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, data: string) {
    try {
      const json: unknown = JSON.parse(data);
      const { message } = z.object({ message: z.string() }).parse(json);
      this.state.getWebSockets().forEach((ws: WebSocket) => {
        ws.send(
          html` <ul id="messages" hx-swap-oob="beforeend">
            <li>${message}</li>
          </ul>` as string,
        );
      });
    } catch (e) {
      console.warn(e);
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ) {
    console.log("CLOSED", { ws, code, reason, wasClean });
  }

  async webSocketError(ws: WebSocket, error: any) {
    console.error("ERROR", error);
  }
}

const app = new Hono<{ Bindings: { CHATROOM: DurableObjectNamespace } }>()
  .use("*", logger())
  .get("/connect", async (c) => {
    if (c.req.header("upgrade") !== "websocket") {
      throw new HTTPException(402);
    }

    const id = c.env.CHATROOM.idFromName("0");
    const chatroom = c.env.CHATROOM.get(id);
    return await chatroom.fetch(c.req.raw);
  })
  .get("/", async (c) => {
    return c.html(html`
      <!doctype html>
      <html lang="en">
        <head>
          <title>chatroom</title>

          <link
            rel="stylesheet"
            href="https://cdn.jsdelivr.net/npm/@picocss/pico@1/css/pico.min.css"
          />

          <script
            src="https://unpkg.com/htmx.org@1.9.9"
            integrity="sha384-QFjmbokDn2DjBjq+fM+8LUIVrAgqcNW2s0PjAxHETgRn9l4fvX31ZxDxvwQnyMOX"
            crossorigin="anonymous"
          ></script>
          <script>
            htmx.createWebSocket = function (src) {
              const ws = new WebSocket(src);
              setInterval(function () {
                if (ws.readyState === 1) {
                  ws.send("ping");
                }
              }, 20000);
              return ws;
            };
          </script>
          <script src="https://unpkg.com/htmx.org/dist/ext/ws.js"></script>
        </head>
        <body>
          <main class="container" hx-ext="ws" ws-connect="/connect">
            <h1>chatroom</h1>
            <ul id="messages"></ul>
            <form ws-send>
              <div class="grid">
                <input type="text" name="message" />
                <button>send</button>
              </div>
            </form>
          </main>
        </body>
      </html>
    `);
  });

// noinspection JSUnusedGlobalSymbols
export default app;
