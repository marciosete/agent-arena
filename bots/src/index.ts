/**
 * Bot roster entrypoint — agents built by an agent. All wiring lives in
 * main.ts (unit-tested); this file only binds it to the real process.
 */
import { main } from './main';

if (!main(process.env, (line) => console.log(line), process)) {
  process.exitCode = 1;
}
