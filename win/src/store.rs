//! A tiny JSON-backed settings store. Keys mirror the mac build's UserDefaults names so the two
//! versions are easy to compare: catScale, style, pixelEdges, octoHue, octoLight, coat,
//! pattern.<coat>, eyeColor, eyeShine, blush, whiskers, collar, privacy, clickThrough, sleepAfter,
//! tune, originX, originY. runAsAdmin is Windows-only.
use std::fs;
use std::path::PathBuf;

use serde_json::{Map, Value};

pub struct Store {
    file: PathBuf,
    data: Map<String, Value>,
}

impl Store {
    pub fn open(file: PathBuf) -> Self {
        let data = fs::read_to_string(&file)
            .ok()
            .and_then(|text| serde_json::from_str::<Map<String, Value>>(&text).ok())
            .unwrap_or_default();
        Self { file, data }
    }

    pub fn get(&self, key: &str) -> Option<&Value> {
        self.data.get(key).filter(|value| !value.is_null())
    }

    pub fn set(&mut self, key: &str, value: Value) {
        self.data.insert(key.to_string(), value);
        self.save();
    }

    pub fn remove(&mut self, key: &str) {
        self.data.remove(key);
        self.save();
    }

    fn save(&self) {
        let write = || -> std::io::Result<()> {
            if let Some(dir) = self.file.parent() {
                fs::create_dir_all(dir)?;
            }
            fs::write(&self.file, serde_json::to_string_pretty(&self.data)?)
        };
        if let Err(error) = write() {
            eprintln!("settings save failed: {error}");
        }
    }
}
