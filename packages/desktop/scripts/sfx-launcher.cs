using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;

internal static class Launcher
{
    private static readonly byte[] Magic = { (byte)'B', (byte)'A', (byte)'S', (byte)'F', (byte)'X' };

    private static string Product
    {
        get { return SfxInstallDir.Value; }
    }

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
            Directory.CreateDirectory(targetDir);

            string zipBuildId = ReadZipEntryText(exeBytes, zipStart, zipLen, "dist-build-id.txt");
            string existingBuildId = ReadTextIfExists(Path.Combine(targetDir, "dist-build-id.txt"));
            bool sameBuild = !string.IsNullOrEmpty(zipBuildId)
                && string.Equals(zipBuildId.Trim(), (existingBuildId ?? "").Trim(), StringComparison.Ordinal);

            if (!sameBuild || !File.Exists(mainExe))
            {
                try
                {
                    ExtractZip(exeBytes, zipStart, zipLen, targetDir);
                }
                catch (IOException ex)
                {
                    if (!File.Exists(mainExe)) throw;
                    LogError("解压时文件被占用，改为启动已有程序：" + ex.Message);
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

    private static void ExtractZip(byte[] exeBytes, int zipStart, int zipLen, string targetDir)
    {
        using (var ms = new MemoryStream(exeBytes, zipStart, zipLen))
        using (var archive = new ZipArchive(ms, ZipArchiveMode.Read))
        {
            foreach (var entry in archive.Entries)
            {
                if (string.IsNullOrEmpty(entry.Name)) continue;
                string dest = Path.Combine(targetDir, entry.FullName);
                string dir = Path.GetDirectoryName(dest);
                if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
                entry.ExtractToFile(dest, true);
            }
        }
    }

    private static string ReadZipEntryText(byte[] exeBytes, int zipStart, int zipLen, string name)
    {
        try
        {
            using (var ms = new MemoryStream(exeBytes, zipStart, zipLen))
            using (var archive = new ZipArchive(ms, ZipArchiveMode.Read))
            {
                foreach (var entry in archive.Entries)
                {
                    if (!string.Equals(entry.FullName.Replace('\\', '/'), name, StringComparison.OrdinalIgnoreCase))
                        continue;
                    using (var reader = new StreamReader(entry.Open(), Encoding.UTF8))
                    {
                        return reader.ReadToEnd();
                    }
                }
            }
        }
        catch { }
        return null;
    }

    private static string ReadTextIfExists(string path)
    {
        try
        {
            return File.Exists(path) ? File.ReadAllText(path, Encoding.UTF8) : null;
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
