#!/data/data/com.termux/files/usr/bin/python3
"""Clickable Termux:GUI controller for a running assembly-pi terminal session."""

import base64
import os
import stat
import subprocess
import termuxgui as tg

FIFO = os.path.expanduser("~/.local/state/assembly-pi/control.fifo")


def stat_is_fifo(path: str) -> bool:
    try:
        return stat.S_ISFIFO(os.stat(path).st_mode)
    except Exception:
        return False


def send_command(command: str) -> tuple[bool, str]:
    if not os.path.exists(FIFO) or not stat_is_fifo(FIFO):
        return False, "backend not running: start tmux/backend first"
    try:
        with open(FIFO, "w", encoding="utf-8") as f:
            f.write(command + "\n")
        return True, "sent"
    except Exception as e:
        return False, str(e)


def send_prompt(text: str) -> tuple[bool, str]:
    prompt = text.strip()
    if not prompt:
        return False, "type a prompt first"
    encoded = base64.urlsafe_b64encode(prompt.encode("utf-8")).decode("ascii").rstrip("=")
    return send_command("PROMPT\t" + encoded)


def toast(message: str) -> None:
    try:
        subprocess.run(["termux-toast", message], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass


with tg.Connection() as c:
    a = tg.Activity(c)

    root = tg.LinearLayout(a)
    root.setbackgroundcolor(0xff0f172a)

    title = tg.TextView(a, "Assembly Pi Control", root)
    title.settextsize(24)
    title.settextcolor(0xff7dd3fc)
    title.setmargin(14)
    title.setgravity(1, 0)

    status = tg.TextView(a, "Backend: cd ~/assembly-pi && npm run dev", root)
    status.settextsize(14)
    status.settextcolor(0xffffffff)
    status.setmargin(8)
    status.setgravity(1, 0)

    section_typed = tg.TextView(a, "TYPE → PI", root)
    section_typed.settextsize(16)
    section_typed.settextcolor(0xfffacc15)
    section_typed.setmargin(8)
    section_typed.setgravity(1, 0)

    prompt = tg.EditText(a, "", root, singleline=False)
    prompt.settextsize(18)
    prompt.settextcolor(0xffffffff)
    prompt.setmargin(10)

    btn_send_prompt = tg.Button(a, "SEND TYPED PROMPT TO PI", root)
    btn_send_prompt.settextsize(18)
    btn_send_prompt.setmargin(10)

    section_voice = tg.TextView(a, "VOICE → PI", root)
    section_voice.settextsize(16)
    section_voice.settextcolor(0xfffacc15)
    section_voice.setmargin(8)
    section_voice.setgravity(1, 0)

    btn_voice_ask = tg.Button(a, "🎙 VOICE ASK PI  start / stop+send", root)
    btn_voice_ask.settextsize(18)
    btn_voice_ask.setmargin(10)

    row_review = tg.LinearLayout(a, root, False)

    btn_record_review = tg.Button(a, "REC REVIEW", row_review)
    btn_record_review.settextsize(15)
    btn_record_review.setmargin(8)
    btn_record_review.setlinearlayoutparams(1)

    btn_send_transcript = tg.Button(a, "SEND REVIEWED", row_review)
    btn_send_transcript.settextsize(15)
    btn_send_transcript.setmargin(8)
    btn_send_transcript.setlinearlayoutparams(1)

    row_tools = tg.LinearLayout(a, root, False)

    btn_speak = tg.Button(a, "🔊 SPEAK", row_tools)
    btn_speak.settextsize(15)
    btn_speak.setmargin(8)
    btn_speak.setlinearlayoutparams(1)

    btn_clear = tg.Button(a, "CLEAR", row_tools)
    btn_clear.settextsize(15)
    btn_clear.setmargin(8)
    btn_clear.setlinearlayoutparams(1)

    btn_quit = tg.Button(a, "QUIT", root)
    btn_quit.settextsize(15)
    btn_quit.setmargin(8)

    help_text = tg.TextView(
        a,
        "Typed prompt sends immediately. VOICE ASK PI: tap once, speak, tap again; transcript sends automatically. Answers appear/listen from the terminal backend.",
        root,
    )
    help_text.settextsize(13)
    help_text.settextcolor(0xffcbd5e1)
    help_text.setmargin(10)
    help_text.setgravity(1, 0)

    def set_status(message: str, ok: bool = True) -> None:
        status.settext(message)
        status.settextcolor(0xff86efac if ok else 0xfffca5a5)
        toast(message)

    for ev in c.events():
        if ev.type == tg.Event.destroy:
            break

        if ev.type == tg.Event.click:
            button_id = ev.value["id"]

            if button_id == btn_send_prompt.id:
                ok, msg = send_prompt(prompt.gettext())
                if ok:
                    prompt.settext("")
                set_status("typed prompt sent to Pi" if ok else msg, ok)

            elif button_id == btn_voice_ask.id:
                ok, msg = send_command("VOICE_ASK")
                set_status("voice ask toggle sent" if ok else msg, ok)

            elif button_id == btn_record_review.id:
                ok, msg = send_command("TOGGLE")
                set_status("review recording toggle sent" if ok else msg, ok)

            elif button_id == btn_send_transcript.id:
                ok, msg = send_command("SEND")
                set_status("reviewed transcript sent" if ok else msg, ok)

            elif button_id == btn_speak.id:
                ok, msg = send_command("SPEAK")
                set_status("speak command sent" if ok else msg, ok)

            elif button_id == btn_clear.id:
                ok, msg = send_command("CLEAR")
                set_status("clear sent" if ok else msg, ok)

            elif button_id == btn_quit.id:
                ok, msg = send_command("QUIT")
                set_status("quit sent" if ok else msg, ok)
