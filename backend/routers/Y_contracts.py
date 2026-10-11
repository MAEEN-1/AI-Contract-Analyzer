from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from starlette.concurrency import run_in_threadpool

from dependencies.F_auth import get_current_user
from models.Y_contract_data import ContractOut
from services.Y_contract_service import (
    MAX_PDF_BYTES,
    ContractServiceError,
    ContractServiceUnavailable,
    clean_file_name,
    create_contract,
    delete_contract,
    get_contract,
    list_contracts,
)

router = APIRouter(prefix="/api/contracts", tags=["contracts"])

READ_CHUNK_BYTES = 1024 * 1024
# A multipart body is a little larger than the file inside it.
MULTIPART_OVERHEAD_BYTES = 64 * 1024


def _too_large() -> HTTPException:
    return HTTPException(status_code=413, detail="PDF must be 50 MB or smaller")


async def _run(action, *args):
    try:
        return await run_in_threadpool(action, *args)
    except ContractServiceUnavailable as error:
        raise HTTPException(
            status_code=503,
            detail="Storage service unavailable. Try again later",
        ) from error
    except ContractServiceError as error:
        raise HTTPException(
            status_code=502,
            detail="Invalid response from storage service",
        ) from error


@router.post("", status_code=201, response_model=ContractOut)
async def upload_contract(
    request: Request,
    file: UploadFile = File(...),
    user=Depends(get_current_user),
):
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit():
        if int(content_length) > MAX_PDF_BYTES + MULTIPART_OVERHEAD_BYTES:
            raise _too_large()

    pdf_bytes = bytearray()
    while chunk := await file.read(READ_CHUNK_BYTES):
        pdf_bytes.extend(chunk)
        if len(pdf_bytes) > MAX_PDF_BYTES:
            raise _too_large()

    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="The file is empty")

    # Check the content itself, not the extension or the browser's content type.
    if not bytes(pdf_bytes[:1024]).lstrip().startswith(b"%PDF-"):
        raise HTTPException(status_code=415, detail="Only PDF files are accepted")

    return await _run(
        create_contract,
        str(user.id),
        clean_file_name(file.filename),
        bytes(pdf_bytes),
    )


@router.get("", response_model=list[ContractOut])
async def get_my_contracts(user=Depends(get_current_user)):
    return await _run(list_contracts, str(user.id))


@router.get("/{contract_id}", response_model=ContractOut)
async def get_one_contract(contract_id: UUID, user=Depends(get_current_user)):
    contract = await _run(get_contract, str(user.id), str(contract_id))

    if contract is None:
        raise HTTPException(status_code=404, detail="Contract not found")

    return contract


@router.delete("/{contract_id}", status_code=204)
async def delete_one_contract(contract_id: UUID, user=Depends(get_current_user)):
    deleted = await _run(delete_contract, str(user.id), str(contract_id))

    if not deleted:
        raise HTTPException(status_code=404, detail="Contract not found")

    return Response(status_code=204)
