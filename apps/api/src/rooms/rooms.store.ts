import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

import { REDIS_URL } from '../config';
import { serializeRoom } from './rooms.serialize';
import type { RoomRecord } from './rooms.types';

/** One room per key: `bozukkart:room:QFTM`. */
const KEY_PREFIX = 'bozukkart:room:';

/**
 * Rooms are abandoned far more often than they are closed cleanly, so every
 * write carries a TTL rather than relying on the delete path. A room nobody has
 * touched for six hours is not one anybody is coming back to.
 */
const ROOM_TTL_SECONDS = 6 * 60 * 60;

/** Keys per SCAN round trip, and per MGET batch when reading them back. */
const SCAN_COUNT = 100;
const READ_BATCH = 256;

const CONNECT_TIMEOUT_MS = 5_000;
const RETRY_DELAY_CAP_MS = 10_000;

/** One room as it came out of Redis, still unparsed. */
export interface StoredRoom {
  readonly code: string;
  readonly raw: string;
}

/**
 * Write-through backup of room state. The registry in `RoomsService` is the
 * source of truth and nothing here is ever read to answer a game action; this
 * exists so a restart has something to pick the rooms back up from.
 *
 * With `REDIS_URL` unset the whole thing is inert: no client, no connection, no
 * errors, and every method returns immediately. Local development is expected
 * to run that way.
 */
@Injectable()
export class RoomStore implements OnModuleDestroy {
  private readonly logger = new Logger(RoomStore.name);

  /** Null when persistence is off. Checked before every operation. */
  private readonly client: Redis | null;

  /**
   * Whether the connection can currently take a command. Writes are skipped
   * rather than queued while it cannot: the rooms are in memory regardless, and
   * an offline queue filling up behind a dead Redis is a leak rather than a
   * safety net.
   */
  private ready = false;

  /** Stops a flapping connection writing the same line on every retry. */
  private reportedError: string | null = null;

  constructor() {
    if (REDIS_URL === null) {
      this.client = null;
      this.logger.log(
        'REDIS_URL is not set: rooms are kept in memory only and will not survive a restart',
      );
      return;
    }

    this.client = new Redis(REDIS_URL, {
      // Nothing connects until the boot restore asks for it, so a bad URL
      // surfaces at a point that can report it rather than during construction.
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 2,
      connectTimeout: CONNECT_TIMEOUT_MS,
      retryStrategy: (times: number) =>
        Math.min(times * 500, RETRY_DELAY_CAP_MS),
    });

    this.client.on('ready', () => {
      this.ready = true;
      this.reportedError = null;
      this.logger.log('Redis connected: room state is being backed up');
    });

    const stopWriting = (): void => {
      this.ready = false;
    };

    this.client.on('close', stopWriting);
    this.client.on('end', stopWriting);

    this.client.on('error', (error: Error) => {
      // ioredis re-emits this on every reconnect attempt; say it once per fault.
      if (this.reportedError === error.message) {
        return;
      }

      this.reportedError = error.message;
      this.logger.warn(
        `Redis unavailable, rooms stay in memory: ${error.message}`,
      );
    });
  }

  /** False when `REDIS_URL` is unset, i.e. persistence is switched off. */
  get enabled(): boolean {
    return this.client !== null;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client === null) {
      return;
    }

    this.ready = false;

    try {
      await this.client.quit();
    } catch {
      // Already gone, or refusing to say goodbye politely.
      this.client.disconnect();
    }
  }

  /**
   * Back up one room. Returns void rather than a promise on purpose: no caller
   * should be able to make a game action wait on a backup, and none can forget
   * to handle the failure because there is nothing handed back to forget.
   */
  save(room: RoomRecord): void {
    const client = this.client;
    if (client === null || !this.ready) {
      return;
    }

    let payload: string;
    try {
      payload = JSON.stringify(serializeRoom(room));
    } catch (error: unknown) {
      this.logger.error(`Could not serialize room ${room.code}`, error);
      return;
    }

    client
      .set(KEY_PREFIX + room.code, payload, 'EX', ROOM_TTL_SECONDS)
      .catch((error: unknown) => {
        this.logger.error(`Could not back up room ${room.code}`, error);
      });
  }

  /** Drop a room that is gone for good. Same fire-and-forget contract. */
  remove(code: string): void {
    const client = this.client;
    if (client === null || !this.ready) {
      return;
    }

    client.del(KEY_PREFIX + code).catch((error: unknown) => {
      this.logger.error(`Could not drop room ${code} from Redis`, error);
    });
  }

  /**
   * Everything currently stored, read once at boot. Unreachable Redis is not
   * fatal: the API comes up with no rooms, which is the same state it would
   * have had without persistence at all.
   */
  async loadAll(): Promise<StoredRoom[]> {
    const client = this.client;
    if (client === null) {
      return [];
    }

    try {
      if (client.status === 'wait') {
        await client.connect();
      }
    } catch (error: unknown) {
      this.logger.error(
        'Could not reach Redis on boot; starting with no rooms',
        error,
      );
      return [];
    }

    try {
      const keys = await this.scanKeys(client);
      return await this.readKeys(client, keys);
    } catch (error: unknown) {
      this.logger.error('Could not read rooms back from Redis', error);
      return [];
    }
  }

  private async scanKeys(client: Redis): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      // Sequential by nature: each round trip needs the previous cursor.
      const [next, batch] = await client.scan(
        cursor,
        'MATCH',
        `${KEY_PREFIX}*`,
        'COUNT',
        SCAN_COUNT,
      );

      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');

    return keys;
  }

  private async readKeys(
    client: Redis,
    keys: readonly string[],
  ): Promise<StoredRoom[]> {
    const stored: StoredRoom[] = [];

    for (let index = 0; index < keys.length; index += READ_BATCH) {
      const batch = keys.slice(index, index + READ_BATCH);
      const values = await client.mget(batch);

      batch.forEach((key, offset) => {
        const raw = values[offset];
        // A key that expired between the scan and the read comes back null.
        if (typeof raw === 'string') {
          stored.push({ code: key.slice(KEY_PREFIX.length), raw });
        }
      });
    }

    return stored;
  }
}
