import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import path from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";
import express from "express";

// Resolve from the consumers: a patched top-level copy alone is insufficient.
const expressRequire = createRequire(require.resolve("express/package.json"));
const bodyParserRequire = createRequire(expressRequire.resolve("body-parser/package.json"));
const prismaRequire = createRequire(require.resolve("prisma/package.json"));
const qs = expressRequire("qs") as typeof import("qs");
const mysqlRoot = path.dirname(prismaRequire.resolve("mysql2/package.json"));
// mysql2's protocol helpers are internal; resolving its installed directory lets
// these tests exercise real packets without creating a connection or loading env.
const mysqlInternal = (name: string) => require(path.join(mysqlRoot, "lib", name));

test("dependency safety: Express and Prisma resolve the patched transitive versions", () => {
  assert.equal(expressRequire("qs/package.json").version, "6.16.0");
  assert.equal(bodyParserRequire("qs/package.json").version, "6.16.0");
  assert.equal(prismaRequire("mysql2/package.json").version, "3.23.1");
});

test("dependency safety: qs enforces array limits for bracket and comma input", () => {
  const options = { arrayLimit: 2, comma: true, throwOnLimitExceeded: true };
  for (const input of ["a[]=1&a[]=2&a[]=3", "a=1,2,3", "a[]=1,2,3"]) {
    assert.throws(() => qs.parse(input, options), RangeError, input);
  }
  assert.deepEqual(qs.parse("a[]=1&a[]=2", options), { a: ["1", "2"] });
  assert.deepEqual(qs.parse("a=1,2", options), { a: ["1", "2"] });
});

test("dependency safety: qs safely stringifies an attacker-controlled isBuffer field", () => {
  const input = "a[constructor][isBuffer]=text&a[value]=safe";
  const parsed = qs.parse(input, { allowPrototypes: true });
  assert.deepEqual(parsed, { a: { constructor: { isBuffer: "text" }, value: "safe" } });
  let encoded: string;
  assert.doesNotThrow(() => { encoded = qs.stringify(parsed); });
  assert.deepEqual(qs.parse(encoded, { allowPrototypes: true }), parsed);
  assert.equal(qs.stringify({ value: Buffer.from("safe") }), "value=safe");
});

test("dependency compatibility: Express preserves nested queries, search text and JSON bodies", async () => {
  const app = express();
  app.use(express.json({ limit: "1kb" }));
  app.get("/query", (req, res) => res.json(req.query));
  app.post("/body", (req, res) => res.json({ query: req.query, body: req.body }));
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.status || 500).json({ type: error.type });
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (pathname: string, init?: RequestInit) => fetch(origin + pathname, {
    ...init, signal: AbortSignal.timeout(5000),
  });
  try {
    const query = await request("/query?search=limpiador+multiusos%20%C3%A1cido&filter[category]=hogar&tags[]=eco&tags[]=refill&page=2&sort=price&sort=name");
    assert.equal(query.status, 200);
    assert.deepEqual(await query.json(), {
      search: "limpiador multiusos ácido", filter: { category: "hogar" },
      tags: ["eco", "refill"], page: "2", sort: ["price", "name"],
    });
    const body = { search: "limpiador", filter: { active: true }, ids: [1, 2], note: null };
    const json = { method: "POST", headers: { "Content-Type": "application/json" } };
    const response = await request("/body?source=catalog", { ...json, body: JSON.stringify(body) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { query: { source: "catalog" }, body });
    const malformed = await request("/body", { ...json, body: "{" });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { type: "entity.parse.failed" });
    const oversized = await request("/body", { ...json, body: JSON.stringify({ text: "x".repeat(1100) }) });
    assert.equal(oversized.status, 413);
    assert.deepEqual(await oversized.json(), { type: "entity.too.large" });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("dependency safety: mysql2 rejects mysql_clear_password by default before reading a password", () => {
  const ConnectionConfig = mysqlInternal("connection_config.js");
  const AuthSwitchRequest = mysqlInternal("packets/auth_switch_request.js");
  const { authSwitchRequest } = mysqlInternal("commands/auth_switch.js");
  const config = new ConnectionConfig({});
  let passwordReads = 0;
  Object.defineProperty(config, "password", { get() { passwordReads += 1; return ""; } });
  const packets: unknown[] = [];
  const connection = { config, writePacket: (packet: unknown) => packets.push(packet) };
  const packet = new AuthSwitchRequest({ pluginName: "mysql_clear_password", pluginData: Buffer.alloc(0) }).toPacket();
  packet.reset();
  assert.throws(
    () => authSwitchRequest(packet, connection, new EventEmitter()),
    { code: "MYSQL_CLEAR_PASSWORD_NOT_ENABLED", fatal: true },
  );
  assert.equal(passwordReads, 0);
  assert.equal(packets.length, 0);
});

test("dependency compatibility: mysql2 and its promise entry point preserve SQL escaping", () => {
  for (const entry of ["mysql2", "mysql2/promise"]) {
    const mysql = prismaRequire(entry);
    assert.equal(typeof mysql.createConnection, "function", entry);
    assert.equal(typeof mysql.createPool, "function", entry);
    assert.equal(mysql.escape("O'Reilly"), "'O\\'Reilly'", entry);
    assert.equal(mysql.escape(Buffer.from([0, 255])), "X'00ff'", entry);
    assert.equal(mysql.escapeId("products.name"), "`products`.`name`", entry);
    assert.equal(
      mysql.format("UPDATE ?? SET ? WHERE id = ?", ["products", { name: "O'Reilly", active: true }, 7]),
      "UPDATE `products` SET `name` = 'O\\'Reilly', `active` = true WHERE id = 7",
      entry,
    );
  }
});

type PacketOutcome = { kind: "packet"; payload: Buffer } | { kind: "error"; error: NodeJS.ErrnoException };

async function readCompressedPacket(packetBytes: Buffer, declaredLength: number): Promise<PacketOutcome> {
  const { enableCompression } = mysqlInternal("compressed_protocol.js");
  const compressed = declaredLength === 0 ? packetBytes : deflateSync(packetBytes);
  const frame = Buffer.alloc(7 + compressed.length);
  frame.writeUIntLE(compressed.length, 0, 3);
  frame.writeUIntLE(declaredLength, 4, 3);
  compressed.copy(frame, 7);
  let settle: (outcome: PacketOutcome) => void;
  let timer: NodeJS.Timeout;
  const outcome = new Promise<PacketOutcome>((resolve, reject) => {
    settle = resolve;
    timer = setTimeout(() => reject(new Error("Local compressed packet was not handled")), 2000);
  });
  const connection: any = {
    write() {},
    _bumpCompressedSequenceId() {},
    _handleNetworkError(error: NodeJS.ErrnoException) { settle({ kind: "error", error }); },
    handlePacket(packet: { readBuffer(): Buffer }) { settle({ kind: "packet", payload: packet.readBuffer() }); },
  };
  try {
    enableCompression(connection);
    connection.packetParser.execute(frame);
    return await outcome;
  } finally {
    clearTimeout(timer);
    // Older mysql2 releases used queues with timers; always clean those up too.
    connection.inflateQueue?.close?.(true);
    connection.deflateQueue?.close?.(true);
  }
}

test("dependency safety: mysql2 bounds inflation by the advertised packet length", async () => {
  // A complete 68-byte MySQL packet keeps the fixture harmless even if an old
  // dependency ignores the advertised 8-byte output bound.
  const payload = Buffer.alloc(64, 0x61);
  const packet = Buffer.concat([Buffer.from([payload.length, 0, 0, 0]), payload]);
  const rejected = await readCompressedPacket(packet, 8);
  assert.ok(rejected.kind === "error", "An oversized inflated packet must not reach the packet handler");
  assert.equal(rejected.error.code, "ERR_BUFFER_TOO_LARGE");
  for (const declaredLength of [packet.length, 0]) {
    const accepted = await readCompressedPacket(packet, declaredLength);
    assert.ok(accepted.kind === "packet", "Valid compressed and uncompressed frames remain readable");
    assert.deepEqual(accepted.payload, payload);
  }
});
