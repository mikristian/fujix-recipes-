//! Exercise the *same* native RAF source validator shipped in Chromaforge,
//! independently of its UI. Run only with an isolated temporary HOME. Does
//! not read any camera, mutate the original RAF, or test actual conversion.
#[path = "../research/chromaforge-v26.45.2/source/crates/ui-egui/src/panels/fujix/preflight.rs"]
mod preflight;

fn main() {
    let home = std::env::var("HOME").expect("test HOME");
    assert!(home.contains("x100vi-raf-audit-test-"), "do not write audit fixtures to user HOME");
    let path = std::env::args().nth(1).expect("usage: x100vi-raf-preflight-probe <original.RAF>");
    let before = std::fs::metadata(&path).unwrap().len();
    let (evidence, audit_path) = preflight::inspect_and_save(&path).expect("RAF source validation");
    assert_eq!(evidence.kind, "fujix-raf-source-audit");
    assert_eq!(evidence.source_model_from_header, "X100VI");
    assert!(evidence.repeated_hash_agrees);
    assert_eq!(evidence.raf_size, before);
    assert_eq!(evidence.raf_sha256.len(), 64);
    assert!(!evidence.usb_transmits && !evidence.camera_verified);
    assert!(!evidence.physical_c1_c7_backed_up);
    assert!(!evidence.camera_rendered_jpeg_verified);
    assert!(!evidence.physical_slot_restore_verified);
    let audit: serde_json::Value = serde_json::from_slice(&std::fs::read(audit_path).unwrap()).unwrap();
    assert_eq!(audit["raf_sha256"], evidence.raf_sha256);
    assert_eq!(audit["status"], "offline_source_integrity_only");
    assert_eq!(std::fs::metadata(&path).unwrap().len(), before);
    println!("X100VI_ORIGINAL_RAF_DOUBLE_HASH_PASS {} {}", before, evidence.raf_sha256);
    println!("X100VI_SOURCE_AUDIT_PERSISTENCE_PASS");
    println!("CAMERA_TRANSMISSIONS_ZERO");
}
