#!/data/data/com.termux/files/usr/bin/python3
"""Clickable Termux:GUI controller for a running assembly-pi terminal session."""

import base64
import os
import stat
import subprocess
import threading
import time
import termuxgui as tg

FIFO = os.path.expanduser("~/.local/state/assembly-pi/control.fifo")
PUBLIC_DOWNLOADS = "/storage/emulated/0/Download"
TERMUX_DOWNLOADS = os.path.expanduser("~/storage/downloads")
DOWNLOADS = PUBLIC_DOWNLOADS if os.path.isdir(PUBLIC_DOWNLOADS) else TERMUX_DOWNLOADS
VIZ_DIR = os.path.abspath(DOWNLOADS if os.path.isdir(DOWNLOADS) else os.path.expanduser("~"))
VIZ = os.path.join(VIZ_DIR, "assembly-pi-session-visualization.html")
VIZ_URL = "http://127.0.0.1:8765/assembly-pi-session-visualization.html"
VIZ_SERVER = None
LAST_VIZ_PATH = os.path.expanduser("~/.local/state/assembly-pi/last-visualization-path.txt")


def write_last_visualization_path(path: str) -> None:
    try:
        os.makedirs(os.path.dirname(LAST_VIZ_PATH), exist_ok=True)
        with open(LAST_VIZ_PATH, "w", encoding="utf-8") as f:
            f.write(path + "\n")
    except Exception:
        pass


def read_last_visualization_path() -> str:
    try:
        with open(LAST_VIZ_PATH, "r", encoding="utf-8") as f:
            path = f.read().strip()
            return path or VIZ
    except Exception:
        return VIZ


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


def send_status_feedback(text: str) -> None:
    try:
        status.settext(text)
        status.settextcolor(0xff86efac)
    except Exception:
        pass


def toast(message: str) -> None:
    try:
        subprocess.run(["termux-toast", message], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass


def ensure_visualization_server() -> None:
    global VIZ_SERVER
    if VIZ_SERVER is not None and VIZ_SERVER.poll() is None:
        return
    VIZ_SERVER = subprocess.Popen(
        ["python3", "-m", "http.server", "8765", "--bind", "127.0.0.1", "--directory", os.path.dirname(read_last_visualization_path())],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


with tg.Connection() as c:
    a = tg.Activity(c)

    root = tg.LinearLayout(a)
    root.setbackgroundcolor(0xff0f172a)

    title = tg.TextView(a, "Assembly Pi", root)
    title.settextsize(26)
    title.settextcolor(0xff7dd3fc)
    title.setmargin(12)
    title.setgravity(1, 0)

    status = tg.TextView(a, "Status: booting", root)
    status.settextsize(14)
    status.settextcolor(0xff86efac)
    status.setmargin(6)
    status.setgravity(1, 0)

    agent_status = tg.TextView(a, "Agent: idle", root)
    agent_status.settextsize(13)
    agent_status.settextcolor(0xffcbd5e1)
    agent_status.setmargin(4)
    agent_status.setgravity(1, 0)

    action_status = tg.TextView(a, "Action: waiting for input", root)
    action_status.settextsize(13)
    action_status.settextcolor(0xffcbd5e1)
    action_status.setmargin(4)
    action_status.setgravity(1, 0)

    visualization_status = tg.TextView(a, "Visualization: idle", root)
    visualization_status.settextsize(13)
    visualization_status.settextcolor(0xffcbd5e1)
    visualization_status.setmargin(4)
    visualization_status.setgravity(1, 0)

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

    row_visual = tg.LinearLayout(a, root, False)

    btn_visualize = tg.Button(a, "SESSION HTML", row_visual)
    btn_visualize.settextsize(14)
    btn_visualize.setmargin(6)
    btn_visualize.setlinearlayoutparams(1)

    btn_open_visual = tg.Button(a, "OPEN VISUALIZATION", row_visual)
    btn_open_visual.settextsize(14)
    btn_open_visual.setmargin(6)
    btn_open_visual.setlinearlayoutparams(1)

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
        "SESSION HTML prepares a visual readback of the current Pi session. OPEN VISUALIZATION opens it after it is ready.",
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

    def set_agent(agent: str, action: str, ok: bool = True) -> None:
        agent_status.settext(f"Agent: {agent}")
        action_status.settext(f"Action: {action}")
        color = 0xff86efac if ok else 0xfffca5a5
        agent_status.settextcolor(color)
        action_status.settextcolor(color)
        set_status(f"{agent} · {action}", ok)

    visualization_watch_token = {"value": 0}

    def set_visualization_status(message: str, ok: bool = True) -> None:
        visualization_status.settext("Visualization: " + message)
        visualization_status.settextcolor(0xff86efac if ok else 0xfffca5a5)

    def watch_visualization_finished(started_at: float, token: int) -> None:
        deadline = time.time() + 90
        while time.time() < deadline and visualization_watch_token["value"] == token:
            for candidate in (read_last_visualization_path(), VIZ):
                try:
                    if os.path.exists(candidate) and os.path.getmtime(candidate) >= started_at:
                        set_visualization_status("finished — ready to open")
                        set_agent("Nyro", "session HTML finished; OPEN VISUALIZATION is ready")
                        return
                except Exception:
                    pass
            time.sleep(0.75)
        if visualization_watch_token["value"] == token:
            set_visualization_status("still waiting; check backend if this stays here", False)

    def start_visualization_watch(started_at: float) -> None:
        visualization_watch_token["value"] += 1
        token = visualization_watch_token["value"]
        set_visualization_status("generating…")
        thread = threading.Thread(target=watch_visualization_finished, args=(started_at, token), daemon=True)
        thread.start()

    def click(command: str, ok_text: str, agent: str = "Synth", action: str | None = None) -> None:
        ok, msg = send_command(command)
        display = (action or ok_text) if ok else msg
        set_agent(agent, display, ok)
        if ok and ok_text.startswith("session HTML"):
            set_status("Visualization generation requested…")

    for ev in c.events():
        if ev.type == tg.Event.destroy:
            break

        if ev.type == tg.Event.click:
            button_id = ev.value["id"]

            if button_id == btn_send_prompt.id:
                ok, msg = send_prompt(prompt.gettext())
                if ok:
                    prompt.settext("")
                set_agent("Synth", "sending typed prompt" if ok else msg, ok)
            elif button_id == btn_voice_ask.id:
                click("VOICE_ASK", "voice ask toggle sent", "Synth", "toggling voice capture")
            elif button_id == btn_speak.id:
                click("SPEAK", "read answer command sent", "Synth", "reading last answer")
            elif button_id == btn_summary.id:
                click("SUMMARIZE", "summary requested", "Nyro", "summarizing the current session")
            elif button_id == btn_speak_summary.id:
                click("SPEAK_SUMMARY", "speak summary requested", "JamAI", "speaking the summary")
            elif button_id == btn_visualize.id:
                started_at = time.time()
                ok, msg = send_command("VISUALIZE_SESSION")
                if ok:
                    write_last_visualization_path(VIZ)
                    set_agent("Nyro", "building session HTML")
                    set_status("Visualization generation requested…")
                    start_visualization_watch(started_at)
                else:
                    set_agent("Nyro", msg, False)
                    set_visualization_status("request failed", False)
            elif button_id == btn_open_visual.id:
                if os.path.exists(VIZ):
                    try:
                        write_last_visualization_path(VIZ)
                        ensure_visualization_server()
                        subprocess.Popen(["termux-open-url", VIZ_URL])
                        set_agent("Synth", "opening current visualization at " + VIZ_URL)
                    except Exception:
                        try:
                            subprocess.Popen(["termux-open", read_last_visualization_path()])
                            set_agent("Synth", "opening current visualization file")
                        except Exception as e:
                            set_agent("Synth", str(e), False)
                else:
                    set_agent("Synth", "prepare SESSION HTML first", False)
            elif button_id == btn_commands.id:
                click("LIST_COMMANDS", "slash command list requested", "Nyro", "listing slash commands")
            elif button_id == btn_new.id:
                click("NEW_SESSION", "new Pi session requested", "Synth", "starting a new session")
            elif button_id == btn_continue.id:
                click("CONTINUE_SESSION", "continue session requested", "Synth", "continuing the current session")
            elif button_id == btn_clear.id:
                click("CLEAR", "clear sent", "Synth", "clearing the UI")
            elif button_id == btn_quit.id:
                click("QUIT", "quit sent", "Synth", "quitting the backend")
