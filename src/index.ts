import readline from "node:readline";
import { VoiceApp } from "./app.js";

function restoreTerminal(): void {
  process.stdout.write("\x1b[0m\x1b[?25h\n");
}

async function main(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("assembly-pi requires a TTY");
  }

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  const app = new VoiceApp(process.cwd());

  const cleanup = async (): Promise<void> => {
    process.stdin.setRawMode(false);
    restoreTerminal();
    await app.dispose();
  };

  const exit = async (code = 0): Promise<void> => {
    await cleanup();
    process.exit(code);
  };

  process.on("SIGINT", () => void exit(0));
  process.on("SIGTERM", () => void exit(0));
  process.on("uncaughtException", (err) => {
    restoreTerminal();
    console.error(err);
    void exit(1);
  });
  process.on("unhandledRejection", (err) => {
    restoreTerminal();
    console.error(err);
    void exit(1);
  });

  process.stdin.on("keypress", (_str, key) => {
    app.onKey(key?.name, key?.sequence ?? "", Boolean(key?.ctrl));
    if (!app.isRunning()) {
      void exit(0);
    }
  });

  process.stdout.write("\x1b[2J\x1b[H");
  await app.start();
}

main().catch((err) => {
  restoreTerminal();
  console.error(err);
  process.exit(1);
});
