(() => {
  'use strict';
  const encoder = new TextEncoder();
  const spreadsheet = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const relationships = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const packageRoot = 'http://schemas.openxmlformats.org/package/2006/';
  const escape = value => String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
    .replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);

  function zip(files) {
    const chunks = [];
    const directory = [];
    let offset = 0;
    let directorySize = 0;
    for (const [path, content] of files) {
      const name = encoder.encode(path);
      const bytes = encoder.encode(content);
      let crc = -1;
      for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
      }
      crc = ~crc;
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(12, 33, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, bytes.length, true);
      local.setUint32(22, bytes.length, true);
      local.setUint16(26, name.length, true);
      chunks.push(local.buffer, name, bytes);

      const central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);
      new Uint8Array(central.buffer).set(new Uint8Array(local.buffer, 4, 26), 6);
      central.setUint16(28, name.length, true);
      central.setUint32(42, offset, true);
      directory.push(central.buffer, name);
      directorySize += 46 + name.length;
      offset += 30 + name.length + bytes.length;
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, directorySize, true);
    end.setUint32(16, offset, true);
    return new Blob([...chunks, ...directory, end.buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  function worksheet(rows) {
    return `<worksheet xmlns="${spreadsheet}"><sheetData>${rows.map((row, index) =>
      `<row r="${index + 1}">${row.map(value => {
        if (typeof value === 'number' && Number.isFinite(value)) return `<c><v>${value}</v></c>`;
        if (value == null) return '<c/>';
        return `<c t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`;
      }).join('')}</row>`).join('')}</sheetData></worksheet>`;
  }

  window.APES.createWorkbook = sheets => {
    const entries = Object.entries(sheets);
    const sheetFile = index => `worksheets/sheet${index + 1}.xml`;
    const relation = (id, type, target) => `<Relationship Id="rId${id}" Type="${relationships}/${type}" Target="${target}"/>`;
    const wrapRelations = xml => `<Relationships xmlns="${packageRoot}relationships">${xml}</Relationships>`;
    const override = (path, type) => `<Override PartName="/xl/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.${type}+xml"/>`;
    return zip([
      ['[Content_Types].xml', `<Types xmlns="${packageRoot}content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>${override('workbook.xml', 'sheet.main')}${entries.map((_, i) => override(sheetFile(i), 'worksheet')).join('')}</Types>`],
      ['_rels/.rels', wrapRelations(relation(1, 'officeDocument', 'xl/workbook.xml'))],
      ['xl/workbook.xml', `<workbook xmlns="${spreadsheet}" xmlns:r="${relationships}"><sheets>${entries.map(([name], i) =>
        `<sheet name="${escape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', wrapRelations(entries.map((_, i) => relation(i + 1, 'worksheet', sheetFile(i))).join(''))],
      ...entries.map(([, rows], i) => ['xl/' + sheetFile(i), worksheet(rows)])
    ]);
  };
})();
