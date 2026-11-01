import threading
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from httpx import RequestError
from services.F_supabase_client import get_supabase_client
from supabase_auth.errors import AuthApiError, AuthRetryableError, AuthUnknownError

# A code has 6 to 10 digits, so wrong guesses per email are limited.
VERIFY_LIMIT = 5
VERIFY_WINDOW_SECONDS = 600

NEW_ACCOUNT_MAX_AGE = timedelta(seconds=60)

CONTRACTS_BUCKET = "contract-pdfs"

_verify_attempts_by_email: dict[str, deque] = {}
_verify_lock = threading.Lock()


class AccountAlreadyExists(Exception):
    pass


class AccountDeletionFailed(Exception):
    pass


def register_user(email: str, password: str, first_name: str, last_name: str):
    client = get_supabase_client()

    try:
        response = client.auth.sign_up({
            "email": email,
            "password": password,
            "options": {
                "data": {
                    "first_name": first_name,
                    "last_name": last_name,
                },
            },
        })

        # For an email that already has a confirmed account, Supabase answers
        # with a placeholder user that has no identities and sends no email.
        if response.user is not None and response.user.identities == []:
            raise AccountAlreadyExists(email)

        # For an account that exists but is not activated, Supabase sends a new
        # code and returns that account. A new account gets its code the moment
        # it is created, so a code sent long after creation means an older account.
        user = response.user
        code_sent_at = user.confirmation_sent_at or datetime.now(timezone.utc)
        if code_sent_at - user.created_at > NEW_ACCOUNT_MAX_AGE:
            return "not_activated"

        return "new"
    except AuthApiError as error:
        if error.code == "user_already_exists":
            raise AccountAlreadyExists(email) from error
        raise
    except (AttributeError, TypeError) as error:
        raise AuthUnknownError(
            "Invalid response from authentication service",
            error,
        ) from error
    finally:
        client.auth.close()


def login_user(email: str, password: str):
    client = get_supabase_client()

    try:
        response = client.auth.sign_in_with_password({
            "email": email,
            "password": password,
        })

        return response
    except (AttributeError, TypeError) as error:
        raise AuthUnknownError(
            "Invalid response from authentication service",
            error,
        ) from error
    finally:
        client.auth.close()


def take_verify_attempt(email: str) -> int:
    """Counts a code attempt for the email. Returns 0 if allowed, otherwise seconds to wait."""
    now = time.monotonic()

    with _verify_lock:
        recent = _verify_attempts_by_email.setdefault(email.lower(), deque())
        while recent and now - recent[0] >= VERIFY_WINDOW_SECONDS:
            recent.popleft()

        if len(recent) >= VERIFY_LIMIT:
            return max(1, int(VERIFY_WINDOW_SECONDS - (now - recent[0])) + 1)

        recent.append(now)
        return 0


def verify_signup_code(email: str, code: str):
    client = get_supabase_client()

    try:
        response = client.auth.verify_otp({
            "email": email,
            "token": code,
            "type": "email",
        })

        return response
    except (AttributeError, TypeError) as error:
        raise AuthUnknownError(
            "Invalid response from authentication service",
            error,
        ) from error
    finally:
        client.auth.close()


def resend_signup_code(email: str):
    client = get_supabase_client()

    try:
        client.auth.resend({
            "type": "signup",
            "email": email,
        })
    finally:
        client.auth.close()


def delete_account(user_id: str):
    client = get_supabase_client()

    try:
        try:
            response = client.table("contracts").select("storage_path").eq("user_id", user_id).execute()
            paths = [row["storage_path"] for row in response.data or []]

            # Storage files are not removed with the user, so they go first. If a
            # later step fails, the user can retry and nothing is left behind.
            if paths:
                client.storage.from_(CONTRACTS_BUCKET).remove(paths)
        except (RequestError, AuthRetryableError):
            raise
        except Exception as error:
            raise AccountDeletionFailed(user_id) from error

        # The contracts rows, their analysis, chunks and chat history go with the
        # user (ON DELETE CASCADE on contracts.user_id and chat_history.user_id).
        try:
            client.auth.admin.delete_user(user_id)
        except AuthApiError as error:
            # 404 means the user is already gone, which is the result asked for.
            if error.status != 404:
                raise AccountDeletionFailed(user_id) from error
    finally:
        client.auth.close()


def get_user_from_token(token: str):
    client = get_supabase_client()

    try:
        response = client.auth.get_user(token)

        if response is None:
            return None

        return response.user
    finally:
        client.auth.close()
