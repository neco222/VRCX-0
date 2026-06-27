#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, HANDLE};
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::DataExchange::COPYDATASTRUCT;
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::Threading::{CreateMutexW, ReleaseMutex};
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::WindowsAndMessaging::{FindWindowW, SendMessageW, WM_COPYDATA};

#[cfg(target_os = "windows")]
const SINGLE_INSTANCE_MUTEX_NAME: &str = r"Local\VRCX-0.App.SingleInstanceGuard";

// Mirrors tauri-plugin-single-instance 2.x Windows transport so the early guard
// can still wake the already-running app before Tauri finishes initializing.
#[cfg(target_os = "windows")]
const TAURI_SINGLE_INSTANCE_CLASS_NAME: &str = "com.vrcx-0.app-sic";
#[cfg(target_os = "windows")]
const TAURI_SINGLE_INSTANCE_WINDOW_NAME: &str = "com.vrcx-0.app-siw";
#[cfg(target_os = "windows")]
const WMCOPYDATA_SINGLE_INSTANCE_DATA: usize = 1542;

pub(crate) struct SingleInstanceGuard {
    #[cfg(target_os = "windows")]
    handle: HANDLE,
}

#[cfg(target_os = "windows")]
impl Drop for SingleInstanceGuard {
    fn drop(&mut self) {
        unsafe {
            ReleaseMutex(self.handle);
            CloseHandle(self.handle);
        }
    }
}

#[cfg(target_os = "windows")]
pub(crate) fn try_acquire_or_notify_existing() -> Option<SingleInstanceGuard> {
    let mutex_name = encode_wide(SINGLE_INSTANCE_MUTEX_NAME);
    let handle = unsafe { CreateMutexW(std::ptr::null(), true.into(), mutex_name.as_ptr()) };
    if handle.is_null() {
        notify_tauri_single_instance_window();
        return None;
    }

    if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
        unsafe {
            CloseHandle(handle);
        }
        notify_tauri_single_instance_window();
        return None;
    }

    Some(SingleInstanceGuard { handle })
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn try_acquire_or_notify_existing() -> Option<SingleInstanceGuard> {
    Some(SingleInstanceGuard {})
}

#[cfg(target_os = "windows")]
fn notify_tauri_single_instance_window() {
    let class_name = encode_wide(TAURI_SINGLE_INSTANCE_CLASS_NAME);
    let window_name = encode_wide(TAURI_SINGLE_INSTANCE_WINDOW_NAME);
    let hwnd = unsafe { FindWindowW(class_name.as_ptr(), window_name.as_ptr()) };
    if hwnd.is_null() {
        return;
    }

    let cwd = std::env::current_dir().unwrap_or_default();
    let cwd = cwd.to_str().unwrap_or_default();
    let args = std::env::args().collect::<Vec<String>>().join("|");
    let data = format!("{cwd}|{args}\0");
    let bytes = data.as_bytes();
    let copy_data = COPYDATASTRUCT {
        dwData: WMCOPYDATA_SINGLE_INSTANCE_DATA,
        cbData: bytes.len() as _,
        lpData: bytes.as_ptr() as _,
    };
    unsafe {
        SendMessageW(hwnd, WM_COPYDATA, 0, &copy_data as *const _ as _);
    }
}

#[cfg(target_os = "windows")]
fn encode_wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}
