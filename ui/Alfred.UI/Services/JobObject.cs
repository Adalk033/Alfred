using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Alfred.UI.Services;

/// <summary>
/// Envuelve un Job Object de Windows con KILL_ON_JOB_CLOSE. Todo proceso
/// asignado muere automaticamente cuando el handle del job se cierra (o el
/// proceso de la UI termina, aun de forma abrupta). Asi alfred.exe nunca
/// queda huerfano ocupando el puerto 8000.
///
/// Degrada de forma segura: si cualquier llamada nativa falla, el objeto
/// queda inactivo y Assign() no hace nada (el backend simplemente no gozara
/// de la garantia de kill-on-close, como antes de este cambio).
/// </summary>
internal sealed class JobObject : IDisposable
{
    private IntPtr _handle = IntPtr.Zero;
    private bool _disposed;

    public JobObject()
    {
        try
        {
            _handle = CreateJobObject(IntPtr.Zero, null);
            if (_handle == IntPtr.Zero) return;

            var info = new JOBOBJECT_BASIC_LIMIT_INFORMATION
            {
                LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            };
            var extended = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION
            {
                BasicLimitInformation = info
            };

            int length = Marshal.SizeOf<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>();
            IntPtr ptr = Marshal.AllocHGlobal(length);
            try
            {
                Marshal.StructureToPtr(extended, ptr, false);
                if (!SetInformationJobObject(_handle,
                        JobObjectExtendedLimitInformation, ptr, (uint)length))
                {
                    Cleanup();
                }
            }
            finally
            {
                Marshal.FreeHGlobal(ptr);
            }
        }
        catch
        {
            Cleanup();
        }
    }

    public bool IsValid => _handle != IntPtr.Zero;

    /// <summary>
    /// Asigna un proceso al job. No-op si el job no es valido.
    /// </summary>
    public void Assign(Process process)
    {
        if (_handle == IntPtr.Zero) return;
        try { AssignProcessToJobObject(_handle, process.Handle); }
        catch { /* best effort */ }
    }

    private void Cleanup()
    {
        if (_handle != IntPtr.Zero)
        {
            try { CloseHandle(_handle); } catch { }
            _handle = IntPtr.Zero;
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        Cleanup();
    }

    // ------------------------------------------------------------------
    // P/Invoke
    // ------------------------------------------------------------------
    private const int JobObjectExtendedLimitInformation = 9;
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string? lpName);

    [DllImport("kernel32.dll")]
    private static extern bool SetInformationJobObject(IntPtr hJob,
        int infoType, IntPtr lpJobObjectInfo, uint cbJobObjectInfoLength);

    [DllImport("kernel32.dll")]
    private static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr hObject);
}
