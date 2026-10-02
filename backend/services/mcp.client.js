// services/mcp.client.js
// Small wrapper around the official MCP client. The backend talks to the ML service's
// MCP server (ml-service/app/mcp_server.py) through this one function: callTool(name, args).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const MCP_URL = process.env.MCP_URL || `${ML_SERVICE_URL}/mcp/`;
const MCP_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS) || 10000;

let clientPromise = null;

// connect once and reuse the client; if connecting fails, the next call tries again
const getClient = () => {
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = new Client({ name: 'myhealthpal-backend', version: '1.0.0' });
      await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL)));
      return client;
    })().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
};

export const callTool = async (name, args = {}) => {
  let result;
  try {
    const client = await getClient();
    result = await client.callTool({ name, arguments: args }, undefined, { timeout: MCP_TIMEOUT_MS });
  } catch (err) {
    clientPromise = null; // drop a broken connection so the next call reconnects
    throw new Error(`MCP tool ${name} failed: ${err.message}`);
  }

  // tools return their JSON as a text content block
  const text = result?.content?.find(c => c.type === 'text')?.text;
  if (result?.isError || typeof text !== 'string') {
    throw new Error(`MCP tool ${name} returned an error${text ? `: ${text}` : ''}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`MCP tool ${name} returned invalid JSON`);
  }
};

export default { callTool };
