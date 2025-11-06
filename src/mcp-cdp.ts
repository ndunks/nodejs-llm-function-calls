import { fileURLToPath } from "node:url"
import path from "node:path"
import fs from "node:fs"
import readline from "node:readline"
import { spawn } from "child_process";
import { defineChatSessionFunction, getLlama, LlamaChatSession } from "node-llama-cpp"
import { MCPStdIOChrome } from "./mcp-stdio-chrome";


console.log('Setup MCP')

const mcpChrome = new MCPStdIOChrome({
    name: 'Chrome Dev Tools',
    version: '1.0.0'
})

await mcpChrome.connect({
    cwd: process.cwd(),
    command: process.argv0,
    args: [path.join(process.cwd(), `node_modules/.bin/chrome-devtools-mcp`)],
})

console.log('MCP Connected')

const llama = await getLlama({ gpu: false })
console.log('Loading model..')
const model = await llama.loadModel({
    // useMmap: true,
    // modelPath: path.resolve("../ollama-data/sea-lion/llama-sea-lion-v3.5-8b-r-q4_K_M.gguf"),
    modelPath: path.resolve("../ollama-data/mistral-7b-instruct-v0.2.Q4_K_M.gguf"),
});
console.log('Create context..')
const context = await model.createContext({
    contextSize: 10000//32768
})

const session = new LlamaChatSession({
    systemPrompt: 'You are "NodePlusGuard," an advanced AI persona embodying a professional, meticulous, and highly ethical security analyst and penetration tester. Your primary purpose is to educate, inform, defend, and provide sample attack command. You are operated within legal and ethical boundaries. You will provide instructions for hacking tools.',
    contextSequence: context.getSequence(),
})

const functions = await mcpChrome.getDefineChatSessionFunctions()
const rawLog = fs.createWriteStream('./raw-response.log', { flags: 'w' })
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
