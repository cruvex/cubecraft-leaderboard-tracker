import { connect } from "node:net";
import { z } from "zod";

// Echoed straight back in the response, so the value is arbitrary: a status
// ping negotiates nothing.
const defaultProtocol = 765;

const responseTimeoutMs = 10_000;

const StatusSchema = z.object({
  version: z.object({ name: z.string(), protocol: z.number() }),
  players: z.object({ online: z.number(), max: z.number() }),
});

export type ServerStatus = z.infer<typeof StatusSchema>;

// Minecraft colour and style codes, which servers scatter through display text.
export function stripFormatting(text: string): string {
  return text.replace(/§./g, "");
}

// Server List Ping: the handshake the multiplayer server list uses. Rejects on
// abort, so a hung socket cannot outlive the trigger that opened it.
export function ping(
  host: string,
  port: number,
  signal: AbortSignal,
  protocol = defaultProtocol,
): Promise<ServerStatus> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Ping aborted before it started"));
      return;
    }

    const socket = connect({ host, port });
    let buffer = Buffer.alloc(0);
    let settled = false;

    function finish(error: Error | null, status?: ServerStatus): void {
      if (settled) return;
      settled = true;

      signal.removeEventListener("abort", onAbort);
      socket.destroy();

      if (error) reject(error);
      else resolve(status!);
    }

    function onAbort(): void {
      finish(new Error("Ping aborted"));
    }

    signal.addEventListener("abort", onAbort, { once: true });

    socket.setTimeout(responseTimeoutMs, () =>
      finish(new Error(`No status response within ${responseTimeoutMs}ms`)),
    );

    socket.on("connect", () => {
      socket.write(handshake(host, port, protocol));
      // Status request: an empty 0x00 packet.
      socket.write(frame([0x00]));
    });

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      try {
        const json = readStatusResponse(buffer);
        if (json !== null) finish(null, StatusSchema.parse(json));
      } catch (err) {
        finish(err instanceof Error ? err : new Error(String(err)));
      }
    });

    socket.on("error", (err) => finish(err));
    socket.on("close", () =>
      finish(new Error("Connection closed before a status response")),
    );
  });
}

function handshake(host: string, port: number, protocol: number): Buffer {
  return frame([
    0x00,
    ...varInt(protocol),
    ...mcString(host),
    (port >> 8) & 0xff,
    port & 0xff,
    // Next state: status rather than login.
    0x01,
  ]);
}

// null while the response is still arriving: TCP splits it across chunks and the
// length prefix is the only way to know whether all of it has landed.
function readStatusResponse(buffer: Buffer): unknown | null {
  const length = readVarInt(buffer, 0);
  if (!length || buffer.length < length.offset + length.value) return null;

  const packetId = readVarInt(buffer, length.offset);
  if (!packetId) return null;

  if (packetId.value !== 0x00) {
    throw new Error(`Unexpected packet 0x${packetId.value.toString(16)}`);
  }

  const json = readVarInt(buffer, packetId.offset);
  if (!json) return null;

  const start = json.offset;
  return JSON.parse(buffer.subarray(start, start + json.value).toString("utf8"));
}

// Every length and id on the wire is a base-128 varint: low group first, high bit
// set on every byte but the last.
function varInt(value: number): number[] {
  const bytes: number[] = [];
  let rest = value;

  do {
    const group = rest & 0x7f;
    rest >>>= 7;
    bytes.push(rest === 0 ? group : group | 0x80);
  } while (rest !== 0);

  return bytes;
}

// null when the buffer does not hold a complete varint yet.
function readVarInt(
  buffer: Buffer,
  offset: number,
): { value: number; offset: number } | null {
  let value = 0;

  for (let shift = 0; shift < 35; shift += 7) {
    if (offset >= buffer.length) return null;

    const byte = buffer[offset++]!;
    value |= (byte & 0x7f) << shift;

    if ((byte & 0x80) === 0) return { value, offset };
  }

  throw new Error("VarInt is longer than five bytes");
}

function mcString(value: string): number[] {
  const bytes = Buffer.from(value, "utf8");
  return [...varInt(bytes.length), ...bytes];
}

function frame(body: number[]): Buffer {
  return Buffer.from([...varInt(body.length), ...body]);
}
