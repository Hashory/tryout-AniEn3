use crate::error::{AepError, Result};

#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct List {
    pub identifier: String,
    pub blocks: Vec<Block>,
}

impl List {
    pub fn find_by_type(&self, block_type: &str) -> Option<&Block> {
        self.blocks
            .iter()
            .find(|block| block.block_type == block_type)
    }

    pub fn require_by_type(&self, block_type: &str) -> Result<&Block> {
        self.find_by_type(block_type)
            .ok_or_else(|| AepError::MissingBlock {
                block_type: block_type.to_string(),
            })
    }

    pub fn sublists(&self, identifier: &str) -> Vec<&List> {
        self.blocks
            .iter()
            .filter_map(|block| match &block.data {
                BlockData::List(list)
                    if block.block_type == "LIST" && list.identifier == identifier =>
                {
                    Some(list.as_ref())
                }
                _ => None,
            })
            .collect()
    }

    pub fn sublist(&self, identifier: &str) -> Option<&List> {
        self.sublists(identifier).into_iter().next()
    }

    pub fn require_sublist(&self, identifier: &str) -> Result<&List> {
        self.sublist(identifier)
            .ok_or_else(|| AepError::MissingSublist {
                identifier: identifier.to_string(),
            })
    }

    pub fn merged_sublist(&self, identifier: &str) -> List {
        let blocks = self
            .sublists(identifier)
            .into_iter()
            .flat_map(|list| list.blocks.clone())
            .collect();

        List {
            identifier: identifier.to_string(),
            blocks,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Block {
    #[cfg_attr(feature = "serde", serde(rename = "type"))]
    pub block_type: String,
    pub size: u32,
    pub data: BlockData,
}

impl Block {
    pub fn as_bytes(&self) -> Result<&[u8]> {
        match &self.data {
            BlockData::Bytes(bytes) => Ok(bytes),
            BlockData::List(_) => Err(AepError::ExpectedBytes {
                block_type: self.block_type.clone(),
            }),
        }
    }

    pub fn as_list(&self) -> Result<&List> {
        match &self.data {
            BlockData::List(list) => Ok(list),
            BlockData::Bytes(_) => Err(AepError::ExpectedList {
                block_type: self.block_type.clone(),
            }),
        }
    }

    pub fn to_string_lossy(&self) -> Result<String> {
        let data = self.as_bytes()?;
        if data.len() >= 8 && data[..4].eq_ignore_ascii_case(b"utf8") {
            let len = u32::from_be_bytes(data[4..8].try_into().expect("slice length checked"));
            let end = 8usize.saturating_add(len as usize);
            if end <= self.size as usize && end <= data.len() {
                return Ok(trim_nul_to_string(&data[8..end]));
            }
        }

        Ok(trim_nul_to_string(data))
    }

    pub fn to_u8(&self) -> Result<u8> {
        self.as_bytes()?
            .first()
            .copied()
            .ok_or_else(|| AepError::ShortBlock {
                block_type: self.block_type.clone(),
                needed: 1,
                actual: 0,
            })
    }

    pub fn to_u16(&self) -> Result<u16> {
        let data = self.as_bytes()?;
        read_u16(data, 0, &self.block_type)
    }

    pub fn to_u32(&self) -> Result<u32> {
        let data = self.as_bytes()?;
        read_u32(data, 0, &self.block_type)
    }
}

#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum BlockData {
    Bytes(Vec<u8>),
    List(Box<List>),
}

pub fn from_bytes(bytes: &[u8]) -> Result<List> {
    let mut reader = Reader::new(bytes);
    if reader.read_exact(4, "RIFX magic")? != b"RIFX" {
        return Err(AepError::InvalidRifxMagic);
    }

    let file_size = reader.read_u32("file size")? as usize;
    let (list, _) = read_list(&mut reader, file_size)?;
    Ok(list)
}

pub(crate) fn read_u16(data: &[u8], offset: usize, block_type: &str) -> Result<u16> {
    let end = offset.saturating_add(2);
    if end > data.len() {
        return Err(AepError::ShortBlock {
            block_type: block_type.to_string(),
            needed: end,
            actual: data.len(),
        });
    }

    Ok(u16::from_be_bytes(
        data[offset..end].try_into().expect("slice length checked"),
    ))
}

pub(crate) fn read_u32(data: &[u8], offset: usize, block_type: &str) -> Result<u32> {
    let end = offset.saturating_add(4);
    if end > data.len() {
        return Err(AepError::ShortBlock {
            block_type: block_type.to_string(),
            needed: end,
            actual: data.len(),
        });
    }

    Ok(u32::from_be_bytes(
        data[offset..end].try_into().expect("slice length checked"),
    ))
}

pub(crate) fn trim_nul_to_string(data: &[u8]) -> String {
    String::from_utf8_lossy(trim_nul(data)).into_owned()
}

pub(crate) fn trim_nul(data: &[u8]) -> &[u8] {
    let start = data
        .iter()
        .position(|byte| *byte != 0)
        .unwrap_or(data.len());
    let end = data
        .iter()
        .rposition(|byte| *byte != 0)
        .map(|idx| idx + 1)
        .unwrap_or(start);
    &data[start..end]
}

fn read_list(reader: &mut Reader<'_>, limit: usize) -> Result<(List, usize)> {
    let start_pos = reader.position();
    let identifier = reader.read_fourcc("list identifier")?;
    let mut read_bytes = reader.position() - start_pos;
    let mut blocks = Vec::new();

    while read_bytes < limit {
        let (block, block_bytes) = read_block(reader, limit - read_bytes)?;
        read_bytes += block_bytes;
        blocks.push(block);
    }

    Ok((List { identifier, blocks }, read_bytes))
}

fn read_block(reader: &mut Reader<'_>, limit: usize) -> Result<(Block, usize)> {
    let start_pos = reader.position();
    let block_type = reader.read_fourcc("block type")?;
    let block_size_bytes = reader.read_exact(4, "block size")?.to_vec();
    let size = u32::from_be_bytes(
        block_size_bytes
            .as_slice()
            .try_into()
            .expect("slice length checked"),
    );
    let bytes_read = reader.position() - start_pos;

    let (block_type, data) = if size as usize > limit.saturating_sub(bytes_read) {
        let rest = reader
            .read_exact(limit.saturating_sub(bytes_read), "anonymous block data")?
            .to_vec();
        let mut anonymous = Vec::with_capacity(8 + rest.len());
        anonymous.extend_from_slice(block_type.as_bytes());
        anonymous.extend_from_slice(&block_size_bytes);
        anonymous.extend_from_slice(&rest);
        ("ANON".to_string(), BlockData::Bytes(anonymous))
    } else if block_type == "LIST" {
        let (list, _) = read_list(reader, size as usize)?;
        (block_type, BlockData::List(Box::new(list)))
    } else {
        let bytes = reader.read_exact(size as usize, "block data")?.to_vec();
        (block_type, BlockData::Bytes(bytes))
    };

    if size % 2 != 0 {
        reader.read_exact(1, "block padding")?;
    }

    let total_read = reader.position() - start_pos;
    Ok((
        Block {
            block_type,
            size,
            data,
        },
        total_read,
    ))
}

struct Reader<'a> {
    bytes: &'a [u8],
    position: usize,
}

impl<'a> Reader<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, position: 0 }
    }

    fn position(&self) -> usize {
        self.position
    }

    fn read_exact(&mut self, len: usize, context: &'static str) -> Result<&'a [u8]> {
        let end = self.position.saturating_add(len);
        if end > self.bytes.len() {
            return Err(AepError::UnexpectedEof { context });
        }

        let data = &self.bytes[self.position..end];
        self.position = end;
        Ok(data)
    }

    fn read_fourcc(&mut self, context: &'static str) -> Result<String> {
        Ok(String::from_utf8_lossy(self.read_exact(4, context)?).into_owned())
    }

    fn read_u32(&mut self, context: &'static str) -> Result<u32> {
        let bytes = self.read_exact(4, context)?;
        Ok(u32::from_be_bytes(
            bytes.try_into().expect("slice length checked"),
        ))
    }
}
