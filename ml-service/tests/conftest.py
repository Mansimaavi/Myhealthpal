import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# build the API's index in a temp folder instead of ml-service/index
os.environ.setdefault("INDEX_DIR", os.path.join(tempfile.mkdtemp(), "index"))
# FastAPI's TestClient sends "Host: testserver"; the MCP endpoint rejects unknown hosts
os.environ.setdefault("MCP_ALLOWED_HOSTS", "testserver")

import pytest  # noqa: E402


@pytest.fixture(scope="session")
def client():
    # one app instance for the whole run: the MCP session manager can only be started once
    from fastapi.testclient import TestClient

    from app import main

    with TestClient(main.app) as c:
        yield c
