import json
import os

session_path = r'C:\Users\mw\.bloom\sessions\8195a746-a4e\session.json'
with open(session_path, 'r', encoding='utf-8') as f:
    session = json.load(f)

for msg in session['messages']:
    if msg['to'] == 'P-Gemini' and msg['from'] == 'C-Codex':
        print(f"--- Message {msg['id']} ({msg['timestamp']}) ---")
        print(msg['text'])
        print("\n")
