using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

// Polls only the user-selected shortcut. No keyboard hook, logging or game automation.
class HoldToTalk
{
    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int key);

    private static bool Down(int key) { return (GetAsyncKeyState(key) & 0x8000) != 0; }

    private static int KeyCode(string label)
    {
        if (label == "Space") return 0x20;
        if (label.Length == 1) {
            char k = label[0];
            if ((k >= 'A' && k <= 'Z') || (k >= '0' && k <= '9')) return (int)k;
        }
        if (label.StartsWith("F")) {
            int f;
            if (Int32.TryParse(label.Substring(1), out f) && f >= 1 && f <= 12) return 0x70 + f - 1;
        }
        throw new ArgumentException("Unsupported shortcut key");
    }

    static void Main(string[] args)
    {
        if (args.Length != 1) return;
        string[] parts = args[0].Split('+');
        bool ctrl = false, shift = false, alt = false;
        int key = 0;
        foreach (string raw in parts) {
            string part = raw.Trim().ToUpperInvariant();
            if (part == "CTRL") ctrl = true;
            else if (part == "SHIFT") shift = true;
            else if (part == "ALT") alt = true;
            else key = KeyCode(raw.Trim());
        }
        if ((!ctrl && !alt && !shift) || key == 0) return;

        var clock = Stopwatch.StartNew();
        bool wasDown = false, wasSent = false;
        long pressedAt = 0;
        while (true)
        {
            bool current = (!ctrl || Down(0x11)) &&
                           (!shift || Down(0x10)) &&
                           (!alt || Down(0x12)) &&
                           Down(key);
            long now = clock.ElapsedMilliseconds;
            if (current && !wasDown) { wasDown = true; pressedAt = now; }
            if (current && !wasSent && now - pressedAt >= 45) {
                wasSent = true;
                Console.WriteLine("DOWN");
                Console.Out.Flush();
            }
            if (!current && wasDown) {
                wasDown = false;
                if (wasSent) {
                    Console.WriteLine("UP");
                    Console.Out.Flush();
                }
                wasSent = false;
            }
            Thread.Sleep(12);
        }
    }
}
