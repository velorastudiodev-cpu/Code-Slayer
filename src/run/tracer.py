# Tracer Python bersama: dipakai build (kunci Trace Table, CPython) dan Step Debugger (Pyodide di browser).
import io, json, sys

FILE = "<kode>"
MAX_STEPS = 2000


class _Stop(Exception):
    pass


def _show(v):
    if callable(v) and hasattr(v, "__name__"):
        return f"<fungsi {v.__name__}>" if not isinstance(v, type) else f"<class {v.__name__}>"
    r = repr(v)
    return r if len(r) <= 80 else r[:77] + "..."


def _vars(frame):
    return {k: _show(v) for k, v in frame.f_locals.items()
            if not k.startswith("__") and type(v).__name__ != "module"}


def _run(code, stdin, tracer):
    out = io.StringIO()
    old = sys.stdout, sys.stdin
    sys.stdout, sys.stdin = out, io.StringIO(stdin)
    err = None
    sys.settrace(tracer)
    try:
        exec(compile(code, FILE, "exec"), {"__name__": "__main__"})
    except _Stop:
        err = f"Berhenti setelah {MAX_STEPS} langkah (infinite loop?)"
    except Exception as e:  # error kode user ditampilkan, bukan dilempar
        err = f"{type(e).__name__}: {e}"
    finally:
        sys.settrace(None)
        sys.stdout, sys.stdin = old
    return out.getvalue(), err


def trace_table(code, line, names, stdin=""):
    """Nilai variabel `names` setiap kali baris `line` SELESAI dijalankan."""
    rows, prev = [], {}

    def local(frame, event, arg):
        if prev.get(id(frame)) == line and event in ("line", "return"):
            loc = frame.f_locals
            rows.append([_show(loc[n]) if n in loc else "-" for n in names])
        if event == "line":
            prev[id(frame)] = frame.f_lineno
        return local

    _, err = _run(code, stdin, lambda f, e, a: local if f.f_code.co_filename == FILE else None)
    if err:
        raise RuntimeError(err)
    return rows


def debug_steps(code, stdin=""):
    """Langkah demi langkah: baris yang AKAN dijalankan, stack frame + variabel, dan panjang output saat itu."""
    steps, holder = [], {}

    def snapshot(frame, line):
        stack, f = [], frame
        while f is not None and f.f_code.co_filename == FILE:
            name = "<modul>" if f.f_code.co_name == "<module>" else f.f_code.co_name
            stack.append({"name": name, "vars": _vars(f)})
            f = f.f_back
        steps.append({"line": line, "stack": stack[::-1], "out": len(sys.stdout.getvalue())})
        if len(steps) >= MAX_STEPS:
            raise _Stop()

    def local(frame, event, arg):
        if event == "line":
            snapshot(frame, frame.f_lineno)
        return local

    out, err = _run(code, stdin, lambda f, e, a: local if f.f_code.co_filename == FILE else None)
    return json.dumps({"steps": steps, "out": out, "error": err})


if __name__ == "__main__":
    # Dipanggil build-content: stdin = JSON {code, line, names, stdin}.
    req = json.load(sys.stdin)
    print(json.dumps(trace_table(req["code"], req["line"], req["names"], req.get("stdin", ""))))
