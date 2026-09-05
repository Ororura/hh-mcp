import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { TechnicalErrorCode } from "../domain/errors.js";
import type { ToolStatus } from "../domain/statuses.js";

export type ApplicationHistoryEntry = {
  vacancyId: string;
  vacancyUrl: string;
  toolName: string;
  status: ToolStatus;
  attemptedAt: string;
  submittedAt?: string;
  failureCode?: TechnicalErrorCode;
};

export class ApplicationHistoryRepository {
  readonly #database: DatabaseSync;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") mkdirSync(path.dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath);
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS application_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vacancy_id TEXT NOT NULL,
        vacancy_url TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        last_status TEXT NOT NULL,
        attempted_at TEXT NOT NULL,
        submitted_at TEXT,
        failure_code TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_application_history_vacancy
        ON application_history(vacancy_id, attempted_at DESC);
    `);
  }

  record(entry: ApplicationHistoryEntry): void {
    this.#database
      .prepare(`
        INSERT INTO application_history (
          vacancy_id, vacancy_url, tool_name, last_status, attempted_at, submitted_at, failure_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        entry.vacancyId,
        entry.vacancyUrl,
        entry.toolName,
        entry.status,
        entry.attemptedAt,
        entry.submittedAt ?? null,
        entry.failureCode ?? null,
      );
  }

  wasSubmitted(vacancyId: string): boolean {
    const row = this.#database
      .prepare(
        `SELECT 1 AS found FROM application_history
         WHERE vacancy_id = ? AND last_status = 'SUBMITTED' LIMIT 1`,
      )
      .get(vacancyId) as { found: number } | undefined;
    return row?.found === 1;
  }

  count(): number {
    const row = this.#database.prepare("SELECT COUNT(*) AS count FROM application_history").get() as {
      count: number;
    };
    return row.count;
  }

  close(): void {
    this.#database.close();
  }
}
