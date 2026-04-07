import json
import os

session_path = r'C:\Users\mw\.bloom\sessions\8195a746-a4e\session.json'
with open(session_path, 'r', encoding='utf-8') as f:
    session = json.load(f)

for msg in session['messages']:
    if msg['timestamp'] > '2026-04-01T11:24:00Z':
        print(f"--- Message {msg['id']} ({msg['timestamp']}) ---")
        print(f"From: {msg['from']}, To: {msg['to']}")
        print(msg['text'][:200])
        print("\n")
