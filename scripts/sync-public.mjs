import fs from 'node:fs';

const destination = 'apps/web/public/reports';
fs.mkdirSync(destination, { recursive: true });
for (const name of ['Company_SW_Standards_Register.xlsx', 'Company_SW_Standards_Application_Report.pptx', 'index.html', 'report.js', 'standards-result.json', 'standards-result.csv']) {
  if (!fs.existsSync(`reports/${name}`)) throw new Error(`보고서 없음: ${name}`);
  fs.copyFileSync(`reports/${name}`, `${destination}/${name}`);
}
for (const name of ['COMPANY_CODING_STANDARD.md', 'UI_UX_STANDARD.md', 'ACCESSIBILITY_STANDARD.md', 'SECURITY_STANDARD.md', 'ARCHITECTURE.md', 'RUNBOOK.md']) {
  if (fs.existsSync(`docs/${name}`)) fs.copyFileSync(`docs/${name}`, `${destination}/${name}`);
}
console.log('Help 다운로드용 보고서·기준문서 동기화 완료');
