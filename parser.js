/* แปลงข้อความโปรโมชั่น (ที่ admin วาง) ให้เป็นข้อมูลของหน้าโปร
   รูปแบบแถว: [group, ชื่อโปร, ราคาแพ็กเกจ, ค่าบริการล่วงหน้า, ส่วนลดเครื่อง, ราคาเครื่องขั้นต่ำ, สัญญา, หมายเหตุ] */
(function (root) {
  const AP = 'ALL Product', SP = 'SmartPhone / iPhone / iPad / Tablet / Mac', OM = 'OpenMKT';
  const num = s => parseInt(String(s).replace(/,/g, ''), 10);

  // ส่วนที่คั่นระหว่างชื่อโปรกับเงื่อนไข (รองรับคำพิมพ์ผิดที่พบบ่อย)
  const COND = /[-\s]*(?:ไม่มี|จ่าย|จาย|ว่าย|อ่าย|ลดค่าเครื่อง|ลด|ลล)/;

  function parseLine(raw, model) {
    const notes = [];
    const body = raw.replace(/^\s*\*\s*/, '').trim().replace(/^TRUE\s*[-–]?\s*/i, '');

    // ส่วนลด: "ลด 3500", "ลดค่าเครื่อง 5500", พิมพ์ผิดเป็น "ลล5500" หรือ "ล95500"
    let dm = body.match(/(?:ลดค่าเครื[^\d]*|ล[ดล](?:ค่าเครื[^\d]*)?)\s*([\d,]+)/) || body.match(/ล([\d,]{4,})/);
    if (!dm) return { error: 'ไม่พบส่วนลดค่าเครื่อง' };
    let disc = num(dm[1]);
    if (disc > 20000) {
      const fixed = num(String(disc).slice(1)) || Math.round(disc / 10);
      notes.push(`ส่วนลด ${disc} ผิดปกติ ปรับเป็น ${fixed}`);
      disc = fixed;
    }

    // ค่าบริการล่วงหน้า
    let pre = 0;
    if (!/ไม่มี/.test(body)) {
      const pm = body.match(/(?:จ่าย|จาย|ว่าย|อ่าย)[^\d]*?(\d[\d,]*)/);
      if (pm) pre = num(pm[1]);
    }

    const mm = body.match(/ราคา\s*เครื[^\d]*([\d,]+)/);
    const min = mm ? num(mm[1]) : 0;
    const tm = body.match(/สัญญา\s*(\d+)/);
    const term = tm ? num(tm[1]) : 12;

    let tag;
    if (/MASS/i.test(body)) tag = 'Mass';
    else if (/SmartPhone/i.test(body)) tag = SP;
    else if (/ALL\s*Product/i.test(body)) tag = AP;
    else if (/MKT|penMK/i.test(body)) tag = OM;
    else tag = model + ' Series';

    const ci = body.search(COND);
    const label = (ci > 0 ? body.slice(0, ci) : body).trim();
    const plain = label.replace(/\([^)]*\)/g, ' ');
    const pkg = [...plain.matchAll(/\d[\d,]*/g)].map(m => num(m[0])).filter(n => n >= 300 && n <= 3000)[0];
    if (!pkg) return { error: 'ไม่พบราคาแพ็กเกจในชื่อโปร' };

    let group;
    if (tag === 'Mass') group = 'mass';
    else if (/Existing|EXT\b|Renew/i.test(label)) group = 'ext';
    else if (/MNP|MPShare|ย้ายค่าย/i.test(label)) group = 'mnp';
    else group = 'new';

    let name;
    if (group === 'mnp') name = (/Ch[a-z]*ge|MSISDN/i.test(label) ? 'MNP Change MSISDN 5GX ' : 'MNP Share Plan ') + pkg;
    else if (group === 'ext') {
      const rn = /Renew/i.test(label), sh = /Share/i.test(label);
      name = (rn && sh ? 'Existing Share Plan / Renew' : rn ? 'Existing Renew' : 'Existing Share Plan') + ' ' + pkg;
    } else name = 'New ' + (/5GX/i.test(label) ? '5GX ' : '') + pkg;
    if (/\(\s*100\s*\)/.test(label)) name += ' (100)';
    const net = label.match(/เน็ต\s*(\d+)\s*GB/i);
    if (net) name += ` (เน็ต ${net[1]}GB)`;
    if (/AIS/i.test(label)) name += ' (ย้ายค่าย AIS)';
    const q = tag === OM && label.match(/hone\s*(\d+)\s*(ทุกรุ่น|Series)/i);
    if (q) name += ` (iPhone ${q[1]} ${q[2]})`;

    return { row: [group, name, pkg, pre, disc, min, term, tag], notes };
  }

  function parse(text) {
    const models = {}, detail = [], errors = [];
    const seen = {};
    let model = null, dup = 0;
    text.split(/\r?\n/).forEach((line, i) => {
      if (!line.trim()) return;
      let content = line;
      const h = line.match(/^\s*IPHONE\s*(\d+)\b/i);
      if (h) { model = 'iPhone ' + h[1]; content = line.slice(h[0].length); if (!content.trim()) return; }
      if (!model) { errors.push({ line: i + 1, text: line.trim(), reason: 'ยังไม่พบหัวรุ่น (เช่น IPHONE17)' }); return; }
      const r = parseLine(content, model);
      if (r.error) { errors.push({ line: i + 1, text: content.trim(), reason: r.error }); return; }
      const key = r.row.join('|');
      seen[model] = seen[model] || new Set();
      if (seen[model].has(key)) { dup++; return; }
      seen[model].add(key);
      (models[model] = models[model] || []).push(r.row);
      detail.push({ model, row: r.row, raw: content.trim(), notes: r.notes, line: i + 1 });
    });
    return { models, detail, errors, duplicates: dup };
  }

  const api = { parse, parseLine };
  if (typeof module !== 'undefined') module.exports = api; else root.PromoParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
