use std::collections::HashMap;

use crate::error::{AepError, Result};
use crate::model::{
    BitsPerChannel, FootageType, Item, ItemType, Layer, LayerFrameBlendMode, LayerQualityLevel,
    LayerSamplingMode, Project, Property, PropertyType,
};
use crate::rifx::{self, Block, BlockData, List};

pub fn parse_project(bytes: &[u8]) -> Result<Project> {
    let root = rifx::from_bytes(bytes)?;

    let expression_engine = root
        .sublist("ExEn")
        .and_then(|list| list.blocks.first())
        .map(Block::to_string_lossy)
        .transpose()?;

    let nhed = root.require_by_type("nhed")?.as_bytes()?;
    let depth = BitsPerChannel::from(read_u8(nhed, 15, "nhed")?);

    let mut root_folder = parse_item(root.require_sublist("Fold")?)?;
    let names = item_name_map(&root_folder);
    fill_unnamed_layers(&mut root_folder, &names);

    let mut items = HashMap::new();
    collect_items(&root_folder, &mut items);

    Ok(Project {
        expression_engine,
        depth,
        root_folder,
        items,
    })
}

fn parse_item(item_head: &List) -> Result<Item> {
    let mut item = if item_head.identifier == "Fold" {
        Item::root_folder()
    } else {
        let name = item_head.require_by_type("Utf8")?.to_string_lossy()?;
        let idta = item_head.require_by_type("idta")?.as_bytes()?;
        let item_type = match read_u16(idta, 0, "idta")? {
            0x01 => ItemType::Folder,
            0x04 => ItemType::Composition,
            0x07 => ItemType::Footage,
            value => ItemType::Unknown(value),
        };

        Item {
            name,
            id: read_u32(idta, 16, "idta")?,
            item_type,
            folder_contents: Vec::new(),
            footage_dimensions: [0, 0],
            footage_framerate: 0.0,
            footage_seconds: 0.0,
            footage_type: None,
            background_color: None,
            composition_layers: Vec::new(),
        }
    };

    match item.item_type {
        ItemType::Folder => {
            for child in item_head.sublists("Item") {
                item.folder_contents.push(parse_item(child)?);
            }

            let sfdr = item_head.merged_sublist("Sfdr");
            for child in sfdr.sublists("Item") {
                item.folder_contents.push(parse_item(child)?);
            }
        }
        ItemType::Footage => parse_footage(item_head, &mut item)?,
        ItemType::Composition => parse_composition(item_head, &mut item)?,
        ItemType::Unknown(_) => {}
    }

    Ok(item)
}

fn parse_footage(item_head: &List, item: &mut Item) -> Result<()> {
    let pin = item_head.require_sublist("Pin ")?;
    let sspc = pin.require_by_type("sspc")?.as_bytes()?;
    let width = read_u32(sspc, 30, "sspc")?;
    let height = read_u32(sspc, 34, "sspc")?;
    let seconds_dividend = read_u32(sspc, 38, "sspc")?;
    let seconds_divisor = read_u32(sspc, 42, "sspc")?;
    let framerate = read_u32(sspc, 56, "sspc")?;
    let framerate_dividend = read_u16(sspc, 60, "sspc")?;

    item.footage_dimensions = [width as u16, height as u16];
    item.footage_framerate = framerate as f64 + (framerate_dividend as f64 / (1u32 << 16) as f64);
    item.footage_seconds = seconds_dividend as f64 / seconds_divisor as f64;

    let opti = pin.require_by_type("opti")?.as_bytes()?;
    let footage_type = FootageType::from(read_u16(opti, 4, "opti")?);
    item.footage_type = Some(footage_type);

    match footage_type {
        FootageType::Solid => {
            item.name = nul_replaced_string(slice(opti, 26, 255, "opti")?);
        }
        FootageType::Placeholder => {
            item.name = nul_replaced_string(slice_from(opti, 10, "opti")?);
        }
        FootageType::Unknown(_) => {}
    }

    Ok(())
}

fn parse_composition(item_head: &List, item: &mut Item) -> Result<()> {
    let cdta = item_head.require_by_type("cdta")?.as_bytes()?;
    let framerate_divisor = read_u32(cdta, 4, "cdta")?;
    let framerate_dividend = read_u32(cdta, 8, "cdta")?;
    let seconds_dividend = read_u32(cdta, 44, "cdta")?;
    let seconds_divisor = read_u32(cdta, 48, "cdta")?;

    item.background_color = Some([
        read_u8(cdta, 52, "cdta")?,
        read_u8(cdta, 53, "cdta")?,
        read_u8(cdta, 54, "cdta")?,
    ]);
    item.footage_dimensions = [read_u16(cdta, 140, "cdta")?, read_u16(cdta, 142, "cdta")?];
    item.footage_framerate = framerate_dividend as f64 / framerate_divisor as f64;
    item.footage_seconds = seconds_dividend as f64 / seconds_divisor as f64;

    for (index, layer_head) in item_head.sublists("Layr").into_iter().enumerate() {
        let mut layer = parse_layer(layer_head)?;
        layer.index = index as u32 + 1;
        item.composition_layers.push(layer);
    }

    Ok(())
}

fn parse_layer(layer_head: &List) -> Result<Layer> {
    let ldta = layer_head.require_by_type("ldta")?.as_bytes()?;
    let quality = LayerQualityLevel::from(read_u16(ldta, 4, "ldta")?);
    let layer_attr_bits = [
        read_u8(ldta, 37, "ldta")?,
        read_u8(ldta, 38, "ldta")?,
        read_u8(ldta, 39, "ldta")?,
    ];
    let source_id = read_u32(ldta, 40, "ldta")?;
    let name = layer_head.require_by_type("Utf8")?.to_string_lossy()?;

    let root_tdgp = layer_head.merged_sublist("tdgp");
    let (root_tdgp_map, _) = indexed_group_to_map(&root_tdgp);

    let effects = root_tdgp_map
        .get("ADBE Effect Parade")
        .map(|list| parse_property(PropertyInput::List(list), "ADBE Effect Parade"))
        .transpose()?
        .map(|property| property.properties)
        .unwrap_or_default();

    let text = root_tdgp_map
        .get("ADBE Text Properties")
        .map(|list| parse_property(PropertyInput::List(list), "ADBE Text Properties"))
        .transpose()?;

    Ok(Layer {
        index: 0,
        name,
        source_id,
        quality,
        sampling_mode: LayerSamplingMode::from((layer_attr_bits[0] & (1 << 6)) >> 6),
        frame_blend_mode: LayerFrameBlendMode::from((layer_attr_bits[0] & (1 << 2)) >> 2),
        guide_enabled: ((layer_attr_bits[0] & (1 << 1)) >> 1) == 1,
        solo_enabled: ((layer_attr_bits[1] & (1 << 3)) >> 3) == 1,
        three_d_enabled: ((layer_attr_bits[1] & (1 << 2)) >> 2) == 1,
        adjustment_layer_enabled: ((layer_attr_bits[1] & (1 << 1)) >> 1) == 1,
        collapse_transform_enabled: ((layer_attr_bits[2] & (1 << 7)) >> 7) == 1,
        shy_enabled: ((layer_attr_bits[2] & (1 << 6)) >> 6) == 1,
        lock_enabled: ((layer_attr_bits[2] & (1 << 5)) >> 5) == 1,
        frame_blend_enabled: ((layer_attr_bits[2] & (1 << 4)) >> 4) == 1,
        motion_blur_enabled: ((layer_attr_bits[2] & (1 << 3)) >> 3) == 1,
        effects_enabled: ((layer_attr_bits[2] & (1 << 2)) >> 2) == 1,
        audio_enabled: ((layer_attr_bits[2] & (1 << 1)) >> 1) == 1,
        video_enabled: (layer_attr_bits[2] & 1) == 1,
        effects,
        text,
    })
}

fn parse_property(input: PropertyInput<'_>, match_name: &str) -> Result<Property> {
    let mut property = Property::new(match_name);

    match input {
        PropertyInput::List(prop_head) => {
            let (tdgp_map, ordered_match_names) = indexed_group_to_map(prop_head);
            for (idx, child_match_name) in ordered_match_names.iter().enumerate() {
                if let Some(child_head) = tdgp_map.get(child_match_name) {
                    let mut child =
                        parse_property(PropertyInput::List(child_head), child_match_name)?;
                    child.index = idx as u32 + 1;
                    property.properties.push(child);
                }
            }

            if prop_head.identifier == "sspc" {
                property.property_type = PropertyType::Group;

                if let Some(fnam) = prop_head.find_by_type("fnam") {
                    property.name = fnam.to_string_lossy()?;
                }

                if let Some(tdgp) = prop_head.sublist("tdgp")
                    && let Some(tdsn) = tdgp.find_by_type("tdsn")
                {
                    let label = tdsn.to_string_lossy()?;
                    if label != "-_0_/-" {
                        property.label = Some(label);
                    }
                }

                let part = prop_head.merged_sublist("parT");
                let (sub_match_names, sub_data) = pair_match_names(&part);
                for (idx, child_match_name) in sub_match_names.iter().enumerate().skip(1) {
                    let Some(entries) = sub_data.get(idx) else {
                        continue;
                    };
                    let mut child =
                        parse_property(PropertyInput::Entries(entries), child_match_name)?;
                    child.index = idx as u32;
                    property.properties.push(child);
                }
            }
        }
        PropertyInput::Entries(entries) => {
            for entry in entries {
                let PropertyEntry::Block(block) = entry else {
                    continue;
                };

                match block.block_type.as_str() {
                    "pdnm" => {
                        let content = block.to_string_lossy()?;
                        if property.property_type == PropertyType::Select {
                            property.select_options =
                                content.split('|').map(ToString::to_string).collect();
                        } else if !content.is_empty() {
                            property.name = content;
                        }
                    }
                    "pard" => {
                        let data = block.as_bytes()?;
                        property.property_type = PropertyType::from(read_u16(data, 14, "pard")?);
                        let name = rifx::trim_nul_to_string(slice(data, 16, 48, "pard")?);
                        if !name.is_empty() {
                            property.name = name;
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    Ok(property)
}

fn indexed_group_to_map(tdgp_head: &List) -> (HashMap<String, List>, Vec<String>) {
    let mut map = HashMap::new();
    let (match_names, contents) = pair_match_names(tdgp_head);

    for (idx, match_name) in match_names.iter().enumerate() {
        if let Some(Some(list)) = contents
            .get(idx)
            .map(|entries| entries.first().and_then(PropertyEntry::as_list))
        {
            map.insert(match_name.clone(), list.clone());
        }
    }

    (map, match_names)
}

fn pair_match_names(head: &List) -> (Vec<String>, Vec<Vec<PropertyEntry>>) {
    let mut match_names = Vec::new();
    let mut data = Vec::new();
    let mut group_idx = None;
    let mut skip_to_next_tdmn = false;

    for block in &head.blocks {
        if block.block_type == "tdmn" {
            let match_name = match block.as_bytes() {
                Ok(bytes) => rifx::trim_nul_to_string(bytes),
                Err(_) => String::new(),
            };

            if match_name == "ADBE Group End" || match_name == "ADBE Effect Built In Params" {
                skip_to_next_tdmn = true;
                continue;
            }

            match_names.push(match_name);
            skip_to_next_tdmn = false;
            group_idx = Some(match_names.len() - 1);
        } else if let Some(idx) = group_idx
            && !skip_to_next_tdmn
        {
            while data.len() <= idx {
                data.push(Vec::new());
            }

            match &block.data {
                BlockData::List(list) => data[idx].push(PropertyEntry::List((**list).clone())),
                BlockData::Bytes(_) => data[idx].push(PropertyEntry::Block(block.clone())),
            }
        }
    }

    (match_names, data)
}

fn collect_items(item: &Item, items: &mut HashMap<u32, Item>) {
    items.insert(item.id, item.clone());
    for child in &item.folder_contents {
        collect_items(child, items);
    }
}

fn item_name_map(item: &Item) -> HashMap<u32, String> {
    let mut names = HashMap::new();
    collect_item_names(item, &mut names);
    names
}

fn collect_item_names(item: &Item, names: &mut HashMap<u32, String>) {
    names.insert(item.id, item.name.clone());
    for child in &item.folder_contents {
        collect_item_names(child, names);
    }
}

fn fill_unnamed_layers(item: &mut Item, names: &HashMap<u32, String>) {
    if item.item_type == ItemType::Composition {
        for layer in &mut item.composition_layers {
            if layer.name.is_empty()
                && let Some(name) = names.get(&layer.source_id)
            {
                layer.name = name.clone();
            }
        }
    }

    for child in &mut item.folder_contents {
        fill_unnamed_layers(child, names);
    }
}

fn read_u8(data: &[u8], offset: usize, block_type: &str) -> Result<u8> {
    data.get(offset)
        .copied()
        .ok_or_else(|| AepError::ShortBlock {
            block_type: block_type.to_string(),
            needed: offset + 1,
            actual: data.len(),
        })
}

fn read_u16(data: &[u8], offset: usize, block_type: &str) -> Result<u16> {
    rifx::read_u16(data, offset, block_type)
}

fn read_u32(data: &[u8], offset: usize, block_type: &str) -> Result<u32> {
    rifx::read_u32(data, offset, block_type)
}

fn slice<'a>(data: &'a [u8], start: usize, end: usize, block_type: &str) -> Result<&'a [u8]> {
    if end > data.len() {
        return Err(AepError::ShortBlock {
            block_type: block_type.to_string(),
            needed: end,
            actual: data.len(),
        });
    }

    Ok(&data[start..end])
}

fn slice_from<'a>(data: &'a [u8], start: usize, block_type: &str) -> Result<&'a [u8]> {
    if start > data.len() {
        return Err(AepError::ShortBlock {
            block_type: block_type.to_string(),
            needed: start,
            actual: data.len(),
        });
    }

    Ok(&data[start..])
}

fn nul_replaced_string(data: &[u8]) -> String {
    let mut bytes = rifx::trim_nul(data).to_vec();
    for byte in &mut bytes {
        if *byte == 0 {
            *byte = b' ';
        }
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

enum PropertyInput<'a> {
    List(&'a List),
    Entries(&'a [PropertyEntry]),
}

#[derive(Debug, Clone)]
enum PropertyEntry {
    Block(Block),
    List(List),
}

impl PropertyEntry {
    fn as_list(&self) -> Option<&List> {
        match self {
            Self::List(list) => Some(list),
            Self::Block(_) => None,
        }
    }
}
