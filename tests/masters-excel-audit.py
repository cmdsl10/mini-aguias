"""Read-only XLSX audit. Usage: python tests/masters-excel-audit.py ORIGINAL.xlsx.

Uses only Python's standard library; never evaluates workbook formulas.
"""
import datetime
import hashlib
import json
import pathlib
import posixpath
import sys
import unicodedata
import xml.etree.ElementTree as ET
import zipfile

source = pathlib.Path(sys.argv[1])
ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(source) as archive:
    strings = []
    if 'xl/sharedStrings.xml' in archive.namelist():
        strings = [''.join(t.text or '' for t in si.findall('.//s:t', ns))
                   for si in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('s:si', ns)]
    sheets = list(ET.fromstring(archive.read('xl/workbook.xml')).find('s:sheets', ns))
    relations = {r.get('Id'): r.get('Target') for r in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
    sheet = sheets[-1]
    target = relations[sheet.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')]
    target = target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/' + target)
    cells, formulas = {}, {}
    for cell in ET.fromstring(archive.read(target)).findall('.//s:sheetData/s:row/s:c', ns):
        value = cell.find('s:v', ns)
        value = value.text or '' if value is not None else ''
        if cell.get('t') == 's':
            value = strings[int(value)]
        elif cell.get('t') == 'inlineStr':
            value = ''.join(t.text or '' for t in cell.findall('.//s:t', ns))
        cells[cell.get('r')] = value
        formula = cell.find('s:f', ns)
        if formula is not None:
            formulas[cell.get('r')] = formula.text

players = [{'cell': address, 'raw': value, 'name': value.strip()}
           for address, value in cells.items()
           if address.startswith('A') and address[1:].isdigit()
           and int(address[1:]) > 1 and value.strip()
           and value.strip().casefold() not in ('total', 'pé de chumbo')]
normalized = [unicodedata.normalize('NFC', p['name']).lower() for p in players]
assert len(normalized) == len(set(normalized)), 'Duplicate player names'
dates = {address: (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(value))).isoformat()
         for address, value in cells.items() if address in [f'{c}1' for c in 'CDEFGHIJ'] and value.isdigit()}
report = {'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
          'sheets': [s.get('name') for s in sheets], 'last_sheet': sheet.get('name'),
          'players': players, 'player_count': len(players), 'required_count': 28,
          'matches_required_count': len(players) == 28, 'dates': dates,
          'other_nonempty_cells': {a: v for a, v in cells.items() if not a.startswith('A') and a.lstrip('ABCDEFGHIJKLMNOPQRSTUVWXYZ') != '1' and v},
          'formulas': formulas}
output = pathlib.Path(__file__).resolve().parents[1] / 'test-results' / 'masters-excel-audit.json'
output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=True, indent=2))
