//! Parser de Android Binary XML (AXML) — formato usado no `AndroidManifest.xml`
//! dentro dos APKs. Converte o XML binário em texto puro, sem dependências.
//!
//! Referência do formato:
//! <https://justanapplication.wordpress.com/2011/09/14/android-binary-xml-format/>

/// Converte um bloco AXML em XML texto.
pub fn to_xml(data: &[u8]) -> Result<String, String> {
    let parser = AXml::parse(data)?;
    Ok(parser.render())
}

#[derive(Debug, Clone)]
struct Attr {
    ns: Option<String>,
    name: String,
    raw: Option<String>,
    dtype: u8,
    data: u32,
}

#[derive(Debug, Clone)]
struct Node {
    name: String,
    attrs: Vec<Attr>,
    children: Vec<Node>,
}

struct StringPool {
    flags: u16,
    chunk_base: usize,
    strings_start: u32,
    offsets: Vec<u32>,
    data: Vec<u8>,
}

impl StringPool {
    fn get(&self, idx: i32) -> Option<String> {
        if idx < 0 || idx as usize >= self.offsets.len() {
            return None;
        }
        let start = self.chunk_base + self.strings_start as usize + self.offsets[idx as usize] as usize;
        if self.flags & 0x0100 != 0 {
            self.read_utf8(start)
        } else {
            self.read_utf16(start)
        }
    }

    fn read_utf8(&self, mut pos: usize) -> Option<String> {
        let d = &self.data;
        // byteLen (1-2 bytes, high bit indica 2 bytes)
        let mut b = *d.get(pos)? as usize;
        pos += 1;
        let byte_len = if b & 0x80 != 0 {
            b = ((b & 0x7f) << 8) | *d.get(pos)? as usize;
            pos += 1;
            b
        } else {
            b
        };
        // charLen (descartado)
        let c = *d.get(pos)? as usize;
        pos += 1;
        if c & 0x80 != 0 {
            let _ = *d.get(pos)?;
            pos += 1;
        }
        let end = pos + byte_len;
        if end > d.len() {
            return None;
        }
        // UTF-8 padrão.
        let mut out = String::with_capacity(byte_len);
        let mut i = pos;
        while i < end {
            let ch = d[i] as u32;
            if ch > 0x7f {
                if i + 1 >= end {
                    return None;
                }
                let two = d[i + 1] as u32;
                if ch > 0xdf {
                    if i + 2 >= end {
                        return None;
                    }
                    let three = d[i + 2] as u32;
                    let cp = (ch & 0x0f) << 12 | (two & 0x3f) << 6 | (three & 0x3f);
                    out.push(char::from_u32(cp)?);
                    i += 3;
                } else {
                    let cp = (ch & 0x1f) << 6 | (two & 0x3f);
                    out.push(char::from_u32(cp)?);
                    i += 2;
                }
            } else {
                out.push(ch as u8 as char);
                i += 1;
            }
        }
        Some(out)
    }

    fn read_utf16(&self, mut pos: usize) -> Option<String> {
        let d = &self.data;
        let mut len = u16::from_le_bytes([*d.get(pos)?, *d.get(pos + 1)?]) as usize;
        pos += 2;
        if len & 0x8000 != 0 {
            let high = u16::from_le_bytes([*d.get(pos)?, *d.get(pos + 1)?]) as usize;
            pos += 2;
            len = (len & 0x7fff) | high << 15;
        }
        let mut out = String::with_capacity(len);
        for _ in 0..len {
            let code = u16::from_le_bytes([*d.get(pos)?, *d.get(pos + 1)?]);
            pos += 2;
            if let Some(c) = char::from_u32(code as u32) {
                out.push(c);
            }
        }
        Some(out)
    }
}

struct AXml {
    ns_decls: Vec<(String, String)>, // (prefix, uri)
    nodes: Vec<Node>,
}

impl AXml {
    fn parse(data: &[u8]) -> Result<AXml, String> {
        if data.len() < 8 {
            return Err("AXML too short".into());
        }
        // Layout: [0x0003 magic][0x0008 headerSize][chunkSize u32le]...
        let total = u32::from_le_bytes([data[4], data[5], data[6], data[7]]) as usize;
        if total > data.len() {
            return Err(format!("AXML size mismatch ({total} > {})", data.len()));
        }
        let mut pos = 8usize;
        let mut string_pool: Option<StringPool> = None;
        let mut res_map: Vec<u32> = Vec::new();
        let mut ns_decls: Vec<(String, String)> = Vec::new();
        let mut stack: Vec<Node> = Vec::new();
        let mut nodes: Vec<Node> = Vec::new();

        while pos + 8 <= total {
            let ctype = u16::from_le_bytes([data[pos], data[pos + 1]]);
            let hsize = u16::from_le_bytes([data[pos + 2], data[pos + 3]]) as usize;
            let csize = u32::from_le_bytes([data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7]]) as usize;
            if csize < hsize || pos + csize > total {
                return Err("AXML chunk overflow".into());
            }
            // O `headerSize` já inclui os 8 bytes do chunk header; o corpo de
            // dados (structs) começa sempre em `pos + 8`.
            let body = pos + 8;
            let end = pos + csize;
            match ctype {
                0x0001 => {
                    string_pool = Some(parse_string_pool(data, pos, body)?);
                }
                0x0180 => {
                    // Resource map.
                    let mut off = body;
                    while off + 4 <= end {
                        res_map.push(u32::from_le_bytes([
                            data[off], data[off + 1], data[off + 2], data[off + 3],
                        ]));
                        off += 4;
                    }
                }
                0x0100 => {
                    // Start namespace.
                    let (prefix, uri) = parse_namespace(data, body, string_pool.as_ref())?;
                    ns_decls.push((prefix, uri));
                }
                0x0102 => {
                    // Start element: body = pos+8. Layout do attrExt:
                    //   ns(u32) @+8, name(u32) @+12,
                    //   attributeStart(u16) @+16, attributeSize(u16) @+18,
                    //   attributeCount(u16) @+20, idIndex/classIndex/styleIndex @+22/24/26.
                    let pool = string_pool.as_ref().ok_or("no string pool")?;
                    let name_idx = i32::from_le_bytes([
                        data[body + 12],
                        data[body + 13],
                        data[body + 14],
                        data[body + 15],
                    ]);
                    let attr_start =
                        u16::from_le_bytes([data[body + 16], data[body + 17]]) as usize;
                    let attr_count =
                        u16::from_le_bytes([data[body + 20], data[body + 21]]) as usize;
                    let mut attrs = Vec::new();
                    // Os atributos começam após ResChunk_header(8) +
                    // ResXMLTree_node(8) + attributeStart.
                    let mut apos = pos + 16 + attr_start;
                    for i in 0..attr_count {
                        let ns_idx = i32::from_le_bytes([
                            data[apos], data[apos + 1], data[apos + 2], data[apos + 3],
                        ]);
                        let a_name_idx = i32::from_le_bytes([
                            data[apos + 4],
                            data[apos + 5],
                            data[apos + 6],
                            data[apos + 7],
                        ]);
                        let raw_idx = i32::from_le_bytes([
                            data[apos + 8],
                            data[apos + 9],
                            data[apos + 10],
                            data[apos + 11],
                        ]);
                        let dtype = data[apos + 15];
                        let a_data = u32::from_le_bytes([
                            data[apos + 16],
                            data[apos + 17],
                            data[apos + 18],
                            data[apos + 19],
                        ]);
                        let ns = pool.get(ns_idx);
                        let name = pool.get(a_name_idx).unwrap_or_default();
                        let raw = pool.get(raw_idx);
                        let name = resolve_attr_name(name, ns.as_deref(), i, &res_map);
                        attrs.push(Attr { ns, name, raw, dtype, data: a_data });
                        apos += 20;
                    }
                    let name = pool.get(name_idx).unwrap_or_default();
                    stack.push(Node { name, attrs, children: Vec::new() });
                }
                0x0103 => {
                    // End element: pop e anexa ao pai.
                    if let Some(node) = stack.pop() {
                        match stack.last_mut() {
                            Some(parent) => parent.children.push(node),
                            None => nodes.push(node),
                        }
                    }
                }
                _ => {}
            }
            pos = end;
        }

        Ok(AXml {
            ns_decls,
            nodes,
        })
    }

    fn render(&self) -> String {
        let mut out = String::with_capacity(2048);
        out.push_str("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n");
        for node in &self.nodes {
            let prefix = match node.name.as_str() {
                "" => None,
                _ => Some(format!("[unknown element] {}", node.name)),
            };
            let _ = prefix;
            self.render_node(node, 0, &mut out);
        }
        out
    }

    fn render_node(&self, node: &Node, depth: usize, out: &mut String) {
        let indent = "  ".repeat(depth);
        out.push_str(&indent);
        out.push('<');
        out.push_str(&node.name);
        // Declarações de namespace no elemento raiz.
        if depth == 0 {
            let mut seen = std::collections::HashSet::new();
            for (prefix, uri) in &self.ns_decls {
                if seen.insert(uri.clone()) {
                    out.push_str(&format!(" xmlns:{prefix}=\"{}\"", xml_escape(uri)));
                }
            }
        }
        for a in &node.attrs {
            let prefix = match a.ns.as_deref() {
                Some("http://schemas.android.com/apk/res/android") => Some("android"),
                Some("http://schemas.android.com/apk/res-auto") => Some("app"),
                Some("http://schemas.android.com/tools") => Some("tools"),
                Some(_) => None,
                None => None,
            };
            out.push(' ');
            match prefix {
                Some(p) => {
                    out.push_str(p);
                    out.push(':');
                }
                None => {}
            }
            out.push_str(&a.name);
            out.push_str("=\"");
            out.push_str(&xml_escape(&self.value_str(a)));
            out.push('"');
        }
        if node.children.is_empty() {
            out.push_str("/>\n");
        } else {
            out.push_str(">\n");
            for c in &node.children {
                self.render_node(c, depth + 1, out);
            }
            out.push_str(&indent);
            out.push_str("</");
            out.push_str(&node.name);
            out.push_str(">\n");
        }
    }

    fn value_str(&self, a: &Attr) -> String {
        match a.dtype {
            0x03 => a.raw.clone().unwrap_or_default(),
            0x10 => a.data.to_string(),
            0x11 => {
                // versionCode costuma ser INT_HEX; exibir decimal é mais útil.
                if a.name == "versionCode" || a.name == "versionCodeMajor" {
                    a.data.to_string()
                } else {
                    format!("0x{:x}", a.data)
                }
            }
            0x12 => (a.data != 0).to_string(),
            0x01 => format!("@0x{:08x}", a.data),
            0x13 => format!("#{:08x}", a.data),
            0x1c => {
                let bits = a.data;
                let f = f32::from_bits(bits);
                format!("{f}")
            }
            _ => a.raw.clone().unwrap_or_default(),
        }
    }
}

fn parse_string_pool(data: &[u8], chunk_base: usize, body: usize) -> Result<StringPool, String> {
    if body + 20 > data.len() {
        return Err("string pool too short".into());
    }
    // Header (com body = chunk_base + 8):
    //   stringCount u32 @+0, styleCount u32 @+4, flags u32 @+8,
    //   stringsStart u32 @+12, stylesStart u32 @+16, offsets[] @+20.
    let s_count = u32::from_le_bytes([data[body], data[body + 1], data[body + 2], data[body + 3]]) as usize;
    let flags = u16::from_le_bytes([data[body + 8], data[body + 9]]);
    let strings_start = u32::from_le_bytes([data[body + 12], data[body + 13], data[body + 14], data[body + 15]]);
    let mut offsets = Vec::with_capacity(s_count);
    let mut off = body + 20;
    for _ in 0..s_count {
        offsets.push(u32::from_le_bytes([
            data[off], data[off + 1], data[off + 2], data[off + 3],
        ]));
        off += 4;
    }
    Ok(StringPool {
        flags,
        chunk_base,
        strings_start,
        offsets,
        data: data.to_vec(),
    })
}

fn parse_namespace(data: &[u8], body: usize, pool: Option<&StringPool>) -> Result<(String, String), String> {
    let pool = pool.ok_or("no string pool")?;
    // ResXMLTree_node (8) + ns... na verdade: node + prefix(4) + uri(4),
    // com body = pos+8 → prefix @ body+8, uri @ body+12.
    let prefix_idx = i32::from_le_bytes([data[body + 8], data[body + 9], data[body + 10], data[body + 11]]);
    let uri_idx = i32::from_le_bytes([data[body + 12], data[body + 13], data[body + 14], data[body + 15]]);
    let prefix = pool.get(prefix_idx).unwrap_or_default();
    let uri = pool.get(uri_idx).unwrap_or_default();
    Ok((prefix, uri))
}

/// Para atributos android, o nome no string pool é só `name`; o id de recurso
/// (res_map) é quem identifica o atributo real (ex.: versionCode). Quando não
/// houver nome legível, usa o id de recurso como fallback.
fn resolve_attr_name(name: String, ns: Option<&str>, idx: usize, res_map: &[u32]) -> String {
    let is_android = ns == Some("http://schemas.android.com/apk/res/android");
    if !name.is_empty() {
        return name;
    }
    if is_android {
        if let Some(id) = res_map.get(idx) {
            return format!("attr0x{:x}", id);
        }
    }
    name
}

fn xml_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(c),
        }
    }
    out
}

/// Extrai o valor de um atributo do XML gerado.
/// `attr` no formato `[prefix:]name` (ex.: `android:versionCode`, `package`).
pub fn extract_attr(xml: &str, attr: &str) -> Option<String> {
    let needle = format!("{attr}=\"");
    let idx = xml.find(&needle)?;
    let rest = &xml[idx + needle.len()..];
    let end = rest.find('"')?;
    Some(xml_unescape(&rest[..end]))
}

/// Diagnóstico (temporário): info do string pool.
pub fn debug_pool_info(data: &[u8]) -> String {
    let mut pos = 8usize;
    while pos + 8 <= data.len() {
        let ctype = u16::from_le_bytes([data[pos], data[pos + 1]]);
        let hsize = u16::from_le_bytes([data[pos + 2], data[pos + 3]]) as usize;
        let csize = u32::from_le_bytes([data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7]]) as usize;
        let body = pos + hsize;
        let end = pos + csize;
        if ctype == 0x0001 {
            let s_count = u32::from_le_bytes([data[body], data[body + 1], data[body + 2], data[body + 3]]) as usize;
            let flags = u16::from_le_bytes([data[body + 8], data[body + 9]]);
            let strings_start = u32::from_le_bytes([data[body + 12], data[body + 13], data[body + 14], data[body + 15]]);
            let pool = StringPool {
                flags,
                chunk_base: pos,
                strings_start,
                offsets: (0..s_count.min(6)).map(|i| i as u32).collect(),
                data: data.to_vec(),
            };
            let first: Vec<String> = (0..s_count.min(6))
                .map(|i| pool.get(i as i32).unwrap_or_else(|| "<?>".into()))
                .collect();
            return format!(
                "count={s_count} flags=0x{flags:04x} stringsStart={strings_start} hsize={hsize} base={pos} first={first:?}"
            );
        }
        pos = end;
    }
    "no pool".into()
}

/// Lista os elementos `<tag android:name="...">`.
pub fn component_names(xml: &str, tag: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut search_from = 0usize;
    while let Some(rel) = xml[search_from..].find(&format!("<{tag}")) {
        let start = search_from + rel;
        let after = &xml[start..];
        // Garante que não é `<tag-alias` nem `<tagfoo`.
        let tag_end = start + tag.len() + 1;
        if xml[tag_end..].chars().next().is_some_and(|c| !c.is_whitespace() && c != '>' && c != '/') {
            search_from = start + 1;
            continue;
        }
        if let Some(v) = extract_attr_from(after, "android:name") {
            out.push(v);
        }
        if let Some(end) = xml[start..].find('>') {
            search_from = start + end + 1;
        } else {
            break;
        }
    }
    out
}

fn extract_attr_from(fragment: &str, attr: &str) -> Option<String> {
    let needle = format!("{attr}=\"");
    let idx = fragment.find(&needle)?;
    let rest = &fragment[idx + needle.len()..];
    let end = rest.find('"')?;
    Some(xml_unescape(&rest[..end]))
}

fn xml_unescape(s: &str) -> String {
    s.replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
}

/// Extrai todas as ocorrências de `<tag ...>...</tag>` (ex.: uses-permission).
pub fn find_elements(xml: &str, tag: &str) -> Vec<String> {
    let mut out = Vec::new();
    let open = format!("<{tag}");
    let close = "</";
    let mut pos = 0usize;
    while let Some(rel) = xml[pos..].find(&open) {
        let start = pos + rel;
        let frag = &xml[start..];
        let tag_end = start + tag.len() + 1;
        if xml[tag_end..].chars().next().is_some_and(|c| !c.is_whitespace() && c != '>' && c != '/') {
            pos = start + 1;
            continue;
        }
        let Some(tag_close) = frag.find('>') else { break };
        let end_rel = frag.find(&close).unwrap_or(tag_close + 1);
        let body_end = start + end_rel;
        out.push(xml[start..body_end].to_string());
        pos = start + tag_close + 1;
    }
    out
}

pub fn attr_from_element(el: &str, attr: &str) -> Option<String> {
    extract_attr_from(el, attr)
}
