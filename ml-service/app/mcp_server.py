"""MCP server: exposes MyHealthPal's ML capabilities as tools any MCP client can call
(the backend's LangGraph agent, Claude Desktop, the MCP Inspector, ...).

Each @mcp.tool() function becomes a tool. Its name, docstring and type hints are turned into
the tool description and JSON input schema that clients see, so they are written for the
model that will read them.
"""
import os

from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings

from . import services

mcp = MCPServer(
    "MyHealthPal",
    instructions=(
        "Tools for a mental-health support app. Use check_crisis on every user message first. "
        "search_knowledge_base returns cited notes on emotional-health topics (not physical illness)."
    ),
)


@mcp.tool()
def check_crisis(text: str) -> dict:
    """Check whether a message suggests suicidal thoughts or self-harm.

    Deterministic phrase matching, not a model, so it is safe to rely on. Returns {"crisis": bool}.
    """
    return services.check_crisis(text)


@mcp.tool()
def search_knowledge_base(query: str, top_k: int = 3) -> dict:
    """Search the curated mental-health knowledge base (TF-IDF + cosine similarity).

    Covers depression, anxiety, panic attacks, stress, burnout, grief, loneliness, sleep problems,
    social anxiety, anger, trauma/PTSD and crisis support. Returns matching chunks, best first,
    each with a similarity score and a citation (title, section, source URL).
    """
    top_k = max(1, min(int(top_k), 10))
    return services.search_knowledge_base(query.strip()[:5000], top_k)


@mcp.tool()
def analyze_emotion(text: str) -> dict:
    """Classify the emotion in a message with the fine-tuned BERT model.

    Returns {"label": emotion, "score": confidence, "sentiment": positive/negative/neutral/ambiguous,
    "scores": {emotion: probability}}. Returns {"error": ...} if the model isn't loaded.
    """
    try:
        return services.analyze_emotion(text.strip()[:5000])
    except services.ModelNotLoaded as err:
        return {"error": str(err)}


@mcp.tool()
def get_crisis_resources() -> dict:
    """Get crisis helplines for India (Tele-MANAS 14416, emergency 112) and what to do in an emergency."""
    return services.CRISIS_RESOURCES


def _allowed_hosts():
    # DNS-rebinding protection: only accept requests addressed to these hosts
    extra = [h.strip() for h in os.getenv("MCP_ALLOWED_HOSTS", "").split(",") if h.strip()]
    return ["127.0.0.1:*", "localhost:*", *extra]


def http_app():
    return mcp.streamable_http_app(
        streamable_http_path="/",
        stateless_http=True,       # every request is independent, no session to keep alive
        json_response=True,        # plain JSON responses instead of an SSE stream
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True, allowed_hosts=_allowed_hosts()),
    )
