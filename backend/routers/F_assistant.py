from fastapi import APIRouter, Depends, HTTPException

from dependencies.F_auth import get_current_user
from models.F_assistant_data import AssistantReply, AssistantRequest
from services.F_assistant_service import (
    AssistantFailed,
    AssistantNotConfigured,
    AssistantUnavailable,
    generate_reply,
    take_rate_slot,
)

router = APIRouter()


@router.post("/api/assistant/chat", response_model=AssistantReply)
def chat(data: AssistantRequest, user=Depends(get_current_user)):
    wait_seconds = take_rate_slot(str(user.id))
    if wait_seconds:
        raise HTTPException(
            status_code=429,
            detail="Too many questions. Try again in a few minutes",
            headers={"Retry-After": str(wait_seconds)},
        )

    try:
        reply = generate_reply(
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

    return {"reply": reply}
