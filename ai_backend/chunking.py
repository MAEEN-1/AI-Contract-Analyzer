from langchain_text_splitters import RecursiveCharacterTextSplitter


def chunk_pages(pages: list[dict]) -> list[dict]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        length_function=len,
        separators=["\n\n", "\n", " ", ""],
    )
    chunks = []
    for page in pages:
        # Split each page separately so every chunk keeps its original page number.
        for text in splitter.split_text(page["text"]):
            text = text.strip()
            if text:
                chunks.append({"page_number": page["page_number"], "chunk_text": text})
    return chunks
