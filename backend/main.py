from fastapi import FastAPI, Request
from routers.F_accounts import router
from routers.Y_contracts import router as contracts_router
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
import os
app = FastAPI()
app.include_router(router)
app.include_router(contracts_router)

frontend_url = os.getenv("FRONTEND_URL")

if frontend_url:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[frontend_url.strip().rstrip("/")],
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )


@app.exception_handler(RequestValidationError)
def validation_error_handler(request: Request, error: RequestValidationError):
    details = []

    for issue in error.errors():
        details.append({
            "loc": issue["loc"],
            "msg": issue["msg"],
            "type": issue["type"],
        })

    return JSONResponse(
        status_code=422,
        content={"detail": details},
    )


@app.get("/")
def root():
    return {"message": "AI Contract Analyzer API"}
