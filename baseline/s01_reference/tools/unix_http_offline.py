"""Linux test guard: only AF_UNIX sockets may be created; no IP network.

For real HTTP parser/client/server tests over a temporary Unix-domain socket.
Not a general sandbox. No inherited network descriptors are passed by the runner.
"""
import ctypes, ctypes.util, errno

def install():
    name=ctypes.util.find_library('seccomp')
    if not name:raise RuntimeError('libseccomp unavailable')
    libc=ctypes.CDLL(None,use_errno=True)
    if libc.prctl(38,1,0,0,0):raise OSError(ctypes.get_errno(),'no_new_privs failed')
    lib=ctypes.CDLL(name,use_errno=True)
    class Cmp(ctypes.Structure):
        _fields_=[('arg',ctypes.c_uint),('op',ctypes.c_int),('datum_a',ctypes.c_uint64),('datum_b',ctypes.c_uint64)]
    lib.seccomp_init.argtypes=[ctypes.c_uint32];lib.seccomp_init.restype=ctypes.c_void_p
    lib.seccomp_syscall_resolve_name.argtypes=[ctypes.c_char_p];lib.seccomp_syscall_resolve_name.restype=ctypes.c_int
    lib.seccomp_rule_add_array.argtypes=[ctypes.c_void_p,ctypes.c_uint32,ctypes.c_int,ctypes.c_uint,ctypes.POINTER(Cmp)]
    lib.seccomp_rule_add_array.restype=ctypes.c_int
    lib.seccomp_load.argtypes=[ctypes.c_void_p];lib.seccomp_load.restype=ctypes.c_int
    lib.seccomp_release.argtypes=[ctypes.c_void_p]
    ctx=lib.seccomp_init(0x7fff0000)
    if not ctx:raise RuntimeError('seccomp_init failed')
    try:
        # SCMP_CMP_NE = 1; AF_UNIX = 1. IPv4/IPv6/packet/netlink sockets denied.
        for call in (b'socket',b'socketpair'):
            n=lib.seccomp_syscall_resolve_name(call)
            c=Cmp(0,1,1,0)
            if n<0 or lib.seccomp_rule_add_array(ctx,0x00050000|errno.EPERM,n,1,ctypes.byref(c)):
                raise RuntimeError('socket-domain rule failed')
        if lib.seccomp_load(ctx):raise RuntimeError('seccomp_load failed')
    finally:lib.seccomp_release(ctx)
