import path from "node:path"
import fs from "node:fs"
import readline from "node:readline"
import { getLlama, LlamaChatSession } from "node-llama-cpp"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { mcpToolsToFunctions } from "./utils";


console.log('Setup MCP')
const client = new Client({
    name: 'CDP MCP Client',
    version: '1.0.0'
})
const transport = new StdioClientTransport({
    command: path.join(process.cwd(), `node_modules/.bin/chrome-devtools-mcp`),
    env: process.env,
    stderr: "inherit"
})
// awatransport.start()
await client.connect(transport)

// const chromeCdpFunctions = await mcpToolsToFunctions(client)

// console.log('MCP Connected', chromeCdpFunctions)
await client.callTool({
    "name": "new_page",
    "arguments": {
        "url": "https://1.1.1.1"
    }
})

console.log('New Page opened')
await client.callTool({
    "name": "list_pages",
    arguments: {}
}).then(console.log)

await client.callTool({
    "name": "wait_for",
    arguments: {
        text: 'The free app'
    }
})

console.log('Text visible')