import json

log_path = r"C:\Users\Zombo\.gemini\antigravity-ide\brain\fab60fbf-8e90-411c-8ada-21cc6a00f4e3\.system_generated\logs\transcript.jsonl"

largest_len = 0
largest_code = ""
largest_step = -1

with open(log_path, "r", encoding="utf-8") as f:
    for i, line in enumerate(f):
        try:
            data = json.loads(line)
            tool_calls = data.get("tool_calls", [])
            for tc in tool_calls:
                args = tc.get("args", {})
                # Search all string values in args for zombo-results-container
                for k, v in args.items():
                    if isinstance(v, str) and "zombo-results-container" in v:
                        if len(v) > largest_len:
                            largest_len = len(v)
                            largest_code = v
                            largest_step = data.get("step_index")
        except Exception as e:
            pass

print(f"Largest block found at Step {largest_step} with length {largest_len}")
if largest_code:
    with open("extracted_zombo_full.html", "w", encoding="utf-8") as out:
        out.write(largest_code)
    print("Saved to extracted_zombo_full.html")
else:
    print("No code block containing zombo-results-container was found!")
