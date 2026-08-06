using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;

internal static class Launcher
{
    private const string Product = "监管资料库搜索";
    private static readonly byte[] Magic = { (byte)'B', (byte)'A', (byte)'S', (byte)'F', (byte)'X' };

    private static int Main()
    {
        try
        {
            string exePath = Assembly.GetExecutingAssembly().Location;
            if (string.IsNullOrEmpty(exePath) || !File.Exists(exePath)) return 1;

            byte[] exeBytes = File.ReadAllBytes(exePath);
            int tail = Magic.Length + 4;
            if (exeBytes.Length < tail) return 2;

            for (int i = 0; i < Magic.Length; i++)
            {
                if (exeBytes[exeBytes.Length - Magic.Length + i] != Magic[i]) return 3;
            }

            int zipLen = BitConverter.ToInt32(exeBytes, exeBytes.Length - tail);
            int zipStart = exeBytes.Length - tail - zipLen;
            if (zipStart < 0) return 4;

            string targetDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                Product);

            string mainExe = Path.Combine(targetDir, Product + ".exe");
            string localBuildIdPath = Path.Combine(targetDir, "dist-build-id.txt");
            string zipBuildId = ReadBuildIdFromZip(exeBytes, zipStart, zipLen);
            string localBuildId = File.Exists(localBuildIdPath)
                ? File.ReadAllText(localBuildIdPath).Trim()
                : "";

            bool needExtract =
                !File.Exists(mainExe)
                || !File.Exists(Path.Combine(targetDir, "portable.flag"))
                || string.IsNullOrEmpty(zipBuildId)
                || !string.Equals(zipBuildId, localBuildId, StringComparison.Ordinal)
                || (!File.Exists(localBuildIdPath)
                    && File.Exists(mainExe)
                    && File.GetLastWriteTimeUtc(exePath) > File.GetLastWriteTimeUtc(mainExe));

            if (needExtract)
            {
                Directory.CreateDirectory(targetDir);
                using (var ms = new MemoryStream(exeBytes, zipStart, zipLen))
                using (var archive = new ZipArchive(ms, ZipArchiveMode.Read))
                {
                    foreach (var entry in archive.Entries)
                    {
                        string dest = Path.Combine(targetDir, entry.FullName);
                        string dir = Path.GetDirectoryName(dest);
                        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
                        entry.ExtractToFile(dest, true);
                    }
                }
            }

            if (!File.Exists(mainExe))
            {
                LogError("未找到主程序：" + mainExe);
                return 5;
            }

            var psi = new ProcessStartInfo
            {
                FileName = mainExe,
                UseShellExecute = true,
                WorkingDirectory = targetDir,
            };
            Process.Start(psi);
            return 0;
        }
        catch (Exception ex)
        {
            LogError("启动失败：" + ex);
            return 99;
        }
    }

    private static string ReadBuildIdFromZip(byte[] exeBytes, int zipStart, int zipLen)
    {
        try
        {
            using (var ms = new MemoryStream(exeBytes, zipStart, zipLen))
            using (var archive = new ZipArchive(ms, ZipArchiveMode.Read))
            {
                ZipArchiveEntry entry = archive.GetEntry("dist-build-id.txt");
                if (entry == null) return null;
                using (var reader = new StreamReader(entry.Open()))
                {
                    return reader.ReadToEnd().Trim();
                }
            }
        }
        catch
        {
            return null;
        }
    }

    private static void LogError(string text)
    {
        try
        {
            string dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                Product);
            Directory.CreateDirectory(dir);
            File.AppendAllText(Path.Combine(dir, "launcher-error.log"),
                DateTime.Now + " " + text + Environment.NewLine);
        }
        catch { }
    }
}
