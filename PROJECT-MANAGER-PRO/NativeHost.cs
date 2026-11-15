using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;

internal static class PmProNativeHost
{
    private static int Main(string[] args)
    {
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string script = Path.Combine(local, "PROJECT-MANAGER-PRO-Updater", "updater-host.ps1");
        string powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows),
            "System32", "WindowsPowerShell", "v1.0", "powershell.exe");

        if (!File.Exists(script) || !File.Exists(powershell))
            return 2;

        var start = new ProcessStartInfo();
        start.FileName = powershell;
        start.Arguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + script + "\"";
        start.UseShellExecute = false;
        start.CreateNoWindow = true;
        start.RedirectStandardInput = true;
        start.RedirectStandardOutput = true;
        start.RedirectStandardError = true;
        start.WorkingDirectory = Path.GetDirectoryName(script);

        using (Process process = Process.Start(start))
        {
            if (process == null) return 3;
            Task input = Task.Run(() =>
            {
                try { Console.OpenStandardInput().CopyTo(process.StandardInput.BaseStream); }
                finally { process.StandardInput.Close(); }
            });
            Task output = Task.Run(() =>
            {
                process.StandardOutput.BaseStream.CopyTo(Console.OpenStandardOutput());
                Console.OpenStandardOutput().Flush();
            });
            Task error = Task.Run(() =>
            {
                process.StandardError.BaseStream.CopyTo(Console.OpenStandardError());
                Console.OpenStandardError().Flush();
            });
            process.WaitForExit();
            Task.WaitAll(input, output, error);
            return process.ExitCode;
        }
    }
}
