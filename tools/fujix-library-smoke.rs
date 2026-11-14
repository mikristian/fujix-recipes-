//! Standalone native Chromaforge library workflow acceptance test. Run with a
//! dedicated temporary HOME so user recipes are never touched by testing.
//! Compile against the app's release-matching existing Cargo rlibs, as in
//! tools/fujix-hover-smoke.rs (full Cargo tests need unavailable dev crates).
use lcc_ui_egui::{headless::Headless, LccApp, Services};
use lcc_engine::Session;
use serde_json::{json, Value};
use std::time::Duration;

const T: Duration = Duration::from_secs(30);
fn call(h: &mut Headless, method: &str, value: Value) {
    let result = h.request(method, value, T);
    assert_eq!(result["ok"], true, "{method} failed: {result}");
    for _ in 0..4 { h.step(); }
}
fn click(h: &mut Headless, id: &str) { call(h, "ui.clickWidget", json!({"id":id})); }
fn text(h: &mut Headless, value: &str) { call(h, "ui.text", json!({"text":value})); }
fn read_drafts() -> Vec<Value> {
    let path = std::path::PathBuf::from(std::env::var_os("HOME").expect("isolated HOME"))
        .join("Library/Application Support/FujiX Chromaforge/recipe-drafts.json");
    serde_json::from_slice(&std::fs::read(path).expect("draft library saved")).unwrap()
}
fn bank(drafts: &[Value], number: u32) -> Vec<&Value> {
    drafts.iter().filter(|d| d["local_slot"]["backup"].as_u64() == Some(number.into())).collect()
}

fn main() {
    let home = std::env::var("HOME").unwrap();
    assert!(home.contains("fujix-library-test-"), "refuse to write test data to a real user home");
    let mut h = Headless::new(LccApp::new(Session::with_demo(), Services { png: None, ..Default::default() }), [1400.0, 1150.0], 1.0);
    call(&mut h, "ui.set", json!({"view": "detail"}));
    call(&mut h, "engine.execute", json!({"command": "panel.profiles"}));

    // Named backup with seven persisted records and no original-catalog edits.
    click(&mut h, "fujixBackup:newName");
    text(&mut h, "Portrait Bank");
    click(&mut h, "fujixBackup:create");
    let drafts = read_drafts();
    assert_eq!(drafts.len(), 7, "seven editable slots created atomically");
    assert!(bank(&drafts, 1).iter().all(|d| d["backup_label"] == "Portrait Bank"));
    println!("CREATE_NAMED_BACKUP_PASS");

    // The clone gets its own seven draft identities and remains editable.
    click(&mut h, "fujixBackup:1:duplicate");
    let drafts = read_drafts();
    assert_eq!(drafts.len(), 14);
    assert_eq!(bank(&drafts, 2).len(), 7);
    assert!(bank(&drafts, 2).iter().all(|d| d["backup_label"] == "Portrait Bank (Copy)"));
    println!("DUPLICATE_7_SLOTS_PASS");

    // The portable JSON contains exactly C1-C7 but no physical camera write.
    click(&mut h, "fujixBackup:1:export");
    let exports = std::path::PathBuf::from(&home).join("Documents/FujiX Chromaforge/Backups");
    let exported = std::fs::read_dir(exports).unwrap().find_map(|r| r.ok().map(|r| r.path())).expect("backup export file");
    let package: Value = serde_json::from_slice(&std::fs::read(&exported).unwrap()).unwrap();
    assert_eq!(package["kind"], "fujix-chromaforge-offline-backup");
    assert_eq!(package["slots"].as_array().unwrap().len(), 7);
    println!("EXPORT_JSON_PASS {}", exported.display());

    // Rename all seven records with a single transaction.
    click(&mut h, "fujixBackup:1:rename");
    click(&mut h, "fujixBackup:1:renameValue");
    call(&mut h, "ui.key", json!({"key":"a","cmd":true}));
    text(&mut h, "Winter Collection");
    click(&mut h, "fujixBackup:1:saveName");
    let drafts = read_drafts();
    assert!(bank(&drafts, 1).iter().all(|d| d["backup_label"] == "Winter Collection"));
    println!("RENAME_ALL_SLOTS_PASS");

    // Delete requires a separate click and affects only the selected bank.
    click(&mut h, "fujixBackup:1:delete");
    let before = read_drafts();
    assert_eq!(before.len(), 14, "first click must not delete");
    click(&mut h, "fujixBackup:1:confirmDelete");
    let drafts = read_drafts();
    assert_eq!(drafts.len(), 7);
    assert_eq!(bank(&drafts, 2).len(), 7);
    println!("CONFIRMED_DELETE_ONLY_LOCAL_PASS");

    // Portable JSON import always creates a *new* local bank, not restoring
    // over any existing bank or changing physical X100VI camera settings.
    click(&mut h, "fujixBackup:importPath");
    text(&mut h, exported.to_str().unwrap());
    click(&mut h, "fujixBackup:import");
    let drafts = read_drafts();
    assert_eq!(drafts.len(), 14);
    assert_eq!(bank(&drafts, 3).len(), 7);
    assert!(bank(&drafts, 3).iter().all(|d| d["backup_label"] == "Portrait Bank"));
    println!("IMPORT_NEW_BACKUP_PASS");

    // Open an original source recipe and place its parameter values into
    // another *local* backup C1. No original entry or physical camera changes.
    let mut editor = Headless::new(LccApp::new(Session::with_demo(), Services { png: None, ..Default::default() }), [1400.0, 1150.0], 1.0);
    call(&mut editor, "ui.set", json!({"view":"detail"}));
    call(&mut editor, "engine.execute", json!({"command":"panel.profiles"}));
    click(&mut editor, "fujixProfileGroup:original-backups");
    click(&mut editor, "fujixProfileGroup:source-backup-1");
    click(&mut editor, "fujixProfileGroup:source-backup-1-slot-2");
    let before = read_drafts();
    click(&mut editor, "fujixRecipe:copyToSlot");
    let after = read_drafts();
    assert_eq!(before.len(), after.len(), "slot copy overwrites its own placeholder, not appends extra slots");
    assert_eq!(bank(&after, 2)[0]["name"], "Cinestill 800t");
    assert_eq!(bank(&after, 2)[0]["camera"]["values"]["film_simulation"], "Eterna");
    println!("COPY_ORIGINAL_TO_OFFLINE_C1_PASS");

    // Resetting a populated slot uses a second explicit confirmation. The
    // slot still exists and becomes editable again after the reset.
    click(&mut editor, "fujixRecipe:delete");
    assert_eq!(bank(&read_drafts(), 2)[0]["name"], "Cinestill 800t");
    click(&mut editor, "fujixRecipe:confirmDelete");
    let cleared = read_drafts();
    assert_eq!(bank(&cleared, 2).len(), 7);
    assert_eq!(bank(&cleared, 2)[0]["name"], "Untitled C1");
    assert!(bank(&cleared, 2)[0]["camera"]["values"].as_object().unwrap().is_empty());
    println!("CONFIRMED_LOCAL_SLOT_RESET_PASS");

    // FilmKit import maps a portable 20-simulation preset into a *local*
    // editable camera recipe and never updates any original source record.
    let fixture = std::path::PathBuf::from(&home).join("cinema.filmkit");
    std::fs::write(&fixture, r#"{"name":"FilmKit Cinema","values":{"filmSimulation":16,"dynamicRange":3,"grainEffect":259,"colorChrome":2,"whiteBalance":32775,"wbColorTemp":6300,"wbShiftR":3,"wbShiftB":-5,"highlightTone":-1}}"#).unwrap();
    let mut filmkit_ui = Headless::new(LccApp::new(Session::with_demo(), Services { png: None, ..Default::default() }), [1400.0, 1150.0], 1.0);
    call(&mut filmkit_ui, "ui.set", json!({"view":"detail"}));
    call(&mut filmkit_ui, "engine.execute", json!({"command":"panel.profiles"}));
    click(&mut filmkit_ui, "fujixProfileGroup:my-recipes");
    let widget_names = filmkit_ui.app.widgets.iter().filter(|(id,_)| id.contains("Filmkit") || id.contains("my-recipes"))
        .map(|(id, _)| id.clone()).collect::<Vec<_>>();
    println!("FILMKIT_CONTROLS_PRESENT {widget_names:?}");
    click(&mut filmkit_ui, "fujixFilmkit:importPath");
    text(&mut filmkit_ui, fixture.to_str().unwrap());
    click(&mut filmkit_ui, "fujixFilmkit:import");
    let all = read_drafts();
    assert_eq!(all.len(), 15);
    let imported = all.iter().find(|d| d["name"] == "FilmKit Cinema").expect("imported editable recipe");
    assert_eq!(imported["camera"]["values"]["film_simulation"], "Eterna");
    assert_eq!(imported["camera"]["values"]["grain_size"], "Large");
    assert_eq!(imported["camera"]["values"]["white_balance_kelvin"], "6300K");
    assert!(imported["local_slot"].is_null(), "FilmKit imports must not overwrite C1–C7 slots");
    println!("FILMKIT_IMPORT_EDITABLE_RECIPE_PASS");
    // The same selected look can be exported back into a FilmKit-compatible
    // portable format without a camera transaction or a new local draft.
    click(&mut filmkit_ui, "fujixRecipe:exportFilmkit");
    let export_dir = std::path::PathBuf::from(&home)
        .join("Documents/FujiX Chromaforge/FilmKit Presets");
    let converted = std::fs::read_dir(export_dir).expect("FilmKit export directory")
        .find_map(|entry| entry.ok().map(|entry| entry.path()))
        .expect("exported FilmKit preset");
    let packet: Value = serde_json::from_slice(&std::fs::read(&converted).unwrap()).unwrap();
    assert_eq!(packet["filmkit"], 1);
    assert_eq!(packet["name"], "FilmKit Cinema");
    assert_eq!(packet["values"]["filmSimulation"], 16);
    assert_eq!(packet["values"]["grainEffect"], 259);
    assert_eq!(packet["values"]["wbColorTemp"], 6300);
    assert_eq!(read_drafts().len(), 15, "FilmKit export must not change the local recipe library");
    println!("FILMKIT_EXPORT_ROUNDTRIP_PASS");
    if let Ok(raf) = std::env::var("FUJIX_TEST_RAF") {
        // Validate the real native camera-panel source-audit interaction,
        // with isolated HOME and a read-only user-supplied sample RAF. This
        // must NOT imply physical X100VI rendering, slot scan or restore.
        call(&mut filmkit_ui, "engine.execute", json!({"command":"panel.fujiCamera"}));
        click(&mut filmkit_ui, "fujixPreflight:rafPath");
        text(&mut filmkit_ui, &raf);
        click(&mut filmkit_ui, "fujixPreflight:verifyRAF");
        let output = std::path::PathBuf::from(&home)
            .join("Documents/FujiX Chromaforge/Camera Validation");
        let saved = filmkit_ui.step_until(Duration::from_secs(40), |_| {
            std::fs::read_dir(&output).ok().is_some_and(|mut entries| entries.next().is_some())
        });
        assert!(saved, "native FujiX camera-panel RAF preflight must persist an audit");
        let path = std::fs::read_dir(output).unwrap()
            .find_map(|entry| entry.ok().map(|entry| entry.path())).unwrap();
        let audit: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
        assert_eq!(audit["kind"], "fujix-raf-source-audit");
        assert_eq!(audit["repeated_hash_agrees"], true);
        assert_eq!(audit["camera_verified"], false);
        assert_eq!(audit["physical_c1_c7_backed_up"], false);
        assert_eq!(audit["camera_rendered_jpeg_verified"], false);
        assert_eq!(audit["physical_slot_restore_verified"], false);
        println!("NATIVE_RAF_PREFLIGHT_UI_PASS {}", audit["raf_sha256"]);
    }
    println!("FUJIX_LIBRARY_SMOKE_PASS");
}
