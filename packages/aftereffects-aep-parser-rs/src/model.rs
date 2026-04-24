use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum BitsPerChannel {
    Bpc8,
    Bpc16,
    Bpc32,
    Unknown(u8),
}

impl From<u8> for BitsPerChannel {
    fn from(value: u8) -> Self {
        match value {
            0x00 => Self::Bpc8,
            0x01 => Self::Bpc16,
            0x02 => Self::Bpc32,
            value => Self::Unknown(value),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum ItemType {
    Folder,
    Composition,
    Footage,
    Unknown(u16),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum FootageType {
    Solid,
    Placeholder,
    Unknown(u16),
}

impl From<u16> for FootageType {
    fn from(value: u16) -> Self {
        match value {
            0x09 => Self::Solid,
            0x02 => Self::Placeholder,
            value => Self::Unknown(value),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Project {
    pub expression_engine: Option<String>,
    pub depth: BitsPerChannel,
    pub root_folder: Item,
    pub items: HashMap<u32, Item>,
}

#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Item {
    pub name: String,
    pub id: u32,
    pub item_type: ItemType,
    pub folder_contents: Vec<Item>,
    pub footage_dimensions: [u16; 2],
    pub footage_framerate: f64,
    pub footage_seconds: f64,
    pub footage_type: Option<FootageType>,
    pub background_color: Option<[u8; 3]>,
    pub composition_layers: Vec<Layer>,
}

impl Item {
    pub(crate) fn root_folder() -> Self {
        Self {
            name: "root".to_string(),
            id: 0,
            item_type: ItemType::Folder,
            folder_contents: Vec::new(),
            footage_dimensions: [0, 0],
            footage_framerate: 0.0,
            footage_seconds: 0.0,
            footage_type: None,
            background_color: None,
            composition_layers: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum LayerQualityLevel {
    Best,
    Draft,
    Wireframe,
    Unknown(u16),
}

impl From<u16> for LayerQualityLevel {
    fn from(value: u16) -> Self {
        match value {
            0x0002 => Self::Best,
            0x0001 => Self::Draft,
            0x0000 => Self::Wireframe,
            value => Self::Unknown(value),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum LayerSamplingMode {
    Bilinear,
    Bicubic,
    Unknown(u8),
}

impl From<u8> for LayerSamplingMode {
    fn from(value: u8) -> Self {
        match value {
            0x00 => Self::Bilinear,
            0x01 => Self::Bicubic,
            value => Self::Unknown(value),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum LayerFrameBlendMode {
    FrameMix,
    PixelMotion,
    Unknown(u8),
}

impl From<u8> for LayerFrameBlendMode {
    fn from(value: u8) -> Self {
        match value {
            0x00 => Self::FrameMix,
            0x01 => Self::PixelMotion,
            value => Self::Unknown(value),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Layer {
    pub index: u32,
    pub name: String,
    pub source_id: u32,
    pub quality: LayerQualityLevel,
    pub sampling_mode: LayerSamplingMode,
    pub frame_blend_mode: LayerFrameBlendMode,
    pub guide_enabled: bool,
    pub solo_enabled: bool,
    pub three_d_enabled: bool,
    pub adjustment_layer_enabled: bool,
    pub collapse_transform_enabled: bool,
    pub shy_enabled: bool,
    pub lock_enabled: bool,
    pub frame_blend_enabled: bool,
    pub motion_blur_enabled: bool,
    pub effects_enabled: bool,
    pub audio_enabled: bool,
    pub video_enabled: bool,
    pub effects: Vec<Property>,
    pub text: Option<Property>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum PropertyType {
    Boolean,
    OneD,
    TwoD,
    ThreeD,
    Color,
    Angle,
    LayerSelect,
    Select,
    Group,
    Custom,
    Unknown(u16),
}

impl From<u16> for PropertyType {
    fn from(value: u16) -> Self {
        match value {
            0x04 => Self::Boolean,
            0x02 | 0x0a => Self::OneD,
            0x06 => Self::TwoD,
            0x12 => Self::ThreeD,
            0x05 => Self::Color,
            0x03 => Self::Angle,
            0x00 => Self::LayerSelect,
            0x07 => Self::Select,
            0x0d => Self::Group,
            0x0f => Self::Custom,
            value => Self::Unknown(value),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Property {
    pub match_name: String,
    pub name: String,
    pub label: Option<String>,
    pub index: u32,
    pub property_type: PropertyType,
    pub properties: Vec<Property>,
    pub select_options: Vec<String>,
}

impl Property {
    pub(crate) fn new(match_name: &str) -> Self {
        Self {
            match_name: match_name.to_string(),
            name: match match_name {
                "ADBE Effect Parade" => "Effects".to_string(),
                _ => match_name.to_string(),
            },
            label: None,
            index: 0,
            property_type: PropertyType::Custom,
            properties: Vec::new(),
            select_options: Vec::new(),
        }
    }
}
