# LangGraph and MCP in MyHealthPal

How the two pieces that decide how a chat reply is produced work.

## The big picture

When you send a chat message, three programs are involved:

```
Browser ──► Node backend ──────────────────────────► Python ML service
            agent/chatGraph.js (LangGraph)            app/mcp_server.py (MCP server)
            "what should happen, in what order"       "tools: crisis check, search, emotion, helplines"
                    │
                    └──► OpenRouter (the LLM writes the reply)
```

- **LangGraph** is the *plan*: the steps a reply goes through and the decisions between them.
- **MCP** is how the plan *uses tools* that live in another program.

---

## Part 1: LangGraph

### The idea

Without LangGraph, the reply logic would be one long function full of `if` statements. LangGraph lets you draw it as a **graph**:

- **State**: a shared object that every step can read and update (the user's message, retrieved chunks, the reply, ...).
- **Nodes**: small functions, each doing one job. A node receives the state and returns only the fields it changes.
- **Edges**: arrows saying which node runs next. A **conditional edge** is an arrow chosen by a function, which is where the decisions live.

### Our graph (`backend/agent/chatGraph.js`)

```
START → loadConversation → safetyCheck ─┬─ crisis ────────→ addCrisisSupport ─┐
                                        ├─ therapy chat ──→ retrieve ─────────┤
                                        └─ symptom check ─────────────────────┤
                                                                              ▼
                                                                          generate
                                                                              │
                                             (bad citations, once) ◄── verifyCitations
                                                                              │ ok
                                                                       checkEscalation → END
```

| Node | What it does |
|---|---|
| `loadConversation` | Loads the session type and message history from MongoDB |
| `safetyCheck` | Calls the `check_crisis` MCP tool. This is phrase matching, not AI, so it's predictable |
| `addCrisisSupport` | Crisis only: fetches the helpline information to put in the prompt |
| `retrieve` | Therapy chats only: RAG search of the knowledge base |
| `generate` | Builds the prompt (history + retrieved notes) and calls the LLM |
| `verifyCitations` | Checks every `[n]` in the reply points to a real source. If not, sends it back to `generate` once with feedback |
| `checkEscalation` | Symptom checks: sets `needsDoctor` if the reply says a doctor is needed, so the app shows "Find doctors near you" |

The two decision functions are tiny. Here's the first one:

```js
const afterSafetyCheck = (state) => {
  if (state.crisis) return 'addCrisisSupport';
  return state.sessionType === THERAPY ? 'retrieve' : 'generate';
};
```

### The state

```js
export const ChatState = Annotation.Root({
  userText: Annotation(),
  chunks: Annotation(),
  reply: Annotation(),
  ...
  trace: Annotation({ reducer: (a, b) => a.concat(b), default: () => [] }),
});
```

For most fields, the newest value replaces the old one. `trace` has a **reducer** that appends instead, so every node adds its own name, and the finished state shows the exact path the reply took. Each AI reply saves this trace in MongoDB, which is handy for debugging ("why didn't this reply have sources?").

### Why it's built this way

- **Safety is code, not AI.** The crisis decision is the first node, and it's a deterministic check. An LLM could forget or be talked out of it; this can't.
- **It fails safe.** If the crisis check can't reach the ML service, `generate` still adds the helpline instruction.
- **Self-correction.** Small free models sometimes cite `[5]` when there are only 3 sources. The `verifyCitations` → `generate` loop is the classic LangGraph pattern: check the output and loop back once.
- **It's testable.** Dependencies (database, LLM, tools) are passed into `buildChatGraph()`, so `backend/test/chatGraph.test.js` runs every path with fakes in milliseconds (`npm test`).

---

## Part 2: MCP (Model Context Protocol)

### The idea

MCP is a standard way for a program to offer **tools** that AI apps can discover and call. Think of it like USB for AI tools: write the server once, and any MCP client can plug in, whether that's our backend, Claude Desktop or the MCP Inspector.

- **MCP server**: offers tools. Ours is `ml-service/app/mcp_server.py`.
- **MCP client**: connects, asks "what tools do you have?" (`tools/list`), then calls them (`tools/call`). Ours is `backend/services/mcp.client.js`.
- **Transport**: how they talk. We use *streamable HTTP*: JSON messages over HTTP at `http://localhost:8000/mcp/`.

### Our tools

| Tool | What it does |
|---|---|
| `check_crisis(text)` | Phrase check for suicidal thoughts or self-harm → `{crisis: true/false}` |
| `search_knowledge_base(query, top_k)` | TF-IDF RAG search, with citations |
| `analyze_emotion(text)` | Fine-tuned BERT emotion and sentiment |
| `get_crisis_resources()` | Tele-MANAS and emergency numbers |

Making a tool is one decorator:

```python
@mcp.tool()
def check_crisis(text: str) -> dict:
    """Check whether a message suggests suicidal thoughts or self-harm. ..."""
    return services.check_crisis(text)
```

The SDK turns the **function name, type hints and docstring** into the tool's name, input schema and description, which is what clients (and AI models) read to decide how to use it.

### One implementation, two front doors

The logic lives in `ml-service/app/services.py`. Both the REST endpoints (`/retrieve`, `/sentiment`) and the MCP tools call the same functions, so nothing is duplicated.

### Calling a tool from Node

```js
import { callTool } from './mcp.client.js';
const { crisis } = await callTool('check_crisis', { text: 'I want to end it all' });
```

`callTool` connects once, reuses the connection, applies a timeout, and parses the JSON result.

### Security

- The MCP endpoint only accepts requests addressed to known hosts (`MCP_ALLOWED_HOSTS`), which protects against DNS-rebinding attacks.
- All four tools are read-only and never touch user data.

---

## Try it yourself

**1. Watch the tools in the MCP Inspector** (with the ML service running):

```bash
npx @modelcontextprotocol/inspector
```

Choose transport **Streamable HTTP**, enter `http://localhost:8000/mcp/`, click Connect, then open **Tools**. Try `search_knowledge_base` with "I can't sleep".

**2. Use your tools from Claude Desktop.** Add this to Claude Desktop's config file (Settings → Developer → Edit Config), then restart Claude Desktop:

```json
{
  "mcpServers": {
    "myhealthpal": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8000/mcp/"]
    }
  }
}
```

Ask Claude "Use myhealthpal to find tips for exam stress" and it will call your `search_knowledge_base` tool.

**3. See the path a reply took.** Open a reply in MongoDB (Compass or Atlas) and look at its `trace` field, for example `["loadConversation","safetyCheck","retrieve","generate","verifyCitations","checkEscalation"]`.

**4. Run the graph tests:** `cd backend && npm test`.
