using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

// InCharacter Windows hotkeys.
// This standalone process hooks keyboard events (WH_KEYBOARD_LL) without injecting
// DLLs into games or other processes. ONLY assigned shortcut primary keys are
// intercepted, and only when their modifier chord matches.
//
// In contrast to the old polling helper, returning 1 from the low-level hook
// stops Caps Lock changing case and prevents browser shortcuts such as
// Ctrl+Shift+O from receiving their primary-key keydown/keyup.
//
// Stdin CAPTURE_ON / CAPTURE_OFF temporarily disables interception while the
// user binds a new key. Stderr is used for diagnostics, stdout only for events.
internal static class Hotkeys
{
    private const int WH_KEYBOARD_LL = 13;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_KEYUP = 0x0101;
    private const int WM_SYSKEYDOWN = 0x0104;
    private const int WM_SYSKEYUP = 0x0105;
    private const int VK_SHIFT = 0x10;
    private const int VK_CTRL = 0x11;
    private const int VK_ALT = 0x12;
    private const int VK_LSHIFT = 0xA0, VK_RSHIFT = 0xA1;
    private const int VK_LCTRL = 0xA2, VK_RCTRL = 0xA3;
    private const int VK_LALT = 0xA4, VK_RALT = 0xA5;
    private const uint LLKHF_INJECTED = 0x10;

    private delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);
    [StructLayout(LayoutKind.Sequential)]
    private struct KbdHook { public uint vkCode, scanCode, flags, time; public UIntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)]
    private struct Point { public int x, y; }
    [StructLayout(LayoutKind.Sequential)]
    private struct Msg {
        public IntPtr hwnd;
        public uint message;
        public UIntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public Point pt;
        public uint lPrivate;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, HookProc callback, IntPtr module, uint threadId);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern int GetMessage(out Msg message, IntPtr window, uint min, uint max);
    [DllImport("user32.dll")]
    private static extern bool TranslateMessage(ref Msg message);
    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessage(ref Msg message);
    [DllImport("kernel32.dll", CharSet = CharSet.Auto)]
    private static extern IntPtr GetModuleHandle(string moduleName);

    private sealed class Binding {
        public readonly string Action;
        public readonly int Key;
        public readonly bool Ctrl, Shift, Alt;
        public bool Active;

        public Binding(string action, string encoded) {
            Action = action;
            int code = 0;
            foreach (string part in encoded.Split('+')) {
                string token = part.Trim().ToUpperInvariant();
                if (token == "CTRL") Ctrl = true;
                else if (token == "SHIFT") Shift = true;
                else if (token == "ALT") Alt = true;
                else code = VirtualKey(token);
            }
            if (code == 0) throw new ArgumentException("Invalid shortcut for " + action);
            Key = code;
        }
    }

    private sealed class Router {
        private readonly Binding[] bindings;
        private readonly HashSet<int> pressed = new HashSet<int>();
        private readonly HashSet<int> swallowed = new HashSet<int>();
        private readonly Action<string> emit;
        private volatile bool capture;
        public Router(Binding[] bindings, Action<string> emit, bool capture) {
            this.bindings = bindings;
            this.emit = emit;
            this.capture = capture;
        }

        public void SetCapture(bool enabled) {
            if (enabled == capture) return;
            capture = enabled;
            // Clearing active hold is required when re-binding while recording.
            foreach (Binding binding in bindings) {
                if (binding.Active && binding.Action == "RECORD") emit("RECORD_UP");
                binding.Active = false;
            }
            // Preserve swallowed keys until key-up, avoiding orphaned keyup
            // events in the application that received no corresponding keydown.
        }

        private bool IsPressed(int main, int left, int right) {
            return pressed.Contains(main) || pressed.Contains(left) || pressed.Contains(right);
        }

        private bool ModifiersHeld(Binding binding) {
            return (!binding.Ctrl || IsPressed(VK_CTRL, VK_LCTRL, VK_RCTRL)) &&
                   (!binding.Shift || IsPressed(VK_SHIFT, VK_LSHIFT, VK_RSHIFT)) &&
                   (!binding.Alt || IsPressed(VK_ALT, VK_LALT, VK_RALT));
        }

        // Called only on the hook thread. true means suppress this one key event.
        public bool Handle(int vk, bool down) {
            if (down) pressed.Add(vk);
            else pressed.Remove(vk);

            if (!down) {
                foreach (Binding binding in bindings) {
                    if (binding.Action == "RECORD" && binding.Active &&
                        (binding.Key == vk || !ModifiersHeld(binding))) {
                        binding.Active = false;
                        emit("RECORD_UP");
                    }
                }
                if (swallowed.Remove(vk)) return true;
                return false;
            }

            if (swallowed.Contains(vk)) return true; // auto-repeat
            if (capture) return false;

            foreach (Binding binding in bindings) {
                if (binding.Key != vk || !ModifiersHeld(binding)) continue;
                if (!binding.Active) {
                    binding.Active = true;
                    emit(binding.Action + "_DOWN");
                }
                swallowed.Add(vk);
                return true;
            }
            return false;
        }

        public void ReleaseAll() {
            foreach (Binding binding in bindings) {
                if (binding.Active && binding.Action == "RECORD") emit("RECORD_UP");
                binding.Active = false;
            }
            swallowed.Clear();
            pressed.Clear();
        }
    }

    private static int VirtualKey(string name) {
        if (name.Length == 1) {
            char k = name[0];
            if ((k >= 'A' && k <= 'Z') || (k >= '0' && k <= '9')) return k;
        }
        if (name.StartsWith("F")) {
            int number;
            if (int.TryParse(name.Substring(1), out number) && number >= 1 && number <= 12)
                return 0x70 + number - 1;
        }
        switch (name) {
            case "SPACE": return 0x20; case "CAPSLOCK": return 0x14;
            case "TAB": return 0x09; case "ENTER": return 0x0D;
            case "BACKSPACE": return 0x08; case "ESCAPE": return 0x1B;
            case "DELETE": return 0x2E; case "INSERT": return 0x2D;
            case "HOME": return 0x24; case "END": return 0x23;
            case "PAGEUP": return 0x21; case "PAGEDOWN": return 0x22;
            case "ARROWUP": return 0x26; case "ARROWDOWN": return 0x28;
            case "ARROWLEFT": return 0x25; case "ARROWRIGHT": return 0x27;
            default: throw new ArgumentException("Unsupported shortcut: " + name);
        }
    }

    private static readonly BlockingCollection<string> events =
        new BlockingCollection<string>(new ConcurrentQueue<string>());
    private static Router router;
    private static HookProc callback; // rooted so the GC cannot collect the hook delegate
    private static IntPtr hookHandle;

    private static IntPtr KeyboardCallback(int code, IntPtr wParam, IntPtr lParam) {
        if (code < 0) return CallNextHookEx(hookHandle, code, wParam, lParam);
        int msg = wParam.ToInt32();
        if (msg != WM_KEYDOWN && msg != WM_KEYUP &&
            msg != WM_SYSKEYDOWN && msg != WM_SYSKEYUP)
            return CallNextHookEx(hookHandle, code, wParam, lParam);

        KbdHook key = (KbdHook)Marshal.PtrToStructure(lParam, typeof(KbdHook));
        if ((key.flags & LLKHF_INJECTED) != 0)
            return CallNextHookEx(hookHandle, code, wParam, lParam);

        bool down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
        // Do not perform blocking I/O in a low-level hook.
        if (router.Handle((int)key.vkCode, down)) return new IntPtr(1);
        return CallNextHookEx(hookHandle, code, wParam, lParam);
    }

    private static int SelfTest() {
        var generated = new List<string>();
        Router r = new Router(new[] {
            new Binding("RECORD", "CapsLock"),
            new Binding("PANEL", "Ctrl+Shift+O"),
            new Binding("MOVE", "Ctrl+Shift+M"),
        }, value => generated.Add(value), false);

        if (!r.Handle(0x14, true) || !r.Handle(0x14, true) || !r.Handle(0x14, false))
            return 1;
        if (generated.Count != 2 || generated[0] != "RECORD_DOWN" || generated[1] != "RECORD_UP")
            return 2;

        r.Handle(VK_CTRL, true);
        r.Handle(VK_SHIFT, true);
        if (!r.Handle('O', true) || !r.Handle('O', false)) return 3;
        r.Handle(VK_SHIFT, false);
        r.Handle(VK_CTRL, false);
        if (generated.Count != 3 || generated[2] != "PANEL_DOWN") return 4;

        r.SetCapture(true);
        if (r.Handle(0x14, true) || r.Handle(0x14, false)) return 5;
        r.SetCapture(false);

        r.Handle(VK_CTRL, true);
        r.Handle(VK_SHIFT, true);
        if (!r.Handle('M', true) || !r.Handle('M', false)) return 6;
        if (generated.Count != 4 || generated[3] != "MOVE_DOWN") return 7;

        Console.WriteLine("Hotkey routing self-test passed");
        return 0;
    }

    private static int Main(string[] args) {
        if (args.Length == 1 && args[0] == "--self-test") return SelfTest();
        if (args.Length < 3 || args.Length > 4) return 2;

        try {
            Binding[] bindings = {
                new Binding("RECORD", args[0]),
                new Binding("PANEL", args[1]),
                new Binding("MOVE", args[2]),
            };
            router = new Router(bindings, text => events.Add(text),
                args.Length == 4 && args[3] == "--capture");

            Thread writer = new Thread(() => {
                foreach (string line in events.GetConsumingEnumerable()) {
                    try { Console.WriteLine(line); Console.Out.Flush(); }
                    catch (System.IO.IOException) { Environment.Exit(0); }
                }
            });
            writer.IsBackground = true;
            writer.Start();

            Thread commands = new Thread(() => {
                string command;
                while ((command = Console.ReadLine()) != null) {
                    if (command == "CAPTURE_ON") router.SetCapture(true);
                    else if (command == "CAPTURE_OFF") router.SetCapture(false);
                }
                Environment.Exit(0); // parent closed pipe
            });
            commands.IsBackground = true;
            commands.Start();

            callback = KeyboardCallback;
            Process process = Process.GetCurrentProcess();
            IntPtr module = GetModuleHandle(process.MainModule.ModuleName);
            hookHandle = SetWindowsHookEx(WH_KEYBOARD_LL, callback, module, 0);
            if (hookHandle == IntPtr.Zero) {
                Console.Error.WriteLine("Unable to install keyboard hook: " + Marshal.GetLastWin32Error());
                return 3;
            }
            Console.WriteLine("READY");
            Console.Out.Flush();
            try {
                Msg msg;
                int value;
                while ((value = GetMessage(out msg, IntPtr.Zero, 0, 0)) > 0) {
                    TranslateMessage(ref msg);
                    DispatchMessage(ref msg);
                }
                return value == -1 ? 4 : 0;
            } finally {
                router.ReleaseAll();
                UnhookWindowsHookEx(hookHandle);
            }
        } catch (Exception error) {
            Console.Error.WriteLine(error.ToString());
            return 5;
        }
    }
}
