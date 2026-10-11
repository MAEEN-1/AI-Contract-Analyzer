import shutil
from pathlib import Path
from uuid import uuid4

from ai_backend.analysis import safe_filename


def save_named_pdf(original_path: Path, suggested_filename: str, output_dir: Path) -> Path:
    name = safe_filename(suggested_filename)
    if not original_path.is_file() or original_path.suffix.lower() != ".pdf":
        raise ValueError("The source must be an existing PDF")
    output_dir.mkdir(parents=True, exist_ok=True)
    destination = output_dir / f"{Path(name).stem}_{uuid4().hex}.pdf"

    # Preserve the original and never overwrite another contract copy.
    with original_path.open("rb") as source, destination.open("xb") as target:
        shutil.copyfileobj(source, target)
    return destination
