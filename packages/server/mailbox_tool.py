import json
import os
import uuid
from datetime import datetime

BLOOM_DIR = os.path.join(os.environ.get('USERPROFILE', os.path.expanduser('~')), '.bloom')
SESSION_ID = '8195a746-a4e'

def send_message(to_agent, text, from_agent='P-Gemini'):
    inbox_dir = os.path.join(BLOOM_DIR, 'sessions', SESSION_ID, 'inboxes', to_agent)
    os.makedirs(inbox_dir, exist_ok=True)
    
    msg_id = str(uuid.uuid4())
    msg = {
        "id": msg_id,
        "from": from_agent,
        "to": to_agent,
        "text": text,
        "summary": text[:100] + "...",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "read": False
    }
    
    filename = f"{int(datetime.now().timestamp() * 1000)}-{msg_id[:8]}.json"
    filepath = os.path.join(inbox_dir, filename)
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(msg, f, ensure_ascii=False, indent=2)
    print(f"Message sent to {to_agent}: {filepath}")

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: python mailbox_tool.py <to> <message>")
    else:
        send_message(sys.argv[1], sys.argv[2])
