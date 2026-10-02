# Run with `python3 nautilus/test_darkdrive.py` (needs python3-nautilus). The
# extension against a made-up DarkDrive home and stand-ins for Files' objects.
import importlib.util
import json
import os
import shutil
import sys
import tempfile

import gi

gi.require_version("Nautilus", "4.0")
S = tempfile.mkdtemp(prefix="dd-nautilus-")
os.environ["DD_HOME"] = S + "/home"
synced = S + "/synced"
os.makedirs(S + "/home/folders/F1")
os.makedirs(synced + "/sub")
os.makedirs(S + "/other")
for name, text in (("a.txt", "hello"), ("new.txt", "pending"), ("sub/b.txt", "x")):
    with open(synced + "/" + name, "w") as f:
        f.write(text)

def entry(p, id):
    st = os.stat(p); return {"id": id, "sha": "x", "size": st.st_size, "mtimeMs": st.st_mtime_ns / 1e6}
json.dump({"files": {"a.txt": entry(synced + "/a.txt", "fa"), "sub/b.txt": entry(synced + "/sub/b.txt", "fb")},
           "folders": {"D1": "sub"}}, open(S + "/home/folders/F1/state.json", "w"))
def publish(status, paused=False, exe=sys.executable):
    json.dump({"exec": exe, "paused": paused, "folders": [{"id": "F1", "dir": synced, "status": status}]}, open(S + "/home/filemanager.json", "w"))
    os.utime(S + "/home/filemanager.json", ns=(publish.t, publish.t)); publish.t += 10**9
publish.t = 10**18
publish("synced")

spec = importlib.util.spec_from_file_location("dd", os.path.join(os.path.dirname(os.path.abspath(__file__)), "darkdrive.py"))
dd = importlib.util.module_from_spec(spec); spec.loader.exec_module(dd)

def eq(a, b):
    assert a == b, f"{a!r} != {b!r}"


eq(dd.status_of(synced), "synced")
eq(dd.status_of(synced + "/a.txt"), "synced")
eq(dd.status_of(synced + "/new.txt"), "syncing")       # not in state yet
eq(dd.status_of(synced + "/sub"), "synced")
eq(dd.status_of(synced + "/sub/b.txt"), "synced")
eq(dd.status_of(S + "/other"), None)                    # outside any synced folder
eq(dd.status_of(synced + "x"), None)                    # a sibling whose name starts the same
open(synced + "/a.txt", "a").write("edit")              # edited since synced
eq(dd.status_of(synced + "/a.txt"), "syncing")
publish("paused", paused=True)
eq(dd.status_of(synced), "paused")
eq(dd.status_of(synced + "/a.txt"), "paused")           # waiting, and nothing's coming
eq(dd.status_of(synced + "/sub/b.txt"), "synced")       # still is what it was
publish("error")
eq(dd.status_of(synced + "/new.txt"), "error")
eq(dd.overlaps(S), True); eq(dd.overlaps(synced + "/sub"), True); eq(dd.overlaps(S + "/other"), False)

# The provider, against stand-ins for Nautilus' file objects.
class Loc:
    def __init__(s, p): s.p = p
    def get_path(s): return s.p
class Info:
    def __init__(s, p): s.p, s.emblems, s.invalidated = p, [], 0
    def get_uri_scheme(s): return "file"
    def get_location(s): return Loc(s.p)
    def add_emblem(s, e): s.emblems.append(e)
    def invalidate_extension_info(s): s.invalidated += 1
ext = dd.DarkDrive()
labels = lambda items: [i.props.label for i in items]
publish("synced")
eq(labels(ext.get_file_items([Info(S + "/other")])), ["Sync with DarkDrive"])
eq(labels(ext.get_file_items([Info(S)])), [])                                # would swallow a synced folder
eq(labels(ext.get_file_items([Info(synced + "/sub/b.txt")])), ["Open in DarkDrive", "Pause DarkDrive sync"])
eq(labels(ext.get_file_items([Info(synced + "/a.txt"), Info(synced + "/new.txt")])), ["Pause DarkDrive sync"])
eq(labels(ext.get_file_items([Info(synced + "/a.txt"), Info(S + "/other")])), [])
eq(labels(ext.get_background_items(Info(synced + "/sub"))), ["Open in DarkDrive", "Pause DarkDrive sync"])
eq(labels(ext.get_background_items(Info(S + "/other"))), [])
publish("paused", paused=True)
eq(labels(ext.get_file_items([Info(synced)])), ["Open in DarkDrive", "Resume DarkDrive sync"])

info, out = Info(synced + "/sub/b.txt"), Info(S + "/other")
ext.update_file_info(info); ext.update_file_info(out)
eq(info.emblems, ["emblem-default"]); eq(out.emblems, [])
eq(ext.poll(), True); eq(info.invalidated, 0)           # nothing changed: nothing re-asked
publish("synced"); ext.poll()
eq(info.invalidated, 1); eq(ext.shown, [])              # status moved: Files is told to ask again

publish("synced", exe="/nonexistent/darkdrive")          # app uninstalled: no menu at all
eq(labels(ext.get_file_items([Info(S + "/other")])), [])
shutil.rmtree(S)
print("nautilus extension ok")
