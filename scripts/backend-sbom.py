#!/usr/bin/env python3
"""Inventory locked NuGet packages and exact nuspec license metadata; does not grant a license."""
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

root = Path(__file__).resolve().parents[1]
components = []
for project, usage in [('apps/api', 'api'), ('tests/backend/Kstd.Api.Tests', 'test')]:
    lock = json.loads((root / project / 'packages.lock.json').read_text())
    for framework, packages in lock['dependencies'].items():
        for name, info in packages.items():
            if info.get('type') == 'Project':
                continue
            version = info['resolved']
            metadata_path = Path.home() / '.nuget/packages' / name.lower() / version / (name.lower() + '.nuspec')
            license_kind, license_value = 'unconfirmed', None
            if metadata_path.is_file():
                node = ET.parse(metadata_path).getroot()
                license_node = next((child for child in node.iter() if child.tag.split('}')[-1] == 'license'), None)
                if license_node is not None:
                    license_kind, license_value = license_node.attrib.get('type', 'unconfirmed'), license_node.text
            component = {'type': 'library', 'name': name, 'version': version, 'purl': f'pkg:nuget/{name}@{version}', 'scope': 'required' if usage == 'api' else 'optional', 'properties': [{'name': 'kstd:project', 'value': project}, {'name': 'kstd:framework', 'value': framework}, {'name': 'kstd:dependencyType', 'value': info['type']}, {'name': 'kstd:licenseMetadataKind', 'value': license_kind}]}
            if license_kind == 'expression' and license_value:
                component['licenses'] = [{'expression': license_value}]
            elif license_value:
                component['properties'].append({'name': 'kstd:licenseMetadataValue', 'value': license_value})
            components.append(component)
output = root / 'evidence/backend/nuget-sbom.json'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps({'bomFormat': 'CycloneDX', 'specVersion': '1.6', 'version': 1, 'metadata': {'timestamp': datetime.now(timezone.utc).isoformat(), 'properties': [{'name': 'kstd:limitations', 'value': 'Package inventory includes private build tools and test dependencies; required does not imply every library is deployed. License metadata is evidence, not a legal compatibility judgment.'}]}, 'components': components}, ensure_ascii=False, indent=2))
print(f'NuGet inventory: {len(components)} package/project records -> {output.relative_to(root)}')
