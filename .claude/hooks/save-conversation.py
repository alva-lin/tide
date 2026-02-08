#!/usr/bin/env python3
"""
Claude Code Hook: Save conversation to markdown file.
Triggered on Stop event.
"""

import json
import sys
import os
from datetime import datetime
from pathlib import Path


def find_session_info(session_id: str, cwd: str) -> dict:
    """Find session info from sessions-index.json"""
    # Convert cwd to project directory format (replace / and _ with -)
    project_dir_name = cwd.replace("/", "-").replace("_", "-")
    if project_dir_name.startswith("-"):
        project_dir_name = project_dir_name[1:]
    project_dir_name = "-" + project_dir_name

    index_path = Path.home() / ".claude" / "projects" / project_dir_name / "sessions-index.json"

    if index_path.exists():
        try:
            with open(index_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                for entry in data.get("entries", []):
                    if entry.get("sessionId") == session_id:
                        return entry
        except:
            pass

    return {}


def main():
    # Read hook input from stdin
    try:
        hook_input = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0

    session_id = hook_input.get("session_id", "unknown")
    transcript_path = hook_input.get("transcript_path", "")
    cwd = hook_input.get("cwd", "")

    if not transcript_path or not os.path.exists(transcript_path):
        return 0

    # Get session info for name
    session_info = find_session_info(session_id, cwd)
    session_name = session_info.get("summary", "")

    # Read transcript (JSONL format)
    messages = []
    with open(transcript_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
                messages.append(msg)
            except json.JSONDecodeError:
                continue

    if not messages:
        return 0

    # Output file - use session_id as filename to avoid duplicates
    output_dir = Path(cwd) / "ai-sessions"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / f"{session_id}.md"


    # Build markdown content
    user_message_count = 0
    assistant_messages_count = 0
    md_lines = []
    for msg in messages:
        msg_type = msg.get("type", "")

        if msg_type not in ("user", "assistant"):
            continue

        # Skip meta/system messages (e.g. local-command-caveat, /clear, stdout)
        if msg.get("isMeta"):
            continue

        message = msg.get("message", {})
        content = message.get("content", "")
        timestamp = msg.get("timestamp", "")

        # Skip system-generated user messages (commands, local-command outputs)
        if msg_type == "user" and isinstance(content, str):
            if content.startswith(("<command-name>", "<local-command-")):
                continue

        # Handle content that can be string or list
        text_content = ""
        if isinstance(content, str):
            text_content = content
        elif isinstance(content, list):
            text_parts = []
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    text_parts.append(item.get("text", ""))
                elif isinstance(item, str):
                    text_parts.append(item)
            text_content = "\n".join(text_parts)

        # Skip empty content
        if not text_content.strip():
            continue

        if msg_type == "user":
            md_lines.append("## 👤 User")
            user_message_count += 1
        else:
            model = message.get("model", "unknown")
            md_lines.append(f"## 🤖 Assistant ({model})")
            assistant_messages_count += 1

        if timestamp:
            md_lines.append(f"*{timestamp}*")
        md_lines.append("")
        md_lines.append(text_content)
        md_lines.append("")

    header_lines = [
        "---",
        f"session_id: {session_id}",
        f"session_name: \"{session_name}\"",
        f"cwd: {cwd}",
        f"user_messages_count: {user_message_count}",
        f"assistant_messages_count: {assistant_messages_count}",
        "---",
        "",
    ]
    md_lines = header_lines + md_lines

    # Write to file
    with open(output_file, "w", encoding="utf-8") as f:
        f.write("\n".join(md_lines))

    return 0


if __name__ == "__main__":
    sys.exit(main())
