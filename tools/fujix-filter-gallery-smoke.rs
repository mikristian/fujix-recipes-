//! Headless native FujiX Edit → Plug-in Filters gallery test. Uses the app's
//! real renderer and camera-safe in-memory demo. Caller supplies a private
//! temporary plugin folder with copies of the installed WASM filter modules.
use lcc_ui_egui::{headless::Headless, LccApp, Services};
use lcc_engine::Session;
use serde_json::{json, Value};
use std::time::Duration;

const TIMEOUT: Duration = Duration::from_secs(30);
fn ask(h: &mut Headless, method: &str, args: Value) -> Value {
    let r=h.request(method,args,TIMEOUT);
    assert_eq!(r["ok"],true,"{method} failed: {r}");
    for _ in 0..3 {h.step();}
    r
}
fn widget(h: &Headless, id: &str) -> egui_stub::Rect {
    // Cannot type egui's Rect here without a direct rlib; copy just the
    // dimensions needed by tests into a tiny self-contained struct.
    let (_,r)=h.app.widgets.iter().find(|(key,_)|key==id)
        .unwrap_or_else(||panic!("missing widget: {id}; observed: {:?}",h.app.widgets.iter()
            .filter(|(name,_)|name.contains("pluginFilterGallery")).map(|(name,_)|name.as_str()).take(20).collect::<Vec<_>>()));
    egui_stub::Rect{left:r.left(),right:r.right(),top:r.top(),bottom:r.bottom()}
}
mod egui_stub {pub struct Rect{pub left:f32,pub right:f32,pub top:f32,pub bottom:f32}}

fn main() {
    let config=std::env::var("CHROMAFORGE_CONFIG_DIR").unwrap();
    assert!(config.contains("fujix-filter-gallery-test-"),"never run a UI acceptance test in a real user profile");
    let app=LccApp::new(Session::with_demo(),Services{png:None,..Default::default()});
    let mut h=Headless::new(app,[1420.0,1080.0],1.0);
    ask(&mut h,"ui.set",json!({"view":"detail"}));
    h.app.ui.solo_section("pluginFilters");
    for _ in 0..6 {h.step();}

    let list=ask(&mut h,"engine.execute",json!({"command":"plugin.list"}));
    let count=list["result"]["plugins"].as_array().unwrap().iter()
        .filter(|v|v["kind"]=="filter").count();
    assert!(count>=26,"expected original creative and procedural overlay filters, got {count}");
    // Plug-in Filters is the final Develop section, after many other section
    // headers. The gallery is deliberately inside that section and must be
    // scrolled into view before the pointer can meaningfully hover a card.
    ask(&mut h,"ui.move",json!({"x":1320,"y":620}));
    ask(&mut h,"ui.scroll",json!({"dy":-600}));
    for _ in 0..5 {h.step();}
    let first="pluginFilterGallery:tile:com.fujix.creative.bleach-bypass";
    let second="pluginFilterGallery:tile:com.fujix.creative.blue-hour";
    let a=widget(&h,first);let b=widget(&h,second);
    println!("TILE_Y_AFTER_RIGHT_PANEL_SCROLL {} {}",a.top,a.bottom);
    assert!(a.right-a.left>75.0 && a.bottom-a.top>95.0,"tiles should match Basic gallery size");
    assert!((a.top-b.top).abs()<1.0&&b.left>a.right,"two tiles must share a row: first {},{}→{},{} second {},{}→{},{}",a.left,a.top,a.right,a.bottom,b.left,b.top,b.right,b.bottom);
    assert!(!h.app.widgets.iter().any(|(name,_)|name=="pluginFilterAddMenu"),
        "dropdown must be replaced by visual gallery");
    println!("FUJIX_FILTER_GALLERY_2_COLUMN_PASS {}x{}",a.right-a.left,a.bottom-a.top);

    let photo=h.app.session.active().unwrap();
    let before=h.app.session.develop_of(photo).unwrap();
    let commits=h.app.session.commits();
    let ready=h.step_until(Duration::from_secs(25),|h|h.app.renderer.variant_textures()>=2);
    println!("FUJIX_GALLERY_RENDERED_THUMBNAILS_READY {} COUNT {}",ready,h.app.renderer.variant_textures());
    assert!(ready,"real 256px previews must render asynchronously");
    let painted=h.paint();
    let mut ppm=format!("P6\n{} {}\n255\n",painted.size[0],painted.size[1]).into_bytes();
    for pixel in &painted.pixels {ppm.extend_from_slice(&pixel.to_array()[..3]);}
    std::fs::write("data/fujix-filter-gallery-check.ppm",ppm).unwrap();

    ask(&mut h,"ui.hoverWidget",json!({"id":first}));
    let hover=h.app.hover_preview.as_ref().expect("hover shows transient preview");
    assert!(hover.label.contains("Bleach Bypass"));
    assert_eq!(hover.settings.plugin_filters.len(),before.plugin_filters.len()+1);
    assert_eq!(h.app.session.develop_of(photo).as_deref(),Some(before.as_ref()));
    assert_eq!(h.app.session.commits(),commits);
    println!("FUJIX_GALLERY_HOVER_NO_MUTATION_PASS");
    ask(&mut h,"ui.move",json!({"x":4,"y":500}));
    assert!(h.app.hover_preview.is_none());
    println!("FUJIX_GALLERY_HOVER_LEAVE_RESTORE_PASS");

    ask(&mut h,"ui.clickWidget",json!({"id":first}));
    let stack=ask(&mut h,"engine.execute",json!({"command":"develop.pluginFilter.list"}));
    assert_eq!(stack["result"]["filters"].as_array().unwrap().len(),1);
    assert_eq!(stack["result"]["filters"][0]["plugin"],"com.fujix.creative.bleach-bypass");
    ask(&mut h,"engine.execute",json!({"command":"edit.undo"}));
    assert_eq!(h.app.session.develop_of(photo).as_deref(),Some(before.as_ref()));
    let commits_after_undo=h.app.session.commits();
    println!("FUJIX_GALLERY_CLICK_APPLY_UNDO_PASS");

    ask(&mut h,"ui.clickWidget",json!({"id":"pluginFilterGallery:category:Camera"}));
    // Camcorder is on the first row; CRT has its own card on the following
    // row and remains discoverable when the gallery is scrolled.
    let camera="pluginFilterGallery:tile:com.fujix.overlay.camcorder-hud";
    let crt="pluginFilterGallery:tile:com.fujix.overlay.crt-phosphor";
    assert!(widget(&h,crt).right>0.0,"CRT TV must have its own grid card");
    let camera_tile=widget(&h,camera);
    println!("CAMERA_TILE_Y {} {}",camera_tile.top,camera_tile.bottom);
    assert!(camera_tile.right-camera_tile.left>75.0);
    assert!(!h.app.widgets.iter().any(|(name,_)|name==first),"category filters must hide unrelated looks");
    // A category change can place its first tile below the Edit panel's
    // bottom edge: scroll the right pane so the pointer hits the actual tile.
    if camera_tile.top>930.0 || camera_tile.bottom>1030.0 {
        ask(&mut h,"ui.move",json!({"x":1290,"y":690}));
        ask(&mut h,"ui.scroll",json!({"dy":-260}));
        println!("CAMERA_TILE_AFTER_SCROLL {}",widget(&h,camera).top);
    }
    ask(&mut h,"ui.hoverWidget",json!({"id":camera}));
    assert!(h.app.hover_preview.as_ref().is_some_and(|v|v.label.contains("Camcorder")));
    assert_eq!(h.app.session.commits(),commits_after_undo,"camera hover must never commit a new edit");
    println!("FUJIX_GALLERY_CAMERA_OVERLAY_CATEGORY_PASS");

    ask(&mut h,"ui.clickWidget",json!({"id":"pluginFilterGallery:category:Lo-fi"}));
    assert!(h.app.widgets.iter().any(|(name,_)|
        name=="pluginFilterGallery:tile:com.fujix.retro.2013-phone-camera"),
        "the new 2013-era rough smartphone filter must be discoverable in Lo-fi");
    assert!(!h.app.widgets.iter().any(|(name,_)|name==first),
        "Lo-fi category should not show unrelated Film filters");
    println!("FUJIX_GALLERY_LOFI_CATEGORY_PASS");

    // Regression: the old implementation nested a fixed 480pt ScrollArea in
    // the scrolling Develop sidebar. This caused a false bottom and required
    // a second scroll gesture *inside* the gallery. With a single parent
    // scrollbar, scrolling anywhere over the right Edit panel reaches the
    // last card while moving the first card offscreen together with it.
    ask(&mut h,"ui.clickWidget",json!({"id":"pluginFilterGallery:category:All"}));
    let final_id=h.app.widgets.iter()
        .filter(|(name,_)|name.starts_with("pluginFilterGallery:tile:"))
        .max_by(|(_,a),(_,b)|a.bottom().total_cmp(&b.bottom()))
        .map(|(name,_)|name.clone()).expect("gallery includes a final tile");
    let start_first=widget(&h,first);
    let start_last=widget(&h,&final_id);
    assert!(start_last.top>start_first.bottom+700.0,"gallery should extend beyond the initial viewport");
    let mut end_reached=false;
    for _ in 0..18 {
        ask(&mut h,"ui.move",json!({"x":1290,"y":700}));
        ask(&mut h,"ui.scroll",json!({"dy":-700}));
        let final_rect=widget(&h,&final_id);
        if final_rect.top>280.0 && final_rect.bottom<1035.0 {end_reached=true;break;}
    }
    let end_first=widget(&h,first);
    assert!(end_reached,"a single outer-scroll series must reach the final VHS card");
    assert!(end_first.top<start_first.top-700.0,
        "the gallery's first and final cards must move on the *same* outer scrollbar");
    let final_rect=widget(&h,&final_id);
    println!("SINGLE_PARENT_SCROLL_LAST_TILE {} {} id={} first moved {}pt",final_rect.top,final_rect.bottom,final_id,start_first.top-end_first.top);
    // Headless wheel input animates smooth deceleration; allow it to settle
    // before hovering the last item of a long gallery.
    for _ in 0..18 {h.step();}
    let now=widget(&h,&final_id);
    assert!(now.bottom<1060.0,"final tile must remain visible after scrolling settles");
    ask(&mut h,"ui.hoverWidget",json!({"id":final_id}));
    assert!(h.app.hover_preview.as_ref().is_some_and(|v|v.label.starts_with("Plug-in Filter:")),
        "last visible gallery row must still provide a non-destructive hover preview");
    assert_eq!(h.app.session.commits(),commits_after_undo);
    println!("FUJIX_GALLERY_SINGLE_PARENT_SCROLL_TO_LAST_FILTER_PASS");
    println!("FUJIX_FILTER_GALLERY_NATIVE_UI_SMOKE_PASS");
}
