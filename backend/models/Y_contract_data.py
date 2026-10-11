from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ContractOut(BaseModel):
    """What the frontend receives for a contract. storage_path stays server-side."""

    id: UUID
    file_name: str
    status: str
    created_at: datetime
    updated_at: datetime
