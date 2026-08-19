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

    title = tg.TextView(a, "Assembly Pi", root)
    title.settextsize(26)
    title.settextcolor(0xff7dd3fc)
    title.setmargin(12)
    title.setgravity(1, 0)

    status = tg.TextView(a, "Backend: tmux attach -t assembly-pi-stack", root)
    status.settextsize(14)
    status.settextcolor(0xffffffff)
    status.setmargin(6)
    status.setgravity(1, 0)

    prompt = tg.EditText(a, "", root, singleline=False)
    prompt.settextsize(18)
    prompt.settextcolor(0xffffffff)
    prompt.setmargin(8)

    btn_send_prompt = tg.Button(a, "SEND TYPED PROMPT TO PI", root)
    btn_send_prompt.settextsize(18)
    btn_send_prompt.setmargin(8)

    btn_voice_ask = tg.Button(a, "🎙 VOICE ASK PI  start / stop+send", root)
    btn_voice_ask.settextsize(18)
    btn_voice_ask.setmargin(8)

    row_answer = tg.LinearLayout(a, root, False)

    btn_speak = tg.Button(a, "🔊 READ ANSWER", row_answer)
    btn_speak.settextsize(14)
    btn_speak.setmargin(6)
    btn_speak.setlinearlayoutparams(1)

    btn_summary = tg.Button(a, "SUMMARY", row_answer)
    btn_summary.settextsize(14)
    btn_summary.setmargin(6)
    btn_summary.setlinearlayoutparams(1)

    btn_speak_summary = tg.Button(a, "SPEAK SUMMARY", row_answer)
    btn_speak_summary.settextsize(14)
    btn_speak_summary.setmargin(6)
    btn_speak_summary.setlinearlayoutparams(1)

    row_commands = tg.LinearLayout(a, root, False)

    btn_commands = tg.Button(a, "SLASH CMDS", row_commands)
    btn_commands.settextsize(14)
    btn_commands.setmargin(6)
    btn_commands.setlinearlayoutparams(1)

    btn_new = tg.Button(a, "NEW SESSION", row_commands)
    btn_new.settextsize(14)
    btn_new.setmargin(6)
    btn_new.setlinearlayoutparams(1)

    btn_continue = tg.Button(a, "CONTINUE", row_commands)
    btn_continue.settextsize(14)
    btn_continue.setmargin(6)
    btn_continue.setlinearlayoutparams(1)

    row_tools = tg.LinearLayout(a, root, False)

    btn_clear = tg.Button(a, "CLEAR", row_tools)
    btn_clear.settextsize(14)
    btn_clear.setmargin(6)
    btn_clear.setlinearlayoutparams(1)

    btn_quit = tg.Button(a, "QUIT BACKEND", row_tools)
    btn_quit.settextsize(14)
    btn_quit.setmargin(6)
    btn_quit.setlinearlayoutparams(1)

    help_text = tg.TextView(
        a,
        "Type slash commands in the prompt box, or tap SLASH CMDS to list local skills/templates. New/Continue switch Pi SDK sessions.",
        root,
    )
    help_text.settextsize(12)
    help_text.settextcolor(0xffcbd5e1)
    help_text.setmargin(8)
    help_text.setgravity(1, 0)

    def set_status(message: str, ok: bool = True) -> None:
        status.settext(message)
        status.settextcolor(0xff86efac if ok else 0xfffca5a5)
        toast(message)

    def click(command: str, ok_text: str) -> None:
        ok, msg = send_command(command)
        set_status(ok_text if ok else msg, ok)

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
                click("VOICE_ASK", "voice ask toggle sent")
            elif button_id == btn_speak.id:
                click("SPEAK", "read answer command sent")
            elif button_id == btn_summary.id:
                click("SUMMARIZE", "summary requested")
            elif button_id == btn_speak_summary.id:
                click("SPEAK_SUMMARY", "speak summary requested")
            elif button_id == btn_commands.id:
                click("LIST_COMMANDS", "slash command list requested")
            elif button_id == btn_new.id:
                click("NEW_SESSION", "new Pi session requested")
            elif button_id == btn_continue.id:
                click("CONTINUE_SESSION", "continue session requested")
            elif button_id == btn_clear.id:
                click("CLEAR", "clear sent")
            elif button_id == btn_quit.id:
                click("QUIT", "quit sent")
