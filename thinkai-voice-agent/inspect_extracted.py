with open("extracted_code_73_replace_file_content.txt", "r", encoding="utf-8") as f:
    content = f.read()

print("File size:", len(content))
# Let's find some keywords
keywords = ["zombo-results-container", "submitZomboUrl", "zombo-val-score", "zombo-math-container"]
for kw in keywords:
    idx = content.find(kw)
    print(f"Keyword '{kw}' found at index: {idx}")

# If zombo-results-container is found, let's print around it
idx = content.find("zombo-results-container")
if idx != -1:
    print("\n--- Snippet around zombo-results-container ---")
    print(content[idx-100:idx+400])
