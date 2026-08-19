#!/data/data/com.termux/files/usr/bin/python3
"""Clickable Termux:GUI controller for a running assembly-pi terminal session."""

import base64
import os
import subprocess
import termuxgui as tg

FIFO = os.path.expanduser("~/.local/state/assembly-pi/control.fifo")


def send_command(command: str) -> tuple[bool, str]:
    if not os.path.exists(FIFO) or not os.path.exists(os.path.dirname(FIFO)):
        return False, "assembly-pi is not running"
    if not stat_is_fifo(FIFO):
        return False, "control FIFO missing; start npm run dev"
    try:
        with open(FIFO, "w", encoding="utf-8") as f:
            f.write(command + "\n")
        return True, "sent"
    except Exception as e:
        return False, str(e)


def stat_is_fifo(path: str) -> bool:
    try:
        import stat

        return stat.S_ISFIFO(os.stat(path).st_mode)
    except Exception:
        return False


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
    root.setbackgroundcolor(0xff111827)

    title = tg.TextView(a, "Assembly Pi", root)
    title.settextsize(26)
    title.settextcolor(0xff7dd3fc)
    title.setmargin(18)
    title.setgravity(1, 0)

    status = tg.TextView(a, "Start ~/assembly-pi with: npm run dev", root)
    status.settextsize(15)
    status.settextcolor(0xffffffff)
    status.setmargin(10)
    status.setgravity(1, 0)

    prompt = tg.EditText(a, "", root, singleline=False)
    prompt.settextsize(18)
    prompt.settextcolor(0xffffffff)
    prompt.setmargin(12)

    row1 = tg.LinearLayout(a, root, False)

    btn_record = tg.Button(a, "🎙 REC / STOP", row1)
    btn_record.settextsize(18)
    btn_record.setmargin(8)
    btn_record.setlinearlayoutparams(1)

    btn_send_transcript = tg.Button(a, "SEND TRANSCRIPT", row1)
    btn_send_transcript.settextsize(16)
    btn_send_transcript.setmargin(8)
    btn_send_transcript.setlinearlayoutparams(1)

    row2 = tg.LinearLayout(a, root, False)

    btn_send_prompt = tg.Button(a, "SEND TYPED PROMPT", row2)
    btn_send_prompt.settextsize(16)
    btn_send_prompt.setmargin(8)
    btn_send_prompt.setlinearlayoutparams(1)

    btn_speak = tg.Button(a, "SPEAK ANSWER", row2)
    btn_speak.settextsize(16)
    btn_speak.setmargin(8)
    btn_speak.setlinearlayoutparams(1)

    row3 = tg.LinearLayout(a, root, False)

    btn_clear = tg.Button(a, "CLEAR", row3)
    btn_clear.settextsize(16)
    btn_clear.setmargin(8)
    btn_clear.setlinearlayoutparams(1)

    btn_quit = tg.Button(a, "QUIT SESSION", row3)
    btn_quit.settextsize(16)
    btn_quit.setmargin(8)
    btn_quit.setlinearlayoutparams(1)

    help_text = tg.TextView(
        a,
        "Terminal remains the Pi conversation surface. This GUI only sends button commands into it.",
        root,
    )
    help_text.settextsize(13)
    help_text.settextcolor(0xff9ca3af)
    help_text.setmargin(12)
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

            if button_id == btn_record.id:
                ok, msg = send_command("TOGGLE")
                set_status("record toggle sent" if ok else msg, ok)

            elif button_id == btn_send_transcript.id:
                ok, msg = send_command("SEND")
                set_status("send transcript sent" if ok else msg, ok)

            elif button_id == btn_send_prompt.id:
                ok, msg = send_prompt(prompt.gettext())
                if ok:
                    prompt.settext("")
                set_status("typed prompt sent to Pi" if ok else msg, ok)

            elif button_id == btn_speak.id:
                ok, msg = send_command("SPEAK")
                set_status("speak command sent" if ok else msg, ok)

            elif button_id == btn_clear.id:
                ok, msg = send_command("CLEAR")
                set_status("clear sent" if ok else msg, ok)

            elif button_id == btn_quit.id:
                ok, msg = send_command("QUIT")
                set_status("quit sent" if ok else msg, ok)
