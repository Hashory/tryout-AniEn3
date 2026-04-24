use thiserror::Error;

pub type Result<T> = std::result::Result<T, AepError>;

#[derive(Debug, Error)]
pub enum AepError {
    #[error("unknown RIFX file format")]
    InvalidRifxMagic,
    #[error("unexpected end of file while reading {context}")]
    UnexpectedEof { context: &'static str },
    #[error("block `{block_type}` does not contain byte data")]
    ExpectedBytes { block_type: String },
    #[error("block `{block_type}` does not contain a list")]
    ExpectedList { block_type: String },
    #[error("missing block `{block_type}`")]
    MissingBlock { block_type: String },
    #[error("missing sublist `{identifier}`")]
    MissingSublist { identifier: String },
    #[error("invalid block `{block_type}`: expected at least {needed} bytes, got {actual}")]
    ShortBlock {
        block_type: String,
        needed: usize,
        actual: usize,
    },
    #[error("invalid parser state: {message}")]
    InvalidState { message: String },
    #[cfg(not(target_arch = "wasm32"))]
    #[error(transparent)]
    Io(#[from] std::io::Error),
}
