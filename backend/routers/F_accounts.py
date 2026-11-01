from fastapi import APIRouter, Depends, HTTPException
from httpx import RequestError
from pydantic import ValidationError
from supabase_auth.errors import (
    AuthApiError,
    AuthInvalidCredentialsError,
    AuthUnknownError,
    AuthRetryableError,
    AuthWeakPasswordError,
)
from dependencies.F_auth import get_current_user
from models.F_account_data import RegisterData, LoginData, VerifyData, ResendData
from services.F_auth_service import (
    AI_CONSENT_KEY,
    AccountAlreadyExists,
    AccountDeletionFailed,
    delete_account,
    set_ai_consent,
    register_user,
    login_user,
    take_verify_attempt,
    verify_signup_code,
    resend_signup_code,
)
router = APIRouter()

@router.post("/api/auth/register")
def register(data: RegisterData):
    try:
        account_status = register_user(
            str(data.email), data.password, data.first_name, data.last_name
        )

    except AccountAlreadyExists as error:
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists",
        ) from error

    except AuthInvalidCredentialsError as error:
        raise HTTPException(
            status_code=422,
            detail="Email and password are required",
        ) from error

    except AuthWeakPasswordError as error:
        raise HTTPException(
            status_code=422,
            detail="Password does not meet the security requirements",
        ) from error

    except (RequestError, AuthRetryableError) as error:
        raise HTTPException(
            status_code=503,
            detail="Authentication service unavailable. Try again later",
        ) from error

    except (AuthUnknownError, ValidationError) as error:
        raise HTTPException(
            status_code=502,
            detail="Invalid response from authentication service",
        ) from error

    except AuthApiError as error:
        status = error.status
        if status not in (400, 403, 422, 429):
            status = 502

        raise HTTPException(
            status_code=status,
            detail="Registration could not be completed",
        ) from error

    return {
        "message": (
            "Registration request accepted. "
            "Check your email if confirmation is required."
        ),
        "account_status": account_status,
    }


@router.post("/api/auth/login")
def login(data: LoginData):
    try:
        response = login_user(str(data.email), data.password)

    except AuthInvalidCredentialsError as error:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        ) from error

    except AuthWeakPasswordError as error:
        raise HTTPException(
            status_code=422,
            detail="Password does not meet the security requirements",
        ) from error

    except (RequestError, AuthRetryableError) as error:
        raise HTTPException(
            status_code=503,
            detail="Authentication service unavailable. Try again later",
        ) from error

    except (AuthUnknownError, ValidationError) as error:
        raise HTTPException(
            status_code=502,
            detail="Invalid response from authentication service",
        ) from error

    except AuthApiError as error:
        if error.code == "email_not_confirmed":
            raise HTTPException(
                status_code=403,
                detail="Confirm your email before signing in",
            ) from error

        if error.code == "invalid_credentials":
            raise HTTPException(
                status_code=401,
                detail="Invalid email or password",
            ) from error

        status = error.status
        if status not in (400, 401, 403, 422, 429):
            status = 502

        raise HTTPException(
            status_code=status,
            detail="Sign-in could not be completed",
        ) from error

    if response.session is None:
        raise HTTPException(
            status_code=502,
            detail="No session returned",
        )

    return {
        "access_token": response.session.access_token,
        "token_type": response.session.token_type,
        "expires_in": response.session.expires_in,
    }


@router.post("/api/auth/verify")
def verify(data: VerifyData):
    wait_seconds = take_verify_attempt(str(data.email))
    if wait_seconds:
        raise HTTPException(
            status_code=429,
            detail="Too many attempts. Try again later",
            headers={"Retry-After": str(wait_seconds)},
        )

    try:
        response = verify_signup_code(str(data.email), data.code)

    except (RequestError, AuthRetryableError) as error:
        raise HTTPException(
            status_code=503,
            detail="Authentication service unavailable. Try again later",
        ) from error

    except (AuthUnknownError, ValidationError) as error:
        raise HTTPException(
            status_code=502,
            detail="Invalid response from authentication service",
        ) from error

    except AuthApiError as error:
        if error.status == 429:
            raise HTTPException(
                status_code=429,
                detail="Too many attempts. Try again later",
            ) from error

        # Supabase answers a wrong code and an expired code the same way.
        if error.status in (400, 401, 403, 404, 422):
            raise HTTPException(
                status_code=400,
                detail="Invalid or expired code",
            ) from error

        raise HTTPException(
            status_code=502,
            detail="Verification could not be completed",
        ) from error

    if response.session is None:
        raise HTTPException(
            status_code=502,
            detail="No session returned",
        )

    return {
        "access_token": response.session.access_token,
        "token_type": response.session.token_type,
        "expires_in": response.session.expires_in,
    }


@router.post("/api/auth/resend")
def resend(data: ResendData):
    try:
        resend_signup_code(str(data.email))

    except (RequestError, AuthRetryableError) as error:
        raise HTTPException(
            status_code=503,
            detail="Authentication service unavailable. Try again later",
        ) from error

    except AuthApiError as error:
        if error.status == 429:
            raise HTTPException(
                status_code=429,
                detail="Please wait before requesting another code",
            ) from error

        # Other refusals are hidden so the reply never shows which emails have accounts.
        if error.status >= 500:
            raise HTTPException(
                status_code=502,
                detail="Code could not be sent",
            ) from error

    return {
        "message": "If the account is waiting for activation, a new code was sent."
    }


@router.get("/api/auth/me")
def me(user=Depends(get_current_user)):
    metadata = user.user_metadata or {}

    return {
        "id": user.id,
        "email": user.email,
        "first_name": metadata.get("first_name"),
        "last_name": metadata.get("last_name"),
        "ai_consent_at": metadata.get(AI_CONSENT_KEY),
    }


def _update_ai_consent(user_id: str, given: bool):
    try:
        return set_ai_consent(user_id, given)

    except (RequestError, AuthRetryableError) as error:
        raise HTTPException(
            status_code=503,
            detail="Authentication service unavailable. Try again later",
        ) from error

    except (AuthApiError, AuthUnknownError) as error:
        raise HTTPException(
            status_code=502,
            detail="Consent could not be saved",
        ) from error


@router.post("/api/auth/ai-consent")
def give_ai_consent(user=Depends(get_current_user)):
    return {"ai_consent_at": _update_ai_consent(user.id, True)}


@router.delete("/api/auth/ai-consent")
def withdraw_ai_consent(user=Depends(get_current_user)):
    return {"ai_consent_at": _update_ai_consent(user.id, False)}


@router.delete("/api/auth/me", status_code=204)
def delete_me(user=Depends(get_current_user)):
    try:
        delete_account(user.id)

    except (RequestError, AuthRetryableError) as error:
        raise HTTPException(
            status_code=503,
            detail="Authentication service unavailable. Try again later",
        ) from error

    except (AccountDeletionFailed, AuthUnknownError) as error:
        raise HTTPException(
            status_code=502,
            detail="Account could not be deleted",
        ) from error
