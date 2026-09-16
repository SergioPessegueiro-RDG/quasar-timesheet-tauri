import { getDriver, type SqlDriver } from "./driver";
import { migrate, seedIfEmpty } from "./schema";

let ready: Promise<SqlDriver> | null = null;

/**
 * Opens the database, brings the schema up to date and seeds first-run content.
 * Idempotent, so components can await it without coordinating who goes first.
 */
export function database(): Promise<SqlDriver> {
  ready ??= (async () => {
    const driver = await getDriver();
    await migrate(driver);
    await seedIfEmpty(driver);
    return driver;
  })();
  return ready;
}

export { isTauri } from "./driver";
export type { SqlDriver } from "./driver";
