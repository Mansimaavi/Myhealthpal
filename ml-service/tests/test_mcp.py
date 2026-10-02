"""Calls the MCP tools the same way the backend does: an MCP client over streamable HTTP."""
import json

import pytest



def mcp_call(client, method, params=None):
    """One JSON-RPC request to the MCP endpoint (what an MCP client library sends for you)."""
    res = client.post(
        "/mcp/",
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}},
        headers={"Accept": "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18"},
    )
    assert res.status_code == 200, res.text
    return res.json()["result"]


def call_tool(client, name, arguments):
    result = mcp_call(client, "tools/call", {"name": name, "arguments": arguments})
    assert result["isError"] is False
    return json.loads(result["content"][0]["text"])


def test_lists_the_four_tools(client):
    tools = {t["name"]: t for t in mcp_call(client, "tools/list")["tools"]}
    assert set(tools) == {"check_crisis", "search_knowledge_base", "analyze_emotion", "get_crisis_resources"}
    schema = tools["search_knowledge_base"]["inputSchema"]
    assert schema["required"] == ["query"] and "top_k" in schema["properties"]
    assert "TF-IDF" in tools["search_knowledge_base"]["description"]


def test_check_crisis_tool(client):
    assert call_tool(client, "check_crisis", {"text": "I want to end it all"}) == {"crisis": True}
    assert call_tool(client, "check_crisis", {"text": "this exam is killing me"}) == {"crisis": False}


def test_search_knowledge_base_tool(client):
    out = call_tool(client, "search_knowledge_base", {"query": "I can't stop worrying, my mind never switches off"})
    assert out["crisis"] is False
    assert out["results"][0]["topic"] == "anxiety"
    assert out["results"][0]["citation"]["url"].startswith("https://")


def test_search_pins_helpline_for_crisis(client):
    out = call_tool(client, "search_knowledge_base", {"query": "I don't see any point in living", "top_k": 2})
    assert out["crisis"] is True and "14416" in out["results"][0]["text"]


def test_crisis_resources_tool(client):
    out = call_tool(client, "get_crisis_resources", {})
    assert out["helplines"][0]["phone"] == "14416"


def test_rejects_unknown_host(client):
    res = client.post("/mcp/", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
                      headers={"Accept": "application/json, text/event-stream", "Host": "evil.example.com"})
    assert res.status_code in (400, 421)
