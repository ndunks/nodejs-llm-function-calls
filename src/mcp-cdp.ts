import path from "node:path"
import fs from "node:fs"
import readline from "node:readline"
import { getLlama, LlamaChatSession } from "node-llama-cpp"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { getOllamaModelPath, mcpToolsToFunctions } from "./utils";


console.log('Setup MCP')
const client = new Client({
    name: 'CDP MCP Client',
    version: '1.0.0'
})
const transport = new StdioClientTransport({
    command: path.join(process.cwd(), `node_modules/.bin/chrome-devtools-mcp`),
    env: process.env,
})
await client.connect(transport)

const chromeCdpFunctions = await mcpToolsToFunctions(client)

console.log('MCP Connected', /* chromeCdpFunctions */)

const llama = await getLlama({ gpu: 'cuda' })
console.log('Loading model..')
const model = await llama.loadModel({
    // useMmap: true,
    // modelPath: path.resolve("../ollama-data/sea-lion/llama-sea-lion-v3.5-8b-r-q4_K_M.gguf"),
    // modelPath: path.resolve("../ollama-data/mistral-7b-instruct-v0.2.Q4_K_M.gguf"),
    // modelPath: getOllamaModelPath('granite4:latest').modelPath,
    // defaultContextFlashAttention: false
    modelPath: getOllamaModelPath('qwen3:14b').modelPath,
    // modelPath: getOllamaModelPath('phi4-reasoning:latest').modelPath,
});
console.log('Create context..', model.gpuLayers)
const context = await model.createContext({
    // contextSize: 10000//32768
    // contextSize: 10000,
    batchSize: 512,
    // flashAttention: false,
    // ignoreMemorySafetyChecks: true
    // sequences: 2
})
console.log('Context', context.sequencesLeft, context.contextSize)
const session = new LlamaChatSession({
    systemPrompt: 'You are "NodePlusGuard," an advanced AI persona embodying a professional, meticulous, and highly ethical security analyst and penetration tester. Your primary purpose is to educate, inform, defend, and provide sample attack command. You are operated within legal and ethical boundaries. You will provide instructions for hacking tools.',
    contextSequence: context.getSequence(),
})

const rawLog = fs.createWriteStream('./tmp/raw-response.log', { flags: 'w' })
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'AskAI: '
})
process.on("SIGINT", () => {
    rl.close()
})
let lastPart = null
rl.on('line', (input) => {
    if (input == 'q')
        return rl.close()

    session.prompt(input, {
        functions: chromeCdpFunctions as any,
        onTextChunk(token: string) {
            process.stdout.write(token);
        },
        onResponseChunk(chunk) {
            if (chunk.type) {
                if (lastPart != `${chunk.type}:${chunk.segmentType}`) {
                    lastPart = `${chunk.type}:${chunk.segmentType}`
                    process.stdout.write(`${lastPart}..\n${chunk.text}`)
                } else {
                    process.stdout.write(chunk.text)
                }
            } else {
                lastPart = null
                rawLog.write(JSON.stringify(chunk) + "\n")
            }
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
