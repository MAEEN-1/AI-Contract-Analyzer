from fastapi import FastAPI, Request
from routers.F_accounts import router
from routers.Y_contracts import router as contracts_router
from routers.F_assistant import router as assistant_router
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
import os
app = FastAPI()
app.include_router(router)
app.include_router(contracts_router)
app.include_router(assistant_router)

# One address, or several separated by commas (for example the local site and the Netlify site).
frontend_urls = [
    url.strip().rstrip("/")
    for url in os.getenv("FRONTEND_URL", "").split(",")
    if url.strip()
]

if frontend_urls:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=frontend_urls,
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
