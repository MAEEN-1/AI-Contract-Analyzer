import pymupdf
import pytest

from ai_backend.pdf_processing import extract_pdf_pages


def test_extract_pdf_pages_preserves_original_page_numbers():
    document = pymupdf.open()
    first = document.new_page()
    first.insert_text((72, 72), "Service agreement")
    document.new_page()
    third = document.new_page()
    third.insert_text((72, 72), "Payment due in 15 days")

    pages = extract_pdf_pages(document.tobytes())

    assert [page["page_number"] for page in pages] == [1, 3]
    assert "Service agreement" in pages[0]["text"]
    assert "Payment due" in pages[1]["text"]


def test_corrupted_pdf_raises_clear_error():
    with pytest.raises(ValueError, match="damaged or cannot be read"):
        extract_pdf_pages(b"%PDF-1.7\nnot a real PDF")


def test_password_protected_pdf_is_rejected():
    document = pymupdf.open()
    document.new_page().insert_text((72, 72), "Private agreement")
    encrypted = document.tobytes(
        encryption=pymupdf.PDF_ENCRYPT_AES_256,
        owner_pw="owner-password",
        user_pw="reader-password",
    )

    with pytest.raises(ValueError, match="Password-protected"):
        extract_pdf_pages(encrypted)
