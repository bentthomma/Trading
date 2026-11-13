# Fixed application code. No command string, credential or script is accepted
# from the web request. The owner is placed in a kill-on-close Windows Job before
# creating the CLI, so a lost parent pipe also terminates the CLI descendants.
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public sealed class ObserverOwnedJob {
  [StructLayout(LayoutKind.Sequential)] struct Basic { public long ProcessTime,JobTime; public uint Flags; public UIntPtr Min,Max; public uint Active; public UIntPtr Affinity; public uint Priority,Scheduling; }
  [StructLayout(LayoutKind.Sequential)] struct IO { public ulong ReadOps,WriteOps,OtherOps,ReadBytes,WriteBytes,OtherBytes; }
  [StructLayout(LayoutKind.Sequential)] struct Extended { public Basic Basic; public IO IO; public UIntPtr ProcessLimit,JobLimit,PeakProcess,PeakJob; }
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Startup { public int cb; public string reserved,desktop,title; public uint x,y,xSize,ySize,xChars,yChars,fill,flags; public ushort show,reserved2; public IntPtr reservedPtr,input,output,error; }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr process,thread; public uint pid,tid; }
  [StructLayout(LayoutKind.Sequential)] struct Security { public int length; public IntPtr descriptor; [MarshalAs(UnmanagedType.Bool)] public bool inherit; }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr security,string name);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int info,ref Extended value,uint length);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateJobObject(IntPtr job,uint code);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateFile(string file,uint access,uint share,ref Security security,uint creation,uint flags,IntPtr template);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string app,StringBuilder command,IntPtr processAttributes,IntPtr threadAttributes,bool inherit,uint flags,IntPtr environment,string directory,ref Startup startup,out ProcessInfo info);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint timeout);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr handle,out uint code);
  IntPtr job,process;
  public uint Pid { get; private set; }
  static string Quote(string value) {
    StringBuilder b=new StringBuilder("\""); int slashes=0;
    foreach(char c in value) { if(c=='\\'){slashes++;continue;} if(c=='\"'){b.Append('\\',slashes*2+1);b.Append(c);} else {b.Append('\\',slashes);b.Append(c);} slashes=0; }
    b.Append('\\',slashes*2);b.Append('"');return b.ToString();
  }
  public ObserverOwnedJob(string command,string[] args,string directory) {
    job=CreateJobObject(IntPtr.Zero,null); if(job==IntPtr.Zero)throw new Exception("JOB_CREATE_FAILED");
    Extended limits=new Extended(); limits.Basic.Flags=0x2000;
    if(!SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(Extended))))throw new Exception("JOB_LIMIT_FAILED");
    // Nested jobs are supported by the Windows versions supported by cTrader.
    // If this host cannot establish ownership, no CLI process is created.
    if(!AssignProcessToJobObject(job,GetCurrentProcess()))throw new Exception("JOB_ASSIGN_FAILED");
    Security sa=new Security();sa.length=Marshal.SizeOf(typeof(Security));sa.inherit=true;
    IntPtr sink=CreateFile("NUL",0xC0000000,3,ref sa,3,0,IntPtr.Zero);
    if(sink==new IntPtr(-1))throw new Exception("JOB_STDIO_FAILED");
    Startup startup=new Startup();startup.cb=Marshal.SizeOf(typeof(Startup));startup.flags=0x100;startup.input=sink;startup.output=sink;startup.error=sink;
    StringBuilder line=new StringBuilder(Quote(command));foreach(string a in args){line.Append(' ');line.Append(Quote(a));}
    ProcessInfo pi;
    bool ok=CreateProcess(command,line,IntPtr.Zero,IntPtr.Zero,true,0x08000000,IntPtr.Zero,directory,ref startup,out pi);
    CloseHandle(sink);
    if(!ok)throw new Exception("CLI_CREATE_FAILED");
    CloseHandle(pi.thread);process=pi.process;Pid=pi.pid;
  }
  public bool Exited { get { uint result=WaitForSingleObject(process,0);if(result==0xFFFFFFFF)throw new Exception("JOB_WAIT_FAILED");return result==0; } }
  public uint ExitCode { get { uint code;if(!GetExitCodeProcess(process,out code))throw new Exception("JOB_EXIT_FAILED");return code; } }
  public void Stop(){TerminateJobObject(job,1223);}
}
'@
try {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line -or $line.Length -gt 16000) { throw 'SPEC_INVALID' }
  $spec = $line | ConvertFrom-Json
  $owned = New-Object ObserverOwnedJob([string]$spec.command, [string[]]$spec.args, [string]$spec.cwd)
  [Console]::Out.WriteLine('{"type":"spawned","pid":' + $owned.Pid + '}')
  [Console]::Out.Flush()
  $inputTask = [Console]::In.ReadLineAsync()
  while (-not $owned.Exited) {
    if ($inputTask.IsCompleted) { $owned.Stop(); exit 1 }
    [Threading.Thread]::Sleep(100)
  }
  [Console]::Out.WriteLine('{"type":"exited","code":' + $owned.ExitCode + ',"signal":null}')
  [Console]::Out.Flush()
  $owned.Stop()
} catch {
  [Console]::Out.WriteLine('{"type":"failed"}')
  [Console]::Out.Flush()
  exit 1
}
