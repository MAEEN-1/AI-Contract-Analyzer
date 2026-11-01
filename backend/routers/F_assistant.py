import json
import logging
from collections.abc import Iterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from dependencies.F_auth import require_ai_consent
from models.F_assistant_data import AssistantReply, AssistantRequest
from services.F_assistant_service import (
    AssistantFailed,
    AssistantNotConfigured,
    AssistantUnavailable,
    generate_reply,
    stream_reply,
    take_rate_slot,
)

router = APIRouter()

logger = logging.getLogger("maeen.assistant")


def _answer(action, data: AssistantRequest, user):
    wait_seconds = take_rate_slot(str(user.id))
    if wait_seconds:
        raise HTTPException(
            status_code=429,
            detail="Too many questions. Try again in a few minutes",
            headers={"Retry-After": str(wait_seconds)},
        )

    try:
        return action(
            str(user.id),
            [message.model_dump() for message in data.messages],
        )

    except (AssistantNotConfigured, AssistantUnavailable) as error:
        raise HTTPException(
            status_code=503,
            detail="Assistant unavailable. Try again later",
        ) from error

    except AssistantFailed as error:
        raise HTTPException(
            status_code=502,
            detail="Invalid response from assistant service",
        ) from error


@router.post("/api/assistant/chat", response_model=AssistantReply)
def chat(data: AssistantRequest, user=Depends(require_ai_consent)):
    return {"reply": _answer(generate_reply, data, user)}


def _event(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _reply_events(parts: Iterator[str]) -> Iterator[str]:
    try:
        for part in parts:
            yield _event({"delta": part})

    except (AssistantNotConfigured, AssistantUnavailable, AssistantFailed) as error:
        # The status was already sent, so the failure goes in the stream itself.
        logger.warning("Assistant reply stopped midway: %s", type(error).__name__)
        yield _event({"error": "The reply was interrupted. Try again"})
        return

    yield _event({"done": True})


@router.post("/api/assistant/chat/stream")
def chat_stream(data: AssistantRequest, user=Depends(require_ai_consent)):
    """Sends the reply in parts as server-sent events, so it shows as it is written."""
    parts = _answer(stream_reply, data, user)
    return StreamingResponse(
        _reply_events(parts),
        media_type="text/event-stream",
        # Proxies must pass each part on at once instead of holding the reply.
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
