//! Lightweight native-UI hover acceptance probe. Uses the same public
//! windowless Chromaforge control path as its full test suite, without its
//! large optional development-test dependency set. Compile against the built
//! lcc-ui-egui, lcc-engine and serde_json rlibs from the same Cargo target.

use lcc_ui_egui::{headless::Headless, LccApp, Services};
use lcc_engine::Session;
use serde_json::{json, Value};
use std::time::Duration;

fn checked(h: &mut Headless, command: &str, value: Value) {
    let result = h.request(command, value, Duration::from_secs(30));
    assert_eq!(result["ok"], true, "{command}: {result}");
    for _ in 0..3 { h.step(); }
}

fn main() {
    let app = LccApp::new(Session::with_demo(), Services { png: None, ..Default::default() });
    let mut h = Headless::new(app, [1400.0, 1000.0], 1.0);
    checked(&mut h, "ui.set", json!({"view": "detail"}));
    checked(&mut h, "engine.execute", json!({"command": "panel.profiles"}));
    checked(&mut h, "ui.clickWidget", json!({"id": "fujixProfileGroup:original-backups"}));
    checked(&mut h, "ui.clickWidget", json!({"id": "fujixProfileGroup:source-backup-1"}));

    let photo_id = h.app.session.active().expect("demo photo");
    let original = h.app.session.develop_of(photo_id).expect("original develop state");
    let commits = h.app.session.commits();
    let c1 = h.app.widgets.iter().find(|(id, _)| id == "fujixProfileGroup:source-backup-1-slot-1")
        .map(|(_, rect)| *rect).expect("C1 grid tile exists when backup expands");
    let c2 = h.app.widgets.iter().find(|(id, _)| id == "fujixProfileGroup:source-backup-1-slot-2")
        .map(|(_, rect)| *rect).expect("C2 grid tile exists when backup expands");
    assert!(c1.height() > 95.0 && c1.width() > 75.0,
        "cards must be large, like Chromaforge Basic profiles: {c1:?}");
    assert!((c1.top() - c2.top()).abs() < 1.0 && c2.left() > c1.right(),
        "C1 and C2 must be side-by-side in a two-column grid");
    println!("GRID_2_COLUMN_PASS {}x{}", c1.width(), c1.height());

    // Wait for the same asynchronous 256px variant renderer Basic profiles
    // use, rather than snapshotting placeholders before the photo loads.
    let thumbnails_ready = h.step_until(Duration::from_secs(25), |h| h.app.renderer.variant_textures() >= 2);
    println!("GRID_THUMBNAILS_READY {} COUNT {}", thumbnails_ready, h.app.renderer.variant_textures());
    // Keep one lightweight visual acceptance frame; the host can convert the
    // PPM to a compact JPEG and inspect the right-side Profiles grid without
    // relying on a remote macOS screencapture (often a black screen).
    let frame = h.paint();
    let mut ppm = format!("P6\n{} {}\n255\n", frame.size[0], frame.size[1]).into_bytes();
    for pixel in &frame.pixels {
        ppm.extend_from_slice(&pixel.to_array()[..3]);
    }
    std::fs::write("data/fujix-profiles-grid-check.ppm", ppm).expect("write UI inspection frame");
    checked(&mut h, "ui.hoverWidget", json!({"id": "fujixProfileGroup:source-backup-1-slot-2"}));
    let preview = h.app.hover_preview.as_ref().expect("C2 creates a hover preview");
    assert!(preview.label.contains("Cinestill 800t"), "{}", preview.label);
    assert!(preview.label.contains("approximate"), "{}", preview.label);
    assert_ne!(preview.settings.profile.id, original.profile.id, "film simulation changes temporary look");
    assert_eq!(h.app.session.develop_of(photo_id).as_deref(), Some(original.as_ref()), "original untouched");
    assert_eq!(h.app.session.commits(), commits, "hover must not commit an edit");
    println!("C2_HOVER_PASS {}", preview.label);

    checked(&mut h, "ui.move", json!({"x":4, "y":500}));
    assert!(h.app.hover_preview.is_none(), "leaving the slot restores the original image");
    println!("LEAVE_RESTORE_PASS");

    checked(&mut h, "ui.clickWidget", json!({"id": "fujixProfiles:expandAll"}));
    for number in [1, 2, 7, 14, 15, 86] {
        let key = format!("fujixProfileGroup:source-backup-{number}-slot-1");
        assert!(h.app.widgets.iter().any(|(id, _)| id == &key),
            "Expand all must keep backup {number} open at the same time");
    }
    println!("MULTIPLE_BACKUPS_EXPAND_ALL_PASS");
    checked(&mut h, "ui.clickWidget", json!({"id": "fujixProfiles:collapseAll"}));
    assert!(!h.app.widgets.iter().any(|(id, _)| id == "fujixProfileGroup:source-backup-1-slot-1"),
        "Collapse all must close backup tiles");
    println!("BACKUPS_COLLAPSE_ALL_PASS");

    checked(&mut h, "ui.clickWidget", json!({"id": "fujixProfileGroup:film-simulations"}));
    checked(&mut h, "ui.hoverWidget", json!({"id": "fujixProfileSimulation:simulation:Velvia/Vivid"}));
    let velvia = h.app.hover_preview.as_ref().expect("Velvia hover preview");
    assert_eq!(velvia.settings.profile.id, "lc.vivid");
    assert_eq!(h.app.session.commits(), commits);
    println!("VELVIA_HOVER_PASS {}", velvia.label);
    println!("FUJIX_HEADLESS_SMOKE_PASS");
}
