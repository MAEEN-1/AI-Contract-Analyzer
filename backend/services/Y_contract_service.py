"""Contract storage and database operations.

Every call uses the service_role key, which bypasses RLS. That is why every
query below filters by the current user's id: the database will not do it for us.
"""

import logging
import unicodedata
from functools import lru_cache
from uuid import uuid4

from httpx import RequestError

from services.F_supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

BUCKET = "contract-pdfs"
MAX_PDF_BYTES = 50 * 1024 * 1024  # Same as the bucket limit set by migration 003.
STORED_FILE_NAME = "contract.pdf"
PUBLIC_COLUMNS = "id,file_name,status,created_at,updated_at"
MAX_FILE_NAME_LENGTH = 255


class ContractServiceUnavailable(Exception):
    """Supabase could not be reached."""


class ContractServiceError(Exception):
    """Supabase answered with an error or an unexpected response."""


@lru_cache(maxsize=1)
def _data_client():
    # One shared client for Storage and table queries. Never call client.auth on it:
    # signing in would replace the service_role headers. Auth uses its own clients.
    return get_supabase_client()


def _call(action):
    try:
        return action()
    except RequestError as error:
        raise ContractServiceUnavailable() from error
    except Exception as error:
        raise ContractServiceError() from error


def build_storage_path(user_id: str, contract_id: str) -> str:
    # Storage keys do not accept Arabic letters and some symbols, so the object
    # gets a fixed name. The user's original name is kept in contracts.file_name.
    return f"{user_id}/{contract_id}/{STORED_FILE_NAME}"


def clean_file_name(raw_name: str | None) -> str:
    name = (raw_name or "").replace("\\", "/").rsplit("/", 1)[-1]
    name = "".join(
        character
        for character in name
        if unicodedata.category(character)[0] != "C"
    ).strip()

    if not name:
        return STORED_FILE_NAME

    return name[:MAX_FILE_NAME_LENGTH]


def _public(row: dict) -> dict:
    return {key: row[key] for key in PUBLIC_COLUMNS.split(",")}


def create_contract(user_id: str, file_name: str, pdf_bytes: bytes) -> dict:
    client = _data_client()
    contract_id = str(uuid4())
    storage_path = build_storage_path(user_id, contract_id)

    _call(lambda: client.storage.from_(BUCKET).upload(
        storage_path,
        pdf_bytes,
        {"content-type": "application/pdf", "upsert": "false"},
    ))

    try:
        response = _call(lambda: client.table("contracts").insert({
            "id": contract_id,
            "user_id": user_id,
            "file_name": file_name,
            "storage_path": storage_path,
            "status": "uploaded",
        }).execute())

        if not response.data:
            raise ContractServiceError()
    except (ContractServiceUnavailable, ContractServiceError):
        # The row was not saved, so remove the uploaded file to avoid an orphan.
        try:
            client.storage.from_(BUCKET).remove([storage_path])
        except Exception:
            logger.exception("Could not remove orphan PDF %s", storage_path)
        raise

    return _public(response.data[0])


def list_contracts(user_id: str) -> list[dict]:
    client = _data_client()
    response = _call(lambda: client.table("contracts")
        .select(PUBLIC_COLUMNS)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute())

    return [_public(row) for row in response.data or []]


def get_contract(user_id: str, contract_id: str) -> dict | None:
    client = _data_client()
    response = _call(lambda: client.table("contracts")
        .select(PUBLIC_COLUMNS)
        .eq("id", contract_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute())

    if not response.data:
        return None

    return _public(response.data[0])


def delete_contract(user_id: str, contract_id: str) -> bool:
    """Delete the PDF and the row. Returns False if the user has no such contract."""
    client = _data_client()
    response = _call(lambda: client.table("contracts")
        .select("storage_path")
        .eq("id", contract_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute())

    if not response.data:
        return False

    storage_path = response.data[0]["storage_path"]

    # File first: if the row delete then fails, the user can retry. The reverse
    # order could leave a PDF that no row points to.
    _call(lambda: client.storage.from_(BUCKET).remove([storage_path]))

    # analysis_results, document_chunks and chat_history go with it (ON DELETE CASCADE).
    _call(lambda: client.table("contracts")
        .delete()
        .eq("id", contract_id)
        .eq("user_id", user_id)
        .execute())

    return True
