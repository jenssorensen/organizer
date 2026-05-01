import { execFile } from "node:child_process";
import { request } from "node:http";
import { promisify } from "node:util";

const host = "127.0.0.1";
const port = Number(process.env.PORT || 3532);
const probePath = "/api/meta-data-path";
const probeUrl = `http://${host}:${port}${probePath}`;
const execFileAsync = promisify(execFile);

try {
  const existingServer = await detectExistingOrganizerServer();

  if (existingServer === "organizer") {
    console.log(`Organizer server already running on ${probeUrl}; reusing existing instance.`);
    process.exit(0);
  }

  if (existingServer === "other") {
    console.error(
      `Port ${port} is already in use by another service on ${host}. Stop that process or set PORT to use a different organizer server port.`,
    );
    process.exit(1);
  }

  await import("./server.mjs");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function detectExistingOrganizerServer() {
  if (process.platform === "darwin" || process.platform === "linux") {
    const listenerCommand = await getListeningProcessCommand();

    if (!listenerCommand) {
      return "none";
    }

    return isOrganizerProcessCommand(listenerCommand) ? "organizer" : "other";
  }

  return detectExistingOrganizerServerByHttp();
}

async function getListeningProcessCommand() {
  let pid = "";

  try {
    const result = await execFileAsync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
    pid = result.stdout
      .split(/\s+/)
      .map((value) => value.trim())
      .find(Boolean) ?? "";
  } catch (error) {
    if (isMissingListenerError(error)) {
      return null;
    }

    if (isMissingBinaryError(error)) {
      return detectExistingOrganizerServerByHttp();
    }

    throw error;
  }

  if (!pid) {
    return null;
  }

  const result = await execFileAsync("ps", ["-p", pid, "-o", "command="]);
  return result.stdout.trim() || null;
}

async function detectExistingOrganizerServerByHttp() {
  return new Promise((resolve) => {
    const req = request(
      {
        host,
        port,
        path: probePath,
        method: "GET",
        timeout: 1500,
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          try {
            const payload = JSON.parse(body);
            if (response.statusCode === 200 && isOrganizerMetaDataPayload(payload)) {
              resolve("organizer");
              return;
            }
          } catch {
            // Fall through to classify as another service.
          }

          resolve("other");
        });
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });

    req.on("error", (error) => {
      if (isExpectedConnectionFailure(error)) {
        resolve("none");
        return;
      }

      resolve("other");
    });

    req.end();
  });
}

function isOrganizerProcessCommand(command) {
  return command.includes("server/server.mjs") || command.includes("server/devServer.mjs");
}

function isOrganizerMetaDataPayload(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      "configured" in value &&
      typeof value.configured === "boolean" &&
      "path" in value,
  );
}

function isExpectedConnectionFailure(error) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? error.code : null;
  return code === "ECONNREFUSED";
}

function isMissingListenerError(error) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === 1);
}

function isMissingBinaryError(error) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}