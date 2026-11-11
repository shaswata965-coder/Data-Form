import "server-only";
import { MongoClient, type Collection, type Db, type ObjectId } from "mongodb";
import type { Answers } from "../form-schema";

export class ConfigError extends Error {}

export interface SubmissionDoc {
  _id?: ObjectId;
  /** Id generated on the device – makes retried uploads idempotent. */
  clientId: string;
  participantId: string;
  consent: boolean;
  answers: Answers;
  schemaVersion: number;
  /** When the form was completed on the device (device clock). */
  clientCreatedAt: Date | null;
  /** When the collector started filling the form (device clock). */
  startedAt: Date | null;
  /** When the server received it. */
  receivedAt: Date;
  userAgent?: string;
}

interface LoginAttemptDoc {
  _id: string;
  count: number;
  expiresAt: Date;
}

declare global {
  var __ohsiMongo: Promise<MongoClient> | undefined;
  var __ohsiIndexes: Promise<unknown> | undefined;
}

function clientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new ConfigError("MONGODB_URI is not set");
  // Reuse one client per server instance (important on serverless platforms).
  if (!globalThis.__ohsiMongo) {
    const client = new MongoClient(uri, {
      appName: "oral-health-data-form",
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
    });
    globalThis.__ohsiMongo = client.connect().catch((e) => {
      globalThis.__ohsiMongo = undefined;
      throw e;
    });
  }
  return globalThis.__ohsiMongo;
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise();
  const db = client.db(process.env.MONGODB_DB || "oral_health");
  if (!globalThis.__ohsiIndexes) {
    globalThis.__ohsiIndexes = Promise.all([
      db.collection("submissions").createIndex({ clientId: 1 }, { unique: true }),
      db.collection("submissions").createIndex({ receivedAt: -1 }),
      db.collection("submissions").createIndex({ participantId: 1 }),
      db.collection("login_attempts").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]).catch((e) => {
      globalThis.__ohsiIndexes = undefined;
      throw e;
    });
  }
  await globalThis.__ohsiIndexes;
  return db;
}

export async function submissions(): Promise<Collection<SubmissionDoc>> {
  return (await getDb()).collection<SubmissionDoc>("submissions");
}

export async function loginAttempts(): Promise<Collection<LoginAttemptDoc>> {
  return (await getDb()).collection<LoginAttemptDoc>("login_attempts");
}
