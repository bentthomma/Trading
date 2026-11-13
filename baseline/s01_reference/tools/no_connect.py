"""Linux child-process network syscall deny-list; not a general security sandbox."""
import ctypes, ctypes.util, errno

def install():
    name=ctypes.util.find_library('seccomp')
    if not name:raise RuntimeError('libseccomp unavailable; fail closed')
    libc=ctypes.CDLL(None,use_errno=True)
    if libc.prctl(38,1,0,0,0)!=0:raise OSError(ctypes.get_errno(),'no_new_privs failed')
    lib=ctypes.CDLL(name,use_errno=True)
    lib.seccomp_init.argtypes=[ctypes.c_uint32];lib.seccomp_init.restype=ctypes.c_void_p
    lib.seccomp_syscall_resolve_name.argtypes=[ctypes.c_char_p];lib.seccomp_syscall_resolve_name.restype=ctypes.c_int
    lib.seccomp_rule_add.argtypes=[ctypes.c_void_p,ctypes.c_uint32,ctypes.c_int,ctypes.c_uint]
    lib.seccomp_rule_add.restype=ctypes.c_int
    lib.seccomp_load.argtypes=[ctypes.c_void_p];lib.seccomp_load.restype=ctypes.c_int
    lib.seccomp_release.argtypes=[ctypes.c_void_p]
    ctx=lib.seccomp_init(0x7fff0000)
    if not ctx:raise RuntimeError('seccomp_init failed')
    try:
        for call in (b'connect',b'sendto',b'sendmsg',b'sendmmsg'):
            number=lib.seccomp_syscall_resolve_name(call)
            if number<0 or lib.seccomp_rule_add(ctx,0x00050000|errno.EPERM,number,0):raise RuntimeError('network rule failed')
        if lib.seccomp_load(ctx):raise RuntimeError('seccomp_load failed')
    finally:lib.seccomp_release(ctx)
