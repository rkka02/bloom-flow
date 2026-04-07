import json
import os

session_path = r'C:\Users\mw\.bloom\sessions\8195a746-a4e\session.json'
with open(session_path, 'r', encoding='utf-8') as f:
    session = json.load(f)

msg = next(m for m in session['messages'] if m['id'].startswith('4f0769b5'))
text = msg['text']

with open('msg_text_final.txt', 'w', encoding='utf-8') as f:
    f.write(text)
