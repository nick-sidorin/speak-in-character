using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

// Poll only the three user-assigned shortcuts. No global keyboard hook,
// keystroke logging, game automation or synthesized keyboard events.
class Hotkeys
{
    [DllImport("user32.dll")]
    static extern short GetAsyncKeyState(int vk);

    static bool Down(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }

    static int Vk(string name)
    {
        string value = name.ToUpperInvariant();
        if (value.Length == 1 && ((value[0] >= 'A' && value[0] <= 'Z') || (value[0] >= '0' && value[0] <= '9')))
            return value[0];
        if (value.StartsWith("F")) {
            int n;
            if (int.TryParse(value.Substring(1), out n) && n >= 1 && n <= 12) return 0x70 + n - 1;
        }
        switch (value) {
            case "SPACE": return 0x20;
            case "CAPSLOCK": return 0x14;
            case "TAB": return 0x09;
            case "ENTER": return 0x0D;
            case "BACKSPACE": return 0x08;
            case "ESCAPE": return 0x1B;
            case "DELETE": return 0x2E;
            case "INSERT": return 0x2D;
            case "HOME": return 0x24;
            case "END": return 0x23;
            case "PAGEUP": return 0x21;
            case "PAGEDOWN": return 0x22;
            case "ARROWUP": return 0x26;
            case "ARROWDOWN": return 0x28;
            case "ARROWLEFT": return 0x25;
            case "ARROWRIGHT": return 0x27;
            default: throw new ArgumentException("Unsupported shortcut key: " + value);
        }
    }

    class Shortcut
    {
        public string Action;
        public int Key;
        public bool Ctrl, Alt, Shift, DownState, Fired;
        public long Started;

        public Shortcut(string action, string encoded)
        {
            Action = action;
            foreach (string raw in encoded.Split('+')) {
                string part = raw.Trim();
                if (part == "Ctrl") Ctrl = true;
                else if (part == "Alt") Alt = true;
                else if (part == "Shift") Shift = true;
                else Key = Vk(part);
            }
            if (Key == 0) throw new ArgumentException("Missing primary key");
        }

        public void Poll(long now)
        {
            bool current = (!Ctrl || Down(0x11)) &&
                           (!Alt || Down(0x12)) &&
                           (!Shift || Down(0x10)) && Down(Key);
            if (current && !DownState) { DownState = true; Started = now; }
            if (current && !Fired && now - Started >= 45) {
                Fired = true;
                Console.WriteLine(Action + "_DOWN");
                Console.Out.Flush();
            }
            if (!current && DownState) {
                DownState = false;
                if (Fired && Action == "RECORD") {
                    Console.WriteLine("RECORD_UP");
                    Console.Out.Flush();
                }
                Fired = false;
            }
        }
    }

    static void Main(string[] args)
    {
        if (args.Length != 3) return;
        Shortcut[] bindings = {
            new Shortcut("RECORD", args[0]),
            new Shortcut("PANEL", args[1]),
            new Shortcut("MOVE", args[2])
        };
        Stopwatch clock = Stopwatch.StartNew();
        while (true) {
            foreach (Shortcut binding in bindings) binding.Poll(clock.ElapsedMilliseconds);
            Thread.Sleep(12);
        }
    }
}
