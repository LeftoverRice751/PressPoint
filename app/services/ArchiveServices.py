import fitz
import re

class ArchiveServices:
    def extract_data(self, file_path):
        extracted_text = ""

        with fitz.open(file_path) as doc:
            for page in doc:
                extracted_text += page.get_text()

        lines = extracted_text.splitlines()

        title = next((line.strip() for line in lines if line.strip()), "Untitled Document")

        date_match = re.search(r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)[a-z]* \d{1,2}, \d{4}\b', extracted_text)
        event_date = date_match.group(0) if date_match else None
        
        location_match = re.search(r'Location:\s*(.*)', extracted_text)
        location = location_match.group(1).strip() if location_match else None
        
        description_source = extracted_text[:200].replace('\n', ' ').strip()
        description = f"{description_source}..." if description_source and len(extracted_text) > 200 else description_source or "No description available."
        
        return {
            "title": title,
            "description": description,
            "event_date": event_date,
            "location": location,
            "is_archive": True,
        }