import pymupdf


def extract_pdf_pages(pdf_source: str | bytes) -> list[dict]:
    # Accept a local path for testing or PDF bytes downloaded from Storage.
    try:
        if isinstance(pdf_source, bytes):
            document = pymupdf.open(stream=pdf_source, filetype="pdf")
        else:
            document = pymupdf.open(pdf_source)

        pages = []
        with document:
            if document.needs_pass:
                raise ValueError("Password-protected PDFs are not supported")
            for page in document:
                text = page.get_text("text", sort=True).strip()
                if text:
                    pages.append({"page_number": page.number + 1, "text": text})
        if not pages:
            raise ValueError("The PDF contains no extractable text; OCR may be required")
        return pages
    except (pymupdf.FileDataError, pymupdf.EmptyFileError) as error:
        raise ValueError("The PDF is damaged or cannot be read") from error
