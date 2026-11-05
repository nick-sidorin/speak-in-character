using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

// Only polls three keys for the InCharacter hold-to-talk chord.
// No keyboard hooks, keystroke logging, network or game integration.
class HoldToTalk
{
    [DllImport("user32.dll")]
    static extern short GetAsyncKeyState(int key);

    static bool Held()
    {
        return (GetAsyncKeyState(0x11) & 0x8000) != 0 &&
               (GetAsyncKeyState(0x10) & 0x8000) != 0 &&
               (GetAsyncKeyState(0x20) & 0x8000) != 0;
    }

    static void Main()
    {
        var stopwatch = Stopwatch.StartNew();
        bool down = false, sent = false;
        long downAt = 0;
        while (true)
        {
            bool current = Held();
            long now = stopwatch.ElapsedMilliseconds;
            if (current && !down) { down = true; downAt = now; }
            if (current && down && !sent && now - downAt >= 45)
            {
                sent = true;
                Console.WriteLine("DOWN");
                Console.Out.Flush();
            }
            if (!current && down)
            {
                down = false;
                if (sent) { Console.WriteLine("UP"); Console.Out.Flush(); }
                sent = false;
            }
            Thread.Sleep(12);
        }
    }
}
