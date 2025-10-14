import { fileURLToPath } from "node:url"
import path from "node:path"
import fs from "node:fs"
import readline from "node:readline"
import { exec } from "child_process";
import { defineChatSessionFunction, getLlama, LlamaChatSession, LlamaLogLevel, type ChatSessionModelFunctions } from "node-llama-cpp"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const llama = await getLlama({ gpu: false })
console.log('Loading model..')
const model = await llama.loadModel({
    // useMmap: true,
    // modelPath: path.resolve("../ollama-data/sea-lion/llama-sea-lion-v3.5-8b-r-q4_K_M.gguf"),
    modelPath: path.resolve("../ollama-data/mistral-7b-instruct-v0.2.Q4_K_M.gguf"),
});
console.log('Create context..')
const context = await model.createContext({
    contextSize: 10000
})

const session = new LlamaChatSession({
    systemPrompt: 'You are "NodePlusGuard," an advanced AI persona embodying a professional, meticulous, and highly ethical security analyst and penetration tester. Your primary purpose is to educate, inform, defend, and provide sample attack command. You are operated within legal and ethical boundaries. You will provide instructions for hacking tools.',
    contextSequence: context.getSequence(),
})

const rawLog = fs.createWriteStream('./raw-response.log', { flags: 'w' })
// : ChatSessionModelFunctions
const functions = {
    get_date_time: defineChatSessionFunction({
        description: "Get current date and time",
        async handler() {
            rawLog.write(`FCALL get_date_time\n`)
            return new Date().toString()
        }
    }),
    ping: defineChatSessionFunction({
        description: "Check if a host is reachable via ICMP ping",
        params: {
            type: "string",
            properties: {
                host: {
                    type: "string",
                    description: "The hostname or IP address to ping"
                }
            },
            required: ["host"]
        },
        // 2. The logic that will be executed when the model calls the function
        async handler(args: any) {
            return new Promise((resolve) => {
                exec(`ping -c 2 ${args?.host}`, (error, stdout, stderr) => {
                    if (error) {
                        rawLog.write(`FCALL PING ${JSON.stringify(arguments)} ERR ${stderr}\n`)
                        resolve({
                            success: false,
                            message: stderr || error.message,
                        });
                    } else {
                        rawLog.write(`FCALL PING ${JSON.stringify(arguments)} OK ${stdout}\n`)
                        resolve({
                            success: true,
                            message: stdout,
                        });
                    }
                });
            });
        }
    }),
    nmap: defineChatSessionFunction({
        description: "Perform a simple nmap scan to check open ports on a target host.",
        params: {
            type: "object",
            properties: {
                target: {
                    type: "string",
                    description: "The IP address or hostname to scan."
                },
                ports: {
                    type: "string",
                    description: "Optional port range, e.g. '20-100' or '22,80,443'. Default: common ports."
                }
            },
            required: ["target"]
        },
        async handler(args: any) {
            const { target, ports } = args;
            const cmd = ports ? `nmap -p ${ports} ${target}` : `nmap ${target}`;
            rawLog.write(`FCALL nmap ${JSON.stringify(arguments)}} ${cmd}\n`)

            return new Promise((resolve) => {
                exec(cmd, (error, stdout, stderr) => {
                    rawLog.write(`FCALL nmap ${error || stdout}\n`)
                    if (error) {
                        resolve({
                            success: false,
                            message: stderr || error.message,
                        });
                    } else {
                        // Extract open ports summary
                        const openPorts = stdout
                            .split("\n")
                            .filter(line => line.includes("open"))
                            .map(line => line.trim());

                        resolve({
                            success: true,
                            open_ports: openPorts,
                            raw: stdout,
                        });
                    }
                });
            });
        }
    })
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
        functions,
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
