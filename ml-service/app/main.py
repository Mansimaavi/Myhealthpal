import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

from . import services
from .mcp_server import http_app, mcp

logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app):
    services.startup()
    # the mounted MCP app's session manager has to run for the lifetime of the server
    async with mcp.session_manager.run():
        yield


app = FastAPI(title="MyHealthPal ML service", lifespan=lifespan)
app.mount("/mcp", http_app())


class TextIn(BaseModel):
    text: str = Field(..., max_length=5000)

    @field_validator("text")
    @classmethod
    def not_blank(cls, v):
        if not v.strip():
            raise ValueError("text must not be empty")
        return v.strip()


class RetrieveIn(BaseModel):
    query: str = Field(..., max_length=5000)
    top_k: int = Field(3, ge=1, le=10)

    @field_validator("query")
    @classmethod
    def not_blank(cls, v):
        if not v.strip():
            raise ValueError("query must not be empty")
        return v.strip()


@app.get("/health")
def health():
    return services.health()


@app.post("/sentiment")
def sentiment(body: TextIn):
    try:
        return services.analyze_emotion(body.text)
    except services.ModelNotLoaded as err:
        raise HTTPException(status_code=503, detail=str(err))


@app.post("/retrieve")
def retrieve(body: RetrieveIn):
    try:
        return services.search_knowledge_base(body.query, body.top_k)
    except Exception:
        logger.exception("Retrieval failed")
        raise HTTPException(status_code=503, detail="Retrieval is temporarily unavailable")
