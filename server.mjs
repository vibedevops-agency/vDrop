import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";

const port = Number(process.env.PORT || 1947);
// Do NOT use process.env.HOSTNAME — Windows often sets it to the PC name,
// which makes Node listen on one interface and hide the app from other devices.
const app = next({
  dev: false,
  hostname: "localhost",
  port,
});
const handle = app.getRequestHandler();

await app.prepare();

function handleRequest(req, res) {
  const host = req.headers.host || `localhost:${port}`;
  if (!req.headers["x-forwarded-host"]) {
    req.headers["x-forwarded-host"] = host;
  }
  if (!req.headers["x-forwarded-proto"]) {
    req.headers["x-forwarded-proto"] = "http";
  }
  const remote = req.socket?.remoteAddress;
  if (remote && !req.headers["x-vdrop-remote"]) {
    req.headers["x-vdrop-remote"] = remote;
  }
  handle(req, res, parse(req.url || "/", true));
}

function attach(host, label) {
  const server = createServer(handleRequest);
  server.on("error", (err) => {
    console.error(`vDrop ${label} error:`, err);
  });
  server.listen({ port, host, ipv6Only: false }, () => {
    console.log(`vDrop ${label} ready (${host}:${port})`);
  });
}

// IPv4 for addresses like 2.2.2.2, IPv6 so Chrome can open localhost (::1).
attach("0.0.0.0", "ipv4");
attach("::", "ipv6");
console.log(`This PC: http://localhost:${port}`);
