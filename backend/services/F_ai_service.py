"""Connects the General Backend to the AI Backend package in ai_backend/.

The AI package reads the PDF, analyzes it, stores searchable chunks and answers
questions from them. As its README asks, this file does the rest: it checks that
the contract belongs to the user, keeps the contract status, and saves
analysis_results and chat_history. Every query filters by the user's id because
the service_role key bypasses RLS.
"""

import logging
import os
import sys
from functools import lru_cache
from pathlib import Path

from httpx import RequestError

from services.F_supabase_client import get_supabase_client

# ai_backend/ sits next to backend/, so the repository root must be importable.
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.append(str(REPO_ROOT))

# The AI package calls the service_role key SUPABASE_SERVICE_ROLE_KEY; ours is SUPABASE_KEY.
if os.getenv("SUPABASE_KEY") and not os.getenv("SUPABASE_SERVICE_ROLE_KEY"):
    os.environ["SUPABASE_SERVICE_ROLE_KEY"] = os.environ["SUPABASE_KEY"]

logger = logging.getLogger("maeen.ai")

REQUIRED_SETTINGS = ("OPENAI_API_KEY", "CHAT_MODEL", "SUPABASE_DB_URL", "SUPABASE_SERVICE_ROLE_KEY")
CONTRACT_COLUMNS = "id,status"
# Each analysis makes several paid OpenAI requests, so it has its own, smaller limit.
ANALYSIS_LIMIT = 10
ANALYSIS_WINDOW_SECONDS = 3600
CHAT_HISTORY_LIMIT = 50


class AiNotConfigured(Exception):
    """A required setting or AI package is missing."""


class AiUnavailable(Exception):
    """OpenAI, Supabase or the database could not be reached; trying later may work."""


class AiFailed(Exception):
    """The AI or the database answered, but not with a usable result."""


class ContractNotFound(Exception):
    """The contract does not exist or belongs to another user."""


class ContractNotReady(Exception):
    """The contract's analysis is not complete, so it cannot be asked about yet."""


class AnalysisAlreadyRunning(Exception):
    """The contract is being analyzed right now."""


def missing_settings() -> list[str]:
    return [name for name in REQUIRED_SETTINGS if not os.getenv(name)]


@lru_cache(maxsize=1)
def _data_client():
    return get_supabase_client()


def _db(action):
    try:
        return action()
    except RequestError as error:
        raise AiUnavailable("Supabase unavailable") from error
    except Exception as error:
        raise AiFailed("Supabase request failed") from error


def _ai():
    # Imported on first use so the rest of the backend still starts without the AI packages.
    try:
        from ai_backend import production_pipeline
    except ImportError as error:
        raise AiNotConfigured("AI Backend packages are not installed") from error
    return production_pipeline


def _is_temporary(error: Exception) -> bool:
    import openai

    if isinstance(error, (RequestError, openai.APIConnectionError, openai.RateLimitError, openai.InternalServerError)):
        return True
    try:
        import psycopg
    except ImportError:
        return False
    return isinstance(error, psycopg.OperationalError)


def _owned_contract(user_id: str, contract_id: str) -> dict:
    client = _data_client()
    response = _db(lambda: client.table("contracts")
        .select(CONTRACT_COLUMNS)
        .eq("id", contract_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute())

    if not response.data:
        raise ContractNotFound()
    return response.data[0]


def _set_status(user_id: str, contract_id: str, status: str) -> None:
    client = _data_client()
    _db(lambda: client.table("contracts")
        .update({"status": status})
        .eq("id", contract_id)
        .eq("user_id", user_id)
        .execute())


# ---------- analysis ----------

def start_analysis(user_id: str, contract_id: str) -> None:
    """Marks the contract as processing. The caller then runs run_analysis in the background."""
    if missing_settings():
        raise AiNotConfigured(", ".join(missing_settings()))

    contract = _owned_contract(user_id, contract_id)
    if contract["status"] == "processing":
        raise AnalysisAlreadyRunning()

    # Only a contract that is not already processing may switch, so two clicks start one run.
    client = _data_client()
    response = _db(lambda: client.table("contracts")
        .update({"status": "processing"})
        .eq("id", contract_id)
        .eq("user_id", user_id)
        .in_("status", ["uploaded", "failed", "completed"])
        .execute())

    if not response.data:
        raise AnalysisAlreadyRunning()


def run_analysis(user_id: str, contract_id: str) -> None:
    """Runs the AI Backend's analysis and saves the result. Never raises: failures set status failed."""
    try:
        result = _ai().process_contract(contract_id)
        analysis = result["analysis"]
        if not isinstance(analysis, dict):
            raise AiFailed("The AI Backend returned no analysis")

        client = _data_client()
        # One analysis per contract: a new run replaces the previous result.
        _db(lambda: client.table("analysis_results").delete().eq("contract_id", contract_id).execute())
        _db(lambda: client.table("analysis_results").insert({
            "contract_id": contract_id,
            "analysis": analysis,
        }).execute())
        _set_status(user_id, contract_id, "completed")
        logger.info("Analysis completed for contract %s (%s chunks)", contract_id, result.get("chunk_count"))

    except Exception:
        logger.exception("Analysis failed for contract %s", contract_id)
        try:
            _set_status(user_id, contract_id, "failed")
        except Exception:
            logger.exception("Could not mark contract %s as failed", contract_id)


def get_analysis(user_id: str, contract_id: str) -> dict | None:
    _owned_contract(user_id, contract_id)

    client = _data_client()
    response = _db(lambda: client.table("analysis_results")
        .select("analysis,created_at")
        .eq("contract_id", contract_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute())

    return response.data[0] if response.data else None


# ---------- questions about a contract ----------

def _clean_sources(raw_sources) -> list[dict]:
    sources = []
    for source in raw_sources or []:
        page = source.get("page") if isinstance(source, dict) else None
        text = source.get("text") if isinstance(source, dict) else None
        if isinstance(page, int) and page > 0 and isinstance(text, str) and text.strip():
            sources.append({"page": page, "text": text.strip()})
    return sources


def ask_contract(user_id: str, contract_id: str, question: str) -> dict:
    if missing_settings():
        raise AiNotConfigured(", ".join(missing_settings()))

    contract = _owned_contract(user_id, contract_id)
    if contract["status"] != "completed":
        raise ContractNotReady()

    try:
        result = _ai().chat_with_contract(contract_id, question)
    except AiNotConfigured:
        raise
    except Exception as error:
        logger.warning("Contract chat failed for %s: %s", contract_id, type(error).__name__)
        if _is_temporary(error):
            raise AiUnavailable("AI Backend unavailable") from error
        raise AiFailed("AI Backend request failed") from error

    answer = result.get("answer") if isinstance(result, dict) else None
    if not isinstance(answer, str) or not answer.strip():
        raise AiFailed("The AI Backend returned no answer")
    reply = {"answer": answer.strip(), "sources": _clean_sources(result.get("sources"))}

    # The answer matters more than the history: a failed save is logged, not shown.
    try:
        client = _data_client()
        _db(lambda: client.table("chat_history").insert({
            "contract_id": contract_id,
            "user_id": user_id,
            "question": question,
            "answer": reply["answer"],
            "sources": reply["sources"],
        }).execute())
    except (AiUnavailable, AiFailed):
        logger.exception("Could not save chat history for contract %s", contract_id)

    return reply


def list_chat(user_id: str, contract_id: str) -> list[dict]:
    _owned_contract(user_id, contract_id)

    client = _data_client()
    response = _db(lambda: client.table("chat_history")
        .select("question,answer,sources,created_at")
        .eq("contract_id", contract_id)
        .eq("user_id", user_id)
        .order("created_at", desc=False)
        .limit(CHAT_HISTORY_LIMIT)
        .execute())

    return [
        {**row, "sources": _clean_sources(row.get("sources"))}
        for row in response.data or []
    ]
