from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from dependencies.F_auth import get_current_user, require_ai_consent
from models.F_ai_data import AnalysisOut, AnalysisStarted, ChatEntry, ContractAnswer, ContractQuestion
from models.Y_contract_data import ContractOut
from services.F_ai_service import (
    ANALYSIS_LIMIT,
    ANALYSIS_WINDOW_SECONDS,
    AiFailed,
    AiNotConfigured,
    AiUnavailable,
    AnalysisAlreadyRunning,
    ContractNotFound,
    ContractNotReady,
    SuggestedNameUnavailable,
    apply_suggested_name,
    ask_contract,
    get_analysis,
    list_chat,
    run_analysis,
    start_analysis,
)
from services.F_assistant_service import take_rate_slot

router = APIRouter(prefix="/api/contracts", tags=["analysis"])


def _run(action, *args):
    try:
        return action(*args)

    except ContractNotFound as error:
        raise HTTPException(status_code=404, detail="Contract not found") from error

    except ContractNotReady as error:
        raise HTTPException(
            status_code=409,
            detail="The contract analysis is not complete",
        ) from error

    except AnalysisAlreadyRunning as error:
        raise HTTPException(
            status_code=409,
            detail="The contract is already being analyzed",
        ) from error

    except SuggestedNameUnavailable as error:
        raise HTTPException(
            status_code=409,
            detail="No descriptive filename was suggested for this contract",
        ) from error

    except (AiNotConfigured, AiUnavailable) as error:
        raise HTTPException(
            status_code=503,
            detail="AI service unavailable. Try again later",
        ) from error

    except AiFailed as error:
        raise HTTPException(
            status_code=502,
            detail="Invalid response from AI service",
        ) from error


def _limit(key: str, limit: int | None = None, window: int | None = None):
    options = {}
    if limit:
        options = {"limit": limit, "window": window}
    wait_seconds = take_rate_slot(key, **options)
    if wait_seconds:
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Try again in a few minutes",
            headers={"Retry-After": str(wait_seconds)},
        )


@router.post("/{contract_id}/analyze", status_code=202, response_model=AnalysisStarted)
def analyze(contract_id: UUID, background_tasks: BackgroundTasks, user=Depends(require_ai_consent)):
    _limit(f"analysis:{user.id}", ANALYSIS_LIMIT, ANALYSIS_WINDOW_SECONDS)
    _run(start_analysis, str(user.id), str(contract_id))
    # Runs after the reply is sent; the frontend checks the contract status for the result.
    background_tasks.add_task(run_analysis, str(user.id), str(contract_id))
    return {"status": "processing"}


@router.get("/{contract_id}/analysis", response_model=AnalysisOut)
def read_analysis(contract_id: UUID, user=Depends(get_current_user)):
    result = _run(get_analysis, str(user.id), str(contract_id))

    if result is None:
        raise HTTPException(status_code=404, detail="Analysis not found")

    return result


@router.post("/{contract_id}/apply-suggested-name", response_model=ContractOut)
def rename_from_analysis(contract_id: UUID, user=Depends(get_current_user)):
    return _run(apply_suggested_name, str(user.id), str(contract_id))


@router.post("/{contract_id}/chat", response_model=ContractAnswer)
def ask(contract_id: UUID, data: ContractQuestion, user=Depends(require_ai_consent)):
    # Shares the assistant's 20 questions per 10 minutes.
    _limit(str(user.id))
    return _run(ask_contract, str(user.id), str(contract_id), data.question)


@router.get("/{contract_id}/chat", response_model=list[ChatEntry])
def read_chat(contract_id: UUID, user=Depends(get_current_user)):
    return _run(list_chat, str(user.id), str(contract_id))
