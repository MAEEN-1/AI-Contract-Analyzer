import hmac
import os
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from ai_backend.production_pipeline import chat_with_contract, process_contract


router = APIRouter(prefix="/internal/ai", tags=["AI internal"])


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)


def require_internal_token(x_ai_internal_token: str | None = Header(default=None)) -> None:
    expected = os.getenv("AI_INTERNAL_AUTH_TOKEN")
    if not expected or not x_ai_internal_token or not hmac.compare_digest(expected, x_ai_internal_token):
        raise HTTPException(status_code=401, detail="Unauthorized internal request")


def _valid_id(contract_id: str) -> str:
    try:
        return str(UUID(contract_id))
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Invalid contract ID") from error


@router.post("/process/{contract_id}", dependencies=[Depends(require_internal_token)])
def process(contract_id: str) -> dict:
    try:
        return process_contract(_valid_id(contract_id))
    except (ValueError, LookupError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/chat/{contract_id}", dependencies=[Depends(require_internal_token)])
def chat(contract_id: str, body: ChatRequest) -> dict:
    try:
        return chat_with_contract(_valid_id(contract_id), body.question)
    except (ValueError, LookupError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
