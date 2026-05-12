import sys

def main():
    try:
        with open('email_processor.py', 'r', encoding='utf-8') as f:
            content = f.read()
        
        target = 'draft_json.get("alert_tags", []) if isinstance(draft_json, dict) else []'
        replacement = 'data.get("alert_tags", [])'
        
        if target in content:
            content = content.replace(target, replacement)
            with open('email_processor.py', 'w', encoding='utf-8') as f:
                f.write(content)
            print("Successfully replaced.")
        else:
            print("Target not found.")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    main()
