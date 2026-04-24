use aftereffects_aep_parser_rs::{
    BitsPerChannel, FootageType, ItemType, LayerFrameBlendMode, LayerQualityLevel,
    LayerSamplingMode, PropertyType, parse_project,
};

fn fixture(name: &str) -> &'static [u8] {
    match name {
        "BPC-8.aep" => include_bytes!("../../aftereffects-aep-parser/data/BPC-8.aep"),
        "BPC-16.aep" => include_bytes!("../../aftereffects-aep-parser/data/BPC-16.aep"),
        "BPC-32.aep" => include_bytes!("../../aftereffects-aep-parser/data/BPC-32.aep"),
        "ExEn-es.aep" => include_bytes!("../../aftereffects-aep-parser/data/ExEn-es.aep"),
        "ExEn-js.aep" => include_bytes!("../../aftereffects-aep-parser/data/ExEn-js.aep"),
        "Item-01.aep" => include_bytes!("../../aftereffects-aep-parser/data/Item-01.aep"),
        "Layer-01.aep" => include_bytes!("../../aftereffects-aep-parser/data/Layer-01.aep"),
        "Property-01.aep" => include_bytes!("../../aftereffects-aep-parser/data/Property-01.aep"),
        _ => unreachable!("unknown fixture"),
    }
}

fn assert_float(actual: f64, expected: f64) {
    assert!(
        (actual - expected).abs() < 0.000_000_001,
        "expected {actual} to equal {expected}",
    );
}

#[test]
fn parses_expression_engine() {
    let js_project = parse_project(fixture("ExEn-js.aep")).unwrap();
    assert_eq!(
        js_project.expression_engine.as_deref(),
        Some("javascript-1.0")
    );

    let es_project = parse_project(fixture("ExEn-es.aep")).unwrap();
    assert_eq!(
        es_project.expression_engine.as_deref(),
        Some("extendscript")
    );
}

#[test]
fn parses_bit_depth() {
    let bpc32_project = parse_project(fixture("BPC-32.aep")).unwrap();
    assert_eq!(bpc32_project.depth, BitsPerChannel::Bpc32);

    let bpc16_project = parse_project(fixture("BPC-16.aep")).unwrap();
    assert_eq!(bpc16_project.depth, BitsPerChannel::Bpc16);

    let bpc8_project = parse_project(fixture("BPC-8.aep")).unwrap();
    assert_eq!(bpc8_project.depth, BitsPerChannel::Bpc8);
}

#[test]
fn parses_item_metadata() {
    let project = parse_project(fixture("Item-01.aep")).unwrap();
    assert_eq!(project.root_folder.id, 0);

    let folder01 = &project.root_folder.folder_contents[0];
    assert_eq!(folder01.name, "Folder 01");
    assert_eq!(folder01.id, 46);
    assert_eq!(folder01.item_type, ItemType::Folder);

    let folder02 = &project.root_folder.folder_contents[1];
    assert_eq!(folder02.name, "Folder 02");
    assert_eq!(folder02.id, 47);
    assert_eq!(folder02.item_type, ItemType::Folder);

    let comp01 = &folder01.folder_contents[0];
    assert_eq!(comp01.name, "Comp 01");
    assert_eq!(comp01.id, 48);
    assert_eq!(comp01.item_type, ItemType::Composition);
    assert_eq!(comp01.footage_dimensions, [351, 856]);
    assert_float(comp01.footage_framerate, 21.0);
    assert_float(comp01.footage_seconds, 31.0);
    assert_eq!(comp01.background_color, Some([15, 75, 82]));

    let comp02 = &folder02.folder_contents[0];
    assert_eq!(comp02.name, "Comp 02");
    assert_eq!(comp02.id, 59);
    assert_eq!(comp02.item_type, ItemType::Composition);
    assert_eq!(comp02.footage_dimensions, [452, 639]);
    assert_float(comp02.footage_framerate, 29.97);
    assert_float(comp02.footage_seconds, 71.338_004_671_338);
    assert_eq!(comp02.background_color, Some([145, 206, 85]));

    let footage_folder = &project.root_folder.folder_contents[2];
    assert_eq!(footage_folder.name, "Footage");
    assert_eq!(footage_folder.id, 70);

    let placeholder_footage = &footage_folder.folder_contents[2];
    assert_eq!(placeholder_footage.name, "Missing Footage");
    assert_eq!(placeholder_footage.id, 71);
    assert_eq!(placeholder_footage.item_type, ItemType::Footage);
    assert_float(placeholder_footage.footage_seconds, 127.0);
    assert_float(
        placeholder_footage.footage_framerate,
        123.456_695_556_640_62,
    );
    assert_eq!(placeholder_footage.footage_dimensions, [1234, 5678]);

    let red_solid = &footage_folder.folder_contents[3];
    assert_eq!(red_solid.footage_type, Some(FootageType::Solid));
    assert_eq!(red_solid.name, "Red Solid 1");
}

#[test]
fn parses_layer_metadata() {
    let project = parse_project(fixture("Layer-01.aep")).unwrap();
    let comp01 = &project.root_folder.folder_contents[0];

    assert!(comp01.composition_layers[0].collapse_transform_enabled);
    assert!(comp01.composition_layers[1].effects_enabled);
    assert!(comp01.composition_layers[2].motion_blur_enabled);
    assert!(comp01.composition_layers[4].shy_enabled);
    assert!(comp01.composition_layers[5].adjustment_layer_enabled);
    assert!(comp01.composition_layers[6].three_d_enabled);
    assert!(comp01.composition_layers[7].solo_enabled);
    assert!(comp01.composition_layers[8].guide_enabled);
    assert_eq!(
        comp01.composition_layers[9].frame_blend_mode,
        LayerFrameBlendMode::PixelMotion
    );
    assert_eq!(
        comp01.composition_layers[10].frame_blend_mode,
        LayerFrameBlendMode::FrameMix
    );
    assert_eq!(
        comp01.composition_layers[11].quality,
        LayerQualityLevel::Wireframe
    );
    assert_eq!(
        comp01.composition_layers[12].quality,
        LayerQualityLevel::Draft
    );
    assert_eq!(
        comp01.composition_layers[13].quality,
        LayerQualityLevel::Best
    );
    assert_eq!(
        comp01.composition_layers[14].sampling_mode,
        LayerSamplingMode::Bilinear
    );
    assert_eq!(
        comp01.composition_layers[15].sampling_mode,
        LayerSamplingMode::Bicubic
    );
    assert!(comp01.composition_layers[16].video_enabled);
    assert!(comp01.composition_layers[16].audio_enabled);
}

#[test]
fn parses_properties() {
    let project = parse_project(fixture("Property-01.aep")).unwrap();
    let comp01 = &project.root_folder.folder_contents[0];

    let text_layer = &comp01.composition_layers[1];
    assert!(text_layer.effects.is_empty());
    assert!(text_layer.text.is_some());

    let expression_controls_layer = &comp01.composition_layers[0];
    assert_eq!(expression_controls_layer.effects.len(), 7);
    assert!(expression_controls_layer.text.is_none());

    let checkbox_effect = &expression_controls_layer.effects[0];
    assert_eq!(checkbox_effect.index, 1);
    assert_eq!(checkbox_effect.match_name, "ADBE Checkbox Control");
    assert_eq!(checkbox_effect.name, "Checkbox Control");
    assert_eq!(checkbox_effect.property_type, PropertyType::Group);
    assert_eq!(checkbox_effect.properties.len(), 1);
    assert_eq!(checkbox_effect.properties[0].index, 1);
    assert_eq!(
        checkbox_effect.properties[0].match_name,
        "ADBE Checkbox Control-0001"
    );
    assert_eq!(checkbox_effect.properties[0].name, "Checkbox");
    assert_eq!(
        checkbox_effect.properties[0].property_type,
        PropertyType::Boolean
    );
    assert!(checkbox_effect.properties[0].properties.is_empty());
    assert!(checkbox_effect.properties[0].select_options.is_empty());

    let slider_effect = &expression_controls_layer.effects[1];
    assert_eq!(slider_effect.index, 2);
    assert_eq!(slider_effect.match_name, "ADBE Slider Control");
    assert_eq!(slider_effect.name, "Slider Control");
    assert_eq!(slider_effect.property_type, PropertyType::Group);
    assert_eq!(slider_effect.properties.len(), 1);
    assert_eq!(slider_effect.properties[0].index, 1);
    assert_eq!(
        slider_effect.properties[0].match_name,
        "ADBE Slider Control-0001"
    );
    assert_eq!(slider_effect.properties[0].name, "Slider");
    assert_eq!(
        slider_effect.properties[0].property_type,
        PropertyType::OneD
    );
    assert!(slider_effect.properties[0].properties.is_empty());
    assert!(slider_effect.properties[0].select_options.is_empty());

    let point_effect = &expression_controls_layer.effects[2];
    assert_eq!(point_effect.index, 3);
    assert_eq!(point_effect.match_name, "ADBE Point Control");
    assert_eq!(point_effect.name, "Point Control");
    assert_eq!(point_effect.property_type, PropertyType::Group);
    assert_eq!(point_effect.properties.len(), 1);
    assert_eq!(point_effect.properties[0].index, 1);
    assert_eq!(
        point_effect.properties[0].match_name,
        "ADBE Point Control-0001"
    );
    assert_eq!(point_effect.properties[0].name, "Point");
    assert_eq!(point_effect.properties[0].property_type, PropertyType::TwoD);
    assert!(point_effect.properties[0].properties.is_empty());
    assert!(point_effect.properties[0].select_options.is_empty());

    let three_d_point_effect = &expression_controls_layer.effects[3];
    assert_eq!(three_d_point_effect.index, 4);
    assert_eq!(three_d_point_effect.match_name, "ADBE Point3D Control");
    assert_eq!(three_d_point_effect.name, "3D Point Control");
    assert_eq!(three_d_point_effect.property_type, PropertyType::Group);
    assert_eq!(three_d_point_effect.properties.len(), 1);
    assert_eq!(three_d_point_effect.properties[0].index, 1);
    assert_eq!(
        three_d_point_effect.properties[0].match_name,
        "ADBE Point3D Control-0001"
    );
    assert_eq!(three_d_point_effect.properties[0].name, "3D Point");
    assert_eq!(
        three_d_point_effect.properties[0].property_type,
        PropertyType::ThreeD
    );
    assert!(three_d_point_effect.properties[0].properties.is_empty());
    assert!(three_d_point_effect.properties[0].select_options.is_empty());

    let color_effect = &expression_controls_layer.effects[4];
    assert_eq!(color_effect.index, 5);
    assert_eq!(color_effect.match_name, "ADBE Color Control");
    assert_eq!(color_effect.name, "Color Control");
    assert_eq!(color_effect.property_type, PropertyType::Group);
    assert_eq!(color_effect.properties.len(), 1);
    assert_eq!(color_effect.properties[0].index, 1);
    assert_eq!(
        color_effect.properties[0].match_name,
        "ADBE Color Control-0001"
    );
    assert_eq!(color_effect.properties[0].name, "Color");
    assert_eq!(
        color_effect.properties[0].property_type,
        PropertyType::Color
    );
    assert!(color_effect.properties[0].properties.is_empty());
    assert!(color_effect.properties[0].select_options.is_empty());

    let angle_effect = &expression_controls_layer.effects[5];
    assert_eq!(angle_effect.index, 6);
    assert_eq!(angle_effect.match_name, "ADBE Angle Control");
    assert_eq!(angle_effect.name, "Angle Control");
    assert_eq!(
        angle_effect.label.as_deref(),
        Some("Custom Angle Control Label")
    );
    assert_eq!(angle_effect.property_type, PropertyType::Group);
    assert_eq!(angle_effect.properties.len(), 1);
    assert_eq!(angle_effect.properties[0].index, 1);
    assert_eq!(
        angle_effect.properties[0].match_name,
        "ADBE Angle Control-0001"
    );
    assert_eq!(angle_effect.properties[0].name, "Angle");
    assert_eq!(
        angle_effect.properties[0].property_type,
        PropertyType::Angle
    );
    assert!(angle_effect.properties[0].properties.is_empty());
    assert!(angle_effect.properties[0].select_options.is_empty());

    let layer_select_effect = &expression_controls_layer.effects[6];
    assert_eq!(layer_select_effect.index, 7);
    assert_eq!(layer_select_effect.match_name, "ADBE Layer Control");
    assert_eq!(layer_select_effect.name, "Layer Control");
    assert_eq!(layer_select_effect.property_type, PropertyType::Group);
    assert_eq!(layer_select_effect.properties.len(), 1);
    assert_eq!(layer_select_effect.properties[0].index, 1);
    assert_eq!(
        layer_select_effect.properties[0].match_name,
        "ADBE Layer Control-0001"
    );
    assert_eq!(layer_select_effect.properties[0].name, "Layer");
    assert_eq!(
        layer_select_effect.properties[0].property_type,
        PropertyType::LayerSelect
    );
    assert!(layer_select_effect.properties[0].properties.is_empty());
    assert!(layer_select_effect.properties[0].select_options.is_empty());
}
