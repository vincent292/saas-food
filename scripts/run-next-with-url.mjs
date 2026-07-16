import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const mode = process.argv[2] === "start" ? "start" : "dev";
const extraArgs = process.argv.slice(3);
const workspaceRoot = process.cwd();
const nextBin = path.join(workspaceRoot, "node_modules", "next", "dist", "bin", "next");
const urlFile = path.join(workspaceRoot, ".next-local-url");
const infoFile = path.join(workspaceRoot, ".next-local-server.json");

function parsePort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
}

function stripAnsi(value) {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 50; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`No se encontro un puerto libre entre ${startPort} y ${startPort + 49}.`);
}

function writeRuntimeFiles({ mode: currentMode, port, pid, url }) {
  const runtimeUrl = url || `http://localhost:${port}`;
  writeFileSync(urlFile, `${runtimeUrl}\n`, "utf8");
  writeFileSync(
    infoFile,
    JSON.stringify(
      {
        mode: currentMode,
        pid,
        port,
        url: runtimeUrl,
      },
      null,
      2,
    ),
    "utf8",
  );
}

function cleanupRuntimeFiles() {
  rmSync(urlFile, { force: true });
  rmSync(infoFile, { force: true });
}

async function main() {
  const requestedPort = parsePort(process.env.PORT) ?? 3000;
  const port = await findAvailablePort(requestedPort);
  const url = `http://localhost:${port}`;
  let activeUrl = url;
  let activePid = null;
  let existingDevServerDetected = false;

  mkdirSync(path.dirname(urlFile), { recursive: true });
  console.log(`[next:${mode}] URL activa: ${url}`);

  const child = spawn(process.execPath, ["--use-system-ca", nextBin, mode, ...extraArgs], {
    cwd: workspaceRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: ["inherit", "pipe", "pipe"],
  });

  writeRuntimeFiles({ mode, pid: child.pid ?? process.pid, port, url });

  const syncFromOutput = (chunk) => {
    const cleanChunk = stripAnsi(chunk.toString());
    const localMatch = cleanChunk.match(/Local:\s+(https?:\/\/[^\s]+)/i);
    if (localMatch?.[1]) {
      activeUrl = localMatch[1];
      const parsedPort = parsePort(new URL(activeUrl).port) ?? port;
      writeRuntimeFiles({
        mode,
        pid: activePid ?? child.pid ?? process.pid,
        port: parsedPort,
        url: activeUrl,
      });
    }

    const pidMatch = cleanChunk.match(/PID:\s+(\d+)/i);
    if (pidMatch?.[1]) {
      activePid = Number(pidMatch[1]);
    }

    if (cleanChunk.includes("Another next dev server is already running")) {
      existingDevServerDetected = true;
    }
  };

  child.stdout?.on("data", (chunk) => {
    syncFromOutput(chunk);
    process.stdout.write(chunk);
  });

  child.stderr?.on("data", (chunk) => {
    syncFromOutput(chunk);
    process.stderr.write(chunk);
  });

  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.on("SIGINT", () => forwardSignal("SIGINT"));
  process.on("SIGTERM", () => forwardSignal("SIGTERM"));

  child.on("exit", (code, signal) => {
    if (signal) {
      cleanupRuntimeFiles();
      process.kill(process.pid, signal);
      return;
    }

    if (mode === "dev" && existingDevServerDetected && activeUrl) {
      const parsedPort = parsePort(new URL(activeUrl).port) ?? port;
      writeRuntimeFiles({
        mode,
        pid: activePid ?? child.pid ?? process.pid,
        port: parsedPort,
        url: activeUrl,
      });
      console.log(`[next:${mode}] Reutilizando servidor ya activo: ${activeUrl}`);
      process.exit(0);
      return;
    }

    cleanupRuntimeFiles();
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  cleanupRuntimeFiles();
  console.error(`[next:${mode}] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
