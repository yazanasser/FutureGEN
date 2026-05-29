import json
import os

log_path = r'C:\Users\LENOVO\.gemini\antigravity\brain\0dc1c3aa-8663-405a-a2f2-d645b079b141\.system_generated\logs\overview.txt'
output_path = r'd:\Yazan Nasser\FutureGEN PRO\user_style_request.txt'

with open(log_path, 'r', encoding='utf-8') as f:
    line = f.readline()
    if line:
        try:
            data = json.loads(line)
            content = data.get('content', '')
            with open(output_path, 'w', encoding='utf-8') as out:
                out.write(content)
            print(f"Extracted user request to {output_path}")
        except Exception as e:
            print(f"Error parsing JSON: {e}")
