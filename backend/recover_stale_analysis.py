"""Reset an interrupted analysis after stopping all backend workers.

Run from the repository root:
    python backend/recover_stale_analysis.py USER_ID CONTRACT_ID --workers-stopped
"""

import argparse
import sys
from uuid import UUID

from services.F_ai_service import ContractNotFound, mark_interrupted_analysis_failed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("user_id", type=UUID, help="Owner's Supabase user UUID")
    parser.add_argument("contract_id", type=UUID, help="Contract UUID")
    parser.add_argument(
        "--workers-stopped", action="store_true",
        help="Confirm every backend worker was stopped before recovery",
    )
    args = parser.parse_args()
    if not args.workers_stopped:
        parser.error("Stop all backend workers, then pass --workers-stopped")

    try:
        changed = mark_interrupted_analysis_failed(str(args.user_id), str(args.contract_id))
    except ContractNotFound:
        print("Contract not found for this user.", file=sys.stderr)
        return 1

    if not changed:
        print("No stale processing row was changed. Check status and updated_at.")
        return 1
    print("Interrupted analysis marked failed. Restart the backend and retry analysis.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
