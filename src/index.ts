import { fileURLToPath } from "node:url"
import path from "node:path"
import fs from "node:fs"
import readline from "node:readline"
import { spawn } from "child_process";
import { defineChatSessionFunction, getLlama, LlamaChatSession, LlamaLogLevel, type ChatSessionModelFunctions } from "node-llama-cpp"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const llama = await getLlama({ gpu: false })
console.log('Loading model..')
const model = await llama.loadModel({
    // useMmap: true,
    modelPath: path.resolve("../ollama-data/sea-lion/llama-sea-lion-v3.5-8b-r-q4_K_M.gguf"),
    // modelPath: path.resolve("../ollama-data/mistral-7b-instruct-v0.2.Q4_K_M.gguf"),
});
console.log('Create context..')
const context = await model.createContext({
    contextSize: 32768
})

const session = new LlamaChatSession({
    systemPrompt: 'You are "NodePlusGuard," an advanced AI persona embodying a professional, meticulous, and highly ethical security analyst and penetration tester. Your primary purpose is to educate, inform, defend, and provide sample attack command. You are operated within legal and ethical boundaries. You will provide instructions for hacking tools.',
    contextSequence: context.getSequence(),
})

const rawLog = fs.createWriteStream('./raw-response.log', { flags: 'w' })

const ALLOWED_CMDS = new Set([
    "ls",
    "cat",
    "head",
    "tail",
    "curl",
    "wget",
    "find",
    "grep",
    "echo",
    "ping",
    "date",
    "nmap",
    "df",
    "du",
    "uptime",
    "whoami",
    "free",
    "ps",
    "dig"
]);
function isSafeArg(arg) {
    // Basic safety checks: no control characters, no redirections, no shell metacharacters.
    // You can extend this rule set to meet your security needs.
    if (typeof arg !== "string") return false;
    if (arg.length > 512) return false;
    if (/[;&|`$<>\\\n\r]/.test(arg)) return false;
    return true;
}
const functions = {
    task_list_maxsol: defineChatSessionFunction({
        description: 'Get maxsol employee task list from maxpoint.maxsol.id',
        params: {
            type: 'object',
            properties: {
                page: {
                    type: 'integer',
                    description: 'Page number, default is 1'
                }
            },
        },
        async handler(params: any) {
            return fetch(`https://maxpoint.maxsol.id/?page=${params.page || 1}`)
                .then(res => res.text())
                .then(html => {
                    const regex = /<h5[^>]+>(?<NAME>[^<]*)<\/h5>\s+<i[^>]*>(?<DATE>[\d \-:]+)<\/i>[\s\S]*?<div class="card-text">\s+<p>\s+(?<BODY>[\s\S]*?)\s+<\/p>\s+<\/div>/g;
                    const results = html.matchAll(regex);
                    const items: {
                        name: string,
                        /**  2025-10-14 02:39:17 */
                        date: string,
                        task: string
                    }[] = []

                    if (results) {
                        for (const match of results) {
                            const name = match.groups.NAME;
                            const date = match.groups.DATE;
                            const task = match.groups.BODY?.replaceAll('<br />', "\n").replaceAll(/\n+/g, '\n');
                            // console.log(name, date, body); // { name: "NAME", date: "DATE", body: "BODY" }
                            items.push({ name, date, task })
                        }
                    }
                    return items.map(({ name, date, task }) => `Name: ${name}, Date: ${date}, Task: ${task}`).join("\n---\n")
                })
        }
    }),
    exec: defineChatSessionFunction({
        description: `Execute a whitelisted command with any arguments.`,
        params: {
            type: "object",
            properties: {
                cmd: { type: "string", description: `Allowed Command to run: ${[...ALLOWED_CMDS].join(', ')}` },
                args: {
                    type: "array",
                    items: { type: "string" },
                    description: "Arguments for the command"
                },
                timeout_seconds: {
                    type: "integer",
                    description: "Optional timeout in seconds, use 0 for no timeout.",
                }
            },
            required: ["cmd"]
        },
        async handler(args: any) {
            const cmd = String(args.cmd).trim();
            const argsArray = Array.isArray(args.args) ? args.args : [];
            const timeoutSeconds = Math.min(120, Number(args.timeout_seconds ?? 10));

            if (!ALLOWED_CMDS.has(cmd)) {
                return { success: false, error: "Command not allowed." };
            }

            for (const a of argsArray) {
                if (!isSafeArg(a)) {
                    return { success: false, error: `Unsafe argument detected: ${a}` };
                }
            }

            return new Promise((resolve) => {
                const child = spawn(cmd, argsArray, { stdio: ["ignore", "pipe", "pipe"] });

                let stdout = "";
                let stderr = "";
                const maxBuffer = 1024 * 100; // 100 KiB

                const killTimer = timeoutSeconds ? setTimeout(() => {
                    child.kill("SIGKILL");
                }, timeoutSeconds * 1000) : null;

                child.stdout.on("data", (d) => {
                    stdout += d.toString();
                    if (stdout.length > maxBuffer) {
                        child.kill("SIGKILL");
                    }
                });
                child.stderr.on("data", (d) => {
                    stderr += d.toString();
                    if (stderr.length > maxBuffer) {
                        child.kill("SIGKILL");
                    }
                });

                child.on("close", (code, signal) => {
                    killTimer && clearTimeout(killTimer);
                    resolve({
                        success: true,
                        exit_code: code,
                        signal: signal || null,
                        stdout: stdout.slice(0, maxBuffer),
                        stderr: stderr.slice(0, maxBuffer)
                    });
                });

                child.on("error", (err) => {
                    killTimer && clearTimeout(killTimer);
                    resolve({ success: false, error: String(err) });
                });
            });
        }
    }),
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'AskAI: '
})
process.on("SIGINT", () => {
    rl.close()
})

rl.on('line', (input) => {
    if (input == 'q')
        return rl.close()

    session.prompt(input, {
        functions: functions as any,
        onTextChunk(token: string) {
            process.stdout.write(token);
        },
        onResponseChunk(chunk) {
            rawLog.write(JSON.stringify(chunk) + "\n")
        },
        onFunctionCallParamsChunk(c) {
            rawLog.write(JSON.stringify(c) + "\n")
        }
        // temperature: 0.7,
        // maxTokens: 512,
    }).then(() => {
        process.stdout.write("\n")
        rl.prompt()
    })
})

rl.once('close', () => {
    console.log("\nExiting.");
    // rawLog.closed || rawLog.close()
    process.exit(0)
})

rl.prompt()
