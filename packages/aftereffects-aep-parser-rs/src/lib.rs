mod error;
mod model;
mod parser;
pub mod rifx;

pub use error::{AepError, Result};
pub use model::{
    BitsPerChannel, FootageType, Item, ItemType, Layer, LayerFrameBlendMode, LayerQualityLevel,
    LayerSamplingMode, Project, Property, PropertyType,
};
pub use parser::parse_project;

#[cfg(not(target_arch = "wasm32"))]
pub fn open_project(path: impl AsRef<std::path::Path>) -> Result<Project> {
    let bytes = std::fs::read(path)?;
    parse_project(&bytes)
}

#[cfg(feature = "wasm")]
use wasm_bindgen::prelude::*;

#[cfg(feature = "wasm")]
#[wasm_bindgen]
pub fn parse_aep(bytes: &[u8]) -> std::result::Result<JsValue, JsValue> {
    let project = parse_project(bytes).map_err(|err| JsValue::from_str(&err.to_string()))?;
    serde_wasm_bindgen::to_value(&project).map_err(|err| JsValue::from_str(&err.to_string()))
}
