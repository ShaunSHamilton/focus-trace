//! System-wide network counters via `GetIfTable2`, bucketed Wi-Fi vs Ethernet.
//!
//! Windows offers no per-process byte accounting without ETW, so the PRD's
//! "differentiated by connection type" requirement is met at the adapter level:
//! we diff each adapter's cumulative octet counters between ticks.

use crate::telemetry::NetDelta;
use std::collections::HashMap;

const IF_TYPE_ETHERNET_CSMACD: u32 = 6;
const IF_TYPE_IEEE80211: u32 = 71;

/// Previous cumulative readings, keyed by interface index.
#[derive(Debug, Default)]
pub struct NetCounters {
    prev: HashMap<u32, (u64, u64)>, // if_index -> (in_octets, out_octets)
}

impl NetCounters {
    pub fn new() -> Self {
        Self::default()
    }
}

#[cfg(windows)]
pub fn read_and_diff(counters: &mut NetCounters) -> NetDelta {
    use core::ffi::c_void;
    use windows::Win32::Foundation::NO_ERROR;
    use windows::Win32::NetworkManagement::IpHelper::{FreeMibTable, GetIfTable2, MIB_IF_TABLE2};

    let mut delta = NetDelta::default();
    let mut table_ptr: *mut MIB_IF_TABLE2 = std::ptr::null_mut();

    // SAFETY: GetIfTable2 allocates `table_ptr`; the guard below frees it.
    let rc = unsafe { GetIfTable2(&mut table_ptr) };
    if rc != NO_ERROR || table_ptr.is_null() {
        return delta;
    }

    // RAII: free the heap-allocated table on every exit path.
    struct Guard(*const c_void);
    impl Drop for Guard {
        fn drop(&mut self) {
            unsafe { FreeMibTable(self.0) };
        }
    }
    let _guard = Guard(table_ptr as *const c_void);

    // SAFETY: table_ptr is non-null; Table is a flexible array of NumEntries rows.
    let table = unsafe { &*table_ptr };
    let count = table.NumEntries as usize;
    let first = table.Table.as_ptr();

    for i in 0..count {
        let row = unsafe { &*first.add(i) };
        let kind = row.Type;
        if kind != IF_TYPE_IEEE80211 && kind != IF_TYPE_ETHERNET_CSMACD {
            continue; // only Wi-Fi vs Ethernet, per PRD
        }
        let cur = (row.InOctets, row.OutOctets);
        let idx = row.InterfaceIndex;
        let (din, dout) = match counters.prev.get(&idx) {
            // saturating_sub survives counter resets (adapter disable/reconnect).
            Some(&(pin, pout)) => (cur.0.saturating_sub(pin), cur.1.saturating_sub(pout)),
            None => (0, 0), // first sighting: seed only
        };
        counters.prev.insert(idx, cur);

        if kind == IF_TYPE_IEEE80211 {
            delta.wifi_in += din;
            delta.wifi_out += dout;
        } else {
            delta.eth_in += din;
            delta.eth_out += dout;
        }
    }

    delta
}

#[cfg(not(windows))]
pub fn read_and_diff(_counters: &mut NetCounters) -> NetDelta {
    NetDelta::default()
}
